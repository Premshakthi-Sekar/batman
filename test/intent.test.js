"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseIntentReply, decideTurn, actionsFromIntent, resolvePending } = require("../src/intent");
const { hourBefore } = require("../src/pa");

const now = new Date("2026-08-17T21:00:00");
const tasks = [
  { id: "1", text: "call with Demi", time: "11:00", forDate: "2026-08-18", done: false, createdAt: now.toISOString() },
  { id: "2", text: "run a fresh leads for demi before call", time: null, forDate: "2026-08-18", done: false, createdAt: now.toISOString() },
];

test("parseIntentReply reads JSON even with extra text", () => {
  const intent = parseIntentReply('Sure.\n{"action":"update","match":"leads","time":"10:00","day":"tomorrow","question":null,"confidence":"high"}');
  assert.equal(intent.action, "update");
  assert.equal(intent.time, "10:00");
});

test("hourBefore the 11am call is 10:00", () => {
  assert.equal(hourBefore("11:00"), "10:00");
});

test("vague change it to 10 asks which Demi task when both score", () => {
  const decision = decideTurn({
    userText: "change it to 10",
    tasks,
    history: [],
    llmIntent: { action: "ask", question: "Call or leads?", match: "demi", time: "10:00", day: "tomorrow", confidence: "low" },
    pending: null,
    now,
  });
  assert.ok(decision.question);
  assert.ok(decision.pending);
  assert.equal(decision.pending.choices.length, 2);
});

test("leads-specific update does not ask", () => {
  const decision = decideTurn({
    userText: 'change the "run a fresh leads for demi before call" to 10 tmrw',
    tasks,
    history: [],
    llmIntent: { action: "update", match: "leads", time: "10:00", day: "tomorrow", title: null, question: null, confidence: "high" },
    pending: null,
    now,
  });
  assert.equal(decision.question, undefined);
  assert.equal(decision.actions.update[0].time, "10:00");
  assert.match(decision.actions.update[0].match, /leads/i);
});

test("reply 1 uses the pending choice", () => {
  const pending = {
    action: "update",
    time: "10:00",
    day: "tomorrow",
    choices: [
      { id: "1", text: "call with Demi", time: "11:00" },
      { id: "2", text: "run a fresh leads for demi before call", time: null },
    ],
  };
  const next = resolvePending(pending, "2");
  assert.equal(next.actions.update[0].time, "10:00");
  assert.match(next.actions.update[0].match, /leads/i);
});

test("before the call infers 10:00 from the 11:00 meeting", () => {
  const fromLlm = actionsFromIntent(
    { action: "update", match: "leads", time: null, day: "tomorrow", title: null, question: null, confidence: "high" },
    tasks,
    "run fresh leads before the call tmrw",
    now
  );
  assert.equal(fromLlm.actions.update[0].time, "10:00");
});

test("remind in 2 mins wins even if the model refuses", () => {
  const decision = decideTurn({
    userText: "remind me to drink water at 12.53AM today please (in 2 mins)",
    tasks: [],
    history: [],
    llmIntent: { action: "chat", title: null, match: null, time: null, day: null, question: null, confidence: "high" },
    pending: null,
    now: new Date("2026-08-17T00:51:00"),
  });
  assert.equal(decision.chat, undefined);
  assert.equal(decision.actions.pings.length, 1);
  assert.match(decision.actions.pings[0].text, /drink water/i);
});

test("remind action from the model arms a ping", () => {
  const fromLlm = actionsFromIntent(
    { action: "remind", title: "drink water", time: "00:53", day: "today", inMinutes: 2, question: null, confidence: "high" },
    [],
    "remind me to drink water in 2 mins",
    new Date("2026-08-17T00:51:00")
  );
  assert.equal(fromLlm.actions.pings[0].delayMs, 2 * 60 * 1000);
});
