// Board cosmetics: zoom, theme, piece set, filters.
// Adapted from lichess-org/lila: ui/lib/src/chessgroundResize.ts,
//   ui/dasher/src/board.ts, ui/dasher/src/piece.ts

import { h, type VNode } from 'snabbdom';

// --- Board wheel navigation ---
const BOARD_WHEEL_NAV_KEY = 'boardWheelNavEnabled';
const BOARD_WHEEL_NAV_DEFAULT = false;
export let boardWheelNavEnabled: boolean = (() => {
  const stored = localStorage.getItem(BOARD_WHEEL_NAV_KEY);
  return stored === null ? BOARD_WHEEL_NAV_DEFAULT : stored === 'true';
})();

export function setBoardWheelNavEnabled(enabled: boolean): void {
  boardWheelNavEnabled = enabled;
  localStorage.setItem(BOARD_WHEEL_NAV_KEY, String(enabled));
}

const REVIEW_DOTS_USER_ONLY_KEY = 'reviewDotsUserOnly';
// Default ON — show annotations only for the user's moves.
// Stored as 'false' to opt out; absent key = true.
export let reviewDotsUserOnly: boolean = localStorage.getItem(REVIEW_DOTS_USER_ONLY_KEY) !== 'false';

export function setReviewDotsUserOnly(enabled: boolean): void {
  reviewDotsUserOnly = enabled;
  localStorage.setItem(REVIEW_DOTS_USER_ONLY_KEY, String(enabled));
}

// --- Board zoom ---
// zoom: 0–100, default 85. Stored in localStorage, applied to body as ---zoom.
// CSS formula: ---board-scale = (---zoom / 100) * 0.75 + 0.25 (same as Lichess).
const ZOOM_DEFAULT = 85;
const ZOOM_KEY = 'boardZoom';
export let boardZoom: number = (() => {
  const stored = localStorage.getItem(ZOOM_KEY);
  const n = stored !== null ? parseInt(stored, 10) : NaN;
  return !isNaN(n) && n >= 0 && n <= 100 ? n : ZOOM_DEFAULT;
})();

export function applyBoardZoom(zoom: number): void {
  document.body.style.setProperty('---zoom', String(zoom));
}

export function saveBoardZoom(zoom: number): void {
  boardZoom = zoom;
  localStorage.setItem(ZOOM_KEY, String(zoom));
}

// --- Board theme ---
// Adapted from lichess-org/lila: ui/dasher/src/board.ts applyBoardTheme()
const BOARD_THEME_KEY = 'boardTheme';
const BOARD_THEME_DEFAULT = 'green';
// Featured 2D themes — adapted from BOARD_UI_REFERENCE.md section 2.
export const BOARD_THEMES_FEATURED = [
  'brown', 'wood4', 'maple', 'horsey', 'blue', 'blue2', 'blue3',
  'green', 'marble', 'olive', 'grey', 'metal', 'newspaper', 'purple', 'purple-diag',
] as const;
export let boardTheme: string = localStorage.getItem(BOARD_THEME_KEY) ?? BOARD_THEME_DEFAULT;

export function applyBoardTheme(name: string): void {
  document.body.dataset.board = name;
  boardTheme = name;
  localStorage.setItem(BOARD_THEME_KEY, name);
}

// --- Piece set ---
// Adapted from lichess-org/lila: ui/dasher/src/piece.ts applyPieceSet()
// Sets 12 CSS custom properties (---white-pawn etc.) on <body> so SCSS rules
// in main.scss pick them up instead of the hardcoded chessground.cburnett.css data URIs.
const PIECE_SET_KEY = 'pieceSet';
const PIECE_SET_DEFAULT = 'staunty';
export const PIECE_SETS_FEATURED = [
  'cburnett', 'merida', 'alpha', 'companion', 'kosal', 'caliente',
  'rhosgfx', 'maestro', 'fresca', 'cardinal', 'gioco', 'staunty',
  'monarchy', 'dubrovny', 'mpchess', 'horsey', 'anarcandy',
] as const;
const PIECE_VARS: [string, string][] = [
  ['---white-pawn',   'wP'], ['---white-knight', 'wN'], ['---white-bishop', 'wB'],
  ['---white-rook',   'wR'], ['---white-queen',  'wQ'], ['---white-king',   'wK'],
  ['---black-pawn',   'bP'], ['---black-knight', 'bN'], ['---black-bishop', 'bB'],
  ['---black-rook',   'bR'], ['---black-queen',  'bQ'], ['---black-king',   'bK'],
];
// Sets with webp-only assets (no .svg files). Adapted from lichess-org/lila: ui/dasher/src/piece.ts pieceVarRules()
const PIECE_WEBP_SETS = new Set(['monarchy']);
export let pieceSet: string = localStorage.getItem(PIECE_SET_KEY) ?? PIECE_SET_DEFAULT;

export function applyPieceSet(name: string): void {
  const ext = PIECE_WEBP_SETS.has(name) ? 'webp' : 'svg';
  for (const [cssVar, file] of PIECE_VARS) {
    document.body.style.setProperty(cssVar, `url(/piece/${name}/${file}.${ext})`);
  }
  document.body.dataset.pieceSet = name;
  pieceSet = name;
  localStorage.setItem(PIECE_SET_KEY, name);
}

