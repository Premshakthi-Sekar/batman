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
  const withPrep = raw.match(/\b(?:at|to|by|until)\s+(\d{1,2})(?::(\d{2}))?\b(?!\s*calls?\b)/);
  const withDay = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(?:tmrw|tmw|tomorrow|tommorow|morning|mrng)\b/);
  const hit = withMeridiem || withColon || withPrep || withDay;
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
        const text = cleanTitle(item) || item.trim();
        if (text && isLikelyTask(text) && !isJunkTask(item)) return { text, time: parseClock(item) };
        return salvageAdd(item);
      }
      const raw = String(item?.text || item?.title || "").trim();
      const text = cleanTitle(raw) || raw;
      const time = normalizeTime(item?.time) || parseClock(raw);
      if (text && isLikelyTask(text) && !isJunkTask(raw)) return { text, time };
      const salvaged = salvageAdd(raw);
      if (!salvaged) return null;
      return { ...salvaged, time: time || salvaged.time };
    })
    .filter(Boolean);
}

function salvageAdd(raw) {
  const captured = interpretUserText(raw);
  const item = captured.addTomorrow[0] || captured.addToday[0];
  return item || null;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "at",
  "on",
  "of",
  "and",
  "with",
  "call",
  "calls",
  "meeting",
  "meet",
  "kinda",
  "things",
  "pls",
  "please",
  "my",
  "me",
  "i",
  "you",
  "u",
  "your",
]);

function cleanTitle(text) {
  return stripLeadingFiller(
    String(text || "")
      .replace(/\b(tmrw|tmw|tomorrow|tommorow|tommorrow|today|tonight|please|pls)\b/gi, " ")
      .replace(/\b(mrng|morning|afternoon|evening|noon|night)\b/gi, " ")
      .replace(/\b(i have|i've got|i got|i've a|i will|i'll|let me|remind me( to)?|(a |the )?reminders?\s*(to|for)?|add|put|schedule|'s time|time)\b/gi, " ")
      .replace(/\b(a call|calls?)\b/gi, "call")
      .replace(/\b(at|on|for|with)\s+(?=\d)/gi, " ")
      .replace(/\b\d{1,2}(?::|\.)?\d{0,2}\s*(a\.?m\.?|p\.?m\.?)?\b/gi, " ")
      .replace(/\s+/g, " ")
      .replace(/^[.,;:\- ]+|[.,;:\- ]+$/g, "")
      .replace(/^a\s+/i, "")
      .trim()
  );
}

function stripLeadingFiller(text) {
  let out = String(text || "").trim();
  while (/^(the|a|an|to|for)\s+/i.test(out)) {
    out = out.replace(/^(the|a|an|to|for)\s+/i, "").trim();
  }
  return out;
}

function fingerprint(text) {
  const tokens = String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 1 && !STOP_WORDS.has(word));
  return tokens.sort().join(" ");
}

function isJunkTask(text) {
  const raw = String(text || "").trim();
  const lower = raw.toLowerCase();
  if (!raw) return true;
  if (raw.length > 72) return true;
  if (raw.split(/\s+/).length > 12) return true;
  return /\b(duplicates?|take off|updating|oversight|utility belt|addtomorrow|addtoday|<<pa>>|rectify|patience|essentials|machine line|never mention|i will|i'll|let me|apologies|clearing the|ensure only|there are|u did|you did|did not|didn't|another thing)\b/i.test(
    lower
  );
}

function isLikelyTask(text) {
  const cleaned = cleanTitle(text) || String(text || "").trim();
  if (!cleaned || isJunkTask(cleaned) || isJunkTask(text)) return false;
  return Boolean(fingerprint(cleaned) || cleaned.length >= 3);
}

function isPrepTask(text) {
  return /\b(leads|prep|prepare|before (the )?call|run fresh|fresh leads)\b/i.test(String(text || ""));
}

function isCallish(text) {
  if (isPrepTask(text)) return false;
  return /\b(call|meeting|meet)\b/i.test(String(text || ""));
}

