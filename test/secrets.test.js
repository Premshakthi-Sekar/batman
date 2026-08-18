"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { wrapSecret, unwrapSecret, migrateStoreSecrets, isEnvelope } = require("../src/secrets");

function fakeSafeStorage() {
  return {
    isEncryptionAvailable() {
      return true;
    },
    encryptString(text) {
      return Buffer.from(`enc:${text}`, "utf8");
    },
    decryptString(buffer) {
      const raw = Buffer.from(buffer).toString("utf8");
      return raw.replace(/^enc:/, "");
    },
  };
}

test("wrapSecret uses safeStorage when encryption is available", () => {
  const wrapped = wrapSecret("sk-secret", fakeSafeStorage());
  assert.equal(isEnvelope(wrapped), true);
  assert.equal(wrapped.stored, "safeStorage");
  assert.notEqual(wrapped.value, "sk-secret");
  assert.equal(unwrapSecret(wrapped, fakeSafeStorage()), "sk-secret");
});

test("unwrapSecret still reads legacy plaintext keys", () => {
  assert.equal(unwrapSecret("sk-legacy", fakeSafeStorage()), "sk-legacy");
});

test("migrateStoreSecrets encrypts a plaintext key in place", () => {
  const cache = { openaiKey: "sk-plain" };
  const store = {
    get(key) {
      return cache[key];
    },
    set(key, value) {
      cache[key] = value;
    },
  };
  const result = migrateStoreSecrets(store, fakeSafeStorage());
  assert.equal(result.migrated, 1);
  assert.equal(result.encrypted, true);
  assert.equal(cache.openaiKey.stored, "safeStorage");
  assert.equal(unwrapSecret(cache.openaiKey, fakeSafeStorage()), "sk-plain");
});
