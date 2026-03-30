// Shared UI primitives — reusable vnode helpers for common Patzer UI patterns.
// Adapted from lichess-org/lila: ui/lib/src/view/cmn-toggle.ts (cmnToggleWrap pattern)

import { h, type VNode } from 'snabbdom';

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
): VNode {
  return h('label.settings-toggle-row', [
    h('span.settings-toggle-row__label', label),
    h('span.settings-toggle', [
      h(`input#stg-${id}`, {
        attrs: { type: 'checkbox', checked, ...(disabled ? { disabled: true } : {}) },
        on: { change: (e: Event) => onChange((e.target as HTMLInputElement).checked) },
      }),
      h('label', { attrs: { for: `stg-${id}` } }),
    ]),
  ]);
}
