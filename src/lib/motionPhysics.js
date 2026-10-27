/**
 * The physics behind the backgrounds that have to look real: the bouncing ball and
 * the falling coins.
 *
 * Everything here is a pure function of `state + dt + bounds`, so the numbers can be
 * checked in `tests/motion-physics.test.js` without a browser, and the scenes in
 * `components/motionScenes.jsx` only own the clock. The slide *is* the world: its
 * edges are the walls, so the same numbers work at any deck size.
 *
 * Units are slide pixels and seconds.
 */

/** Gravity, in slide px per second squared: reads like a real fall at slide scale. */
export const GRAVITY = 2100;

/** Integration step (seconds). Small and fixed, so a frame is split the same way every time. */
const SUBSTEP = 1 / 240;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value * 100) / 100;
const between = (random, [min, max]) => min + random() * (max - min);

/* ----------------------------------------------------------------------- *
 * The bouncing ball
 * ----------------------------------------------------------------------- */

export const BALL_DEFAULTS = {
  radius: 44,
  gravity: GRAVITY,
  /** How much speed a wall gives back. Below 1 the ball loses height on every hit. */
  restitution: 0.78,
  /** The ceiling is softer than the floor: the ball does not spring back off it. */
  ceilingRestitution: 0.6,
  /** A floor hit scrubs off sideways speed, so a ball eventually stops rolling. */
  floorFriction: 0.95,
  /** Per-second share of speed lost to the air, and of spin lost to friction. */
  airDrag: 0.03,
  spinDecay: 0.7,
  /** How fast a landing squash springs back. */
  squashDecay: 9,
  /** Under this speed, on the floor, the ball is on its way to a stop. */
  restSpeed: 55,
  /**
   * A floor hit slower than this does not bounce at all: a real ball stops doing
   * micro-bounces once the hop is smaller than the eye can follow, and without this
   * the last half-second is a blur of tiny impacts.
   */
  bounceThreshold: 190,
  /** How long it has to stay that slow before it counts as at rest (seconds). */
  restTime: 0.5,
  /** How long it lies there before it is thrown again (milliseconds). */
  pauseMs: 2000,
  /**
   * The throw that starts it off: sideways and upward, so it crosses the slide. The
   * speeds are magnitudes — `createBall` sends the ball up with them.
   */
  throw: { vx: [520, 1180], vy: [1250, 1750] },
};

export function ballOptions(options = {}) {
  return { ...BALL_DEFAULTS, ...options, throw: { ...BALL_DEFAULTS.throw, ...(options.throw || {}) } };
}

/** How much of its bounce the ball keeps: 1 would bounce forever. */
export function ballRestitution(options = {}) {
  return clamp(ballOptions(options).restitution, 0, 0.99);
}

/**
 * A ball thrown into the slide from one of the lower corners, so its first move is a
 * real arc rather than a drop.
 */
export function createBall({ width, height, options = {}, random = Math.random, from = null } = {}) {
  const config = ballOptions(options);
  const radius = config.radius;
  const side = from || (random() < 0.5 ? 'left' : 'right');
  const x = side === 'left' ? radius + 6 : width - radius - 6;
  return {
    x,
    y: height - radius - 2,
    vx: (side === 'left' ? 1 : -1) * between(random, config.throw.vx),
    vy: -between(random, config.throw.vy),
    radius,
    /** Radians of roll, and the rate it is spinning at. */
    spin: 0,
    spinVelocity: 0,
    /** 0 = round, up to 1 = flattened against the floor. */
    squash: 0,
    resting: false,
    restFor: 0,
    restingMs: 0,
    /** True while it is touching the floor, so one landing is counted once. */
    contact: false,
    /** How many times it has hit a wall (the tests use this to prove it is bouncing). */
    impacts: 0,
  };
}

