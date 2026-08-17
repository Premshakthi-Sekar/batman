"use strict";

const { spawn } = require("child_process");
const os = require("os");

const MAX_HITS = 8;
const SKIP = [
  "/Library/Caches",
  "/Library/Logs",
  "/Library/Application Support/Google",
  "/node_modules/",
  "/.git/",
  "/.Trash",
  "/Trash/",
];

function looksLikeFindRequest(text) {
  const raw = String(text || "").trim();
  if (!raw) return false;
  if (/^\s*remind me\b/i.test(raw)) return false;
  return /\b(find me|find the|find my|find this|where is|where's|locate|search for|search my (mac|computer|machine))\b/i.test(
    raw
  );
}

function extractFindQuery(text) {
  if (!looksLikeFindRequest(text)) return null;
  const query = String(text || "")
    .replace(/^(batman|hey batman)[,:]?\s*/i, "")
    .replace(/\b(can you|could you|please|pls|just|for me)\b/gi, " ")
    .replace(/\b(find me|find the|find my|find this|find)\b/gi, " ")
    .replace(/\b(where is|where's|locate|search (my )?(mac|computer|machine|files?)?\s*(for)?)\b/gi, " ")
    .replace(/\b(this|that|the|a|an|on my mac|from my mac|in my mac)\b/gi, " ")
    .replace(/\b(docs?|documents?|files?)\b/gi, " ")
    .replace(/[?!.]+$/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!query || query.length < 2) return null;
  if (/^(it|them|here|there|stuff)$/i.test(query)) return null;
  return query.slice(0, 80);
}

function sanitizeNeedle(query) {
  return String(query || "")
    .replace(/['"\\;*?\[\]{}()$`|&<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function keepPath(filePath, home) {
  const full = String(filePath || "").trim();
  if (!full.startsWith(home)) return false;
  return !SKIP.some((part) => full.includes(part));
}

function runCommand(cmd, args, spawnImpl, timeoutMs = 8000) {
  const spawnFn = spawnImpl || spawn;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawnFn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      resolve("");
      return;
    }
    let out = "";
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      out += String(chunk);
      if (out.length > 250000) {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }
    });
    child.on("error", () => {
      clearTimeout(timer);
      resolve("");
    });
    child.on("close", () => {
      clearTimeout(timer);
      resolve(out);
    });
  });
}

function parseLines(raw) {
  return String(raw || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function searchHome(query, opts = {}) {
  const needle = sanitizeNeedle(query);
  const home = opts.home || os.homedir();
  const spawnImpl = opts.spawn;
  if (!needle) return { query: needle, hits: [] };

  let hits = [];
  const spotlight = await runCommand("mdfind", ["-onlyin", home, needle], spawnImpl);
  hits = parseLines(spotlight).filter((item) => keepPath(item, home));

  if (!hits.length) {
    const fromFind = await runCommand(
      "find",
      [home, "-maxdepth", "5", "-iname", `*${needle}*`],
      spawnImpl
    );
    hits = parseLines(fromFind).filter((item) => keepPath(item, home));
  }

  const unique = [];
  const seen = new Set();
  for (const item of hits) {
    if (seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
    if (unique.length >= MAX_HITS) break;
  }
  return { query: needle, hits: unique };
}

function formatFindSpoken(result) {
  const query = result?.query || "";
  const hits = result?.hits || [];
  if (!hits.length) {
    return `No hits in your home folder for "${query}". Try a file name, like invoice.pdf.`;
  }
  if (hits.length === 1) {
    return `Found it.\n${hits[0]}`;
  }
  return [`Found ${hits.length} locations for "${query}":`, ...hits.map((item, i) => `${i + 1}. ${item}`)].join("\n");
}

function formatFindGround(result) {
  const query = result?.query || "";
  const hits = result?.hits || [];
  if (!hits.length) {
    return `FILE SEARCH GROUND TRUTH: no files named like "${query}" under the home folder. Do not invent a path.`;
  }
  return [
    "FILE SEARCH GROUND TRUTH: quote these exact paths. Do not invent others.",
    ...hits.map((item) => item),
  ].join("\n");
}

module.exports = {
  MAX_HITS,
  looksLikeFindRequest,
  extractFindQuery,
  sanitizeNeedle,
  keepPath,
  searchHome,
  formatFindSpoken,
  formatFindGround,
};
