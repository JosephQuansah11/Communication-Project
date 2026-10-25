/**
 * Multiple-object selection — the maths behind picking, aligning, distributing,
 * grouping and the group transform (move / resize / rotate).
 *
 * Everything here is pure: the editor hands over a slide's element list plus the
 * ids that are selected and gets a plain change map back (`{ [id]: changes }`),
 * which is exactly what `patchElements` applies. Keeping it out of React means
 * the behaviour can be unit tested, and the canvas can preview a group drag
 * without touching history.
 *
 * A selection is always *group expanded*: selecting one member of a group
 * selects the whole group, the way PowerPoint treats grouped objects.
 */

import { uid } from './elements.js';

/** Anything at or above this is "all the way to the front/back of the stack". */
const STACK_EDGE = Number.MAX_SAFE_INTEGER / 2;

/** Union rectangle of a set of elements, or null when there is nothing to measure. */
export function boundsOf(elements = []) {
  const list = (elements || []).filter(Boolean);
  if (!list.length) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const element of list) {
    left = Math.min(left, element.x);
    top = Math.min(top, element.y);
    right = Math.max(right, element.x + element.w);
    bottom = Math.max(bottom, element.y + element.h);
  }
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/**
 * Every id a selection should cover: the ids themselves plus every member of any
 * group they belong to. Returned in draw order so a selection is stable.
 */
export function expandGroups(elements = [], ids = []) {
  const wanted = new Set(ids || []);
  if (!wanted.size) return [];
  const groups = new Set();
  for (const element of elements) {
    if (element.group && wanted.has(element.id)) groups.add(element.group);
  }
  return elements
    .filter((element) => wanted.has(element.id) || (element.group && groups.has(element.group)))
    .map((element) => element.id);
}

/** The selected elements, in draw order. */
export function selectionElements(elements = [], ids = []) {
  const wanted = new Set(expandGroups(elements, ids));
  return elements.filter((element) => wanted.has(element.id));
}

/**
 * Ids a marquee box covers. Like PowerPoint, an object has to sit *fully* inside
 * the box to be picked; pass `{ contained: false }` to take anything it touches.
 */
export function idsInBox(elements = [], box, { contained = true } = {}) {
  if (!box) return [];
  const right = box.x + box.w;
  const bottom = box.y + box.h;
  return elements
    .filter((element) => {
      const elementRight = element.x + element.w;
      const elementBottom = element.y + element.h;
      if (contained) {
        return element.x >= box.x && element.y >= box.y && elementRight <= right && elementBottom <= bottom;
      }
      return element.x < right && elementRight > box.x && element.y < bottom && elementBottom > box.y;
    })
    .map((element) => element.id);
}

/** Move every element by the same offset. */
export function offsetChanges(elements = [], dx = 0, dy = 0) {
  const changes = {};
  for (const element of elements) {
    changes[element.id] = { x: Math.round(element.x + dx), y: Math.round(element.y + dy) };
  }
  return changes;
}

/**
 * Align the selection inside `frame` — the selection's own bounding box when
 * several objects are selected, or the slide box for a single object, which is
 * the rule PowerPoint follows.
 */
export function alignOffsets(elements = [], ids = [], mode, frame) {
  const list = selectionElements(elements, ids);
  const box = frame || boundsOf(list);
  if (!list.length || !box) return {};
  const changes = {};
  for (const element of list) {
    let { x, y } = element;
    if (mode === 'left') x = box.x;
    else if (mode === 'center') x = box.x + (box.w - element.w) / 2;
    else if (mode === 'right') x = box.x + box.w - element.w;
    else if (mode === 'top') y = box.y;
    else if (mode === 'middle') y = box.y + (box.h - element.h) / 2;
    else if (mode === 'bottom') y = box.y + box.h - element.h;
    else continue;
    changes[element.id] = { x: Math.round(x), y: Math.round(y) };
  }
  return changes;
}

/**
 * Even out the *gaps* between the objects along one axis; the two outermost stay
 * where they are. Needs at least three objects, as in PowerPoint.
 */
export function distributeOffsets(elements = [], ids = [], axis = 'h') {
  const horizontal = axis === 'h';
  const list = [...selectionElements(elements, ids)].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y));
  if (list.length < 3) return {};
  const size = (element) => (horizontal ? element.w : element.h);
  const start = (element) => (horizontal ? element.x : element.y);
  const first = list[0];
  const last = list[list.length - 1];
  const span = start(last) + size(last) - start(first);
  const used = list.reduce((total, element) => total + size(element), 0);
  const gap = (span - used) / (list.length - 1);
  const changes = {};
  let cursor = start(first);
  for (const element of list) {
    const target = Math.round(cursor);
    changes[element.id] = horizontal ? { x: target } : { y: target };
    cursor += size(element) + gap;
  }
  return changes;
}

/**
 * Group resize: map every element of the selection from one bounding box onto
 * another, so the group keeps its proportions while being scaled.
 */
