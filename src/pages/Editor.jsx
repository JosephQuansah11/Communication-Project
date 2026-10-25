import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import EditorCanvas from '../components/EditorCanvas.jsx';
import Inspector from '../components/Inspector.jsx';
import SlideView from '../components/SlideView.jsx';
import TableEditor from '../components/TableEditor.jsx';
import MediaLightbox from '../components/MediaLightbox.jsx';
import PresentDialog from '../components/PresentDialog.jsx';
import Ribbon from '../components/Ribbon.jsx';
import ContextMenu from '../components/ContextMenu.jsx';
import DocumentTabs from '../components/DocumentTabs.jsx';
import Popover from '../components/Popover.jsx';
import { useHistoryDeck } from '../hooks/useHistoryDeck.js';
import { useDocumentTabs } from '../hooks/useDocumentTabs.js';
import { useWorkspaceBackground } from '../hooks/useWorkspaceBackground.js';
import { useSystemFonts } from '../lib/fonts.js';
import {
  createAudio,
  createImage,
  createShape,
  createSlide,
  createTable,
  createText,
  createVideo,
  createOnlineVideo,
  DEFAULT_STYLE,
  duplicateSlide,
  emptyDeck,
  normalizeDeck,
  uid,
} from '../lib/elements.js';
import { deleteDeck, fetchDeck, importDeck, saveDeck, uploadAsset } from '../lib/api.js';
import { resizeTable } from '../../shared/formula.js';
import { SHAPES } from '../lib/shapes.js';
import { BACKGROUND_PRESETS, gradientCss, similarBackgroundFor } from '../lib/backgrounds.js';
import { SLIDE_LAYOUTS, applySlideLayout } from '../lib/layouts.js';
import { KEYBOARD_SHORTCUTS } from '../lib/ribbon.js';
import { applyWholeHtmlStyle, htmlToPlainText, isBlankHtml, plainTextToHtml, sanitizeHtml, textElementHtml } from '../lib/richtext.js';
import {
  alignOffsets,
  boundsOf,
  distributeOffsets,
  duplicateSelection,
  expandGroups,
  groupChanges,
  hasGroup,
  matchSize,
  offsetChanges,
  pasteElements,
  reorderElements,
  selectionElements,
  ungroupChanges,
} from '../lib/selection.js';
import { animationStepCount, normalizeAnimations } from '../../shared/animations.js';
import { isOnlineVideo } from '../../shared/video.js';
import { pastedImageFile, planPaste, readClipboard, writeClipboardText } from '../lib/clipboard.js';

/**
 * A ribbon button with a dropdown. The menu is drawn through `Popover`, so it
 * floats above the canvas (and above the ribbon's own scroll container) instead
 * of being clipped by it.
 */
function RibbonMenu({ label, icon, large = false, title, open, onToggle, onClose, children }) {
  const anchor = useRef(null);
  return (
    <>
      <button
        type="button"
        ref={anchor}
        className={`ribbon-item ${large ? 'large' : 'small'}${open ? ' on' : ''}`}
        title={title || label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => onToggle(!open)}
      >
        <Icon name={icon} size={large ? 21 : 16} />
        <span>{label}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      <Popover anchorRef={anchor} open={open} onClose={onClose}>
        <div className="ribbon-menu" role="menu" aria-label={label}>
          {children}
        </div>
      </Popover>
    </>
  );
}

/**
 * Align and distribute controls of the Arrange ▸ Align menu. The ids are the
 * same ones the ribbon dispatches, so the menu and the keyboard share one path.
 */
const ALIGN_ITEMS = [
  { id: 'alignSelLeft', label: 'Left', icon: 'alignLeft', title: 'Align the left edges' },
  { id: 'alignSelCenter', label: 'Centre', icon: 'alignCenter', title: 'Align the horizontal centres' },
  { id: 'alignSelRight', label: 'Right', icon: 'alignRight', title: 'Align the right edges' },
  { id: 'alignSelTop', label: 'Top', icon: 'alignTop', title: 'Align the top edges' },
  { id: 'alignSelMiddle', label: 'Middle', icon: 'alignMiddle', title: 'Align the vertical centres' },
  { id: 'alignSelBottom', label: 'Bottom', icon: 'alignBottom', title: 'Align the bottom edges' },
  { id: 'distributeH', label: 'Space H', icon: 'distributeH', title: 'Even out the horizontal gaps' },
  { id: 'distributeV', label: 'Space V', icon: 'distributeV', title: 'Even out the vertical gaps' },
  { id: 'sameSize', label: 'Same size', icon: 'crop', title: 'Make every object match the first one' },
];

