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
  looksLikeAddNewInstead,
  looksLikeNewEvent,
  wantsBothDays,
  pushDatedItem,
  extractSubject,
} = require("./pa");
const { extractFindQuery, looksLikeFindRequest } = require("./finder");

const INTENT_PROMPT = [
  "You are the PA brain for a desktop Batman. You do not change the list yourself.",
  "Read the open tasks and the user message. Understand messy spelling and shorthand.",
  "Reply with ONLY JSON, no other text:",
  '{"action":"add|update|remove|complete|dedupe|remind|find|ask|chat","title":null,"match":null,"time":null,"day":null,"inMinutes":null,"question":null,"confidence":"high|low"}',
  "action=remind when they want a live ping: 'in 2 mins', 'in 10 minutes', 'remind me at 12:53am'. Set title, time as HH:MM if given, inMinutes if relative.",
  "action=find when they want a file on this Mac: 'find me this doc', 'where is invoice.pdf'. Put the search text in title.",
  "Batman CAN fire live reminders with a red eye-beam. Never refuse a timed remind.",
  "action=ask if two tasks could match, a time/day is missing when it matters, or you are not sure. Put the question in question.",
  "time must be 24-hour HH:MM. '10', '10 tmrw', '10am' → 10:00. '2pm' → 14:00. '12.53AM' → 00:53.",
  "If they say before the call and a call exists, use one hour before that call unless they gave a time.",
  "Do not add a second copy of a task that already exists unless they say it is a new one or don't update the old ones.",
  "today AND tomorrow means two list items, same title and time, one on each day.",
  "If they say don't update / new one / neither, action=add. Never keep asking 1 or 2 about unrelated tasks.",
  "chat = conversation only, no list change.",
  "If a local parser already has a clear list edit, live remind, or file hunt, it wins. Do not contradict it.",
].join(" ");

function parseIntentReply(raw) {
  const text = String(raw || "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    const action = String(parsed.action || "chat").toLowerCase();
    const allowed = ["add", "update", "remove", "complete", "dedupe", "remind", "find", "ask", "chat"];
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

function looksLikeWhichTaskQuestion(question) {
  return /\b(which one|which task|reply 1|1 or 2|call or|leads or)\b/i.test(String(question || ""));
}

function addActionsFromPending(pending, userText, now) {
  const actions = emptyActions();
  const time = parseClock(userText) || pending.time || null;
  const title = pending.title || extractSubject(userText);
  if (!title) return { question: "What should I add, and for which day?", pending: null };
  const day = wantsBothDays(userText) || pending.day === "both" ? "both" : inferDay(userText) || pending.day;
  pushDatedItem(actions, { text: title, time }, day, `${pending.title || ""} ${userText}`);
  return { actions, pending: null, replyHint: `New item: ${title}${time ? ` at ${time}` : ""}` };
}

function resolvePending(pending, userText) {
  if (!pending) return null;
  const lower = String(userText || "").toLowerCase().trim();
  if (looksLikeAddNewInstead(userText) || (looksLikeNewEvent(userText) && pending.action !== "add")) {
    return { skipPending: true, pending: null };
  }
  if (pending.action === "add" || pending.awaiting === "time") {
    if (parseClock(userText) || /\b(no time|whenever|any time|untimed)\b/i.test(lower)) {
      return addActionsFromPending(pending, userText);
    }
    if (!pending.choices || !pending.choices.length) {
      return { question: pending.question || "What time should I put on the new item? Say 12pm, or no time.", pending };
    }
  }
  if (!pending.choices || !pending.choices.length) return null;
  const indexMatch = lower.match(/^(?:option\s*)?([12])(?:\s*[.)]|\s*$)/);
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
    actions.update.push({ match, time: pending.time || parseClock(userText) || null, day: pending.day || undefined });
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
    pushDatedItem(actions, item, day || "today", userText);
    return { actions };
  }

  if (intent.action === "find") {
    const query = intent.title || intent.match || extractFindQuery(userText);
    if (!query) return { question: "What file should I hunt? Give me a name, like invoice.pdf.", pending: null };
    return { findQuery: query, actions: emptyActions() };
  }

  const needle = intent.match || intent.title || userText;
  const rows = rankedMatches(tasks, needle);

  if (intent.action === "add") {
    const existing = findTask(tasks, needle);
    if (existing && !/\b(add another|new)\b/i.test(userText) && !looksLikeAddNewInstead(userText) && !wantsBothDays(userText)) {
      actions.update.push({ match: existing.text, time, day: day || undefined });
      return { actions };
    }
    const title = intent.title || intent.match;
    if (!title) return { question: "What should I add to the list?", pending: null };
    pushDatedItem(actions, { text: title, time }, day, userText);
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

// First match wins when local parsers and the LLM disagree:
// 1. pending 1/2 (unless they say new one / don't update)
// 2. local find  3. LLM find  4. certain local list/ping/add
// 5. LLM ask  6. LLM actions  7. remaining local work  8. chat
function decideTurn({ userText, tasks, history, llmIntent, pending, now }) {
  const local = captureFromUserText(userText, now, history);
  const resolvedPending = resolvePending(pending, userText);
  if (pending && resolvedPending && !resolvedPending.skipPending && (resolvedPending.actions || resolvedPending.question)) {
    return resolvedPending;
  }

  const localFind = extractFindQuery(userText);
  if (localFind) {
    return { findQuery: localFind, actions: emptyActions() };
  }
  if (llmIntent?.action === "find") {
    const findQuery = llmIntent.title || llmIntent.match;
    if (findQuery) return { findQuery, actions: emptyActions() };
  }
  if (looksLikeFindRequest(userText) || llmIntent?.action === "find") {
    return { question: "What file should I hunt? Give me a name, like invoice.pdf.", pending: null };
  }

  const certain = localIsCertain(local, tasks);
  if (certain) {
    const item = local.addToday?.[0] || local.addTomorrow?.[0];
    if (item && !item.time && !local.pings?.length && !local.update?.length && !local.remove?.length) {
      return {
        question: `What time do you want on "${item.text}"? Say 12pm, or no time.`,
        pending: {
          action: "add",
          title: item.text,
          day: local.addToday?.length && local.addTomorrow?.length ? "both" : local.addToday?.length ? "today" : "tomorrow",
          awaiting: "time",
          choices: [],
        },
      };
    }
    return { actions: local, pending: null };
  }
  if (llmIntent?.action === "ask" && llmIntent.question && !certain) {
    if (!looksLikeWhichTaskQuestion(llmIntent.question) && (looksLikeNewEvent(userText) || /\badd\b/i.test(userText))) {
      return {
        question: llmIntent.question,
        pending: {
          action: "add",
          title: llmIntent.title || extractSubject(userText),
          day: wantsBothDays(userText) ? "both" : llmIntent.day || inferDay(userText),
          awaiting: "time",
          choices: [],
        },
      };
    }
    const needle = llmIntent.match || userText;
    const rows = rankedMatches(tasks, needle);
    const choices = rows.length >= 2 ? rows.slice(0, 2) : [];
    if (!choices.length) {
      return { question: llmIntent.question, pending: null };
    }
    return {
      question: llmIntent.question,
      pending: pendingFromRows(choices, { action: "update", time: llmIntent.time, day: llmIntent.day }),
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
  if ((local?.addToday?.length || local?.addTomorrow?.length) && !local.update?.length) {
    const item = local.addToday[0] || local.addTomorrow[0];
    return Boolean(item?.text && String(item.text).trim().length >= 3 && !isVague(item.text));
  }
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
