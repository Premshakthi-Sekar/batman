const status = document.getElementById("status");
const log = document.getElementById("log");
const prompt = document.getElementById("prompt");
const form = document.getElementById("ask-form");
const apiKey = document.getElementById("api-key");
const model = document.getElementById("model");

function showTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active", page.id === name);
  });
}

function applyState(state) {
  if (!state) return;
  status.textContent = state.asleep ? `Sleeping · ${state.remaining} left` : "On patrol";
  if (state.model) model.value = state.model;
}

function addBubble(role, text) {
  const div = document.createElement("div");
  div.className = `bubble ${role}`;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}

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
      apiKey: apiKey.value,
      model: model.value,
    })
  );
  addBubble("batman", "Settings saved. I will remember.");
  showTab("chat");
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
  } catch (error) {
    placeholder.classList.add("error");
    placeholder.textContent = error?.message || "The line went dead.";
  }
});

window.batman.onPanelData(applyState);
window.batman.getState().then(applyState);
