import { useEffect, useRef, useState } from 'react';
import { normalizeTransition, transitionDuration, transitionPlays } from '../../shared/transitions.js';

/**
 * Watches the slide a show is on and reports the transition to play, if any.
 *
 * A transition belongs to the slide *arriving*, so this fires when the index moves
 * and holds the slide that was on screen (its position in the deck) so the renderer
 * can keep it behind the incoming one. Nothing runs for the first slide, for `none`,
 * or when the index changes for a reason other than navigation — the deck being
 * edited, for instance.
 *
 * The returned run is `{ id, from, token, duration }`; `token` is a fresh value each
 * time, which the renderer uses as a React key so the animation restarts.
 */
export function useSlideTransition(deck, index) {
  const [run, setRun] = useState(null);
  const previous = useRef(index);
  const timer = useRef(null);

  useEffect(() => {
    const from = previous.current;
    previous.current = index;
    if (!deck || !Array.isArray(deck.slides)) return undefined;
    if (from === index) return undefined;
    const id = normalizeTransition(deck.slides[index]?.transition);
    if (!transitionPlays(id)) return undefined;
    const duration = transitionDuration(id);
    setRun({ id, from, token: `${index}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, duration });
    clearTimeout(timer.current);
    // A little past the animation, so the held slide is never torn down mid-frame.
    timer.current = setTimeout(() => setRun(null), duration + 150);
    return () => clearTimeout(timer.current);
  }, [deck, index]);

  // The show ending, or the deck being replaced, leaves nothing to hold on to.
  useEffect(() => () => clearTimeout(timer.current), []);

  return run;
}
