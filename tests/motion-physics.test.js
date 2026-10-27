/**
 * The maths behind the bouncing ball and the flipping coins.
 *
 * These are the checks that say the motion is *natural* rather than merely moving:
 * gravity accelerates the fall, every wall takes energy away, the bounces get lower,
 * the ball stops and stays stopped, the coins all leave the same hand and which face
 * lands up follows from the flip rate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BALL_DEFAULTS,
  COIN_DEFAULTS,
  ballEnergy,
  ballFrame,
  ballShouldRestart,
  coinFaceForAngle,
  coinFrame,
  coinHalfTurns,
  coinLanding,
  coinShouldClear,
  createBall,
  createCoin,
  stepBall,
  stepCoin,
} from '../src/lib/motionPhysics.js';

const SLIDE = { width: 1280, height: 720 };
const SIZES = [SLIDE, { width: 1920, height: 1080 }, { width: 720, height: 1280 }];

/** A deterministic stand-in for Math.random, so a run can be repeated exactly. */
function seeded(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ballAt = (overrides = {}, bounds = SLIDE) => ({
  ...createBall({ width: bounds.width, height: bounds.height, random: () => 0.5, from: 'left' }),
  ...overrides,
});

const coinAt = (overrides = {}, bounds = SLIDE) => ({
  ...createCoin({ width: bounds.width, height: bounds.height, random: () => 0.5 }),
  ...overrides,
});

/* ----------------------------------------------------------------------- *
 * The ball
 * ----------------------------------------------------------------------- */

test('gravity accelerates the fall', () => {
  // A tall world, so nothing interrupts the drop.
  const bounds = { width: 2000, height: 4000 };
  let ball = ballAt({ x: 1000, y: 80, vx: 0, vy: 0 }, bounds);
  const start = ball.y;
  const speeds = [];
  for (let i = 0; i < 60; i += 1) {
    ball = stepBall(ball, 1 / 60, bounds);
    speeds.push(ball.vy);
  }
  // It speeds up every single frame — that is what "acceleration" means.
  for (let i = 1; i < speeds.length; i += 1) {
    assert.ok(speeds[i] > speeds[i - 1], `frame ${i} is faster than the one before`);
  }
  // After a second it is doing g, and it has fallen about ½ g t² — to within a few
  // per cent of the closed-form answer (the air drag is the difference).
  assert.ok(Math.abs(ball.vy - BALL_DEFAULTS.gravity) / BALL_DEFAULTS.gravity < 0.05, `vy=${ball.vy}`);
  const dropped = ball.y - start;
  const expected = 0.5 * BALL_DEFAULTS.gravity * 1 ** 2;
  assert.ok(Math.abs(dropped - expected) / expected < 0.05, `fell ${dropped}, expected about ${expected}`);
});

test('the walls are the slide, whatever size it is', () => {
  for (const bounds of SIZES) {
    let ball = createBall({ width: bounds.width, height: bounds.height, random: seeded(7) });
    for (let i = 0; i < 60 * 25; i += 1) {
      ball = stepBall(ball, 1 / 60, bounds);
      const r = BALL_DEFAULTS.radius;
      assert.ok(ball.x >= r - 0.001 && ball.x <= bounds.width - r + 0.001, `x=${ball.x} inside ${bounds.width}`);
      assert.ok(ball.y >= r - 0.001 && ball.y <= bounds.height - r + 0.001, `y=${ball.y} inside ${bounds.height}`);
    }
  }
});

test('a wall bounce turns the ball around and costs it speed', () => {
  const bounds = SLIDE;
  let ball = ballAt({ x: bounds.width - 200, y: 300, vx: 900, vy: 0 }, bounds);
  const before = Math.abs(ball.vx);
  const impactsBefore = ball.impacts;
  for (let i = 0; i < 60 && ball.vx > 0; i += 1) ball = stepBall(ball, 1 / 60, bounds);
  assert.ok(ball.vx < 0, 'it is heading back the way it came');
  assert.ok(Math.abs(ball.vx) < before, 'and slower than it arrived');
  assert.equal(ball.impacts, impactsBefore + 1, 'the impact was counted');
});

test('every bounce is lower than the last', () => {
  const bounds = SLIDE;
  const floor = bounds.height - BALL_DEFAULTS.radius;
  let ball = createBall({ width: bounds.width, height: bounds.height, random: seeded(3) });
  const apexes = [];
  for (let i = 0; i < 60 * 20; i += 1) {
    const next = stepBall(ball, 1 / 60, bounds);
    // An apex is the top of an arc: the ball stops rising (vy turns from negative,
    // which is upward, to positive, which is down). Only the ones with real height
    // count — the last few millimetres of roll are not a bounce.
    if (ball.vy <= 0 && next.vy > 0 && ball.y < floor - 20) apexes.push(ball.y);
    ball = next;
  }
  assert.ok(apexes.length >= 3, `it bounced a few times (${apexes.length} apexes)`);
  for (let i = 1; i < apexes.length; i += 1) {
    assert.ok(
      apexes[i] > apexes[i - 1] + 0.5,
      `apex ${i} (${Math.round(apexes[i])}) is lower than ${Math.round(apexes[i - 1])}`
    );
  }
});

test('the ball loses energy at every impact and comes to rest', () => {
  const bounds = SLIDE;
  let ball = createBall({ width: bounds.width, height: bounds.height, random: seeded(11) });
  let energy = ballEnergy(ball, bounds);
  let settledAt = null;
  let settledFrame = null;
  let lastImpact = ball.impacts;
  for (let i = 0; i < 60 * 40; i += 1) {
    const next = stepBall(ball, 1 / 60, bounds);
    if (next.impacts > lastImpact) {
      // A hit always costs the ball energy: nothing here can add any.
      assert.ok(ballEnergy(next, bounds) <= energy + 1, `energy fell across impact ${next.impacts}`);
      energy = ballEnergy(next, bounds);
      lastImpact = next.impacts;
    }
    ball = next;
    if (ball.resting && settledAt === null) {
      settledAt = i / 60;
      settledFrame = ball;
    }
  }
  assert.ok(settledAt !== null, 'it settles instead of bouncing forever');
  assert.ok(settledAt < 30, `it settled after ${settledAt?.toFixed(1)}s`);
  assert.equal(settledFrame.vx, 0);
  assert.equal(settledFrame.vy, 0);
  assert.equal(settledFrame.y, bounds.height - BALL_DEFAULTS.radius, 'and it is lying on the floor');
  assert.equal(settledFrame.restingMs, 0, 'the rest clock starts the moment it stops');
  assert.ok(ball.restingMs > 1000, 'and then it counts the time it lies there');
});

test('it lies still for two seconds, then it is thrown again', () => {
  const bounds = SLIDE;
  let ball = ballAt({ resting: true, x: 400, y: bounds.height - BALL_DEFAULTS.radius, vx: 0, vy: 0 }, bounds);
  ball = stepBall(ball, 1, bounds);
  assert.equal(ball.restingMs, 1000);
  assert.equal(ballShouldRestart(ball), false, 'one second is not long enough');
  ball = stepBall(ball, 0.9, bounds);
  assert.equal(ballShouldRestart(ball), false);
  ball = stepBall(ball, 0.2, bounds);
  assert.equal(ballShouldRestart(ball), true, 'two seconds is');
  assert.equal(BALL_DEFAULTS.pauseMs, 2000);
  // A fresh throw starts it moving again.
  const thrown = createBall({ width: bounds.width, height: bounds.height, random: seeded(5) });
  assert.notEqual(thrown.vx, 0);
  assert.ok(thrown.vy < 0, 'thrown upward');
});

test('it is thrown from a corner, across the slide', () => {
  const left = createBall({ width: SLIDE.width, height: SLIDE.height, random: () => 0.5, from: 'left' });
  const right = createBall({ width: SLIDE.width, height: SLIDE.height, random: () => 0.5, from: 'right' });
  assert.ok(left.x < SLIDE.width / 2 && left.vx > 0, 'from the left, heading right');
  assert.ok(right.x > SLIDE.width / 2 && right.vx < 0, 'from the right, heading left');
  assert.ok(left.vy < 0 && right.vy < 0, 'both start upward');
});


/* ----------------------------------------------------------------------- *
 * The coins
 * ----------------------------------------------------------------------- */

test('a coin lands on the face its half-turns say', () => {
  // The maths: one half-turn shows the other side, two shows the first again.
  assert.equal(coinHalfTurns(0), 0);
  assert.equal(coinFaceForAngle(0), 'heads');
  assert.equal(coinFaceForAngle(Math.PI), 'tails');
  assert.equal(coinFaceForAngle(2 * Math.PI), 'heads');
  assert.equal(coinFaceForAngle(3 * Math.PI), 'tails');
  // Spinning the other way is the same coin.
  assert.equal(coinFaceForAngle(-Math.PI), 'tails');
  assert.equal(coinFaceForAngle(-2 * Math.PI), 'heads');
  // Anywhere inside a half-turn rounds to the nearer side.
  assert.equal(coinFaceForAngle(Math.PI * 0.4), 'heads');
  assert.equal(coinFaceForAngle(Math.PI * 0.6), 'tails');
  assert.equal(coinFaceForAngle(Math.PI * 1.4), 'tails');
  assert.equal(coinFaceForAngle(Math.PI * 1.6), 'heads');
  assert.equal(coinFaceForAngle(Math.PI * 2.4), 'heads');
  assert.equal(coinFaceForAngle(Math.PI * 2.6), 'tails');
});

test('the face the maths picks is the face you can see', () => {
  // The scene shows a coin by scaling it with cos(flip): positive is the front. The
  // landing face has to agree with that, or a coin would appear to change sides as it
  // comes to rest. The only place the two can disagree is exactly edge-on, where there
  // is no face to see — so the check keeps clear of those angles.
  for (let degrees = 0; degrees <= 720; degrees += 1) {
    const angle = (degrees * Math.PI) / 180;
    if (Math.abs(Math.cos(angle)) < 0.06) continue; // within a few degrees of edge-on
    const visible = Math.cos(angle) > 0 ? 'heads' : 'tails';
    assert.equal(coinFaceForAngle(angle), visible, `${degrees}° (cos=${Math.cos(angle).toFixed(2)})`);
  }
});

test('a landing always lies flat, on one face or the other', () => {
  const random = seeded(4);
  for (let i = 0; i < 400; i += 1) {
    // Any angle at all, however far the coin has turned.
    const angle = random() * 80 * Math.PI;
    const landing = coinLanding(angle);
    // Flat means a whole number of half-turns: cos is ±1, so the coin lies flat.
    assert.ok(
      Math.abs(landing.angle / Math.PI - Math.round(landing.angle / Math.PI)) < 1e-9,
      'a whole number of half-turns'
    );
    assert.ok(Math.abs(Math.cos(landing.angle)) > 0.999999, 'so it is flat on the floor');
    assert.equal(landing.face, coinFaceForAngle(landing.angle));
    assert.ok(['heads', 'tails'].includes(landing.face));
    // It never turns back on itself: the snap is at most a quarter turn.
    assert.ok(Math.abs(landing.angle - angle) <= Math.PI / 2 + 1e-9, 'snapped to the nearest side');
  }
});

test('every coin is thrown from the same hand', () => {
  const random = seeded(9);
  const coins = Array.from({ length: COIN_DEFAULTS.maxCoins }, (_, index) =>
    createCoin({ width: SLIDE.width, height: SLIDE.height, index, random })
  );
  const first = coins[0].origin;
  for (const coin of coins) {
    assert.deepEqual(coin.origin, first, 'the same hand, every time');
    // The stored origin is rounded for the deck; the coin itself starts exactly there.
    assert.ok(Math.abs(coin.x - first.x) < 0.01, `x=${coin.x} vs ${first.x}`);
    assert.ok(Math.abs(coin.y - first.y) < 0.01, `y=${coin.y} vs ${first.y}`);
  }
  // It is inside the slide, up and to the left — where a hand would be.
  assert.ok(first.x < SLIDE.width * 0.3 && first.y > SLIDE.height * 0.6, `${first.x},${first.y}`);
  // But they do not follow the same arc: each has its own throw and its own flip.
  assert.ok(new Set(coins.map((coin) => Math.round(coin.vx))).size > 1, 'thrown at different speeds');
  assert.ok(new Set(coins.map((coin) => Math.round(coin.flipVelocity))).size > 1, 'flipping at different rates');
  assert.ok(new Set(coins.map((coin) => Math.round(coin.plane))).size > 1, 'tilted differently');
});


test('a thrown coin flips in the air, lands flat and settles', () => {
  const bounds = SLIDE;
  const random = seeded(17);
  let coin = createCoin({ width: bounds.width, height: bounds.height, random });
  const flips = [];
  let landedAt = null;
  let settledAt = null;
  for (let i = 0; i < 60 * 12; i += 1) {
    const next = stepCoin(coin, 1 / 60, bounds);
    flips.push(next.flip);
    coin = next;
    if (coin.landed && landedAt === null) landedAt = i / 60;
    if (coin.resting && settledAt === null) settledAt = i / 60;
  }
  // It really does flip: the angle turns over and over on the way.
  const turns = flips[flips.length - 1] / (2 * Math.PI);
  assert.ok(turns > 1, `it turned ${turns.toFixed(1)} times`);
  assert.ok(flips.some((angle) => angle > Math.PI * 3), 'more than a turn and a half');
  // It is thrown upward first.
  assert.ok(createCoin({ width: bounds.width, height: bounds.height, random }).vy < 0);
  assert.ok(landedAt !== null && landedAt < 4, `it landed after ${landedAt?.toFixed(2)}s`);
  assert.ok(settledAt !== null, 'and then came to rest');
  assert.equal(coin.y, bounds.height - COIN_DEFAULTS.radius, 'lying on the floor');
  assert.equal(coin.vx, 0);
  assert.equal(coin.vy, 0);
  // The face it rests on is the one the flip maths gives for its last angle.
  assert.ok(['heads', 'tails'].includes(coin.face));
  assert.equal(coin.face, coin.landingFace);
  assert.ok(Math.abs(Math.cos(coin.flip)) > 0.999, 'flat, so a face is showing');
});

test('a batch of coins lands on both faces, and all from the one place', () => {
  const bounds = SLIDE;
  const random = seeded(23);
  const landed = [];
  for (let index = 0; index < COIN_DEFAULTS.maxCoins; index += 1) {
    let coin = createCoin({ width: bounds.width, height: bounds.height, index, random });
    for (let i = 0; i < 60 * 8 && !coin.resting; i += 1) coin = stepCoin(coin, 1 / 60, bounds);
    landed.push(coin);
  }
  // Not one coin looks like another: the flip rate decides, so both faces come up.
  const faces = new Set(landed.map((coin) => coin.face));
  assert.equal(faces.size, 2, `both faces land (${[...faces].join(', ')})`);
  // They all left the same hand...
  const hand = landed[0].origin;
  for (const coin of landed) assert.deepEqual(coin.origin, hand);
  // ...and yet they do not all finish in the same spot.
  const resting = new Set(landed.map((coin) => Math.round(coin.x / 40)));
  assert.ok(resting.size > 1, `they scatter (${resting.size} spots)`);
  // Nothing left the slide.
  for (const coin of landed) {
    assert.ok(coin.x >= 0 && coin.x <= bounds.width, `x=${Math.round(coin.x)}`);
    assert.ok(coin.y <= bounds.height, `y=${Math.round(coin.y)}`);
  }
});

test('a coin lands on its face because of how it was turning', () => {
  // The same throw, two flip rates: the maths has to give two answers. The second rate
  // is worked out from where the first coin actually stopped, so the pair is always
  // exactly one half-turn apart.
  const bounds = SLIDE;
  const base = createCoin({ width: bounds.width, height: bounds.height, random: () => 0.5 });
  const land = (flipVelocity) => {
    let coin = { ...base, flipVelocity };
    for (let i = 0; i < 60 * 6 && !coin.resting; i += 1) coin = stepCoin(coin, 1 / 60, bounds);
    return coin;
  };

  const slow = land(3.4 * Math.PI);
  assert.ok(slow.landed, 'the slow coin landed');
  const halfTurns = Math.max(1, Math.abs(coinHalfTurns(slow.flip)));
  const fast = land(3.4 * Math.PI * ((halfTurns + 1) / halfTurns));

  assert.equal(slow.face, coinFaceForAngle(slow.flip));
  assert.equal(fast.face, coinFaceForAngle(fast.flip));
  assert.notEqual(slow.face, fast.face, `a slow flip (${slow.face}) and a fast one (${fast.face}) differ`);
});

test('a coin that is cleared away has lingered long enough', () => {
  const bounds = SLIDE;
  let coin = {
    ...createCoin({ width: bounds.width, height: bounds.height, random: seeded(2) }),
    resting: true,
    restingMs: 0,
  };
  coin = stepCoin(coin, 0.5, bounds);
  assert.equal(coinShouldClear(coin), false, 'half a second is not long enough');
  coin = stepCoin(coin, 0.5, bounds);
  assert.equal(coinShouldClear(coin), true);
  assert.equal(COIN_DEFAULTS.lingerMs, 900);
});

test('the coin frame is what the scene draws', () => {
  const landed = {
    ...createCoin({ width: SLIDE.width, height: SLIDE.height, random: () => 0.5 }),
    flip: Math.PI,
    landed: true,
    landingFace: 'tails',
  };
  const frame = coinFrame(landed);
  assert.equal(frame.scaleX, -1, 'a coin on its other side is mirrored');
  assert.equal(frame.face, 'tails');
  assert.equal(frame.landed, true);
  // Edge-on, the coin is a line.
  assert.equal(coinFrame({ ...landed, flip: Math.PI / 2 }).scaleX, 0);
  assert.equal(coinFrame({ ...landed, flip: 0, landed: false, landingFace: null }).face, 'heads');
});
