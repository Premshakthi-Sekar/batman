"use strict";

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const DEFAULT_PROVIDER = "gemini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GEMINI_API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_PROMPT = [
  "You are a tiny Batman who lives on the user's desktop.",
  "You are the Dark Knight, but pocket-sized: dry, deadpan, a little dramatic, and actually helpful.",
  "Keep answers short unless the user asks for detail. A few sentences is usually enough.",
  "You may reference Gotham, gadgets, and patrols, but still answer the real question.",
  "Never claim you can physically control the user's computer beyond this companion app.",
].join(" ");

function normalizeProvider(provider) {
  return String(provider || DEFAULT_PROVIDER).toLowerCase() === "openai" ? "openai" : "gemini";
}

function defaultModelFor(provider) {
  return normalizeProvider(provider) === "openai" ? DEFAULT_OPENAI_MODEL : DEFAULT_GEMINI_MODEL;
}

function buildMessages(history, userText) {
  const text = String(userText || "").trim();
  if (!text) {
    throw new Error("Type something first, citizen.");
  }

  const messages = [{ role: "system", content: SYSTEM_PROMPT }];
  const recent = Array.isArray(history) ? history.slice(-16) : [];
  for (const turn of recent) {
    if (!turn || (turn.role !== "user" && turn.role !== "assistant")) continue;
    const content = String(turn.content || "").trim();
    if (!content) continue;
    messages.push({ role: turn.role, content });
  }
  messages.push({ role: "user", content: text });
  return messages;
}

function buildGeminiContents(history, userText) {
  const messages = buildMessages(history, userText).filter((item) => item.role !== "system");
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

async function askOpenAI({ apiKey, model, history, userText, fetchFn }) {
  const response = await fetchFn(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_OPENAI_MODEL,
      temperature: 0.7,
      max_tokens: 500,
      messages: buildMessages(history, userText),
    }),
  });

  const payload = await readJson(response);
  if (!payload) throw new Error("OpenAI returned an unreadable reply.");
  if (!response.ok) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }
  return parseReply(payload);
}

async function askGemini({ apiKey, model, history, userText, fetchFn }) {
  const response = await fetchFn(geminiUrl(model), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      contents: buildGeminiContents(history, userText),
    }),
  });

  const payload = await readJson(response);
  if (!payload) throw new Error("Gemini returned an unreadable reply.");
  if (!response.ok) {
    throw new Error(payload?.error?.message || `HTTP ${response.status}`);
  }
  return parseGeminiReply(payload);
}

async function askBatman({ provider, apiKey, model, history, userText, fetchImpl }) {
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

  if (kind === "openai") {
    return askOpenAI({ apiKey: key, model, history, userText, fetchFn });
  }
  return askGemini({ apiKey: key, model, history, userText, fetchFn });
}

module.exports = {
  DEFAULT_MODEL: DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_PROVIDER,
  OPENAI_URL,
  SYSTEM_PROMPT,
  normalizeProvider,
  defaultModelFor,
  buildMessages,
  buildGeminiContents,
  parseReply,
  parseGeminiReply,
  geminiUrl,
  askBatman,
};
