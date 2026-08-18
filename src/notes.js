"use strict";

const MAX_NOTES = 40;

function newNote(text = "", now = new Date()) {
  return {
    id: `${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
    text: String(text || ""),
    updatedAt: now.toISOString(),
  };
}

function listNotes(notes) {
  return (Array.isArray(notes) ? notes : [])
    .filter((item) => item && item.id)
    .map((item) => ({
      id: String(item.id),
      text: String(item.text || ""),
      updatedAt: item.updatedAt || new Date().toISOString(),
    }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .slice(0, MAX_NOTES);
}

function addNote(notes, text = "", now = new Date()) {
  return listNotes([newNote(text, now), ...listNotes(notes)]);
}

function updateNote(notes, id, text, now = new Date()) {
  const needle = String(id || "");
  let found = false;
  const next = listNotes(notes).map((item) => {
    if (item.id !== needle) return item;
    found = true;
    return { ...item, text: String(text || ""), updatedAt: now.toISOString() };
  });
  return found ? listNotes(next) : listNotes(notes);
}

function removeNote(notes, id) {
  const needle = String(id || "");
  return listNotes(notes).filter((item) => item.id !== needle);
}

module.exports = { MAX_NOTES, newNote, listNotes, addNote, updateNote, removeNote };