export default function Editor({ deckId, navigate }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  /**
   * Everything selected on the slide, in draw order; the last entry is the
   * "primary" object whose own box and handles the canvas shows. Multi-selection
   * is the norm in PowerPoint, so the editor works on the whole list everywhere.
   */
  const [selectedIds, setSelectedIds] = useState([]);
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
  const [animStep, setAnimStep] = useState(null);
  const [ribbonTab, setRibbonTab] = useState('home');
  const [panels, setPanels] = useState({ rail: true, inspector: true, tabs: true });
  const [formatClip, setFormatClip] = useState(null);
  const [findQuery, setFindQuery] = useState('');
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [ribbonMenu, setRibbonMenu] = useState(null);
  /** The right-click menu: { x, y, items } or null. */
  const [contextMenu, setContextMenu] = useState(null);
  /** Objects copied inside the app, ready to paste (the system clipboard may hold something else). */
  const clipboard = useRef(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [dragSlide, setDragSlide] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const documentTabs = useDocumentTabs();
  const workspace = useWorkspaceBackground();
  const { deck, deckRef, apply, preview, begin, end, undo, redo, reset, canUndo, canRedo } = useHistoryDeck(null);
  const mediaInput = useRef(null);
  const importInput = useRef(null);
  const pictureInput = useRef(null);
  const bgInput = useRef(null);
  const workspaceInput = useRef(null);
  const saveTimer = useRef(null);
  const channel = useRef(null);
  const lastSaved = useRef('');
  const textEditorRef = useRef(null);
  const freshTextRef = useRef(null);
  const animTimer = useRef(null);

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

  /* ---------------------------------------------------------------- *
   * Selection
   *
   * A selection is a list of ids that always covers whole groups. `selectedId` is
   * the primary object — the one the inspector edits and whose own handles the
   * canvas draws when a single object is selected.
   * ---------------------------------------------------------------- */

  const slideElements = slide?.elements || [];
  const selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const selectedElements = useMemo(() => selectionElements(slideElements, selectedIds), [slide, selectedIds]);
  const selectedBounds = useMemo(() => boundsOf(selectedElements), [selectedElements]);
  const isMultiSelect = selectedElements.length > 1;
  const selectedElement = useMemo(
    () => slideElements.find((element) => element.id === selectedId) || null,
    [slide, selectedId]
  );
  /** Replace the selection with one object (the form used all over the editor). */
  const setSelectedId = (id) => setSelectedIds(id ? expandGroups(slideElements, [id]) : []);
  /** Select one object, add it to the selection, or take it out again. */
  const selectElement = (id, { toggle = false } = {}) => {
    if (!id) return setSelectedIds([]);
    const members = expandGroups(slideElements, [id]);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (toggle && members.every((member) => next.has(member))) members.forEach((member) => next.delete(member));
      else members.forEach((member) => next.add(member));
      return slideElements.filter((element) => next.has(element.id)).map((element) => element.id);
    });
  };
  /** Marquee result: the swept objects, added to the selection with Shift/Ctrl. */
  const selectMarquee = (ids, additive = false) => {
    const members = expandGroups(slideElements, ids);
    setSelectedIds((current) => {
      const next = new Set(additive ? current : []);
      members.forEach((member) => next.add(member));
      return slideElements.filter((element) => next.has(element.id)).map((element) => element.id);
    });
  };
  const selectAllElements = () => setSelectedIds(slideElements.map((element) => element.id));
  /** Tab / Shift+Tab walk through the objects, like PowerPoint. */
  const cycleSelection = (delta) => {
    if (!slideElements.length) return;
    const current = slideElements.findIndex((element) => element.id === selectedId);
    const next = (((current < 0 ? (delta > 0 ? -1 : 0) : current) + delta) % slideElements.length + slideElements.length) % slideElements.length;
    setSelectedId(slideElements[next].id);
  };

  // Objects can vanish (delete, slide change, undo): never keep a stale id.
  useEffect(() => {
    const ids = new Set(slideElements.map((element) => element.id));
    setSelectedIds((current) => (current.some((id) => !ids.has(id)) ? current.filter((id) => ids.has(id)) : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide]);

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

  /**
   * Patch many objects in one step — what every multiple-selection action needs
   * (align, distribute, group, a group drag). `changesById` is the plain map the
   * selection helpers return: `{ [id]: partialElement }`.
   */
  const patchElements = (changesById, record = true) => {
    const ids = Object.keys(changesById || {});
    if (!ids.length) return;
    const updater = (current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId
          ? {
              ...item,
              elements: item.elements.map((element) =>
                changesById[element.id] ? { ...element, ...changesById[element.id] } : element
              ),
            }
          : item
      ),
    });
    if (record) apply(updater);
    else preview(updater);
  };

  /** Apply a partial change (or a function returning one) to every selected object. */
  const applyToSelection = (changes) => {
    const changesFor = typeof changes === 'function' ? changes : () => changes;
    const map = {};
    for (const element of selectedElements) {
      const patch = changesFor(element);
      if (patch) map[element.id] = patch;
    }
    patchElements(map);
  };

  /**
   * Box-level text formatting. Toggles that map onto the inline vocabulary
   * (bold/italic/underline/highlight/superscript/subscript) are applied to the
   * whole box content as well as stored as the box default — and when several
   * objects are selected the change reaches every text object among them, which
   * is what PowerPoint does.
   */
  const patchTextStyle = (changes) => {
    const targets = selectedElements.filter((element) => element.type === 'text' || element.type === 'shape');
    if (!targets.length) return;
    const next = { ...changes };
    if (next.superscript) next.subscript = false;
    if (next.subscript) next.superscript = false;
    const inlineKeys = ['bold', 'italic', 'underline', 'highlight', 'superscript', 'subscript'];
    const touchesInline = inlineKeys.some((key) => next[key] !== undefined);
    const map = {};
    for (const element of targets) {
      const payload = { style: { ...(element.style || {}), ...next } };
      if (touchesInline) payload.html = applyWholeHtmlStyle(textElementHtml(element), next) || null;
      map[element.id] = payload;
    }
    patchElements(map);
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

  /** Delete every selected object in one undo step. */
  const deleteSelection = () => {
    const ids = new Set(selectedElements.map((element) => element.id));
    if (!ids.size) return;
    commitTextEdit();
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: item.elements.filter((element) => !ids.has(element.id)) } : item
      ),
    }));
    setSelectedIds([]);
    setLightbox(null);
  };

  /**
   * Flush the inline text editor into the deck. Called when the user clicks
   * anywhere outside the editing box, presses Escape, changes slide, or blurs
   * into another control — so nothing typed on the canvas is ever lost.
   */
  const commitTextEdit = (options = {}) => {
    const id = editingTextId;
    if (!id) return;
    const node = textEditorRef.current;
    textEditorRef.current = null;
    setEditingTextId(null);
    if (!node) {
      freshTextRef.current = null;
      return;
    }
    const html = sanitizeHtml(node.innerHTML);
    const text = htmlToPlainText(html);
    const isFresh = freshTextRef.current === id;
    freshTextRef.current = null;
    if ((options.cancel || isBlankHtml(html)) && isFresh) {
      deleteElement(id);
      return;
    }
    patchElement(id, { html: text ? html : null, text });
  };

  /**
   * Duplicate the selection: every object comes back offset a little, grouped
   * copies stay grouped under a fresh group id, and the copies become the new
   * selection so the very next drag moves them away from the originals.
   */
  const duplicateSelected = () => {
    if (!selectedElements.length) return;
    commitTextEdit();
    const { copies, ids } = duplicateSelection(slideElements, selectedIds);
    if (!copies.length) return;
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: [...item.elements, ...copies] } : item
      ),
    }));
    setSelectedIds(ids);
  };

  const addElement = (element) => {
    commitTextEdit();
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: [...item.elements, element] } : item
      ),
    }));
    setSelectedId(element.id);
    return element;
  };

  /** Double-clicking the canvas drops a new text box at that point and edits it. */
  const createTextAt = (point) => {
    const width = Math.round(Math.min(560, Math.max(280, deck.width * 0.42)));
    const height = 110;
    const x = Math.round(Math.min(Math.max(point.x - 10, 12), Math.max(12, deck.width - width - 12)));
    const y = Math.round(Math.min(Math.max(point.y - 26, 12), Math.max(12, deck.height - height - 12)));
    const element = createText({
      x,
      y,
      w: width,
      h: height,
      text: '',
      html: null,
      style: { ...DEFAULT_STYLE, fontSize: 26, bold: false, color: '#0f172a' },
    });
    addElement(element);
    freshTextRef.current = element.id;
    setEditingTextId(element.id);
  };

  /**
   * Move a slide to a new position — used by rail drag & drop and the rail's
   * move-up / move-down buttons. A slide dropped inside a section joins that
   * section, so sections survive reordering.
   */
  const moveSlide = (fromIndex, toIndex) => {
    if (!deck || fromIndex === null || fromIndex === undefined || toIndex === null || toIndex === undefined) return;
    const total = deck.slides.length;
    const from = Math.max(0, Math.min(total - 1, Number(fromIndex)));
    const to = Math.max(0, Math.min(total, Number(toIndex)));
    // Dropping a slide where it already sits is a no-op.
    if (to === from || to === from + 1) {
      setDragSlide(null);
      setDropIndex(null);
      return;
    }
    commitTextEdit();
    const target = to > from ? to - 1 : to;
    apply((current) => {
      const list = [...current.slides];
      const [slide] = list.splice(from, 1);
      const section = target > 0 ? list[target - 1].section || null : null;
      list.splice(target, 0, { ...slide, section });
      return { ...current, slides: list };
    });
    setToast({ type: 'success', message: `Slide ${from + 1} moved to position ${target + 1}.` });
    setDragSlide(null);
    setDropIndex(null);
  };

  const addSlide = () => {
    commitTextEdit();
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
    commitTextEdit();
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
    commitTextEdit();
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

  /**
   * Put an online video (a YouTube or Vimeo link) on the slide. It plays inside
   * the slide through the provider's player, and the slide keeps working without
   * a network connection by showing the video's poster frame.
   */
  const insertOnlineVideo = (url, point) => {
    const width = Math.round(Math.min(deck.width * 0.6, 720));
    const height = Math.round((width * 9) / 16);
    const x = Math.round(point?.x ?? (deck.width - width) / 2);
    const y = Math.round(point?.y ?? (deck.height - height) / 2);
    const element = createOnlineVideo(String(url || '').trim(), {
      x: Math.max(0, Math.min(deck.width - width, x)),
      y: Math.max(0, Math.min(deck.height - height, y)),
      w: width,
      h: height,
    });
    if (!element) {
      setToast({ type: 'error', message: 'That link is not a YouTube or Vimeo video.' });
      return null;
    }
    addElement(element);
    setToast({ type: 'success', message: `${element.name} added — press play to watch it.` });
    return element;
  };

  const addOnlineVideo = () => {
    const url = window.prompt('Paste a YouTube or Vimeo link', 'https://youtu.be/');
    if (url === null || !url.trim()) return;
    insertOnlineVideo(url);
  };

  /* ---------------------------------------------------------------- *
   * Clipboard: objects, text and pictures
   *
   * Objects are copied into the app's own clipboard (so a paste can rebuild them
   * with fresh ids), and their text also goes to the system clipboard so it can be
   * pasted into another program. Reading the system clipboard is always an explicit
   * action — a menu click or Ctrl+V — which is what browsers require.
   * ---------------------------------------------------------------- */

  const copySelection = async () => {
    if (!selectedElements.length) return false;
    const text = selectedElements.map((element) => element.text || '').filter(Boolean).join('\n');
    clipboard.current = { elements: JSON.parse(JSON.stringify(selectedElements)), text, wrote: false, at: Date.now() };
    // The text mirror goes to the system clipboard too, so the objects can be pasted
    // into another program. `wrote` records whether that worked: if the browser
    // refused, the system clipboard is stale and the app's own objects win a paste.
    if (text) clipboard.current.wrote = await writeClipboardText(text);
    setToast({
      type: 'success',
      message: `${selectedElements.length} object${selectedElements.length === 1 ? '' : 's'} copied.`,
    });
    return true;
  };

  const cutSelection = async () => {
    if (!(await copySelection())) return;
    deleteSelection();
    setToast({ type: 'success', message: 'Cut — press Ctrl+V to paste it.' });
  };

  /** Drop objects held in the app's clipboard onto this slide, offset a little. */
  const pasteElementsHere = (elements) => {
    const copies = pasteElements(elements);
    if (!copies.length) return;
    commitTextEdit();
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: [...item.elements, ...copies] } : item
      ),
    }));
    setSelectedIds(copies.map((copy) => copy.id));
    setToast({ type: 'success', message: `${copies.length} object${copies.length === 1 ? '' : 's'} pasted.` });
  };

  /** Paste text onto the slide as a text box (a video link becomes a video). */
  const pasteTextHere = (text, point, html = null) => {
    const plain = String(text || '').trim();
    if (!plain) return;
    if (isOnlineVideo(plain)) {
      insertOnlineVideo(plain, point);
      return;
    }
    const width = Math.round(Math.min(620, Math.max(300, deck.width * 0.46)));
    const lines = plain.split('\n').length;
    const height = Math.round(Math.min(420, Math.max(80, lines * 30 + 40)));
    const x = Math.round(point?.x ?? (deck.width - width) / 2);
    const y = Math.round(point?.y ?? (deck.height - height) / 2);
    addElement(
      createText({
        x: Math.max(0, Math.min(deck.width - width, x)),
        y: Math.max(0, Math.min(deck.height - height, y)),
        w: width,
        h: height,
        text: plain,
        html,
        style: { ...DEFAULT_STYLE, fontSize: 20, bold: false, color: '#0f172a' },
      })
    );
    setToast({ type: 'success', message: 'Pasted from the clipboard.' });
  };

  /**
   * Paste whatever the system clipboard holds: a picture, formatted text or plain text.
   * With `only` set to `'image'` a non-picture clipboard is reported instead of pasted.
   */
  const pasteFromSystem = async (point, only = null) => {
    const payload = await readClipboard();
    if (!payload) {
      setToast({
        type: 'error',
        message: 'The browser did not hand over the clipboard — press Ctrl+V instead.',
      });
      return;
    }
    if (payload.kind === 'image') {
      await insertMedia(pastedImageFile(payload), point);
      return;
    }
    if (only === 'image') {
      setToast({ type: 'error', message: 'There is no picture on the clipboard.' });
      return;
    }
    if (payload.kind === 'html') {
      const html = sanitizeHtml(payload.html);
      const text = htmlToPlainText(html);
      if (text.trim()) pasteTextHere(text, point, html);
      return;
    }
    pasteTextHere(payload.text, point);
  };

  /** Paste into the text box being edited, keeping the formatting it came with. */
  const pasteIntoTextEditor = async () => {
    const node = textEditorRef.current;
    if (!node) return;
    node.focus();
    const payload = await readClipboard();
    if (!payload) {
      setToast({ type: 'error', message: 'The browser did not hand over the clipboard — press Ctrl+V instead.' });
      return;
    }
    if (payload.kind === 'image') {
      await pasteFromSystem();
      return;
    }
    const html = payload.kind === 'html' ? sanitizeHtml(payload.html) : plainTextToHtml(payload.text);
    if (!html) return;
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('insertHTML', false, html);
    } catch {
      setToast({ type: 'error', message: 'This browser refused the paste — press Ctrl+V instead.' });
    }
  };

  /** Ctrl+V and the Paste command: the app's own objects first, then the clipboard. */
  const pasteClipboard = async (point) => {
    if (clipboard.current?.elements?.length) {
      pasteElementsHere(clipboard.current.elements);
      return;
    }
    await pasteFromSystem(point);
  };

  /* ---------------------------------------------------------------- *
   * Right-click menus
   * ---------------------------------------------------------------- */

  const textMenuItems = () => [
    { id: 'cut', label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', onSelect: () => runTextCommand('cut') },
    { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onSelect: () => runTextCommand('copy') },
    { id: 'paste', label: 'Paste', icon: 'text', shortcut: 'Ctrl+V', onSelect: pasteIntoTextEditor },
    { separator: true },
    { id: 'selectAllText', label: 'Select all text', icon: 'marquee', onSelect: () => runTextCommand('selectAll') },
    { separator: true },
    { id: 'bold', label: 'Bold', icon: 'bold', shortcut: 'Ctrl+B', onSelect: () => runTextCommand('bold') },
    { id: 'italic', label: 'Italic', icon: 'italic', shortcut: 'Ctrl+I', onSelect: () => runTextCommand('italic') },
    { id: 'underline', label: 'Underline', icon: 'underline', shortcut: 'Ctrl+U', onSelect: () => runTextCommand('underline') },
    { separator: true },
    { id: 'clearFormat', label: 'Clear formatting', icon: 'clearFormat', onSelect: clearFormatting },
  ];

  const objectMenuItems = (point) => [
    { id: 'cut', label: 'Cut', icon: 'scissors', shortcut: 'Ctrl+X', onSelect: cutSelection },
    { id: 'copy', label: 'Copy', icon: 'copy', shortcut: 'Ctrl+C', onSelect: copySelection },
    { id: 'paste', label: 'Paste', icon: 'text', shortcut: 'Ctrl+V', onSelect: () => pasteClipboard(point) },
    {
      id: 'pastePicture',
      label: 'Paste picture from the clipboard',
      icon: 'image',
      onSelect: () => pasteFromSystem(point, 'image'),
    },
    { separator: true },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy', shortcut: 'Ctrl+D', onSelect: duplicateSelected },
    { id: 'delete', label: 'Delete', icon: 'trash', shortcut: 'Del', danger: true, onSelect: deleteSelection },
    { separator: true },
    { id: 'front', label: 'Bring to front', icon: 'arrowUp', onSelect: () => moveSelectionInStack(Number.MAX_SAFE_INTEGER) },
    { id: 'forward', label: 'Bring forward', icon: 'layerUp', onSelect: () => moveSelectionInStack(1) },
    { id: 'backward', label: 'Send backward', icon: 'layerDown', onSelect: () => moveSelectionInStack(-1) },
    { id: 'back', label: 'Send to back', icon: 'arrowDown', onSelect: () => moveSelectionInStack(-Number.MAX_SAFE_INTEGER) },
    { separator: true },
    {
      id: 'group',
      label: 'Group',
      icon: 'group',
      shortcut: 'Ctrl+G',
      disabled: selectedElements.length < 2,
      onSelect: groupSelection,
    },
    {
      id: 'ungroup',
      label: 'Ungroup',
      icon: 'ungroup',
      shortcut: 'Ctrl+Shift+G',
      disabled: !hasGroup(slideElements, selectedIds),
      onSelect: ungroupSelection,
    },
    { separator: true },
    { id: 'selectAll', label: 'Select all objects', icon: 'marquee', shortcut: 'Ctrl+A', onSelect: selectAllElements },
  ];

  const slideMenuItems = (point) => [
    { id: 'paste', label: 'Paste', icon: 'copy', shortcut: 'Ctrl+V', onSelect: () => pasteClipboard(point) },
    { id: 'pasteText', label: 'Paste text from the clipboard', icon: 'text', onSelect: () => pasteFromSystem(point) },
    {
      id: 'pastePicture',
      label: 'Paste picture from the clipboard',
      icon: 'image',
      onSelect: () => pasteFromSystem(point, 'image'),
    },
    { id: 'selectAll', label: 'Select all objects', icon: 'marquee', shortcut: 'Ctrl+A', onSelect: selectAllElements },
    { separator: true },
    { id: 'textBox', label: 'Add a text box', icon: 'text', onSelect: () => createTextAt(point) },
    { id: 'picture', label: 'Picture…', icon: 'image', onSelect: () => pictureInput.current?.click() },
    { id: 'table', label: 'Table', icon: 'table', onSelect: addTable },
    { id: 'onlineVideo', label: 'Online video…', icon: 'link', onSelect: addOnlineVideo },
  ];

  const openContextMenu = ({ event, element, point }) => {
    const editing = Boolean(element) && element.id === editingTextId;
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      label: editing ? 'Text menu' : element ? 'Object menu' : 'Slide menu',
      items: editing ? textMenuItems() : element ? objectMenuItems(point) : slideMenuItems(point),
    });
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

  /* ---------------------------------------------------------------- *
   * Slide item animations
   * ---------------------------------------------------------------- */

  const slideAnimations = slide?.animations || [];
  const animSteps = animationStepCount(slideAnimations);

  const patchAnimations = (animations, record = true) => {
    const next = normalizeAnimations(animations);
    const updater = (current) => ({
      ...current,
      slides: current.slides.map((item) => (item.id === slideId ? { ...item, animations: next } : item)),
    });
    if (record) apply(updater);
    else preview(updater);
  };

  const addAnimation = (element, overrides = {}) => {
    if (!element) return;
    const group = animSteps;
    patchAnimations([
      ...slideAnimations,
      {
        targetId: element.id,
        targetIds: [element.id],
        kind: 'entrance',
        effect: 'fade',
        duration: 500,
        delay: 0,
        trigger: 'click',
        group,
        order: 0,
        ...overrides,
      },
    ]);
    setAnimStep(0);
    setSelectedId(element.id);
  };

  const updateAnimation = (id, changes) => {
    patchAnimations(slideAnimations.map((animation) => (animation.id === id ? { ...animation, ...changes } : animation)));
  };

  const removeAnimation = (id) => {
    patchAnimations(slideAnimations.filter((animation) => animation.id !== id));
  };

  const moveAnimation = (id, delta) => {
    const list = [...slideAnimations].sort((a, b) => a.group - b.group || a.order - b.order);
    const index = list.findIndex((animation) => animation.id === id);
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const [moved] = list.splice(index, 1);
    list.splice(target, 0, moved);
    // Re-number the steps from the new order.
    let group = 0;
    let previousTrigger = null;
    const renumbered = list.map((animation, position) => {
      if (position > 0 && animation.trigger === 'with') {
        return { ...animation, group, order: position };
      }
      if (position > 0) group += 1;
      previousTrigger = animation.trigger;
      return { ...animation, group, order: position, trigger: position === 0 ? 'click' : previousTrigger };
    });
    patchAnimations(renumbered);
  };

  const playAnimations = () => {
    if (!animSteps) {
      setAnimStep(null);
      return;
    }
    clearInterval(animTimer.current);
    let current = 0;
    setAnimStep(0);
    animTimer.current = setInterval(() => {
      current += 1;
      setAnimStep(current);
      if (current >= animSteps) {
        clearInterval(animTimer.current);
        animTimer.current = null;
        setTimeout(() => setAnimStep(null), 900);
      }
    }, 700);
  };

  useEffect(() => () => clearInterval(animTimer.current), []);

  const goSlide = (delta) => {
    if (!deck) return;
    commitTextEdit();
    setAnimStep(null);
    const index = deck.slides.findIndex((item) => item.id === slideId);
    const next = Math.max(0, Math.min(deck.slides.length - 1, index + delta));
    setSlideId(deck.slides[next].id);
    setSelectedId(null);
    setEditingTextId(null);
  };

  const saveNow = () => {
    const current = deckRef.current;
    if (!current) return;
    setSaveState('saving');
    saveDeck(current)
      .then(() => {
        lastSaved.current = JSON.stringify(current);
        setSaveState('saved');
        channel.current?.postMessage({ type: 'deck-updated', updatedAt: new Date().toISOString() });
      })
      .catch(() => setSaveState('error'));
  };

  /* ---------------------------------------------------------------- *
   * Window: document tabs, workspace picture and the ribbon
   * ---------------------------------------------------------------- */

  /** Keep the deck in the document tab strip while it is open. */
  useEffect(() => {
    if (deck) documentTabs.register(deck);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deck?.id, deck?.title]);

  const newPresentation = async () => {
    try {
      const { deck: saved } = await saveDeck(normalizeDeck(emptyDeck('Untitled presentation')));
      documentTabs.register(saved);
      navigate(`/edit/${saved.id}`);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  const duplicateDeck = async () => {
    const current = deckRef.current;
    if (!current) return;
    try {
      const now = new Date().toISOString();
      const copy = normalizeDeck({
        ...JSON.parse(JSON.stringify(current)),
        id: uid('deck'),
        title: `${current.title} copy`,
        createdAt: now,
        updatedAt: now,
      });
      const { deck: saved } = await saveDeck(copy);
      documentTabs.register(saved);
      setToast({ type: 'success', message: `Saved “${saved.title}”.` });
      navigate(`/edit/${saved.id}`);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  const removeDeck = async () => {
    if (!deck) return;
    if (!window.confirm('Delete this presentation? This cannot be undone.')) return;
    try {
      await deleteDeck(deck.id);
      documentTabs.close(deck.id);
      navigate('/');
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  const exportDeckJson = () => {
    const current = deckRef.current;
    if (!current) return;
    const blob = new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${String(current.title).replace(/[^a-z0-9-_ ]/gi, '').trim() || 'presentation'}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ type: 'success', message: 'Deck JSON downloaded.' });
  };

  const copyLink = async (path, label = 'Link') => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setToast({ type: 'success', message: `${label} copied to the clipboard.` });
    } catch {
      setToast({ type: 'error', message: 'The clipboard is not available in this browser.' });
    }
  };

  const toggleFullScreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else document.documentElement.requestFullscreen?.();
  };

  const importFile = async (file) => {
    if (!file) return;
    setToast({ type: 'success', message: `Importing ${file.name}…` });
    try {
      const { deck: imported } = await importDeck(file);
      documentTabs.register(imported);
      navigate(`/edit/${imported.id}`);
    } catch (err) {
      setToast({ type: 'error', message: err.message });
    }
  };

  /* ---------------------------------------------------------------- *
   * Ribbon actions
   * ---------------------------------------------------------------- */

  const selectedStyle = selectedElement?.style || DEFAULT_STYLE;

  const applyLayout = (layoutId) => {
    const layout = SLIDE_LAYOUTS.find((entry) => entry.id === layoutId);
    commitTextEdit();
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) => (item.id === slideId ? applySlideLayout(item, layoutId, current) : item)),
    }));
    setSelectedId(null);
    setToast({ type: 'success', message: `${layout?.label || 'Layout'} applied.` });
  };

  const setSection = (title) => {
    patchSlide({ section: title || null });
    setToast({ type: 'success', message: title ? `Slides grouped under “${title}”.` : 'Section removed.' });
  };

  const addSection = () => {
    const name = window.prompt('Name this section', slide?.section || 'Section 1');
    if (name === null) return;
    setSection(name.trim() || null);
  };

  const patchBackground = (changes) => patchSlide({ background: { ...(slide?.background || {}), ...changes } });

  const applyBackgroundToAll = () => {
    const background = { ...(slide?.background || {}) };
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) => ({ ...item, background: { ...background } })),
    }));
    setToast({ type: 'success', message: 'Background applied to every slide.' });
  };

  const setDeckSize = (width, height) => {
    const w = Math.max(320, Math.round(Number(width) || deck.width));
    const h = Math.max(240, Math.round(Number(height) || deck.height));
    preview((current) => ({ ...current, width: w, height: h }));
    setToast({ type: 'success', message: `Slide size set to ${w} × ${h}.` });
  };

  /** Z-order for the whole selection: members keep their relative order. */
  const moveSelectionInStack = (delta) => {
    if (!selectedIds.length) return;
    apply((current) => ({
      ...current,
      slides: current.slides.map((item) =>
        item.id === slideId ? { ...item, elements: reorderElements(item.elements, selectedIds, delta) } : item
      ),
    }));
  };

  /** Centre the selection on the slide — its bounding box, so a group moves as one. */
  const centerElement = (axis) => {
    const box = selectedBounds;
    if (!box) return;
    const dx = axis === 'h' ? (deck.width - box.w) / 2 - box.x : 0;
    const dy = axis === 'v' ? (deck.height - box.h) / 2 - box.y : 0;
    patchElements(offsetChanges(selectedElements, dx, dy));
  };

  const nudgeSelection = (dx, dy) => {
    if (!selectedElements.length) return;
    patchElements(offsetChanges(selectedElements, dx, dy));
  };

  /**
   * Align the selection. With several objects the selection's own bounding box is
   * the frame; with a single object the slide is — exactly what PowerPoint does.
   */
  const alignSelection = (mode) => {
    if (!selectedElements.length) return;
    const frame = isMultiSelect ? selectedBounds : { x: 0, y: 0, w: deck.width, h: deck.height };
    patchElements(alignOffsets(slideElements, selectedIds, mode, frame));
  };

  const distributeSelection = (axis) => {
    const changes = distributeOffsets(slideElements, selectedIds, axis);
    if (!Object.keys(changes).length) {
      setToast({ type: 'error', message: 'Select three or more objects to distribute them evenly.' });
      return;
    }
    patchElements(changes);
  };

  const matchSelectionSize = (mode) => {
    const changes = matchSize(slideElements, selectedIds, mode);
    if (!Object.keys(changes).length) return;
    patchElements(changes);
    setToast({ type: 'success', message: 'Every selected object now matches the first one.' });
  };

  /** Group the selection so it always selects, moves and scales as one object. */
  const groupSelection = () => {
    if (selectedElements.length < 2) {
      setToast({ type: 'error', message: 'Select two or more objects to group them.' });
      return;
    }
    patchElements(groupChanges(slideElements, selectedIds, uid('group')));
    setToast({ type: 'success', message: `${selectedElements.length} objects grouped.` });
  };

  const ungroupSelection = () => {
    const changes = ungroupChanges(slideElements, selectedIds);
    if (!Object.keys(changes).length) {
      setToast({ type: 'error', message: 'The selection is not part of a group.' });
      return;
    }
    patchElements(changes);
    setToast({ type: 'success', message: 'Group broken apart.' });
  };

  /** Format painter: copy the look of one object onto another. */
  const armFormatPainter = () => {
    if (!selectedElement) {
      setToast({ type: 'error', message: 'Select the object whose formatting you want to copy first.' });
      return;
    }
    if (formatClip) {
      setFormatClip(null);
      return;
    }
    setFormatClip({
      style: JSON.parse(JSON.stringify(selectedElement.style || {})),
      fill: selectedElement.fill,
      fillImage: selectedElement.fillImage ? JSON.parse(JSON.stringify(selectedElement.fillImage)) : null,
      stroke: selectedElement.stroke,
      strokeWidth: selectedElement.strokeWidth,
      radius: selectedElement.radius,
      padding: selectedElement.padding,
    });
    setToast({ type: 'success', message: 'Formatting copied — click another object to apply it.' });
  };

  const applyFormatPainter = (targetId) => {
    if (!formatClip || !targetId) return false;
    patchElement(targetId, { ...formatClip });
    setFormatClip(null);
    setToast({ type: 'success', message: 'Formatting applied.' });
    return true;
  };

  const runTextCommand = (command) => {
    const node = textEditorRef.current;
    if (!node) {
      setToast({ type: 'error', message: 'Double-click a text box first, then use this button.' });
      return;
    }
    node.focus();
    try {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(command, false, null);
    } catch {
      /* some browsers refuse individual commands — the text simply stays as it is */
    }
  };

  /** Drop the inline formatting of the selected box back to the defaults. */
  const clearFormatting = () => {
    if (!selectedElement) return;
    patchElement(selectedElement.id, {
      style: { ...DEFAULT_STYLE, fontSize: selectedStyle.fontSize, color: selectedStyle.color },
      html: null,
    });
  };

  const findMatches = useMemo(() => {
    const query = findQuery.trim().toLowerCase();
    if (!query || !slide) return [];
    return slide.elements.filter((element) =>
      [element.text, element.name, element.src, element.type]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [findQuery, slide]);

  const deckStats = useMemo(() => {
    if (!deck) return { slides: 0, objects: 0, words: 0 };
    let objects = 0;
    let words = 0;
    for (const item of deck.slides) {
      objects += item.elements.length;
      for (const element of item.elements) {
        if (element.text) words += element.text.split(/\s+/).filter(Boolean).length;
      }
    }
    return { slides: deck.slides.length, objects, words };
  }, [deck]);

  /* ---------------------------------------------------------------- *
   * Ribbon plumbing
   * ---------------------------------------------------------------- */

  const insertShape = (shapeId) => {
    addElement(
      createShape(shapeId, {
        x: Math.round((deck.width - 280) / 2),
        y: Math.round((deck.height - 280) / 2),
        w: 280,
        h: 280,
        fill: '#6366f1',
      })
    );
  };

  const addTextBox = () => {
    const element = createText({
      x: Math.round(deck.width * 0.12),
      y: Math.round(deck.height * 0.22),
      w: Math.round(deck.width * 0.5),
      h: 140,
    });
    addElement(element);
    setEditingTextId(element.id);
  };

  const applyTransitionToAll = () => {
    const transition = slide?.transition || 'fade';
    apply((current) => ({ ...current, slides: current.slides.map((item) => ({ ...item, transition })) }));
    setToast({ type: 'success', message: `Transition “${transition}” applied to every slide.` });
  };

  const startPresentInWindow = () => {
    const win = window.open(
      `/present/${deck.id}?output=1&fs=1`,
      `slidesmith-output-${deck.id}`,
      'popup=yes,width=1280,height=720'
    );
    if (win) setToast({ type: 'success', message: 'The show is running in its own window.' });
    else setToast({ type: 'error', message: 'Allow pop-ups to start the show in its own window.' });
  };

  /** Every ribbon control funnels through here. */
  const handleRibbonAction = (id) => {
    switch (id) {
      /* File */
      case 'file:new':
        return newPresentation();
      case 'file:open':
        return navigate('/');
      case 'file:save':
        commitTextEdit();
        return saveNow();
      case 'file:import':
        return importInput.current?.click();
      case 'file:duplicate':
        return duplicateDeck();
      case 'file:export':
        return exportDeckJson();
      case 'file:delete':
        return removeDeck();

      /* Clipboard */
      case 'paste':
        return pasteClipboard();
      case 'copy':
        return copySelection();
      case 'cut':
        return cutSelection();
      case 'duplicate':
        return duplicateSelected();
      case 'delete':
        return deleteSelection();
      case 'formatPainter':
        return armFormatPainter();

      /* Slides */
      case 'newSlide':
        return addSlide();
      case 'duplicateSlide':
        return slide ? cloneSlide(slide.id) : undefined;
      case 'applyBackgroundAll':
        return applyBackgroundToAll();

      /* Font */
      case 'bold':
        return patchTextStyle({ bold: !selectedStyle.bold });
      case 'italic':
        return patchTextStyle({ italic: !selectedStyle.italic });
      case 'underline':
        return patchTextStyle({ underline: !selectedStyle.underline });
      case 'superscript':
        return patchTextStyle({ superscript: !selectedStyle.superscript, subscript: false });
      case 'subscript':
        return patchTextStyle({ subscript: !selectedStyle.subscript, superscript: false });
      case 'clearFormat':
        return clearFormatting();

      /* Paragraph */
      case 'bullets':
        return runTextCommand('insertUnorderedList');
      case 'numbering':
        return runTextCommand('insertOrderedList');
      case 'alignLeft':
        return patchTextStyle({ align: 'left' });
      case 'alignCenter':
        return patchTextStyle({ align: 'center' });
      case 'alignRight':
        return patchTextStyle({ align: 'right' });
      case 'alignJustify':
        return patchTextStyle({ align: 'justify' });

      /* Insert */
      case 'picture':
        return pictureInput.current?.click();
      case 'media':
        return mediaInput.current?.click();
      case 'onlineVideo':
        return addOnlineVideo();
      case 'textBox':
        return addTextBox();
      case 'table':
        return addTable();
      case 'import':
        return importInput.current?.click();

      /* Arrange */
      case 'bringForward':
        return moveSelectionInStack(1);
      case 'sendBackward':
        return moveSelectionInStack(-1);
      case 'toFront':
        return moveSelectionInStack(Number.MAX_SAFE_INTEGER);
      case 'toBack':
        return moveSelectionInStack(-Number.MAX_SAFE_INTEGER);
      case 'centerH':
        return centerElement('h');
      case 'centerV':
        return centerElement('v');
      case 'alignSelLeft':
        return alignSelection('left');
      case 'alignSelCenter':
        return alignSelection('center');
      case 'alignSelRight':
        return alignSelection('right');
      case 'alignSelTop':
        return alignSelection('top');
      case 'alignSelMiddle':
        return alignSelection('middle');
      case 'alignSelBottom':
        return alignSelection('bottom');
      case 'distributeH':
        return distributeSelection('h');
      case 'distributeV':
        return distributeSelection('v');
      case 'sameWidth':
        return matchSelectionSize('w');
      case 'sameHeight':
        return matchSelectionSize('h');
      case 'sameSize':
        return matchSelectionSize('both');
      case 'groupShapes':
        return groupSelection();
      case 'ungroupShapes':
        return ungroupSelection();

      /* Editing */
      case 'find':
        return goToMatch();
      case 'selectAll':
        return selectAllElements();
      case 'selectTop':
        return setSelectedId(slideElements[slideElements.length - 1]?.id || null);
      case 'selectNone':
        return setSelectedId(null);

      /* Design */
      case 'size16x9':
        return setDeckSize(1280, 720);
      case 'size4x3':
        return setDeckSize(960, 720);
      case 'size16x10':
        return setDeckSize(1280, 800);
      case 'similarBackground': {
        // Imported decks whose design picture is missing keep their palette.
        patchSlide({ background: similarBackgroundFor(deck, slide) });
        return setToast({ type: 'success', message: 'A background in this deck\'s colours was generated.' });
      }

      /* Transitions */
      case 'transitionNone':
        return patchSlide({ transition: 'none' });
      case 'transitionAll':
        return applyTransitionToAll();

      /* Animations */
      case 'animEntrance':
      case 'animEmphasis':
      case 'animExit': {
        if (!selectedElement) {
          setToast({ type: 'error', message: 'Select an object before adding an animation.' });
          return undefined;
        }
        const preset =
          id === 'animEntrance'
            ? { kind: 'entrance', effect: 'fade' }
            : id === 'animEmphasis'
              ? { kind: 'emphasis', effect: 'pulse' }
              : { kind: 'exit', effect: 'fade' };
        return addAnimation(selectedElement, preset);
      }
      case 'animRemove':
        if (!selectedElement) return undefined;
        return patchAnimations(
          slideAnimations.filter(
            (animation) =>
              animation.targetId !== selectedElement.id && !animation.targetIds?.includes(selectedElement.id)
          )
        );
      case 'animClear':
        return patchAnimations([]);
      case 'animPlay':
        return playAnimations();
      case 'animPrevStep':
        return setAnimStep(Math.max(0, (animStep ?? animSteps) - 1));
      case 'animNextStep':
        return setAnimStep(Math.min(animSteps, (animStep ?? animSteps) + 1));
      case 'animShowAll':
        return setAnimStep(animStep === null ? 0 : null);

      /* Slide show */
      case 'present':
      case 'liveAudience':
        return setPresentOpen(true);
      case 'presentFullscreen':
        return startPresentInWindow();
      case 'presentCopyLink':
        return copyLink(`/present/${deck.id}`, 'Show link');
      case 'audienceHint':
        return setToast({ type: 'success', message: 'The audience page follows this show live over WebSocket.' });

      /* Review */
      case 'copyDeckLink':
        return copyLink(`/edit/${deck.id}`, 'Edit link');

      /* View */
      case 'toggleRail':
        return setPanels((current) => ({ ...current, rail: !current.rail }));
      case 'toggleInspector':
        return setPanels((current) => ({ ...current, inspector: !current.inspector }));
      case 'toggleTabs':
        return setPanels((current) => ({ ...current, tabs: !current.tabs }));
      case 'zoomIn':
        return setZoom((value) => Math.min(3, Math.round((value + 0.1) * 100) / 100));
      case 'zoomOut':
        return setZoom((value) => Math.max(0.25, Math.round((value - 0.1) * 100) / 100));
      case 'zoomReset':
        return setZoom(1);
      case 'workspaceClear':
        workspace.clear();
        return setToast({ type: 'success', message: 'The window picture was removed.' });
      case 'fullScreen':
        return toggleFullScreen();

      /* Tools */
      case 'tableEditor':
        if (selectedElement?.type === 'table') return openTable(selectedElement);
        return setToast({ type: 'error', message: 'Select a table first.' });
      case 'mediaViewer':
        if (selectedElement && ['image', 'video', 'audio'].includes(selectedElement.type)) {
          return setLightbox(selectedElement);
        }
        return setToast({ type: 'error', message: 'Select an image, video or audio clip first.' });
      case 'shortcuts':
        return setShortcutsOpen(true);
      case 'fontsInfo':
        return setToast({
          type: 'success',
          message: `Fonts come from your operating system (${
            fontSource === 'local-font-access' ? 'installed font list' : 'system fallbacks'
          }).`,
        });
      case 'duplicateDeck':
        return duplicateDeck();
      case 'exportJson':
        return exportDeckJson();

      default:
        return undefined;
    }
  };

  /**
   * Controls that need their own widget: the ribbon asks for a node first and
   * falls back to a plain button when nothing is returned.
   */
  const renderRibbonItem = (item) => {
    const background = slide?.background || {};
    switch (item.id) {
      case 'alignMenu':
        return (
          <RibbonMenu
            label="Align"
            icon="alignLeft"
            title={item.title}
            open={ribbonMenu === 'align'}
            onToggle={(next) => setRibbonMenu(next ? 'align' : null)}
            onClose={() => setRibbonMenu(null)}
          >
            <strong>Align &amp; distribute</strong>
            <div className="align-grid">
              {ALIGN_ITEMS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="mini-btn"
                  title={entry.title}
                  onClick={() => {
                    setRibbonMenu(null);
                    handleRibbonAction(entry.id);
                  }}
                >
                  <Icon name={entry.icon} size={17} />
                  <span>{entry.label}</span>
                </button>
              ))}
            </div>
            <small>
              {selectedElements.length > 1
                ? `${selectedElements.length} objects selected — they align inside their own bounding box.`
                : 'Select two or more objects to align them with each other; one object aligns to the slide.'}
            </small>
            <small>“Space” evens out the gaps and needs three or more objects.</small>
          </RibbonMenu>
        );
      case 'fontFamily':
        return (
          <label className="ribbon-field" title="Font family">
            <Icon name="font" size={18} />
            <select
              value={selectedStyle.fontFamily || 'system-ui'}
              disabled={!selectedElement}
              onChange={(event) => patchTextStyle({ fontFamily: event.target.value })}
            >
              {[...new Set([selectedStyle.fontFamily, ...fonts].filter(Boolean))].map((family) => (
                <option key={family} value={family}>{family}</option>
              ))}
            </select>
          </label>
        );
      case 'fontSize':
        return (
          <label className="ribbon-field narrow" title="Font size">
            <input
              type="number"
              min={6}
              max={400}
              value={selectedStyle.fontSize || 28}
              disabled={!selectedElement}
              onChange={(event) => patchTextStyle({ fontSize: Number(event.target.value) || 12 })}
            />
          </label>
        );
      case 'textColor':
        return (
          <label className="ribbon-field swatch" title="Text colour">
            <Icon name="palette" size={18} />
            <input
              type="color"
              value={selectedStyle.color?.startsWith('#') ? selectedStyle.color : '#0f172a'}
              disabled={!selectedElement}
              onChange={(event) => patchTextStyle({ color: event.target.value })}
            />
          </label>
        );
      case 'highlight':
        return (
          <label className="ribbon-field swatch" title="Highlight colour">
            <Icon name="highlight" size={18} />
            <input
              type="color"
              value={selectedStyle.highlight || '#fef08a'}
              disabled={!selectedElement}
              onChange={(event) => patchTextStyle({ highlight: event.target.value })}
            />
          </label>
        );
      case 'lineSpacing':
        return (
          <label className="ribbon-field narrow" title="Line spacing">
            <select
              value={String(selectedStyle.lineHeight || 1.25)}
              disabled={!selectedElement}
              onChange={(event) => patchTextStyle({ lineHeight: Number(event.target.value) })}
            >
              {[0.9, 1, 1.15, 1.25, 1.5, 2].map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>
        );
      case 'layout':
        return (
          <RibbonMenu
            label="Layout"
            icon="grid"
            title={item.title}
            open={ribbonMenu === 'layout'}
            onToggle={(next) => setRibbonMenu(next ? 'layout' : null)}
            onClose={() => setRibbonMenu(null)}
          >
            <strong>Slide layout</strong>
            {SLIDE_LAYOUTS.map((layout) => (
              <button
                key={layout.id}
                type="button"
                onClick={() => {
                  setRibbonMenu(null);
                  applyLayout(layout.id);
                }}
              >
                <span>{layout.label}</span>
                <small>{layout.hint}</small>
              </button>
            ))}
          </RibbonMenu>
        );
      case 'section':
        return (
          <RibbonMenu
            label="Section"
            icon="folder"
            title={item.title}
            open={ribbonMenu === 'section'}
            onToggle={(next) => setRibbonMenu(next ? 'section' : null)}
            onClose={() => setRibbonMenu(null)}
          >
            <strong>Section</strong>
            <button
              type="button"
              onClick={() => {
                setRibbonMenu(null);
                addSection();
              }}
            >
              <span>Start a section here…</span>
              <small>Groups this slide and the ones after it in the rail</small>
            </button>
            <button
              type="button"
              onClick={() => {
                setRibbonMenu(null);
                setSection(null);
              }}
            >
              <span>Remove the section label</span>
              <small>This slide goes back to the main flow</small>
            </button>
            <small>{slide?.section ? `Current section: ${slide.section}` : 'This slide is not in a section.'}</small>
          </RibbonMenu>
        );
      case 'shapes':
        return (
          <RibbonMenu
            label="Shapes"
            icon="shape"
            large
            title={item.title}
            open={shapeMenu}
            onToggle={setShapeMenu}
            onClose={() => setShapeMenu(false)}
          >
            <strong>Shapes</strong>
            <div className="shape-grid">
              {SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  title={shape.label}
                  onClick={() => {
                    setShapeMenu(false);
                    insertShape(shape.id);
                  }}
                >
                  <span
                    className="shape-preview"
                    style={{ clipPath: shape.css || undefined, borderRadius: shape.id === 'roundRect' ? 6 : 2 }}
                  />
                </button>
              ))}
            </div>
            <small>Picture fills, borders and text all follow the shape.</small>
          </RibbonMenu>
        );
      case 'bgPresets':
        return (
          <div className="ribbon-presets" title="Ready-made backgrounds">
            {BACKGROUND_PRESETS.map((preset) => {
              const active =
                preset.background.color === background.color &&
                gradientCss(preset.background.gradient) === gradientCss(background.gradient);
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.label}
                  className={`bg-swatch${active ? ' on' : ''}`}
                  style={{
                    backgroundColor: preset.background.color,
                    backgroundImage: preset.background.gradient ? gradientCss(preset.background.gradient) : undefined,
                  }}
                  onClick={() => patchBackground({ ...preset.background })}
                />
              );
            })}
          </div>
        );
      case 'bgColor':
        return (
          <label className="ribbon-field swatch" title="Background colour">
            <Icon name="palette" size={18} />
            <input
              type="color"
              value={background.color?.startsWith('#') ? background.color : '#ffffff'}
              onChange={(event) => patchBackground({ color: event.target.value })}
            />
          </label>
        );
      case 'bgGradient':
        return (
          <div className="ribbon-inline">
            <input
              type="color"
              title="Gradient start"
              value={background.gradient?.from || '#6366f1'}
              onChange={(event) =>
                patchBackground({
                  gradient: { from: event.target.value, to: '#0ea5e9', angle: 135, type: 'linear', ...(background.gradient || {}) },
                })
              }
            />
            <input
              type="color"
              title="Gradient end"
              value={background.gradient?.to || '#0ea5e9'}
              onChange={(event) =>
                patchBackground({
                  gradient: { from: '#6366f1', to: event.target.value, angle: 135, type: 'linear', ...(background.gradient || {}) },
                })
              }
            />
            <input
              type="range"
              min={0}
              max={360}
              step={5}
              title="Gradient angle"
              value={background.gradient?.angle ?? 135}
              disabled={!background.gradient || background.gradient?.type === 'radial'}
              onChange={(event) =>
                patchBackground({
                  gradient: {
                    from: '#6366f1',
                    to: '#0ea5e9',
                    ...(background.gradient || {}),
                    angle: Number(event.target.value),
                  },
                })
              }
            />
            <button
              type="button"
              className={`ribbon-item small${background.gradient ? ' on' : ''}`}
              title={background.gradient ? 'Remove the gradient' : 'Add a gradient'}
              onClick={() =>
                patchBackground({
                  gradient: background.gradient ? null : { from: '#6366f1', to: '#0ea5e9', angle: 135, type: 'linear' },
                })
              }
            >
              <Icon name={background.gradient ? 'close' : 'sparkle'} size={18} />
              <span>{background.gradient ? 'Off' : 'Add'}</span>
            </button>
          </div>
        );
      case 'bgImage':
        return (
          <div className="ribbon-inline">
            <input
              className="text-input"
              placeholder="Picture URL"
              value={background.image || ''}
              onChange={(event) => patchBackground({ image: event.target.value || null })}
            />
            <button type="button" className="ribbon-item small" title="Upload a background picture" onClick={() => bgInput.current?.click()}>
              <Icon name="upload" size={18} />
              <span>Upload</span>
            </button>
            {background.image && (
              <>
                <select
                  className="text-input"
                  title="How the picture fills the slide"
                  value={background.fit || 'cover'}
                  onChange={(event) => patchBackground({ fit: event.target.value })}
                >
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="stretch">Stretch</option>
                  <option value="tile">Tile</option>
                </select>
                <input
                  type="range"
                  min={10}
                  max={100}
                  title="Background picture opacity"
                  value={Math.round((background.opacity ?? 1) * 100)}
                  onChange={(event) => patchBackground({ opacity: Number(event.target.value) / 100 })}
                />
                <button type="button" className="ribbon-item small" title="Remove the background picture" onClick={() => patchBackground({ image: null })}>
                  <Icon name="close" size={18} />
                </button>
              </>
            )}
          </div>
        );
      case 'transition':
        return (
          <label className="ribbon-field" title="How this slide enters">
            <Icon name="play" size={18} />
            <select value={slide?.transition || 'fade'} onChange={(event) => patchSlide({ transition: event.target.value })}>
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="none">None</option>
            </select>
          </label>
        );
      case 'animSteps':
        return (
          <span className="ribbon-readout" title="Click steps on this slide">
            <Icon name="clock" size={17} />
            {animStep === null ? `${animSteps} step${animSteps === 1 ? '' : 's'}` : `${animStep}/${animSteps}`}
          </span>
        );
      case 'notes':
        return (
          <label className="ribbon-notes" title="Speaker notes for this slide">
            <textarea
              rows={3}
              value={slide?.notes || ''}
              placeholder="Speaker notes for this slide…"
              onChange={(event) => patchSlide({ notes: event.target.value })}
            />
          </label>
        );
      case 'deckStats':
        return (
          <span className="ribbon-readout">
            <Icon name="grid" size={17} />
            {deckStats.slides} slides · {deckStats.objects} objects
          </span>
        );
      case 'wordCount':
        return (
          <span className="ribbon-readout">
            <Icon name="body" size={17} />
            {deckStats.words} words
          </span>
        );
      case 'find':
        return (
          <label className="ribbon-find" title="Find text on this slide">
            <Icon name="search" size={17} />
            <input
              value={findQuery}
              placeholder="Find on this slide"
              onChange={(event) => setFindQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') goToMatch();
              }}
            />
            <span>{findQuery ? findMatches.length : ''}</span>
          </label>
        );
      case 'zoomLabel':
        return <span className="ribbon-readout">{Math.round(zoom * 100)}%</span>;
      case 'workspaceImage':
        return (
          <div className="ribbon-inline">
            <input
              className="text-input"
              placeholder="Window picture URL"
              value={workspace.background.image || ''}
              onChange={(event) => workspace.update({ image: event.target.value || null })}
            />
            <button type="button" className="ribbon-item small" title="Upload a window picture" onClick={() => workspaceInput.current?.click()}>
              <Icon name="upload" size={18} />
              <span>Upload</span>
            </button>
            <input
              type="range"
              min={5}
              max={100}
              title="Window picture opacity"
              value={Math.round((workspace.background.opacity ?? 0.35) * 100)}
              onChange={(event) => workspace.update({ opacity: Number(event.target.value) / 100 })}
            />
            <input
              type="range"
              min={0}
              max={20}
              title="Window picture blur"
              value={workspace.background.blur || 0}
              onChange={(event) => workspace.update({ blur: Number(event.target.value) })}
            />
          </div>
        );
      case 'dimensions':
        return (
          <div className="ribbon-inline">
            <input
              type="number"
              className="ribbon-number"
              title="Slide width"
              value={deck.width}
              onChange={(event) => setDeckSize(event.target.value, deck.height)}
            />
            <span className="ribbon-readout">×</span>
            <input
              type="number"
              className="ribbon-number"
              title="Slide height"
              value={deck.height}
              onChange={(event) => setDeckSize(deck.width, event.target.value)}
            />
          </div>
        );
      default:
        return null;
    }
  };

  useEffect(() => {
    /**
     * The browser's own paste event is the reliable path: it hands over a
     * screenshot, a copied picture or formatted text without asking for any
     * clipboard permission, so Ctrl+V goes through here — pictures, app objects,
     * formatted text, plain text and video links alike.
     */
    const onPaste = (event) => {
      const target = event.target;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      const data = event.clipboardData;
      if (!data) return;
      const plan = planPaste(
        {
          files: [...(data.files || [])],
          html: data.getData('text/html'),
          text: data.getData('text/plain'),
        },
        clipboard.current
      );
      if (plan.kind === 'image') {
        event.preventDefault();
        insertMedia(pastedImageFile({ blob: plan.file, type: plan.file.type }));
        return;
      }
      // An open text box takes its own paste — it keeps the caret and formatting.
      if (target?.isContentEditable) return;
      if (plan.kind === 'elements') {
        event.preventDefault();
        pasteElementsHere(plan.elements);
        return;
      }
      if (plan.kind === 'html') {
        event.preventDefault();
        const html = sanitizeHtml(plan.html);
        const text = htmlToPlainText(html);
        if (text.trim()) pasteTextHere(text, null, html);
        return;
      }
      if (plan.kind === 'text') {
        event.preventDefault();
        pasteTextHere(plan.text);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  useEffect(() => {
    const handler = (event) => {
      const target = event.target;
      const typing =
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (event.key === 'Escape') {
        if (shapeMenu) return setShapeMenu(false);
        if (tableTargetId) return closeTable();
        if (editingTextId) return commitTextEdit({ cancel: true });
        if (lightbox) return setLightbox(null);
        if (presentOpen) return setPresentOpen(false);
        return setSelectedId(null);
      }
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.key.toLowerCase() === 's') {
        event.preventDefault();
        commitTextEdit();
        return saveNow();
      }
      if (typing) return;
      if (mod && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        return event.shiftKey ? redo() : undo();
      }
      if (mod && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        return duplicateSelected();
      }
      if (mod && event.key.toLowerCase() === 'c') {
        event.preventDefault();
        return copySelection();
      }
      if (mod && event.key.toLowerCase() === 'x') {
        event.preventDefault();
        return cutSelection();
      }
      // Ctrl+V is deliberately left to the browser's own paste event: it is the only
      // path that hands over a picture (a screenshot, say) without a permission prompt.
      if (mod && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        return selectAllElements();
      }
      if (mod && event.key.toLowerCase() === 'g') {
        event.preventDefault();
        return event.shiftKey ? ungroupSelection() : groupSelection();
      }
      if (event.key === 'Tab' && !mod) {
        // Walk the objects one by one, the way PowerPoint's Tab does.
        event.preventDefault();
        return cycleSelection(event.shiftKey ? -1 : 1);
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedIds.length) {
          event.preventDefault();
          deleteSelection();
        }
        return;
      }
      if (event.key === 'ArrowLeft' && selectedElements.length) {
        event.preventDefault();
        return nudgeSelection(event.shiftKey ? -10 : -1, 0);
      }
      if (event.key === 'ArrowRight' && selectedElements.length) {
        event.preventDefault();
        return nudgeSelection(event.shiftKey ? 10 : 1, 0);
      }
      if (event.key === 'ArrowUp' && selectedElements.length) {
        event.preventDefault();
        return nudgeSelection(0, event.shiftKey ? -10 : -1);
      }
      if (event.key === 'ArrowDown' && selectedElements.length) {
        event.preventDefault();
        return nudgeSelection(0, event.shiftKey ? 10 : 1);
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
        <Icon name="info" size={38} />
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
      rotation: shape.rotation || 0,
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
    <div className={`editor-shell${panels.rail ? '' : ' rail-hidden'}${panels.inspector ? '' : ' inspector-hidden'}`}>
      <Ribbon
        activeTab={ribbonTab}
        onTabChange={setRibbonTab}
        onAction={handleRibbonAction}
        renderItem={renderRibbonItem}
        state={{
          toggleRail: panels.rail,
          toggleInspector: panels.inspector,
          toggleTabs: panels.tabs,
          formatPainter: Boolean(formatClip),
        }}
        disabled={{
          // Commands that need something selected, or two objects, say so up front.
          paste: !selectedIds.length,
          duplicate: !selectedIds.length,
          delete: !selectedIds.length,
          groupShapes: selectedElements.length < 2,
          ungroupShapes: !hasGroup(slideElements, selectedIds),
        }}
        brand={
          <button type="button" className="brand-mini" onClick={() => navigate('/')} title="Back to library">
            <span className="brand-mark"><Icon name="logo" size={24} /></span>
            <span className="brand-name">Slidesmith</span>
          </button>
        }
        quick={
          <>
            <button type="button" className="ribbon-quick-btn" onClick={saveNow} title="Save (Ctrl+S)">
              <Icon name="save" size={18} />
            </button>
            <button type="button" className="ribbon-quick-btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
              <Icon name="undo" size={18} />
            </button>
            <button type="button" className="ribbon-quick-btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
              <Icon name="redo" size={18} />
            </button>
          </>
        }
        right={
          <>
            <input
              className="deck-title-input"
              value={deck.title}
              onChange={(event) => preview((current) => ({ ...current, title: event.target.value }))}
              aria-label="Presentation title"
            />
            <span className={`save-state ${saveState}`}>
              <Icon name={saveState === 'error' ? 'info' : 'check'} size={14} /> {uploading ? 'Uploading…' : saveLabel}
            </span>
            <span className="dimension-chip">{deck.width} × {deck.height}</span>
            <button type="button" className="primary-btn small" onClick={() => setPresentOpen(true)}>
              <Icon name="presentation" size={18} /> Present
            </button>
          </>
        }
      />

      {panels.tabs && (
        <DocumentTabs
          tabs={documentTabs.tabs}
          activeId={deck.id}
          collapsed={documentTabs.collapsed}
          onSelect={(id) => navigate(`/edit/${id}`)}
          onClose={(id) => {
            documentTabs.close(id);
            if (id === deck.id) navigate('/');
          }}
          onNew={newPresentation}
          onToggleCollapse={documentTabs.setCollapsed}
        />
      )}

      <input
        ref={importInput}
        type="file"
        accept=".pptx,.ppt,.dps,.dpt,.pt,.pps,.ppsx,.potx"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          importFile(file);
        }}
      />
      <input
        ref={pictureInput}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          insertMedia(file);
        }}
      />
      <input
        ref={bgInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const asset = await upload(file);
          if (asset?.url) patchBackground({ image: asset.url });
        }}
      />
      <input
        ref={workspaceInput}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const asset = await upload(file);
          if (asset?.url) workspace.update({ image: asset.url });
        }}
      />

      <div className="editor-main">
        <aside className="slide-rail">
          <div className="rail-head">
            <span>Slides</span>
            <button type="button" className="mini-btn" onClick={addSlide} title="Add slide">
              <Icon name="plus" size={17} />
            </button>
          </div>
          <div className="rail-scroll">
            {deck.slides.map((item, index) => {
              const previous = index > 0 ? deck.slides[index - 1] : null;
              const startsSection = Boolean(item.section) && item.section !== previous?.section;
              const sectionCollapsed = startsSection && collapsedSections[item.section];
              return (
                <div
                  key={item.id}
                  className={`rail-entry-wrap${dropIndex === index && dragSlide !== null ? ' drop-before' : ''}`}
                  onDragOver={(event) => {
                    if (dragSlide === null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const rect = event.currentTarget.getBoundingClientRect();
                    setDropIndex(event.clientY > rect.top + rect.height / 2 ? index + 1 : index);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const from = dragSlide ?? Number(event.dataTransfer.getData('text/plain'));
                    moveSlide(from, dropIndex ?? index);
                  }}
                >
                  {dropIndex === index && dragSlide !== null && <div className="rail-drop-line" />}
                  <div className={`rail-entry${dragSlide === index ? ' dragging' : ''}`}>
                    {startsSection && (
                      <button
                        type="button"
                        className={`rail-section${sectionCollapsed ? ' collapsed' : ''}`}
                        title={sectionCollapsed ? 'Expand this section' : 'Collapse this section'}
                        onClick={() =>
                          setCollapsedSections((current) => ({ ...current, [item.section]: !current[item.section] }))
                        }
                      >
                        <Icon name={sectionCollapsed ? 'chevronRight' : 'chevronDown'} size={14} />
                        <span>{item.section}</span>
                      </button>
                    )}
                    {!sectionCollapsed && (
                      <div
                        className={`slide-thumb ${item.id === slide.id ? 'active' : ''}`}
                        draggable
                        title="Drag to reorder this slide"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move';
                          event.dataTransfer.setData('text/plain', String(index));
                          setDragSlide(index);
                          setDropIndex(index);
                        }}
                        onDragEnd={() => {
                          setDragSlide(null);
                          setDropIndex(null);
                        }}
                        onClick={() => {
                          commitTextEdit();
                          setSlideId(item.id);
                          setSelectedId(null);
                          setEditingTextId(null);
                          setAnimStep(null);
                        }}
                        style={{ width: `${thumbWidth + 16}px` }}
                      >
                        <span className="thumb-index">{index + 1}</span>
                        <div className="thumb-frame" style={{ height: `${thumbHeight}px` }}>
                          <SlideView slide={item} width={deck.width} height={deck.height} scale={thumbWidth / deck.width} preview />
                          <div className="thumb-actions">
                            <button
                              type="button"
                              title="Move up"
                              disabled={index === 0}
                              onClick={(event) => {
                                event.stopPropagation();
                                moveSlide(index, index - 1);
                              }}
                            >
                              <Icon name="arrowUp" size={14} />
                            </button>
                            <button
                              type="button"
                              title="Move down"
                              disabled={index === deck.slides.length - 1}
                              onClick={(event) => {
                                event.stopPropagation();
                                moveSlide(index, index + 2);
                              }}
                            >
                              <Icon name="arrowDown" size={14} />
                            </button>
                            <button
                              type="button"
                              title="Duplicate slide"
                              onClick={(event) => {
                                event.stopPropagation();
                                cloneSlide(item.id);
                              }}
                            >
                              <Icon name="copy" size={14} />
                            </button>
                            <button
                              type="button"
                              title="Delete slide"
                              onClick={(event) => {
                                event.stopPropagation();
                                removeSlide(item.id);
                              }}
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {dragSlide !== null && dropIndex === index + 1 && index === deck.slides.length - 1 && (
                    <div className="rail-drop-line" />
                  )}
                </div>
              );
            })}
            <button type="button" className="add-slide-btn" onClick={addSlide}>
              <Icon name="plus" size={18} /> New slide
            </button>
          </div>
          <div className="rail-foot">
            {deck.slides.length} slide{deck.slides.length === 1 ? '' : 's'} · drag to reorder
          </div>
        </aside>

        <main className={`editor-center${workspace.styles ? ' has-window-picture' : ''}`}>
          {workspace.styles && <div className="workspace-background" style={workspace.styles} aria-hidden="true" />}

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

          <EditorCanvas
            deck={deck}
            slide={slide}
            selectedIds={selectedIds}
            zoom={zoom}
            onZoom={setZoom}
            onSelect={(id, options) => {
              if (id !== editingTextId) commitTextEdit();
              if (formatClip && id && id !== selectedId) {
                applyFormatPainter(id);
                setSelectedId(id);
                return;
              }
              selectElement(id, options);
            }}
            onPreviewElement={(id, changes) => patchElement(id, changes, false)}
            onPreviewSelection={(changes) => patchElements(changes, false)}
            onMarquee={selectMarquee}
            onContextMenu={openContextMenu}
            fonts={fonts}
            onPatchTextStyle={patchTextStyle}
            onBegin={begin}
            onEnd={end}
            onOpenTable={openTable}
            onExpand={setLightbox}
            onDropFile={onDropFile}
            editingTextId={editingTextId}
            onStartTextEdit={(id) => {
              if (id !== editingTextId) commitTextEdit();
              setSelectedId(id);
              setEditingTextId(id);
            }}
            onEndTextEdit={(options) => commitTextEdit(options)}
            onCreateText={createTextAt}
            textEditorRef={textEditorRef}
            animStep={animStep}
          />

          <div className="editor-statusbar">
            <span>Slide {currentIndex + 1} of {deck.slides.length}</span>
            <span>{slide.elements.length} object{slide.elements.length === 1 ? '' : 's'}</span>
            {isMultiSelect && (
              <span className="selection-chip">
                <Icon name="layers" size={14} /> {selectedElements.length} selected
              </span>
            )}
            <span className="status-hint">
              {formatClip
                ? 'Format painter armed — click the object that should inherit this look'
                : 'Shift/Ctrl + click to add objects · Drag on empty space to marquee-select · Drag any selected object to move them all'}
            </span>
            <span className="system-font-chip"><Icon name="font" size={14} /> System fonts</span>
          </div>
        </main>

        <Inspector
          deck={deck}
          slide={slide}
          element={selectedElement}
          selectedElements={selectedElements}
          selectedBounds={selectedBounds}
          fonts={fonts}
          fontSource={fontSource}
          onPatchSlide={patchSlide}
          onPatchElement={(changes) => patchElement(selectedId, changes)}
          onPatchSelection={applyToSelection}
          onAlign={alignSelection}
          onDistribute={distributeSelection}
          onMatchSize={matchSelectionSize}
          onGroup={groupSelection}
          onUngroup={ungroupSelection}
          grouped={hasGroup(slideElements, selectedIds)}
          onPatchTextStyle={patchTextStyle}
          animations={slideAnimations}
          animStep={animStep}
          animSteps={animSteps}
          onAddAnimation={addAnimation}
          onUpdateAnimation={updateAnimation}
          onRemoveAnimation={removeAnimation}
          onMoveAnimation={moveAnimation}
          onPreviewAnimations={playAnimations}
          onSetAnimStep={setAnimStep}
          onDelete={() => deleteSelection()}
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
      {shortcutsOpen && (
        <div className="modal-backdrop" onClick={() => setShortcutsOpen(false)}>
          <div className="shortcuts-card" onClick={(event) => event.stopPropagation()}>
            <div className="shortcuts-head">
              <div>
                <strong>Keyboard shortcuts</strong>
                <small>Everything the ribbon does has a key</small>
              </div>
              <button type="button" className="ghost-btn icon-only" onClick={() => setShortcutsOpen(false)} title="Close">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="shortcuts-grid">
              {KEYBOARD_SHORTCUTS.map(([keys, action]) => (
                <div className="shortcut-row" key={keys}>
                  <kbd>{keys}</kbd>
                  <span>{action}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          label={contextMenu.label}
          onClose={() => setContextMenu(null)}
        />
      )}
      {toast && (
        <div className={`toast ${toast.type}`}>
          <Icon name={toast.type === 'error' ? 'info' : 'check'} size={18} />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}


