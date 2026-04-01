// Adapted from lichess-org/lila: ui/lobby/src/view/setup/components/levelButtons.ts
// Lichess uses radio inputs (1-8); we use button rows to match the existing openings panel style.

import { h, type VNode } from 'snabbdom';
import { STRENGTH_LEVELS } from './types';

/**
 * Render a row of 8 level buttons with a description strip below.
 * Active level gets the `.active` CSS class.
 * onChange is called with the new level number (1-8) on click.
 */
export function renderStrengthSelector(
  currentLevel: number,
  onChange: (level: number) => void,
): VNode {
  const active = STRENGTH_LEVELS.find(s => s.level === currentLevel) ?? STRENGTH_LEVELS[3]!;

  return h('div.strength-selector', [
    h(
      'div.strength-selector__buttons',
      STRENGTH_LEVELS.map(s =>
        h(
          'button.strength-selector__btn',
          {
            class: { active: s.level === currentLevel },
            attrs: { type: 'button', title: `${s.label} (~${s.uciElo} Elo)` },
            on: { click: () => onChange(s.level) },
          },
          [
            h('span.strength-selector__num', String(s.level)),
            h('span.strength-selector__lbl', s.label),
          ],
        ),
      ),
    ),
    h('div.strength-selector__info', [
      h('span.strength-selector__desc', `${active.label} — ${active.description} (~${active.uciElo} Elo)`),
    ]),
  ]);
}
