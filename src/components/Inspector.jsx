import { useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { SHAPES } from '../lib/shapes.js';
import { BACKGROUND_PRESETS, describeBackground, gradientCss, normalizePictureFill, similarBackgroundFor } from '../lib/backgrounds.js';
import {
  ANIMATION_KINDS,
  DIRECTION_LABELS,
  directionsForEffect,
  effectsForKind,
  normalizeAnimation,
} from '../../shared/animations.js';
import { describeAnimation } from '../lib/animations.js';
import { isOnlineVideo, onlineVideoLabel } from '../../shared/video.js';

const HIGHLIGHT_SWATCHES = ['#fef08a', '#bbf7d0', '#bfdbfe', '#fecdd3', '#fed7aa', '#e9d5ff', '#f1f5f9'];

/** The six alignment commands, in the order PowerPoint lists them. */
const ALIGN_ACTIONS = [
  { mode: 'left', label: 'Left', icon: 'alignLeft', title: 'Align the left edges' },
  { mode: 'center', label: 'Centre', icon: 'alignCenter', title: 'Align the horizontal centres' },
  { mode: 'right', label: 'Right', icon: 'alignRight', title: 'Align the right edges' },
  { mode: 'top', label: 'Top', icon: 'alignTop', title: 'Align the top edges' },
  { mode: 'middle', label: 'Middle', icon: 'alignMiddle', title: 'Align the vertical centres' },
  { mode: 'bottom', label: 'Bottom', icon: 'alignBottom', title: 'Align the bottom edges' },
];

function ColorField({ label, value, onChange, allowTransparent = false }) {
  const safe = value && value.startsWith('#') ? value : '#ffffff';
  return (
    <div className="field">
      <label>{label}</label>
      <div className="color-row">
        <input type="color" value={safe} onChange={(event) => onChange(event.target.value)} />
        <input className="text-input mono" value={value || ''} placeholder="transparent" onChange={(event) => onChange(event.target.value)} />
        {allowTransparent && (
          <button type="button" className="mini-btn" onClick={() => onChange('transparent')} title="No fill">none</button>
        )}
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange, min, max, step = 1, suffix }) {
  return (
    <div className="field compact">
      <label>{label}</label>
      <div className="number-wrap">
        <input
          type="number"
          value={Number.isFinite(Number(value)) ? Number(value) : 0}
          min={min}
          max={max}
          step={step}
          onChange={(event) => onChange(Number(event.target.value), event)}
        />
        {suffix && <span>{suffix}</span>}
      </div>
    </div>
  );
}

function SliderField({ label, value, onChange, min = 0, max = 100, step = 1, suffix = '' }) {
  return (
    <div className="field">
      <label>
        {label}
        <span className="field-value">{Math.round(Number(value) || 0)}{suffix}</span>
      </label>
      <input type="range" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function Toggle({ label, checked, onChange, hint }) {
  return (
    <label className="toggle-row">
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
      <i className="switch" />
    </label>
  );
}

function FontSelect({ value, onChange, fonts, source }) {
  return (
    <div className="field">
      <label>
        Font <span className="system-badge" title="Fonts are resolved from your operating system">system</span>
      </label>
      <select className="text-input" value={value || 'system-ui'} onChange={(event) => onChange(event.target.value)}>
        {[...new Set([value, ...fonts].filter(Boolean))].map((family) => (
          <option key={family} value={family}>{family}</option>
        ))}
      </select>
      {source === 'local-font-access' && <small className="field-hint">Loaded from your installed fonts</small>}
    </div>
  );
}

/**
 * Picture fill for a container (a text box, a shape, …): an image used as the
 * background of the object, with fit and opacity, or picked from the pictures
 * already on the slide.
 */
function PictureFillField({ label = 'Picture fill', fill, images = [], onChange, onUpload, onUseAsBackground }) {
  const input = useRef(null);
  const picture = normalizePictureFill(fill);
  const withDefaults = (src) => ({ src, fit: picture?.fit || 'cover', opacity: picture?.opacity ?? 1 });

  return (
    <div className="field">
      <label>
        {label}
        <span className="field-value">{picture ? picture.fit : 'none'}</span>
      </label>
      <div className="row-gap">
        <input
          className="text-input"
          value={picture?.src || ''}
          placeholder="Paste an image URL"
          onChange={(event) => onChange(event.target.value ? withDefaults(event.target.value) : null)}
        />
        <button type="button" className="mini-btn" title="Upload a picture" onClick={() => input.current?.click()}>
          <Icon name="upload" size={17} />
        </button>
        {picture && (
          <button type="button" className="mini-btn" title="Remove the picture" onClick={() => onChange(null)}>
            <Icon name="close" size={17} />
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          const asset = await onUpload?.(file);
          if (asset?.url) onChange(withDefaults(asset.url));
        }}
      />
      {images.length > 0 && (
        <select
          className="text-input"
          value=""
          onChange={(event) => {
            if (event.target.value) onChange(withDefaults(event.target.value));
          }}
        >
          <option value="">Use a picture from this slide…</option>
          {images.map((src) => (
            <option key={src} value={src}>
              {src.split('/').pop()}
            </option>
          ))}
        </select>
      )}
      {picture && (
        <>
          <div className="field-grid">
            <div className="field compact">
              <label>Fit</label>
              <select className="text-input" value={picture.fit} onChange={(event) => onChange({ ...picture, fit: event.target.value })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="stretch">Stretch</option>
                <option value="tile">Tile</option>
              </select>
            </div>
            <NumberField
              label="Opacity"
              value={Math.round((picture.opacity ?? 1) * 100)}
              min={5}
              max={100}
              suffix="%"
              onChange={(value) => onChange({ ...picture, opacity: value / 100 })}
            />
          </div>
          {onUseAsBackground && (
            <button type="button" className="wide-btn" onClick={() => onUseAsBackground(picture.src)}>
              <Icon name="image" size={18} /> Set as slide background
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Section({ title, children, defaultOpen = true }) {
  return (
    <details className="inspector-section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <Icon name="chevronDown" size={17} />
      </summary>
      <div className="inspector-body">{children}</div>
    </details>
  );
}

export default function Inspector({
  deck,
  slide,
  element,
  selectedElements = [],
  selectedBounds = null,
  fonts,
  fontSource,
  onPatchSlide,
  onPatchElement,
  onPatchSelection,
  onAlign,
  onDistribute,
  onMatchSize,
  onGroup,
  onUngroup,
  grouped = false,
  onPatchTextStyle,
  animations,
  animStep,
  animSteps,
  onAddAnimation,
  onUpdateAnimation,
  onRemoveAnimation,
  onMoveAnimation,
  onPreviewAnimations,
  onSetAnimStep,
  onDelete,
  onDuplicate,
  onEditTable,
  onUpload,
  onAddShapeImage,
}) {
  const bgInput = useRef(null);
  const mediaInput = useRef(null);
  const shapeImageInput = useRef(null);
  const patch = (changes) => onPatchElement?.(changes);
  const patchStyle = (changes) => patch({ style: { ...(element?.style || {}), ...changes } });
  const patchText = (changes) => (onPatchTextStyle ? onPatchTextStyle(changes) : patchStyle(changes));

  const [editingAnimId, setEditingAnimId] = useState(null);
  const elementAnimations = useMemo(
    () =>
      (animations || [])
        .filter((animation) => animation.targetId === element?.id || animation.targetIds?.includes(element?.id))
        .sort((a, b) => a.group - b.group || a.order - b.order),
    [animations, element?.id]
  );
  const activeAnimation =
    elementAnimations.find((animation) => animation.id === editingAnimId) ||
    elementAnimations[elementAnimations.length - 1] ||
    null;

  /** Pictures already on the slide, so a container can reuse one as its fill. */
  const slideImages = useMemo(
    () => [...new Set((slide?.elements || []).filter((item) => item.type === 'image' && item.src).map((item) => item.src))],
    [slide]
  );

  const uploadTo = async (file, apply) => {
    if (!file || !onUpload) return;
    const asset = await onUpload(file);
    if (asset?.url) apply(asset);
  };

  /**
   * Two or more objects: the inspector turns into commands that act on the whole
   * selection — align, distribute, group and one shared format — which is exactly
   * what PowerPoint shows for a multiple selection.
   */
  if (selectedElements.length > 1) {
    const count = selectedElements.length;
    const [first] = selectedElements;
    const types = [...new Set(selectedElements.map((item) => item.type))];
    /** The value every object shares, or the primary object's when they differ. */
    const common = (read, fallback) => {
      const values = selectedElements.map(read);
      return values.every((value) => value === values[0]) ? values[0] : fallback;
    };
    const fill = common((item) => item.fill ?? 'transparent', first.fill ?? 'transparent');
    const opacity = common((item) => Math.round((item.opacity ?? 1) * 100), Math.round((first.opacity ?? 1) * 100));
    const fontSize = common((item) => item.style?.fontSize ?? null, first.style?.fontSize ?? 24);
    const allBold = common((item) => Boolean(item.style?.bold), Boolean(first.style?.bold));
    const allItalic = common((item) => Boolean(item.style?.italic), Boolean(first.style?.italic));
    const isTextual = (item) => item.type === 'text' || item.type === 'shape';
    const textCount = selectedElements.filter(isTextual).length;
    const stylePatch = (changes) =>
      onPatchSelection((item) => (isTextual(item) ? { style: { ...(item.style || {}), ...changes } } : null));

    return (
      <aside className="inspector">
        <div className="inspector-head">
          <div>
            <strong>{count} objects selected</strong>
            <small>Commands apply to all of them</small>
          </div>
          <Icon name="layers" size={19} />
        </div>

        <div className="multi-summary">
          {types.map((type) => (
            <span key={type} className="multi-chip">
              {selectedElements.filter((item) => item.type === type).length} × {type}
            </span>
          ))}
          {selectedBounds && (
            <span className="multi-chip">
              {Math.round(selectedBounds.w)} × {Math.round(selectedBounds.h)}
            </span>
          )}
        </div>
        <Section title="Align & distribute">
          <div className="align-grid">
            {ALIGN_ACTIONS.map((action) => (
              <button
                key={action.mode}
                type="button"
                className="mini-btn"
                title={action.title}
                onClick={() => onAlign(action.mode)}
              >
                <Icon name={action.icon} size={17} />
                <span>{action.label}</span>
              </button>
            ))}
          </div>
          <div className="row-gap wrap">
            <button
              type="button"
              className="wide-btn"
              disabled={count < 3}
              title="Even out the horizontal gaps between the objects"
              onClick={() => onDistribute('h')}
            >
              <Icon name="distributeH" size={18} /> Space horizontally
            </button>
            <button
              type="button"
              className="wide-btn"
              disabled={count < 3}
              title="Even out the vertical gaps between the objects"
              onClick={() => onDistribute('v')}
            >
              <Icon name="distributeV" size={18} /> Space vertically
            </button>
          </div>
          <div className="row-gap wrap">
            <button type="button" className="mini-btn" onClick={() => onMatchSize('w')}>Same width</button>
            <button type="button" className="mini-btn" onClick={() => onMatchSize('h')}>Same height</button>
            <button type="button" className="mini-btn" onClick={() => onMatchSize('both')}>Same size</button>
          </div>
          <small className="field-hint">
            Align uses the selection's own bounding box; “Same …” copies the first object's size onto the rest.
            Spacing needs three or more objects.
          </small>
        </Section>

        <Section title="Group">
          <div className="row-gap wrap">
            <button type="button" className="wide-btn" onClick={onGroup}>
              <Icon name="group" size={18} /> Group
            </button>
            <button type="button" className="wide-btn" onClick={onUngroup} disabled={!grouped}>
              <Icon name="ungroup" size={18} /> Ungroup
            </button>
          </div>
          <small className="field-hint">
            Grouped objects always select and move together — click any member and the whole group follows.
          </small>
        </Section>

        <Section title="Format all">
          <ColorField
            label="Fill"
            value={fill}
            allowTransparent
            onChange={(value) => onPatchSelection((item) => (isTextual(item) ? { fill: value } : null))}
          />
          <SliderField
            label="Opacity"
            value={opacity}
            min={0}
            max={100}
            suffix="%"
            onChange={(value) => onPatchSelection({ opacity: value / 100 })}
          />
          {textCount > 0 && (
            <>
              <NumberField
                label="Font size"
                value={fontSize}
                min={6}
                max={400}
                onChange={(value) => stylePatch({ fontSize: value })}
              />
              <Toggle label="Bold" checked={allBold} onChange={() => stylePatch({ bold: !allBold })} />
              <Toggle label="Italic" checked={allItalic} onChange={() => stylePatch({ italic: !allItalic })} />
              <small className="field-hint">
                Text formatting reaches the {textCount} text object{textCount === 1 ? '' : 's'} in the selection.
              </small>
            </>
          )}
        </Section>

        <Section title="Arrange">
          <div className="row-gap wrap">
            <button type="button" className="wide-btn" onClick={onDuplicate}>
              <Icon name="copy" size={18} /> Duplicate all
            </button>
            <button type="button" className="wide-btn danger" onClick={onDelete}>
              <Icon name="trash" size={18} /> Delete all
            </button>
          </div>
        </Section>
      </aside>
    );
  }

  if (!element) {
    const background = slide?.background || {};
    return (
      <aside className="inspector">
        <div className="inspector-head">
          <div>
            <strong>Slide {deck.slides.findIndex((item) => item.id === slide.id) + 1}</strong>
            <small>No element selected</small>
          </div>
          <Icon name="settings" size={19} />
        </div>
        <Section title="Background">
          <ColorField label="Colour" value={background.color || '#ffffff'} onChange={(color) => onPatchSlide({ background: { ...background, color } })} />
          <div className="field">
            <label>
              Designer presets
              <span className="field-value">{describeBackground(background)}</span>
            </label>
            <div className="bg-presets">
              {BACKGROUND_PRESETS.map((preset) => {
                const active =
                  (preset.background.gradient ? gradientCss(preset.background.gradient) : null) ===
                  (background.gradient ? gradientCss(background.gradient) : null) &&
                  preset.background.color === background.color;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    title={preset.label}
                    className={`bg-swatch ${active ? 'on' : ''}`}
                    style={{
                      backgroundColor: preset.background.color,
                      backgroundImage: preset.background.gradient ? gradientCss(preset.background.gradient) : undefined,
                    }}
                    onClick={() => onPatchSlide({ background: { ...background, ...preset.background } })}
                  />
                );
              })}
            </div>
            <small className="field-hint">Colours, gradients and images all paint edge-to-edge when presenting.</small>
          </div>
          <div className="field">
            <label>
              Similar background
              <span className="field-value">{deck?.theme?.colors ? 'theme palette' : 'slide colours'}</span>
            </label>
            <button
              type="button"
              className="wide-btn"
              onClick={() => onPatchSlide({ background: similarBackgroundFor(deck, slide) })}
            >
              <Icon name="sparkle" size={18} /> Generate a matching background
            </button>
            <small className="field-hint">
              For imported decks whose design picture did not come with the file: builds a new picture from this deck's
              own colours, so the layout stays recognisable.
            </small>
          </div>
          <div className="field">
            <label>
              Gradient
              <span className="field-value">{background.gradient ? (background.gradient.type === 'radial' ? 'radial' : 'linear') : 'off'}</span>
            </label>
            <div className="row-gap">
              <input
                type="color"
                title="Gradient start"
                value={background.gradient?.from || '#6366f1'}
                onChange={(event) =>
                  onPatchSlide({
                    background: {
                      ...background,
                      gradient: { from: event.target.value, to: '#0ea5e9', angle: 135, type: 'linear', ...(background.gradient || {}) },
                    },
                  })
                }
              />
              <input
                type="color"
                title="Gradient end"
                value={background.gradient?.to || '#0ea5e9'}
                onChange={(event) =>
                  onPatchSlide({
                    background: {
                      ...background,
                      gradient: { from: '#6366f1', to: event.target.value, angle: 135, type: 'linear', ...(background.gradient || {}) },
                    },
                  })
                }
              />
              <select
                className="text-input"
                value={background.gradient?.type || 'linear'}
                onChange={(event) =>
                  onPatchSlide({
                    background: {
                      ...background,
                      gradient: { from: '#6366f1', to: '#0ea5e9', angle: 135, ...(background.gradient || {}), type: event.target.value },
                    },
                  })
                }
              >
                <option value="linear">Linear</option>
                <option value="radial">Radial</option>
              </select>
              <button
                type="button"
                className="mini-btn"
                title="Remove gradient"
                onClick={() => onPatchSlide({ background: { ...background, gradient: null } })}
              >
                <Icon name="close" size={17} />
              </button>
            </div>
            <div className="row-gap">
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={background.gradient?.angle ?? 135}
                disabled={!background.gradient || background.gradient?.type === 'radial'}
                onChange={(event) =>
                  onPatchSlide({
                    background: {
                      ...background,
                      gradient: { from: '#6366f1', to: '#0ea5e9', ...(background.gradient || {}), angle: Number(event.target.value) },
                    },
                  })
                }
              />
              <span className="field-value">{background.gradient?.angle ?? 135}°</span>
            </div>
            {!background.gradient && (
              <button
                type="button"
                className="wide-btn"
                onClick={() =>
                  onPatchSlide({ background: { ...background, gradient: { from: '#6366f1', to: '#0ea5e9', angle: 135, type: 'linear' } } })
                }
              >
                <Icon name="sparkle" size={18} /> Add a gradient
              </button>
            )}
          </div>
          <div className="field">
            <label>Image</label>
            <div className="row-gap">
              <input
                className="text-input"
                value={background.image || ''}
                placeholder="Paste an image URL"
                onChange={(event) => onPatchSlide({ background: { ...background, image: event.target.value || null } })}
              />
              <button type="button" className="mini-btn" onClick={() => bgInput.current?.click()} title="Upload background">
                <Icon name="upload" size={17} />
              </button>
              {background.image && (
                <button type="button" className="mini-btn" onClick={() => onPatchSlide({ background: { ...background, image: null } })}>
                  <Icon name="close" size={17} />
                </button>
              )}
            </div>
            <input
              ref={bgInput}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                uploadTo(file, (asset) => onPatchSlide({ background: { ...background, image: asset.url } }));
              }}
            />
          </div>
          <div className="field">
            <label>Image fit</label>
            <select
              className="text-input"
              value={background.fit || 'cover'}
              onChange={(event) => onPatchSlide({ background: { ...background, fit: event.target.value } })}
            >
              <option value="cover">Cover — fill the window</option>
              <option value="contain">Contain — show everything</option>
              <option value="stretch">Stretch to slide</option>
            </select>
            <small className="field-hint">In present mode the background always paints edge-to-edge across the screen.</small>
          </div>
          <SliderField label="Opacity" value={(background.opacity ?? 1) * 100} min={10} max={100} suffix="%" onChange={(value) => onPatchSlide({ background: { ...background, opacity: value / 100 } })} />
          <SliderField label="Blur" value={background.blur || 0} min={0} max={30} suffix="px" onChange={(value) => onPatchSlide({ background: { ...background, blur: value } })} />
        </Section>
        <Section title="Slide options">
          <div className="field">
            <label>Transition</label>
            <select className="text-input" value={slide.transition || 'fade'} onChange={(event) => onPatchSlide({ transition: event.target.value })}>
              <option value="fade">Fade</option>
              <option value="slide">Slide</option>
              <option value="none">None</option>
            </select>
          </div>
          <div className="field">
            <label>Speaker notes</label>
            <textarea
              className="text-input notes-input"
              rows={6}
              value={slide.notes || ''}
              placeholder="Notes appear in presenter view…"
              onChange={(event) => onPatchSlide({ notes: event.target.value })}
            />
          </div>
        </Section>
        <div className="inspector-footer">
          <Icon name="info" size={17} />
          <span>Tip: drop images or video straight onto the canvas.</span>
        </div>
      </aside>
    );
  }
  const isText = element.type === 'text';
  const isShape = element.type === 'shape';
  const isMedia = element.type === 'image' || element.type === 'video';
  const isAudio = element.type === 'audio';
  const isTable = element.type === 'table';

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <div className="inspector-element-title">
          <span className="type-chip">
            <Icon
              name={isTable ? 'table' : isAudio ? 'audio' : element.type === 'video' ? 'video' : element.type === 'image' ? 'image' : isShape ? 'shape' : 'text'}
              size={17}
            />
            {element.type}
          </span>
          <small>{Math.round(element.w)} × {Math.round(element.h)}</small>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost-btn icon-only" onClick={onDuplicate} title="Duplicate (Ctrl+D)">
            <Icon name="copy" size={19} />
          </button>
          <button type="button" className="ghost-btn icon-only danger" onClick={onDelete} title="Delete">
            <Icon name="trash" size={19} />
          </button>
        </div>
      </div>

      <Section title="Layout">
        <div className="field-grid">
          <NumberField label="X" value={element.x} onChange={(x) => patch({ x })} suffix="px" />
          <NumberField label="Y" value={element.y} onChange={(y) => patch({ y })} suffix="px" />
          <NumberField label="W" value={element.w} min={8} onChange={(w) => patch({ w })} suffix="px" />
          <NumberField label="H" value={element.h} min={8} onChange={(h) => patch({ h })} suffix="px" />
          <NumberField label="Rotate" value={element.rotation || 0} min={-360} max={360} onChange={(rotation) => patch({ rotation })} suffix="°" />
          <NumberField label="Opacity" value={Math.round((element.opacity ?? 1) * 100)} min={0} max={100} onChange={(value) => patch({ opacity: value / 100 })} suffix="%" />
        </div>
      </Section>

      {(isText || isShape) && (
        <Section title={isShape ? 'Shape & text' : 'Text'}>
          {isShape && (
            <div className="field">
              <label>Shape</label>
              <select className="text-input" value={element.shape || 'rect'} onChange={(event) => patch({ shape: event.target.value, radius: event.target.value === 'roundRect' ? element.radius || 24 : element.radius })}>
                {SHAPES.map((shape) => (
                  <option key={shape.id} value={shape.id}>{shape.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Content</label>
            <textarea
              className="text-input notes-input"
              rows={3}
              value={element.text || ''}
              placeholder="Type something…"
              onChange={(event) => patch({ text: event.target.value })}
            />
          </div>
          <FontSelect value={element.style?.fontFamily} onChange={(fontFamily) => patchStyle({ fontFamily })} fonts={fonts} source={fontSource} />
          <div className="field-grid">
            <NumberField label="Size" value={element.style?.fontSize || 24} min={6} max={400} onChange={(fontSize) => patchStyle({ fontSize })} suffix="px" />
            <NumberField label="Line" value={element.style?.lineHeight || 1.25} min={0.6} max={3} step={0.05} onChange={(lineHeight) => patchStyle({ lineHeight })} />
            <NumberField label="Spacing" value={element.style?.letterSpacing || 0} min={-5} max={40} onChange={(letterSpacing) => patchStyle({ letterSpacing })} suffix="px" />
            <NumberField label="Padding" value={element.padding ?? 8} min={0} max={120} onChange={(padding) => patch({ padding })} suffix="px" />
          </div>
          <div className="seg-row">
            <button type="button" className={`seg ${element.style?.bold ? 'on' : ''}`} onClick={() => patchText({ bold: !element.style?.bold })}><Icon name="bold" size={18} /></button>
            <button type="button" className={`seg ${element.style?.italic ? 'on' : ''}`} onClick={() => patchText({ italic: !element.style?.italic })}><Icon name="italic" size={18} /></button>
            <button type="button" className={`seg ${element.style?.underline ? 'on' : ''}`} onClick={() => patchText({ underline: !element.style?.underline })}><Icon name="underline" size={18} /></button>
            <button type="button" className={`seg ${element.style?.superscript ? 'on' : ''}`} onClick={() => patchText({ superscript: !element.style?.superscript })} title="Superscript"><Icon name="superscript" size={18} /></button>
            <button type="button" className={`seg ${element.style?.subscript ? 'on' : ''}`} onClick={() => patchText({ subscript: !element.style?.subscript })} title="Subscript"><Icon name="subscript" size={18} /></button>
            <span className="seg-gap" />
            <button type="button" className={`seg ${element.style?.align === 'left' ? 'on' : ''}`} onClick={() => patchStyle({ align: 'left' })}><Icon name="alignLeft" size={18} /></button>
            <button type="button" className={`seg ${element.style?.align === 'center' ? 'on' : ''}`} onClick={() => patchStyle({ align: 'center' })}><Icon name="alignCenter" size={18} /></button>
            <button type="button" className={`seg ${element.style?.align === 'right' ? 'on' : ''}`} onClick={() => patchStyle({ align: 'right' })}><Icon name="alignRight" size={18} /></button>
          </div>
          <div className="field-grid">
            <div className="field compact">
              <label>Vertical</label>
              <select className="text-input" value={element.style?.valign || 'top'} onChange={(event) => patchStyle({ valign: event.target.value })}>
                <option value="top">Top</option>
                <option value="middle">Middle</option>
                <option value="bottom">Bottom</option>
              </select>
            </div>
            <div className="field compact">
              <label>Colour</label>
              <input type="color" className="color-input" value={element.style?.color || '#0f172a'} onChange={(event) => patchStyle({ color: event.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>
              Highlight
              <span className="field-value">{element.style?.highlight || 'none'}</span>
            </label>
            <div className="highlight-row">
              {HIGHLIGHT_SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  className={`hl-swatch ${element.style?.highlight === swatch ? 'on' : ''}`}
                  style={{ background: swatch }}
                  title={swatch}
                  onClick={() => patchText({ highlight: element.style?.highlight === swatch ? null : swatch })}
                />
              ))}
              <button type="button" className="mini-btn" onClick={() => patchText({ highlight: null })} title="No highlight">none</button>
            </div>
          </div>
          <ColorField label={isShape ? 'Fill' : 'Text box fill'} value={element.fill} onChange={(fill) => patch({ fill })} allowTransparent />
          <PictureFillField
            label="Picture fill"
            fill={element.fillImage}
            images={slideImages}
            onChange={(fillImage) => patch({ fillImage })}
            onUpload={onUpload}
            onUseAsBackground={(image) => onPatchSlide?.({ background: { ...(slide?.background || {}), image } })}
          />
          {isShape && (
            <div className="field">
              <label>Image inside shape</label>
              <button type="button" className="wide-btn" onClick={() => shapeImageInput.current?.click()}>
                <Icon name="crop" size={18} /> Fill shape with an image
              </button>
              <input
                ref={shapeImageInput}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) onAddShapeImage?.(file, element);
                }}
              />
              <small className="field-hint">Uploads the picture and masks it to this exact shape, keeping the shape's border and text.</small>
            </div>
          )}
          <div className="field-grid">
            <div className="field compact">
              <label>Border</label>
              <input type="color" className="color-input" value={element.stroke || '#e2e8f0'} onChange={(event) => patch({ stroke: event.target.value })} />
            </div>
            <NumberField label="Width" value={element.strokeWidth || 0} min={0} max={40} onChange={(strokeWidth) => patch({ strokeWidth })} suffix="px" />
            <NumberField label="Radius" value={element.radius || 0} min={0} max={400} onChange={(radius) => patch({ radius })} suffix="px" />
          </div>
        </Section>
      )}

      {isMedia && (
        <Section title={element.type === 'video' ? 'Video' : 'Image'}>
          <div className="field">
            <label>{element.type === 'video' ? 'Source' : 'Replace image'}</label>
            {element.type === 'image' ? (
              <button type="button" className="wide-btn" onClick={() => mediaInput.current?.click()}>
                <Icon name="upload" size={18} /> Choose a new image
              </button>
            ) : (
              <input className="text-input" value={element.src || ''} onChange={(event) => patch({ src: event.target.value })} placeholder="Video URL or upload" />
            )}
            <input
              ref={mediaInput}
              type="file"
              accept={element.type === 'video' ? 'video/*' : 'image/*'}
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const asset = await onUpload(file);
                if (asset?.url) patch({ src: asset.url, name: asset.name || file.name });
              }}
            />
            {element.type === 'video' && (
              <button type="button" className="wide-btn" onClick={() => mediaInput.current?.click()}>
                <Icon name="upload" size={18} /> Upload video
              </button>
            )}
          </div>
          {element.type === 'image' && (
            <div className="field">
              <label>Background</label>
              <button
                type="button"
                className="wide-btn"
                onClick={() => onPatchSlide?.({ background: { ...(slide?.background || {}), image: element.src } })}
              >
                <Icon name="image" size={18} /> Set this picture as the slide background
              </button>
              <small className="field-hint">The picture is painted edge-to-edge behind every object on this slide.</small>
            </div>
          )}
          <div className="field-grid">
            <div className="field compact">
              <label>Fit</label>
              <select className="text-input" value={element.fit || 'cover'} onChange={(event) => patch({ fit: event.target.value })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="fill">Stretch</option>
              </select>
            </div>
            <div className="field compact">
              <label>Border</label>
              <input type="color" className="color-input" value={element.stroke || '#e2e8f0'} onChange={(event) => patch({ stroke: event.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Crop to shape</label>
            <select className="text-input" value={element.clipShape || 'none'} onChange={(event) => patch({ clipShape: event.target.value })}>
              <option value="none">None (rectangle)</option>
              {SHAPES.map((shape) => (
                <option key={shape.id} value={shape.id}>{shape.label}</option>
              ))}
            </select>
            <small className="field-hint">Masks the picture into the selected shape. Adjust zoom and position below.</small>
          </div>
          <SliderField label="Crop zoom" value={(element.crop?.scale || 1) * 100} min={100} max={300} suffix="%" onChange={(value) => patch({ crop: { ...(element.crop || {}), scale: value / 100 } })} />
          <SliderField label="Crop X" value={element.crop?.x || 0} min={-100} max={100} suffix="%" onChange={(value) => patch({ crop: { ...(element.crop || {}), x: value } })} />
          <SliderField label="Crop Y" value={element.crop?.y || 0} min={-100} max={100} suffix="%" onChange={(value) => patch({ crop: { ...(element.crop || {}), y: value } })} />
          <NumberField label="Corner radius" value={element.radius || 0} min={0} max={400} onChange={(radius) => patch({ radius })} suffix="px" />
          {element.type === 'video' && (
            <>
              <div className="field">
                <label>Poster image URL</label>
                <input className="text-input" value={element.poster || ''} onChange={(event) => patch({ poster: event.target.value })} placeholder="Optional poster frame" />
              </div>
              {isOnlineVideo(element.src) ? (
                <div className="field">
                  <label>
                    Online video
                    <span className="field-value">{onlineVideoLabel(element.src)}</span>
                  </label>
                  <div className="row-gap wrap">
                    <a className="mini-btn" href={element.src} target="_blank" rel="noreferrer">
                      <Icon name="external" size={17} /> Open the link
                    </a>
                    <span className="field-hint">
                      Plays inside the slide through the provider's player; the poster frame is shown until it starts.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="toggle-grid">
                  <Toggle label="Loop" checked={element.loop} onChange={(loop) => patch({ loop })} />
                  <Toggle label="Muted" checked={element.muted} onChange={(muted) => patch({ muted })} />
                  <Toggle label="Auto play" checked={element.autoplay} onChange={(autoplay) => patch({ autoplay })} />
                  <Toggle label="Controls" checked={element.controls !== false} onChange={(controls) => patch({ controls })} />
                </div>
              )}
            </>
          )}
          <Toggle label="Expand on click" hint="Opens a full-size viewer while presenting" checked={element.expandable} onChange={(expandable) => patch({ expandable })} />
        </Section>
      )}

      {isAudio && (
        <Section title="Audio">
          <div className="field">
            <label>Source URL</label>
            <input className="text-input" value={element.src || ''} onChange={(event) => patch({ src: event.target.value })} />
            <button type="button" className="wide-btn" onClick={() => mediaInput.current?.click()}>
              <Icon name="upload" size={18} /> Upload audio
            </button>
            <input
              ref={mediaInput}
              type="file"
              accept="audio/*"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (!file) return;
                const asset = await onUpload(file);
                if (asset?.url) patch({ src: asset.url, name: asset.name || file.name });
              }}
            />
          </div>
          <div className="field">
            <label>Label</label>
            <input className="text-input" value={element.label || ''} onChange={(event) => patch({ label: event.target.value })} />
          </div>
          <Toggle label="Expand on click" hint="Opens a large audio player" checked={element.expandable} onChange={(expandable) => patch({ expandable })} />
        </Section>
      )}

      {isTable && (
        <Section title="Spreadsheet">
          <button type="button" className="wide-btn strong" onClick={() => onEditTable?.('open')}>
            <Icon name="table" size={19} /> Open spreadsheet editor
          </button>
          <small className="field-hint">A1 formulas, ranges, number formats and 40+ functions — recalculated instantly.</small>
          <div className="field-grid">
            <NumberField label="Rows" value={element.table?.rows || 1} min={1} max={200} onChange={(rows) => onEditTable?.('resize', { rows })} />
            <NumberField label="Columns" value={element.table?.cols || 1} min={1} max={50} onChange={(cols) => onEditTable?.('resize', { cols })} />
          </div>
          <Toggle label="Header row" checked={element.table?.headerRow} onChange={(headerRow) => onEditTable?.('meta', { headerRow })} />
          <button type="button" className="wide-btn" onClick={() => onEditTable?.('even')}>Distribute column widths</button>
        </Section>
      )}

      <Section title="Animation">
        <div className="row-gap wrap">
          <button type="button" className="mini-btn" onClick={() => onAddAnimation?.(element, { kind: 'entrance', effect: 'fade' })}>
            <Icon name="plus" size={14} /> Entrance
          </button>
          <button type="button" className="mini-btn" onClick={() => onAddAnimation?.(element, { kind: 'emphasis', effect: 'pulse' })}>
            <Icon name="plus" size={14} /> Emphasis
          </button>
          <button type="button" className="mini-btn" onClick={() => onAddAnimation?.(element, { kind: 'exit', effect: 'fade' })}>
            <Icon name="plus" size={14} /> Exit
          </button>
        </div>

        {elementAnimations.length ? (
          <div className="anim-list">
            {elementAnimations.map((animation) => (
              <div
                key={animation.id}
                className={`anim-item ${animStep !== null && animation.group === animStep ? 'active' : ''}`}
              >
                <span className="anim-step" title={`Plays on step ${animation.group + 1}`}>{animation.group + 1}</span>
                <span className="anim-item-body">
                  <strong>{describeAnimation(animation)}</strong>
                  <small>
                    {animation.duration} ms
                    {animation.delay ? ` · +${animation.delay} ms` : ''}
                    {animation.kind === 'emphasis' ? ' · emphasis' : animation.kind === 'exit' ? ' · exit' : ''}
                  </small>
                </span>
                <button type="button" className="mini-btn" onClick={() => onMoveAnimation?.(animation.id, -1)} title="Play earlier">↑</button>
                <button type="button" className="mini-btn" onClick={() => onMoveAnimation?.(animation.id, 1)} title="Play later">↓</button>
                <button
                  type="button"
                  className={`mini-btn ${editingAnimId === animation.id ? 'on' : ''}`}
                  onClick={() => setEditingAnimId(editingAnimId === animation.id ? null : animation.id)}
                  title="Edit effect"
                >
                  <Icon name="settings" size={14} />
                </button>
                <button type="button" className="mini-btn" onClick={() => onRemoveAnimation?.(animation.id)} title="Remove">
                  <Icon name="trash" size={14} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="field-hint">
            No animation yet. Effects play as click steps while presenting — press → to reveal the next one before the
            slide changes.
          </p>
        )}

        {activeAnimation && (
          <div className="anim-editor">
            <div className="field-grid">
              <div className="field compact">
                <label>Kind</label>
                <select
                  className="text-input"
                  value={activeAnimation.kind}
                  onChange={(event) => {
                    const kind = event.target.value;
                    const effect = effectsForKind(kind)[0]?.id || 'fade';
                    onUpdateAnimation?.(activeAnimation.id, { kind, effect, direction: null });
                  }}
                >
                  {ANIMATION_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{kind}</option>
                  ))}
                </select>
              </div>
              <div className="field compact">
                <label>Effect</label>
                <select
                  className="text-input"
                  value={activeAnimation.effect}
                  onChange={(event) => onUpdateAnimation?.(activeAnimation.id, { effect: event.target.value, direction: null })}
                >
                  {effectsForKind(activeAnimation.kind).map((effect) => (
                    <option key={effect.id} value={effect.id}>{effect.label}</option>
                  ))}
                </select>
              </div>
            </div>
            {directionsForEffect(activeAnimation.effect).length > 0 && (
              <div className="field compact">
                <label>Direction</label>
                <select
                  className="text-input"
                  value={activeAnimation.direction || ''}
                  onChange={(event) => onUpdateAnimation?.(activeAnimation.id, { direction: event.target.value })}
                >
                  {directionsForEffect(activeAnimation.effect).map((direction) => (
                    <option key={direction} value={direction}>{DIRECTION_LABELS[direction] || direction}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="field-grid">
              <div className="field compact">
                <label>Start</label>
                <select
                  className="text-input"
                  value={activeAnimation.trigger}
                  onChange={(event) => onUpdateAnimation?.(activeAnimation.id, { trigger: event.target.value })}
                >
                  <option value="click">On click</option>
                  <option value="with">With previous</option>
                  <option value="after">After previous</option>
                </select>
              </div>
              <NumberField
                label="Duration"
                value={activeAnimation.duration}
                min={0}
                max={20000}
                step={100}
                suffix="ms"
                onChange={(duration) => onUpdateAnimation?.(activeAnimation.id, { duration })}
              />
            </div>
            <NumberField
              label="Delay"
              value={activeAnimation.delay}
              min={0}
              max={60000}
              step={50}
              suffix="ms"
              onChange={(delay) => onUpdateAnimation?.(activeAnimation.id, { delay })}
            />
          </div>
        )}

        {animSteps > 0 && (
          <div className="row-gap">
            <button type="button" className="wide-btn" onClick={() => onPreviewAnimations?.()}>
              <Icon name="play" size={17} filled /> Preview on the canvas
            </button>
            <button
              type="button"
              className="mini-btn"
              onClick={() => onSetAnimStep?.(animStep === null ? 0 : null)}
              title={animStep === null ? 'Preview from the first step' : 'Show the finished slide'}
            >
              <Icon name="eye" size={17} />
            </button>
          </div>
        )}
      </Section>

      <Section title="Arrange" defaultOpen={false}>
        <div className="row-gap wrap">
          <button type="button" className="wide-btn" onClick={onDuplicate}><Icon name="copy" size={18} /> Duplicate</button>
          <button type="button" className="wide-btn danger" onClick={onDelete}><Icon name="trash" size={18} /> Delete element</button>
        </div>
      </Section>
    </aside>
  );
}

