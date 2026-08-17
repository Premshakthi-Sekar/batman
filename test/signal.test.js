"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SIGNAL_MS } = require("../src/signal");
const { BAT_PATH, BAT_VIEWBOX, batSvgMarkup } = require("../src/emblem");

test("bat-signal holds long enough to read the emblem", () => {
  assert.ok(SIGNAL_MS >= 2000);
});

test("classic bat path is a filled silhouette", () => {
  assert.match(BAT_VIEWBOX, /512/);
  assert.match(BAT_PATH, /^M256 /);
  assert.match(batSvgMarkup(), /<path d="M256/);
});
