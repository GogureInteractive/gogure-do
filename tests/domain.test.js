// Unit tests for the pure domain logic (run with: npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMentions, makeEntity, editEntity, toggleComplete, todayStats,
  sortEntities, validEmail, normalizeName, involvedPeople, allInvolved,
  mentionedNotInvited, statsForDay, weekStats, totalFocusMinutes,
  countOpen, todayISO,
} from "../src/js/domain.js";

const iso = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0).toISOString();

test("parseMentions finds unique names, ignores emails", () => {
  assert.deepEqual(parseMentions("@anna und @bob, auch @anna"), ["anna", "bob"]);
  assert.equal(parseMentions("contact liam@example.com here").length, 0);
  assert.deepEqual(parseMentions(""), []);
});

test("makeEntity validates input and derives mentions", () => {
  const e = makeEntity({ title: "Draft für @lena", notes: "cc @max", type: "task" });
  assert.deepEqual(e.mentions.sort(), ["lena", "max"]);
  assert.ok(e.id && e.createdAt);
  assert.throws(() => makeEntity({ title: "  " }), /Title is required/);
  assert.throws(() => makeEntity({ title: "x", type: "banana" }), /Unknown type/);
  assert.throws(() => makeEntity({ title: "x", priority: "urgent" }), /Unknown priority/);
});

test("editEntity keeps id/createdAt and re-parses mentions", () => {
  const e = makeEntity({ title: "a @one" });
  const n = editEntity(e, { title: "b @two", notes: "@three" });
  assert.equal(n.id, e.id);
  assert.equal(n.createdAt, e.createdAt);
  assert.deepEqual(n.mentions.sort(), ["three", "two"]);
});

test("toggleComplete flips completedAt both ways", () => {
  const e = makeEntity({ title: "x" });
  const done = toggleComplete(e);
  assert.ok(done.completedAt);
  assert.equal(toggleComplete(done).completedAt, null);
});

test("todayStats counts only finished focus sessions of today", () => {
  const now = new Date(2026, 8, 26, 15, 0, 0); // Sat Sep 26 2026
  const sessions = [
    { mode: "focus", end: iso(2026, 9, 26), seconds: 1500 },
    { mode: "focus", end: iso(2026, 9, 26), seconds: 600 },
    { mode: "short", end: iso(2026, 9, 26), seconds: 300 },
    { mode: "focus", end: iso(2026, 9, 25), seconds: 9999 },
    { mode: "focus", end: null, seconds: 1200 }, // running, not counted
  ];
  const s = todayStats(sessions, { dailyGoalMin: 60 }, now);
  assert.deepEqual(s, { sessions: 2, minutes: 35, goal: 60, percent: 58 });
});

test("sortEntities: open first, then priority, then due date", () => {
  const mk = (t, p, d, done) => ({ title: t, priority: p, dueDate: d, completedAt: done ? "x" : null });
  const out = sortEntities([
    mk("done", "high", null, true),
    mk("low", "low", null, false),
    mk("hi-later", "high", "2026-10-05", false),
    mk("hi-soon", "high", "2026-10-01", false),
  ]).map((e) => e.title);
  assert.deepEqual(out, ["hi-soon", "hi-later", "low", "done"]);
});

test("validEmail accepts sane addresses only", () => {
  assert.ok(validEmail("a@b.de"));
  assert.ok(!validEmail("no-at-sign"));
  assert.ok(!validEmail("a@b"));
  assert.ok(!validEmail(""));
});

test("normalizeName strips @, whitespace; case-insensitive", () => {
  assert.equal(normalizeName("  @Anna "), "anna");
  assert.equal(normalizeName(null), "");
});

test("involvedPeople merges assignee + mentions without duplicates", () => {
  const e = makeEntity({ title: "x @anna", assignee: "anna" });
  assert.deepEqual(involvedPeople(e), ["anna"]);
});

test("mentionedNotInvited links mentions to invites by email local-part", () => {
  const entities = [makeEntity({ title: "ping @lena and @tom" })];
  const invites = [{ email: "lena@example.com" }];
  assert.deepEqual(mentionedNotInvited(entities, invites), ["tom"]);
});

test("statsForDay + weekStats aggregate per calendar day", () => {
  const now = new Date(2026, 8, 26, 12, 0, 0);
  const sessions = [
    { mode: "focus", end: iso(2026, 9, 26), seconds: 1200 },
    { mode: "focus", end: iso(2026, 9, 24), seconds: 600 },
  ];
  assert.equal(statsForDay(sessions, {}, "2026-09-26", now).minutes, 20);
  const w = weekStats(sessions, 7, now);
  assert.equal(w.length, 7);
  assert.equal(w[6].day, todayISO(now));
  assert.equal(w[6].minutes, 20);
  assert.equal(w[4].minutes, 10);
});

test("totalFocusMinutes sums every focus session regardless of day", () => {
  assert.equal(totalFocusMinutes([{ mode: "focus", seconds: 90 }, { mode: "short", seconds: 500 }]), 2);
});

test("countOpen counts non-completed items per type", () => {
  const tasks = [
    makeEntity({ title: "t", type: "task" }),
    makeEntity({ title: "i", type: "idea" }),
    toggleComplete(makeEntity({ title: "m", type: "memo" })),
  ];
  assert.deepEqual(countOpen(tasks), { task: 1, "project-task": 0, idea: 1, memo: 0 });
});
