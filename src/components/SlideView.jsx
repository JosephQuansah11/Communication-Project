import ElementView from './ElementView.jsx';

export default function SlideView({
  slide,
  width,
  height,
  scale = 1,
  mediaInteractive = false,
  preview = false,
  onMediaExpand,
  editingTextId,
  onTextCommit,
  onTableDoubleClick,
  className = '',
  hideBackground = false,
  style,
}) {
  if (!slide) return null;
  const background = slide.background || {};
  return (
    <div
      className={`slide-view ${className}`}
      style={{
        width: `${width * scale}px`,
        height: `${height * scale}px`,
        overflow: 'hidden',
        flex: '0 0 auto',
        ...style,
      }}
    >
      <div
        className="slide-surface"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: hideBackground ? 'transparent' : background.color || '#ffffff',
        }}
      >
        {!hideBackground && background.image && (
          <div
            className="slide-background-image"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("${background.image}")`,
              backgroundSize: background.fit === 'contain' ? 'contain' : background.fit === 'stretch' ? '100% 100%' : 'cover',
              backgroundPosition: 'center',
              backgroundRepeat: 'no-repeat',
              opacity: background.opacity ?? 1,
              filter: background.blur ? `blur(${background.blur}px)` : undefined,
            }}
          />
        )}
        {slide.elements?.map((element) => (
          <ElementView
            key={element.id}
            element={element}
            editingText={editingTextId === element.id}
            onTextCommit={(text, options) => onTextCommit?.(element, text, options)}
            onMediaExpand={onMediaExpand}
            mediaInteractive={mediaInteractive}
            preview={preview}
            onTableDoubleClick={onTableDoubleClick}
          />
        ))}
      </div>
    </div>
  );
}
