import ElementView from './ElementView.jsx';
import BackgroundMedia from './BackgroundMedia.jsx';
import { backgroundStyles } from '../lib/backgrounds.js';

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
  animStep = null,
  style,
}) {
  if (!slide) return null;
  const background = slide.background || {};
  const { container, layer } = backgroundStyles(background);
  const slideSize = { width, height };
  const animations = slide.animations || [];
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
          backgroundColor: hideBackground ? 'transparent' : container.backgroundColor,
        }}
      >
        {!hideBackground && layer && <div className="slide-background-image" style={layer} />}
        {/* A motion scene or a looping video sits above the picture and below the
            objects, so slide content always stays readable on top of it. */}
        {!hideBackground && <BackgroundMedia background={background} paused={preview} />}
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
            animations={animations}
            animStep={animStep}
            slideSize={slideSize}
          />
        ))}
      </div>
    </div>
  );
}
