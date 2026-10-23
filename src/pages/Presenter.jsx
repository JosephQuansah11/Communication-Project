import { useEffect, useMemo, useRef, useState } from 'react';
import Stage from '../components/Stage.jsx';
import SlideView from '../components/SlideView.jsx';
import Icon from '../components/Icon.jsx';
import MediaLightbox from '../components/MediaLightbox.jsx';
import TableEditor from '../components/TableEditor.jsx';
import { normalizeDeck } from '../lib/elements.js';
import { fetchDeck, liveUrl, saveDeck, wsUrl } from '../lib/api.js';

const params = new URLSearchParams(window.location.search);
const initialLive = params.get('live') === '1';
const initialFill = params.get('fill') === '1';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function Presenter({ deckId, navigate }) {
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState('');
  const [index, setIndex] = useState(0);
  const [lightbox, setLightbox] = useState(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [livePanel, setLivePanel] = useState(false);
  const [live, setLive] = useState(initialLive);
  const [fillMode, setFillMode] = useState(initialFill);
  const [session, setSession] = useState({ code: null, status: initialLive ? 'connecting' : 'off', error: '' });
  const [viewers, setViewers] = useState({ count: 0, list: [] });
  const [reactions, setReactions] = useState([]);
  const [blackout, setBlackout] = useState(false);
  const [tableMenu, setTableMenu] = useState(false);
  const [tableId, setTableId] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [chrome, setChrome] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState('');

  const wsRef = useRef(null);
  const reconnectRef = useRef(null);
  const deckRef = useRef(null);
  const indexRef = useRef(0);
  const serverUpdated = useRef(null);
  const pointerStamp = useRef(0);
  const hideTimer = useRef(null);
  const saveTimer = useRef(null);
  const started = useRef(Date.now());

  deckRef.current = deck;
  indexRef.current = index;

  const slide = deck?.slides?.[index] || null;
  const nextSlide = deck?.slides?.[index + 1] || null;
  const tables = useMemo(() => slide?.elements?.filter((element) => element.type === 'table') || [], [slide]);
  const tableTarget = tables.find((element) => element.id === tableId) || null;

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
      window.opener?.postMessage({ type: 'slidesmith:presenter-ready' }, window.location.origin);
    } catch {
      /* ignore */
    }
    const onKey = async (event) => {
      if (event.key === 'f' || event.key === 'F') {
        event.preventDefault();
        if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
        else await document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    window.addEventListener('keydown', onKey);
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => window.removeEventListener('keydown', onKey);
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
      channel = new BroadcastChannel(`slidesmith-${deckId}`);
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
            wsRef.current.send(JSON.stringify({ type: 'deck:update', deck: normalized }));
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
              { type: 'slidesmith:live', code: message.code, url: liveUrl(message.code) },
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

  const goTo = (target) => {
    if (!deck) return;
    const next = Math.max(0, Math.min(deck.slides.length - 1, target));
    setIndex(next);
    indexRef.current = next;
    setLightbox(null);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'navigate', slideIndex: next }));
    }
  };

  const exit = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'end' }));
    }
    if (window.opener && !window.opener.closed) window.close();
    else navigate(`/edit/${deckId}`);
  };

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
        goTo(indexRef.current + 1);
      }
      if (key === 'ArrowLeft' || key === 'PageUp') {
        event.preventDefault();
        goTo(indexRef.current - 1);
      }
      if (key === 'Home') goTo(0);
      if (key === 'End') goTo(deck?.slides.length - 1 || 0);
      if (key === 'b' || key === 'B') setBlackout((value) => !value);
      if (key === 'n' || key === 'N') setNotesOpen((value) => !value);
      if (key === 'l' || key === 'L') setLivePanel((value) => !value);
      if (key === 'h' || key === 'H') setChrome((value) => !value);
      if (key === 'Escape') {
        if (lightbox) return setLightbox(null);
        if (tableId) return setTableId(null);
        if (blackout) return setBlackout(false);
        exit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (error) {
    return (
      <div className="center-screen dark">
        <Icon name="info" size={32} />
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
    <div className={`presenter ${chrome ? 'chrome-on' : 'chrome-off'}`} onMouseMove={() => flashChrome()}>
      <div
        className="present-stage"
        onPointerMove={sendPointer}
        onClick={(event) => {
          if (event.target.closest('.stage-content')) return;
          goTo(index + 1);
        }}
      >
        {blackout ? (
          <div className="blackout-screen">
            <button type="button" className="ghost-btn" onClick={() => setBlackout(false)}>
              Blackout · press B to resume
            </button>
          </div>
        ) : (
          <Stage
            deck={deck}
            slide={slide}
            mode={fillMode ? 'cover' : 'contain'}
            onMediaExpand={setLightbox}
            onTableDoubleClick={(element) => setTableId(element.id)}
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

      {chrome && (
        <>
          <header className="present-topbar">
            <div className="present-title">
              <span className="present-brand"><Icon name="logo" size={18} /></span>
              <div>
                <strong>{deck.title}</strong>
                <small>Slide {index + 1} of {deck.slides.length}</small>
              </div>
            </div>
            <div className="present-meta">
              <span className="timer"><Icon name="clock" size={14} /> {formatTime(elapsed)}</span>
              <button
                type="button"
                className="ghost-btn icon-only light"
                title="Toggle full screen (F)"
                onClick={async () => {
                  if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
                  else await document.documentElement.requestFullscreen().catch(() => {});
                }}
              >
                <Icon name="expand" size={17} />
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
            <i style={{ width: `${((index + 1) / deck.slides.length) * 100}%` }} />
          </div>

          <footer className="present-bottombar">
            <div className="present-nav">
              <button type="button" className="present-round" onClick={() => goTo(index - 1)} disabled={index === 0} title="Previous">
                <Icon name="chevronLeft" size={22} />
              </button>
              <span className="present-counter">{index + 1}<em>/</em>{deck.slides.length}</span>
              <button type="button" className="present-round" onClick={() => goTo(index + 1)} disabled={index >= deck.slides.length - 1} title="Next">
                <Icon name="chevronRight" size={22} />
              </button>
            </div>
            <div className="present-tools">
              <button type="button" className={`present-tool ${notesOpen ? 'on' : ''}`} onClick={() => setNotesOpen((value) => !value)} title="Speaker notes (N)">
                <Icon name="file" size={17} /><span>Notes</span>
              </button>
              <button type="button" className={`present-tool ${blackout ? 'on' : ''}`} onClick={() => setBlackout((value) => !value)} title="Blackout (B)">
                <Icon name="eye" size={17} /><span>Blackout</span>
              </button>
              <button type="button" className={`present-tool ${fillMode ? 'on' : ''}`} onClick={() => setFillMode((value) => !value)} title="Fill screen with content">
                <Icon name="expand" size={17} /><span>Fill</span>
              </button>
              <div className="table-menu-wrap">
                <button type="button" className="present-tool" onClick={openTables} title="Edit tables live">
                  <Icon name="table" size={17} /><span>Edit table</span>
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
                        <Icon name="table" size={14} /> Table {tableIndex + 1} · {element.table.rows}×{element.table.cols}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button type="button" className={`present-tool ${livePanel ? 'on' : ''}`} onClick={() => setLivePanel((value) => !value)} title="Live session (L)">
                <Icon name="wifi" size={17} /><span>Live</span>
                {live && viewers.count > 0 && <i className="viewer-badge">{viewers.count}</i>}
              </button>
            </div>
          </footer>
        </>
      )}


      {notesOpen && (
        <aside className="presenter-notes">
          <header>
            <h3>Speaker notes</h3>
            <button type="button" className="ghost-btn icon-only" onClick={() => setNotesOpen(false)}>
              <Icon name="close" size={15} />
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

      {livePanel && (
        <aside className="live-panel">
          <header>
            <div>
              <span className="eyebrow">Live audience</span>
              <h3>{live ? (session.status === 'connected' ? 'Room is open' : 'Connecting…') : 'Not live yet'}</h3>
            </div>
            <button type="button" className="ghost-btn icon-only" onClick={() => setLivePanel(false)}>
              <Icon name="close" size={15} />
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
                  <Icon name={copied ? 'check' : 'link'} size={15} /> {copied ? 'Copied' : 'Copy link'}
                </button>
                <a className="ghost-btn" href={`/live/${session.code}`} target="_blank" rel="noreferrer">
                  <Icon name="external" size={15} /> Open audience
                </a>
              </div>
              <div className="viewer-block">
                <div className="viewer-head">
                  <Icon name="users" size={15} />
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
                <Icon name="stop" size={14} /> End live session
              </button>
            </>
          ) : (
            <>
              <p className="dialog-note">
                Open a WebSocket room to mirror every slide, table edit and your cursor to the audience.
              </p>
              {session.error && <p className="dialog-error">{session.error}</p>}
              <button type="button" className="wide-btn strong" onClick={toggleLive}>
                <Icon name="wifi" size={15} /> Start live session
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
          <Icon name="info" size={15} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  );
}


