import { useRef, useEffect } from 'react';
import Icon from './Icon.jsx';
import TableGrid from './TableGrid.jsx';
import { clipPathFor, pointsAttr, SHAPE_MAP } from '../lib/shapes.js';
import { fontStack } from '../lib/fonts.js';

function gradientDefs(fill, id) {
  if (typeof fill !== 'string' || !fill.startsWith('linear-gradient')) return null;
  const colors = fill.match(/#(?:[0-9a-f]{3,8})|rgba?\([^)]*\)/gi) || [];
  if (colors.length < 2) return null;
  return (
    <defs>
      <linearGradient id={id} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor={colors[0]} />
        <stop offset="100%" stopColor={colors[colors.length - 1]} />
      </linearGradient>
    </defs>
  );
}

export function ShapeArt({ element }) {
  const { shape = 'rect', fill = '#6366f1', stroke, strokeWidth = 0, radius = 0, w, h, id } = element;
  const gradientId = `grad-${String(id || 'shape').replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const gradient = gradientDefs(fill, gradientId);
  const solid = gradient ? `url(#${gradientId})` : fill === 'transparent' ? 'none' : fill;
  const strokeProps = stroke
    ? { stroke, strokeWidth: Math.max(0.5, strokeWidth || 1), vectorEffect: 'non-scaling-stroke', fill: 'none' }
    : {};
  const rx = radius ? (radius / Math.max(1, Math.min(w || 100, h || 100))) * 100 : 0;

  let primitive;
  if (shape === 'ellipse') {
    primitive = <ellipse cx="50" cy="50" rx="50" ry="50" fill={solid} {...strokeProps} />;
  } else if (shape === 'roundRect') {
    primitive = <rect x="0" y="0" width="100" height="100" rx={Math.min(50, rx)} fill={solid} {...strokeProps} />;
  } else if (shape === 'rect' || !SHAPE_MAP[shape]) {
    primitive = <rect x="0" y="0" width="100" height="100" fill={solid} {...strokeProps} />;
  } else {
    primitive = <polygon points={pointsAttr(shape)} fill={solid} {...strokeProps} />;
  }

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" width="100%" height="100%" style={{ display: 'block', pointerEvents: 'none' }}>
      {gradient}
      {primitive}
    </svg>
  );
}

function RichText({ element }) {
  if (!element.runs?.length) return element.text;
  const joined = element.runs.map((run) => run.text).join('');
  if (joined !== element.text) return element.text;
  return element.runs.map((run, index) => (
    <span
      key={index}
      style={{
        fontFamily: run.fontFamily ? fontStack(run.fontFamily) : undefined,
        fontSize: run.fontSize ? `${run.fontSize}px` : undefined,
        color: run.color || undefined,
        fontWeight: run.bold ? 700 : undefined,
        fontStyle: run.italic ? 'italic' : undefined,
        textDecoration: run.underline ? 'underline' : undefined,
        whiteSpace: 'pre-wrap',
      }}
    >
      {run.text}
    </span>
  ));
}

function MediaExpandButton({ onClick, label = 'Expand' }) {
  return (
    <button
      type="button"
      className="media-expand-btn"
      title={label}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick?.();
      }}
    >
      <Icon name="expand" size={15} />
    </button>
  );
}

