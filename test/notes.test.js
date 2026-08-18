"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { addNote, updateNote, removeNote, listNotes } = require("../src/notes");

test("addNote puts a blank sticky on top", () => {
  const now = new Date("2026-08-18T16:00:00Z");
  const notes = addNote([], "", now);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].text, "");
  assert.ok(notes[0].id);
});

test("updateNote rewrites the sticky text", () => {
  const now = new Date("2026-08-18T16:00:00Z");
  const notes = addNote([], "wifi password", now);
  const next = updateNote(notes, notes[0].id, "wifi: gotham-guest", now);
  assert.equal(next[0].text, "wifi: gotham-guest");
});

test("removeNote takes a sticky off the pad", () => {
  let notes = addNote([], "keep");
  notes = addNote(notes, "drop");
  const gone = removeNote(notes, notes[0].id);
  assert.equal(gone.length, 1);
  assert.equal(listNotes(gone)[0].text, "keep");
});
