










import { h, type VNode } from 'snabbdom';
import { STRENGTH_LEVELS } from './types';
import { controlExplainerAttrs, renderDisabledControlExplainer } from '../ui/controlExplainer';

/** One genuinely shipped engine build. Do not list builds that are not actually served. */
export interface EngineModelOption {
  id: string;
  name: string;
}

/**
 * Inventory of engine builds Patzer actually ships (public/stockfish-web/ —
 * sf_18_smallnet.js + sf_18_smallnet.wasm + nn-4ca89e4b3abf.nnue). Only one build exists
 * today; the selector below renders it as the single, honestly-labeled entry rather than
 * fabricating alternatives (mirrors lila's `select#select-engine`, ui/lib/src/ceval/view/settings.ts).
 */
export const ENGINE_MODELS: EngineModelOption[] = [
  { id: 'sf18-smallnet', name: 'Stockfish 18 (smallnet, NNUE)' },
];

const ENGINE_MODEL_STORAGE_KEY = 'patzer.engineModel';

/** Currently selected engine model id, defaulting to the sole shipped build. */
export function getEngineModel(): string {
  const stored = localStorage.getItem(ENGINE_MODEL_STORAGE_KEY);
  return ENGINE_MODELS.some(m => m.id === stored) ? stored! : ENGINE_MODELS[0]!.id;
}

/** Persists the selected engine model id (no-op for an id that isn't a known build). */
export function setEngineModel(id: string): void {
  if (!ENGINE_MODELS.some(m => m.id === id)) return;
  localStorage.setItem(ENGINE_MODEL_STORAGE_KEY, id);
}

/**
 * Render lila's AI-level row (bare numbers 1-8, hidden-radio + label pattern) plus an
 * engine-model selector. Replaces the earlier Patzer tier-card presentation for the
 * practice strength sub-panel (renderStrengthSelector usage in analysisControls.ts).
 * onChange is called with the new level number (1-8) on click.
 */
export function renderStrengthSelector(
  currentLevel: number,
  onChange: (level: number) => void,
): VNode {
  const currentModel = getEngineModel();

  return h('div.strength-selector', [
    h('div.strength-selector__section-label', 'Strength'),
    h(
      'div.strength-selector__levels',
      STRENGTH_LEVELS.map(s =>
        h('div.strength-selector__item', [
          h(`input#strength-level-${s.level}`, {
            attrs: {
              type: 'radio',
              name: 'strength-level',
              value: s.level,
              checked: s.level === currentLevel,
              ...controlExplainerAttrs({ label: `Engine strength ${s.level}`, description: `Set the computer opponent to strength level ${s.level}.` }),
            },
            on: { change: () => onChange(s.level) },
          }),
          h('label', { attrs: { for: `strength-level-${s.level}` } }, String(s.level)),
        ]),
      ),
    ),
    h('div.strength-selector__section-label', 'Engine'),
    (() => {
      const disabled = ENGINE_MODELS.length <= 1;
      const explainer = { label: 'Engine build', description: disabled ? 'Only one engine build is currently installed.' : 'Choose the engine build used by the computer opponent.' };
      const control = h('select.strength-selector__engine', {
        attrs: { id: 'strength-engine-model', name: 'strength-engine-model', disabled, ...controlExplainerAttrs(explainer) },
        on: {
          change: (e: Event) => setEngineModel((e.target as HTMLSelectElement).value),
        },
      }, ENGINE_MODELS.map(m =>
        h('option', { attrs: { value: m.id, selected: m.id === currentModel } }, m.name),
      ));
      return disabled ? renderDisabledControlExplainer(explainer, control) : control;
    })(),
  ]);
}
