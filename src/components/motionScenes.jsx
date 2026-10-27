/**
 * The looping scenes a slide can wear as a motion background.
 *
 * Three of them are drawn in SVG and animated entirely by CSS (`styles.css`): a book
 * whose leaves turn, a keyboard playing itself and a microphone bouncing in. The other
 * two have to obey real physics — a ball that accelerates, bounces off the slide's own
 * edges and comes to rest, and coins thrown from one hand that land on the face their
 * flipping decides — so they are stepped by a `requestAnimationFrame` loop and written
 * straight to the DOM (`src/lib/motionPhysics.js` holds the maths).
 *
 * The slide *is* the world: scenes are drawn in the slide's own coordinates, so the
 * walls of the ball's world are the edges of the slide at any deck size.
 */
import { useEffect, useRef } from 'react';
import {
  BALL_DEFAULTS,
  COIN_DEFAULTS,
  ballFrame,
  ballShouldRestart,
  coinFrame,
  coinShouldClear,
  createBall,
  createCoin,
  stepBall,
  stepCoin,
} from '../lib/motionPhysics.js';

/** How many coins can be on screen at once — one SVG slot each. */
const COIN_SLOTS = COIN_DEFAULTS.maxCoins;

/** True when the reader has asked for less movement. */
function useReducedMotion() {
  const reduced = useRef(false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return undefined;
    reduced.current = query.matches;
    const listen = (event) => {
      reduced.current = event.matches;
    };
    query.addEventListener('change', listen);
    return () => query.removeEventListener('change', listen);
  }, []);
  return reduced;
}

/**
 * Run a simulation while the scene is on screen.
 *
 * The loop is handed a `step(dt)` and nothing else: it caps `dt` so a tab that was in
 * the background does not teleport the ball across the slide, and it stops entirely
 * while the scene is paused (a thumbnail, or reduced motion).
 */
