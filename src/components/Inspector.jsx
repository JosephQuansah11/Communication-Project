import { useRef } from 'react';
import Icon from './Icon.jsx';
import { SHAPES } from '../lib/shapes.js';

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

function Section({ title, children, defaultOpen = true }) {
  return (
    <details className="inspector-section" open={defaultOpen}>
      <summary>
        <span>{title}</span>
        <Icon name="chevronDown" size={14} />
      </summary>
      <div className="inspector-body">{children}</div>
    </details>
  );
}

export default function Inspector({
  deck,
  slide,
  element,
  fonts,
  fontSource,
  onPatchSlide,
  onPatchElement,
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

  const uploadTo = async (file, apply) => {
    if (!file || !onUpload) return;
    const asset = await onUpload(file);
    if (asset?.url) apply(asset);
  };

  if (!element) {
    const background = slide?.background || {};
    return (
      <aside className="inspector">
        <div className="inspector-head">
          <div>
            <strong>Slide {deck.slides.findIndex((item) => item.id === slide.id) + 1}</strong>
            <small>No element selected</small>
          </div>
          <Icon name="settings" size={16} />
        </div>
        <Section title="Background">
          <ColorField label="Colour" value={background.color || '#ffffff'} onChange={(color) => onPatchSlide({ background: { ...background, color } })} />
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
                <Icon name="upload" size={14} />
              </button>
              {background.image && (
                <button type="button" className="mini-btn" onClick={() => onPatchSlide({ background: { ...background, image: null } })}>
                  <Icon name="close" size={14} />
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
          <Icon name="info" size={14} />
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
              size={14}
            />
            {element.type}
          </span>
          <small>{Math.round(element.w)} × {Math.round(element.h)}</small>
        </div>
        <div className="head-actions">
          <button type="button" className="ghost-btn icon-only" onClick={onDuplicate} title="Duplicate (Ctrl+D)">
            <Icon name="copy" size={16} />
          </button>
          <button type="button" className="ghost-btn icon-only danger" onClick={onDelete} title="Delete">
            <Icon name="trash" size={16} />
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
            <button type="button" className={`seg ${element.style?.bold ? 'on' : ''}`} onClick={() => patchStyle({ bold: !element.style?.bold })}><Icon name="bold" size={15} /></button>
            <button type="button" className={`seg ${element.style?.italic ? 'on' : ''}`} onClick={() => patchStyle({ italic: !element.style?.italic })}><Icon name="italic" size={15} /></button>
            <button type="button" className={`seg ${element.style?.underline ? 'on' : ''}`} onClick={() => patchStyle({ underline: !element.style?.underline })}><Icon name="underline" size={15} /></button>
            <span className="seg-gap" />
            <button type="button" className={`seg ${element.style?.align === 'left' ? 'on' : ''}`} onClick={() => patchStyle({ align: 'left' })}><Icon name="alignLeft" size={15} /></button>
            <button type="button" className={`seg ${element.style?.align === 'center' ? 'on' : ''}`} onClick={() => patchStyle({ align: 'center' })}><Icon name="alignCenter" size={15} /></button>
            <button type="button" className={`seg ${element.style?.align === 'right' ? 'on' : ''}`} onClick={() => patchStyle({ align: 'right' })}><Icon name="alignRight" size={15} /></button>
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
          <ColorField label={isShape ? 'Fill' : 'Text box fill'} value={element.fill} onChange={(fill) => patch({ fill })} allowTransparent />
          {isShape && (
            <div className="field">
              <label>Image inside shape</label>
              <button type="button" className="wide-btn" onClick={() => shapeImageInput.current?.click()}>
                <Icon name="crop" size={15} /> Fill shape with an image
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
                <Icon name="upload" size={15} /> Choose a new image
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
                <Icon name="upload" size={15} /> Upload video
              </button>
            )}
          </div>
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
              <div className="toggle-grid">
                <Toggle label="Loop" checked={element.loop} onChange={(loop) => patch({ loop })} />
                <Toggle label="Muted" checked={element.muted} onChange={(muted) => patch({ muted })} />
                <Toggle label="Auto play" checked={element.autoplay} onChange={(autoplay) => patch({ autoplay })} />
                <Toggle label="Controls" checked={element.controls !== false} onChange={(controls) => patch({ controls })} />
              </div>
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
              <Icon name="upload" size={15} /> Upload audio
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
            <Icon name="table" size={16} /> Open spreadsheet editor
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

      <Section title="Arrange" defaultOpen={false}>
        <div className="row-gap wrap">
          <button type="button" className="wide-btn" onClick={onDuplicate}><Icon name="copy" size={15} /> Duplicate</button>
          <button type="button" className="wide-btn danger" onClick={onDelete}><Icon name="trash" size={15} /> Delete element</button>
        </div>
      </Section>
    </aside>
  );
}

