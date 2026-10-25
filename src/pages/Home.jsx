import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import SlideView from '../components/SlideView.jsx';
import DocumentTabs from '../components/DocumentTabs.jsx';
import { useDocumentTabs } from '../hooks/useDocumentTabs.js';
import { emptyDeck, normalizeDeck } from '../lib/elements.js';
import { deleteDeck, fetchDeck, fetchDecks, importDeck, saveDeck } from '../lib/api.js';

const FEATURES = [
  { icon: 'import', title: 'PPTX & WPS import', text: 'Native slide tree, theme colours, tables and embedded media.' },
  { icon: 'table', title: 'Excel-grade tables', text: 'A1 formulas, ranges, number formats and 40+ functions.' },
  { icon: 'monitor', title: 'Multi-screen presenting', text: 'Pick a display; full screen, speaker notes and blackout built in.' },
  { icon: 'wifi', title: 'Live by WebSocket', text: 'Audience link syncs slides, tables, reactions and your cursor.' },
];

export default function Home({ navigate }) {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importState, setImportState] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const fileInput = useRef(null);
  const documentTabs = useDocumentTabs();

  /** Open a deck and remember it in the window's document tab strip. */
  const openDeck = (deck) => {
    documentTabs.register(deck);
    navigate(`/edit/${deck.id}`);
  };

  const load = () => {
    setLoading(true);
    fetchDecks()
      .then(({ decks: list }) => setDecks(list || []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleImport = async (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['pptx', 'ppt', 'dps', 'dpt', 'pt', 'pps', 'ppsx', 'potx'].includes(ext)) {
      setError('Choose a PowerPoint or WPS presentation (.pptx, .ppt, .dps, .dpt, .pt).');
      return;
    }
    setError('');
    setImportState({ name: file.name, progress: 0 });
    try {
      const { deck } = await importDeck(file, (progress) => setImportState((current) => ({ ...current, progress })));
      setImportState({ name: file.name, progress: 100 });
      openDeck(deck);
    } catch (err) {
      setError(err.message);
      setImportState(null);
    }
  };

  const createNew = async () => {
    setCreating(true);
    setError('');
    try {
      const deck = normalizeDeck(emptyDeck('Untitled presentation'));
      const { deck: saved } = await saveDeck(deck);
      openDeck(saved);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  };

  const removeDeck = async (id) => {
    if (!window.confirm('Delete this presentation? This cannot be undone.')) return;
    try {
      await deleteDeck(id);
      setDecks((current) => current.filter((deck) => deck.id !== id));
    } catch (err) {
      setError(err.message);
    }
  };

  const onDrop = (event) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleImport(file);
  };

  return (
    <div
      className="home"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget === event.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="home-nav">
        <a className="home-brand" href="/">
          <span className="brand-mark"><Icon name="logo" size={26} /></span>
          <span>Slidesmith <em>Studio</em></span>
        </a>
        <nav className="home-nav-links">
          <span className="nav-pill"><Icon name="font" size={16} /> System fonts</span>
          <span className="nav-pill"><Icon name="wifi" size={16} /> WebSocket live</span>
          <button type="button" className="ghost-btn" onClick={() => fileInput.current?.click()}>
            <Icon name="import" size={19} /> Import
          </button>
          <button type="button" className="primary-btn" onClick={createNew} disabled={creating}>
            <Icon name="plus" size={19} /> New presentation
          </button>
        </nav>
        <input
          ref={fileInput}
          type="file"
          accept=".pptx,.ppt,.dps,.dpt,.pt,.pps,.ppsx,.potx"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            handleImport(file);
          }}
        />
      </header>

      <DocumentTabs
        tabs={documentTabs.tabs}
        activeId={null}
        collapsed={documentTabs.collapsed}
        onSelect={(id) => navigate(`/edit/${id}`)}
        onClose={(id) => documentTabs.close(id)}
        onNew={createNew}
        onToggleCollapse={documentTabs.setCollapsed}
      />

      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow"><Icon name="sparkle" size={16} /> Presentation workspace</span>
          <h1>Slides that behave like <span className="gradient-text">spreadsheets</span>, presented like magic.</h1>
          <p>
            Import PowerPoint or WPS decks, edit every object, run Excel formulas inside tables, crop images into shapes,
            and present across screens with a live WebSocket audience.
          </p>
          <div className="hero-actions">
            <button type="button" className="primary-btn large" onClick={createNew} disabled={creating}>
              <Icon name="plus" size={22} /> Create a deck
            </button>
            <button type="button" className="ghost-btn large" onClick={() => fileInput.current?.click()}>
              <Icon name="import" size={22} /> Import PPTX / WPS
            </button>
          </div>
          <div className="hero-notes">
            <span><Icon name="check" size={16} /> No cloud account</span>
            <span><Icon name="check" size={16} /> Files stay on your machine</span>
            <span><Icon name="check" size={16} /> Fully keyboard driven</span>
          </div>
        </div>
        <div className="hero-visual">
          <div className="hero-slide hero-slide-back" />
          <div className="hero-slide hero-slide-mid" />
          <div className="hero-slide hero-slide-front">
            <div className="hero-slide-chrome"><i /><i /><i /></div>
            <div className="hero-slide-body">
              <span className="mini-eyebrow">SLIDESMITH</span>
              <strong>Ideas, in motion.</strong>
              <div className="mini-lines"><i /><i /><i /></div>
              <div className="mini-table">
                <span /><span /><span /><span /><span /><span /><span /><span /><span />
              </div>
            </div>
            <span className="float-chip chip-live"><span className="live-dot" /> 24 watching</span>
            <span className="float-chip chip-formula">=SUM(D2:D5)</span>
          </div>
        </div>
      </section>

      <section className="feature-strip">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="feature-item">
            <span className="feature-icon"><Icon name={feature.icon} size={22} /></span>
            <div>
              <strong>{feature.title}</strong>
              <span>{feature.text}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="library">
        <div className="library-head">
          <div>
            <h2>Your presentations</h2>
            <p>{loading ? 'Loading…' : `${decks.length} deck${decks.length === 1 ? '' : 's'} stored locally on this server`}</p>
          </div>
          <div className="library-actions">
            <form
              className="join-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (joinCode.trim()) navigate(`/live/${joinCode.trim().toUpperCase()}`);
              }}
            >
              <Icon name="wifi" size={18} />
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="Join live · code"
                maxLength={6}
                aria-label="Live session code"
              />
              <button type="submit" className="mini-btn">Join</button>
            </form>
            <button type="button" className="ghost-btn" onClick={load}>
              <Icon name="undo" size={18} /> Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="error-banner">
            <Icon name="info" size={19} />
            <span>{error}</span>
            <button type="button" className="mini-btn" onClick={() => setError('')}>Dismiss</button>
          </div>
        )}

        {loading ? (
          <div className="deck-grid">
            {[0, 1, 2].map((index) => <div key={index} className="deck-card skeleton" />)}
          </div>
        ) : decks.length === 0 ? (
          <div className="empty-library">
            <Icon name="folder" size={43} />
            <h3>No presentations yet</h3>
            <p>Create a blank deck or import a PowerPoint/WPS file to get started.</p>
            <div className="row-gap">
              <button type="button" className="primary-btn" onClick={createNew}>Create a deck</button>
              <button type="button" className="ghost-btn" onClick={() => fileInput.current?.click()}>Import a file</button>
            </div>
          </div>
        ) : (
          <div className="deck-grid">
            {decks.map((deck) => (
              <article
                key={deck.id}
                className="deck-card"
                onClick={() => openDeck(deck)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') openDeck(deck);
                }}
                tabIndex={0}
                role="button"
              >
                <div className="deck-thumb">
                  <DeckThumb id={deck.id} />
                  <div className="deck-hover">
                    <span><Icon name="eye" size={26} /> Open</span>
                  </div>
                  <div className="deck-badges">
                    <span className="badge">{deck.slides} slides</span>
                    {deck.id === 'demo' && <span className="badge accent">Tour</span>}
                  </div>
                </div>
                <div className="deck-info">
                  <div>
                    <strong>{deck.title}</strong>
                    <small>
                      Edited {new Date(deck.updatedAt || deck.createdAt).toLocaleDateString(undefined, {
                        month: 'short', day: 'numeric', year: 'numeric',
                      })}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="ghost-btn icon-only danger"
                    title="Delete presentation"
                    onClick={(event) => {
                      event.stopPropagation();
                      removeDeck(deck.id);
                    }}
                  >
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="home-footer">
        <div>
          <span className="brand-mark small"><Icon name="logo" size={18} /></span>
          <span>Slidesmith Studio</span>
        </div>
        <span>PowerPoint import · Excel tables · Multi-display presenting · WebSocket live sync</span>
      </footer>

      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            <Icon name="import" size={48} />
            <h2>Drop to import</h2>
            <p>.pptx, .ppt, .dps or .dpt — media is extracted automatically.</p>
          </div>
        </div>
      )}

      {importState && (
        <div className="modal-backdrop">
          <div className="import-card">
            <div className="import-orb"><Icon name="file" size={31} /></div>
            <h3>Importing presentation</h3>
            <p>{importState.name}</p>
            <div className="progress-track"><i style={{ width: `${Math.max(4, importState.progress)}%` }} /></div>
            <span className="import-percent">{importState.progress}%</span>
            <small>Unpacking slides, tables, theme colours and media…</small>
          </div>
        </div>
      )}
    </div>
  );
}

function DeckThumb({ id }) {
  const [deck, setDeck] = useState(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const boxRef = useRef(null);
  useEffect(() => {
    let alive = true;
    fetchDeck(id)
      .then(({ deck: loaded }) => alive && setDeck(normalizeDeck(loaded)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);

  // The thumbnail fills whatever the card gives it, so the library stays legible
  // at any window size instead of showing a small slide in a large card.
  useEffect(() => {
    const node = boxRef.current;
    if (!node) return undefined;
    const update = () => setBox({ w: node.clientWidth, h: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, [deck]);

  if (!deck) return <div className="thumb-loading" />;
  const scale = box.w && box.h ? Math.min(box.w / deck.width, box.h / deck.height) : 0;
  return (
    <div className="deck-thumb-inner" ref={boxRef}>
      {scale > 0 && (
        <SlideView slide={deck.slides[0]} width={deck.width} height={deck.height} scale={scale} preview />
      )}
    </div>
  );
}
