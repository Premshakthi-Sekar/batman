"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const EventEmitter = require("node:events");
const {
  extractFindQuery,
  looksLikeFindRequest,
  keepPath,
  searchHome,
  formatFindSpoken,
} = require("../src/finder");
const { decideTurn } = require("../src/intent");

test("find me this doc pulls the file name", () => {
  assert.equal(extractFindQuery("find me this doc invoice.pdf"), "invoice.pdf");
  assert.equal(extractFindQuery("where is tax return"), "tax return");
  assert.equal(extractFindQuery("find me this doc"), null);
  assert.equal(
    extractFindQuery("KOYO_MU_Tech_Object_Centric_Addendum_Mar find this"),
    "KOYO_MU_Tech_Object_Centric_Addendum_Mar"
  );
  assert.equal(looksLikeFindRequest("remind me to drink water"), false);
});

test("decideTurn routes a find request", () => {
  const decision = decideTurn({
    userText: "find me the offer letter",
    tasks: [],
    history: [],
    llmIntent: { action: "chat" },
    pending: null,
    now: new Date(),
  });
  assert.equal(decision.findQuery, "offer letter");
});

test("searchHome uses Spotlight paths and reports the exact location", async () => {
  const home = "/Users/prem";
  const spawn = (cmd, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      if (cmd === "mdfind") {
        child.stdout.emit("data", `${home}/Documents/offer-letter.pdf\n${home}/Library/Caches/junk.pdf\n`);
      }
      child.emit("close", 0);
    });
    return child;
  };
  const result = await searchHome("offer letter", { home, spawn });
  assert.deepEqual(result.hits, [`${home}/Documents/offer-letter.pdf`]);
  assert.match(formatFindSpoken(result), /\/Users\/prem\/Documents\/offer-letter\.pdf/);
});

test("empty Spotlight still finds an underscore name in Downloads", async () => {
  const home = "/Users/prem";
  const target = `${home}/Downloads/KOYO_MU_Tech_Object_Centric_Addendum_March.pdf`;
  const spawn = (cmd, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      if (cmd === "find" && args.includes(`${home}/Downloads`) && args.some((arg) => String(arg).includes("KOYO"))) {
        child.stdout.emit("data", `${target}\n`);
      }
      child.emit("close", 0);
    });
    return child;
  };
  const result = await searchHome("KOYO_MU_Tech_Object_Centric_Addendum_Mar", { home, spawn });
  assert.deepEqual(result.hits, [target]);
  assert.match(formatFindSpoken(result), /Downloads/);
});

test("keepPath hides ssh, env, and browser profile files", () => {
  const home = "/Users/prem";
  assert.equal(keepPath(`${home}/Downloads/offer.pdf`, home), true);
  assert.equal(keepPath(`${home}/.ssh/id_rsa`, home), false);
  assert.equal(keepPath(`${home}/proj/.env`, home), false);
  assert.equal(
    keepPath(`${home}/Library/Application Support/Google/Chrome/Default/Login Data`, home),
    false
  );
  assert.equal(keepPath(`${home}/Library/Keychains/login.keychain-db`, home), false);
});
