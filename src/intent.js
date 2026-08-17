"use strict";

const {
  emptyActions,
  parseClock,
  inferDay,
  parseDelay,
  normalizeTime,
  formatTaskLine,
  rankedMatches,
  findTask,
  hourBefore,
  isPrepTask,
  isCallish,
  captureFromUserText,
  cleanTitle,
} = require("./pa");

const INTENT_PROMPT = [
  "You are the PA brain for a desktop Batman. You do not change the list yourself.",
  "Read the open tasks and the user message. Understand messy spelling and shorthand.",
  "Reply with ONLY JSON, no other text:",
  '{"action":"add|update|remove|complete|dedupe|remind|ask|chat","title":null,"match":null,"time":null,"day":null,"inMinutes":null,"question":null,"confidence":"high|low"}',
  "action=remind when they want a live ping: 'in 2 mins', 'in 10 minutes', 'remind me at 12:53am'. Set title, time as HH:MM if given, inMinutes if relative.",
  "Batman CAN fire live reminders with a red eye-beam. Never refuse a timed remind.",
  "action=ask if two tasks could match, a time/day is missing when it matters, or you are not sure. Put the question in question.",
  "time must be 24-hour HH:MM. '10', '10 tmrw', '10am' → 10:00. '2pm' → 14:00. '12.53AM' → 00:53.",
  "If they say before the call and a call exists, use one hour before that call unless they gave a time.",
  "Do not add a second copy of a task that already exists; update it.",
  "chat = conversation only, no list change.",
].join(" ");

function parseIntentReply(raw) {
  const text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const action = String(parsed.action || "chat").toLowerCase();
    const allowed = ["add", "update", "remove", "complete", "dedupe", "remind", "ask", "chat"];
    const inMinutes = Number(parsed.inMinutes);
    return {
      action: allowed.includes(action) ? action : "chat",
      title: parsed.title ? String(parsed.title).trim() : null,
      match: parsed.match ? String(parsed.match).trim() : parsed.title ? String(parsed.title).trim() : null,
      time: normalizeTime(parsed.time) || parseClock(parsed.time) || parseClock(text) || null,
      day: parsed.day === "today" || parsed.day === "tomorrow" ? parsed.day : inferDay(String(parsed.day || "")),
      inMinutes: Number.isFinite(inMinutes) && inMinutes > 0 ? inMinutes : null,
      question: parsed.question ? String(parsed.question).trim() : null,
      confidence: String(parsed.confidence || "").toLowerCase() === "high" ? "high" : "low",
    };
  } catch {
    return null;
  }
}

function listSnapshot(tasks) {
  const open = (Array.isArray(tasks) ? tasks : []).filter((item) => !item.done);
  if (!open.length) return "Open tasks: none.";
  return [
    "Open tasks:",
    ...open.map(
      (item, index) =>
        `${index + 1}. [${item.id}] ${item.forDate || "undated"} ${item.time || "no-time"} · ${item.text}`
    ),
  ].join("\n");
}

function callTime(tasks) {
  const call = (Array.isArray(tasks) ? tasks : []).find((item) => !item.done && isCallish(item.text) && item.time);
  return call ? call.time : null;
}

function ambiguous(rows) {
  if (!rows || rows.length < 2) return false;
  return rows[0].score - rows[1].score < 4;
}

function choiceQuestion(rows, verb) {
  const lines = rows.map((row, index) => `${index + 1}. ${formatTaskLine(row.item)}`);
  return `Which one should I ${verb}? Reply 1 or 2.\n${lines.join("\n")}`;
}

function pendingFromRows(rows, fields) {
  return {
    ...fields,
    choices: rows.map((row) => ({
      id: row.item.id,
      text: row.item.text,
      time: row.item.time,
      forDate: row.item.forDate,
    })),
  };
}

