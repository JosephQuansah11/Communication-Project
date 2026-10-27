import { useEffect, useRef } from 'react';
import { motionBackgroundCss, normalizeBackgroundVideo, videoBackgroundCss } from '../lib/motionBackgrounds.js';
import { MotionScene } from './motionScenes.jsx';

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

/**
 * The motion scene and/or looping video behind a slide.
 *
 * `paused` stops both (thumbnails): the rail would otherwise run a simulation and
 * decode a video for every slide at once. `width`/`height` are the slide's own size,
 * which is the world the physics scenes move in.
 */
export default function BackgroundMedia({ background, width = 1280, height = 720, paused = false }) {
  const motion = background?.motion || null;
  const video = background?.video || null;
  const motionStyles = motionBackgroundCss(motion);
  if (!motion?.id && !video) return null;
  return (
    <div className="background-media" aria-hidden="true">
      {motion?.id ? (
        <MotionScene id={motion.id} width={width} height={height} paused={paused} style={motionStyles} />
      ) : null}
      {video ? <VideoBackground video={video} paused={paused} /> : null}
    </div>
  );
}