function partyName(text) {
  const cleaned = cleanTitle(text).toLowerCase();
  const match =
    cleaned.match(/\b(?:call|meeting|meet)\s+(?:with\s+)?([a-z]{2,})\b/) ||
    cleaned.match(/\b([a-z]{2,})\s+(?:call|meeting|meet)\b/);
  const name = match && match[1];
  if (name && !STOP_WORDS.has(name)) return name;
  return null;
}

function sameTask(a, b) {
  if (!a || !b) return false;
  const left = String(a.text || "").toLowerCase().trim();
  const right = String(b.text || "").toLowerCase().trim();
  if (left && left === right) return true;
  const ka = fingerprint(cleanTitle(a.text) || a.text);
  const kb = fingerprint(cleanTitle(b.text) || b.text);
  if (ka && kb && ka === kb) return true;
  if (isPrepTask(a.text) || isPrepTask(b.text)) return false;
  const party = partyName(a.text);
  return Boolean(party && party === partyName(b.text) && isCallish(a.text) && isCallish(b.text));
}

function looksLikeNudge(text) {
  const lower = String(text || "").toLowerCase();
  return /\b(did (u|you) add|did (u|you) d(o)? it|did (u|you) finish|didn'?t add|did not add|not added|not (changed|done)|don'?t think you added|dont tink u added|u did not add|you did not add|still not (on|in) the list|still there|it'?s still|its still|its not changed|not changed)\b/.test(
    lower
  );
}

function looksLikeRetry(text) {
  return /^(yes|yeah|yep|ok|okay|sure|try again|please|do it)$/i.test(String(text || "").trim());
}

function looksLikeTimeUpdate(text) {
  const lower = String(text || "").toLowerCase();
  return /\b(change|move|reschedule|push|shift|make it|set|update|must be|should be|needs to be)\b/.test(lower);
}

function looksLikeComplaint(text) {
  const lower = String(text || "").toLowerCase();
  return /\b(already there|not adding|u said|you said|there (are|is|ia)|still there)\b/.test(lower);
}

function looksLikeNewEvent(text) {
  const lower = String(text || "").toLowerCase();
  if (looksLikeListEdit(lower) || looksLikeNudge(lower) || looksLikeComplaint(lower) || looksLikeTimeUpdate(lower)) return false;
  const scheduling = /\b(i have|i've got|i got|i've a|remind(er)?( me)?|schedule|add a |add the |add to |put (it |this )?on|don'?t forget|meeting with|call with|todo|to-do|to do)\b/.test(
    lower
  );
  const dated = Boolean(inferDay(lower) || parseClock(lower));
  const action = /\b(run|call|meet|meeting|email|send|prep|prepare|write|buy|pay|review|leads|todo|to-do)\b/.test(lower);
  return (scheduling && (dated || action)) || (dated && action);
}

function looksLikeHardDelete(text) {
  const lower = String(text || "").toLowerCase();
  return /\b(delete|take (it )?off|remove|off (the|d=)?from the list|from the list|dont just strike|don't just strike|not strike)\b/.test(
    lower
  );
}

