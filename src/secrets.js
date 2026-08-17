"use strict";

const SECRET_KEYS = ["openaiKey", "geminiKey", "apiKey"];

function loadSafeStorage() {
  try {
    if (!process.versions.electron) return null;
    const { safeStorage } = require("electron");
    return safeStorage && typeof safeStorage.encryptString === "function" ? safeStorage : null;
  } catch {
    return null;
  }
}

function isEnvelope(value) {
  return Boolean(value && typeof value === "object" && typeof value.stored === "string" && "value" in value);
}

function wrapSecret(plain, safeStorage = loadSafeStorage()) {
  const text = String(plain || "");
  if (!text) return "";
  if (isEnvelope(plain)) return plain;
  if (safeStorage && typeof safeStorage.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable()) {
    try {
      const blob = safeStorage.encryptString(text);
      return { stored: "safeStorage", value: Buffer.from(blob).toString("base64") };
    } catch {
      // Fall through to plaintext rather than drop the key.
    }
  }
  return { stored: "plaintext", value: text };
}

function unwrapSecret(stored, safeStorage = loadSafeStorage()) {
  if (stored == null || stored === "") return "";
  if (typeof stored === "string") return stored;
  if (!isEnvelope(stored)) return "";
  if (stored.stored === "plaintext") return String(stored.value || "");
  if (stored.stored === "safeStorage") {
    if (!safeStorage || typeof safeStorage.decryptString !== "function") return "";
    try {
      return safeStorage.decryptString(Buffer.from(String(stored.value || ""), "base64"));
    } catch {
      return "";
    }
  }
  return "";
}

function migrateStoreSecrets(store, safeStorage = loadSafeStorage()) {
  if (!store) return { migrated: 0, encrypted: false };
  let migrated = 0;
  const encrypted = Boolean(
    safeStorage && typeof safeStorage.isEncryptionAvailable === "function" && safeStorage.isEncryptionAvailable()
  );
  for (const key of SECRET_KEYS) {
    const raw = store.get(key);
    const plain = unwrapSecret(raw, safeStorage);
    if (!plain) continue;
    const wrapped = wrapSecret(plain, safeStorage);
    if (JSON.stringify(wrapped) !== JSON.stringify(raw)) {
      store.set(key, wrapped);
      migrated += 1;
    }
  }
  return { migrated, encrypted };
}

module.exports = {
  SECRET_KEYS,
  loadSafeStorage,
  isEnvelope,
  wrapSecret,
  unwrapSecret,
  migrateStoreSecrets,
};
