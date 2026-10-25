import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import SlideView from './SlideView.jsx';
import { backgroundStyles } from '../lib/backgrounds.js';

export function useStageScale(width, height, mode = 'contain') {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    const update = () => setSize({ w: node.clientWidth, h: node.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const scale =
    size.w && size.h
      ? mode === 'cover'
        ? Math.max(size.w / width, size.h / height)
        : Math.min(size.w / width, size.h / height)
      : 0;

  return { ref, scale, size };
}

export default function Stage({
  deck,
  slide,
  mode = 'contain',
  onMediaExpand,
  onTableDoubleClick,
  className = '',
  overlay,
  children,
  animStep = null,
}) {
  const { ref, scale, size } = useStageScale(deck.width, deck.height, mode);
  const background = slide?.background || {};
  const { container, layer } = backgroundStyles(background);
  const shellColor = container.backgroundColor;

  useEffect(() => {
    document.documentElement.style.backgroundColor = shellColor;
    return () => {
      document.documentElement.style.backgroundColor = '';
    };
  }, [shellColor]);

  return (
    <div ref={ref} className={`presentation-stage ${className}`} style={{ backgroundColor: shellColor }}>
      <div
        className="stage-background"
        style={{
          position: 'absolute',
          inset: 0,
          ...(layer || { backgroundColor: shellColor }),
        }}
      />
      {scale > 0 && (
        <div
          className="stage-content"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: `${deck.width * scale}px`,
            height: `${deck.height * scale}px`,
            transform: 'translate(-50%, -50%)',
            overflow: 'hidden',
          }}
        >
          <SlideView
            slide={slide}
            width={deck.width}
            height={deck.height}
            scale={scale}
            hideBackground
            mediaInteractive
            onMediaExpand={onMediaExpand}
            onTableDoubleClick={onTableDoubleClick}
            animStep={animStep}
          />
        </div>
      )}
      {overlay}
      {children}
    </div>
  );
}
