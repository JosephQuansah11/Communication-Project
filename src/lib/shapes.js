export const SHAPES = [
  { id: 'rect', label: 'Rectangle', css: null },
  { id: 'roundRect', label: 'Rounded rectangle', css: null, radius: true },
  { id: 'ellipse', label: 'Ellipse', css: 'ellipse(50% 50% at 50% 50%)' },
  { id: 'triangle', label: 'Triangle', css: 'polygon(50% 0%, 100% 100%, 0% 100%)' },
  { id: 'diamond', label: 'Diamond', css: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' },
  {
    id: 'star5',
    label: 'Star',
    css: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)',
  },
  {
    id: 'star4',
    label: 'Sparkle',
    css: 'polygon(50% 0%, 62% 38%, 100% 50%, 62% 62%, 50% 100%, 38% 62%, 0% 50%, 38% 38%)',
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    css: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
  },
  {
    id: 'pentagon',
    label: 'Pentagon',
    css: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)',
  },
  {
    id: 'chevron',
    label: 'Chevron',
    css: 'polygon(0% 0%, 75% 0%, 100% 50%, 75% 100%, 0% 100%, 25% 50%)',
  },
  {
    id: 'rightArrow',
    label: 'Arrow right',
    css: 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)',
  },
  {
    id: 'leftArrow',
    label: 'Arrow left',
    css: 'polygon(40% 20%, 100% 20%, 100% 80%, 40% 80%, 40% 100%, 0% 50%, 40% 0%)',
  },
  {
    id: 'plus',
    label: 'Plus',
    css: 'polygon(35% 0%, 65% 0%, 65% 35%, 100% 35%, 100% 65%, 65% 65%, 65% 100%, 35% 100%, 35% 65%, 0% 65%, 0% 35%, 35% 35%)',
  },
  {
    id: 'parallelogram',
    label: 'Parallelogram',
    css: 'polygon(20% 0%, 100% 0%, 80% 100%, 0% 100%)',
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    css: 'polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)',
  },
];

export const SHAPE_MAP = Object.fromEntries(SHAPES.map((shape) => [shape.id, shape]));

export function clipPathFor(shapeId) {
  const shape = SHAPE_MAP[shapeId];
  return shape?.css || null;
}

export function isRound(shapeId) {
  return shapeId === 'roundRect';
}

const STAR5 = [
  [50, 0], [61, 35], [98, 35], [68, 57], [79, 91], [50, 70], [21, 91], [32, 57], [2, 35], [39, 35],
];
const STAR4 = [[50, 0], [62, 38], [100, 50], [62, 62], [50, 100], [38, 62], [0, 50], [38, 38]];
const HEX = [[25, 0], [75, 0], [100, 50], [75, 100], [25, 100], [0, 50]];
const PENT = [[50, 0], [100, 38], [82, 100], [18, 100], [0, 38]];
const CHEVRON = [[0, 0], [75, 0], [100, 50], [75, 100], [0, 100], [25, 50]];
const ARROW_R = [[0, 20], [60, 20], [60, 0], [100, 50], [60, 100], [60, 80], [0, 80]];
const ARROW_L = [[40, 20], [100, 20], [100, 80], [40, 80], [40, 100], [0, 50], [40, 0]];
const PLUS = [
  [35, 0], [65, 0], [65, 35], [100, 35], [100, 65], [65, 65], [65, 100], [35, 100], [35, 65], [0, 65], [0, 35], [35, 35],
];
const PARALLELOGRAM = [[20, 0], [100, 0], [80, 100], [0, 100]];
const TRAPEZOID = [[20, 0], [80, 0], [100, 100], [0, 100]];
const TRIANGLE = [[50, 0], [100, 100], [0, 100]];
const DIAMOND = [[50, 0], [100, 50], [50, 100], [0, 50]];

export const SHAPE_POINTS = {
  triangle: TRIANGLE,
  diamond: DIAMOND,
  star5: STAR5,
  star4: STAR4,
  hexagon: HEX,
  pentagon: PENT,
  chevron: CHEVRON,
  rightArrow: ARROW_R,
  leftArrow: ARROW_L,
  plus: PLUS,
  parallelogram: PARALLELOGRAM,
  trapezoid: TRAPEZOID,
};

export function pointsAttr(shapeId) {
  return (SHAPE_POINTS[shapeId] || []).map(([x, y]) => `${x},${y}`).join(' ');
}
