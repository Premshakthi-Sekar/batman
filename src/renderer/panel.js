const status = document.getElementById("status");
const log = document.getElementById("log");
const prompt = document.getElementById("prompt");
const form = document.getElementById("ask-form");
const apiKey = document.getElementById("api-key");
const model = document.getElementById("model");
const provider = document.getElementById("provider");
const keyLabel = document.getElementById("key-label");
const keyHint = document.getElementById("key-hint");
const keyStatus = document.getElementById("key-status");
const briefingLine = document.getElementById("briefing-line");
const tasksToday = document.getElementById("tasks-today");
const tasksTomorrow = document.getElementById("tasks-tomorrow");
const livePings = document.getElementById("live-pings");

const DEFAULTS = {
  gemini: "gemini-3.7-flash",
  openai: "gpt-4o-mini",
};

let paintedHistory = false;

function showTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === name);
  });
}

function describeProvider(value) {
  const kind = value === "openai" ? "openai" : "gemini";
  if (kind === "openai") {
    keyLabel.textContent = "OpenAI API key";
    apiKey.placeholder = "sk-...";
    keyHint.textContent =
      "Get a key from platform.openai.com. This one usually requires billing credit.";
  } else {
    keyLabel.textContent = "Gemini API key";
    apiKey.placeholder = "Paste Gemini key";
    keyHint.textContent = "Get a free key at aistudio.google.com/apikey. It stays on this computer only.";
  }
}

function renderTaskList(node, items) {
  node.innerHTML = "";
  if (!items || !items.length) {
    node.innerHTML = '<p class="hint">None yet.</p>';
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("label");
    row.className = `task-row${item.done ? " done" : ""}`;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = Boolean(item.done);
    box.addEventListener("change", async () => {
      applyState(await window.batman.toggleTask(item.id));
    });
    const text = document.createElement("span");
    text.textContent = item.time ? `${item.time} · ${item.text}` : item.text;
    row.append(box, text);
    node.appendChild(row);
  });
}

function renderPings(node, items) {
  if (!node) return;
  node.innerHTML = "";
  if (!items || !items.length) {
    node.innerHTML = '<p class="hint">None armed. Say “remind me in 2 mins” in Ask.</p>';
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "task-row";
    const text = document.createElement("span");
    const when = item.at ? new Date(item.at) : null;
    const clock = when && !Number.isNaN(when.getTime())
      ? when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";
    text.textContent = clock ? `${clock} · ${item.text}` : item.text;
    row.append(text);
    node.appendChild(row);
  });
}

function applyState(state) {
  if (!state) return;
  status.textContent = state.asleep ? `Sleeping · ${state.remaining} left` : "On patrol";
  if (state.provider) provider.value = state.provider;
  describeProvider(provider.value);
  if (state.model) model.value = state.model;
  keyStatus.textContent = state.hasKey ? "A key is already saved for this provider." : "No key saved yet.";
  if (Array.isArray(state.reminderTimes)) {
    ["t1", "t2", "t3", "t4"].forEach((id, index) => {
      const input = document.getElementById(id);
      if (input && state.reminderTimes[index]) input.value = state.reminderTimes[index];
    });
  }
  if (briefingLine) {
    const open = (state.tasksToday || []).filter((item) => !item.done).length;
    briefingLine.textContent = open
      ? `${open} open today. Patrols and live reminders still fire during Sleep. Quit pauses them.`
      : "No open tasks today. You can still say “remind me in 2 mins” in Ask.";
  }
  renderTaskList(tasksToday, state.tasksToday);
  renderTaskList(tasksTomorrow, state.tasksTomorrow);
  renderPings(livePings, state.pings);
  if (!paintedHistory && state.history && state.history.length) {
    paintedHistory = true;
    log.innerHTML = "";
    state.history.forEach((turn) => {
      addBubble(turn.role === "user" ? "you" : "batman", turn.content);
    });
  }
}

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

provider.addEventListener("change", () => {
  describeProvider(provider.value);
  const other = provider.value === "openai" ? DEFAULTS.gemini : DEFAULTS.openai;
  if (!model.value || model.value === other || Object.values(DEFAULTS).includes(model.value)) {
    model.value = DEFAULTS[provider.value];
  }
});

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => showTab(tab.dataset.tab));
});

document.getElementById("close").addEventListener("click", () => {
  window.batman.closePanel();
});

document.querySelectorAll("[data-hours]").forEach((button) => {
  button.addEventListener("click", async () => {
    await window.batman.sleep(Number(button.dataset.hours));
  });
});

document.getElementById("wake").addEventListener("click", async () => {
  applyState(await window.batman.wake());
});

document.getElementById("quit").addEventListener("click", () => {
  window.batman.quit();
});

document.getElementById("save").addEventListener("click", async () => {
  applyState(
    await window.batman.saveSettings({
      provider: provider.value,
      apiKey: apiKey.value,
      model: model.value,
      reminderTimes: ["t1", "t2", "t3", "t4"].map((id) => document.getElementById(id).value),
    })
  );
  apiKey.value = "";
  addBubble("batman", "Settings saved. I will remember.");
  showTab("chat");
});

document.getElementById("task-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("task-text");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  applyState(
    await window.batman.addTask({
      text,
      when: document.getElementById("task-when").value,
    })
  );
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = prompt.value.trim();
  if (!text) return;
  prompt.value = "";
  addBubble("you", text);
  addBubble("batman", "...");
  const placeholder = log.lastElementChild;
  try {
    const reply = await window.batman.ask(text);
    placeholder.textContent = reply;
    applyState(await window.batman.getState());
  } catch (error) {
    placeholder.classList.add("error");
    placeholder.textContent = error?.message || "The line went dead.";
  }
});

window.batman.onPanelData(applyState);
window.batman.onPanelShown(() => {
  const chatOpen = document.getElementById("chat")?.classList.contains("active");
  if (chatOpen) prompt.focus();
});
window.batman.getState().then(applyState);
