"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require("electron");
const path = require("path");
const { createStore } = require("./store");
const { sleepUntil, isAsleep, remainingMs, formatRemaining } = require("./sleep");
const { askBatman, DEFAULT_PROVIDER, normalizeProvider, defaultModelFor, resolveModel } = require("./chat");

const PET_SIZE = 96;
const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 460;

let petWindow;
let panelWindow;
let tray;
let store;
let sleepTimer;
let wanderTimer;
let paused = false;
let dragging = false;
let hovering = false;
let dragGrab = { x: 0, y: 0 };

const wander = {
  x: 80,
  y: 80,
  targetX: 200,
  targetY: 200,
  facing: 1,
  sleeping: false,
};

function storePath() {
  return path.join(app.getPath("userData"), "batman.json");
}

function displayBounds() {
  const display = screen.getPrimaryDisplay();
  const area = display.workArea;
  return {
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    maxX: area.x + area.width - PET_SIZE,
    maxY: area.y + area.height - PET_SIZE,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pickTarget() {
  const area = displayBounds();
  wander.targetX = Math.round(area.x + Math.random() * (area.width - PET_SIZE));
  wander.targetY = Math.round(area.y + Math.random() * (area.height - PET_SIZE));
}

function moveTowardTarget() {
  const dx = wander.targetX - wander.x;
  const dy = wander.targetY - wander.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) {
    pickTarget();
    return;
  }
  const speed = 1.6 + Math.random() * 0.6;
  wander.x += (dx / dist) * speed;
  wander.y += (dy / dist) * speed;
  if (Math.abs(dx) > 0.4) wander.facing = dx >= 0 ? 1 : -1;
}

function applyPetPosition() {
  if (!petWindow || petWindow.isDestroyed()) return;
  const area = displayBounds();
  wander.x = clamp(wander.x, area.x, area.maxX);
  wander.y = clamp(wander.y, area.y, area.maxY);
  petWindow.setBounds({
    x: Math.round(wander.x),
    y: Math.round(wander.y),
    width: PET_SIZE,
    height: PET_SIZE,
  });
  followPanel();
}

function walkFrozen() {
  return paused || dragging || hovering || wander.sleeping;
}

function sendPetState() {
  if (!petWindow || petWindow.isDestroyed()) return;
  petWindow.webContents.send("pet-state", {
    facing: wander.facing,
    sleeping: wander.sleeping,
    paused: walkFrozen(),
  });
}

function startWander() {
  stopWander();
  wanderTimer = setInterval(() => {
    if (walkFrozen()) return;
    moveTowardTarget();
    applyPetPosition();
    sendPetState();
  }, 32);
}

function stopWander() {
  if (wanderTimer) {
    clearInterval(wanderTimer);
    wanderTimer = null;
  }
}

function panelPosition() {
  const area = displayBounds();
  let x = Math.round(wander.x + PET_SIZE + 8);
  let y = Math.round(wander.y);
  if (x + PANEL_WIDTH > area.x + area.width) {
    x = Math.round(wander.x - PANEL_WIDTH - 8);
  }
  if (y + PANEL_HEIGHT > area.y + area.height) {
    y = area.y + area.height - PANEL_HEIGHT;
  }
  x = clamp(x, area.x, area.x + area.width - PANEL_WIDTH);
  y = clamp(y, area.y, area.y + area.height - PANEL_HEIGHT);
  return { x, y, width: PANEL_WIDTH, height: PANEL_HEIGHT };
}

function followPanel() {
  if (!panelWindow || panelWindow.isDestroyed() || !panelWindow.isVisible()) return;
  panelWindow.setBounds(panelPosition());
}

function overlayWindowOptions(extra) {
  return {
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    fullscreenable: false,
    hiddenInMissionControl: true,
    acceptFirstMouse: true,
    ...(process.platform === "darwin" ? { type: "panel" } : {}),
    ...extra,
  };
}

function pinToCurrentSpace(win) {
  if (!win || win.isDestroyed()) return;
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function showPanel() {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  paused = true;
  sendPetState();
  pinToCurrentSpace(petWindow);
  pinToCurrentSpace(panelWindow);
  panelWindow.setBounds(panelPosition());
  panelWindow.showInactive();
  if (typeof panelWindow.moveTop === "function") panelWindow.moveTop();
  panelWindow.focus();
  panelWindow.webContents.send("panel-data", publicState());
}

function hidePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.hide();
  }
  paused = false;
  sendPetState();
}