function resolvePending(pending, userText) {
  if (!pending || !pending.choices || !pending.choices.length) return null;
  const lower = String(userText || "").toLowerCase().trim();
  const indexMatch = lower.match(/^([12])\b/);
  let picked = null;
  if (indexMatch) picked = pending.choices[Number(indexMatch[1]) - 1];
  else if (/\bleads|prep\b/.test(lower)) picked = pending.choices.find((item) => isPrepTask(item.text));
  else if (/\bcall|meeting|demi\b/.test(lower) && pending.choices.filter((item) => isCallish(item.text)).length === 1) {
    picked = pending.choices.find((item) => isCallish(item.text));
  }
  if (!picked) return { question: choiceQuestion(pending.choices.map((item) => ({ item })), pending.action || "change"), pending };
  const actions = emptyActions();
  const match = picked.text;
  if (pending.action === "remove") actions.remove.push(match);
  else if (pending.action === "complete") actions.done.push(match);
  else {
    actions.update.push({ match, time: pending.time || null, day: pending.day || undefined });
  }
  return { actions, pending: null, replyHint: `Using: ${formatTaskLine(picked)}` };
}

function actionsFromIntent(intent, tasks, userText, now) {
  const actions = emptyActions();
  if (!intent || intent.action === "chat") return { actions, chat: true };
  if (intent.action === "ask") {
    return { question: intent.question || "I need a bit more. Which task, and what time?", pending: null };
  }
  if (intent.action === "dedupe") {
    actions.removeDuplicates = true;
    return { actions };
  }

  let time = intent.time || parseClock(userText);
  let day = intent.day || inferDay(userText);
  if (!time && /\bbefore (the )?call\b/i.test(userText)) {
    const basis = callTime(tasks);
    if (basis) time = hourBefore(basis);
  }

  if (intent.action === "remind") {
    const delayMs =
      intent.inMinutes != null ? Math.round(Number(intent.inMinutes) * 60 * 1000) : parseDelay(userText);
    const title = intent.title || intent.match || cleanTitle(userText);
    if (!title) return { question: "What should I remind you about, and when?", pending: null };
    if (!delayMs && !time) {
      return { question: "When should I ping you? Say in 2 mins, or a clock time.", pending: null };
    }
    actions.pings.push({ text: title, delayMs: delayMs || null, time: time || null, day: day || "today" });
    const item = { text: title, time: time || null };
    if (day === "tomorrow" && !delayMs) actions.addTomorrow.push(item);
    else actions.addToday.push(item);
    return { actions };
  }

  const needle = intent.match || intent.title || userText;
  const rows = rankedMatches(tasks, needle);

  if (intent.action === "add") {
    const existing = findTask(tasks, needle);
    if (existing && !/\b(add another|new)\b/i.test(userText)) {
      actions.update.push({ match: existing.text, time, day: day || undefined });
      return { actions };
    }
    const title = intent.title || intent.match;
    if (!title) return { question: "What should I add to the list?", pending: null };
    const item = { text: title, time };
    if (day === "today") actions.addToday.push(item);
    else actions.addTomorrow.push(item);
    return { actions };
  }

  if (["update", "remove", "complete"].includes(intent.action)) {
    if (ambiguous(rows)) {
      const pending = pendingFromRows(rows.slice(0, 2), { action: intent.action, time, day });
      return { question: intent.question || choiceQuestion(rows.slice(0, 2), intent.action), pending };
    }
    const target = rows[0]?.item || findTask(tasks, needle);
    if (!target) {
      return { question: `I don't see that on the list yet. Add it first, or tell me the exact title.`, pending: null };
    }
    if (intent.action === "remove") actions.remove.push(target.text);
    else if (intent.action === "complete") actions.done.push(target.text);
    else {
      if (!time && !day) {
        return {
          question: `Got it — "${target.text}". What time should I set?`,
          pending: pendingFromRows([{ item: target, score: 99 }], { action: "update", time: null, day }),
        };
      }
      actions.update.push({ match: target.text, time, day: day || undefined });
    }
    return { actions };
  }

  return { actions, chat: true };
}

