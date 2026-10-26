import { useEffect, useRef } from 'react';
import { motionBackgroundCss, normalizeBackgroundVideo, videoBackgroundCss } from '../lib/motionBackgrounds.js';

/**
 * A looping video as a slide background.
 *
 * Muted, looping and inline, which is the only combination a browser plays without
 * asking. `paused` is for thumbnails: they show the first frame instead of decoding
 * a video per slide in the rail.
 */
function VideoBackground({ video, paused = false }) {
  const ref = useRef(null);
  const clip = normalizeBackgroundVideo(video);

  useEffect(() => {
    const node = ref.current;
    if (!node || !clip) return undefined;
    // React sets `muted` as a property, but a re-render can race the autoplay policy,
    // so it is forced here too and playback is retried once the file is ready.
    node.muted = clip.muted !== false;
    if (paused) {
      node.pause?.();
      return undefined;
    }
    const play = () => node.play?.().catch(() => {});
    play();
    node.addEventListener('canplay', play);
    return () => node.removeEventListener('canplay', play);
  }, [clip?.src, clip?.muted, paused]);

  if (!clip) return null;
  return (
    <video
      ref={ref}
      className="background-video"
      src={clip.src}
      style={videoBackgroundCss(clip)}
      autoPlay={!paused}
      muted={clip.muted !== false}
      loop={clip.loop !== false}
      playsInline
      preload={paused ? 'metadata' : 'auto'}
      aria-hidden="true"
      tabIndex={-1}
    />
  );
}

/* ----------------------------------------------------------------------- *
 * The scenes
 *
 * Every scene is drawn in the slide's own coordinate space (1280 × 720) and animated
 * by CSS classes in styles.css, so it scales with the slide and loops forever. The
 * shapes are deliberately simple: a background must not compete with the words on
 * top of it.
 * ----------------------------------------------------------------------- */

function BouncingBallScene() {
  return (
    <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMax slice">
      <rect className="mb-floor" x="0" y="640" width="1280" height="80" />
      <ellipse className="mb-ball-shadow" cx="0" cy="646" rx="58" ry="14" />
      <circle className="mb-ball" cx="0" cy="0" r="52" />
    </svg>
  );
}

function FallingCoinScene() {
  return (
    <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
      {[120, 330, 520, 760, 950, 1150].map((x, index) => (
        <g key={x} className="mb-coin" style={{ '--coin-x': `${x}px`, animationDelay: `${index * 0.55}s` }}>
          <ellipse className="mb-coin-face" cx="0" cy="0" rx="46" ry="46" />
          <ellipse className="mb-coin-inner" cx="0" cy="0" rx="30" ry="30" />
        </g>
      ))}
    </svg>
  );
}

function OpenBookScene() {
  return (
    <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet">
      <g className="mb-book">
        <path className="mb-book-cover" d="M340 470 L640 400 L940 470 L940 560 L640 490 L340 560 Z" />
        <path className="mb-book-page" d="M640 400 L340 470 L340 556 L640 486 Z" />
        <path className="mb-book-page" d="M640 400 L940 470 L940 556 L640 486 Z" />
        <path className="mb-book-line" d="M380 470 L600 418" />
        <path className="mb-book-line" d="M380 496 L600 444" />
        <path className="mb-book-line" d="M380 522 L600 470" />
        <path className="mb-book-line" d="M680 418 L900 470" />
        <path className="mb-book-line" d="M680 444 L900 496" />
        <path className="mb-book-line" d="M680 470 L900 522" />
        <path className="mb-book-spine" d="M640 400 L640 486" />
        <g className="mb-book-leaf" style={{ animationDelay: '0.5s' }}>
          <path d="M640 400 L340 470 L340 556 L640 486 Z" />
        </g>
        <g className="mb-book-leaf" style={{ animationDelay: '1.6s' }}>
          <path d="M640 400 L940 470 L940 556 L640 486 Z" />
        </g>
      </g>
    </svg>
  );
}

function KeyboardScene() {
  const keys = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  return (
    <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet">
      <g className="mb-keyboard">
        <rect className="mb-keyboard-body" x="180" y="420" width="920" height="220" rx="26" />
        {keys.map((key) => (
          <rect
            key={key}
            className="mb-key"
            x={206 + key * 63}
            y={452}
            width="54"
            height="150"
            rx="10"
            style={{ animationDelay: `${(key * 0.21) % 1.9}s` }}
          />
        ))}
        {[1, 2, 4, 5, 6, 8, 9, 11, 12].map((key) => (
          <rect
            key={`sharp-${key}`}
            className="mb-key-sharp"
            x={232 + key * 63}
            y={452}
            width="34"
            height="86"
            rx="8"
            style={{ animationDelay: `${(key * 0.27) % 1.9}s` }}
          />
        ))}
      </g>
    </svg>
  );
}

function MicrophoneScene() {
  return (
    <svg viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid meet">
      <g className="mb-mic">
        <rect className="mb-mic-handle" x="608" y="430" width="64" height="210" rx="26" />
        <rect className="mb-mic-body" x="590" y="180" width="100" height="270" rx="50" />
        <path className="mb-mic-grille" d="M600 200 L680 200" />
        <path className="mb-mic-grille" d="M596 232 L684 232" />
        <path className="mb-mic-grille" d="M596 264 L684 264" />
        <circle className="mb-mic-light" cx="640" cy="396" r="10" />
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
 * One motion scene on its own — the same markup the slide background uses, so the
 * inspector's preset buttons preview exactly what a slide will get.
 */
export function MotionScene({ id, paused = false, style }) {
  const Scene = SCENES[id];
  if (!Scene) return null;
  return (
    <div className={`motion-bg motion-${id}${paused ? ' paused' : ''}`} style={style}>
      <Scene />
    </div>
  );
}

/**
 * The motion scene and/or looping video behind a slide.
 *
 * `paused` stops both (thumbnails): the rail would otherwise decode a video and run
 * a scene for every slide at once.
 */
export default function BackgroundMedia({ background, paused = false }) {
  const motion = background?.motion || null;
  const video = background?.video || null;
  const motionStyles = motionBackgroundCss(motion);
  if (!motion?.id && !video) return null;
  return (
    <div className="background-media" aria-hidden="true">
      {motion?.id ? <MotionScene id={motion.id} paused={paused} style={motionStyles} /> : null}
      {video ? <VideoBackground video={video} paused={paused} /> : null}
    </div>
  );
}