function looksLikeListEdit(text) {
  const lower = String(text || "").toLowerCase();
  return /\b(duplicates?|take off|remove|delete|clear (the )?duplicates?|strike(d)? off)\b/.test(lower);
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

function addTasks(tasks, titles, forDate, now = new Date()) {
  const list = Array.isArray(tasks) ? tasks.map((item) => ({ ...item })) : [];
  for (const title of titles || []) {
    const task = newTask(title, forDate, now);
    if (!task) continue;
    const existing = list.find((item) => !item.done && sameTask(item, task));
    if (existing) {
      if (forDate > existing.forDate) existing.forDate = forDate;
      if (task.time) existing.time = task.time;
      if (task.text && task.text.length < existing.text.length) existing.text = task.text;
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

function mergePair(keep, extra) {
  if (extra.time && !keep.time) keep.time = extra.time;
  if (extra.forDate > keep.forDate) keep.forDate = extra.forDate;
  if (extra.text && extra.text.length < keep.text.length && !isJunkTask(extra.text)) keep.text = extra.text;
}

function tidyTasks(tasks) {
  const kept = [];
  for (const item of Array.isArray(tasks) ? tasks : []) {
    if (!item || isJunkTask(item.text)) continue;
    const copy = { ...item };
    if (copy.done) {
      kept.push(copy);
      continue;
    }
    const existing = kept.find((row) => !row.done && sameTask(row, copy));
    if (existing) {
      mergePair(existing, copy);
      continue;
    }
    kept.push(copy);
  }
  return kept.slice(-80);
}

function isVagueHint(needle) {
  return /^(that|this|it|the call|the meeting|meeting|call|that meeting|that call|the task)$/.test(needle);
}

function matchScore(item, needle) {
  const title = String(item.text || "").toLowerCase();
  const hint = String(needle || "").toLowerCase().trim();
  if (!hint) return 0;
  if (title === hint) return 100;
  let score = 0;
  if (title.includes(hint) || hint.includes(title)) score += 6;
  const itemTokens = new Set(fingerprint(title).split(" ").filter(Boolean));
  const hintTokens = fingerprint(hint).split(" ").filter(Boolean);
  let overlap = 0;
  for (const token of hintTokens) {
    if (itemTokens.has(token)) overlap += 1;
  }
  score += overlap * 3;
  if (isPrepTask(item.text) && /\b(leads|prep|before)\b/.test(hint)) score += 4;
  if (isCallish(item.text) && isCallish(hint) && !isPrepTask(hint)) score += 4;
  return score;
}

function findTask(list, needle) {
  const open = list.filter((item) => !item.done);
  const cleaned = (cleanTitle(needle) || needle || "").trim().toLowerCase();
  if (!cleaned || isVagueHint(cleaned) || isVagueHint(String(needle || "").trim().toLowerCase())) {
    return open.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))[0];
  }
  let best;
  let bestScore = 0;
  for (const item of open) {
    const score = matchScore(item, cleaned);
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  if (bestScore >= 3) return best;
  return undefined;
}

function shouldRemove(item, needle) {
  const hint = String(needle || "").trim();
  if (!hint || !item) return false;
  if (isPrepTask(item.text) && isCallish(hint) && !isPrepTask(hint)) return false;
  const cleaned = (cleanTitle(hint) || hint).toLowerCase();
  const title = String(item.text || "").toLowerCase();
  if (title.includes(cleaned) || cleaned.includes(title)) return true;
  const fp = fingerprint(cleaned);
  const other = fingerprint(item.text);
  if (fp && other && fp === other) return true;
  const party = partyName(hint);
  return Boolean(party && party === partyName(item.text) && isCallish(item.text));
}

function removeTasks(tasks, hints) {
  const needles = (hints || []).map((item) => String(item || "").trim()).filter(Boolean);
  if (!needles.length) return Array.isArray(tasks) ? tasks.map((item) => ({ ...item })) : [];
  return (Array.isArray(tasks) ? tasks : []).filter((item) => !needles.some((needle) => shouldRemove(item, needle)));
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
  return { addTomorrow: [], addToday: [], done: [], remember: [], update: [], remove: [], removeDuplicates: false };
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
        remove: Array.isArray(parsed.remove) ? parsed.remove : [],
        removeDuplicates: Boolean(parsed.removeDuplicates),
      };
    } catch {
      // ignore a broken machine block
    }
  }
  return { visible: visible || raw.trim(), actions };
}

function extractSubject(text) {
  const quoted = String(text || "").match(/["“”']([^"“”']+)["“”']/);
  if (quoted) return cleanTitle(quoted[1]) || quoted[1].trim();
  return cleanTitle(
    String(text || "")
      .replace(/\b(done|finished|complete(d)?|strike(d)? off|tick(ed)? off|cancel(led)?|crossed off|move|reschedule|change|push|shift|make it|take off|remove|delete|clear|duplicates?)\b/gi, " ")
      .replace(/^\s*to\s+/i, " ")
  );
}

