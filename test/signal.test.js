"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { SIGNAL_MS } = require("../src/signal");
const { emblemSvgMarkup } = require("../src/emblem");

test("bat-signal holds long enough for beam then emblem", () => {
  assert.ok(SIGNAL_MS >= 3200);
});

test("emblem is the yellow oval with the Batman-curve silhouette", () => {
  const svg = emblemSvgMarkup();
  assert.match(svg, /#FFD200/);
  assert.match(svg, /<ellipse/);
  assert.match(svg, /<polygon/);
  assert.ok((svg.match(/,/g) || []).length > 500);
});
