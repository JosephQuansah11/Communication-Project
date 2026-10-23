import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import EditorCanvas from '../components/EditorCanvas.jsx';
import Inspector from '../components/Inspector.jsx';
import SlideView from '../components/SlideView.jsx';
import TableEditor from '../components/TableEditor.jsx';
import MediaLightbox from '../components/MediaLightbox.jsx';
import PresentDialog from '../components/PresentDialog.jsx';
import { useHistoryDeck } from '../hooks/useHistoryDeck.js';
import { useSystemFonts } from '../lib/fonts.js';
import {
  createAudio,
  createImage,
  createShape,
  createSlide,
  createTable,
  createText,
  createVideo,
  duplicateElement,
  duplicateSlide,
  normalizeDeck,
} from '../lib/elements.js';
import { fetchDeck, saveDeck, uploadAsset } from '../lib/api.js';
import { resizeTable } from '../../shared/formula.js';
import { SHAPES } from '../lib/shapes.js';

export default function Editor({ deckId, navigate }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [editingTextId, setEditingTextId] = useState(null);
  const [slideId, setSlideId] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [shapeMenu, setShapeMenu] = useState(false);
  const [tableTargetId, setTableTargetId] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [presentOpen, setPresentOpen] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [toast, setToast] = useState(null);
  const [uploading, setUploading] = useState(false);
  const { deck, apply, preview, begin, end, undo, redo, reset, canUndo, canRedo } = useHistoryDeck(null);
  const mediaInput = useRef(null);
  const saveTimer = useRef(null);
  const channel = useRef(null);
  const lastSaved = useRef('');

  const { families: fonts, source: fontSource } = useSystemFonts(deck?.importedFonts || []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchDeck(deckId)
      .then(({ deck: loaded }) => {
        if (!alive) return;
        const normalized = normalizeDeck(loaded);
        reset(normalized);
        setSlideId(normalized.slides[0].id);
        lastSaved.current = JSON.stringify(normalized);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [deckId, reset]);

  useEffect(() => {
    if (!deck) return undefined;
    try {
      channel.current = new BroadcastChannel(`slidesmith-${deckId}`);
    } catch {
      channel.current = null;
    }
    return () => channel.current?.close();
  }, [deckId, Boolean(deck)]);

  useEffect(() => {
    if (!deck) return undefined;
    const serialized = JSON.stringify(deck);
    if (serialized === lastSaved.current) return undefined;
    setSaveState('saving');
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveDeck(deck)
        .then(({ deck: saved }) => {
          lastSaved.current = JSON.stringify(deck);
          setSaveState('saved');
          channel.current?.postMessage({ type: 'deck-updated', updatedAt: saved.updatedAt });
        })
        .catch(() => setSaveState('error'));
    }, 700);
    return () => clearTimeout(saveTimer.current);
  }, [deck]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3800);
    return () => clearTimeout(timer);
  }, [toast]);

  const slide = useMemo(
    () => deck?.slides.find((item) => item.id === slideId) || deck?.slides[0],
    [deck, slideId]
  );
  const selectedElement = useMemo(
    () => slide?.elements.find((element) => element.id === selectedId) || null,
    [slide, selectedId]
  );
  const tableTarget = useMemo(
    () => slide?.elements.find((element) => element.id === tableTargetId) || null,
    [slide, tableTargetId]
  );


  const patchSlide = (changes, record = true) => {
    const updater = (current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId
          ? {
              ...item,
              ...changes,
              background: changes.background ? { ...item.background, ...changes.background } : item.background,
            }
          : item
      ),
    });
    if (record) apply(updater);
    else preview(updater);
  };

  const patchElement = (id, changes, record = true) => {
    const updater = (current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId
          ? {
              ...item,
              elements: item.elements.map((element) => (element.id === id ? { ...element, ...changes } : element)),
            }
          : item
      ),
    });
    if (record) apply(updater);
    else preview(updater);
  };

  const deleteElement = (id = selectedId) => {
    if (!id) return;
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: item.elements.filter((element) => element.id !== id) } : item
      ),
    }));
    setSelectedId(null);
    setLightbox(null);
  };

  const duplicateSelected = () => {
    if (!selectedElement) return;
    const copy = duplicateElement(selectedElement);
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: [...item.elements, copy] } : item
      ),
    }));
    setSelectedId(copy.id);
  };

  const addElement = (element) => {
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: [...item.elements, element] } : item
      ),
    }));
    setSelectedId(element.id);
    return element;
  };

  const addSlide = () => {
    const next = createSlide({ background: { ...(slide?.background || {}) } });
    const index = deck.slides.findIndex((item) => item.id === slide.id);
    apply((current) => ({
      ...current,
      slides: [...current.slides.slice(0, index + 1), next, ...current.slides.slice(index + 1)],
    }));
    setSlideId(next.id);
    setSelectedId(null);
  };

  const cloneSlide = (id) => {
    const target = deck.slides.find((item) => item.id === id);
    if (!target) return;
    const copy = duplicateSlide(target);
    const index = deck.slides.findIndex((item) => item.id === id);
    apply((current) => ({
      ...current,
      slides: [...current.slides.slice(0, index + 1), copy, ...current.slides.slice(index + 1)],
    }));
    setSlideId(copy.id);
    setSelectedId(null);
  };

  const removeSlide = (id) => {
    if (deck.slides.length <= 1) {
      setToast({ type: 'error', message: 'A presentation needs at least one slide.' });
      return;
    }
    const index = deck.slides.findIndex((item) => item.id === id);
    apply((current) => ({ ...current, slides: current.slides.filter((item) => item.id !== id) }));
    if (slideId === id) {
      const fallback = deck.slides[Math.max(0, index - 1)];
      setSlideId(fallback.id);
      setSelectedId(null);
    }
  };

  const upload = async (file) => {
    if (!file) return null;
    setUploading(true);
    try {
      const asset = await uploadAsset(deck.id, file);
      return asset;
    } catch (err) {
      setToast({ type: 'error', message: err.message });
      return null;
    } finally {
      setUploading(false);
    }
  };

  const insertMedia = async (file, point) => {
    if (!file) return;
    const asset = await upload(file);
    if (!asset) return;
    const isVideo = file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name);
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|m4a|ogg)$/i.test(file.name);
    const width = Math.min(deck.width * 0.42, 480);
    const height = isAudio ? 130 : Math.round(width * 0.62);
    const x = Math.round(point?.x ?? (deck.width - width) / 2);
    const y = Math.round(point?.y ?? (deck.height - height) / 2);
    const common = {
      x: Math.max(0, Math.min(deck.width - width, x)),
      y: Math.max(0, Math.min(deck.height - height, y)),
      w: width,
      h: height,
      name: asset.name || file.name,
    };
    const element = isAudio
      ? createAudio(asset.url, common)
      : isVideo
        ? createVideo(asset.url, common)
        : createImage(asset.url, common);
    addElement(element);
    setToast({ type: 'success', message: `${isAudio ? 'Audio' : isVideo ? 'Video' : 'Image'} added to the slide.` });
  };

  const onDropFile = (file, point) => {
    if (
      /^image\/|^video\/|^audio\//.test(file.type) ||
      /\.(png|jpe?g|gif|webp|svg|mp4|webm|mov|mp3|wav|m4a|ogg)$/i.test(file.name)
    ) {
      insertMedia(file, point);
    } else {
      setToast({ type: 'error', message: 'Drop an image, video or audio file.' });
    }
  };

  const openTable = (element) => {
    begin();
    setTableTargetId(element.id);
  };

  const closeTable = () => {
    end();
    setTableTargetId(null);
  };

  const handleTableChange = (table) => {
    if (!tableTarget) return;
    preview((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId
          ? {
              ...item,
              elements: item.elements.map((element) =>
                element.id === tableTarget.id ? { ...element, table } : element
              ),
            }
          : item
      ),
    }));
  };

  const tableAction = (action, payload) => {
    if (!selectedElement || selectedElement.type !== 'table') return;
    const table = selectedElement.table;
    if (action === 'open') return openTable(selectedElement);
    if (action === 'resize') {
      const next = resizeTable(table, payload.rows || table.rows, payload.cols || table.cols);
      return patchElement(selectedElement.id, { table: next });
    }
    if (action === 'meta') return patchElement(selectedElement.id, { table: { ...table, ...payload } });
    if (action === 'even') {
      return patchElement(selectedElement.id, {
        table: {
          ...table,
          colWidths: Array(table.cols).fill(selectedElement.w / table.cols),
          rowHeights: Array(table.rows).fill(selectedElement.h / table.rows),
        },
      });
    }
  };

  const goSlide = (delta) => {
    if (!deck) return;
    const index = deck.slides.findIndex((item) => item.id === slideId);
    const next = Math.max(0, Math.min(deck.slides.length - 1, index + delta));
    setSlideId(deck.slides[next].id);
    setSelectedId(null);
    setEditingTextId(null);
  };

  const saveNow = () => {
    if (!deck) return;
    setSaveState('saving');
    saveDeck(deck)
      .then(() => {
        lastSaved.current = JSON.stringify(deck);
        setSaveState('saved');
        channel.current?.postMessage({ type: 'deck-updated', updatedAt: new Date().toISOString() });
      })
      .catch(() => setSaveState('error'));
  };

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (event.key === 'Escape') {
        if (shapeMenu) return setShapeMenu(false);
        if (tableTargetId) return closeTable();
        if (editingTextId) return setEditingTextId(null);
        if (lightbox) return setLightbox(null);
        if (presentOpen) return setPresentOpen(false);
        return setSelectedId(null);
      }
      if (typing) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        return saveNow();
      }
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        return event.shiftKey ? redo() : undo();
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        return duplicateSelected();
      }
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        return setSelectedId(slide?.elements[slide.elements.length - 1]?.id || null);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedId) {
          event.preventDefault();
          deleteElement(selectedId);
        }
        return;
      }
      if (event.key === 'ArrowLeft' && selectedElement) {
        event.preventDefault();
        return patchElement(selectedId, { x: selectedElement.x - (event.shiftKey ? 10 : 1) });
      }
      if (event.key === 'ArrowRight' && selectedElement) {
        event.preventDefault();
        return patchElement(selectedId, { x: selectedElement.x + (event.shiftKey ? 10 : 1) });
      }
      if (event.key === 'ArrowUp' && selectedElement) {
        event.preventDefault();
        return patchElement(selectedId, { y: selectedElement.y - (event.shiftKey ? 10 : 1) });
      }
      if (event.key === 'ArrowDown' && selectedElement) {
        event.preventDefault();
        return patchElement(selectedId, { y: selectedElement.y + (event.shiftKey ? 10 : 1) });
      }
      if (event.key === 'PageDown') {
        event.preventDefault();
        return goSlide(1);
      }
      if (event.key === 'PageUp') {
        event.preventDefault();
        return goSlide(-1);
      }
      if (event.key === 'F5') {
        event.preventDefault();
        setPresentOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (loading) {
    return (
      <div className="center-screen">
        <div className="loader" />
        <p>Opening presentation…</p>
      </div>
    );
  }

  if (error || !deck) {
    return (
      <div className="center-screen">
        <Icon name="info" size={32} />
        <h2>Could not open this presentation</h2>
        <p>{error || 'The deck could not be loaded.'}</p>
        <button type="button" className="primary-btn" onClick={() => navigate('/')}>Back to library</button>
      </div>
    );
  }

  const addShapeImage = async (file, shape) => {
    if (!file || !shape) return;
    const asset = await upload(file);
    if (!asset) return;
    const image = createImage(asset.url, {
      x: shape.x,
      y: shape.y,
      w: shape.w,
      h: shape.h,
      rotation: 0,
      clipShape: shape.shape === 'rect' ? 'none' : shape.shape,
      name: asset.name || file.name,
      radius: shape.shape === 'roundRect' ? shape.radius || 0 : 0,
    });
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) => {
        if (item.id !== slideId) return item;
        const index = item.elements.findIndex((element) => element.id === shape.id);
        const elements = [...item.elements];
        elements.splice(index < 0 ? elements.length : index, 0, image);
        return {
          ...item,
          elements: elements.map((element) =>
            element.id === shape.id ? { ...element, fill: 'transparent' } : element
          ),
        };
      }),
    }));
    setSelectedId(image.id);
    setToast({ type: 'success', message: 'Image masked into the shape.' });
  };

  const addTable = () => {
    const rows = 6;
    const cols = 4;
    const width = deck.width - 180;
    const labels = ['Column A', 'Column B', 'Column C', 'Column D'];
    const cells = {};
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cells[`${r},${c}`] = {
          value: r === 0 ? labels[c] : '',
          style: r === 0 ? { bg: '#1e293b', color: '#f8fafc', bold: true, fontSize: 15 } : { fontSize: 15 },
        };
      }
    }
    const table = createTable(rows, cols, {
      x: 90,
      y: 150,
      w: width,
      h: 320,
      table: {
        rows,
        cols,
        colWidths: Array(cols).fill(width / cols),
        rowHeights: Array(rows).fill(53),
        headerRow: true,
        headerCol: false,
        cells,
      },
    });
    addElement(table);
    openTable(table);
  };

  const saveLabel = saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Save failed' : 'Saved';
  const currentIndex = deck.slides.findIndex((item) => item.id === slide.id);
  const thumbWidth = 162;
  const thumbHeight = (thumbWidth * deck.height) / deck.width;

  return (
    <div className="editor-shell">
      <header className="editor-topbar">
        <button type="button" className="brand-mini" onClick={() => navigate('/')} title="Back to library">
          <span className="brand-mark"><Icon name="logo" size={20} /></span>
          <span className="brand-name">Slidesmith</span>
        </button>
        <div className="title-block">
          <input
            className="deck-title-input"
            value={deck.title}
            onChange={(event) => preview((current) => ({ ...current, title: event.target.value }))}
            aria-label="Presentation title"
          />
          <span className={`save-state ${saveState}`}>
            <Icon name={saveState === 'error' ? 'info' : 'check'} size={12} /> {uploading ? 'Uploading…' : saveLabel}
          </span>
        </div>
        <div className="top-actions">
          <span className="dimension-chip">{deck.width} × {deck.height}</span>
          <button type="button" className="ghost-btn icon-only" onClick={saveNow} title="Save (Ctrl+S)">
            <Icon name="save" size={17} />
          </button>
          <button type="button" className="primary-btn" onClick={() => setPresentOpen(true)}>
            <Icon name="presentation" size={17} /> Present
          </button>
        </div>
      </header>

      <div className="editor-main">
        <aside className="slide-rail">
          <div className="rail-head">
            <span>Slides</span>
            <button type="button" className="mini-btn" onClick={addSlide} title="Add slide">
              <Icon name="plus" size={14} />
            </button>
          </div>
          <div className="rail-scroll">
            {deck.slides.map((item, index) => (
              <div
                key={item.id}
                className={`slide-thumb ${item.id === slide.id ? 'active' : ''}`}
                onClick={() => {
                  setSlideId(item.id);
                  setSelectedId(null);
                  setEditingTextId(null);
                }}
                style={{ width: `${thumbWidth + 16}px` }}
              >
                <span className="thumb-index">{index + 1}</span>
                <div className="thumb-frame" style={{ height: `${thumbHeight}px` }}>
                  <SlideView slide={item} width={deck.width} height={deck.height} scale={thumbWidth / deck.width} preview />
                  <div className="thumb-actions">
                    <button
                      type="button"
                      title="Duplicate slide"
                      onClick={(event) => {
                        event.stopPropagation();
                        cloneSlide(item.id);
                      }}
                    >
                      <Icon name="copy" size={12} />
                    </button>
                    <button
                      type="button"
                      title="Delete slide"
                      onClick={(event) => {
                        event.stopPropagation();
                        removeSlide(item.id);
                      }}
                    >
                      <Icon name="trash" size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <button type="button" className="add-slide-btn" onClick={addSlide}>
              <Icon name="plus" size={15} /> New slide
            </button>
          </div>
          <div className="rail-foot">
            {deck.slides.length} slide{deck.slides.length === 1 ? '' : 's'}
          </div>
        </aside>

        <main className="editor-center">
          <div className="insert-toolbar">
            <div className="tool-group">
              <button
                type="button"
                className="tool-btn"
                onClick={() => {
                  const element = createText({
                    x: Math.round(deck.width * 0.12),
                    y: Math.round(deck.height * 0.22),
                    w: Math.round(deck.width * 0.5),
                    h: 140,
                  });
                  addElement(element);
                  setEditingTextId(element.id);
                }}
              >
                <Icon name="text" size={17} /> Text
              </button>
              <div className="tool-popover-wrap">
                <button type="button" className={`tool-btn ${shapeMenu ? 'active' : ''}`} onClick={() => setShapeMenu((value) => !value)}>
                  <Icon name="shape" size={17} /> Shape <Icon name="chevronDown" size={12} />
                </button>
                {shapeMenu && (
                  <div className="shape-popover">
                    <div className="shape-popover-head">
                      <strong>Shapes</strong>
                      <span>Fill, border and crop images inside</span>
                    </div>
                    <div className="shape-grid">
                      {SHAPES.map((shape) => (
                        <button
                          type="button"
                          key={shape.id}
                          title={shape.label}
                          onClick={() => {
                            addElement(
                              createShape(shape.id, {
                                x: Math.round((deck.width - 280) / 2),
                                y: Math.round((deck.height - 280) / 2),
                                w: 280,
                                h: 280,
                                fill: '#6366f1',
                              })
                            );
                            setShapeMenu(false);
                          }}
                        >
                          <span className="shape-preview" style={{ clipPath: shape.css || undefined, borderRadius: shape.id === 'roundRect' ? 6 : 2 }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <button type="button" className="tool-btn" onClick={() => mediaInput.current?.click()}>
                <Icon name="image" size={17} /> Media
              </button>
              <button type="button" className="tool-btn" onClick={addTable}>
                <Icon name="table" size={17} /> Table
              </button>
            </div>
            <input
              ref={mediaInput}
              type="file"
              accept="image/*,video/*,audio/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                insertMedia(file);
              }}
            />
            <div className="tool-group right">
              <button type="button" className="tool-btn icon-only" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
                <Icon name="undo" size={17} />
              </button>
              <button type="button" className="tool-btn icon-only" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
                <Icon name="redo" size={17} />
              </button>
            </div>
          </div>

          <EditorCanvas
            deck={deck}
            slide={slide}
            selectedId={selectedId}
            zoom={zoom}
            onZoom={setZoom}
            onSelect={(id) => {
              setSelectedId(id);
              if (id !== editingTextId) setEditingTextId(null);
            }}
            onPreviewElement={(id, changes) => patchElement(id, changes, false)}
            onCommitElement={(id, changes) => patchElement(id, changes, true)}
            onBegin={begin}
            onEnd={end}
            onOpenTable={openTable}
            onExpand={setLightbox}
            onDropFile={onDropFile}
            editingTextId={editingTextId}
            onStartTextEdit={setEditingTextId}
            onEndTextEdit={() => setEditingTextId(null)}
          />

          <div className="editor-statusbar">
            <span>Slide {currentIndex + 1} of {deck.slides.length}</span>
            <span>{slide.elements.length} object{slide.elements.length === 1 ? '' : 's'}</span>
            <span className="status-hint">Drag to move · Shift while rotating snaps · Double-click to edit</span>
            <span className="system-font-chip"><Icon name="font" size={12} /> System fonts</span>
          </div>
        </main>

        <Inspector
          deck={deck}
          slide={slide}
          element={selectedElement}
          fonts={fonts}
          fontSource={fontSource}
          onPatchSlide={patchSlide}
          onPatchElement={(changes) => patchElement(selectedId, changes)}
          onDelete={() => deleteElement()}
          onDuplicate={duplicateSelected}
          onEditTable={tableAction}
          onUpload={upload}
          onAddShapeImage={addShapeImage}
        />
      </div>

      {tableTarget && (
        <TableEditor
          element={tableTarget}
          onChange={handleTableChange}
          onClose={closeTable}
        />
      )}
      {lightbox && <MediaLightbox element={lightbox} onClose={() => setLightbox(null)} />}
      {presentOpen && <PresentDialog deck={deck} onClose={() => setPresentOpen(false)} />}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <Icon name={toast.type === 'error' ? 'info' : 'check'} size={15} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}


