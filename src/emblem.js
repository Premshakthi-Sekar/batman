"use strict";

/** 1989-style oval emblem: yellow field, black border, scalloped bat, center spike. */
const BAT_VIEWBOX = "0 0 1000 500";
const BAT_PATH =
  "M40 248C90 90 240 48 390 128L430 48 448 134C468 126 484 110 500 110C516 110 532 126 552 134L570 48 610 128C760 48 910 90 960 248C900 268 820 274 745 264C880 330 910 420 830 455C760 400 700 395 655 410C640 455 600 470 555 442L500 468L445 442C400 470 360 455 345 410C300 395 240 400 170 455C90 420 120 330 255 264C180 274 100 268 40 248Z";

function emblemSvgMarkup(className = "batman-mark") {
  return [
    `<svg class="${className}" viewBox="${BAT_VIEWBOX}" aria-hidden="true" focusable="false">`,
    '<ellipse cx="500" cy="250" rx="494" ry="244" fill="#FFD200" stroke="#000" stroke-width="12"/>',
    `<path fill="#000" d="${BAT_PATH}"/>`,
    "</svg>",
  ].join("");
}

function batSvgMarkup(className = "bat-mark") {
  return emblemSvgMarkup(className);
}

module.exports = { BAT_VIEWBOX, BAT_PATH, emblemSvgMarkup, batSvgMarkup };
