/**
 * The window's ribbon model: the tab strip across the top of the editor
 * (File / Home / Insert / Design / Transitions / Animations / Slide Show /
 * Review / View / Tools) and the groups of controls each tab shows.
 *
 * It is plain data, so the shell can draw it generically (components/Ribbon.jsx)
 * and the tests can assert the layout. Every control has a stable `id`:
 *
 *   - the editor maps ids to actions through `onAction(id)`;
 *   - controls that need their own widget (a colour picker, a slider, a grid of
 *     shapes…) are rendered by the editor through `renderItem(item)`, and
 *     everything else falls back to a plain button.
 *
 * item = {
 *   id:     action id, e.g. 'newSlide'
 *   label:  caption
 *   icon:   Icon.jsx name
 *   size:   'large' (icon above the caption) | 'small' (inline, the default)
 *   title:  tooltip (falls back to the label)
 *   toggle: true when the control reflects on/off state (state[item.id])
 *   kind:   'menu' | 'custom' — hints that renderItem() draws this control
 * }
 */

/** Items of the File menu (the button on the far left of the ribbon). */
export const FILE_ITEMS = [
  { id: 'file:new', label: 'New presentation', icon: 'plus', title: 'Create an empty presentation' },
  { id: 'file:open', label: 'Open library', icon: 'folder', title: 'Back to all presentations' },
  { id: 'file:save', label: 'Save now', icon: 'save', title: 'Save (Ctrl+S)' },
  { id: 'file:import', label: 'Import PPTX / WPS…', icon: 'import', title: 'Import a PowerPoint or WPS file' },
  { id: 'file:duplicate', label: 'Duplicate presentation', icon: 'copy', title: 'Save a copy of this deck' },
  { id: 'file:export', label: 'Download deck JSON', icon: 'download', title: 'Export the deck as JSON' },
  { id: 'file:delete', label: 'Delete presentation', icon: 'trash', title: 'Delete this deck', danger: true },
];

