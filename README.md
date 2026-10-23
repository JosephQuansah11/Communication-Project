# Slidesmith Studio

A full presentation workspace built with React, Express and WebSockets. It imports PowerPoint/WPS decks,
lets every object be edited, runs an Excel-compatible formula engine inside slide tables, crops images into
shapes, and presents on a chosen display with a live audience that follows over WebSocket.

![Slidesmith Studio](docs/home.png)

## Quick start

```bash
npm install
npm run dev        # http://localhost:3000 (Vite middleware + API + WebSocket)
npm run build
npm start          # production server on PORT (default 3000)
npm test           # formula engine + PPTX importer tests
```

Data lives in `data/` (decks and uploaded media). On first run a five-slide product tour is generated in
`data/decks/demo.json` with demo imagery and audio.

## What is implemented

### PowerPoint / WPS import
- Native OOXML parser (`server/pptx.js`) using JSZip + fast-xml-parser. No cloud or Office runtime needed.
- Slide order and dimensions from `presentation.xml`, theme colours and fonts from `theme1.xml`.
- Text boxes with paragraph alignment, theme colours, fonts, bold/italic/underline and bullets.
- Placeholder transforms inherited from slide layouts and masters when a slide omits its own position.
- Nested group shapes with coordinate transforms, preset geometry mapping (rect, ellipse, rounded,
  triangle, diamond, stars, hexagons, chevrons, arrows, plus, parallelograms, trapezoids).
- Pictures, backgrounds (including slide layout inheritance), tables with grid widths/heights and header fills,
  plus audio/video relationships.
- Imported media is extracted to `data/uploads/<deck>/` and served under `/media/...`.
- `.pptx`, `.ppsx`, `.potx` are parsed natively. Legacy binary `.ppt`, `.dps`, `.dpt`, `.pt` are converted with
  LibreOffice when `soffice`/`libreoffice` is installed; otherwise the API returns a clear "save as .pptx" message.

### Font strategy
Fonts are resolved from the host operating system, never bundled from the web. The client:
1. asks Chromium's `queryLocalFonts()` for the installed font families;
2. falls back to canvas-based detection of common system families if permission is unavailable;
3. renders every text style with `"<chosen family>", system-ui, -apple-system, "Segoe UI", …` so a missing
   imported font gracefully uses the system equivalent.

The inspector shows a **system** badge and the editor footer shows the active font source.

### Excel-style tables
`shared/formula.js` is a dependency-free spreadsheet engine:
- A1 references, ranges (`A1:B9`), `$` anchors, arithmetic, comparison, string concatenation and percent.
- Circular-reference detection and Excel error values (`#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#N/A`, `#CIRC!`).
- 50+ functions: SUM, AVERAGE, MIN, MAX, MEDIAN, COUNT, COUNTA, COUNTIF, SUMIF, AVERAGEIF, IF, IFERROR,
  AND/OR/NOT, ROUND/ROUNDUP/ROUNDDOWN, ABS, SQRT, POWER, MOD, VLOOKUP, HLOOKUP, INDEX, MATCH, TEXTJOIN,
  CONCAT, LEFT/RIGHT/MID, UPPER/LOWER/PROPER, TRIM, SUBSTITUTE, FIND/SEARCH, TODAY/NOW/DATE/YEAR/MONTH/DAY,
  PMT/FV and more.
- Number formats: general, number, integer, currency (USD/EUR/GBP), percent, date, long date, time, text,
  accounting, scientific, and custom `#,##0.00`-style patterns.
- Spreadsheet editor: formula bar with name box, range selection with mouse/Shift+arrows, bold/italic/underline,
  alignment, font size, text/fill colours, insert/delete rows and columns, header styling and live status
  (count/sum/average). Changes recalculate instantly and persist with the deck.
- Tables are also editable **while presenting**; every cell change is broadcast to the audience in real time.

### Presenting
- Present dialog lists displays via the Window Management API (`getScreenDetails()`), showing labels,
  resolutions and primary status; the presenter popup is positioned and sized onto the chosen screen and
  requests full screen.
- Fallback for browsers without multi-screen APIs plus manual drag/full-screen guidance.
- Presenter view: next/previous with arrows/space, progress bar, timer, speaker notes + next-slide preview,
  blackout, fill-screen toggle, and instant exit.
- Background images always paint **edge-to-edge across the display** (`background-size: cover`); slide content
  is letterboxed (or fills the screen with the Fill toggle) without exposing empty bars.
- Click images/video/audio to open an expandable viewer: images zoom (25–600%, wheel, pan), video plays large,
  audio gets a full player.