/** One integration step. `dt` may be any size: it is split into fixed substeps. */
function integrateBall(ball, dt, bounds, config) {
  const radius = config.radius;
  let { x, y, vx, vy, spin, spinVelocity, squash, restFor, impacts, contact } = ball;
  const wasOnFloor = contact === true;

  vy += config.gravity * dt;
  const drag = Math.max(0, 1 - config.airDrag * dt);
  vx *= drag;
  vy *= drag;
  x += vx * dt;
  y += vy * dt;

  // The walls are the slide's edges.
  if (x - radius < 0) {
    x = radius;
    vx = Math.abs(vx) * config.restitution;
    spinVelocity = (vy / radius) * 0.4;
    impacts += 1;
  } else if (x + radius > bounds.width) {
    x = bounds.width - radius;
    vx = -Math.abs(vx) * config.restitution;
    spinVelocity = -(vy / radius) * 0.4;
    impacts += 1;
  }
  if (y - radius < 0) {
    y = radius;
    // The ceiling is soft, and a gentle touch does not bounce at all.
    vy = Math.abs(vy) < config.bounceThreshold ? 0 : Math.abs(vy) * config.ceilingRestitution;
    impacts += 1;
  }

  contact = false;
  // `>=` with a hair of slack: after a landing the ball sits exactly on the floor,
  // and a strict `>` would call that "in the air" on the very next substep.
  if (y + radius >= bounds.height - 0.5) {
    y = bounds.height - radius;
    contact = true;
    if (vy > 0) {
      // One landing is one impact, however many substeps it spends lying there.
      if (!wasOnFloor) impacts += 1;
      if (vy < config.bounceThreshold) {
        // Too slow to bounce: it lands and stays down. This has to happen on every
        // substep it is in contact, or gravity would keep adding speed it never gets
        // to use and the ball would never be still.
        vy = 0;
      } else {
        if (!wasOnFloor) {
          // A landing flattens the ball for a moment and spins it up a little.
          squash = Math.min(1, vy / 1400);
          spinVelocity += (vx / radius) * 0.5;
        }
        vy = -vy * config.restitution;
      }
    }
    vx *= config.floorFriction;
  }

  const speed = Math.hypot(vx, vy);
  if (y + radius >= bounds.height - 0.5 && speed < config.restSpeed) {
    // Rolling to a stop: friction does the rest.
    restFor += dt;
    vx *= Math.max(0, 1 - 3.2 * dt);
    vy *= Math.max(0, 1 - 3.2 * dt);
  } else {
    restFor = 0;
  }

  spin += spinVelocity * dt;
  spinVelocity *= Math.max(0, 1 - config.spinDecay * dt);
  squash *= Math.exp(-config.squashDecay * dt);

  return { x, y, vx, vy, spin, spinVelocity, squash, restFor, impacts, contact };
}

/**
 * Advance a ball. Once it has settled it only counts the time it has been lying
 * there, which is what the scene waits on before throwing it again.
 */
export function stepBall(ball, dt, bounds, options = {}) {
  const config = ballOptions(options);
  const radius = config.radius;
  let state = { ...ball, radius };

  if (state.resting) {
    return {
      ...state,
      x: clamp(state.x, radius, bounds.width - radius),
      y: bounds.height - radius,
      vx: 0,
      vy: 0,
      spinVelocity: 0,
      squash: 0,
      restingMs: state.restingMs + dt * 1000,
    };
  }

  let remaining = Math.max(0, dt);
  let resting = false;
  while (remaining > 0) {
    const step = Math.min(SUBSTEP, remaining);
    state = integrateBall(state, step, bounds, config);
    remaining -= step;
    if (state.restFor >= config.restTime) {
      resting = true;
      break;
    }
  }

  if (resting) {
    return {
      ...state,
      x: clamp(state.x, radius, bounds.width - radius),
      y: bounds.height - radius,
      vx: 0,
      vy: 0,
      spinVelocity: 0,
      squash: 0,
      resting: true,
      restingMs: 0,
    };
  }
  return state;
}

/** Whether the ball has lain still long enough to be thrown again. */
export function ballShouldRestart(ball, options = {}) {
  return Boolean(ball?.resting) && ball.restingMs >= ballOptions(options).pauseMs;
}

/** Total mechanical energy, for the tests that prove it only ever falls. */
export function ballEnergy(ball, bounds, options = {}) {
  const config = ballOptions(options);
  const height = Math.max(0, bounds.height - config.radius - ball.y);
  return 0.5 * (ball.vx * ball.vx + ball.vy * ball.vy) + config.gravity * height;
}

