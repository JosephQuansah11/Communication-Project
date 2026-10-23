const PATHS = {
  logo: ['M4 4h10a5 5 0 0 1 0 10H4', 'M4 4v16'],
  plus: ['M12 5v14', 'M5 12h14'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  check: ['M20 6L9 17l-5-5'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 6l6 6-6 6'],
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  arrowDown: ['M12 5v14', 'M19 12l-7 7-7-7'],
  arrowLeft: ['M19 12H5', 'M12 19l-7-7 7-7'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  upload: ['M12 16V4', 'M7 9l5-5 5 5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  download: ['M12 4v12', 'M7 11l5 5 5-5', 'M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3'],
  import: ['M12 3v12', 'M7 8l5-5 5 5', 'M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4'],
  play: ['M7 4.5v15l13-7.5z'],
  pause: ['M8 5v14', 'M16 5v14'],
  stop: ['M6 6h12v12H6z'],
  monitor: ['M3 5h18v11H3z', 'M8 20h8', 'M12 16v4'],
  presentation: ['M3 4h18v11H3z', 'M12 15v5', 'M8 20l4-3 4 3', 'M9 9l2.5 2.5L15 7'],
  expand: ['M8 3H3v5', 'M16 3h5v5', 'M21 16v5h-5', 'M3 16v5h5'],
  shrink: ['M3 8h5V3', 'M21 8h-5V3', 'M16 21v-5h5', 'M8 21v-5H3'],
  link: ['M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1 1', 'M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1-1'],
  users: ['M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8', 'M22 20v-2a4 4 0 0 0-3-3.9', 'M16 2.1a4 4 0 0 1 0 7.8'],
  image: ['M3 5h18v14H3z', 'M8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3', 'M21 15l-5-5L5 21'],
  video: ['M3 6h13v12H3z', 'M16 10l5-3v10l-5-3'],
  audio: ['M9 18V6l10-2v12', 'M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0', 'M19 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0'],
  text: ['M4 5h16', 'M12 5v14', 'M9 19h6'],
  shape: ['M12 3l9 6-3.5 10.5h-11L3 9z'],
  table: ['M3 4h18v16H3z', 'M3 9h18', 'M9 9v11', 'M15 9v11', 'M3 14h18'],
  trash: ['M4 7h16', 'M9 7V5h6v2', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  undo: ['M9 14L4 9l5-5', 'M4 9h10a6 6 0 0 1 0 12h-3'],
  redo: ['M15 14l5-5-5-5', 'M20 9H10a6 6 0 0 0 0 12h3'],
  save: ['M4 4h12l4 4v12H4z', 'M8 4v6h8V4', 'M8 20v-6h8v6'],
  bold: ['M7 4h6a4 4 0 0 1 0 8H7z', 'M7 12h7a4 4 0 0 1 0 8H7z'],
  italic: ['M10 4h8', 'M6 20h8', 'M14 4L10 20'],
  underline: ['M7 4v7a5 5 0 0 0 10 0V4', 'M5 21h14'],
  alignLeft: ['M4 6h16', 'M4 12h10', 'M4 18h14'],
  alignCenter: ['M4 6h16', 'M7 12h10', 'M5 18h14'],
  alignRight: ['M4 6h16', 'M10 12h10', 'M6 18h14'],
  alignTop: ['M4 4h16', 'M12 8v12'],
  alignMiddle: ['M4 12h16', 'M12 4v4', 'M12 16v4'],
  alignBottom: ['M4 20h16', 'M12 4v12'],
  fill: ['M4 15l7-7 7 7-7 7z', 'M11 8l5-5 5 5'],
  border: ['M4 4h16v16H4z', 'M4 9h16', 'M9 4v16'],
  crop: ['M6 2v16h16', 'M2 6h16v16'],
  layers: ['M12 3l9 5-9 5-9-5z', 'M3 12l9 5 9-5', 'M3 16l9 5 9-5'],
  layerUp: ['M12 4l8 5-8 5-8-5z', 'M5 15l7 4 7-4'],
  layerDown: ['M12 20l8-5-8-5-8 5z', 'M5 9l7-4 7 4'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16l.9 2.1L22 19l-2.1.9L19 22l-.9-2.1L16 19l2.1-.9z'],
  search: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M21 21l-4.3-4.3'],
  grid: ['M3 3h7v7H3z', 'M14 3h7v7h-7z', 'M3 14h7v7H3z', 'M14 14h7v7h-7z'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6'],
  pointer: ['M5 3l14 8-6 1.5L10 19z'],
  zoomIn: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M21 21l-4.3-4.3', 'M11 8v6', 'M8 11h6'],
  zoomOut: ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16', 'M21 21l-4.3-4.3', 'M8 11h6'],
  font: ['M5 20L11 4h2l6 16', 'M8 14h8'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 11v5', 'M12 8h.01'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  external: ['M14 4h6v6', 'M20 4l-9 9', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
  clock: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18', 'M12 7v5l3 2'],
  wifi: ['M5 12a10 10 0 0 1 14 0', 'M8.5 15.5a5 5 0 0 1 7 0', 'M12 19h.01'],
  mouse: ['M12 3a5 5 0 0 1 5 5v8a5 5 0 0 1-10 0V8a5 5 0 0 1 5-5z', 'M12 7v4'],
  scissors: ['M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M20 4L8.1 15.9', 'M14.5 14.5L20 20'],
  file: ['M14 3H6v18h12V7z', 'M14 3v4h4'],
  folder: ['M3 6h6l2 2h10v11H3z'],
  bold2: ['M7 4h6a4 4 0 1 1 0 8H7z', 'M7 12h7a4 4 0 1 1 0 8H7z'],
};

export default function Icon({ name, size = 18, className = '', strokeWidth = 1.8, filled = false }) {
  const paths = PATHS[name] || PATHS.info;
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths.map((d, index) => (
        <path key={index} d={d} />
      ))}
    </svg>
  );
}
