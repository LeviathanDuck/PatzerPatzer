





















































































import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
import { controlExplainerAttrs } from '../ui/controlExplainer';

// ---------------------------------------------------------------------------------------------
// Ranges / defaults — design doc §2.1 (global scale) and §2.2 (per-pane row height), ported
// verbatim (same numbers NN itself uses, per the T5 study's own confirmed source read).
// ---------------------------------------------------------------------------------------------

const UI_SCALE_MIN = 75;
const UI_SCALE_MAX = 150;
const UI_SCALE_STEP = 5;
const UI_SCALE_DEFAULT = 100;

const ROW_HEIGHT_MIN = 20;
const ROW_HEIGHT_MAX = 28;
const ROW_HEIGHT_STEP = 1;
const ROW_HEIGHT_DEFAULT = 28;

const SCALE_TEXT_DEFAULT = true;

// Fixed pixel constants below the two levers (design doc §2.3) — the base sizes each pane's own
// text already renders at today (main.scss's current hardcoded `.nav-row`/`.sentry-title`
// font-size), so that 100% scale + 28px row height + scale-text-on reproduces the exact current
// look with zero regression.
const NAV_ITEM_BASE_FONT_SIZE_PX = 12.5;
const ITEM_TITLE_BASE_FONT_SIZE_PX = 12.5;

const UI_SCALE_KEY = 'patzer.studyNavUiScalePct';
const NAV_ROW_HEIGHT_KEY = 'patzer.studyNavRowHeightPx';
const NAV_SCALE_TEXT_KEY = 'patzer.studyNavRowHeightScaleText';
const ITEM_ROW_HEIGHT_KEY = 'patzer.studyItemRowHeightPx';
const ITEM_SCALE_TEXT_KEY = 'patzer.studyItemRowHeightScaleText';

function clampRangeInt(raw: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(raw) ? Math.min(max, Math.max(min, Math.round(raw))) : fallback;
}

function readBoolSetting(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === null ? defaultValue : stored === 'true';
}

// ---------------------------------------------------------------------------------------------
// Read-once-then-cache module state (graphSettings.ts / evalView.ts precedent) — per-device only,
// no synced-vs-local toggle (design doc §2.4 [DEFAULT]).
// ---------------------------------------------------------------------------------------------

let uiScalePct = clampRangeInt(
  Number.parseInt(localStorage.getItem(UI_SCALE_KEY) ?? '', 10),
  UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_DEFAULT,
);
let navRowHeightPx = clampRangeInt(
  Number.parseInt(localStorage.getItem(NAV_ROW_HEIGHT_KEY) ?? '', 10),
  ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_DEFAULT,
);
let navScaleTextWithHeight = readBoolSetting(NAV_SCALE_TEXT_KEY, SCALE_TEXT_DEFAULT);
let itemRowHeightPx = clampRangeInt(
  Number.parseInt(localStorage.getItem(ITEM_ROW_HEIGHT_KEY) ?? '', 10),
  ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_DEFAULT,
);
let itemScaleTextWithHeight = readBoolSetting(ITEM_SCALE_TEXT_KEY, SCALE_TEXT_DEFAULT);

export function getUiScalePct(): number { return uiScalePct; }
export function getNavRowHeightPx(): number { return navRowHeightPx; }
export function getNavScaleTextWithHeight(): boolean { return navScaleTextWithHeight; }
export function getItemRowHeightPx(): number { return itemRowHeightPx; }
export function getItemScaleTextWithHeight(): boolean { return itemScaleTextWithHeight; }

export function setUiScalePct(value: number): void {
  uiScalePct = clampRangeInt(value, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_DEFAULT);
  localStorage.setItem(UI_SCALE_KEY, String(uiScalePct));
  applyNavigatorSettings();
}

export function setNavRowHeightPx(value: number): void {
  navRowHeightPx = clampRangeInt(value, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_DEFAULT);
  localStorage.setItem(NAV_ROW_HEIGHT_KEY, String(navRowHeightPx));
  applyNavigatorSettings();
}

export function setNavScaleTextWithHeight(enabled: boolean): void {
  navScaleTextWithHeight = enabled;
  localStorage.setItem(NAV_SCALE_TEXT_KEY, String(enabled));
  applyNavigatorSettings();
}

export function setItemRowHeightPx(value: number): void {
  itemRowHeightPx = clampRangeInt(value, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_DEFAULT);
  localStorage.setItem(ITEM_ROW_HEIGHT_KEY, String(itemRowHeightPx));
  applyNavigatorSettings();
}

export function setItemScaleTextWithHeight(enabled: boolean): void {
  itemScaleTextWithHeight = enabled;
  localStorage.setItem(ITEM_SCALE_TEXT_KEY, String(enabled));
  applyNavigatorSettings();
}

// ---------------------------------------------------------------------------------------------
// Discrete font-size stepping (design doc §2.2: "discrete steps, not continuous interpolation").
// ---------------------------------------------------------------------------------------------