### Live WebSocket audience
- Presenter hosts a room and receives a six-character code; the audience link appears in the presenter's Live
  panel and is posted back to the share dialog.
- Messages: `host`, `join`, `navigate`, `deck:update`, `table:update`, `pointer`, `reaction`, `presenting`, `end`.
- Audience pages follow slide changes, receive in-presentation table edits instantly, see the presenter's cursor
  trail, send emoji reactions, and show the live viewer count. Auto-reconnect is built in.
- Editor autosaves are announced over BroadcastChannel; the presenter polls the deck as a fallback and pushes
  updates to the audience, so editing while presenting updates the room live.

### Shapes & image cropping
- 15 shape presets with solid/gradient fills, strokes, radius and centred text.
- Any image can be clipped to any preset shape (CSS `clip-path`) with zoom and X/Y crop controls.
- Select a shape and use **Fill shape with an image** to upload and mask a picture to that exact shape while
  keeping the shape's border and text.
- Images keep cover/contain fit, border, radius and opacity controls.

### Editor
- Multi-slide rail with thumbnails, add/duplicate/delete.
- Drag, resize (8 handles), rotate, nudge with arrows, duplicate/delete, undo/redo with 80 steps.
- Drag-and-drop images/video/audio onto the canvas; media uploads go through the server.
- Slide backgrounds: colour, image upload/URL, cover/contain/stretch, opacity and blur.
- Speaker notes and slide transitions.
- Autosave (debounced) with save-state indicator and manual Ctrl/Cmd+S.

## Keyboard shortcuts

| Context | Shortcut | Action |
| --- | --- | --- |
| Editor | `Ctrl/Cmd+Z` / `Shift+Ctrl/Cmd+Z` | Undo / redo |
| Editor | `Ctrl/Cmd+D` | Duplicate selection |
| Editor | `Delete` | Delete selection |
| Editor | Arrows / `Shift`+arrows | Nudge 1px / 10px |
| Editor | `PageUp` / `PageDown` | Previous / next slide |
| Editor | `Ctrl/Cmd+S` | Save now |
| Editor | `F5` | Present dialog |
| Spreadsheet | Arrows / `Shift`+arrows | Move / select range |
| Spreadsheet | `Enter` / `F2` / double-click | Edit cell |
| Spreadsheet | `Tab` / `Shift+Tab` | Next / previous cell |
| Presenter | `←` `→` `Space` `PageUp/Down` | Navigate |
| Presenter | `N` / `B` / `L` / `H` / `F` | Notes / blackout / live panel / hide chrome / fullscreen |
| Presenter | `Esc` | Close overlay or exit |

## Architecture

```
server/
  index.js      Express API, media storage, deck persistence, WebSocket rooms, production SPA serving
  pptx.js       Native PPTX parser (EMU→px, theme, groups, text, pictures, tables, backgrounds)
  demo.js       Generated first-run demo deck and assets (SVG scenery + WAV chime)
shared/
  formula.js    Spreadsheet parser/evaluator, functions, number formatting, table helpers
src/
  App.jsx       Tiny history router (/ , /edit/:id , /present/:id , /live/:code)
  pages/        Home, Editor, Presenter, LiveAudience
  components/   Canvas, SlideView/ElementView, TableEditor, Inspector, PresentDialog, Stage, Lightbox…
  lib/          API client, element factories, shape geometry, system-font discovery
tests/          Node test suites for formulas and PPTX import
```

### API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Service + converter status |
| `GET` | `/api/decks` | Deck summaries |
| `GET` | `/api/decks/:id` | Full deck JSON |
| `POST` | `/api/decks` | Create/save a deck |
| `DELETE` | `/api/decks/:id` | Delete a deck and its media |
| `POST` | `/api/import` | Import `.pptx`/`.ppt`/`.dps`/`.dpt` (multipart field `file`) |
| `POST` | `/api/decks/:id/assets` | Upload media for a deck |
| `GET` | `/api/fonts` | System font stacks + fallback family list |
| `WS` | `/ws` | Live presentation rooms |

## Notes & limits

- Legacy `.ppt`/`.dps` conversion depends on LibreOffice being installed on the server. Modern `.pptx` files
  (including WPS files saved in PowerPoint format) import natively.
- Very exotic OOXML features (SmartArt, charts, animations, embedded OLE) are not reconstructed as editable
  objects; text, shapes, images, media and tables are.
- Video playback in the packaged demo points at a public sample MP4; upload your own media for offline decks.
- The app has no authentication. It is intended for local/trusted-network use, with decks and uploads stored on
  the server.

