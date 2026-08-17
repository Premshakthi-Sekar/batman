"use strict";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-3.7-flash";
const DEFAULT_PROVIDER = "openai";
const GEMINI_FALLBACKS = [
  "gemini-3.7-flash",
  "gemini-3.5-flash-lite",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
];
const { paInstructions } = require("./pa");
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = [
  "You are a tiny Batman who lives on the user's desktop.",
  "You are the Dark Knight, but pocket-sized: dry, deadpan, a little dramatic, and actually helpful.",
  "You are also their personal assistant: you remember the briefing, keep their to-do list, and follow up.",
  "Keep answers short unless the user asks for detail. A few sentences is usually enough.",
  "You may reference Gotham, gadgets, and patrols, but still answer the real question.",
  "Never claim you can physically control the user's computer beyond this companion app.",
].join(" ");

function looksLikeOpenAIKey(key) {
  return String(key || "").trim().startsWith("sk-");
}

function normalizeProvider(provider) {
  return String(provider || DEFAULT_PROVIDER).toLowerCase() === "gemini" ? "gemini" : "openai";
}

function defaultModelFor(provider) {
  return normalizeProvider(provider) === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_GEMINI_MODEL;
}

function looksLikeOpenAIModel(model) {
  const name = String(model || "").toLowerCase();
  return name.startsWith("gpt-") || name.startsWith("o1") || name.startsWith("o3") || name.startsWith("chatgpt");
}

function looksLikeGeminiModel(model) {
  return String(model || "").toLowerCase().includes("gemini");
}

function looksLikeRetiredGemini(model) {
  const name = String(model || "").toLowerCase();
  return (
    name.startsWith("gemini-1.") ||
    name.startsWith("gemini-2.") ||
    name === "gemini-pro" ||
    name === "gemini-flash" ||
    name === "gemini-2.5-flash"
  );
}

function resolveModel(provider, model) {
  const kind = normalizeProvider(provider);
  const name = String(model || "").trim();
  if (kind === "gemini" && (!name || looksLikeOpenAIModel(name) || looksLikeRetiredGemini(name))) {
    return DEFAULT_GEMINI_MODEL;
  }
  if (kind === "openai" && (!name || looksLikeGeminiModel(name))) {
    return DEFAULT_OPENAI_MODEL;
  }
  return name || defaultModelFor(kind);
}

function composeSystem(contextText, options = {}) {
  if (options.systemOverride) {
    return [options.systemOverride, contextText].filter(Boolean).join("\n\n");
  }
  return [SYSTEM_PROMPT, paInstructions(), contextText ? `Current briefing:\n${contextText}` : ""]
    .filter(Boolean)
    .join("\n\n");
}

function buildMessages(history, userText, contextText, options = {}) {
  const text = String(userText || "").trim();
  if (!text) {
    throw new Error("Type something first, citizen.");
  }

  const messages = [{ role: "system", content: composeSystem(contextText, options) }];
  const recent = Array.isArray(history) ? history.slice(options.historySlice || -32) : [];
  for (const turn of recent) {
    if (!turn || (turn.role !== "user" && turn.role !== "assistant")) continue;
    const content = String(turn.content || "").trim();
    if (!content) continue;
    messages.push({ role: turn.role, content });
  }
  messages.push({ role: "user", content: text });
  return messages;
}

function buildGeminiContents(history, userText, contextText, options = {}) {
  const messages = buildMessages(history, userText, contextText, options).filter((item) => item.role !== "system");
  return messages.map((item) => ({
    role: item.role === "assistant" ? "model" : "user",
    parts: [{ text: item.content }],
  }));
}

function parseReply(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Gotham went silent. Try again.");
  }
  return content.trim();
}

function parseGeminiReply(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts)
    ? parts.map((part) => part?.text || "").join("").trim()
    : "";
  if (!text) {
    const reason = payload?.candidates?.[0]?.finishReason;
    if (reason && reason !== "STOP") {
      throw new Error(`Gemini stopped (${reason}). Try another question.`);
    }
    throw new Error("Gotham went silent. Try again.");
  }
  return text;
}