// --- Board filters ---
// Adapted from lichess-org/lila: ui/dasher/src/board.ts BoardCtrl.setVar / propSliders()
// CSS vars are applied to body and consumed by cg-board::before { filter: ... } in main.scss.
export const FILTER_DEFAULTS: Record<string, number> = {
  'board-brightness': 100,
  'board-contrast':   100,
  'board-hue':        0,
};
const FILTER_LS_PREFIX = 'boardFilter.';
export const boardFilters: Record<string, number> = {};
for (const [prop, def] of Object.entries(FILTER_DEFAULTS)) {
  const stored = localStorage.getItem(FILTER_LS_PREFIX + prop);
  boardFilters[prop] = stored !== null ? parseInt(stored, 10) : def;
}

export function clearBoardLocalData(): void {
  localStorage.removeItem(ZOOM_KEY);
  localStorage.removeItem(BOARD_THEME_KEY);
  localStorage.removeItem(PIECE_SET_KEY);
  localStorage.removeItem(BOARD_WHEEL_NAV_KEY);
  localStorage.removeItem(REVIEW_DOTS_USER_ONLY_KEY);
  for (const prop of Object.keys(FILTER_DEFAULTS)) {
    localStorage.removeItem(FILTER_LS_PREFIX + prop);
  }
}

export function filtersAtDefault(): boolean {
  return Object.entries(FILTER_DEFAULTS).every(([p, def]) => boardFilters[p] === def);
}

export function setFilter(prop: string, value: number): void {
  boardFilters[prop] = value;
  document.body.style.setProperty(`---${prop}`, value.toString());
  localStorage.setItem(FILTER_LS_PREFIX + prop, value.toString());
  document.body.classList.toggle('simple-board', filtersAtDefault());
}

export function resetFilters(): void {
  for (const [prop, def] of Object.entries(FILTER_DEFAULTS)) setFilter(prop, def);
}

// --- Board settings UI helpers ---
// Thumbnail URL for board theme picker tiles.
// Adapted from lichess-org/lila: ui/dasher/css/_board.scss tile background-image pattern.
const BOARD_THEME_EXT: Record<string, string> = {
  brown: 'png', horsey: 'jpg', blue: 'png', green: 'png', purple: 'png', 'purple-diag': 'png',
  wood4: 'jpg', maple: 'jpg', blue2: 'jpg', blue3: 'jpg', marble: 'jpg', olive: 'jpg', grey: 'jpg', metal: 'jpg',
  newspaper: 'svg',
};

export function boardThumbnailUrl(name: string): string {
  if (name === 'newspaper') return '/images/board/svg/newspaper.svg';
  return `/images/board/${name}.thumbnail.${BOARD_THEME_EXT[name]}`;
}

// Preview URL for piece set picker tiles — wN.webp preferred, falls back to .svg.
// Adapted from lichess-org/lila: ui/dasher/src/piece.ts pieceImage()
export function piecePreviewUrl(name: string): string {
  return PIECE_WEBP_SETS.has(name) ? `/piece/${name}/wN.webp` : `/piece/${name}/wN.svg`;
}

// --- Render functions ---

export function renderFilterSlider(
  prop: string, label: string, min: number, max: number, step: number,
  redraw: () => void,
  fmt?: (v: number) => string,
): VNode {
  const value = boardFilters[prop] ?? FILTER_DEFAULTS[prop] ?? min;
  return h('div.board-settings__slider-row', [
    h('label', label),
    h('input', {
      attrs: { type: 'range', min, max, step, value },
      on: {
        input: (e: Event) => {
          setFilter(prop, parseInt((e.target as HTMLInputElement).value, 10));
          redraw();
        },
      },
    }),
    h('span.board-settings__slider-val', fmt ? fmt(value) : `${value}%`),
  ]);
}

// Board settings panel — theme tiles, piece tiles, filter sliders.
// Adapted from lichess-org/lila: ui/dasher/src/board.ts + piece.ts render()
export function renderBoardSettings(redraw: () => void): VNode {
  return h('div.board-settings', [

    // Sliders
    renderFilterSlider('board-brightness', 'Brightness', 20, 140, 1, redraw),
    renderFilterSlider('board-contrast',   'Contrast',   40, 200, 2, redraw),
    renderFilterSlider('board-hue',        'Hue',         0, 100, 1, redraw, v => `±${Math.round(v * 3.6)}°`),
    filtersAtDefault() ? null : h('button.board-settings__reset', {
      on: { click: () => { resetFilters(); redraw(); } },
    }, 'Reset'),

    // Board theme tile grid
    h('div.board-settings__label', 'Board'),
    h('div.board-settings__theme-grid',
      BOARD_THEMES_FEATURED.map(name =>
        h('button.board-settings__theme-tile', {
          class: { active: boardTheme === name },
          attrs: { title: name },
          on: { click: () => { applyBoardTheme(name); redraw(); } },
        }, [
          h('span', { attrs: { style: `background-image: url(${boardThumbnailUrl(name)})` } }),
        ]),
      ),
    ),

    // Piece set tile grid
    h('div.board-settings__label', 'Pieces'),
    h('div.board-settings__piece-grid',
      PIECE_SETS_FEATURED.map(name =>
        h('button.board-settings__piece-tile', {
          class: { active: pieceSet === name },
          attrs: { title: name },
          on: { click: () => { applyPieceSet(name); redraw(); } },
        }, [
          h('piece', { attrs: { style: `background-image: url(${piecePreviewUrl(name)})` } }),
        ]),
      ),
    ),
  ]);
}

// --- Boot: apply persisted values immediately ---
applyBoardZoom(boardZoom);
applyBoardTheme(boardTheme);
applyPieceSet(pieceSet);
for (const [prop, value] of Object.entries(boardFilters)) {
  document.body.style.setProperty(`---${prop}`, value.toString());
}
document.body.classList.toggle('simple-board', filtersAtDefault());
