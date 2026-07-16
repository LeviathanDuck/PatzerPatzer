








import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
import { controlExplainerAttrs } from '../ui/controlExplainer';

export type EvalGraphTheme = 'mountain' | 'ember' | 'glass';

const THEME_KEY        = 'patzer.evalGraphTheme';
const TOOLTIP_KEY      = 'patzer.evalGraphTooltip';
const GUIDES_KEY       = 'patzer.evalGraphGuides';
const RING_MARKER_KEY  = 'patzer.evalGraphRingMarker';

const THEME_DEFAULT: EvalGraphTheme = 'mountain';

function isEvalGraphTheme(value: string | null): value is EvalGraphTheme {
  return value === 'mountain' || value === 'ember' || value === 'glass';
}

function readBoolSetting(key: string, defaultValue: boolean): boolean {
  const stored = localStorage.getItem(key);
  return stored === null ? defaultValue : stored === 'true';
}

let evalGraphTheme: EvalGraphTheme = (() => {
  const stored = localStorage.getItem(THEME_KEY);
  return isEvalGraphTheme(stored) ? stored : THEME_DEFAULT;
})();

let evalGraphTooltip    = readBoolSetting(TOOLTIP_KEY, true);
let evalGraphGuides     = readBoolSetting(GUIDES_KEY, true);
let evalGraphRingMarker = readBoolSetting(RING_MARKER_KEY, true);

export function getEvalGraphTheme(): EvalGraphTheme {
  return evalGraphTheme;
}

export function setEvalGraphTheme(theme: EvalGraphTheme): void {
  evalGraphTheme = theme;
  localStorage.setItem(THEME_KEY, theme);
}

export function getEvalGraphTooltip(): boolean {
  return evalGraphTooltip;
}

export function setEvalGraphTooltip(enabled: boolean): void {
  evalGraphTooltip = enabled;
  localStorage.setItem(TOOLTIP_KEY, String(enabled));
}

export function getEvalGraphGuides(): boolean {
  return evalGraphGuides;
}

export function setEvalGraphGuides(enabled: boolean): void {
  evalGraphGuides = enabled;
  localStorage.setItem(GUIDES_KEY, String(enabled));
}

export function getEvalGraphRingMarker(): boolean {
  return evalGraphRingMarker;
}

export function setEvalGraphRingMarker(enabled: boolean): void {
  evalGraphRingMarker = enabled;
  localStorage.setItem(RING_MARKER_KEY, String(enabled));
}

const THEME_CHOICES: { key: EvalGraphTheme; label: string }[] = [
  { key: 'mountain', label: 'Mountain' },
  { key: 'ember',    label: 'Ember' },
  { key: 'glass',    label: 'Glass' },
];

// Settings-menu panel for the eval graph — mounted by header/index.ts below "Board Settings".
// Reuses the `board-settings__*` segmented-control/label classnames from
// `src/board/cosmetics.ts` renderBoardSettings() so it matches that panel visually; the
// `eval-graph-settings` wrapper class carries anything specific to this panel (3-option segmented
// control instead of the 4-column board-settings default, toggle-row spacing).
export function renderEvalGraphSettings(redraw: () => void): VNode {
  return h('div.board-settings.eval-graph-settings', [
    h('div.board-settings__label', 'Theme'),
    h('div.board-settings__segmented-row', [
      h('div.board-settings__segmented-control',
        THEME_CHOICES.map(choice =>
          h('button.board-settings__segmented-option', {
            class: { active: evalGraphTheme === choice.key },
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: `${choice.label} graph theme`,
              description: 'Change the visual style of the evaluation graph.',
            }) },
            on: { click: () => { setEvalGraphTheme(choice.key); redraw(); } },
          }, choice.label),
        ),
      ),
    ]),

    h('div.board-settings__label', 'Detail'),
    h('div.eval-graph-settings__toggle-row',
      renderToggleRow('eval-graph-tooltip', 'Hover tooltip', evalGraphTooltip, (v) => { setEvalGraphTooltip(v); redraw(); }),
    ),
    h('div.eval-graph-settings__toggle-row',
      renderToggleRow('eval-graph-guides', 'Guide lines', evalGraphGuides, (v) => { setEvalGraphGuides(v); redraw(); }),
    ),
    h('div.eval-graph-settings__toggle-row',
      renderToggleRow('eval-graph-ring-marker', 'Ring move marker', evalGraphRingMarker, (v) => { setEvalGraphRingMarker(v); redraw(); }),
    ),
  ]);
}

/** Invoked from the same data-management reset path as
 *  `resetAnalysisViewSettingsRuntimeForDataManagement` (evalView.ts calls this internally so the
 *  existing 'engine-review' reset case in main.ts picks it up with no caller-side change). */
export function resetEvalGraphSettingsRuntimeForDataManagement(): void {
  evalGraphTheme       = THEME_DEFAULT;
  evalGraphTooltip     = true;
  evalGraphGuides      = true;
  evalGraphRingMarker  = true;
}