function extractDeleteTarget(text) {
  const raw = String(text || "");
  const named = raw.match(/\b(?:call|meeting)\s+with\s+([a-z]+)/i);
  if (named) return `call with ${named[1]}`;
  return extractSubject(raw);
}

function hasWork(actions) {
  return Boolean(
    actions &&
      (actions.addTomorrow?.length ||
        actions.addToday?.length ||
        actions.done?.length ||
        actions.update?.length ||
        actions.remove?.length ||
        actions.removeDuplicates)
  );
}

function interpretUserText(text, now = new Date()) {
  const actions = emptyActions();
  const raw = String(text || "").trim();
  if (!raw) return actions;
  const lower = raw.toLowerCase();
  const time = parseClock(raw);
  const day = inferDay(lower);
  const subject = extractSubject(raw);

  if (looksLikeNudge(lower)) return actions;

  if (
    /\bduplicates?\b/.test(lower) ||
    /\bthere (are|is|ia)\s+\d+\b/.test(lower) ||
    /\b(2|two)\s+calls?\b/.test(lower) ||
    (looksLikeComplaint(lower) && /\b(call|demi)\b/.test(lower) && !looksLikeHardDelete(lower))
  ) {
    actions.removeDuplicates = true;
    return actions;
  }

  if (looksLikeHardDelete(lower) || /\b(take off|remove|delete)\b/.test(lower)) {
    const target = extractDeleteTarget(raw) || subject;
    if (target) actions.remove.push(target);
    return actions;
  }

  if (/\b(done|finished|complete(d)?|strike(d)? off|tick(ed)? off|cancel(led)?|crossed off)\b/.test(lower) && !looksLikeTimeUpdate(lower) && !time) {
    if (subject) actions.done.push(subject);
    return actions;
  }

  if (
    !looksLikeNewEvent(raw) &&
    (looksLikeTimeUpdate(lower) || isVagueHint(subject) || /\b(leads|before call)\b/.test(lower)) &&
    (time || day)
  ) {
    let match = subject;
    if (/\bleads\b/i.test(raw)) match = "leads";
    else if (!match || isVagueHint(match) || match.split(/\s+/).length > 8) match = "it";
    actions.update.push({ match, time, day: day || undefined });
    return actions;
  }

  if (looksLikeNewEvent(raw) && subject && isLikelyTask(subject)) {
    const item = { text: subject, time };
    if (day === "today") actions.addToday.push(item);
    else actions.addTomorrow.push(item);
  }
  return actions;
}

function captureFromHistory(history, now = new Date()) {
  const turns = Array.isArray(history) ? history : [];
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn || turn.role !== "user") continue;
    const content = String(turn.content || "").trim();
    if (!content || looksLikeNudge(content)) continue;
    const captured = interpretUserText(content, now);
    if (hasWork(captured)) return captured;
  }
  return emptyActions();
}

function captureFromUserText(text, now = new Date(), history = []) {
  const direct = interpretUserText(text, now);
  if (hasWork(direct)) return direct;
  if (looksLikeNudge(text) || looksLikeComplaint(text) || looksLikeRetry(text)) return captureFromHistory(history, now);
  return direct;
}

function mergeActions(first, second) {
  const a = { ...emptyActions(), ...first };
  const b = { ...emptyActions(), ...second };
  if (b.removeDuplicates || a.removeDuplicates) {
    return {
      ...emptyActions(),
      removeDuplicates: true,
      remove: [...a.remove, ...b.remove],
      done: [...a.done, ...b.done],
      update: [...a.update, ...b.update],
    };
  }
  return {
    addTomorrow: [...a.addTomorrow, ...b.addTomorrow],
    addToday: [...a.addToday, ...b.addToday],
    done: [...a.done, ...b.done],
    remember: [...a.remember, ...b.remember],
    update: [...a.update, ...b.update],
    remove: [...a.remove, ...b.remove],
    removeDuplicates: false,
  };
}

