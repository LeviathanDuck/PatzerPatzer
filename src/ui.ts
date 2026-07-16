// Shared UI primitives — reusable vnode helpers for common Patzer UI patterns.
// Adapted from lichess-org/lila: ui/lib/src/view/cmn-toggle.ts (cmnToggleWrap pattern)

import { h, type VNode } from 'snabbdom';
import {
  controlExplainerAttrs,
  renderDisabledControlExplainer,
  type ControlExplainer,
} from './ui/controlExplainer';

const TOGGLE_DISABLED_FALLBACK = 'This setting is unavailable until its prerequisite is met.';

/**
 * Settings toggle row: label text on left, CSS-driven pill toggle on right.
 * Uses a hidden checkbox + label so the visual state is driven by CSS
 * (input:checked + label) — no JS class toggling required.
 * Mirrors lichess-org/lila: ui/lib/src/view/cmn-toggle.ts cmnToggleWrap
 */
export function renderToggleRow(
  id: string,
  label: string,
  checked: boolean,
  onChange: (v: boolean) => void,
  disabled?: boolean,
  disabledReason?: string,
): VNode {
  const isDisabled = disabled === true;
  const explainer: ControlExplainer = {
    label,
    description: isDisabled
      ? disabledReason?.trim() || TOGGLE_DISABLED_FALLBACK
      : `${checked ? 'Turn off' : 'Turn on'} ${label}.`,
  };
  const row = h(
    'label.settings-toggle-row',
    { attrs: isDisabled ? {} : controlExplainerAttrs(explainer) },
    [
      h('span.settings-toggle-row__label', label),
      h('span.settings-toggle', [
        h(`input#stg-${id}`, {
          attrs: { type: 'checkbox', ...controlExplainerAttrs(explainer) },
          props: { checked, disabled: isDisabled },
          on: { change: (e: Event) => onChange((e.target as HTMLInputElement).checked) },
        }),
        h('span.settings-toggle__track', { attrs: { 'aria-hidden': 'true' } }),
      ]),
    ],
  );
  return isDisabled ? renderDisabledControlExplainer(explainer, row) : row;
}
