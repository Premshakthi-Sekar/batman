"use strict";

const { spawn } = require("child_process");
const os = require("os");
const path = require("path");

const MAX_HITS = 8;
const SKIP = [
  "/Library/Caches",
  "/Library/Logs",
  "/Library/Cookies",
  "/Library/Keychains",
  "/Library/Mail",
  "/Library/Messages",
  "/Library/Accounts",
  "/Library/IdentityServices",
  "/Library/Application Support/Google",
  "/Library/Application Support/Firefox",
  "/Library/Application Support/BraveSoftware",
  "/Library/Application Support/Chromium",
  "/Library/Application Support/Arc",
  "/Library/Application Support/Microsoft Edge",
  "/Library/Application Support/1Password",
  "/Library/Application Support/Bitwarden",
  "/node_modules/",
  "/.git/",
  "/.Trash",
  "/Trash/",
  "/.ssh/",
  "/.gnupg/",
  "/.aws/",
  "/.kube/",
  "/.docker/",
  "/.npmrc",
  "/.netrc",
  "/.config/gh/",
  "/.password-store",
  "/.local/share/keyrings",
  "/Login Data",
  "/id_rsa",
  "/id_ed25519",
  "/credentials.json",
  "/.env",
];
const WEAK_TOKENS = new Set([
  "this",
  "that",
  "file",
  "files",
  "doc",
  "docs",
  "document",
  "documents",
  "pdf",
  "docx",
  "xlsx",
  "pptx",
  "the",
  "and",
  "for",
]);

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
    .replace(/\b(this|that|the|a|an|on my mac|from my mac|in my mac|in (my )?(downloads?|desktop|documents?))\b/gi, " ")
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
  const full = String(filePath || "").trim().replace(/\\/g, "/");
  if (!full.startsWith(home)) return false;
  const lower = full.toLowerCase();
  return !SKIP.some((part) => lower.includes(part.toLowerCase()));
}

function searchRoots(home) {
  return [
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
    path.join(home, "Library", "CloudStorage"),
    path.join(home, "Library", "Mobile Documents"),
  ];
}

function spotlightNameQuery(needle) {
  const escaped = String(needle || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `kMDItemFSName == "*${escaped}*"c`;
}

function globNeedles(query) {
  const full = sanitizeNeedle(query);
  const out = [];
  const push = (value) => {
    const next = sanitizeNeedle(value).replace(/\*/g, " ").replace(/\s+/g, " ").trim();
    if (next.length >= 2 && !out.includes(next)) out.push(next);
  };
  push(full);
  const parts = full.split(/[\s._-]+/).filter((part) => part.length >= 3 && !WEAK_TOKENS.has(part.toLowerCase()));
  if (parts[0] && parts[0].length >= 4) push(parts[0]);
  return out.slice(0, 3);
}

function findPatterns(query) {
  const patterns = globNeedles(query).map((term) => `*${term}*`);
  const parts = sanitizeNeedle(query)
    .split(/[\s._-]+/)
    .filter((part) => part.length >= 3 && !WEAK_TOKENS.has(part.toLowerCase()));
  if (parts.length >= 2) patterns.push(`*${parts.join("*")}*`);
  return [...new Set(patterns)].slice(0, 4);
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

function uniqHits(hits, home) {
  const unique = [];
  const seen = new Set();
  for (const item of hits) {
    if (!keepPath(item, home) || seen.has(item)) continue;
    seen.add(item);
    unique.push(item);
    if (unique.length >= MAX_HITS) break;
  }
  return unique;
}

async function searchHome(query, opts = {}) {
  const needle = sanitizeNeedle(query);
  const home = opts.home || os.homedir();
  const spawnImpl = opts.spawn;
  if (!needle) return { query: needle, hits: [] };

  const roots = searchRoots(home);
  const needles = globNeedles(needle);
  const patterns = findPatterns(needle);

  for (const term of needles) {
    const nameQuery = spotlightNameQuery(term);
    const spotlightHome = await runCommand("mdfind", ["-onlyin", home, nameQuery], spawnImpl, 5000);
    let hits = uniqHits(parseLines(spotlightHome), home);
    if (hits.length) return { query: needle, hits };

    const downloads = roots[0];
    const spotlightDownloads = await runCommand("mdfind", ["-onlyin", downloads, nameQuery], spawnImpl, 4000);
    hits = uniqHits(parseLines(spotlightDownloads), home);
    if (hits.length) return { query: needle, hits };
  }

  for (const pattern of patterns) {
    const fromDownloads = await runCommand("find", [...roots, "-maxdepth", "8", "-iname", pattern], spawnImpl, 8000);
    let hits = uniqHits(parseLines(fromDownloads), home);
    if (hits.length) return { query: needle, hits };

    const fromHome = await runCommand(
      "find",
      [
        home,
        "-maxdepth",
        "8",
        "(",
        "-name",
        "node_modules",
        "-o",
        "-name",
        ".git",
        "-o",
        "-name",
        ".Trash",
        "-o",
        "-path",
        path.join(home, "Library"),
        ")",
        "-prune",
        "-o",
        "-iname",
        pattern,
        "-print",
      ],
      spawnImpl,
      10000
    );
    hits = uniqHits(parseLines(fromHome), home);
    if (hits.length) return { query: needle, hits };
  }

  return { query: needle, hits: [] };
}

function formatFindSpoken(result) {
  const query = result?.query || "";
  const hits = result?.hits || [];
  if (!hits.length) {
    return `No hits for "${query}" in Downloads, Desktop, Documents, or the rest of your home folder. If the name is longer, paste the full file name including the extension.`;
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
    return `FILE SEARCH GROUND TRUTH: no files named like "${query}" under Downloads, Desktop, Documents, or the home folder. Do not invent a path.`;
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
  searchRoots,
  globNeedles,
  findPatterns,
  searchHome,
  formatFindSpoken,
  formatFindGround,
};
