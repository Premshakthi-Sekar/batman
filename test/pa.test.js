"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  dateKey,
  tomorrowKey,
  addTasks,
  markDone,
  toggleTask,
  dueReminderSlots,
  recordFired,
  extractPaBlock,
  applyPaActions,
  reminderBody,
  captureFromUserText,
  parseClock,
  updateTasks,
} = require("../src/pa");

test("tomorrowKey is the next calendar day", () => {
  const now = new Date("2026-08-17T22:00:00");
  assert.equal(dateKey(now), "2026-08-17");
  assert.equal(tomorrowKey(now), "2026-08-18");
});

test("addTasks stores tomorrow items without duplicates", () => {
  let tasks = addTasks([], ["Ship PA", "Call client"], "2026-08-18", new Date("2026-08-17T21:00:00"));
  tasks = addTasks(tasks, ["ship pa"], "2026-08-18", new Date("2026-08-17T21:01:00"));
  assert.equal(tasks.length, 2);
});

test("markDone matches a phrase inside the task text", () => {
  const tasks = addTasks([], ["Send invoice to Acme"], "2026-08-18", new Date("2026-08-17T21:00:00"));
  const next = markDone(tasks, ["invoice"]);
  assert.equal(next[0].done, true);
});

test("dueReminderSlots fires each clock time once", () => {
  const now = new Date("2026-08-18T12:05:00");
  const due = dueReminderSlots(now, ["09:00", "12:00", "16:00", "21:00"], {}, true);
  assert.deepEqual(due, ["09:00", "12:00"]);
  const fired = recordFired({}, "2026-08-18", due);
  const later = dueReminderSlots(now, ["09:00", "12:00", "16:00", "21:00"], fired, true);
  assert.deepEqual(later, []);
});

test("extractPaBlock hides the machine JSON from the user", () => {
  const { visible, actions } = extractPaBlock(
    'Noted. I will remind you tomorrow.\n<<PA>>{"addTomorrow":["Gym"],"addToday":[],"done":[],"remember":[]}<<ENDPA>>'
  );
  assert.equal(visible, "Noted. I will remind you tomorrow.");
  assert.deepEqual(actions.addTomorrow, ["Gym"]);
});

test("applyPaActions writes tomorrow tasks and facts", () => {
  const now = new Date("2026-08-17T21:30:00");
  const next = applyPaActions(
    { tasks: [], facts: [] },
    { addTomorrow: ["Read plan"], addToday: [], done: [], remember: ["Standup is 10am"] },
    now
  );
  assert.equal(next.tasks[0].forDate, "2026-08-18");
  assert.deepEqual(next.facts, ["Standup is 10am"]);
});

test("reminderBody is silent when the day is clear", () => {
  assert.equal(reminderBody([], new Date("2026-08-18T09:00:00")), null);
});

test("parseClock understands 11am", () => {
  assert.equal(parseClock("tmrw 11 am"), "11:00");
  assert.equal(parseClock("2pm"), "14:00");
});

test("captureFromUserText files a tomorrow call from chat", () => {
  const now = new Date("2026-08-17T21:00:00");
  const actions = captureFromUserText("i have a call with demi tmrw 11 am", now);
  assert.equal(actions.addTomorrow[0].time, "11:00");
  assert.match(actions.addTomorrow[0].text, /demi/i);
});

test("captureFromUserText marks done and reschedules", () => {
  const done = captureFromUserText("done with the demi call");
  assert.ok(done.done.some((item) => /demi/i.test(item)));
  const moved = captureFromUserText("move the demi call to 2pm");
  assert.equal(moved.update[0].time, "14:00");
  const vague = captureFromUserText("change that meeting's time to 3pm");
  assert.equal(vague.update[0].time, "15:00");
});

test("updateTasks changes the meeting time", () => {
  const now = new Date("2026-08-17T21:00:00");
  let tasks = addTasks([], [{ text: "Call with Demi", time: "11:00" }], "2026-08-18", now);
  tasks = updateTasks(tasks, [{ match: "demi", time: "14:00" }], now);
  assert.equal(tasks[0].time, "14:00");
  tasks = updateTasks(tasks, [{ match: "that meeting", time: "15:00" }], now);
  assert.equal(tasks[0].time, "15:00");
});

test("toggleTask flips done", () => {
  const tasks = addTasks([], ["Write"], "2026-08-18", new Date("2026-08-17T21:00:00"));
  const next = toggleTask(tasks, tasks[0].id);
  assert.equal(next[0].done, true);
});
