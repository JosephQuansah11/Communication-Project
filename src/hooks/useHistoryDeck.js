import { useCallback, useRef, useState } from 'react';

export function useHistoryDeck(initial) {
  const [deck, setDeckState] = useState(initial);
  const deckRef = useRef(initial);
  const past = useRef([]);
  const future = useRef([]);
  const transaction = useRef(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  /**
   * A counter that changes whenever the deck changes. Comparing it is free,
   * whereas serialising the whole deck to see whether it changed is not — that
   * used to happen on every pointer move of a drag.
   */
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const bump = useCallback(() => {
    revisionRef.current += 1;
    setRevision(revisionRef.current);
  }, []);

  const apply = useCallback((updater, record = true) => {
    const previous = deckRef.current;
    const next = typeof updater === 'function' ? updater(previous) : updater;
    if (!next || next === previous) return previous;
    if (record) {
      if (transaction.current) {
        past.current.push(transaction.current);
        transaction.current = null;
      } else {
        past.current.push(previous);
      }
      if (past.current.length > 80) past.current.shift();
      future.current = [];
      setHistoryVersion((value) => value + 1);
    }
    deckRef.current = next;
    setDeckState(next);
    bump();
    return next;
  }, [bump]);

  const preview = useCallback((updater) => apply(updater, false), [apply]);

  const begin = useCallback(() => {
    if (!transaction.current) transaction.current = deckRef.current;
  }, []);

  const end = useCallback(() => {
    if (!transaction.current) return;
    const start = transaction.current;
    transaction.current = null;
    if (start !== deckRef.current) {
      past.current.push(start);
      if (past.current.length > 80) past.current.shift();
      future.current = [];
      setHistoryVersion((value) => value + 1);
    }
  }, []);

  const undo = useCallback(() => {
    const previous = past.current.pop();
    if (!previous) return;
    future.current.push(deckRef.current);
    deckRef.current = previous;
    setDeckState(previous);
    setHistoryVersion((value) => value + 1);
    bump();
  }, [bump]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(deckRef.current);
    deckRef.current = next;
    setDeckState(next);
    setHistoryVersion((value) => value + 1);
    bump();
  }, [bump]);

  const reset = useCallback((next) => {
    deckRef.current = next;
    setDeckState(next);
    past.current = [];
    future.current = [];
    transaction.current = null;
    setHistoryVersion((value) => value + 1);
    bump();
  }, [bump]);

  return {
    deck,
    deckRef,
    apply,
    preview,
    begin,
    end,
    undo,
    redo,
    reset,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    historyVersion,
    revision,
  };
}

