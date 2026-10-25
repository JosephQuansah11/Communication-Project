/**
 * OOXML slide timing (`<p:timing>`) reader.
 *
 * PowerPoint stores animations as a tree of time nodes. The shape of the tree is
 * always the same: a `tmRoot` node containing a `mainSeq` sequence whose direct
 * children are the *click groups* — one group per click during the show. Inside a
 * group sit the effect nodes, which carry `presetClass` / `presetID` /
 * `presetSubtype` and point at a shape through `<p:spTgt spid="…">`.
 *
 * This module turns that tree into a flat, renderable list. Anything it cannot
 * understand degrades to a fade rather than being dropped, so an imported deck
 * always animates.
 */

const asArray = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);

const CONTAINERS = ['par', 'seq', 'excl'];

const CLASS_KINDS = { entr: 'entrance', exit: 'exit', emph: 'emphasis', path: 'path' };

const TRIGGERS = { clickEffect: 'click', withEffect: 'with', afterEffect: 'after' };

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

/** Depth-first search for the first node matching a predicate. */
function findNode(node, predicate, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 40) return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    for (const child of asArray(value)) {
      const found = findNode(child, predicate, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

/** The `mainSeq` time node, whose direct `par` children are the click groups. */
function findMainSequence(timing) {
  const root = asArray(timing?.tnLst?.par)[0];
  if (!root) return null;
  const seq = findNode(root, (node) => node.cTn?.['@_nodeType'] === 'mainSeq' || node['@_nodeType'] === 'mainSeq');
  return seq?.cTn || null;
}

/**
 * Parse a `p:timing` node into raw animation entries (targets are shape ids).
 *
 * @returns {Array<{spid, group, order, kind, presetId, subtype, duration, delay, trigger, auto, autoDelay, path}>}
 */
export function parseTiming(timing) {
  const mainSeq = findMainSequence(timing);
  if (!mainSeq) return [];

  const groups = asArray(mainSeq.childTnLst?.par);
  const animations = [];

  const collect = (container, group) => {
    for (const key of CONTAINERS) {
      for (const child of asArray(container?.[key])) {
        const cTn = child?.cTn;
        if (!cTn) continue;
        const presetClass = cTn['@_presetClass'];
        if (presetClass && CLASS_KINDS[presetClass]) {
          const effect = describeEffect(cTn, child, group, animations.length);
          if (effect) animations.push(effect);
          continue;
        }
        collect(cTn.childTnLst, group);
      }
    }
  };

  groups.forEach((groupPar, groupIndex) => {
    const condition = describeGroupCondition(groupPar?.cTn);
    collect(groupPar?.cTn?.childTnLst, groupIndex);
    // Everything collected for this step inherits how the step itself starts.
    for (const animation of animations) {
      if (animation.group !== groupIndex) continue;
      animation.auto = condition.auto;
      animation.autoDelay = condition.auto ? condition.delay + animation.delay : 0;
    }
  });
  return animations;
}

/**
 * How a click group starts: `delay="indefinite"` (or `evt="onNext"`) waits for
 * the presenter, a numeric delay plays by itself once the slide appears.
 */
function describeGroupCondition(cTn) {
  const cond = asArray(cTn?.stCondLst?.cond)[0] || {};
  const rawDelay = cond['@_delay'];
  const evt = cond['@_evt'];
  const delay = Number(rawDelay);
  if (evt === 'onBegin') return { auto: true, delay: Number.isFinite(delay) ? delay : 0 };
  if (evt === 'onNext' || rawDelay === 'indefinite') return { auto: false, delay: 0 };
  if (Number.isFinite(delay) && delay >= 0) return { auto: true, delay };
  return { auto: false, delay: 0 };
}

function describeEffect(cTn, node, group, order) {
  const kind = CLASS_KINDS[cTn['@_presetClass']];
  const target = findNode(node, (candidate) => candidate.spTgt?.['@_spid'] !== undefined);
  const spid = target?.spTgt?.['@_spid'];
  if (spid === undefined) return null;

  const cond = asArray(cTn.stCondLst?.cond)[0] || {};
  const delay = firstNumber(cond['@_delay']);
  const duration = firstNumber(cTn['@_dur']);

  const pathNode = findNode(node, (candidate) => candidate.animMotion);
  const path = pathNode ? parseMotionPath(pathNode.animMotion) : null;

  return {
    spid: String(spid),
    group,
    order,
    kind,
    presetId: firstNumber(cTn['@_presetID']),
    subtype: firstNumber(cTn['@_presetSubtype']),
    // `indefinite` means "wait for the presenter", i.e. a click.
    duration: duration === null || duration < 0 ? 500 : duration,
    delay: delay === null || delay < 0 ? 0 : delay,
    trigger: TRIGGERS[cTn['@_nodeType']] || (order === 0 ? 'click' : 'with'),
    path,
  };
}

const PATH_POINT_RE = /(-?\d*\.?\d+)\s+(-?\d*\.?\d+)/g;

/** Read an `<p:animMotion>` path into a normalized point list. */
function parseMotionPath(animMotion) {
  const raw = animMotion?.['@_path'];
  if (!raw || typeof raw !== 'string') return null;
  const points = [];
  PATH_POINT_RE.lastIndex = 0;
  let match;
  while ((match = PATH_POINT_RE.exec(raw))) {
    points.push([Number(match[1]), Number(match[2])]);
  }
  if (points.length < 2) return null;
  return {
    points,
    // PowerPoint paths are relative to the shape unless pathEditMode says otherwise.
    relative: animMotion['@_pathEditMode'] !== 'absolute',
  };
}
