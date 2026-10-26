import { useEffect, useMemo, useRef, useState } from 'react';
import Stage from '../components/Stage.jsx';
import SlideView from '../components/SlideView.jsx';
import Icon from '../components/Icon.jsx';
import MediaLightbox from '../components/MediaLightbox.jsx';
import TableEditor from '../components/TableEditor.jsx';
import AnnotationLayer, {
  ANNOTATION_TOOLS,
  PEN_COLORS,
  annotationTool,
  newStroke,
  strokeAt,
} from '../components/AnnotationLayer.jsx';
import { normalizeDeck } from '../lib/elements.js';
import { createThrottle } from '../lib/throttle.js';
import { animationStepCount, animationsForStep } from '../../shared/animations.js';
import { fetchDeck, liveUrl, saveDeck, wsUrl } from '../lib/api.js';

const params = new URLSearchParams(window.location.search);
const initialLive = params.get('live') === '1';
const initialFill = params.get('fill') === '1';
/** Full screen is requested by default; `?fs=0` keeps the presenter windowed. */
const wantsFullscreen = params.get('fs') !== '0';
/** `?output=1` renders the audience-facing show only, driven by the console window. */
const isOutput = params.get('output') === '1';
/**
 * `?show=1,3,5` runs a custom slide show: only those slides (1-based, in this
 * order) are presented, without touching the deck itself.
 */