export function scaleToBounds(elements = [], ids = [], from, to) {
  const list = selectionElements(elements, ids);
  if (!list.length || !from || !to) return {};
  const sx = from.w ? to.w / from.w : 1;
  const sy = from.h ? to.h / from.h : 1;
  const changes = {};
  for (const element of list) {
    changes[element.id] = {
      x: Math.round(to.x + (element.x - from.x) * sx),
      y: Math.round(to.y + (element.y - from.y) * sy),
      w: Math.max(12, Math.round(element.w * sx)),
      h: Math.max(12, Math.round(element.h * sy)),
    };
  }
  return changes;
}

/**
 * Group rotate: spin every element about a point (the group's centre), adding the
 * angle to each element's own rotation so the group turns as one object.
 */
export function rotateAround(elements = [], ids = [], center, delta) {
  const list = selectionElements(elements, ids);
  if (!list.length || !center || !delta) return {};
  const radians = (delta * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const changes = {};
  for (const element of list) {
    const dx = element.x + element.w / 2 - center.x;
    const dy = element.y + element.h / 2 - center.y;
    const nx = center.x + dx * cos - dy * sin;
    const ny = center.y + dx * sin + dy * cos;
    changes[element.id] = {
      x: Math.round(nx - element.w / 2),
      y: Math.round(ny - element.h / 2),
      rotation: Math.round(((element.rotation || 0) + delta) * 10) / 10,
    };
  }
  return changes;
}

/**
 * Make every object match the first one — 'w', 'h' or 'both'. PowerPoint offers
 * the same three commands (Format ▸ Size ▸ Same Width / Same Height).
 */
export function matchSize(elements = [], ids = [], mode = 'both') {
  const list = selectionElements(elements, ids);
  if (list.length < 2) return {};
  const [reference] = list;
  const changes = {};
  for (const element of list.slice(1)) {
    changes[element.id] = {
      ...(mode === 'w' || mode === 'both' ? { w: reference.w } : {}),
      ...(mode === 'h' || mode === 'both' ? { h: reference.h } : {}),
    };
  }
  return changes;
}

/** Put the whole selection into one group so it always selects and moves together. */
export function groupChanges(elements = [], ids = [], groupId = uid('group')) {
  const list = selectionElements(elements, ids);
  if (list.length < 2) return {};
  const changes = {};
  for (const element of list) changes[element.id] = { group: groupId };
  return changes;
}

/** Break apart every group the selection covers. */
export function ungroupChanges(elements = [], ids = []) {
  const changes = {};
  for (const element of selectionElements(elements, ids)) {
    if (element.group) changes[element.id] = { group: null };
  }
  return changes;
}

/** True when any element of the selection still belongs to a group. */
export function hasGroup(elements = [], ids = []) {
  return selectionElements(elements, ids).some((element) => Boolean(element.group));
}

/**
 * Re-order the selection in the z-stack. A delta of ±1 nudges the selection one
 * step while keeping its members' relative order; a huge delta sends it all the
 * way to the front or the back.
 */
export function reorderElements(elements = [], ids = [], delta = 1) {
  const selected = new Set(ids || []);
  if (!selected.size) return elements;
  const picked = elements.filter((element) => selected.has(element.id));
  const rest = elements.filter((element) => !selected.has(element.id));
  if (!picked.length) return elements;
  if (delta >= STACK_EDGE) return [...rest, ...picked];
  if (delta <= -STACK_EDGE) return [...picked, ...rest];

  const list = [...elements];
  if (delta > 0) {
    for (let index = list.length - 2; index >= 0; index -= 1) {
      if (selected.has(list[index].id) && !selected.has(list[index + 1].id)) {
        [list[index], list[index + 1]] = [list[index + 1], list[index]];
      }
    }
  } else {
    for (let index = 1; index < list.length; index += 1) {
      if (selected.has(list[index].id) && !selected.has(list[index - 1].id)) {
        [list[index], list[index - 1]] = [list[index - 1], list[index]];
      }
    }
  }
  return list;
}

/**
 * Copy the selection: fresh ids, an offset so the copy is visible, and a fresh
 * group id per source group so the copy is its own group rather than being
 * swallowed by the original one.
 */
export function duplicateSelection(elements = [], ids = [], offset = 24) {
  const copies = pasteElements(selectionElements(elements, ids), offset);
  return { copies, ids: copies.map((copy) => copy.id) };
}

/**
 * Fresh copies of elements that were put on the clipboard: new ids, an offset so
 * the paste lands next to the original, and a fresh group id per group — a pasted
 * group is its own group, it never joins the one it came from.
 */
export function pasteElements(clipboardElements = [], offset = 24) {
  const groupMap = new Map();
  return (clipboardElements || []).filter(Boolean).map((element) => {
    const copy = JSON.parse(JSON.stringify(element));
    copy.id = uid();
    copy.x = Math.round((Number(element.x) || 0) + offset);
    copy.y = Math.round((Number(element.y) || 0) + offset);
    if (element.group) {
      if (!groupMap.has(element.group)) groupMap.set(element.group, uid('group'));
      copy.group = groupMap.get(element.group);
    }
    return copy;
  });
}

