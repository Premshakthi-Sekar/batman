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
  if (!match) return parseClock(raw);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function parseClock(text) {
  const raw = String(text || "").toLowerCase();
  const withMeridiem = raw.match(/\b(\d{1,2})(?::|\.)?(\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/);
  const withColon = raw.match(/\b(\d{1,2}):(\d{2})\b/);
  const hit = withMeridiem || withColon;
  if (!hit) return null;
  let hour = Number(hit[1]);
  const minute = hit[2] ? Number(hit[2]) : 0;
  const mer = (hit[3] || "").replace(/\./g, "");
  if (mer.startsWith("p") && hour < 12) hour += 12;
  if (mer.startsWith("a") && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function inferDay(text) {
  const raw = String(text || "").toLowerCase();
  if (/\b(tmrw|tmw|tomorrow|tommorow|tommorrow|next day)\b/.test(raw)) return "tomorrow";
  if (/\b(today|tonight|this afternoon|this evening|this morning)\b/.test(raw)) return "today";
  return null;
}

function reminderTimes(list) {
  const times = (Array.isArray(list) ? list : DEFAULT_REMINDER_TIMES)
    .map(normalizeTime)
    .filter(Boolean);
  while (times.length < 4) times.push(DEFAULT_REMINDER_TIMES[times.length]);
  return times.slice(0, 4);
}

function formatTaskLine(item) {
  if (item.time) return `${item.time} · ${item.text}`;
  return item.text;
}

function asItems(list) {
  return (list || [])
    .map((item) => {
      if (typeof item === "string") {
        return { text: cleanTitle(item) || item.trim(), time: parseClock(item) };
      }
      const text = String(item?.text || item?.title || "").trim();
      return { text: cleanTitle(text) || text, time: normalizeTime(item?.time) || parseClock(text) };
    })
    .filter((item) => item.text);
}

function cleanTitle(text) {
  return String(text || "")
    .replace(/\b(tmrw|tmw|tomorrow|tommorow|tommorrow|today|tonight|please)\b/gi, " ")
    .replace(/\b(i have|i've got|i got|i've a|remind me( to)?|add|put|schedule|'s time|time)\b/gi, " ")
    .replace(/\b(a call|call)\b/gi, "call")
    .replace(/\b(at|on|for|with)\s+(?=\d)/gi, " ")
    .replace(/\b\d{1,2}(?::|\.)?\d{0,2}\s*(a\.?m\.?|p\.?m\.?)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.,;:\- ]+|[.,;:\- ]+$/g, "")
    .replace(/^a\s+/i, "")
    .trim();
}

function newTask(item, forDate, now = new Date()) {
  const parsed = typeof item === "string" || !item ? asItems([item])[0] : asItems([item])[0];
  if (!parsed || !parsed.text) return null;
  return {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    text: parsed.text,
    time: parsed.time || null,
    forDate,
    done: false,
    createdAt: now.toISOString(),
  };
}

function sameTask(a, b) {
  return a && b && a.text.toLowerCase() === b.text.toLowerCase();
}

function addTasks(tasks, titles, forDate, now = new Date()) {
  const list = Array.isArray(tasks) ? tasks.map((item) => ({ ...item })) : [];
  for (const title of titles || []) {
    const task = newTask(title, forDate, now);
    if (!task) continue;
    const existing = list.find((item) => !item.done && sameTask(item, task));
    if (existing) {
      existing.forDate = forDate;
      if (task.time) existing.time = task.time;
      continue;
    }
    list.push(task);
  }
  return list.slice(-80);
}

function tasksForDate(tasks, day) {
  return (Array.isArray(tasks) ? tasks : [])
    .filter((item) => item && item.forDate === day)
    .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99") || a.text.localeCompare(b.text));
}

function openTasks(tasks, day) {
  return tasksForDate(tasks, day).filter((item) => !item.done);
}

function isVagueHint(needle) {
  return /^(that|this|it|the call|the meeting|meeting|call|that meeting|that call|the task)$/.test(needle);
}

function findTask(list, needle) {
  const open = list.filter((item) => !item.done);
  if (!needle || isVagueHint(needle)) {
    return open.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  }
  return open.find((item) => item.text.toLowerCase().includes(needle));
}

function markDone(tasks, hints) {
  const list = Array.isArray(tasks) ? tasks.map((item) => ({ ...item })) : [];
  for (const hint of hints || []) {
    const needle = String(hint || "").trim().toLowerCase();
    if (!needle) continue;
    const match = findTask(list, needle);
    if (match) match.done = true;
  }
  return list;
}

function updateTasks(tasks, updates, now = new Date()) {
  const list = Array.isArray(tasks) ? tasks.map((item) => ({ ...item })) : [];
  for (const update of updates || []) {
    const needle = String(update.match || update.text || "").trim().toLowerCase();
    const match = findTask(list, needle);
    if (!match) continue;
    if (update.time) match.time = normalizeTime(update.time) || parseClock(update.time) || match.time;
    if (update.day === "today") match.forDate = dateKey(now);
    if (update.day === "tomorrow") match.forDate = tomorrowKey(now);
    if (update.forDate) match.forDate = update.forDate;
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
    todayOpen.forEach((item, index) => lines.push(`${index + 1}. ${formatTaskLine(item)}`));
  } else {
    lines.push("No open tasks for today.");
  }
  if (overdue.length) {
    lines.push(`Overdue (${overdue.length}): ${overdue.map((item) => formatTaskLine(item)).join("; ")}`);
  }
  if (tomorrowOpen.length) {
    lines.push(`Already queued for tomorrow: ${tomorrowOpen.map((item) => formatTaskLine(item)).join("; ")}`);
  }
  if (facts && facts.length) {
    lines.push(`Remembered facts: ${facts.slice(-12).join("; ")}`);
  }
  return lines.join("\n");
}

function reminderBody(tasks, now = new Date()) {
  const open = openTasks(tasks, dateKey(now));
  if (!open.length) return null;
  const listed = open.slice(0, 5).map((item, index) => `${index + 1}. ${formatTaskLine(item)}`);
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

function emptyActions() {
  return { addTomorrow: [], addToday: [], done: [], remember: [], update: [] };
}

function extractPaBlock(text) {
  const raw = String(text || "");
  const match = raw.match(/<<PA>>([\s\S]*?)<<ENDPA>>/);
  const visible = raw.replace(/<<PA>>[\s\S]*?<<ENDPA>>/g, "").trim();
  let actions = emptyActions();
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      actions = {
        addTomorrow: Array.isArray(parsed.addTomorrow) ? parsed.addTomorrow : [],
        addToday: Array.isArray(parsed.addToday) ? parsed.addToday : [],
        done: Array.isArray(parsed.done) ? parsed.done : [],
        remember: Array.isArray(parsed.remember) ? parsed.remember : [],
        update: Array.isArray(parsed.update) ? parsed.update : [],
      };
    } catch {
      // ignore a broken machine block
    }
  }
  return { visible: visible || raw.trim(), actions };
}

function extractSubject(text) {
  return cleanTitle(
    String(text || "")
      .replace(/\b(done|finished|complete(d)?|strike(d)? off|tick(ed)? off|cancel(led)?|crossed off|move|reschedule|change|push|shift|make it)\b/gi, " ")
  );
}

function captureFromUserText(text, now = new Date()) {
  const actions = emptyActions();
  const raw = String(text || "").trim();
  if (!raw) return actions;
  const lower = raw.toLowerCase();
  const time = parseClock(raw);
  const day = inferDay(lower);
  const subject = extractSubject(raw);

  if (/\b(done|finished|complete(d)?|strike(d)? off|tick(ed)? off|cancel(led)?|crossed off)\b/.test(lower)) {
    if (subject) actions.done.push(subject);
    return actions;
  }

  if (/\b(move|reschedule|change|push|shift|make it)\b/.test(lower) && (time || day) && subject) {
    actions.update.push({ match: subject, time, day: day || undefined });
    return actions;
  }

  if (subject && (day || time || /\b(call|meet|meeting|todo|to-do|remind|have)\b/.test(lower))) {
    const item = { text: subject, time };
    if (day === "today") actions.addToday.push(item);
    else actions.addTomorrow.push(item);
  }
  return actions;
}

function mergeActions(first, second) {
  const a = { ...emptyActions(), ...first };
  const b = { ...emptyActions(), ...second };
  return {
    addTomorrow: [...a.addTomorrow, ...b.addTomorrow],
    addToday: [...a.addToday, ...b.addToday],
    done: [...a.done, ...b.done],
    remember: [...a.remember, ...b.remember],
    update: [...a.update, ...b.update],
  };
}

function applyPaActions(state, actions, now = new Date()) {
  let tasks = Array.isArray(state.tasks) ? state.tasks : [];
  let facts = Array.isArray(state.facts) ? state.facts : [];
  tasks = addTasks(tasks, actions.addToday, dateKey(now), now);
  tasks = addTasks(tasks, actions.addTomorrow, tomorrowKey(now), now);
  tasks = updateTasks(tasks, actions.update, now);
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
    "You are also the user's personal assistant. They will speak naturally.",
    "Examples: 'I have a call with Demi tmrw 11am' → addTomorrow [{text:'Call with Demi', time:'11:00'}].",
    "'Move the Demi call to 2pm' → update [{match:'Demi', time:'14:00'}].",
    "'Done with the Demi call' → done ['Demi'].",
    "Use 24-hour HH:MM times. tmrw/tomorrow = addTomorrow. today = addToday.",
    "End EVERY reply with this machine line, even if arrays are empty:",
    '<<PA>>{"addTomorrow":[],"addToday":[],"done":[],"remember":[],"update":[]}<<ENDPA>>',
    "Never mention that machine line to the user.",
  ].join(" ");
}

module.exports = {
  DEFAULT_REMINDER_TIMES,
  dateKey,
  tomorrowKey,
  normalizeTime,
  parseClock,
  inferDay,
  reminderTimes,
  formatTaskLine,
  newTask,
  addTasks,
  tasksForDate,
  openTasks,
  markDone,
  updateTasks,
  toggleTask,
  briefing,
  reminderBody,
  dueReminderSlots,
  recordFired,
  extractPaBlock,
  captureFromUserText,
  mergeActions,
  applyPaActions,
  paInstructions,
};
