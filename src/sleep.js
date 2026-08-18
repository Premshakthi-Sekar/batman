"use strict";

const HOUR_MS = 60 * 60 * 1000;

function sleepUntil(hours, now = Date.now()) {
  const n = Number(hours);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Sleep duration must be a positive number of hours");
  }
  return now + n * HOUR_MS;
}

function remainingMs(wakeAt, now = Date.now()) {
  if (!wakeAt) return 0;
  return Math.max(0, Number(wakeAt) - now);
}

function isAsleep(wakeAt, now = Date.now()) {
  return remainingMs(wakeAt, now) > 0;
}

function formatRemaining(wakeAt, now = Date.now()) {
  const ms = remainingMs(wakeAt, now);
  if (ms <= 0) return "awake";
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

module.exports = {
  HOUR_MS,
  sleepUntil,
  remainingMs,
  isAsleep,
  formatRemaining,
};
