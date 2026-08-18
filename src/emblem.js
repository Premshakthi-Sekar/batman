"use strict";

const fs = require("fs");
const path = require("path");

const MARK = path.join(__dirname, "renderer", "batman-mark.svg");

function emblemSvgMarkup() {
  return fs.readFileSync(MARK, "utf8");
}

module.exports = {
  MARK_PATH: MARK,
  emblemSvgMarkup,
};