function geminiUrl(model) {
  const name = encodeURIComponent(model || DEFAULT_GEMINI_MODEL);
  return `${GEMINI_API_ROOT}/${name}:generateContent`;
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function askOpenAI({ apiKey, model, history, userText, fetchFn, contextText, options }) {
  const response = await fetchFn(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_OPENAI_MODEL,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 700,
      messages: buildMessages(history, userText, contextText, options),
    }),
  });

  const payload = await readJson(response);
  if (!payload) throw new Error("OpenAI returned an unreadable reply.");
  if (!response.ok) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }
  return parseReply(payload);
}

function shouldRetryGemini(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("no longer available") ||
    text.includes("not found") ||
    text.includes("not supported") ||
    text.includes("not available to new users")
  );
}

function isBusyGemini(message) {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("high demand") ||
    text.includes("try again later") ||
    text.includes("resource exhausted") ||
    text.includes("rate limit") ||
    text.includes("unavailable") ||
    text.includes("overloaded")
  );
}

function friendlyGeminiError(error) {
  if (isBusyGemini(error?.message)) {
    return new Error("Gotham's radio is jammed. Gemini is busy — wait a few seconds and ask again.");
  }
  return error;
}

function wait(ms, sleepImpl) {
  const sleep = sleepImpl || ((delay) => new Promise((resolve) => setTimeout(resolve, delay)));
  return sleep(ms);
}

async function askGeminiOnce({ apiKey, model, history, userText, fetchFn, contextText, options }) {
  const response = await fetchFn(geminiUrl(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: composeSystem(contextText, options) }] },
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 700,
      },
      contents: buildGeminiContents(history, userText, contextText, options),
    }),
  });

  const payload = await readJson(response);
  if (!payload) throw new Error("Gemini returned an unreadable reply.");
  if (!response.ok) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }
  return parseGeminiReply(payload);
}

async function askGemini({ apiKey, model, history, userText, fetchFn, sleepImpl, contextText, options }) {
  const models = [model, ...GEMINI_FALLBACKS].filter(
    (name, index, list) => name && list.indexOf(name) === index
  );
  let lastError;
  for (const candidate of models) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await askGeminiOnce({ apiKey, model: candidate, history, userText, fetchFn, contextText, options });
      } catch (error) {
        lastError = error;
        if (isBusyGemini(error.message)) {
          await wait(400 * (attempt + 1), sleepImpl);
          continue;
        }
        if (shouldRetryGemini(error.message)) break;
        throw error;
      }
    }
  }
  throw friendlyGeminiError(lastError || new Error("Gemini has no working model right now."));
}

async function askBatman({ provider, apiKey, model, history, userText, fetchImpl, sleepImpl, contextText, options }) {
  const key = String(apiKey || "").trim();
  const kind = normalizeProvider(provider);
  if (!key) {
    throw new Error(
      kind === "openai"
        ? "Set your OpenAI API key in Settings first."
        : "Set your Gemini API key in Settings first."
    );
  }

  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("This environment cannot reach the chat API.");
  }

  const resolved = resolveModel(kind, model);
  if (kind === "openai") {
    return askOpenAI({ apiKey: key, model: resolved, history, userText, fetchFn, contextText, options });
  }
  return askGemini({ apiKey: key, model: resolved, history, userText, fetchFn, sleepImpl, contextText, options });
}

module.exports = {
  DEFAULT_MODEL: DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PROVIDER,
  GEMINI_FALLBACKS,
  OPENAI_URL,
  composeSystem,
  normalizeProvider,
  defaultModelFor,
  resolveModel,
  buildMessages,
  buildGeminiContents,
  parseReply,
  parseGeminiReply,
  geminiUrl,
  looksLikeOpenAIKey,
  askBatman,
};
