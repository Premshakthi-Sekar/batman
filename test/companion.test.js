"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { sleepUntil, remainingMs, isAsleep, formatRemaining, HOUR_MS } = require("../src/sleep");
const { buildMessages, parseReply, parseGeminiReply, askBatman, resolveModel } = require("../src/chat");
const { createStore } = require("../src/store");

test("sleepUntil is two, three, or four hours later", () => {
  const now = 1_700_000_000_000;
  assert.equal(sleepUntil(2, now), now + 2 * HOUR_MS);
  assert.equal(sleepUntil(3, now), now + 3 * HOUR_MS);
  assert.equal(sleepUntil(4, now), now + 4 * HOUR_MS);
});

test("isAsleep is true until the wake time", () => {
  const now = 1_000;
  const wakeAt = sleepUntil(2, now);
  assert.equal(isAsleep(wakeAt, now), true);
  assert.equal(isAsleep(wakeAt, wakeAt), false);
  assert.equal(remainingMs(wakeAt, now + HOUR_MS), HOUR_MS);
});

test("formatRemaining uses hours and minutes", () => {
  const now = 0;
  assert.equal(formatRemaining(now + 2 * HOUR_MS, now), "2h");
  assert.equal(formatRemaining(now + 90 * 60 * 1000, now), "1h 30m");
  assert.equal(formatRemaining(now - 1, now), "awake");
});

test("buildMessages adds the batman system prompt and trims history", () => {
  const history = [];
  for (let i = 0; i < 20; i += 1) {
    history.push({ role: "user", content: `q${i}` });
    history.push({ role: "assistant", content: `a${i}` });
  }
  const messages = buildMessages(history, "  hello  ");
  assert.equal(messages[0].role, "system");
  assert.match(messages[0].content, /tiny Batman/);
  assert.equal(messages[messages.length - 1].content, "hello");
  assert.ok(messages.length <= 18);
});

test("parseGeminiReply reads Gemini candidate text", () => {
  assert.equal(
    parseGeminiReply({
      candidates: [{ content: { parts: [{ text: " I am vengeance. " }] } }],
    }),
    "I am vengeance."
  );
});

test("parseReply reads OpenAI chat content", () => {
  const reply = parseReply({
    choices: [{ message: { content: " I am vengeance. " } }],
  });
  assert.equal(reply, "I am vengeance.");
});

test("askBatman requires an API key", async () => {
  await assert.rejects(() => askBatman({ apiKey: "", userText: "hi" }), /API key/);
});

test("resolveModel upgrades retired Gemini models", () => {
  assert.equal(resolveModel("gemini", "gpt-4o-mini"), "gemini-3.7-flash");
  assert.equal(resolveModel("gemini", "gemini-2.5-flash"), "gemini-3.7-flash");
});

test("askBatman posts to Gemini by default and returns the reply", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Gotham is quiet." }] } }],
      }),
    };
  };
  const reply = await askBatman({
    apiKey: "gemini-test",
    model: "gpt-4o-mini",
    userText: "status?",
    history: [],
    fetchImpl,
  });
  assert.equal(reply, "Gotham is quiet.");
  assert.match(calls[0].url, /generativelanguage.googleapis.com/);
  assert.match(calls[0].url, /gemini-3.7-flash/);
  assert.equal(calls[0].options.headers["x-goog-api-key"], "gemini-test");
});

test("askBatman retries a newer Gemini model when the old one is retired", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (String(url).includes("gemini-3.7-flash")) {
      return {
        ok: false,
        json: async () => ({
          error: { message: "This model models/gemini-3.7-flash is no longer available to new users." },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "I am vengeance." }] } }],
      }),
    };
  };
  const reply = await askBatman({
    provider: "gemini",
    apiKey: "gemini-test",
    model: "gemini-3.7-flash",
    userText: "hey",
    fetchImpl,
  });
  assert.equal(reply, "I am vengeance.");
  assert.ok(calls.length >= 2);
  assert.match(String(calls[1]), /gemini-3\.5-flash-lite/);
});

test("askBatman retries when Gemini is busy then answers", async () => {
  let hits = 0;
  const fetchImpl = async () => {
    hits += 1;
    if (hits === 1) {
      return {
        ok: false,
        json: async () => ({
          error: { message: "This model is currently experiencing high demand. Please try again later." },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: "Stand by." }] } }],
      }),
    };
  };
  const reply = await askBatman({
    apiKey: "gemini-test",
    userText: "status?",
    fetchImpl,
    sleepImpl: async () => {},
  });
  assert.equal(reply, "Stand by.");
  assert.equal(hits, 2);
});

test("askBatman posts to OpenAI when that provider is selected", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "I am vengeance." } }],
      }),
    };
  };
  const reply = await askBatman({
    provider: "openai",
    apiKey: "sk-test",
    userText: "status?",
    history: [],
    fetchImpl,
  });
  assert.equal(reply, "I am vengeance.");
  assert.match(calls[0].url, /chat\/completions/);
  assert.match(calls[0].options.headers.Authorization, /sk-test/);
});

test("store round-trips settings", () => {
  const file = path.join(os.tmpdir(), `batman-store-${Date.now()}.json`);
  const store = createStore(file);
  store.set("apiKey", "sk-secret");
  const again = createStore(file);
  assert.equal(again.get("apiKey"), "sk-secret");
  fs.unlinkSync(file);
});
