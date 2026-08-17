"use strict";

const DEFAULT_REMINDER_TIMES = ["09:00", "12:00", "16:00", "21:00"];

function pad(n) {
  return String(n).padStart(2, "0");
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function tomorrowKey(now = new Date()) {
  return dateKey(addDays(now, 1));
}

function normalizeTime(value) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function reminderTimes(list) {
  const times = (Array.isArray(list) ? list : DEFAULT_REMINDER_TIMES)
    .map(normalizeTime)
    .filter(Boolean);
  while (times.length < 4) times.push(DEFAULT_REMINDER_TIMES[times.length]);
  return times.slice(0, 4);
}

function newTask(text, forDate, now = new Date()) {
  const title = String(text || "").trim();
  if (!title) return null;
  return {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    text: title,
    forDate,
    done: false,
    createdAt: now.toISOString(),
  };
}

function addTasks(tasks, titles, forDate, now = new Date()) {
  const list = Array.isArray(tasks) ? [...tasks] : [];
  for (const title of titles || []) {
    const task = newTask(title, forDate, now);
    if (!task) continue;
    const exists = list.some(
      (item) => !item.done && item.forDate === forDate && item.text.toLowerCase() === task.text.toLowerCase()
    );
    if (!exists) list.push(task);
  }
  return list.slice(-80);
}

function tasksForDate(tasks, day) {
  return (Array.isArray(tasks) ? tasks : []).filter((item) => item && item.forDate === day);
}

function openTasks(tasks, day) {
  return tasksForDate(tasks, day).filter((item) => !item.done);
}

function markDone(tasks, hints) {
  const list = Array.isArray(tasks) ? tasks.map((item) => ({ ...item })) : [];
  for (const hint of hints || []) {
    const needle = String(hint || "").trim().toLowerCase();
    if (!needle) continue;
    const match = list.find((item) => !item.done && item.text.toLowerCase().includes(needle));
    if (match) match.done = true;
  }
  return list;
}

function toggleTask(tasks, id) {
  return (Array.isArray(tasks) ? tasks : []).map((item) =>
    item.id === id ? { ...item, done: !item.done } : item
  );
}

function briefing(tasks, facts, now = new Date()) {
  const today = dateKey(now);
  const tomorrow = tomorrowKey(now);
  const todayOpen = openTasks(tasks, today);
  const tomorrowOpen = openTasks(tasks, tomorrow);
  const overdue = (Array.isArray(tasks) ? tasks : []).filter(
    (item) => !item.done && item.forDate < today
  );
  const lines = [`Today is ${today}.`];
  if (todayOpen.length) {
    lines.push(`Today still open (${todayOpen.length}):`);
    todayOpen.forEach((item, index) => lines.push(`${index + 1}. ${item.text}`));
  } else {
    lines.push("No open tasks for today.");
  }
  if (overdue.length) {
    lines.push(`Overdue (${overdue.length}): ${overdue.map((item) => item.text).join("; ")}`);
  }
  if (tomorrowOpen.length) {
    lines.push(`Already queued for tomorrow: ${tomorrowOpen.map((item) => item.text).join("; ")}`);
  }
  if (facts && facts.length) {
    lines.push(`Remembered facts: ${facts.slice(-12).join("; ")}`);
  }
  return lines.join("\n");
}

function reminderBody(tasks, now = new Date()) {
  const open = openTasks(tasks, dateKey(now));
  if (!open.length) return null;
  const listed = open.slice(0, 5).map((item, index) => `${index + 1}. ${item.text}`);
  if (open.length > 5) listed.push(`+${open.length - 5} more`);
  return `Patrol check. Still on the board:\n${listed.join("\n")}`;
}

function dueReminderSlots(now, times, fired, hasOpenTasks) {
  if (!hasOpenTasks) return [];
  const day = dateKey(now);
  const current = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const already = (fired && fired[day]) || [];
  return reminderTimes(times).filter((slot) => slot <= current && !already.includes(slot));
}

function recordFired(fired, day, slots) {
  const next = { ...(fired || {}) };
  const merged = new Set([...(next[day] || []), ...slots]);
  next[day] = [...merged].sort();
  const keys = Object.keys(next).sort();
  while (keys.length > 14) {
    delete next[keys.shift()];
  }
  return next;
}

function extractPaBlock(text) {
  const raw = String(text || "");
  const match = raw.match(/<<PA>>([\s\S]*?)<<ENDPA>>/);
  const visible = raw.replace(/<<PA>>[\s\S]*?<<ENDPA>>/g, "").trim();
  let actions = { addTomorrow: [], addToday: [], done: [], remember: [] };
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      actions = {
        addTomorrow: Array.isArray(parsed.addTomorrow) ? parsed.addTomorrow : [],
        addToday: Array.isArray(parsed.addToday) ? parsed.addToday : [],
        done: Array.isArray(parsed.done) ? parsed.done : [],
        remember: Array.isArray(parsed.remember) ? parsed.remember : [],
      };
    } catch {
      // ignore a broken machine block
    }
  }
  return { visible: visible || raw.trim(), actions };
}

function applyPaActions(state, actions, now = new Date()) {
  let tasks = Array.isArray(state.tasks) ? state.tasks : [];
  let facts = Array.isArray(state.facts) ? state.facts : [];
  tasks = addTasks(tasks, actions.addToday, dateKey(now), now);
  tasks = addTasks(tasks, actions.addTomorrow, tomorrowKey(now), now);
  tasks = markDone(tasks, actions.done);
  for (const fact of actions.remember || []) {
    const text = String(fact || "").trim();
    if (text && !facts.includes(text)) facts.push(text);
  }
  facts = facts.slice(-40);
  return { tasks, facts };
}

function paInstructions() {
  return [
    "You are also the user's personal assistant: remember the briefing, keep a to-do list, and be concise.",
    "If they dump a list for tomorrow / tonight's plan / 'remind me tomorrow', put those items in addTomorrow.",
    "If they add something for today, use addToday. If they finished a task, put a short matching phrase in done.",
    "If they say 'remember that...', put a short fact in remember.",
    "End EVERY reply with this exact machine line, even if arrays are empty:",
    '<<PA>>{"addTomorrow":[],"addToday":[],"done":[],"remember":[]}<<ENDPA>>',
    "Never mention that machine line to the user.",
  ].join(" ");
}

module.exports = {
  DEFAULT_REMINDER_TIMES,
  dateKey,
  tomorrowKey,
  normalizeTime,
  reminderTimes,
  newTask,
  addTasks,
  tasksForDate,
  openTasks,
  markDone,
  toggleTask,
  briefing,
  reminderBody,
  dueReminderSlots,
  recordFired,
  extractPaBlock,
  applyPaActions,
  paInstructions,
};