export const RIBBON_TABS = [
  {
    id: 'home',
    label: 'Home',
    groups: [
      {
        id: 'clipboard',
        label: 'Clipboard',
        items: [
          { id: 'paste', label: 'Paste', icon: 'copy', size: 'large', title: 'Paste from the clipboard (Ctrl+V)' },
          { id: 'cut', label: 'Cut', icon: 'scissors', title: 'Cut the selection (Ctrl+X)' },
          { id: 'copy', label: 'Copy', icon: 'copy', title: 'Copy the selection (Ctrl+C)' },
          {
            id: 'formatPainter',
            label: 'Format painter',
            icon: 'palette',
            size: 'large',
            toggle: true,
            title: 'Copy the formatting of the selected object, then click another object',
          },
          { id: 'duplicate', label: 'Duplicate', icon: 'copy', title: 'Duplicate the selection (Ctrl+D)' },
          { id: 'delete', label: 'Delete', icon: 'trash', title: 'Delete the selection' },
        ],
      },
      {
        id: 'slides',
        label: 'Slides',
        items: [
          { id: 'newSlide', label: 'New slide', icon: 'plus', size: 'large', title: 'Add a slide after this one' },
          { id: 'duplicateSlide', label: 'Duplicate slide', icon: 'copy', title: 'Copy this slide' },
          { id: 'layout', label: 'Layout', icon: 'grid', kind: 'menu', title: 'Rebuild this slide from a layout' },
          { id: 'section', label: 'Section', icon: 'folder', kind: 'menu', title: 'Group slides into a named section' },
        ],
      },
      {
        id: 'font',
        label: 'Font',
        items: [
          { id: 'fontFamily', label: 'Font', icon: 'font', kind: 'custom', title: 'Font family' },
          { id: 'fontSize', label: 'Size', icon: 'heading', kind: 'custom', title: 'Font size' },
          { id: 'bold', label: 'Bold', icon: 'bold', title: 'Bold (Ctrl+B)' },
          { id: 'italic', label: 'Italic', icon: 'italic', title: 'Italic (Ctrl+I)' },
          { id: 'underline', label: 'Underline', icon: 'underline', title: 'Underline (Ctrl+U)' },
          { id: 'superscript', label: 'Superscript', icon: 'superscript', title: 'Superscript' },
          { id: 'subscript', label: 'Subscript', icon: 'subscript', title: 'Subscript' },
          { id: 'textColor', label: 'Text colour', icon: 'palette', kind: 'custom', title: 'Text colour' },
          { id: 'highlight', label: 'Highlight', icon: 'highlight', kind: 'custom', title: 'Highlight colour' },
          { id: 'clearFormat', label: 'Clear', icon: 'clearFormat', title: 'Reset the text formatting of this object' },
        ],
      },
      {
        id: 'paragraph',
        label: 'Paragraph',
        items: [
          { id: 'bullets', label: 'Bullets', icon: 'listBullet', title: 'Bulleted list' },
          { id: 'numbering', label: 'Numbering', icon: 'listOrdered', title: 'Numbered list' },
          { id: 'alignLeft', label: 'Left', icon: 'alignLeft', title: 'Align left' },
          { id: 'alignCenter', label: 'Centre', icon: 'alignCenter', title: 'Align centre' },
          { id: 'alignRight', label: 'Right', icon: 'alignRight', title: 'Align right' },
          { id: 'alignJustify', label: 'Justify', icon: 'body', title: 'Justify' },
          { id: 'lineSpacing', label: 'Spacing', icon: 'heading', kind: 'custom', title: 'Line spacing' },
        ],
      },
      {
        id: 'insert',
        label: 'Insert',
        items: [
          { id: 'shapes', label: 'Shapes', icon: 'shape', size: 'large', kind: 'menu', title: 'Insert a shape' },
          { id: 'picture', label: 'Pictures', icon: 'image', size: 'large', title: 'Upload an image' },
          { id: 'media', label: 'Media', icon: 'video', size: 'large', title: 'Upload video or audio' },
          { id: 'onlineVideo', label: 'Online video', icon: 'link', size: 'large', title: 'Embed a YouTube or Vimeo link' },
          { id: 'textBox', label: 'Text box', icon: 'text', size: 'large', title: 'Add a text box' },
          { id: 'table', label: 'Table', icon: 'table', size: 'large', title: 'Insert an Excel-style table' },
        ],
      },
      {
        id: 'arrange',
        label: 'Arrange',
        items: [
          { id: 'alignMenu', label: 'Align', icon: 'alignLeft', kind: 'menu', title: 'Align and distribute the selected objects' },
          { id: 'groupShapes', label: 'Group', icon: 'group', title: 'Group the selected objects (Ctrl+G)' },
          { id: 'ungroupShapes', label: 'Ungroup', icon: 'ungroup', title: 'Break the selected group apart (Ctrl+Shift+G)' },
          { id: 'bringForward', label: 'Forward', icon: 'layerUp', title: 'Bring forward' },
          { id: 'sendBackward', label: 'Backward', icon: 'layerDown', title: 'Send backward' },
          { id: 'toFront', label: 'To front', icon: 'arrowUp', title: 'Bring to front' },
          { id: 'toBack', label: 'To back', icon: 'arrowDown', title: 'Send to back' },
          { id: 'centerH', label: 'Centre H', icon: 'alignCenter', title: 'Centre horizontally on the slide' },
          { id: 'centerV', label: 'Centre V', icon: 'alignMiddle', title: 'Centre vertically on the slide' },
        ],
      },
      {
        id: 'editing',
        label: 'Editing',
        items: [
          { id: 'find', label: 'Find', icon: 'search', kind: 'custom', title: 'Find text in every slide (Ctrl+F)' },
          { id: 'replace', label: 'Replace', icon: 'replace', kind: 'custom', title: 'Find and replace across the deck (Ctrl+H)' },
          { id: 'selectAll', label: 'Select all', icon: 'marquee', title: 'Select every object on this slide (Ctrl+A)' },
          { id: 'selectTop', label: 'Select', icon: 'pointer', title: 'Select the topmost object' },
          { id: 'selectNone', label: 'Deselect', icon: 'close', title: 'Clear the selection' },
        ],
      },
    ],
  },
  {
    id: 'insert',
    label: 'Insert',
    groups: [
      {
        id: 'slides',
        label: 'Slides',
        items: [
          { id: 'newSlide', label: 'New slide', icon: 'plus', size: 'large' },
          { id: 'duplicateSlide', label: 'Duplicate', icon: 'copy' },
          { id: 'layout', label: 'Layout', icon: 'grid', kind: 'menu' },
          { id: 'section', label: 'Section', icon: 'folder', kind: 'menu' },
        ],
      },
      {
        id: 'objects',
        label: 'Objects',
        items: [
          { id: 'textBox', label: 'Text box', icon: 'text', size: 'large' },
          { id: 'shapes', label: 'Shapes', icon: 'shape', size: 'large', kind: 'menu' },
          { id: 'picture', label: 'Pictures', icon: 'image', size: 'large' },
          { id: 'media', label: 'Media', icon: 'video', size: 'large' },
          { id: 'onlineVideo', label: 'Online video', icon: 'link', size: 'large', title: 'Embed a YouTube or Vimeo link' },
          { id: 'table', label: 'Table', icon: 'table', size: 'large' },
        ],
      },
      {
        id: 'shapetools',
        label: 'Shape tools',
        items: [
          { id: 'penTool', label: 'Pen', icon: 'pen', size: 'large', toggle: true, title: 'Draw a custom shape point by point' },
          { id: 'editPoints', label: 'Edit points', icon: 'node', size: 'large', toggle: true, title: 'Drag the anchors of the selected shape' },
          { id: 'toPath', label: 'To path', icon: 'path', title: 'Turn this shape into an editable path' },
          { id: 'cornerRadius', label: 'Corners', icon: 'corner', kind: 'custom', title: 'Round the corners of this shape' },
          { id: 'shapeUnion', label: 'Union', icon: 'union', title: 'Merge the selected shapes into one' },
          { id: 'shapeSubtract', label: 'Subtract', icon: 'subtract', title: 'Cut the upper shapes out of the lowest one' },
          { id: 'shapeIntersect', label: 'Intersect', icon: 'intersect', title: 'Keep only where the shapes overlap' },
          { id: 'shapeExclude', label: 'Exclude', icon: 'exclude', title: 'Keep everything except the overlap' },
          { id: 'maskShape', label: 'Mask', icon: 'mask', title: 'Fill the selected shape with the selected picture' },
        ],
      },
      {
        id: 'background',
        label: 'Background',
        items: [
          { id: 'bgImage', label: 'Picture background', icon: 'image', size: 'large', kind: 'custom' },
          { id: 'bgColor', label: 'Background colour', icon: 'palette', size: 'large', kind: 'custom' },
          { id: 'bgPresets', label: 'Ready-made looks', icon: 'sparkle', kind: 'custom' },
        ],
      },
    ],
  },
  {
    id: 'design',
    label: 'Design',
    groups: [
      {
        id: 'background',
        label: 'Background',
        items: [
          { id: 'bgPresets', label: 'Presets', icon: 'sparkle', kind: 'custom' },
          { id: 'bgColor', label: 'Colour', icon: 'palette', kind: 'custom' },
          { id: 'bgGradient', label: 'Gradient', icon: 'fill', kind: 'custom' },
          { id: 'bgImage', label: 'Picture', icon: 'image', kind: 'custom' },
          { id: 'applyBackgroundAll', label: 'Apply to all', icon: 'check', title: 'Use this background on every slide' },
        ],
      },
      {
        id: 'size',
        label: 'Slide size',
        items: [
          { id: 'dimensions', label: 'Size', icon: 'monitor', kind: 'custom' },
          { id: 'size16x9', label: '16:9', icon: 'monitor', title: 'Widescreen 1280 × 720' },
          { id: 'size4x3', label: '4:3', icon: 'monitor', title: 'Standard 960 × 720' },
          { id: 'size16x10', label: '16:10', icon: 'monitor', title: 'Wide 1280 × 800' },
        ],
      },
      {
        id: 'theme',
        label: 'Theme',
        items: [
          {
            id: 'similarBackground',
            label: 'Similar look',
            icon: 'sparkle',
            title: 'Generate a background from this deck\'s colours',
          },
          { id: 'fontsInfo', label: 'System fonts', icon: 'font', title: 'Fonts come from your operating system' },
          { id: 'zoomReset', label: 'Fit canvas', icon: 'expand', title: 'Reset the canvas zoom' },
        ],
      },
    ],
  },
  {
    id: 'transitions',
    label: 'Transitions',
    groups: [
      {
        id: 'transition',
        label: 'Transition to this slide',
        items: [
          { id: 'transition', label: 'Effect', icon: 'play', kind: 'custom', title: 'How this slide enters' },
          { id: 'transitionNone', label: 'No transition', icon: 'close', title: 'Cut straight to this slide' },
          { id: 'transitionAll', label: 'Apply to all', icon: 'check', title: 'Use this transition on every slide' },
        ],
      },
      {
        id: 'preview',
        label: 'Preview',
        items: [
          { id: 'animPlay', label: 'Preview', icon: 'play', size: 'large', title: 'Play this slide\'s animations' },
        ],
      },
    ],
  },
  {
    id: 'animations',
    label: 'Animations',
    groups: [
      {
        id: 'animation',
        label: 'Animation',
        items: [
          { id: 'animEntrance', label: 'Entrance', icon: 'arrowDown', size: 'large', title: 'Fade the selection in on click' },
          { id: 'animEmphasis', label: 'Emphasis', icon: 'sparkle', title: 'Pulse the selection' },
          { id: 'animExit', label: 'Exit', icon: 'arrowUp', title: 'Fade the selection out' },
          { id: 'animRemove', label: 'Remove', icon: 'trash', title: 'Remove the animations of the selection' },
          { id: 'animClear', label: 'Clear slide', icon: 'clearFormat', title: 'Remove every animation on this slide' },
        ],
      },
      {
        id: 'timing',
        label: 'Timing',
        items: [
          { id: 'animSteps', label: 'Steps', icon: 'clock', kind: 'custom' },
          { id: 'animPlay', label: 'Play', icon: 'play', size: 'large', title: 'Play the animation timeline' },
          { id: 'animPrevStep', label: 'Previous step', icon: 'chevronLeft' },
          { id: 'animNextStep', label: 'Next step', icon: 'chevronRight' },
          { id: 'animShowAll', label: 'Show all', icon: 'eye', title: 'Show the finished slide' },
        ],
      },
    ],
  },
  {
    id: 'slideshow',
    label: 'Slide Show',
    groups: [
      {
        id: 'start',
        label: 'Start slide show',
        items: [
          { id: 'present', label: 'Present', icon: 'presentation', size: 'large', title: 'Choose a display and present (F5)' },
          { id: 'presentFullscreen', label: 'Full screen', icon: 'expand', title: 'Present in this window, full screen' },
          { id: 'presentCopyLink', label: 'Copy show link', icon: 'link', title: 'Copy the link to this presentation' },
        ],
      },
      {
        id: 'live',
        label: 'Live audience',
        items: [
          { id: 'liveAudience', label: 'Live audience', icon: 'wifi', size: 'large', title: 'Open the presenter console with a live room' },
          { id: 'audienceHint', label: 'Follows over WebSocket', icon: 'users' },
        ],
      },
    ],
  },
  {
    id: 'review',
    label: 'Review',
    groups: [
      {
        id: 'notes',
        label: 'Speaker notes',
        items: [{ id: 'notes', label: 'Notes', icon: 'text', kind: 'custom' }],
      },
      {
        id: 'proofing',
        label: 'Statistics',
        items: [
          { id: 'deckStats', label: 'Deck', icon: 'grid', kind: 'custom' },
          { id: 'wordCount', label: 'Words', icon: 'body', kind: 'custom' },
          { id: 'find', label: 'Find', icon: 'search', kind: 'custom', title: 'Find text in every slide (Ctrl+F)' },
          { id: 'replace', label: 'Replace', icon: 'replace', kind: 'custom', title: 'Find and replace across the deck (Ctrl+H)' },
        ],
      },
      {
        id: 'share',
        label: 'Share',
        items: [
          { id: 'copyDeckLink', label: 'Copy edit link', icon: 'link' },
          { id: 'exportJson', label: 'Download JSON', icon: 'download' },
        ],
      },
    ],
  },
  {
    id: 'view',
    label: 'View',
    groups: [
      {
        id: 'panels',
        label: 'Panels',
        items: [
          { id: 'toggleRail', label: 'Slide rail', icon: 'layers', toggle: true },
          { id: 'toggleInspector', label: 'Properties', icon: 'settings', toggle: true },
          { id: 'toggleTabs', label: 'Document tabs', icon: 'folder', toggle: true },
        ],
      },
      {
        id: 'zoom',
        label: 'Zoom',
        items: [
          { id: 'zoomIn', label: 'Zoom in', icon: 'zoomIn', size: 'large' },
          { id: 'zoomOut', label: 'Zoom out', icon: 'zoomOut', size: 'large' },
          { id: 'zoomReset', label: 'Reset', icon: 'search', title: 'Back to 100%' },
          { id: 'zoomLabel', label: 'Zoom', icon: 'eye', kind: 'custom' },
        ],
      },
      {
        id: 'window',
        label: 'Window',
        items: [
          { id: 'workspaceImage', label: 'Window picture', icon: 'image', size: 'large', kind: 'custom', title: 'Put a picture behind the workspace' },
          { id: 'workspaceClear', label: 'Clear picture', icon: 'close', title: 'Remove the window picture' },
          { id: 'fullScreen', label: 'Full screen', icon: 'expand', title: 'Toggle browser full screen' },
        ],
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    groups: [
      {
        id: 'tools',
        label: 'Tools',
        items: [
          { id: 'tableEditor', label: 'Table editor', icon: 'table', size: 'large', title: 'Open the spreadsheet editor for the selected table' },
          { id: 'mediaViewer', label: 'Media viewer', icon: 'image', size: 'large', title: 'Open the selected image, video or audio' },
          { id: 'shortcuts', label: 'Shortcuts', icon: 'info', size: 'large', title: 'Keyboard shortcuts' },
          { id: 'fontsInfo', label: 'Font source', icon: 'font', title: 'Where the font list comes from' },
          { id: 'systemInfo', label: 'System', icon: 'monitor', kind: 'custom', title: 'The operating system this app is running on' },
        ],
      },
      {
        id: 'deck',
        label: 'Presentation',
        items: [
          { id: 'duplicateDeck', label: 'Duplicate deck', icon: 'copy', title: 'Save a copy of this presentation' },
          { id: 'exportJson', label: 'Download JSON', icon: 'download' },
          { id: 'import', label: 'Import file', icon: 'import', title: 'Import a PowerPoint or WPS file' },
        ],
      },
    ],
  },
];

/** Keyboard shortcuts shown by Tools ▸ Shortcuts. */
export const KEYBOARD_SHORTCUTS = [
  ['Mod+Z', 'Undo'],
  ['Mod+Shift+Z', 'Redo'],
  ['Mod+C', 'Copy the selection (its text goes to the clipboard too)'],
  ['Mod+X', 'Cut the selection'],
  ['Mod+V', 'Paste objects, text or a picture'],
  ['Right-click', 'Object, text and slide menus — including Paste'],
  ['Mod+D', 'Duplicate every selected object'],
  ['Mod+A', 'Select every object on the slide'],
  ['Mod+G', 'Group the selected objects'],
  ['Mod+Shift+G', 'Break the selected group apart'],
  ['Tab / Shift + Tab', 'Select the next / previous object'],
  ['Shift or Ctrl + click', 'Add an object to the selection, or take it out'],
  ['Drag on empty space', 'Marquee-select everything inside the box'],
  ['Mod+S', 'Save now'],
  ['Mod+F', 'Find text in every slide'],
  ['Mod+H', 'Find and replace across the deck'],
  ['Delete', 'Delete the selection'],
  ['Arrow keys', 'Nudge 1 px (10 px with Shift)'],
  ['PageUp / PageDown', 'Previous / next slide'],
  ['F5', 'Present dialog'],
  ['Double-click canvas', 'Write a new text box'],
  ['Esc', 'Close an overlay / clear the selection'],
];

export function ribbonTab(id) {
  return RIBBON_TABS.find((tab) => tab.id === id) || RIBBON_TABS[0];
}

/** Every control id in the model, handy for tests and diagnostics. */
export function ribbonItemIds() {
  return RIBBON_TABS.flatMap((tab) => tab.groups.flatMap((group) => group.items.map((item) => item.id)));
}

export function ribbonItem(id) {
  for (const tab of RIBBON_TABS) {
    for (const group of tab.groups) {
      const item = group.items.find((entry) => entry.id === id);
      if (item) return item;
    }
  }
  return null;
}

/** Tabs that show a control — ids such as `bgImage` are reused on purpose. */
export function tabsForItem(id) {
  return RIBBON_TABS.filter((tab) =>
    tab.groups.some((group) => group.items.some((item) => item.id === id))
  ).map((tab) => tab.id);
}

