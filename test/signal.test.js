"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SIGNAL_MS } = require("../src/signal");
const { BAT_PATH, BAT_VIEWBOX, emblemSvgMarkup } = require("../src/emblem");

test("bat-signal holds long enough to read the emblem", () => {
  assert.ok(SIGNAL_MS >= 2000);
});

test("classic emblem is the 1989 oval and scalloped bat", () => {
  assert.match(BAT_VIEWBOX, /1000 500/);
  assert.match(BAT_PATH, /^M40 248/);
  const svg = emblemSvgMarkup();
  assert.match(svg, /#FFD200/);
  assert.match(svg, /<ellipse/);
  assert.ok(svg.includes(BAT_PATH));
});
