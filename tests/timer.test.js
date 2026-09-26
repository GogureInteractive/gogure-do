// Unit tests for the timer state machine (deterministic: tick() is driven manually)
import { test } from "node:test";
import assert from "node:assert/strict";
import { createTimer, MODES } from "../src/js/timer.js";

function harness(focus = 25, short = 5, long = 15) {
  const done = [];
  const t = createTimer({ durations: { focus, short, long }, onComplete: (s) => done.push(s) });
  return { t, done };
}

test("initial state: focus mode with configured duration", () => {
  const { t } = harness(25);
  assert.equal(t.getMode(), "focus");
  assert.equal(t.getTotal(), 1500);
  assert.equal(t.getRemaining(), 1500);
  assert.equal(t.isRunning(), false);
});

test("start/pause toggles running without touching remaining", () => {
  const { t } = harness(1);
  t.start();
  assert.equal(t.isRunning(), true);
  t.pause();
  assert.equal(t.isRunning(), false);
  assert.equal(t.getRemaining(), 60);
});

test("tick decrements; completing emits a session with id/mode/seconds", () => {
  const { t, done } = harness(1);
  t.start();
  t.tick(59);
  assert.equal(t.getRemaining(), 1);
  t.tick(1);
  assert.equal(t.isRunning(), false);
  assert.equal(done.length, 1);
  assert.equal(done[0].mode, "focus");
  assert.equal(done[0].seconds, 60);
  assert.ok(done[0].id);
  assert.equal(done[0].custom, false);
});

test("pause between ticks freezes progress; resume continues", () => {
  const { t, done } = harness(1);
  t.start(); t.tick(20); t.pause(); t.tick(10); // ticks while paused are ignored
  assert.equal(t.getRemaining(), 40);
  t.start(); t.tick(40);
  assert.equal(done.length, 1);
});

test("reset restores full duration and stops the interval", () => {
  const { t } = harness(1);
  t.start(); t.tick(30); t.reset();
  assert.equal(t.getRemaining(), 60);
  assert.equal(t.isRunning(), false);
});

test("setMode switches mode and reloads duration; unknown modes ignored", () => {
  const { t } = harness(25, 5, 15);
  t.setMode("long");
  assert.deepEqual(MODES, ["focus", "short", "long"]);
  assert.equal(t.getMode(), "long");
  assert.equal(t.getTotal(), 900);
  t.setMode("nope");
  assert.equal(t.getMode(), "long");
});

test("setDurations updates idle timer but not a running one", () => {
  const { t } = harness(25);
  t.setDurations({ focus: 10, short: 5, long: 15 });
  assert.equal(t.getTotal(), 600);
  t.start();
  t.setDurations({ focus: 99, short: 5, long: 15 });
  assert.equal(t.getTotal(), 600); // unchanged while running
});

test("logCustom records a manual session on the current mode", () => {
  const { t, done } = harness();
  t.setMode("short");
  t.logCustom(120);
  assert.equal(done.length, 1);
  assert.equal(done[0].mode, "short");
  assert.equal(done[0].seconds, 120);
  assert.equal(done[0].custom, true);
});

test("session ids are unique across completions", () => {
  const { t, done } = harness();
  t.setDurations({ focus: 1, short: 5, long: 15 });
  t.start(); t.tick(60);
  t.start(); t.tick(60);
  assert.equal(done.length, 2);
  assert.notEqual(done[0].id, done[1].id);
});
