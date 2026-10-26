import test from 'node:test';
import assert from 'node:assert/strict';
import { createCoalesce, createGate, createThrottle } from '../src/lib/throttle.js';

/** A clock and a scheduler the test drives by hand. */
const harness = () => {
  const state = { time: 0, timers: [], nextId: 1 };
  return {
    state,
    now: () => state.time,
    schedule: (fn, delay) => {
      const id = state.nextId++;
      state.timers.push({ id, fn, at: state.time + (delay || 0) });
      return id;
    },
    cancel: (id) => {
      state.timers = state.timers.filter((timer) => timer.id !== id);
    },
    advance: (ms) => {
      state.time += ms;
      const due = state.timers.filter((timer) => timer.at <= state.time);
      state.timers = state.timers.filter((timer) => timer.at > state.time);
      for (const timer of due) timer.fn();
    },
  };
};

test('a throttle runs the first call at once and then one per window', () => {
  const clock = harness();
  const calls = [];
  const throttled = createThrottle((value) => calls.push(value), 100, clock);
  throttled('a');
  assert.deepEqual(calls, ['a'], 'the first call is immediate');
  throttled('b');
  throttled('c');
  assert.deepEqual(calls, ['a'], 'the rest wait for the window');
  clock.advance(100);
  assert.deepEqual(calls, ['a', 'c'], 'the newest value arrives when the window closes');
  clock.advance(500);
  throttled('d');
  assert.deepEqual(calls, ['a', 'c', 'd']);
});

test('a throttle never drops the last value', () => {
  const clock = harness();
  const calls = [];
  const throttled = createThrottle((value) => calls.push(value), 50, clock);
  throttled(1);
  throttled(2);
  throttled(3);
  throttled(4);
  assert.deepEqual(calls, [1]);
  clock.advance(50);
  assert.deepEqual(calls, [1, 4]);
  throttled.flush();
  assert.deepEqual(calls, [1, 4]);
});

test('flushing and cancelling a throttle behave', () => {
  const clock = harness();
  const calls = [];
  const throttled = createThrottle((value) => calls.push(value), 100, clock);
  throttled('first');
  throttled('second');
  throttled.flush();
  assert.deepEqual(calls, ['first', 'second']);
  throttled('third');
  throttled.cancel();
  clock.advance(1000);
  assert.deepEqual(calls, ['first', 'second'], 'a cancelled call never runs');
});

test('a coalesce keeps only the newest call per frame', () => {
  const state = { queued: [], nextId: 1 };
  const calls = [];
  const coalesced = createCoalesce((value) => calls.push(value), {
    schedule: (fn) => {
      const id = state.nextId++;
      state.queued.push({ id, fn });
      return id;
    },
    cancel: (id) => {
      state.queued = state.queued.filter((entry) => entry.id !== id);
    },
  });
  coalesced('one');
  coalesced('two');
  coalesced('three');
  assert.deepEqual(calls, [], 'nothing runs until the frame');
  assert.equal(state.queued.length, 1, 'only one frame is scheduled');
  state.queued.shift().fn();
  assert.deepEqual(calls, ['three']);
  coalesced('four');
  coalesced.cancel();
  assert.deepEqual(calls, ['three']);
});

test('a gate lets one call through per interval', () => {
  const clock = harness();
  const gate = createGate(40, clock);
  assert.equal(gate(), true);
  assert.equal(gate(), false);
  clock.advance(39);
  assert.equal(gate(), false);
  clock.advance(1);
  assert.equal(gate(), true);
});