function currentProvider() {
  return normalizeProvider(store.get("provider", DEFAULT_PROVIDER));
}

function currentApiKey() {
  const provider = currentProvider();
  if (provider === "openai") {
    return store.get("openaiKey", store.get("apiKey", process.env.OPENAI_API_KEY || ""));
  }
  return store.get("geminiKey", process.env.GEMINI_API_KEY || "");
}

function publicState() {
  const wakeAt = store.get("wakeAt", 0);
  const asleep = isAsleep(wakeAt);
  const provider = currentProvider();
  return {
    asleep,
    remaining: formatRemaining(wakeAt),
    remainingMs: remainingMs(wakeAt),
    hasKey: Boolean(String(currentApiKey()).trim()),
    provider,
    model: resolveModel(provider, store.get("model")),
  };
}

function scheduleWake() {
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  const wakeAt = store.get("wakeAt", 0);
  if (!isAsleep(wakeAt)) {
    wakeUp();
    return;
  }
  sleepTimer = setTimeout(() => wakeUp(), remainingMs(wakeAt) + 50);
}

function putToSleep(hours) {
  const wakeAt = sleepUntil(hours);
  store.set("wakeAt", wakeAt);
  wander.sleeping = true;
  paused = true;
  hidePanel();
  if (petWindow && !petWindow.isDestroyed()) petWindow.hide();
  sendPetState();
  updateTray();
  scheduleWake();
}

function wakeUp() {
  store.set("wakeAt", 0);
  wander.sleeping = false;
  paused = false;
  if (sleepTimer) {
    clearTimeout(sleepTimer);
    sleepTimer = null;
  }
  if (petWindow && !petWindow.isDestroyed()) {
    pickTarget();
    applyPetPosition();
    petWindow.showInactive();
  }
  sendPetState();
  updateTray();
}

function trayIcon() {
  const png = nativeImage.createFromPath(path.join(__dirname, "assets", "tray.png"));
  if (!png.isEmpty()) return png;
  return nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAhUlEQVR4nGNgGGnA8B8bZsQl8R8XjVUwI1QDE4EGmP7jVIysAacB/4lQjG7Af2IMQdeA04D/xBjynxgD/hNjCLoB/4kxBF0DTgP+E2MIugH/iTEEXcN/Ygz5T4wh/4kxBF3Df2IM+U+MIf+JMQRdw39iDPlPjCH/iTEEXcN/Ygz5T4wh/4kxBF3Df2IM+U+MIf+JMeQ/MQYAAP//AwC0uS8x1Q4Q8wAAAABJRU5ErkJggg=="
  );
}