export default function ElementView({
  element,
  editingText = false,
  onTextCommit,
  onMediaExpand,
  mediaInteractive = false,
  preview = false,
  onTableDoubleClick,
  tableHighlight,
}) {
  const textAreaRef = useRef(null);

  useEffect(() => {
    if (editingText && textAreaRef.current) {
      textAreaRef.current.focus();
      const length = textAreaRef.current.value.length;
      textAreaRef.current.setSelectionRange(length, length);
    }
  }, [editingText]);

  const baseStyle = {
    position: 'absolute',
    left: `${element.x}px`,
    top: `${element.y}px`,
    width: `${element.w}px`,
    height: `${element.h}px`,
    transform: element.rotation ? `rotate(${element.rotation}deg)` : undefined,
    opacity: element.opacity ?? 1,
  };

  if (element.type === 'shape') {
    const style = element.style || {};
    return (
      <div className="element element-shape" style={baseStyle}>
        <ShapeArt element={element} />
        {element.text ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              padding: `${element.padding ?? 10}px`,
              display: 'flex',
              alignItems: style.valign === 'top' ? 'flex-start' : style.valign === 'bottom' ? 'flex-end' : 'center',
              justifyContent:
                style.align === 'left' ? 'flex-start' : style.align === 'right' ? 'flex-end' : 'center',
              fontFamily: fontStack(style.fontFamily),
              fontSize: `${style.fontSize || 24}px`,
              color: style.color || '#ffffff',
              fontWeight: style.bold ? 700 : 500,
              fontStyle: style.italic ? 'italic' : 'normal',
              textAlign: style.align || 'center',
              lineHeight: style.lineHeight || 1.25,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              pointerEvents: 'none',
              overflow: 'hidden',
            }}
          >
            {element.text}
          </div>
        ) : null}
      </div>
    );
  }

  if (element.type === 'image') {
    return (
      <div
        className={`element element-image ${element.expandable ? 'expandable' : ''}`}
        style={{
          ...baseStyle,
          overflow: 'hidden',
          clipPath: clipPathFor(element.clipShape) || undefined,
          borderRadius: element.clipShape && element.clipShape !== 'none' ? 0 : `${element.radius || 0}px`,
          border: element.stroke ? `${element.strokeWidth || 1}px solid ${element.stroke}` : 'none',
          boxSizing: 'border-box',
          cursor: element.expandable ? 'zoom-in' : undefined,
        }}
        onClick={(event) => {
          if (!element.expandable) return;
          event.stopPropagation();
          onMediaExpand?.(element);
        }}
      >
        <img
          src={element.src}
          alt={element.name || ''}
          draggable={false}
          style={{
            width: '100%',
            height: '100%',
            objectFit: element.fit || 'cover',
            transform: `translate(${element.crop?.x || 0}%, ${element.crop?.y || 0}%) scale(${element.crop?.scale || 1})`,
            transformOrigin: 'center center',
            display: 'block',
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
        {element.expandable && mediaInteractive && <MediaExpandButton onClick={() => onMediaExpand?.(element)} />}
      </div>
    );
  }

  if (element.type === 'text') {
    const style = element.style || {};
    const justify = style.valign === 'middle' ? 'center' : style.valign === 'bottom' ? 'flex-end' : 'flex-start';
    return (
      <div
        className="element element-text"
        style={{
          ...baseStyle,
          background: element.fill && element.fill !== 'transparent' ? element.fill : 'transparent',
          border: element.stroke ? `${element.strokeWidth || 1}px solid ${element.stroke}` : 'none',
          borderRadius: element.radius ? `${element.radius}px` : 0,
          padding: `${element.padding ?? 8}px`,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: justify,
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {editingText ? (
          <textarea
            ref={textAreaRef}
            className="inline-text-editor"
            defaultValue={element.text}
            style={{
              fontFamily: fontStack(style.fontFamily),
              fontSize: `${style.fontSize || 28}px`,
              color: style.color || '#0f172a',
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? 'italic' : 'normal',
              textDecoration: style.underline ? 'underline' : 'none',
              textAlign: style.align || 'left',
              lineHeight: style.lineHeight || 1.25,
              letterSpacing: `${style.letterSpacing || 0}px`,
              width: '100%',
              height: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              padding: 0,
              overflow: 'hidden',
            }}
            onBlur={(event) => onTextCommit?.(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onTextCommit?.(event.target.value, { cancel: true });
              }
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                onTextCommit?.(event.target.value);
              }
              event.stopPropagation();
            }}
          />
        ) : (
          <div
            className="text-content"
            style={{
              fontFamily: fontStack(style.fontFamily),
              fontSize: `${style.fontSize || 28}px`,
              color: style.color || '#0f172a',
              fontWeight: style.bold ? 700 : 400,
              fontStyle: style.italic ? 'italic' : 'normal',
              textDecoration: style.underline ? 'underline' : 'none',
              textAlign: style.align || 'left',
              lineHeight: style.lineHeight || 1.25,
              letterSpacing: `${style.letterSpacing || 0}px`,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              width: '100%',
              userSelect: 'none',
            }}
          >
            <RichText element={element} />
          </div>
        )}
      </div>
    );
  }
  if (element.type === 'video') {
    return (
      <div
        className="element element-video"
        style={{
          ...baseStyle,
          overflow: 'hidden',
          borderRadius: `${element.radius || 0}px`,
          background: '#020617',
          border: element.stroke ? `${element.strokeWidth || 1}px solid ${element.stroke}` : 'none',
          boxSizing: 'border-box',
        }}
        onClick={(event) => {
          if (!element.expandable || preview) return;
          event.stopPropagation();
          onMediaExpand?.(element);
        }}
      >
        {preview ? (
          <div className="video-preview">
            {element.poster ? (
              <img src={element.poster} alt="" draggable={false} />
            ) : (
              <div className="video-preview-fallback" />
            )}
            <span className="video-play-badge">
              <Icon name="play" size={22} filled />
            </span>
            <span className="video-preview-name">{element.name || 'Video'}</span>
          </div>
        ) : (
          <video
            src={element.src}
            poster={element.poster || undefined}
            controls={element.controls !== false}
            muted={element.muted}
            loop={element.loop}
            autoPlay={element.autoplay}
            playsInline
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: element.fit || 'cover', display: 'block' }}
          />
        )}
        {element.expandable && <MediaExpandButton onClick={() => onMediaExpand?.(element)} />}
      </div>
    );
  }

  if (element.type === 'audio') {
    return (
      <div
        className="element element-audio"
        style={{
          ...baseStyle,
          borderRadius: `${element.radius || 16}px`,
          background: 'linear-gradient(135deg, rgba(79,70,229,0.95), rgba(14,165,233,0.85))',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 16px',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <span className="audio-icon">
          <Icon name="audio" size={22} />
        </span>
        <span className="audio-meta">
          <span className="audio-label">{element.label || element.name || 'Audio clip'}</span>
          {mediaInteractive && !preview ? (
            <audio src={element.src} controls style={{ width: '100%', height: 28 }} />
          ) : (
            <span className="audio-bars">
              {Array.from({ length: 18 }).map((_, index) => (
                <i key={index} style={{ animationDelay: `${index * 0.08}s` }} />
              ))}
            </span>
          )}
        </span>
        {element.expandable && <MediaExpandButton onClick={() => onMediaExpand?.(element)} />}
      </div>
    );
  }

  if (element.type === 'table') {
    return (
      <div
        className="element element-table"
        style={{
          ...baseStyle,
          background: '#ffffff',
          borderRadius: `${element.radius || 2}px`,
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(15,23,42,0.08)',
        }}
        onDoubleClick={(event) => {
          if (!onTableDoubleClick) return;
          event.stopPropagation();
          onTableDoubleClick(element);
        }}
      >
        <TableGrid table={element.table} highlight={tableHighlight} />
      </div>
    );
  }

  return null;
}

