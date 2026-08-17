"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { eyeOrigin, beamTarget, beamLayout } = require("../src/beam");

test("right-facing beam starts at the right eye and hits the right edge", () => {
  const origin = eyeOrigin(100, 200, 1);
  assert.equal(origin.x, 155);
  assert.equal(origin.y, 229);
  const to = beamTarget(origin, 1, { x: 0, y: 0, width: 1440, height: 900 });
  assert.equal(to.x, 1440);
  assert.equal(to.y, 229);
});

test("left-facing beam starts at the flipped eye and hits the left edge", () => {
  const origin = eyeOrigin(100, 200, -1);
  assert.equal(origin.x, 141);
  const to = beamTarget(origin, -1, { x: 0, y: 0, width: 1440, height: 900 });
  assert.equal(to.x, 0);
});

test("beamLayout is relative to the overlay origin", () => {
  const layout = beamLayout(100, 50, 1, { x: 100, y: 0, width: 800, height: 600 });
  assert.equal(layout.fromX, 55);
  assert.ok(layout.length > 0);
});