const showParam = params.get('show');
const requestedShow = showParam
  ? [...new Set(showParam.split(',').map((value) => Number(value) - 1))]
      .filter((value) => Number.isInteger(value) && value >= 0)
      .sort((a, b) => a - b)
  : null;

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function Presenter({ deckId, navigate }) {
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [livePanel, setLivePanel] = useState(false);
  const [live, setLive] = useState(initialLive);
  const [fillMode, setFillMode] = useState(initialFill);
  const [session, setSession] = useState({ code: null, status: initialLive ? 'connecting' : 'off', error: '' });
  const [viewers, setViewers] = useState({ count: 0, list: [] });
  const [reactions, setReactions] = useState([]);
  const [blank, setBlank] = useState('none'); // 'none' | 'black' | 'white'
  const [tool, setTool] = useState('pointer');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  /** Drawings per deck slide index: `{ 0: [stroke, …], 3: [...] }`. */
  const [annotations, setAnnotations] = useState({});
  const [liveStroke, setLiveStroke] = useState(null);
  const [laser, setLaser] = useState(null);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [tableMenu, setTableMenu] = useState(false);
  const [tableId, setTableId] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');
  const [fsPrompt, setFsPrompt] = useState(false);
  const [hasOutput, setHasOutput] = useState(false);
  const showChannel = useRef(null);
  const lastMoveRef = useRef('forward');
  /** Latest show state, so channel messages never read stale values. */
  const presentStateRef = useRef({ index: 0, step: 0, blank: 'none', fillMode: false, annotations: {} });
  /** Latest navigation handlers, for messages arriving from the output window. */
  const controlsRef = useRef({});

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const deckRef = useRef(null);
  const indexRef = useRef(0);
  const stepRef = useRef(0);
  /** Position inside the running order (custom shows included). */
  const positionRef = useRef(0);
  /** Points captured so far for the stroke being drawn. */
  const strokeRef = useRef(null);
  const serverUpdated = useRef(null);
  const pointerStamp = useRef(0);
  const hideTimer = useRef(null);
  const saveTimer = useRef(null);
  const started = useRef(Date.now());
  /** True once the viewer has left the presentation, so exit runs only once. */
  const leavingRef = useRef(false);
  /** Set while the app itself leaves full screen, so that is not mistaken for Esc. */
  const suppressFullscreenExitRef = useRef(false);
  /** True once we have actually been in full screen during this session. */
  const fullscreenSeenRef = useRef(false);
  /** Always points at the latest `exit`, for the fullscreen listener. */
  const exitRef = useRef(null);

  /**
   * Enter or leave true full screen — the same takeover F11 performs, but driven
   * by the Fullscreen API so the presenter stays in control of the transition.
   */
  const toggleFullscreen = async () => {
    if (document.fullscreenElement) {
      suppressFullscreenExitRef.current = true;
      try {
        await document.exitFullscreen();
      } catch {
        suppressFullscreenExitRef.current = false;
      }
      return;
    }
    await document.documentElement.requestFullscreen().catch(() => {});
  };

  const slide = deck?.slides?.[index] || null;
  const tables = useMemo(() => slide?.elements?.filter((element) => element.type === 'table') || [], [slide]);
  const tableTarget = tables.find((element) => element.id === tableId) || null;
  const slideAnimations = slide?.animations || [];
  const stepCount = animationStepCount(slideAnimations);

  /**
   * The running order of the show: every slide, or the custom subset chosen in
   * the Set Up Show dialog. Navigation always moves along this list.
   */
  const showList = useMemo(() => {
    const total = deck?.slides?.length || 0;
    if (!total) return [];
    const list = (requestedShow || []).filter((value) => value < total);
    return list.length ? list : deck.slides.map((_, slideIndex) => slideIndex);
  }, [deck, requestedShow]);
  const position = Math.max(0, showList.indexOf(index));
  const isCustomShow = Boolean(requestedShow?.length) && showList.length !== (deck?.slides?.length || 0);
  /** Up next in the running order (custom shows included). */
  const nextSlide = deck?.slides?.[showList[position + 1]] || null;
  const slideStrokes = annotations[index] || [];
  const drawing = tool !== 'pointer' && tool !== 'eraser';
  const activeTool = annotationTool(tool);

  /**
   * Mirror the latest values into refs so listeners and the output window always
   * read fresh state. This must run *after* the values above are derived —
   * `position` is a `const`, so touching it any earlier is a temporal dead zone
   * error (`Cannot access 'position' before initialization`).
   */
  deckRef.current = deck;
  indexRef.current = index;
  stepRef.current = step;
  positionRef.current = position;

  // The laser only lives while the laser tool (or its mirror) is active.
  useEffect(() => {
    if (tool !== 'laser') setLaser(null);
  }, [tool]);

  /**
   * With a custom show, snap to the first slide of the running order when the
   * requested start slide is not part of the subset.
   */
  useEffect(() => {
    if (!deck || !requestedShow?.length || !showList.length) return;
    if (showList.includes(index)) return;
    setIndex(showList[0]);
    indexRef.current = showList[0];
    positionRef.current = 0;
  }, [deck, index, showList]);

  // Keep the step inside the current slide (deck updates can shrink the timeline).
  useEffect(() => {
    if (step > stepCount) {
      setStep(stepCount);
      stepRef.current = stepCount;
    }
  }, [step, stepCount]);

  /* ------------------------------------------------------------------ *
   * Audience output window
   *
   * The presenter console drives the show; the output window on the audience
   * display is a pure follower, so both screens stay exactly in step — including
   * the animation step.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    let channel = null;
    try {
      channel = new BroadcastChannel(`quandrion-show-${deckId}`);
    } catch {
      channel = null;
    }
    showChannel.current = channel;
    if (!channel) return undefined;

    channel.onmessage = (event) => {
      const message = event.data || {};
      if (isOutput) {
        if (message.type === 'state') {
          const nextIndex = Number(message.slideIndex) || 0;
          const nextStep = Number(message.step) || 0;
          setIndex(nextIndex);
          indexRef.current = nextIndex;
          setStep(nextStep);
          stepRef.current = nextStep;
          setBlank(message.blank || 'none');
          setFillMode(Boolean(message.fillMode));
          setAnnotations(message.annotations || {});
          setLaser(message.laser || null);
        }
        if (message.type === 'ended') window.close();
        return;
      }
      if (message.type === 'hello') {
        setHasOutput(true);
        channel.postMessage({ type: 'state', ...presentStateRef.current });
      }
      if (message.type === 'closed') setHasOutput(false);
      if (message.type === 'next') controlsRef.current.advance?.();
      if (message.type === 'prev') controlsRef.current.retreat?.();
      if (message.type === 'exit') controlsRef.current.exit?.();
    };

    if (isOutput) channel.postMessage({ type: 'hello' });
    return () => {
      if (isOutput) channel.postMessage({ type: 'closed' });
      // The console closing (Esc, the exit button or the window's �) takes the
      // audience window with it.
      else channel.postMessage({ type: 'ended' });
      channel.onmessage = null;
      channel.close();
      showChannel.current = null;
    };
  }, [deckId, isOutput]);

  // Push every show change to the output window.
  useEffect(() => {
    if (isOutput) return;
    showChannel.current?.postMessage({ type: 'state', slideIndex: index, step, blank, fillMode, annotations, laser });
  }, [index, step, blank, fillMode, annotations, laser, isOutput]);

  /**
   * Sends over the live socket are throttled: a drawing stroke or a laser trail
   * fires on every mouse move, and the audience does not need more than a dozen
   * updates a second. The first message still goes out immediately.
   */
  const sendThrottled = useRef(null);
  if (!sendThrottled.current) {
    sendThrottled.current = createThrottle((payload) => {
      const socket = wsRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    }, 80);
  }

  /** A deck update carries the whole deck, so it goes out at most twice a second. */
  const pushDeckUpdate = useRef(null);
  if (!pushDeckUpdate.current) {
    pushDeckUpdate.current = createThrottle((payload) => {
      const socket = wsRef.current;
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
    }, 500);
  }

  /** Mirror blanking and drawings to the live audience over WebSocket. */
  useEffect(() => {
    if (isOutput || !live) return;
    sendThrottled.current({ type: 'blank', blank });
  }, [blank, isOutput, live]);

  useEffect(() => {
    if (isOutput || !live) return;
    sendThrottled.current({ type: 'annotation', slideIndex: index, strokes: annotations[index] || [] });
  }, [annotations, index, isOutput, live]);

  /**
   * Steps the deck authored as "after previous" / "with previous" play by
   * themselves once the slide appears, exactly like PowerPoint — no extra click.
   */
  useEffect(() => {
    if (isOutput || !deck || blank !== 'none') return undefined;
    if (lastMoveRef.current === 'back') return undefined;
    const pending = animationsForStep(slide?.animations, step);
    if (!pending.length || !pending.every((animation) => animation.auto)) return undefined;
    const delay = Math.max(...pending.map((animation) => animation.autoDelay || 0));
    const timer = setTimeout(() => controlsRef.current.advance?.(), Math.max(150, delay));
    return () => clearTimeout(timer);
  }, [step, index, deck, slide, isOutput, blank]);

  useEffect(() => {
    let alive = true;
    fetchDeck(deckId)
      .then(({ deck: loaded }) => {
        if (!alive) return;
        const normalized = normalizeDeck(loaded);
        setDeck(normalized);
        serverUpdated.current = normalized.updatedAt;
        const startIndex = Math.max(0, Math.min(normalized.slides.length - 1, Number(params.get('slide')) || 0));
        setIndex(startIndex);
      })
      .catch((err) => alive && setError(err.message));
    return () => {
      alive = false;
    };
  }, [deckId]);

  useEffect(() => {
    if (!deck) return undefined;
    try {
      window.opener?.postMessage({ type: 'quandrion:presenter-ready' }, window.location.origin);
    } catch {
      /* ignore */
    }
    const onKey = (event) => {
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);

    // Registered before the full screen request so the transition is never missed.
    const onFullscreenChange = () => {
      const inFullscreen = Boolean(document.fullscreenElement);
      setFsPrompt(false);
      if (inFullscreen) {
        fullscreenSeenRef.current = true;
        return;
      }
      const suppressed = suppressFullscreenExitRef.current;
      suppressFullscreenExitRef.current = false;
      // Leaving full screen without the app asking for it means the viewer pressed
      // Esc (or F11). That ends the presentation instead of dropping back into a
      // windowed browser frame, which is what Escape means while presenting.
      if (!suppressed && fullscreenSeenRef.current && !leavingRef.current) {
        fullscreenSeenRef.current = false;
        exitRef.current?.();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);

    // Take over the whole screen rather than sitting inside a browser window.
    // The pop-up inherits the click that opened it, so this normally succeeds
    // straight away; if it is refused we ask for one click instead.
    const enterFullscreen = async () => {
      if (!wantsFullscreen || document.fullscreenElement) return true;
      try {
        await document.documentElement.requestFullscreen();
        setFsPrompt(false);
        return true;
      } catch {
        return false;
      }
    };
    const onGesture = () => {
      enterFullscreen();
    };
    enterFullscreen().then((ok) => {
      if (!ok) {
        setFsPrompt(true);
        window.addEventListener('pointerdown', onGesture, { once: true });
      }
    });

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onGesture);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
    };
  }, [Boolean(deck)]);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((Date.now() - started.current) / 1000), 1000);
    return () => {
      clearInterval(timer);
      clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!deck) return undefined;
    let channel;
    try {
      channel = new BroadcastChannel(`quandrion-${deckId}`);
    } catch {
      channel = null;
    }
    const refresh = async () => {
      try {
        const { deck: loaded } = await fetchDeck(deckId);
        if (!loaded) return;
        const updated = loaded.updatedAt;
        if (updated && updated !== serverUpdated.current) {
          serverUpdated.current = updated;
          const normalized = normalizeDeck(loaded);
          setDeck(normalized);
          setIndex((current) => Math.min(current, normalized.slides.length - 1));
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            // A whole deck per file change is heavy: at most one every half second.
            pushDeckUpdate.current({ type: 'deck:update', deck: normalized });
          }
        }
      } catch {
        /* keep presenting offline */
      }
    };
    if (channel) channel.onmessage = () => refresh();
    const poll = setInterval(refresh, 3000);
    return () => {
      channel?.close();
      clearInterval(poll);
    };
  }, [deckId, Boolean(deck)]);

  useEffect(() => {
    if (!live || !deck) return undefined;
    let closed = false;
    const connect = () => {
      if (closed) return;
      setSession((current) => ({ ...current, status: current.code ? 'reconnecting' : 'connecting', error: '' }));
      let ws;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        setSession((current) => ({ ...current, status: 'error', error: 'WebSocket unavailable.' }));
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        if (closed) return;
        setSession((current) => ({ ...current, status: 'connected', error: '' }));
        ws.send(JSON.stringify({ type: 'host', deck: deckRef.current, slideIndex: indexRef.current }));
      };
      ws.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === 'hosted') {
          setSession({ code: message.code, status: 'connected', error: '' });
          try {
            window.opener?.postMessage(
              { type: 'quandrion:live', code: message.code, url: liveUrl(message.code) },
              window.location.origin
            );
          } catch {
            /* ignore */
          }
        }
        if (message.type === 'viewers') {
          setViewers({ count: message.count || 0, list: message.viewers || [] });
        }
        if (message.type === 'reaction') {
          const id = `${Date.now()}-${Math.random()}`;
          setReactions((current) => [...current, { id, emoji: message.emoji, name: message.name, x: 8 + Math.random() * 80 }]);
          setTimeout(() => setReactions((current) => current.filter((item) => item.id !== id)), 3200);
        }
        if (message.type === 'error') {
          setSession((current) => ({ ...current, error: message.error }));
        }
        if (message.type === 'ended') {
          setSession({ code: null, status: 'off', error: '' });
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setSession((current) => ({ ...current, status: 'reconnecting' }));
        reconnectRef.current = setTimeout(connect, 2200);
      };
      ws.onerror = () => {
        setSession((current) => ({ ...current, status: 'error', error: 'Live connection failed.' }));
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectRef.current);
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'end' }));
        } catch {
          /* ignore */
        }
      }
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [live, Boolean(deck)]);

  const flashChrome = () => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 4500);
  };

  useEffect(() => {
    flashChrome();
    return () => clearTimeout(hideTimer.current);
  }, []);

  /**
   * Jump to a position in the running order (custom shows included). Navigation
   * always walks the show list, never the raw deck.
   */
  const goToPosition = (target, targetStep = 0) => {
    if (!deck || !showList.length) return;
    const next = Math.max(0, Math.min(showList.length - 1, target));
    const slideIndex = showList[next];
    lastMoveRef.current = next < positionRef.current ? 'back' : 'forward';
    const steps = animationStepCount(deck.slides[slideIndex]?.animations);
    const nextStep = Math.max(0, Math.min(steps, targetStep));
    setIndex(slideIndex);
    indexRef.current = slideIndex;
    positionRef.current = next;
    setStep(nextStep);
    stepRef.current = nextStep;
    setLightbox(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'navigate', slideIndex, step: nextStep }));
    }
  };

  /**
   * Next click: play the next animation step, and only move on once the slide is
   * fully built — the same order PowerPoint uses.
   */
  const advance = () => {
    if (!deck) return;
    lastMoveRef.current = 'forward';
    if (stepRef.current < stepCount) {
      const next = stepRef.current + 1;
      setStep(next);
      stepRef.current = next;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'navigate', slideIndex: indexRef.current, step: next }));
      }
      return;
    }
    goToPosition(positionRef.current + 1, 0);
  };

  /** Back: undo the last animation step, then step back through slides. */
  const retreat = () => {
    if (!deck) return;
    lastMoveRef.current = 'back';
    if (stepRef.current > 0) {
      const next = stepRef.current - 1;
      setStep(next);
      stepRef.current = next;
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'navigate', slideIndex: indexRef.current, step: next }));
      }
      return;
    }
    if (positionRef.current <= 0) return;
    // Going back shows the previous slide fully built, like PowerPoint does.
    goToPosition(positionRef.current - 1, animationStepCount(deck.slides[showList[positionRef.current - 1]]?.animations));
  };

  /**
   * Leave full screen and stop presenting, returning to the editor. Escape and
   * the exit button both mean this, and it runs only once per session.
   */
  const exit = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    suppressFullscreenExitRef.current = true;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
    }
    // Tell the other window of the pair, so ending the show from either side takes
    // both of them down.
    try {
      showChannel.current?.postMessage({ type: 'ended' });
    } catch {
      /* the channel may already be gone */
    }
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    // The show window closes itself when the presentation ends — Esc, the End
    // presentation button and the last slide all come through here. A browser only
    // lets a script close a window it opened, so when this tab was not opened by
    // the editor the close is ignored and we fall back to the editor.
    window.close();
    setTimeout(() => {
      if (!window.closed) navigate(`/edit/${deckId}`);
    }, 250);
  };
  exitRef.current = exit;
  presentStateRef.current = { index, step, blank, fillMode, annotations };
  controlsRef.current = { advance, retreat, exit, goTo: goToPosition };

  const sendPointer = (event) => {
    const now = Date.now();
    if (now - pointerStamp.current < 60) return;
    pointerStamp.current = now;
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    wsRef.current.send(JSON.stringify({ type: 'pointer', x, y }));
  };

  /* ---------------------------------------------------------------- *
   * Annotations: laser, pen, highlighter and eraser
   * ---------------------------------------------------------------- */

  /** Where a pointer event sits inside the stage, in percentages. */
  const stagePoint = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const onStagePointerDown = (event) => {
    if (isOutput || tool === 'pointer') return;
    const point = stagePoint(event);
    if (tool === 'eraser') {
      eraseAt(point);
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (tool === 'laser') {
      setLaser(point);
      return;
    }
    strokeRef.current = newStroke(tool, point, { color: penColor });
    setLiveStroke(strokeRef.current);
  };

  const onStagePointerMove = (event) => {
    if (tool === 'laser') {
      setLaser(stagePoint(event));
      return;
    }
    if (isOutput) return;
    const stroke = strokeRef.current;
    if (!stroke) {
      sendPointer(event);
      return;
    }
    const point = stagePoint(event);
    const last = stroke.points[stroke.points.length - 1];
    // Skip points that are too close together — keeps the strokes small.
    if (last && Math.abs(last.x - point.x) + Math.abs(last.y - point.y) < 0.4) return;
    const next = { ...stroke, points: [...stroke.points, point] };
    strokeRef.current = next;
    setLiveStroke(next);
  };

  const onStagePointerUp = () => {
    const stroke = strokeRef.current;
    strokeRef.current = null;
    setLiveStroke(null);
    if (!stroke || stroke.points.length < 2) return;
    setAnnotations((current) => ({ ...current, [indexRef.current]: [...(current[indexRef.current] || []), stroke] }));
  };

  /** Remove the closest stroke to a point (the eraser). */
  const eraseAt = (point) => {
    setAnnotations((current) => {
      const strokes = current[indexRef.current] || [];
      const index = strokeAt(strokes, point);
      if (index < 0) return current;
      return { ...current, [indexRef.current]: strokes.filter((_, strokeIndex) => strokeIndex !== index) };
    });
  };

  const clearAnnotations = () => {
    setAnnotations((current) => ({ ...current, [indexRef.current]: [] }));
    setLiveStroke(null);
    setLaser(null);
  };

  const toggleBlank = (mode) => {
    setBlank((current) => (current === mode ? 'none' : mode));
  };

  const toggleLive = () => {
    if (live) {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'end' }));
      }
      setLive(false);
      setSession({ code: null, status: 'off', error: '' });
      setViewers({ count: 0, list: [] });
      setLivePanel(false);
    } else {
      setLive(true);
      setLivePanel(true);
    }
  };

  const handleTableChange = (table) => {
    if (!tableId) return;
    setDeck((current) => {
      const next = {
        ...current,
        slides: current.slides.map((item, slideIndex) =>
          slideIndex === indexRef.current
            ? {
                ...item,
                elements: item.elements.map((element) =>
                  element.id === tableId ? { ...element, table } : element
                ),
              }
            : item
        ),
      };
      deckRef.current = next;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveDeck(deckRef.current)
          .then(({ deck: saved }) => {
            serverUpdated.current = saved.updatedAt;
          })
          .catch(() => setToast('Could not save the live table edit.'));
      }, 700);
      return next;
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'table:update', slideIndex: indexRef.current, elementId: tableId, table }));
    }
  };

  const openTables = () => {
    if (!tables.length) {
      setToast('This slide has no tables to edit.');
      return;
    }
    if (tables.length === 1) {
      setTableId(tables[0].id);
      return;
    }
    setTableMenu((value) => !value);
  };

  const copyLink = async () => {
    if (!session.code) return;
    try {
      await navigator.clipboard.writeText(liveUrl(session.code));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setToast('Copy failed — select the link manually.');
    }
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const handler = (event) => {
      if (event.target?.tagName === 'INPUT' || event.target?.tagName === 'TEXTAREA') return;
      const key = event.key;
      if (key === 'ArrowRight' || key === ' ' || key === 'PageDown') {
        event.preventDefault();
        if (isOutput) showChannel.current?.postMessage({ type: 'next' });
        else advance();
      }
      if (key === 'ArrowLeft' || key === 'PageUp') {
        event.preventDefault();
        if (isOutput) showChannel.current?.postMessage({ type: 'prev' });
        else retreat();
      }
      // Esc ends the show from the audience window too: it tells the console, which
      // ends the session, and closes itself either way.
      if (key === 'Escape' && isOutput) {
        event.preventDefault();
        try {
          showChannel.current?.postMessage({ type: 'exit' });
        } catch {
          /* the console may already be gone */
        }
        exit();
      }
      if (isOutput) return;
      const mod = event.ctrlKey || event.metaKey;
      // Annotation tools first: Ctrl+L must not fall through to the live panel.
      if (mod && key.toLowerCase() === 'l') {
        event.preventDefault();
        return setTool('laser');
      }
      if (mod && key.toLowerCase() === 'p') {
        event.preventDefault();
        return setTool('pen');
      }
      if (mod && key.toLowerCase() === 'h') {
        event.preventDefault();
        return setTool('highlighter');
      }
      if (mod && key.toLowerCase() === 'e') {
        event.preventDefault();
        return setTool('eraser');
      }
      if (mod && key.toLowerCase() === 'a') {
        event.preventDefault();
        return setTool('pointer');
      }
      if (key === 'Home') goToPosition(0, 0);
      if (key === 'End') goToPosition(showList.length - 1, 0);
      if (key === 'b' || key === 'B') toggleBlank('black');
      if (key === 'w' || key === 'W') toggleBlank('white');
      if (key === 'g' || key === 'G') setNavigatorOpen((value) => !value);
      if (key === 'n' || key === 'N') setNotesOpen((value) => !value);
      if (key === 'l' || key === 'L') setLivePanel((value) => !value);
      if (key === 'h' || key === 'H') setChrome((value) => !value);
      if (key === 'Escape') {
        if (navigatorOpen) return setNavigatorOpen(false);
        if (lightbox) return setLightbox(null);
        if (tableId) return setTableId(null);
        if (blank !== 'none') return setBlank('none');
        if (tool !== 'pointer') return setTool('pointer');
        exit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (error) {
    return (
      <div className="center-screen dark">
        <Icon name="info" size={38} />
        <h2>Could not start presenting</h2>
        <p>{error}</p>
        <button type="button" className="primary-btn" onClick={() => navigate('/')}>Back to library</button>
      </div>
    );
  }

  if (!deck || !slide) {
    return (
      <div className="center-screen dark">
        <div className="loader" />
        <p>Preparing presenter…</p>
      </div>
    );
  }

  return (
    <div
      className={`presenter ${chrome ? 'chrome-on' : 'chrome-off'} ${isOutput ? 'present-output' : ''}`}
      onMouseMove={() => {
        if (!isOutput) flashChrome();
      }}
    >
      {fsPrompt && (
        <button
          type="button"
          className="fs-prompt"
          onClick={async () => {
            await document.documentElement.requestFullscreen().catch(() => {});
            setFsPrompt(false);
          }}
        >
          <Icon name="expand" size={19} /> Click anywhere to present full screen
        </button>
      )}
      <div
        className={`present-stage${tool !== 'pointer' ? ' annotating' : ''}`}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        onPointerLeave={() => setLaser(null)}
        onClick={(event) => {
          if (tool !== 'pointer') return;
          if (event.target.closest('.stage-content')) return;
          if (isOutput) showChannel.current?.postMessage({ type: 'next' });
          else advance();
        }}
      >
        {blank !== 'none' ? (
          <div className={`blackout-screen ${blank}`}>
            <button type="button" className="ghost-btn light" onClick={() => setBlank('none')}>
              {blank === 'black' ? 'Black screen' : 'White screen'} · press {blank === 'black' ? 'B' : 'W'} to resume
            </button>
          </div>
        ) : (
          <Stage
            deck={deck}
            slide={slide}
            mode={fillMode ? 'cover' : 'contain'}
            onMediaExpand={setLightbox}
            onTableDoubleClick={(element) => setTableId(element.id)}
            animStep={step}
            overlay={
              <AnnotationLayer
                strokes={liveStroke ? [...slideStrokes, liveStroke] : slideStrokes}
                laser={laser}
                className="present-annotations"
              />
            }
          />
        )}
        <div className="reaction-layer" aria-live="polite">
          {reactions.map((reaction) => (
            <span key={reaction.id} className="reaction-float" style={{ left: `${reaction.x}%` }} title={reaction.name}>
              {reaction.emoji}
            </span>
          ))}
        </div>
      </div>

      {!isOutput && navigatorOpen && (
        <div className="navigator-overlay" onClick={() => setNavigatorOpen(false)}>
          <div className="navigator-panel" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>Slide navigator</strong>
                <small>
                  {isCustomShow
                    ? `Custom show · ${showList.length} of ${deck.slides.length} slides`
                    : `${deck.slides.length} slides`}
                </small>
              </div>
              <button type="button" className="ghost-btn icon-only light" onClick={() => setNavigatorOpen(false)} title="Close (Esc)">
                <Icon name="close" size={18} />
              </button>
            </header>
            <div className="navigator-grid">
              {showList.map((slideIndex, entryPosition) => (
                <button
                  key={`${slideIndex}-${entryPosition}`}
                  type="button"
                  className={`navigator-thumb${slideIndex === index ? ' on' : ''}`}
                  title={`Go to slide ${slideIndex + 1}`}
                  onClick={() => {
                    goToPosition(entryPosition, 0);
                    setNavigatorOpen(false);
                  }}
                >
                  <SlideView
                    slide={deck.slides[slideIndex]}
                    width={deck.width}
                    height={deck.height}
                    scale={200 / deck.width}
                    preview
                  />
                  <span>{entryPosition + 1}</span>
                </button>
              ))}
            </div>
            <footer>
              <span className="navigator-hint">
                Jump straight to any slide — the audience only ever sees the slide you pick.
              </span>
            </footer>
          </div>
        </div>
      )}

      {!isOutput && chrome && (
        <>
          <header className="present-topbar">
            <div className="present-title">
              <span className="present-brand"><Icon name="logo" size={22} /></span>
              <div>
                <strong>{deck.title}</strong>
                <small>
                  Slide {position + 1} of {showList.length}
                  {isCustomShow ? ` · custom show (slide ${index + 1} of ${deck.slides.length})` : ''}
                </small>
              </div>
            </div>
            <div className="present-meta">
              {isCustomShow && (
                <span className="present-output-chip" title="Only the slides picked in Set Up Show are being shown">
                  <Icon name="grid" size={14} /> Custom show
                </span>
              )}
              {tool !== 'pointer' && (
                <span className="present-output-chip" title="Annotation tool in use">
                  <Icon name={activeTool.icon} size={14} /> {activeTool.label}
                </span>
              )}
              {hasOutput && (
                <span className="present-output-chip" title="The audience display is mirroring this window, including animation steps">
                  <Icon name="monitor" size={14} /> Output live
                </span>
              )}
              {stepCount > 0 && (
                <span className={`present-step-chip ${step >= stepCount ? 'done' : ''}`} title="Animation steps — press → to play the next one">
                  <Icon name="sparkle" size={14} /> {Math.min(step, stepCount)}/{stepCount}
                </span>
              )}
              <span className="timer"><Icon name="clock" size={17} /> {formatTime(elapsed)}</span>
              <button
                type="button"
                className="ghost-btn icon-only light"
                title="Toggle full screen (F or F11)"
                onClick={() => toggleFullscreen()}
              >
                <Icon name="expand" size={20} />
              </button>
              <button
                type="button"
                className={`live-pill ${session.status}`}
                onClick={() => setLivePanel((value) => !value)}
                title="Live audience session (L)"
              >
                <span className="live-dot" />
                {live ? (session.code ? `LIVE · ${viewers.count}` : 'LIVE · connecting') : 'Go live'}
              </button>
              <button type="button" className="ghost-btn icon-only light" onClick={exit} title="Exit presenter (Esc)">
                <Icon name="close" />
              </button>
            </div>
          </header>

          <div className="present-progress">
            <i style={{ width: `${((position + 1) / Math.max(1, showList.length)) * 100}%` }} />
          </div>

          <footer className="present-bottombar">
            <div className="present-nav">
              <button type="button" className="present-round" onClick={() => goToPosition(position - 1)} disabled={position === 0} title="Previous">
                <Icon name="chevronLeft" size={26} />
              </button>
              <span className="present-counter">{position + 1}<em>/</em>{showList.length}</span>
              <button
                type="button"
                className="present-round"
                onClick={() => goToPosition(position + 1)}
                disabled={position >= showList.length - 1}
                title="Next"
              >
                <Icon name="chevronRight" size={26} />
              </button>
            </div>
            <div className="present-tools">
              <div className="present-tool-group" title="Annotation tools">
                {ANNOTATION_TOOLS.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`present-tool ${tool === entry.id ? 'on' : ''}`}
                    onClick={() => setTool(entry.id)}
                    title={`${entry.label} (${entry.shortcut})`}
                  >
                    <Icon name={entry.icon} size={20} />
                    <span>{entry.label}</span>
                  </button>
                ))}
                {drawing &&
                  PEN_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={`pen-swatch${penColor === color ? ' on' : ''}`}
                      style={{ background: color }}
                      title={`Pen colour ${color}`}
                      onClick={() => setPenColor(color)}
                    />
                  ))}
                <button
                  type="button"
                  className="present-tool"
                  onClick={clearAnnotations}
                  disabled={!slideStrokes.length}
                  title="Clear the drawings on this slide"
                >
                  <Icon name="clearFormat" size={20} /><span>Clear</span>
                </button>
              </div>
              <button
                type="button"
                className={`present-tool ${navigatorOpen ? 'on' : ''}`}
                onClick={() => setNavigatorOpen((value) => !value)}
                title="Slide navigator (G)"
              >
                <Icon name="grid" size={20} /><span>All slides</span>
              </button>
              <button type="button" className={`present-tool ${notesOpen ? 'on' : ''}`} onClick={() => setNotesOpen((value) => !value)} title="Speaker notes (N)">
                <Icon name="file" size={20} /><span>Notes</span>
              </button>
              <button type="button" className={`present-tool ${blank === 'black' ? 'on' : ''}`} onClick={() => toggleBlank('black')} title="Black screen (B)">
                <Icon name="stop" size={20} /><span>Black</span>
              </button>
              <button type="button" className={`present-tool ${blank === 'white' ? 'on' : ''}`} onClick={() => toggleBlank('white')} title="White screen (W)">
                <Icon name="monitor" size={20} /><span>White</span>
              </button>
              <button type="button" className={`present-tool ${fillMode ? 'on' : ''}`} onClick={() => setFillMode((value) => !value)} title="Fill screen with content">
                <Icon name="expand" size={20} /><span>Fill</span>
              </button>
              <div className="table-menu-wrap">
                <button type="button" className="present-tool" onClick={openTables} title="Edit tables live">
                  <Icon name="table" size={20} /><span>Edit table</span>
                </button>
                {tableMenu && (
                  <div className="table-chooser">
                    <strong>Edit a table</strong>
                    {tables.map((element, tableIndex) => (
                      <button
                        type="button"
                        key={element.id}
                        onClick={() => {
                          setTableId(element.id);
                          setTableMenu(false);
                        }}
                      >
                        <Icon name="table" size={17} /> Table {tableIndex + 1} · {element.table.rows}×{element.table.cols}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className={`present-tool ${livePanel ? 'on' : ''}`} onClick={() => setLivePanel((value) => !value)} title="Live session (L)">
                <Icon name="wifi" size={20} /><span>Live</span>
                {live && viewers.count > 0 && <i className="viewer-badge">{viewers.count}</i>}
              </button>
            </div>
          </footer>
        </>
      )}


      {!isOutput && notesOpen && (
        <aside className="presenter-notes">
          <header>
            <h3>Speaker notes</h3>
            <button type="button" className="ghost-btn icon-only" onClick={() => setNotesOpen(false)}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="notes-body">
            {slide.notes ? <p>{slide.notes}</p> : <p className="muted">No notes for this slide. Add them in the inspector.</p>}
          </div>
          <div className="next-preview">
            <span className="eyebrow">Up next</span>
            {nextSlide ? (
              <div className="next-frame">
                <SlideView slide={nextSlide} width={deck.width} height={deck.height} scale={240 / deck.width} preview />
              </div>
            ) : (
              <p className="muted">End of presentation</p>
            )}
          </div>
        </aside>
      )}

      {!isOutput && livePanel && (
        <aside className="live-panel">
          <header>
            <div>
              <span className="eyebrow">Live audience</span>
              <h3>{live ? (session.status === 'connected' ? 'Room is open' : 'Connecting…') : 'Not live yet'}</h3>
            </div>
            <button type="button" className="ghost-btn icon-only" onClick={() => setLivePanel(false)}>
              <Icon name="close" size={18} />
            </button>
          </header>
          {live && session.code ? (
            <>
              <div className="live-code-card">
                <span>Session code</span>
                <strong>{session.code}</strong>
              </div>
              <input className="live-url" readOnly value={liveUrl(session.code)} onFocus={(event) => event.target.select()} />
              <div className="row-gap">
                <button type="button" className="primary-btn small" onClick={copyLink}>
                  <Icon name={copied ? 'check' : 'link'} size={18} /> {copied ? 'Copied' : 'Copy link'}
                </button>
                <a className="ghost-btn" href={`/live/${session.code}`} target="_blank" rel="noreferrer">
                  <Icon name="external" size={18} /> Open audience
                </a>
              </div>
              <div className="viewer-block">
                <div className="viewer-head">
                  <Icon name="users" size={18} />
                  <strong>{viewers.count} watching</strong>
                </div>
                <div className="viewer-list">
                  {viewers.list.length ? viewers.list.map((name, i) => (
                    <span key={`${name}-${i}`} className="viewer-chip">{name}</span>
                  )) : <span className="muted">Share the link to invite people.</span>}
                </div>
              </div>
              {session.error && <p className="dialog-error">{session.error}</p>}
              <button type="button" className="wide-btn danger" onClick={toggleLive}>
                <Icon name="stop" size={17} /> End live session
              </button>
            </>
          ) : (
            <>
              <p className="dialog-note">
                Open a WebSocket room to mirror every slide, table edit and your cursor to the audience.
              </p>
              {session.error && <p className="dialog-error">{session.error}</p>}
              <button type="button" className="wide-btn strong" onClick={toggleLive}>
                <Icon name="wifi" size={18} /> Start live session
              </button>
            </>
          )}
        </aside>
      )}

      {lightbox && <MediaLightbox element={lightbox} onClose={() => setLightbox(null)} />}
      {tableTarget && (
        <TableEditor
          element={tableTarget}
          live
          onChange={handleTableChange}
          onClose={() => setTableId(null)}
        />
      )}
      {toast && (
        <div className="toast dark">
          <Icon name="info" size={18} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}