/**
 * Where to draw the ball: its own transform, the squash, and the shadow it casts.
 *
 * The shadow shrinks and fades with height, which is what makes the arc readable.
 */
export function ballFrame(ball, bounds, options = {}) {
  const config = ballOptions(options);
  const radius = config.radius;
  const squash = clamp(ball.squash || 0, 0, 1);
  const floor = bounds.height - radius;
  const air = clamp((floor - ball.y) / Math.max(1, bounds.height - 2 * radius), 0, 1);
  return {
    x: round(ball.x),
    y: round(ball.y),
    spin: round((ball.spin || 0) * (180 / Math.PI)),
    scaleX: round(1 + squash * 0.34),
    scaleY: round(1 - squash * 0.3),
    shadow: {
      x: round(ball.x),
      y: round(bounds.height - 6),
      scaleX: round(1 - air * 0.42),
      scaleY: round(1 - air * 0.5),
      opacity: round(0.42 * (1 - air * 0.68)),
    },
  };
}


/* ----------------------------------------------------------------------- *
 * The coins
 *
 * Coins are thrown from one place — a hand at the lower left — each with its own
 * impulse and its own rate of flipping. Which face lands up is not decided in
 * advance: it falls out of how many half-turns the coin got through in the air, so
 * a fast flip and a slow one settle differently.
 * ----------------------------------------------------------------------- */

export const COIN_DEFAULTS = {
  radius: 26,
  gravity: GRAVITY * 0.92,
  /** Coins barely bounce: they land flat and stay. */
  restitution: 0.32,
  floorFriction: 0.68,
  airDrag: 0.08,
  /** The hand: a fraction of the slide, the same for every coin. */
  origin: { x: 0.16, y: 0.8 },
  /** The throw, in slide px/s: sideways and upward (speeds are magnitudes). */
  throw: { vx: [280, 700], vy: [820, 1180] },
  /** Flips per second while airborne — this is what decides the landing face. */
  flip: [3.6, 6.4],
  /** How much the flip slows in the air. */
  flipDrag: 0.06,
  /** Sideways scatter, as a fraction of the throw, so they do not share one arc. */
  spread: 0.5,
  /** Side walls are springy enough to keep a coin on the slide. */
  wallRestitution: 0.4,
  restSpeed: 42,
  restTime: 0.3,
  /** How long a settled coin stays on screen before it is cleared (milliseconds). */
  lingerMs: 900,
  /** How many can be in the air at once, and how often one is thrown. */
  maxCoins: 7,
  spawnMs: 430,
};

export function coinOptions(options = {}) {
  return {
    ...COIN_DEFAULTS,
    ...options,
    throw: { ...COIN_DEFAULTS.throw, ...(options.throw || {}) },
    origin: { ...COIN_DEFAULTS.origin, ...(options.origin || {}) },
  };
}

/** How many half-turns an angle is, rounded to the nearest one. */
export function coinHalfTurns(angle) {
  return Math.round(angle / Math.PI);
}

/** Which face of a coin is up after it has turned through `angle` radians. */
export function coinFaceForAngle(angle) {
  return Math.abs(coinHalfTurns(angle)) % 2 === 0 ? 'heads' : 'tails';
}

/**
 * Land a coin: snap its flip to the nearest flat position, and let that decide the
 * face. The maths is the point — an odd number of half-turns lands on the other side.
 */
export function coinLanding(angle) {
  const halfTurns = coinHalfTurns(angle);
  return { angle: halfTurns * Math.PI, halfTurns, face: coinFaceForAngle(halfTurns * Math.PI) };
}

/** One coin, thrown from the hand. */
export function createCoin({ width, height, index = 0, options = {}, random = Math.random, origin = null } = {}) {
  const config = coinOptions(options);
  const hand = origin || { x: width * config.origin.x, y: height * config.origin.y };
  const scatter = 1 + (random() - 0.5) * config.spread;
  return {
    index,
    x: hand.x,
    y: hand.y,
    radius: config.radius,
    vx: between(random, config.throw.vx) * scatter,
    vy: -between(random, config.throw.vy) * scatter,
    /** The flip: radians of turn, and how fast it is turning. */
    flip: 0,
    flipVelocity: between(random, config.flip) * Math.PI,
    /** The coin's own tilt in the plane of the slide, so they do not look printed. */
    plane: (random() - 0.5) * 44,
    planeVelocity: (random() - 0.5) * 24,
    landed: false,
    landingFace: null,
    resting: false,
    restFor: 0,
    restingMs: 0,
    /** Which side is towards the viewer right now. */
    face: 'heads',
    /** Where it started, kept so a test can prove they all flow from one place. */
    origin: { x: round(hand.x), y: round(hand.y) },
  };
}