function usePhysicsLoop(paused, step) {
  const latest = useRef(step);
  latest.current = step;
  useEffect(() => {
    if (paused) return undefined;
    let frame = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      latest.current(dt);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [paused]);
}

/**
 * Run a simulation forward without animating it, for the frames that are held still:
 * a thumbnail should show the ball mid-arc and the coins in flight, not the empty
 * instant before the first throw.
 */
function warmUp(seconds, step) {
  const frame = 1 / 60;
  for (let time = 0; time < seconds; time += frame) step(frame);
}


/**
 * A ball thrown into the slide. It accelerates under gravity, bounces off the slide's
 * own walls losing a little height each time, rolls to a stop, lies there for two
 * seconds and is thrown again.
 */
function BouncingBallScene({ width, height, paused }) {
  const group = useRef(null);
  const squash = useRef(null);
  const shadow = useRef(null);
  const ball = useRef(null);
  const reduced = useReducedMotion();

  // Every frame is written straight to the SVG: React re-rendering sixty times a
  // second would cost far more than the physics does.
  const paint = (state) => {
    const frame = ballFrame(state, { width, height });
    group.current?.setAttribute('transform', `translate(${frame.x} ${frame.y}) rotate(${frame.spin})`);
    squash.current?.setAttribute('transform', `scale(${frame.scaleX} ${frame.scaleY})`);
    shadow.current?.setAttribute(
      'transform',
      `translate(${frame.shadow.x} ${frame.shadow.y}) scale(${frame.shadow.scaleX} ${frame.shadow.scaleY})`
    );
    shadow.current?.setAttribute('opacity', String(frame.shadow.opacity));
  };

  const advance = (dt) => {
    if (!ball.current) ball.current = createBall({ width, height });
    let next = stepBall(ball.current, dt, { width, height });
    // Two seconds of lying still, and it is thrown again.
    if (ballShouldRestart(next)) next = createBall({ width, height });
    ball.current = next;
    paint(next);
  };

  usePhysicsLoop(paused || reduced.current, advance);

  // Held still (a thumbnail, or reduced motion): show it mid-flight.
  useEffect(() => {
    if (!paused) return;
    ball.current = createBall({ width, height });
    warmUp(0.7, advance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, width, height]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <rect className="mb-floor" x="0" y={height - 74} width={width} height="74" />
      <ellipse ref={shadow} className="mb-ball-shadow" cx="0" cy="0" rx="58" ry="13" />
      <g ref={group}>
        <g ref={squash}>
          <circle className="mb-ball" cx="0" cy="0" r={BALL_DEFAULTS.radius} />
          <ellipse
            className="mb-ball-shine"
            cx={-BALL_DEFAULTS.radius * 0.34}
            cy={-BALL_DEFAULTS.radius * 0.4}
            rx="15"
            ry="11"
          />
        </g>
      </g>
    </svg>
  );
}


/**
 * Coins thrown from one hand at the lower left, one after another. Each is given its
 * own impulse and its own rate of flipping, so they scatter and settle on whichever
 * face its turning earned it. A settled coin lingers, then is cleared away and the
 * next one is thrown.
 */
function FallingCoinScene({ width, height, paused }) {
  const slots = useRef([]);
  const faces = useRef([]);
  const coins = useRef([]);
  const sinceThrow = useRef(0);
  const thrown = useRef(0);
  const reduced = useReducedMotion();

  /** The first slot that is free, so a coin keeps its own element while it lives. */
  const freeSlot = () => {
    const used = new Set(coins.current.map((coin) => coin.slot));
    for (let index = 0; index < COIN_SLOTS; index += 1) if (!used.has(index)) return index;
    return -1;
  };

  const throwCoin = () => {
    const slot = freeSlot();
    if (slot < 0) return;
    const coin = createCoin({ width, height, index: thrown.current });
    thrown.current += 1;
    coins.current = [...coins.current, { ...coin, slot }];
  };

  const paint = () => {
    for (let slot = 0; slot < COIN_SLOTS; slot += 1) {
      const node = slots.current[slot];
      const coin = coins.current.find((entry) => entry.slot === slot);
      if (!node) continue;
      if (!coin) {
        node.setAttribute('display', 'none');
        continue;
      }
      const frame = coinFrame(coin);
      node.setAttribute('display', 'inline');
      node.setAttribute(
        'transform',
        `translate(${frame.x} ${frame.y}) rotate(${frame.plane}) scale(${frame.scaleX || 0.001} 1)`
      );
      // The side facing the viewer: the same maths that decided where it lands.
      const face = faces.current[slot];
      face?.heads?.setAttribute('display', frame.face === 'heads' ? 'inline' : 'none');
      face?.tails?.setAttribute('display', frame.face === 'tails' ? 'inline' : 'none');
    }
  };

  const advance = (dt) => {
    coins.current = coins.current
      .map((coin) => ({ ...stepCoin(coin, dt, { width, height }), slot: coin.slot }))
      .filter((coin) => !coinShouldClear(coin));
    sinceThrow.current += dt * 1000;
    if (sinceThrow.current >= COIN_DEFAULTS.spawnMs) {
      sinceThrow.current = 0;
      throwCoin();
    }
    paint();
  };

  usePhysicsLoop(paused || reduced.current, advance);

  useEffect(() => {
    if (!paused) return;
    coins.current = [];
    sinceThrow.current = 0;
    // Held still: coins already in the air and a few on the floor.
    warmUp(1.1, advance);
    warmUp(0.9, advance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, width, height]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <rect className="mb-floor" x="0" y={height - 40} width={width} height="40" />
      {Array.from({ length: COIN_SLOTS }, (_, slot) => (
        <g
          key={slot}
          ref={(node) => {
            slots.current[slot] = node;
          }}
          display="none"
        >
          {/* A coin is a disc: the rim is drawn once, the two faces are swapped as it flips. */}
          <circle className="mb-coin-rim" cx="0" cy="0" r={COIN_DEFAULTS.radius} />
          <g
            ref={(node) => {
              faces.current[slot] = { ...(faces.current[slot] || {}), heads: node };
            }}
          >
            <circle className="mb-coin-face" cx="0" cy="0" r={COIN_DEFAULTS.radius - 4} />
            <circle className="mb-coin-mark" cx="0" cy="0" r={COIN_DEFAULTS.radius * 0.4} />
            <circle className="mb-coin-mark-fill" cx="0" cy="0" r={COIN_DEFAULTS.radius * 0.17} />
          </g>
          <g
            ref={(node) => {
              faces.current[slot] = { ...(faces.current[slot] || {}), tails: node };
            }}
          >
            <circle className="mb-coin-face" cx="0" cy="0" r={COIN_DEFAULTS.radius - 4} />
            <path
              className="mb-coin-mark"
              d={`M 0 ${-COIN_DEFAULTS.radius * 0.62} L ${COIN_DEFAULTS.radius * 0.2} ${-COIN_DEFAULTS.radius * 0.2} L ${COIN_DEFAULTS.radius * 0.62} ${-COIN_DEFAULTS.radius * 0.14} L ${COIN_DEFAULTS.radius * 0.28} ${COIN_DEFAULTS.radius * 0.14} L ${COIN_DEFAULTS.radius * 0.4} ${COIN_DEFAULTS.radius * 0.56} L 0 ${COIN_DEFAULTS.radius * 0.32} L ${-COIN_DEFAULTS.radius * 0.4} ${COIN_DEFAULTS.radius * 0.56} L ${-COIN_DEFAULTS.radius * 0.28} ${COIN_DEFAULTS.radius * 0.14} L ${-COIN_DEFAULTS.radius * 0.62} ${-COIN_DEFAULTS.radius * 0.14} L ${-COIN_DEFAULTS.radius * 0.2} ${-COIN_DEFAULTS.radius * 0.2} Z`}
            />
          </g>
        </g>
      ))}
    </svg>
  );
}


/* ----------------------------------------------------------------------- *
 * The scenes CSS animates on its own
 * ----------------------------------------------------------------------- */

function OpenBookScene({ width, height }) {
  const cx = width / 2;
  const top = height * 0.56;
  const spread = Math.min(width * 0.32, 380);
  const lift = height * 0.13;
  const depth = height * 0.1;
  const leftPage = `M ${cx} ${top} L ${cx - spread} ${top + lift} L ${cx - spread} ${top + lift + depth} L ${cx} ${top + depth} Z`;
  const rightPage = `M ${cx} ${top} L ${cx + spread} ${top + lift} L ${cx + spread} ${top + lift + depth} L ${cx} ${top + depth} Z`;
  const leafOrigin = `${cx}px ${top + lift * 0.5}px`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <g className="mb-book">
        <path
          className="mb-book-cover"
          d={`M ${cx - spread} ${top + lift} L ${cx} ${top} L ${cx + spread} ${top + lift} L ${cx + spread} ${top + lift + depth * 1.2} L ${cx} ${top + depth * 1.2} L ${cx - spread} ${top + lift + depth * 1.2} Z`}
        />
        <path className="mb-book-page" d={leftPage} />
        <path className="mb-book-page" d={rightPage} />
        {[0.035, 0.065, 0.095].map((offset) => (
          <g key={offset}>
            <path
              className="mb-book-line"
              d={`M ${cx - spread * 0.86} ${top + lift * 0.9 + height * offset} L ${cx - spread * 0.16} ${top + lift * 0.24 + height * offset}`}
            />
            <path
              className="mb-book-line"
              d={`M ${cx + spread * 0.16} ${top + lift * 0.24 + height * offset} L ${cx + spread * 0.86} ${top + lift * 0.9 + height * offset}`}
            />
          </g>
        ))}
        <path className="mb-book-spine" d={`M ${cx} ${top} L ${cx} ${top + depth}`} />
        <g className="mb-book-leaf" style={{ transformOrigin: leafOrigin, animationDelay: '0.5s' }}>
          <path d={leftPage} />
        </g>
        <g className="mb-book-leaf" style={{ transformOrigin: leafOrigin, animationDelay: '1.6s' }}>
          <path d={rightPage} />
        </g>
      </g>
    </svg>
  );
}

function KeyboardScene({ width, height }) {
  const keys = 14;
  const boardWidth = Math.min(width * 0.72, 920);
  const boardX = (width - boardWidth) / 2;
  const boardY = height * 0.58;
  const boardHeight = height * 0.3;
  const keyWidth = (boardWidth - 60) / keys;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <g className="mb-keyboard" style={{ transformOrigin: `${width / 2}px ${boardY + boardHeight / 2}px` }}>
        <rect className="mb-keyboard-body" x={boardX} y={boardY} width={boardWidth} height={boardHeight} rx="24" />
        {Array.from({ length: keys }, (_, key) => (
          <rect
            key={key}
            className="mb-key"
            x={boardX + 30 + key * keyWidth}
            y={boardY + boardHeight * 0.16}
            width={keyWidth * 0.82}
            height={boardHeight * 0.7}
            rx="9"
            style={{ animationDelay: `${((key * 0.21) % 1.9).toFixed(2)}s` }}
          />
        ))}
        {[1, 2, 4, 5, 6, 8, 9, 11, 12].map((key) => (
          <rect
            key={`sharp-${key}`}
            className="mb-key-sharp"
            x={boardX + 30 + key * keyWidth + keyWidth * 0.2}
            y={boardY + boardHeight * 0.16}
            width={keyWidth * 0.42}
            height={boardHeight * 0.4}
            rx="7"
            style={{ animationDelay: `${((key * 0.27) % 1.9).toFixed(2)}s` }}
          />
        ))}
      </g>
    </svg>
  );
}

function MicrophoneScene({ width, height }) {
  const cx = width / 2;
  const scale = Math.min(width / 1280, height / 720);
  const bodyWidth = 100 * scale;
  const bodyHeight = 270 * scale;
  const top = height * 0.2;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <g className="mb-mic">
        <rect
          className="mb-mic-handle"
          x={cx - bodyWidth * 0.32}
          y={top + bodyHeight * 0.92}
          width={bodyWidth * 0.64}
          height={bodyHeight * 0.78}
          rx={bodyWidth * 0.26}
        />
        <rect
          className="mb-mic-body"
          x={cx - bodyWidth / 2}
          y={top}
          width={bodyWidth}
          height={bodyHeight}
          rx={bodyWidth / 2}
        />
        {[0.08, 0.2, 0.32].map((offset) => (
          <path
            key={offset}
            className="mb-mic-grille"
            d={`M ${cx - bodyWidth * 0.4} ${top + bodyHeight * offset} L ${cx + bodyWidth * 0.4} ${top + bodyHeight * offset}`}
          />
        ))}
        <circle className="mb-mic-light" cx={cx} cy={top + bodyHeight * 0.8} r={9 * scale + 3} />
      </g>
    </svg>
  );
}

const SCENES = {
  bouncingBall: BouncingBallScene,
  fallingCoin: FallingCoinScene,
  openBook: OpenBookScene,
  keyboard: KeyboardScene,
  microphone: MicrophoneScene,
};

/**
 * One motion scene, sized to the slide it sits behind.
 *
 * `paused` holds it still: a thumbnail rail should not run a simulation (or decode a
 * video) for every slide at once.
 */
export function MotionScene({ id, width = 1280, height = 720, paused = false, style }) {
  const Scene = SCENES[id];
  if (!Scene) return null;
  return (
    <div className={`motion-bg motion-${id}${paused ? ' paused' : ''}`} style={style}>
      <Scene width={width} height={height} paused={paused} />
    </div>
  );
}

export const SCENE_IDS = Object.keys(SCENES);
