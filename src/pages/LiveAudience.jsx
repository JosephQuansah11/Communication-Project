import { useEffect, useRef, useState } from 'react';
import Stage from '../components/Stage.jsx';
import Icon from '../components/Icon.jsx';
import MediaLightbox from '../components/MediaLightbox.jsx';
import AnnotationLayer from '../components/AnnotationLayer.jsx';
import { normalizeDeck } from '../lib/elements.js';
import { wsUrl } from '../lib/api.js';

const EMOJIS = ['👏', '🎉', '❤️', '😮', '👍'];

export default function LiveAudience({ code: rawCode }) {
  const code = String(rawCode || '').toUpperCase();
  const [status, setStatus] = useState('connecting');
  const [error, setError] = useState('');
  const [deck, setDeck] = useState(null);
  const [index, setIndex] = useState(0);
  const [step, setStep] = useState(0);
  const [viewers, setViewers] = useState(0);
  const [pointer, setPointer] = useState(null);
  const [blank, setBlank] = useState('none');
  const [annotations, setAnnotations] = useState({});
  const [reactions, setReactions] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [chrome, setChrome] = useState(true);
  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const pointerTimer = useRef(null);
  const hideTimer = useRef(null);
  const nameRef = useRef(`Guest ${Math.floor(100 + Math.random() * 900)}`);

  const flashChrome = () => {
    setChrome(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setChrome(false), 5000);
  };

  useEffect(() => {
    flashChrome();
    return () => clearTimeout(hideTimer.current);
  }, []);

  useEffect(() => {
    if (!code) {
      setStatus('error');
      setError('Missing session code.');
      return undefined;
    }
    let closed = false;
    const connect = () => {
      if (closed) return;
      setStatus((current) => (current === 'live' ? 'live' : 'connecting'));
      let ws;
      try {
        ws = new WebSocket(wsUrl());
      } catch {
        setStatus('error');
        setError('WebSocket is not available in this browser.');
        return;
      }
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'join', code, name: nameRef.current }));
      };
      ws.onmessage = (event) => {
        let message;
        try {
          message = JSON.parse(event.data);
        } catch {
          return;
        }
        if (message.type === 'session') {
          setDeck(normalizeDeck(message.deck));
          setIndex(message.slideIndex || 0);
          setStep(message.step || 0);
          setBlank(message.blank || 'none');
          setAnnotations(message.annotations || {});
          setStatus('live');
          setError('');
        }
        if (message.type === 'navigate') {
          setIndex(message.slideIndex || 0);
          setStep(message.step || 0);
        }
        if (message.type === 'deck') {
          setDeck(normalizeDeck(message.deck));
          setIndex(message.slideIndex || 0);
        }
        if (message.type === 'table') {
          setDeck((current) => {
            if (!current) return current;
            return {
              ...current,
              slides: current.slides.map((slide, slideIndex) =>
                slideIndex === message.slideIndex
                  ? {
                      ...slide,
                      elements: slide.elements.map((element) =>
                        element.id === message.elementId ? { ...element, table: message.table } : element
                      ),
                    }
                  : slide
              ),
            };
          });
        }
        if (message.type === 'viewers') setViewers(message.count || 0);
        if (message.type === 'pointer') {
          setPointer({ x: message.x, y: message.y, name: message.name });
          clearTimeout(pointerTimer.current);
          pointerTimer.current = setTimeout(() => setPointer(null), 1800);
        }
        // Blanking (B / W) and the presenter's drawings follow the show.
        if (message.type === 'blank') setBlank(message.blank || 'none');
        if (message.type === 'annotation') {
          setAnnotations((current) => ({ ...current, [message.slideIndex || 0]: message.strokes || [] }));
        }
        if (message.type === 'reaction') {
          const id = `${Date.now()}-${Math.random()}`;
          setReactions((current) => [...current, { id, emoji: message.emoji, name: message.name, x: 10 + Math.random() * 80 }]);
          setTimeout(() => setReactions((current) => current.filter((item) => item.id !== id)), 3000);
        }
        if (message.type === 'ended') {
          closed = true;
          setStatus('ended');
          ws.close();
        }
        if (message.type === 'error') {
          setStatus('error');
          setError(message.error);
          closed = true;
          ws.close();
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setStatus('connecting');
        reconnectRef.current = setTimeout(connect, 2000);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(reconnectRef.current);
      clearTimeout(pointerTimer.current);
      wsRef.current?.close();
    };
  }, [code]);

  const sendReaction = (emoji) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'reaction', emoji }));
    }
  };

  if (status === 'error') {
    return (
      <div className="center-screen dark">
        <Icon name="wifi" size={41} />
        <h2>Live session unavailable</h2>
        <p>{error || 'This session has ended or the code is incorrect.'}</p>
        <a className="primary-btn" href="/">Back to Slidesmith</a>
      </div>
    );
  }

  if (status === 'ended') {
    return (
      <div className="center-screen dark">
        <Icon name="check" size={41} />
        <h2>The presentation has ended</h2>
        <p>Thanks for watching. You can close this window.</p>
        <a className="primary-btn" href="/">Back to Slidesmith</a>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="audience-waiting">
        <div className="waiting-card">
          <span className="brand-mark large"><Icon name="logo" size={36} /></span>
          <h2>Joining live session</h2>
          <strong className="waiting-code">{code}</strong>
          <div className="live-waiting"><span className="pulse-dot" /> Waiting for the presenter…</div>
        </div>
      </div>
    );
  }

  const slide = deck.slides[Math.min(index, deck.slides.length - 1)];

  return (
    <div className={`audience ${chrome ? 'chrome-on' : 'chrome-off'}`} onMouseMove={flashChrome}>
      <div className="audience-stage" onClick={() => flashChrome()}>
        {blank === 'none' ? (
          <Stage
            deck={deck}
            slide={slide}
            mode="contain"
            onMediaExpand={setLightbox}
            animStep={step}
            overlay={<AnnotationLayer strokes={annotations[index] || []} className="present-annotations" />}
          />
        ) : (
          <div className={`blackout-screen ${blank}`} />
        )}
        {pointer && (
          <div className="remote-pointer" style={{ left: `${pointer.x}%`, top: `${pointer.y}%` }}>
            <span className="remote-cursor" />
            <span className="remote-name">{pointer.name}</span>
          </div>
        )}
        <div className="reaction-layer" aria-live="polite">
          {reactions.map((reaction) => (
            <span key={reaction.id} className="reaction-float" style={{ left: `${reaction.x}%` }} title={reaction.name}>
              {reaction.emoji}
            </span>
          ))}
        </div>
        {status === 'connecting' && (
          <div className="reconnect-banner"><span className="pulse-dot" /> Reconnecting to the live session…</div>
        )}
      </div>

      <header className="audience-topbar">
        <div className="audience-brand">
          <span className="brand-mark"><Icon name="logo" size={22} /></span>
          <div>
            <strong>{deck.title}</strong>
            <small>Live from the presenter</small>
          </div>
        </div>
        <div className="audience-meta">
          <span className="audience-viewers"><Icon name="users" size={17} /> {viewers || 1}</span>
          <span className="live-pill connected"><span className="live-dot" /> LIVE</span>
          <button
            type="button"
            className="ghost-btn icon-only light"
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen();
              else document.documentElement.requestFullscreen?.().catch(() => {});
            }}
            title="Full screen"
          >
            <Icon name="expand" />
          </button>
        </div>
      </header>

      <footer className="audience-bottombar">
        <span className="audience-slide">Slide {index + 1} / {deck.slides.length}</span>
        <div className="reaction-bar">
          <span>React</span>
          {EMOJIS.map((emoji) => (
            <button type="button" key={emoji} onClick={() => sendReaction(emoji)} title={`Send ${emoji}`}>
              {emoji}
            </button>
          ))}
        </div>
        <span className="audience-hint">Synced over WebSocket</span>
      </footer>

      {lightbox && <MediaLightbox element={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}
