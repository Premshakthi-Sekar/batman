"use strict";

const fs = require("fs");
const path = require("path");

function loadStore(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function saveStore(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
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

module.exports = { loadStore, saveStore, createStore };
