import test from 'node:test';
import assert from 'node:assert/strict';
import { createPresence } from '../server/presence.js';

/** A clock and timers the test drives by hand, so nothing waits on real time. */
function fakeTime() {
  let now = 1000;
  const intervals = new Map();
  const timeouts = new Map();
  let nextId = 1;
  return {
    now: () => now,
    advance(ms) {
      now += ms;
    },
    timers: {
      setInterval: (fn, ms) => {
        intervals.set(nextId, { fn, ms });
        return nextId++;
      },
      clearInterval: (id) => intervals.delete(id),
      setTimeout: (fn, ms) => {
        timeouts.set(nextId, { fn, ms });
        return nextId++;
      },
      clearTimeout: (id) => timeouts.delete(id),
    },
    /** Fire everything whose interval or timeout has come due. */
    tick() {
      for (const entry of [...intervals.values()]) entry.fn();
      const due = [...timeouts.entries()];
      timeouts.clear();
      for (const [, entry] of due) entry.fn();
    },
    pending: () => intervals.size + timeouts.size,
  };
}

test('the app stays up while a window is open and stops when the last one goes', () => {
  const time = fakeTime();
  let stopped = 0;
  const presence = createPresence({ ...time, onIdle: () => (stopped += 1) });

  // Nothing may shut down before a window has ever said hello.
  time.advance(60_000);
  time.tick();
  assert.equal(stopped, 0, 'no window has connected yet');
  assert.equal(presence.armed(), false);

  // One window: heartbeats keep it alive well past the grace period.
  presence.beat('a');
  assert.equal(presence.armed(), true);
  for (let i = 0; i < 5; i += 1) {
    time.advance(2000);
    presence.beat('a');
    time.tick();
  }
  assert.equal(stopped, 0);
  assert.equal(presence.count(), 1);

  // The window goes quiet — a crash, a forced close: the app follows it out.
  time.advance(10_000);
  time.tick();
  assert.equal(stopped, 1, 'the app stopped with its last window');
  assert.equal(presence.count(), 0);
  assert.equal(presence.pending?.(), undefined); // not part of the public shape
});

test('a window saying goodbye closes the app, but a reload gets a moment to come back', () => {
  const time = fakeTime();
  let stopped = 0;
  const presence = createPresence({ ...time, onIdle: () => (stopped += 1) });

  presence.beat('a');
  presence.beat('b');
  assert.equal(presence.count(), 2);

  // One of two windows closes: the other keeps the app alive.
  presence.drop('a');
  time.tick();
  assert.equal(stopped, 0);
  assert.equal(presence.count(), 1);

  // The last one closes, and a reload comes straight back before the grace runs out.
  presence.drop('b');
  time.advance(500);
  presence.beat('b');
  time.tick();
  assert.equal(stopped, 0, 'a reload must not stop the app');
  assert.equal(presence.count(), 1);

  // This time nothing comes back.
  presence.drop('b');
  time.tick();
  assert.equal(stopped, 1);
});

test('one open window is enough to keep the app running', () => {
  const time = fakeTime();
  let stopped = 0;
  const presence = createPresence({ ...time, onIdle: () => (stopped += 1) });
  presence.beat('first');
  presence.beat('second');
  time.advance(30_000);
  presence.beat('second');
  time.tick();
  assert.equal(stopped, 0);
  presence.stop();
  time.tick();
  assert.equal(stopped, 0, 'a stopped tracker never fires');
});
