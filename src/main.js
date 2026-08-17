"use strict";

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen, Notification } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { createStore } = require("./store");
const { sleepUntil, isAsleep, remainingMs, formatRemaining } = require("./sleep");
const { askBatman, DEFAULT_PROVIDER, normalizeProvider, defaultModelFor, resolveModel, looksLikeOpenAIKey } = require("./chat");
const {
  DEFAULT_REMINDER_TIMES,
  dateKey,
  tomorrowKey,
  reminderTimes,
  addTasks,
  openTasks,
  toggleTask,
  briefing,
  reminderBody,
  dueReminderSlots,
  recordFired,
  extractPaBlock,
  applyPaActions,
  tasksForDate,
  tidyTasks,
  describeChange,
} = require("./pa");
const { INTENT_PROMPT, parseIntentReply, listSnapshot, decideTurn, spokenResult } = require("./intent");

const PET_SIZE = 96;
const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 520;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function pidFilePath() {
  return path.join(os.homedir(), ".desktop-batman.pid");
}

function writePid() {
  try {
    fs.writeFileSync(pidFilePath(), String(process.pid));
  } catch {
    // ignore
  }
}

function clearPid() {
  try {
    fs.unlinkSync(pidFilePath());
  } catch {
    // ignore
  }
}

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
let reminderTimer;

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
  if (!panelIsOpen()) return;
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

function panelIsOpen() {
  return Boolean(panelWindow && !panelWindow.isDestroyed() && panelWindow.isVisible());
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

function togglePanel() {
  if (panelIsOpen()) hidePanel();
  else showPanel();
}

function currentProvider() {
  const openaiKey = store.get("openaiKey", store.get("apiKey", process.env.OPENAI_API_KEY || ""));
  const geminiKey = store.get("geminiKey", process.env.GEMINI_API_KEY || "");
  if (looksLikeOpenAIKey(openaiKey) || looksLikeOpenAIKey(geminiKey)) return "openai";
  const stored = store.get("provider");
  if (stored) return normalizeProvider(stored);
  if (String(openaiKey || "").trim() && !String(geminiKey || "").trim()) return "openai";
  return DEFAULT_PROVIDER;
}

function currentApiKey() {
  const openaiKey = store.get("openaiKey", store.get("apiKey", process.env.OPENAI_API_KEY || ""));
  const geminiKey = store.get("geminiKey", process.env.GEMINI_API_KEY || "");
  if (currentProvider() === "openai") {
    return looksLikeOpenAIKey(geminiKey) && !String(openaiKey || "").trim() ? geminiKey : openaiKey;
  }
  return geminiKey;
}

function publicState() {
  const wakeAt = store.get("wakeAt", 0);
  const asleep = isAsleep(wakeAt);
  const provider = currentProvider();
  const now = new Date();
  const tasks = tidyTasks(store.get("tasks", []));
  store.set("tasks", tasks);
  return {
    asleep,
    remaining: formatRemaining(wakeAt),
    remainingMs: remainingMs(wakeAt),
    hasKey: Boolean(String(currentApiKey()).trim()),
    provider,
    model: resolveModel(provider, store.get("model")),
    today: dateKey(now),
    tomorrow: tomorrowKey(now),
    tasksToday: tasksForDate(tasks, dateKey(now)).filter((item) => !item.done),
    tasksTomorrow: tasksForDate(tasks, tomorrowKey(now)).filter((item) => !item.done),
    reminderTimes: reminderTimes(store.get("reminderTimes", DEFAULT_REMINDER_TIMES)),
    facts: store.get("facts", []),
    history: (store.get("history", []) || []).slice(-16),
    briefing: briefing(tasks, store.get("facts", []), now),
  };
}

function notify(title, body) {
  if (!body) return;
  try {
    if (Notification.isSupported()) {
      const note = new Notification({ title, body, silent: false });
      note.on("click", () => showPanel());
      note.show();
    }
  } catch {
    // ignore missing notification support
  }
}

function tickReminders() {
  if (!store) return;
  const now = new Date();
  const tasks = store.get("tasks", []);
  const times = reminderTimes(store.get("reminderTimes", DEFAULT_REMINDER_TIMES));
  const fired = store.get("reminderFired", {});
  const due = dueReminderSlots(now, times, fired, openTasks(tasks, dateKey(now)).length > 0);
  if (!due.length) return;
  const body = reminderBody(tasks, now);
  if (body) notify("Batman · daily patrol", body);
  store.set("reminderFired", recordFired(fired, dateKey(now), due));
}

function startReminderLoop() {
  if (reminderTimer) clearInterval(reminderTimer);
  tickReminders();
  reminderTimer = setInterval(tickReminders, 20000);
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
    togglePanel();
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
      togglePanel();
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
    let provider = normalizeProvider(payload.provider || currentProvider());
    const incomingKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";
    if (looksLikeOpenAIKey(incomingKey)) provider = "openai";
    store.set("provider", provider);
    if (incomingKey) {
      if (provider === "openai") store.set("openaiKey", incomingKey);
      else store.set("geminiKey", incomingKey);
    }
    if (typeof payload.model === "string" && payload.model.trim()) {
      store.set("model", resolveModel(provider, payload.model.trim()));
    } else {
      store.set("model", defaultModelFor(provider));
    }
    if (payload.reminderTimes) {
      store.set("reminderTimes", reminderTimes(payload.reminderTimes));
    }
    return publicState();
  });

  ipcMain.handle("add-task", (_event, payload) => {
    const when = payload && payload.when === "today" ? dateKey() : tomorrowKey();
    store.set("tasks", addTasks(store.get("tasks", []), [payload && payload.text], when));
    return publicState();
  });

  ipcMain.handle("toggle-task", (_event, id) => {
    store.set("tasks", toggleTask(store.get("tasks", []), id));
    return publicState();
  });

  ipcMain.handle("ask", async (_event, userText) => {
    const now = new Date();
    const history = [...(store.get("history", []) || [])];
    const before = store.get("tasks", []);
    const pending = store.get("pendingClarify", null);
    const provider = currentProvider();
    const askOpts = {
      provider,
      apiKey: currentApiKey(),
      model: resolveModel(provider, store.get("model")),
      history,
      userText,
    };

    let llmIntent = null;
    try {
      const intentRaw = await askBatman({
        ...askOpts,
        contextText: listSnapshot(before),
        options: {
          systemOverride: INTENT_PROMPT,
          temperature: 0.2,
          maxTokens: 400,
          historySlice: -8,
        },
      });
      llmIntent = parseIntentReply(intentRaw);
    } catch {
      llmIntent = null;
    }

    const decision = decideTurn({
      userText,
      tasks: before,
      history,
      llmIntent,
      pending,
      now,
    });

    if (decision.question) {
      store.set("pendingClarify", decision.pending || null);
      history.push({ role: "user", content: String(userText).trim(), at: Date.now() });
      history.push({ role: "assistant", content: decision.question, at: Date.now() });
      store.set("history", history.slice(-120));
      return decision.question;
    }

    store.set("pendingClarify", null);
    const fromChat = decision.actions || { addTomorrow: [], addToday: [], done: [], remember: [], update: [], remove: [], removeDuplicates: false };
    const next = applyPaActions({ tasks: before, facts: store.get("facts", []) }, fromChat, now);
    store.set("tasks", next.tasks);
    store.set("facts", next.facts);
    const ground = describeChange(before, next.tasks, userText, fromChat);
    const fallback = spokenResult(decision, ground);
    let visible = fallback;
    if (decision.chat || !fallback) {
      const raw = await askBatman({
        ...askOpts,
        contextText: [briefing(next.tasks, next.facts, now), "GROUND TRUTH:", ground].join("\n\n"),
      });
      visible = extractPaBlock(raw).visible;
    } else {
      try {
        const raw = await askBatman({
          ...askOpts,
          contextText: [
            briefing(next.tasks, next.facts, now),
            "GROUND TRUTH:",
            ground,
            "Confirm this in one or two short Batman sentences. Do not claim extra work.",
          ].join("\n\n"),
        });
        visible = extractPaBlock(raw).visible || fallback;
      } catch {
        visible = fallback;
      }
    }
    history.push({ role: "user", content: String(userText).trim(), at: Date.now() });
    history.push({ role: "assistant", content: visible, at: Date.now() });
    store.set("history", history.slice(-120));
    return visible;
  });

  ipcMain.handle("quit", () => {
    app.quit();
  });
}