function updateTray() {
  if (!tray) return;
  const wakeAt = store.get("wakeAt", 0);
  const asleep = isAsleep(wakeAt);
  const template = [
    { label: asleep ? `Sleeping (${formatRemaining(wakeAt)} left)` : "On patrol", enabled: false },
    { type: "separator" },
    {
      label: "Show Batman",
      enabled: !asleep,
      click: () => {
        if (petWindow && !petWindow.isDestroyed()) petWindow.showInactive();
      },
    },
    { label: "Ask Batman", click: () => { if (asleep) wakeUp(); showPanel(); } },
    { type: "separator" },
    { label: "Sleep 2 hours", click: () => putToSleep(2) },
    { label: "Sleep 3 hours", click: () => putToSleep(3) },
    { label: "Sleep 4 hours", click: () => putToSleep(4) },
    { label: "Wake up", enabled: asleep, click: () => wakeUp() },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
  tray.setToolTip(asleep ? `Batman is sleeping (${formatRemaining(wakeAt)} left)` : "Desktop Batman");
}

function createWindows() {
  const area = displayBounds();
  wander.x = area.x + Math.round(area.width * 0.7);
  wander.y = area.y + Math.round(area.height * 0.65);
  pickTarget();

  petWindow = new BrowserWindow(
    overlayWindowOptions({
      width: PET_SIZE,
      height: PET_SIZE,
      x: Math.round(wander.x),
      y: Math.round(wander.y),
      focusable: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
  );
  pinToCurrentSpace(petWindow);
  petWindow.loadFile(path.join(__dirname, "renderer", "pet.html"));
  petWindow.on("closed", () => {
    petWindow = null;
  });

  panelWindow = new BrowserWindow(
    overlayWindowOptions({
      ...panelPosition(),
      focusable: true,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
  );
  pinToCurrentSpace(panelWindow);
  panelWindow.loadFile(path.join(__dirname, "renderer", "panel.html"));
  panelWindow.on("blur", () => {
    // Keep chat open while typing; only hide if user clicked away and panel requests it.
  });
  panelWindow.on("closed", () => {
    panelWindow = null;
  });
}

function registerIpc() {
  ipcMain.on("pet-clicked", () => {
    if (isAsleep(store.get("wakeAt", 0))) return;
    showPanel();
  });

  ipcMain.on("pet-drag-start", (_event, point) => {
    dragging = true;
    dragGrab = {
      x: Number(point?.screenX || 0) - wander.x,
      y: Number(point?.screenY || 0) - wander.y,
    };
    sendPetState();
  });

  ipcMain.on("pet-drag-move", (_event, point) => {
    if (!dragging) return;
    wander.x = Number(point?.screenX || 0) - dragGrab.x;
    wander.y = Number(point?.screenY || 0) - dragGrab.y;
    applyPetPosition();
  });

  ipcMain.on("pet-drag-end", (_event, payload) => {
    dragging = false;
    pickTarget();
    sendPetState();
    if (!payload?.dragged && !isAsleep(store.get("wakeAt", 0))) {
      showPanel();
    }
  });

  ipcMain.on("pet-hover", (_event, isHover) => {
    hovering = Boolean(isHover);
    sendPetState();
  });

  ipcMain.on("close-panel", () => hidePanel());

  ipcMain.handle("get-state", () => publicState());

  ipcMain.handle("sleep", (_event, hours) => {
    putToSleep(hours);
    return publicState();
  });

  ipcMain.handle("wake", () => {
    wakeUp();
    return publicState();
  });

  ipcMain.handle("save-settings", (_event, payload) => {
    if (!payload || typeof payload !== "object") return publicState();
    const provider = normalizeProvider(payload.provider || currentProvider());
    store.set("provider", provider);
    if (typeof payload.apiKey === "string" && payload.apiKey.trim()) {
      if (provider === "openai") store.set("openaiKey", payload.apiKey.trim());
      else store.set("geminiKey", payload.apiKey.trim());
    }
    if (typeof payload.model === "string" && payload.model.trim()) {
      store.set("model", resolveModel(provider, payload.model.trim()));
    } else {
      store.set("model", defaultModelFor(provider));
    }
    return publicState();
  });

  ipcMain.handle("ask", async (_event, userText) => {
    const provider = currentProvider();
    const reply = await askBatman({
      provider,
      apiKey: currentApiKey(),
      model: resolveModel(provider, store.get("model")),
      history: store.get("history", []),
      userText,
    });
    const history = store.get("history", []);
    history.push({ role: "user", content: String(userText).trim() });
    history.push({ role: "assistant", content: reply });
    store.set("history", history.slice(-20));
    return reply;
  });

  ipcMain.handle("quit", () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  if (process.platform === "darwin") {
    if (typeof app.setActivationPolicy === "function") {
      app.setActivationPolicy("accessory");
    }
    if (app.dock) app.dock.hide();
  }
  store = createStore(storePath());
  if (!store.get("provider")) store.set("provider", DEFAULT_PROVIDER);
  store.set("model", resolveModel(currentProvider(), store.get("model")));
  if (!store.get("history")) store.set("history", []);

  createWindows();
  registerIpc();

  tray = new Tray(trayIcon());
  tray.on("click", () => {
    if (isAsleep(store.get("wakeAt", 0))) {
      showPanel();
      return;
    }
    if (petWindow && !petWindow.isDestroyed()) petWindow.showInactive();
  });
  updateTray();

  if (isAsleep(store.get("wakeAt", 0))) {
    wander.sleeping = true;
    scheduleWake();
  } else {
    petWindow.showInactive();
  }
  startWander();

  screen.on("display-metrics-changed", () => applyPetPosition());
});

app.on("window-all-closed", () => {
  // Stay running in the tray.
});

app.on("before-quit", () => {
  stopWander();
  if (sleepTimer) clearTimeout(sleepTimer);
});