function integrateCoin(coin, dt, bounds, config) {
  const radius = config.radius;
  let { x, y, vx, vy, flip, flipVelocity, plane, planeVelocity, landed, landingFace, restFor } = coin;

  vy += config.gravity * dt;
  const drag = Math.max(0, 1 - config.airDrag * dt);
  vx *= drag;
  vy *= drag;
  x += vx * dt;
  y += vy * dt;
  flip += flipVelocity * dt;
  flipVelocity *= Math.max(0, 1 - config.flipDrag * dt);
  plane += planeVelocity * dt;

  if (x - radius < 0) {
    x = radius;
    vx = Math.abs(vx) * config.wallRestitution;
  } else if (x + radius > bounds.width) {
    x = bounds.width - radius;
    vx = -Math.abs(vx) * config.wallRestitution;
  }

  if (y + radius >= bounds.height) {
    y = bounds.height - radius;
    if (!landed) {
      // The landing: it lies flat, and the half-turns decide the face.
      const landing = coinLanding(flip);
      flip = landing.angle;
      landingFace = landing.face;
      landed = true;
      flipVelocity = 0;
      planeVelocity *= 0.3;
    }
    if (vy > 0) {
      vy = -vy * config.restitution;
      vx *= config.floorFriction;
    }
    if (Math.abs(vy) < config.restSpeed) vy = 0;
  }

  const speed = Math.hypot(vx, vy);
  if (y + radius >= bounds.height - 0.5 && speed < config.restSpeed) {
    restFor += dt;
    vx *= Math.max(0, 1 - 3.6 * dt);
    vy *= Math.max(0, 1 - 3.6 * dt);
  } else {
    restFor = 0;
  }

  return { x, y, vx, vy, flip, flipVelocity, plane, planeVelocity, landed, landingFace, restFor };
}

/** Advance a coin: flight, then the landing, then lying still. */
export function stepCoin(coin, dt, bounds, options = {}) {
  const config = coinOptions(options);
  const radius = config.radius;
  let state = { ...coin, radius };

  if (state.resting) {
    return {
      ...state,
      y: bounds.height - radius,
      vx: 0,
      vy: 0,
      restingMs: state.restingMs + dt * 1000,
    };
  }

  let remaining = Math.max(0, dt);
  let resting = false;
  while (remaining > 0) {
    const step = Math.min(SUBSTEP, remaining);
    state = integrateCoin(state, step, bounds, config);
    remaining -= step;
    if (state.landed && state.restFor >= config.restTime) {
      resting = true;
      break;
    }
  }

  const face = state.landed ? state.landingFace : coinFaceForAngle(state.flip);
  if (resting) {
    return { ...state, vx: 0, vy: 0, resting: true, restingMs: 0, face };
  }
  return { ...state, face };
}

/** Whether a settled coin has lingered long enough to be cleared away. */
export function coinShouldClear(coin, options = {}) {
  return Boolean(coin?.resting) && coin.restingMs >= coinOptions(options).lingerMs;
}

/**
 * How to draw a coin: where it is, how far through its flip it is, and which side
 * that shows. `scaleX` is the flip seen from the front — a coin edge-on is a line.
 */
export function coinFrame(coin) {
  const flip = coin.flip || 0;
  return {
    x: round(coin.x),
    y: round(coin.y),
    plane: round(coin.plane || 0),
    flip: round(flip * (180 / Math.PI)),
    scaleX: round(Math.cos(flip)),
    /** The side facing us: the same maths that decides where it lands. */
    face: coin.landed ? coin.landingFace : coinFaceForAngle(flip),
    landed: Boolean(coin.landed),
  };
}
