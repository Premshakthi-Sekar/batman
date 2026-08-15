"use strict";

const DEFAULT_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You are a tiny Batman who lives on the user's desktop.",
  "You are the Dark Knight, but pocket-sized: dry, deadpan, a little dramatic, and actually helpful.",
  "Keep answers short unless the user asks for detail. A few sentences is usually enough.",
  "You may reference Gotham, gadgets, and patrols, but still answer the real question.",
  "Never claim you can physically control the user's computer beyond this companion app.",
].join(" ");

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

function parseReply(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Gotham went silent. Try again.");
  }
  return content.trim();
}

async function askBatman({ apiKey, model, history, userText, fetchImpl }) {
  const key = String(apiKey || "").trim();
  if (!key) {
    throw new Error("Set your OpenAI API key in Settings first.");
  }

  const fetchFn = fetchImpl || globalThis.fetch;
  if (typeof fetchFn !== "function") {
    throw new Error("This environment cannot reach OpenAI.");
  }

  const response = await fetchFn(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      temperature: 0.7,
      max_tokens: 500,
      messages: buildMessages(history, userText),
    }),
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("OpenAI returned an unreadable reply.");
  }

  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return parseReply(payload);
}

module.exports = {
  DEFAULT_MODEL,
  OPENAI_URL,
  SYSTEM_PROMPT,
  buildMessages,
  parseReply,
  askBatman,
};
