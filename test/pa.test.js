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

test("captureFromUserText keeps mrng 11am as one tomorrow call", () => {
  const actions = captureFromUserText("i have a call with Demi tmrw mrng 11 AM");
  assert.equal(actions.addTomorrow.length, 1);
  assert.equal(actions.addTomorrow[0].time, "11:00");
  assert.match(actions.addTomorrow[0].text, /demi/i);
  assert.equal(actions.addToday.length, 0);
});

test("complaints about duplicates do not create new tasks", () => {
  assert.equal(
    captureFromUserText("there are 2 call with demi kinda things.. take off the duplicate pls").addTomorrow.length,
    0
  );
  assert.equal(captureFromUserText("there are 2 call with demi kinda things.. take off the duplicate pls").removeDuplicates, true);
  assert.equal(captureFromUserText("u did not delete the duplicates.. u added another thing in the reminder").removeDuplicates, true);
  assert.equal(captureFromUserText("u did not clear the duplicates").removeDuplicates, true);
});

test("applyPaActions collapses Demi duplicates and drops instruction junk", () => {
  const now = new Date("2026-08-17T21:00:00");
  const messy = [
    { id: "1", text: "call with Demi mrng", time: "11:00", forDate: "2026-08-18", done: false, createdAt: now.toISOString() },
    { id: "2", text: "Call with Demi", time: null, forDate: "2026-08-17", done: false, createdAt: now.toISOString() },
    { id: "3", text: "Just the essentials, like my utility belt", time: null, forDate: "2026-08-17", done: false, createdAt: now.toISOString() },
    { id: "4", text: "Updating now", time: null, forDate: "2026-08-17", done: false, createdAt: now.toISOString() },
  ];
  const next = applyPaActions(
    { tasks: messy, facts: [] },
    {
      addToday: ["I will ensure only one entry remains"],
      addTomorrow: [],
      done: [],
      remember: [],
      update: [],
      removeDuplicates: true,
    },
    now
  );
  const open = next.tasks.filter((item) => !item.done);
  assert.equal(open.length, 1);
  assert.match(open[0].text, /demi/i);
  assert.equal(open[0].time, "11:00");
  assert.equal(open[0].forDate, "2026-08-18");
});

test("repeat Demi chat does not create a second task", () => {
  const now = new Date("2026-08-17T21:00:00");
  let state = applyPaActions({ tasks: [], facts: [] }, captureFromUserText("i have a call with Demi tmrw mrng 11 AM"), now);
  state = applyPaActions(state, captureFromUserText("i have a call with Demi tmrw 11 AM"), now);
  assert.equal(state.tasks.filter((item) => !item.done).length, 1);
});

test("add a reminder tmrw to run leads is a separate tomorrow task", () => {
  const now = new Date("2026-08-17T21:00:00");
  const phrase = "add a reminder tmrw to run a fresh leads for demi before call";
  const actions = captureFromUserText(phrase);
  assert.equal(actions.addTomorrow.length, 1);
  assert.match(actions.addTomorrow[0].text, /leads/i);
  assert.match(actions.addTomorrow[0].text, /demi/i);
  let state = applyPaActions(
    { tasks: [], facts: [] },
    captureFromUserText("i have a call with Demi tmrw 11 AM"),
    now
  );
  state = applyPaActions(state, actions, now);
  assert.equal(state.tasks.filter((item) => !item.done).length, 2);
});

test("did u add replays the last real task from history", () => {
  const now = new Date("2026-08-17T21:00:00");
  const history = [{ role: "user", content: "add a reminder tmrw to run a fresh leads for demi before call" }];
  const actions = captureFromUserText("did u add?", now, history);
  assert.equal(actions.addTomorrow.length, 1);
  assert.match(actions.addTomorrow[0].text, /leads/i);
});

test("model filler JSON still salvages the leads task", () => {
  const now = new Date("2026-08-17T21:00:00");
  const next = applyPaActions(
    { tasks: [], facts: [] },
    {
      addTomorrow: ["I will add the reminder to run fresh leads for Demi before your call tomorrow"],
      addToday: [],
      done: [],
      remember: [],
      update: [],
    },
    now
  );
  assert.equal(next.tasks.length, 1);
  assert.match(next.tasks[0].text, /leads/i);
});
