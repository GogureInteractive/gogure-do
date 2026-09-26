// Gogure Do — Focus Timer engine
// Pure state machine, decoupled from the DOM so it can be unit-tested.
// Modes: "focus" | "short" | "long". Ticks are driven externally via tick().

import { uid } from "./domain.js";

export const MODES = ["focus", "short", "long"];

export function createTimer({ durations, onComplete, onTick }) {
  let mode = "focus";
  let totalSec = durations.focus * 60;
  let remaining = totalSec;
  let running = false;
  let interval = null;
  let startedAt = null;

  function setDurations(d) {
    durations = d;
    if (!running) {
      totalSec = durations[mode] * 60;
      remaining = totalSec;
      emit();
    }
  }

  function emit() {
    if (onTick) onTick({ mode, totalSec, remaining, running });
  }

  function start() {
    if (running) return;
    // Restart automatically when the previous run already finished.
    if (remaining <= 0) {
      totalSec = durations[mode] * 60;
      remaining = totalSec;
    }
    running = true;
    startedAt = Date.now();
    interval = setInterval(() => tick(1), 1000);
    emit();
  }

  /** Advance one second. Extracted for deterministic testing. Pausing between
 *  ticks is supported: `tick` only runs while the timer is running. */
  function tick(n = 1) {
    if (!running) return;
    remaining = Math.max(0, remaining - n);
    if (remaining === 0) {
      // Stop first so the UI never observes "running with 0 seconds left".
      stopInterval();
      running = false;
    }
    emit();
    if (remaining === 0) {
      const elapsed = totalSec;
      if (onComplete) onComplete({ id: uid(), mode, seconds: elapsed, custom: false, start: startedAt, end: Date.now() });
    }
  }

  function pause() {
    if (!running) return;
    running = false;
    stopInterval();
    emit();
  }

  function stopInterval() {
    if (interval !== null) { clearInterval(interval); interval = null; }
  }

  function reset(newMode) {
    stopInterval();
    running = false;
    if (newMode && MODES.includes(newMode)) mode = newMode;
    totalSec = durations[mode] * 60;
    remaining = totalSec;
    emit();
  }

  function setMode(m) {
    if (MODES.includes(m)) reset(m);
  }

  /** Manually log a session of arbitrary length (custom duration support). */
  function logCustom(seconds, m) {
    if (onComplete) onComplete({ id: uid(), mode: m || mode, seconds, custom: true, start: null, end: Date.now() });
  }

  return {
    start, pause, reset, tick, setMode, setDurations, logCustom, emit,
    getMode: () => mode,
    getRemaining: () => remaining,
    getTotal: () => totalSec,
    isRunning: () => running,
  };
}
