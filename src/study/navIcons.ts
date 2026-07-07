











// @license lucide-static v0.525.0 - ISC (https://github.com/lucide-icons/lucide) — the upstream
// per-file `<!-- @license lucide-static v0.525.0 - ISC -->` header is preserved here ONCE for the











import { h, type VNode } from 'snabbdom';

// ---------------------------------------------------------------------------------------------
// Element-tree representation — just enough shape to cover every element type the vendored set
// actually uses (`<path>`, `<circle>`, `<rect>`, `<line>`); no `<polyline>`/`<polygon>` appear in
// this vendored set, so those tags are intentionally not modeled.
// ---------------------------------------------------------------------------------------------

type IconElementTag = 'path' | 'circle' | 'rect' | 'line';

interface IconElement {
  tag: IconElementTag;
  attrs: Record<string, string | number>;
}

type IconDef = readonly IconElement[];

function p(d: string): IconElement {
  return { tag: 'path', attrs: { d } };
}

function c(cx: number | string, cy: number | string, r: number | string, fill?: string): IconElement {
  return { tag: 'circle', attrs: fill !== undefined ? { cx, cy, r, fill } : { cx, cy, r } };
}

function rct(width: number, height: number, x: number, y: number, rx?: number, ry?: number): IconElement {
  const attrs: Record<string, number> = { width, height, x, y };
  if (rx !== undefined) attrs.rx = rx;
  if (ry !== undefined) attrs.ry = ry;
  return { tag: 'rect', attrs };
}

function ln(x1: number, y1: number, x2: number, y2: number): IconElement {
  return { tag: 'line', attrs: { x1, y1, x2, y2 } };
}






