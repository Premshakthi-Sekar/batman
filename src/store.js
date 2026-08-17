"use strict";

const fs = require("fs");
const path = require("path");

function tryReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

function backupPath(filePath) {
  return `${filePath}.bak`;
}

function loadStore(filePath) {
  return tryReadJson(filePath) || tryReadJson(backupPath(filePath)) || {};
}

function saveStore(filePath, data) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  const tmp = `${filePath}.${process.pid}.tmp`;
  const fd = fs.openSync(tmp, "w");
  try {
    fs.writeFileSync(fd, payload, "utf8");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, filePath);
  try {
    fs.copyFileSync(filePath, backupPath(filePath));
  } catch {
    // Backup is best-effort; the atomic rename already landed.
  }
}

function createStore(filePath) {
  let cache = loadStore(filePath);

  return {
    get(key, fallback) {
      return Object.prototype.hasOwnProperty.call(cache, key) ? cache[key] : fallback;
    },
    set(key, value) {
      cache = { ...cache, [key]: value };
      saveStore(filePath, cache);
    },
    all() {
      return { ...cache };
    },
  };
}

module.exports = { loadStore, saveStore, createStore, backupPath };
