"use strict";

const BEAM_MS = 1100;

function eyeOrigin(petX, petY, facing) {
  const y = petY + 29;
  const x = petX + (facing < 0 ? 41 : 55);
  return { x, y };
}

function beamTarget(origin, facing, area) {
  const y = origin.y;
  const x = facing < 0 ? area.x : area.x + area.width;
  return { x, y };
}

function beamLayout(petX, petY, facing, area) {
  const from = eyeOrigin(petX, petY, facing);
  const to = beamTarget(from, facing, area);
  return {
    fromX: from.x - area.x,
    fromY: from.y - area.y,
    toX: to.x - area.x,
    toY: to.y - area.y,
    length: Math.hypot(to.x - from.x, to.y - from.y),
    angle: Math.atan2(to.y - from.y, to.x - from.x),
  };
}

module.exports = { BEAM_MS, eyeOrigin, beamTarget, beamLayout };
