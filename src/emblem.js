"use strict";

/** Classic bat silhouette: pointed ears, long wingtips, scalloped lower wings. */
const BAT_VIEWBOX = "0 0 512 256";
const BAT_PATH = [
  "M256 6",
  "L278 0 286 42",
  "L328 10 316 56",
  "L418 22 506 92 412 86",
  "L500 128 400 120",
  "L486 196 352 154",
  "L392 250 300 188",
  "L256 226",
  "L212 188 120 250",
  "L160 154 26 196",
  "L112 120 12 128",
  "L100 86 6 92 94 22",
  "L196 56 184 10",
  "L226 42 234 0 Z",
].join(" ");

function batSvgMarkup(className = "bat-mark") {
  return `<svg class="${className}" viewBox="${BAT_VIEWBOX}" aria-hidden="true" focusable="false"><path d="${BAT_PATH}"/></svg>`;
}

module.exports = { BAT_VIEWBOX, BAT_PATH, batSvgMarkup };
