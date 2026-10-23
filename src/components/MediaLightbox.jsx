import { useRef, useState, useEffect } from 'react';
import Icon from './Icon.jsx';

export default function MediaLightbox({ element, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const isImage = element.type === 'image';
  const isVideo = element.type === 'video';
  const isAudio = element.type === 'audio';

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onClose();
      if (isImage && (event.key === '+' || event.key === '=')) setZoom((z) => Math.min(6, z + 0.25));
      if (isImage && event.key === '-') setZoom((z) => Math.max(1, z - 0.25));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, isImage]);

  const onWheel = (event) => {
    if (!isImage) return;
    event.preventDefault();
    setZoom((z) => Math.min(6, Math.max(1, z - Math.sign(event.deltaY) * 0.2)));
  };

  const onPointerDown = (event) => {
    if (!isImage || zoom <= 1) return;
    dragRef.current = { x: event.clientX - pan.x, y: event.clientY - pan.y };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event) => {
    if (!dragRef.current) return;
    setPan({ x: event.clientX - dragRef.current.x, y: event.clientY - dragRef.current.y });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };

  return (
    <div className="lightbox" role="dialog" aria-modal="true" aria-label="Expanded media">
      <div className="lightbox-backdrop" onClick={onClose} />
      <div className="lightbox-top">
        <div className="lightbox-title">
          <Icon name={isVideo ? 'video' : isAudio ? 'audio' : 'image'} size={18} />
          <span>{element.name || element.label || (isVideo ? 'Video' : isAudio ? 'Audio' : 'Image')}</span>
        </div>
        <div className="lightbox-tools">
          {isImage && (
            <>
              <button type="button" className="ghost-btn icon-only" onClick={() => setZoom((z) => Math.max(1, z - 0.25))} title="Zoom out">
                <Icon name="zoomOut" />
              </button>
              <span className="zoom-label">{Math.round(zoom * 100)}%</span>
              <button type="button" className="ghost-btn icon-only" onClick={() => setZoom((z) => Math.min(6, z + 0.25))} title="Zoom in">
                <Icon name="zoomIn" />
              </button>
              <button
                type="button"
                className="ghost-btn"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
              >
                Reset
              </button>
            </>
          )}
          <button type="button" className="ghost-btn icon-only" onClick={onClose} title="Close (Esc)">
            <Icon name="close" />
          </button>
        </div>
      </div>

      <div className="lightbox-stage" onClick={(event) => event.stopPropagation()}>
        {isImage && (
          <img
            src={element.src}
            alt={element.name || ''}
            className="lightbox-image"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              cursor: zoom > 1 ? 'grab' : 'default',
            }}
            draggable={false}
          />
        )}
        {isVideo && (
          <video
            className="lightbox-video"
            src={element.src}
            poster={element.poster || undefined}
            controls
            autoPlay
            loop={element.loop}
            muted={element.muted}
            playsInline
          />
        )}
        {isAudio && (
          <div className="lightbox-audio">
            <div className="audio-orb">
              <Icon name="audio" size={48} />
              <span className="audio-ring" />
              <span className="audio-ring delay" />
            </div>
            <h3>{element.label || element.name || 'Audio clip'}</h3>
            <p>Click play to listen</p>
            <audio src={element.src} controls autoPlay />
          </div>
        )}
      </div>
    </div>
  );
}
