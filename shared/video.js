/**
 * Online videos — YouTube and Vimeo links, shared by the PPTX importer and the
 * editor.
 *
 * A deck can point at a video that lives on the web: PowerPoint stores the link
 * in an external relationship next to a poster frame, and the link is what has to
 * play. This module turns such a link into something the presentation can show
 * (an embed URL for the provider's player, plus a thumbnail for the poster), and
 * is dependency free so both the server and the browser can use it.
 */

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
]);

const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);

/** A provider video id: long enough to be real, and URL safe. */
const ID_RE = /^[A-Za-z0-9_-]{5,64}$/;

/** `t=1h2m3s`, `start=90`, `#t=90` → seconds. */
function toSeconds(value) {
  if (value === undefined || value === null || value === '') return null;
  const text = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const match = text.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i);
  if (!match) return null;
  const [, hours, minutes, seconds] = match;
  if (hours === undefined && minutes === undefined && seconds === undefined) return null;
  return Number(hours || 0) * 3600 + Number(minutes || 0) * 60 + Number(seconds || 0);
}

function fromHash(hash) {
  const match = String(hash || '').match(/t=([^&]+)/);
  return match ? toSeconds(decodeURIComponent(match[1])) : null;
}

/**
 * Read a link into `{ provider, id, list, start, watchUrl, thumbnailUrl }`.
 * Returns null for anything that is not a playable online video.
 */
export function parseOnlineVideo(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(parsed.protocol)) return null;
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.replace(/\/+$/, '');
  const start = toSeconds(parsed.searchParams.get('start') ?? parsed.searchParams.get('t')) ?? fromHash(parsed.hash);

  if (host === 'youtu.be') {
    const id = path.slice(1).split('/')[0];
    if (!ID_RE.test(id)) return null;
    return {
      provider: 'youtube',
      id,
      list: parsed.searchParams.get('list') || null,
      start,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (YOUTUBE_HOSTS.has(host)) {
    const segments = path.split('/').filter(Boolean);
    const fromPath = ['embed', 'v', 'shorts', 'live', 'e'].includes(segments[0]) ? segments[1] : null;
    const id = parsed.searchParams.get('v') || fromPath;
    const list = parsed.searchParams.get('list') || null;
    if (!id) {
      // A playlist-only link still plays, through the videoseries player.
      if (!list) return null;
      return {
        provider: 'youtube',
        id: null,
        list,
        start,
        watchUrl: `https://www.youtube.com/playlist?list=${list}`,
        thumbnailUrl: null,
      };
    }
    if (!ID_RE.test(id)) return null;
    return {
      provider: 'youtube',
      id,
      list,
      start,
      watchUrl: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (VIMEO_HOSTS.has(host)) {
    const id = (path.match(/\/(?:video\/)?(\d{6,})/) || [])[1];
    if (!id) return null;
    return {
      provider: 'vimeo',
      id,
      list: null,
      start,
      watchUrl: `https://vimeo.com/${id}`,
      thumbnailUrl: null,
    };
  }

  return null;
}

/** True when the link is an online video this app can play inside a slide. */
export function isOnlineVideo(url) {
  return Boolean(parseOnlineVideo(url));
}

/** A direct media file (`.mp4`, …) that a `<video>` element can play on its own. */
export function isDirectVideoFile(url) {
  return /\.(mp4|m4v|mov|webm|ogv|ogg|avi|mkv)(\?.*)?$/i.test(String(url || ''));
}

/**
 * The URL to load in the player iframe, or null when the link is not a provider
 * video. `autoplay` is used when a show starts the video for the audience.
 */
export function onlineVideoEmbedUrl(source, { autoplay = false, start = null, muted = false } = {}) {
  const video = typeof source === 'string' ? parseOnlineVideo(source) : source;
  if (!video) return null;
  const at = start ?? video.start ?? null;
  const params = new URLSearchParams();
  params.set('autoplay', autoplay ? '1' : '0');
  if (at) params.set('start', String(at));
  if (muted) params.set('mute', '1');
  if (video.provider === 'youtube') {
    params.set('rel', '0');
    params.set('playsinline', '1');
    params.set('modestbranding', '1');
    if (video.list) params.set('list', video.list);
    const path = video.id ? `/embed/${video.id}` : '/embed/videoseries';
    return `https://www.youtube-nocookie.com${path}?${params.toString()}`;
  }
  if (video.provider === 'vimeo') {
    return `https://player.vimeo.com/video/${video.id}?${params.toString()}`;
  }
  return null;
}

/** A short label for the editor, e.g. "YouTube video". */
export function onlineVideoLabel(url) {
  const video = parseOnlineVideo(url);
  if (!video) return 'Video';
  return video.provider === 'youtube' ? 'YouTube video' : video.provider === 'vimeo' ? 'Vimeo video' : 'Video';
}