function decideTurn({ userText, tasks, history, llmIntent, pending, now }) {
  const local = captureFromUserText(userText, now, history);
  const resolvedPending = resolvePending(pending, userText);
  if (pending && resolvedPending && (resolvedPending.actions || resolvedPending.question)) {
    return resolvedPending;
  }

  const certain = localIsCertain(local, tasks);
  if (llmIntent?.action === "ask" && llmIntent.question && !certain) {
    const needle = llmIntent.match || userText;
    const rows = rankedMatches(tasks, needle);
    const fallbackRows = (Array.isArray(tasks) ? tasks : [])
      .filter((item) => !item.done)
      .slice(0, 2)
      .map((item) => ({ item, score: 1 }));
    const choices = rows.length >= 2 ? rows.slice(0, 2) : rows.length ? rows : fallbackRows;
    return {
      question: llmIntent.question,
      pending: choices.length ? pendingFromRows(choices, { action: "update", time: llmIntent.time, day: llmIntent.day }) : null,
    };
  }

  if (llmIntent) {
    const fromLlm = actionsFromIntent(llmIntent, tasks, userText, now);
    if (fromLlm.question) return fromLlm;
    if (fromLlm.actions && !fromLlm.chat) {
      if (local.pings?.length) {
        fromLlm.actions.pings = [...(fromLlm.actions.pings || []), ...local.pings];
      }
      return fromLlm;
    }
    if (fromLlm.chat && !hasLocalWork(local)) return { actions: emptyActions(), chat: true };
  }

  if (hasLocalWork(local)) {
    const update = local.update[0];
    if (update) {
      const rows = rankedMatches(tasks, update.match);
      if (ambiguous(rows) && isVague(update.match)) {
        return {
          question: choiceQuestion(rows.slice(0, 2), "update"),
          pending: pendingFromRows(rows.slice(0, 2), { action: "update", time: update.time, day: update.day }),
        };
      }
    }
    return { actions: local };
  }

  return { actions: emptyActions(), chat: true };
}

function hasLocalWork(actions) {
  return Boolean(
    actions &&
      (actions.addTomorrow?.length ||
        actions.addToday?.length ||
        actions.done?.length ||
        actions.update?.length ||
        actions.remove?.length ||
        actions.pings?.length ||
        actions.removeDuplicates)
  );
}

function localIsCertain(local, tasks) {
  if (local?.pings?.length) return true;
  if (!hasLocalWork(local)) return false;
  const needle = local.update[0]?.match || local.remove[0] || local.done[0];
  if (!needle || isVague(needle)) return false;
  const rows = rankedMatches(tasks, needle);
  return rows.length === 1;
}

function isVague(needle) {
  return /^(that|this|it|the call|the meeting|meeting|call|that meeting|that call|the task)$/i.test(String(needle || "").trim());
}

function spokenResult(decision, ground) {
  if (decision.question) return decision.question;
  if (decision.chat) return null;
  const failed = /FAILED/i.test(ground || "");
  if (failed) return ground.split("\n").filter((line) => /FAILED|Now on the list|Time update/.test(line)).join("\n");
  if (decision.replyHint) return `${decision.replyHint}. ${summarizeGround(ground)}`;
  return summarizeGround(ground);
}

function summarizeGround(ground) {
  const lines = String(ground || "")
    .split("\n")
    .filter((line) =>
      /^(Removed|Added|Now on the list|Time update succeeded|Delete succeeded|Duplicates collapsed|Live reminder armed)/i.test(
        line
      )
    );
  return lines.join(" ") || ground;
}

module.exports = {
  INTENT_PROMPT,
  parseIntentReply,
  listSnapshot,
  decideTurn,
  actionsFromIntent,
  resolvePending,
  spokenResult,
  hourBefore,
};
