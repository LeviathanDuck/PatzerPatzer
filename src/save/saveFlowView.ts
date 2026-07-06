











import { h, type VNode } from 'snabbdom';
import type SaveFlowCtrl from './saveFlowCtrl';
import {
  SAVE_FLOW_COPY,
  SAVE_FLOW_GAME_DESTINATIONS,
  SAVE_FLOW_PUZZLE_CATEGORIES,
  type SaveFlowGameDestination,
} from './saveFlowCtrl';

function renderHead(ctrl: SaveFlowCtrl): VNode {
  const copy = SAVE_FLOW_COPY[ctrl.itemType];
  const ctx = ctrl.context;
  return h('div.save-flow-modal__head', [
    h('h2.save-flow-modal__title', copy.title),
    h('div.save-flow-modal__ctx-line', ctx.line),
    ctx.source ? h('div.save-flow-modal__ctx-src', ctx.source) : null,
  ]);
}

function renderPuzzleFields(ctrl: SaveFlowCtrl): VNode[] {
  return [
    h('div.save-flow-modal__field-label', [
      'Category ',
      h('span.save-flow-modal__req', 'required — pick one'),
    ]),
    h('div.save-flow-modal__cat-grid', SAVE_FLOW_PUZZLE_CATEGORIES.map(category => (
      h('button.save-flow-modal__cat-tile', {
        key: category,
        class: { 'save-flow-modal__cat-tile--picked': ctrl.primaryCategory === category },
        attrs: { type: 'button' },
        on: { click: () => ctrl.pickPrimaryCategory(category) },
      }, category)
    ))),
    h('div.save-flow-modal__field-label', [
      'Tags ',
      h('span.save-flow-modal__hint', '— optional'),
    ]),
    h('input.save-flow-modal__tags-line', {
      attrs: { type: 'text', placeholder: 'knight-fork, najdorf' },
      props: { value: ctrl.tagsInput },
      on: { input: (e: Event) => ctrl.setTagsInput((e.target as HTMLInputElement).value) },
    }),
    h('div.save-flow-modal__field-label', [
      'Notes ',
      h('span.save-flow-modal__hint', '— optional'),
    ]),
    h('textarea.save-flow-modal__notes-field', {
      attrs: { placeholder: 'Why this position is worth practicing…' },
      props: { value: ctrl.notesInput },
      on: { input: (e: Event) => ctrl.setNotesInput((e.target as HTMLTextAreaElement).value) },
    }),
  ];
}

function renderGameFields(ctrl: SaveFlowCtrl): VNode[] {
  return [
    h('div.save-flow-modal__field-label', [
      'Study destination ',
      h('span.save-flow-modal__req', 'required'),
    ]),
    h('select.save-flow-modal__select-line', {
      props: { value: ctrl.destination ?? '' },
      on: {
        change: (e: Event) => {
          const value = (e.target as HTMLSelectElement).value as SaveFlowGameDestination;
          ctrl.pickDestination(value);
        },
      },
    }, [
      h('option', { attrs: { value: '', disabled: true } }, 'Choose a destination…'),
      ...SAVE_FLOW_GAME_DESTINATIONS.map(destination => (
        h('option', { key: destination, attrs: { value: destination } }, destination)
      )),
    ]),
    h('div.save-flow-modal__field-label', [
      'Purpose ',
      h('span.save-flow-modal__hint', '— optional'),
    ]),
    h('input.save-flow-modal__text-line', {
      attrs: { type: 'text', placeholder: 'e.g. "opponent prep", "instructive loss"…' },
      props: { value: ctrl.purposeInput },
      on: { input: (e: Event) => ctrl.setPurposeInput((e.target as HTMLInputElement).value) },
    }),
    h('div.save-flow-modal__field-label', [
      'Notes ',
      h('span.save-flow-modal__hint', '— optional'),
    ]),
    h('textarea.save-flow-modal__notes-field', {
      attrs: { placeholder: 'Why this game is worth keeping…' },
      props: { value: ctrl.notesInput },
      on: { input: (e: Event) => ctrl.setNotesInput((e.target as HTMLTextAreaElement).value) },
    }),
  ];
}

function renderFoot(ctrl: SaveFlowCtrl): VNode {
  const copy = SAVE_FLOW_COPY[ctrl.itemType];
  return h('div.save-flow-modal__foot', [
    h('button.save-flow-modal__quick-save', {
      attrs: { type: 'button' },
      on: { click: () => ctrl.quickSave() },
    }, copy.quickSaveLabel),
    h('button.save-flow-modal__save', {
      attrs: { type: 'button', disabled: !ctrl.canSave() },
      on: { click: () => ctrl.confirmSave() },
    }, 'Save'),
  ]);
}

export default function renderSaveFlowModal(ctrl: SaveFlowCtrl): VNode {
  const fields = ctrl.itemType === 'puzzle' ? renderPuzzleFields(ctrl) : renderGameFields(ctrl);
  return h('div.save-flow-modal', [
    h('div.save-flow-modal__backdrop', {
      on: { click: () => ctrl.cancel() },
    }),
    h('div.save-flow-modal__card', {
      on: { click: (e: Event) => e.stopPropagation() },
    }, [
      renderHead(ctrl),
      h('div.save-flow-modal__body', fields),
      renderFoot(ctrl),
    ]),
  ]);
}