function steppedFontSizePx(basePx: number, rowHeightPx: number): number {
  if (rowHeightPx >= ROW_HEIGHT_MAX - 2) return basePx;       // 26-28px rows: full size
  if (rowHeightPx >= ROW_HEIGHT_MAX - 5) return basePx - 1;   // 23-25px rows: -1px
  return basePx - 2;                                          // 20-22px rows: -2px
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

// ---------------------------------------------------------------------------------------------
// APPLY — drives the CSS custom properties the panes read (with fallbacks matching today's
// hardcoded values, so defaults are visually a no-op). Set on `document.body`, mirroring
// `applyBoardZoom`'s established convention for a global, JS-driven visual setting; safe against
// Snabbdom because `document.body` sits outside the `#app` subtree Snabbdom patches.
// ---------------------------------------------------------------------------------------------

export function applyNavigatorSettings(): void {
  const scale = uiScalePct / 100;

  const navHeightPx = navRowHeightPx * scale;
  const navFontPx = (navScaleTextWithHeight
    ? steppedFontSizePx(NAV_ITEM_BASE_FONT_SIZE_PX, navRowHeightPx)
    : NAV_ITEM_BASE_FONT_SIZE_PX) * scale;

  const itemHeightPx = itemRowHeightPx * scale;
  const itemFontPx = (itemScaleTextWithHeight
    ? steppedFontSizePx(ITEM_TITLE_BASE_FONT_SIZE_PX, itemRowHeightPx)
    : ITEM_TITLE_BASE_FONT_SIZE_PX) * scale;

  const body = document.body.style;
  body.setProperty('--nav-item-height', `${round1(navHeightPx)}px`);
  body.setProperty('--nav-item-font-size', `${round1(navFontPx)}px`);
  body.setProperty('--item-list-row-height', `${round1(itemHeightPx)}px`);
  body.setProperty('--item-list-title-font-size', `${round1(itemFontPx)}px`);
}











function renderSliderRow(
  id: string,
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  fmt: (v: number) => string,
  onInput: (v: number) => void,
): VNode {
  return h('div.board-settings__slider-row', [
    h('label', { attrs: { for: id } }, label),
    h(`input#${id}`, {
      attrs: {
        type: 'range',
        min,
        max,
        step,
        value,
        'aria-label': label,
        ...controlExplainerAttrs({
          label,
          description: 'Adjusts this Study Navigator appearance setting.',
        }),
      },
      on: { input: (e: Event) => onInput(Number.parseInt((e.target as HTMLInputElement).value, 10)) },
    }),
    h('span.board-settings__slider-val', fmt(value)),
  ]);
}

export function renderNavigatorAppearanceSettings(redraw: () => void): VNode {
  return h('div.board-settings.nav-appearance-settings', [
    h('div.board-settings__label', 'Global scale'),
    renderSliderRow(
      'scaleRange', 'UI scale', uiScalePct, UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_STEP,
      v => `${v}%`,
      v => { setUiScalePct(v); redraw(); },
    ),

    h('div.board-settings__label', 'Navigation pane'),
    renderSliderRow(
      'navHeightRange', 'Item height', navRowHeightPx, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_STEP,
      v => `${v}px`,
      v => { setNavRowHeightPx(v); redraw(); },
    ),
    h('div.board-settings__toggle-row', renderToggleRow(
      'nav-scale-text', 'Scale text with item height', navScaleTextWithHeight,
      v => { setNavScaleTextWithHeight(v); redraw(); },
    )),

    h('div.board-settings__label', 'Item list'),
    renderSliderRow(
      'listHeightRange', 'Item height', itemRowHeightPx, ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_STEP,
      v => `${v}px`,
      v => { setItemRowHeightPx(v); redraw(); },
    ),
    h('div.board-settings__toggle-row', renderToggleRow(
      'item-scale-text', 'Scale text with item height', itemScaleTextWithHeight,
      v => { setItemScaleTextWithHeight(v); redraw(); },
    )),

    h('div.nav-appearance-settings__note',
      'These appearance settings sync with your Patzer account.'),
  ]);
}

export function resetNavigatorAppearancePreferences(): void {
  for (const key of [
    UI_SCALE_KEY,
    NAV_ROW_HEIGHT_KEY,
    NAV_SCALE_TEXT_KEY,
    ITEM_ROW_HEIGHT_KEY,
    ITEM_SCALE_TEXT_KEY,
  ]) localStorage.removeItem(key);
  uiScalePct = UI_SCALE_DEFAULT;
  navRowHeightPx = ROW_HEIGHT_DEFAULT;
  navScaleTextWithHeight = SCALE_TEXT_DEFAULT;
  itemRowHeightPx = ROW_HEIGHT_DEFAULT;
  itemScaleTextWithHeight = SCALE_TEXT_DEFAULT;
  applyNavigatorSettings();
}

export function reloadNavigatorAppearancePreferences(): void {
  uiScalePct = clampRangeInt(Number.parseInt(localStorage.getItem(UI_SCALE_KEY) ?? '', 10), UI_SCALE_MIN, UI_SCALE_MAX, UI_SCALE_DEFAULT);
  navRowHeightPx = clampRangeInt(Number.parseInt(localStorage.getItem(NAV_ROW_HEIGHT_KEY) ?? '', 10), ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_DEFAULT);
  navScaleTextWithHeight = readBoolSetting(NAV_SCALE_TEXT_KEY, SCALE_TEXT_DEFAULT);
  itemRowHeightPx = clampRangeInt(Number.parseInt(localStorage.getItem(ITEM_ROW_HEIGHT_KEY) ?? '', 10), ROW_HEIGHT_MIN, ROW_HEIGHT_MAX, ROW_HEIGHT_DEFAULT);
  itemScaleTextWithHeight = readBoolSetting(ITEM_SCALE_TEXT_KEY, SCALE_TEXT_DEFAULT);
  applyNavigatorSettings();
}