function applyPaActions(state, actions, now = new Date()) {
  let tasks = tidyTasks(Array.isArray(state.tasks) ? state.tasks : []);
  let facts = Array.isArray(state.facts) ? state.facts : [];
  if (!actions?.removeDuplicates) {
    tasks = addTasks(tasks, actions.addToday, dateKey(now), now);
    tasks = addTasks(tasks, actions.addTomorrow, tomorrowKey(now), now);
  }
  tasks = updateTasks(tasks, actions.update, now);
  tasks = markDone(tasks, actions.done);
  tasks = removeTasks(tasks, actions.remove);
  tasks = tidyTasks(tasks);
  for (const fact of actions.remember || []) {
    const text = String(fact || "").trim();
    if (text && !isJunkTask(text) && !facts.includes(text)) facts.push(text);
  }
  facts = facts.slice(-40);
  return { tasks, facts };
}

function openLines(tasks) {
  return (Array.isArray(tasks) ? tasks : []).filter((item) => !item.done).map((item) => formatTaskLine(item));
}

function describeChange(before, after, userText, actions = emptyActions()) {
  const beforeIds = new Set((before || []).map((item) => item.id));
  const afterIds = new Set((after || []).map((item) => item.id));
  const removed = (before || []).filter((item) => !afterIds.has(item.id));
  const added = (after || []).filter((item) => !beforeIds.has(item.id));
  const nowOpen = openLines(after);
  const lines = [];
  if (removed.length) lines.push(`Removed from the list: ${removed.map((item) => formatTaskLine(item)).join("; ")}`);
  if (added.length) lines.push(`Added: ${added.map((item) => formatTaskLine(item)).join("; ")}`);
  lines.push(nowOpen.length ? `Now on the list (${nowOpen.length}): ${nowOpen.join("; ")}` : "The list is now empty.");
  const deleteHints = [...(actions.remove || [])];
  if (looksLikeHardDelete(userText) || /\b(delete|take off|remove)\b/i.test(userText)) {
    deleteHints.push(extractDeleteTarget(userText));
  }
  if (deleteHints.length) {
    const still = (after || []).filter((item) => !item.done && deleteHints.some((hint) => shouldRemove(item, hint)));
    if (still.length) {
      lines.push(`FAILED: still on the list: ${still.map((item) => formatTaskLine(item)).join("; ")}. Do not say it is gone.`);
    } else if (removed.length) {
      lines.push("Delete succeeded. Confirm it is gone. Do not say you will do it later.");
    }
  }
  for (const update of actions.update || []) {
    const match = findTask(after || [], update.match);
    if (update.time && (!match || match.time !== update.time)) {
      lines.push(`FAILED: time is not ${update.time}. Do not say the time change is done.`);
    } else if (match && update.time) {
      lines.push(`Time update succeeded: ${formatTaskLine(match)}.`);
    }
  }
  if (actions.removeDuplicates || /\b(2|two|duplicates?)\b/i.test(userText)) {
    const calls = (after || []).filter((item) => !item.done && isCallish(item.text));
    const parties = {};
    for (const item of calls) {
      const party = partyName(item.text) || item.text;
      parties[party] = (parties[party] || 0) + 1;
    }
    const extras = Object.entries(parties).filter(([, count]) => count > 1);
    if (extras.length) lines.push(`FAILED: still duplicated: ${extras.map(([name, count]) => `${name} x${count}`).join("; ")}`);
    else lines.push("Duplicates collapsed. Confirm only one copy remains.");
  }
  return lines.join("\n");
}

function paInstructions() {
  return [
    "The to-do list engine already ran BEFORE you speak. You do not mutate the list.",
    "Read GROUND TRUTH. Only describe what it says. Never say 'updating', 'I will add', or 'done' unless GROUND TRUTH says the change succeeded.",
    "If GROUND TRUTH says FAILED, admit it is still there. Do not pretend.",
    "Keep answers short. No machine JSON.",
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
  tidyTasks,
  removeTasks,
  describeChange,
  paInstructions,
};