const ICONS = {
  'align-left': [p('M15 12H3'), p('M17 18H3'), p('M21 6H3')],
  'arrow-down-wide-narrow': [p('m3 16 4 4 4-4'), p('M7 20V4'), p('M11 4h10'), p('M11 8h7'), p('M11 12h4')],
  'arrow-up-down': [p('m21 16-4 4-4-4'), p('M17 20V4'), p('m3 8 4-4 4 4'), p('M7 4v16')],
  'arrow-up-narrow-wide': [p('m3 8 4-4 4 4'), p('M7 4v16'), p('M11 12h4'), p('M11 16h7'), p('M11 20h10')],
  'book-open': [
    p('M12 7v14'),
    p('M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z'),
  ],
  brush: [
    p('m11 10 3 3'),
    p('M6.5 21A3.5 3.5 0 1 0 3 17.5a2.62 2.62 0 0 1-.708 1.792A1 1 0 0 0 3 21z'),
    p('M9.969 17.031 21.378 5.624a1 1 0 0 0-3.002-3.002L6.967 14.031'),
  ],
  'calendar-clock': [
    p('M16 14v2.2l1.6 1'),
    p('M16 2v4'),
    p('M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5'),
    p('M3 10h5'),
    p('M8 2v4'),
    c(16, 16, 6),
  ],
  'calendar-plus': [
    p('M16 19h6'),
    p('M16 2v4'),
    p('M19 16v6'),
    p('M21 12.598V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8.5'),
    p('M3 10h18'),
    p('M8 2v4'),
  ],
  'chevron-down': [p('m6 9 6 6 6-6')],
  'chevron-left': [p('m15 18-6-6 6-6')],
  'chevron-right': [p('m9 18 6-6-6-6')],
  'chevrons-down-up': [p('m7 20 5-5 5 5'), p('m7 4 5 5 5-5')],
  'chevrons-up-down': [p('m7 15 5 5 5-5'), p('m7 9 5-5 5 5')],
  'clipboard-check': [
    rct(8, 4, 8, 2, 1, 1),
    p('M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'),
    p('m9 14 2 2 4-4'),
  ],
  copy: [rct(14, 14, 8, 8, 2, 2), p('M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2')],







  'corner-down-right': [p('M6 4v7a4 4 0 0 0 4 4h6'), p('m12 11 4 4-4 4')],
  equal: [ln(5, 9, 19, 9), ln(5, 15, 19, 15)],
  eraser: [
    p('M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21'),
    p('m5.082 11.09 8.828 8.828'),
  ],
  'external-link': [p('M15 3h6v6'), p('M10 14 21 3'), p('M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6')],
  'eye-off': [
    p('M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49'),
    p('M14.084 14.158a3 3 0 0 1-4.242-4.242'),
    p('M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143'),
    p('m2 2 20 20'),
  ],
  eye: [p('M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0'), c(12, 12, 3)],
  'file-plus': [
    p('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'),
    p('M14 2v4a2 2 0 0 0 2 2h4'),
    p('M9 15h6'),
    p('M12 18v-6'),
  ],
  'file-text': [
    p('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z'),
    p('M14 2v4a2 2 0 0 0 2 2h4'),
    p('M10 9H8'),
    p('M16 13H8'),
    p('M16 17H8'),
  ],
  'folder-closed': [
    p('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'),
    p('M2 10h20'),
  ],
  'folder-input': [
    p('M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1'),
    p('M2 13h10'),
    p('m9 16 3-3-3-3'),
  ],
  'folder-open': [
    p('m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2'),
  ],
  'folder-plus': [
    p('M12 10v6'),
    p('M9 13h6'),
    p('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'),
  ],
  'folder-search': [
    p('M10.7 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4.1'),
    p('m21 21-1.9-1.9'),
    c(17, 17, 3),
  ],





  folder: [p('M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z')],
  'git-branch': [ln(6, 3, 6, 15), c(18, 6, 3), c(6, 18, 3), p('M18 9a9 9 0 0 1-9 9')],
  hammer: [
    p('m15 12-8.373 8.373a1 1 0 1 1-3-3L12 9'),
    p('m18 15 4-4'),
    p('m21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172V7l-2.26-2.26a6 6 0 0 0-4.202-1.756L9 2.96l.92.82A6.18 6.18 0 0 1 12 8.4V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5'),
  ],
  'hard-drive': [
    ln(22, 12, 2, 12),
    p('M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'),
    ln(6, 16, 6.01, 16),
    ln(10, 16, 10.01, 16),
  ],
  heading: [p('M6 12h12'), p('M6 20V4'), p('M18 20V4')],
  history: [p('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), p('M3 3v5h5'), p('M12 7v5l4 2')],
  'image-off': [
    ln(2, 2, 22, 22),
    p('M10.41 10.41a2 2 0 1 1-2.83-2.83'),
    ln(13.5, 13.5, 6, 21),
    ln(18, 12, 21, 15),
    p('M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59'),
    p('M21 15V5a2 2 0 0 0-2-2H9'),
  ],
  image: [rct(18, 18, 3, 3, 2, 2), c(9, 9, 2), p('m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21')],
  layers: [
    p('M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z'),
    p('M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12'),
    p('M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17'),
  ],
  library: [p('m16 6 4 14'), p('M12 6v14'), p('M8 8v12'), p('M4 4v16')],
  link: [p('M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71'), p('M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71')],
  'list-ordered': [
    p('M10 12h11'),
    p('M10 18h11'),
    p('M10 6h11'),
    p('M4 10h2'),
    p('M4 6h1v4'),
    p('M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'),
  ],
  'list-tree': [p('M21 12h-8'), p('M21 6H8'), p('M21 18h-8'), p('M3 6v4c0 1.1.9 2 2 2h3'), p('M3 10v6c0 1.1.9 2 2 2h3')],
  minus: [p('M5 12h14')],
  'paint-bucket': [
    p('m19 11-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11Z'),
    p('m5 2 5 5'),
    p('M2 13h15'),
    p('M22 20a2 2 0 1 1-4 0c0-1.6 1.7-2.4 2-4 .3 1.6 2 2.4 2 4Z'),
  ],
  palette: [
    p('M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8z'),
    c(13.5, 6.5, '.5', 'currentColor'),
    c(17.5, 10.5, '.5', 'currentColor'),
    c(6.5, 12.5, '.5', 'currentColor'),
    c(8.5, 7.5, '.5', 'currentColor'),
  ],
  'panel-left-close': [rct(18, 18, 3, 3, 2), p('M9 3v18'), p('m16 15-3-3 3-3')],
  'panel-left': [rct(18, 18, 3, 3, 2), p('M9 3v18')],
  pencil: [
    p('M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'),
    p('m15 5 4 4'),
  ],
  'pin-off': [
    p('M12 17v5'),
    p('M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89'),
    p('m2 2 20 20'),
    p('M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11'),
  ],
  pin: [p('M12 17v5'), p('M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z')],
  repeat: [p('m17 2 4 4-4 4'), p('M3 11v-1a4 4 0 0 1 4-4h14'), p('m7 22-4-4 4-4'), p('M21 13v1a4 4 0 0 1-4 4H3')],
  search: [p('m21 21-4.34-4.34'), c(11, 11, 8)],
  'separator-horizontal': [p('m16 16-4 4-4-4'), p('M3 12h18'), p('m8 8 4-4 4 4')],
  'separator-vertical': [p('M12 3v18'), p('m16 16 4-4-4-4'), p('m8 8-4 4 4 4')],
  settings: [
    p('M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z'),
    c(12, 12, 3),
  ],
  'shield-check': [
    p('M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'),
    p('m9 12 2 2 4-4'),
  ],
  'sliders-horizontal': [
    ln(21, 4, 14, 4),
    ln(10, 4, 3, 4),
    ln(21, 12, 12, 12),
    ln(8, 12, 3, 12),
    ln(21, 20, 16, 20),
    ln(12, 20, 3, 20),
    ln(14, 2, 14, 6),
    ln(8, 10, 8, 14),
    ln(16, 18, 16, 22),
  ],
  'square-pen': [
    p('M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7'),
    p('M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z'),
  ],
  'star-off': [
    p('M8.34 8.34 2 9.27l5 4.87L5.82 21 12 17.77 18.18 21l-.59-3.43'),
    p('M18.42 12.76 22 9.27l-6.91-1L12 2l-1.44 2.91'),
    ln(2, 2, 22, 22),
  ],
  star: [p('M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z')],
  tag: [
    p('M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z'),
    c(7.5, 7.5, '.5', 'currentColor'),
  ],
  tags: [
    p('m15 5 6.3 6.3a2.4 2.4 0 0 1 0 3.4L17 19'),
    p('M9.586 5.586A2 2 0 0 0 8.172 5H3a1 1 0 0 0-1 1v5.172a2 2 0 0 0 .586 1.414L8.29 18.29a2.426 2.426 0 0 0 3.42 0l3.58-3.58a2.426 2.426 0 0 0 0-3.42z'),
    c(6.5, 9.5, '.5', 'currentColor'),
  ],
  'trash-2': [
    p('M3 6h18'),
    p('M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'),
    p('M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'),
    ln(10, 11, 10, 17),
    ln(14, 11, 14, 17),
  ],
  trash: [p('M3 6h18'), p('M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6'), p('M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2')],
  type: [p('M12 4v16'), p('M4 7V5a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v2'), p('M9 20h6')],
  x: [p('M18 6 6 18'), p('m6 6 12 12')],
} as const satisfies Record<string, IconDef>;

export type NavIconName = keyof typeof ICONS;






const ALIASES = {
  'pen-box': 'square-pen',
  'sort-asc': 'arrow-up-narrow-wide',
  'sort-desc': 'arrow-down-wide-narrow',
} as const satisfies Record<string, NavIconName>;

export type NavIconNameOrAlias = NavIconName | keyof typeof ALIASES;

export interface NavIconOptions {
  /** Rendered width/height in px (viewBox stays the source 0 0 24 24). Defaults to 18, matching
   * the rail's pre-existing hand-authored icon size (src/study/navigatorShellView.ts). */
  size?: number;
  /** Extra class appended after the base `nav-icon` class, for per-call-site sizing/spacing hooks. */
  className?: string;






  toggleClass?: Record<string, boolean>;
}

function resolveIconName(name: NavIconNameOrAlias): NavIconName {
  if (name in ALIASES) return ALIASES[name as keyof typeof ALIASES];
  return name as NavIconName;
}

function iconElementToVNode(el: IconElement): VNode {
  return h(el.tag, { attrs: el.attrs });
}

/**
 * Build one Lucide glyph as a Snabbdom `<svg>` vnode. Stroke-based 24x24 viewBox, `currentColor`
 * stroke (so callers color it via CSS the same way every other icon in this app is colored) — the
 * one deliberate override vs. the raw vendored files is dropping their fixed `width="24"
 * height="24"`/`class="lucide lucide-<name>"` attributes in favor of a caller-supplied size and
 * this module's own `nav-icon` class; the `viewBox`/`stroke`/`stroke-width`/linecap/linejoin
 * attributes and every child element's geometry are unchanged from source.
 */
export function navIcon(name: NavIconNameOrAlias, opts: NavIconOptions = {}): VNode {
  const def = ICONS[resolveIconName(name)];
  const size = opts.size ?? 18;
  const selector = opts.className ? `svg.nav-icon.${opts.className}` : 'svg.nav-icon';
  return h(
    selector,
    {
      attrs: {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        fill: 'none',
        stroke: 'currentColor',
        'stroke-width': 2,
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      },
      ...(opts.toggleClass ? { class: opts.toggleClass } : {}),
    },
    def.map(iconElementToVNode),
  );
}