app.whenReady().then(() => {
  if (!gotLock) return;
  writePid();
  app.on("second-instance", () => {
    if (!store) return;
    if (isAsleep(store.get("wakeAt", 0))) wakeUp();
    else if (petWindow && !petWindow.isDestroyed()) petWindow.showInactive();
  });
  if (process.platform === "darwin") {
    if (typeof app.setActivationPolicy === "function") {
      app.setActivationPolicy("accessory");
    }
    if (app.dock) app.dock.hide();
  }
  store = createStore(storePath());
  const misplaced = store.get("geminiKey", "");
  if (looksLikeOpenAIKey(misplaced)) {
    if (!store.get("openaiKey")) store.set("openaiKey", misplaced);
    store.set("geminiKey", "");
    store.set("provider", "openai");
  }
  if (!store.get("provider")) store.set("provider", currentProvider());
  store.set("model", resolveModel(currentProvider(), store.get("model")));
  if (!store.get("history")) store.set("history", []);
  if (!store.get("tasks")) store.set("tasks", []);
  if (!store.get("facts")) store.set("facts", []);
  if (!store.get("reminderTimes")) store.set("reminderTimes", DEFAULT_REMINDER_TIMES);
  if (!store.get("reminderFired")) store.set("reminderFired", {});

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
  startReminderLoop();

  screen.on("display-metrics-changed", () => applyPetPosition());
});

app.on("window-all-closed", () => {
  // Stay running in the tray.
});

app.on("before-quit", () => {
  clearPid();
  stopWander();
  if (sleepTimer) clearTimeout(sleepTimer);
  if (reminderTimer) clearInterval(reminderTimer);
});
