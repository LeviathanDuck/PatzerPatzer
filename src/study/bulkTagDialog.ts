
























import { h, type VNode } from 'snabbdom';
import { navIcon } from './navIcons';
import { bulkAddTags, clearSelection } from './studyCtrl';

interface BulkTagDialogState {
  ids: readonly string[];
  inputValue: string;
}

let _dialog: BulkTagDialogState | null = null;
let _escapeListener: ((e: KeyboardEvent) => void) | null = null;

function detachEscapeListener(): void {
  if (_escapeListener) {
    document.removeEventListener('keydown', _escapeListener, true);
    _escapeListener = null;
  }
}

function closeBulkTagDialog(): void {
  _dialog = null;
  detachEscapeListener();
}

function attachEscapeListener(redraw: () => void): void {
  detachEscapeListener();
  _escapeListener = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeBulkTagDialog();
      redraw();
    }
  };
  document.addEventListener('keydown', _escapeListener, true);
}

/**
 * Opens the bulk Tag dialog for `ids` (the current selection, caller-supplied so this module never
 * reads selection state itself). No-op on an empty selection — mirrors `openMoveAliasDialog`.
 */
export function openBulkTagDialog(ids: readonly string[], redraw: () => void): void {
  if (ids.length === 0) return;
  _dialog = { ids, inputValue: '' };
  attachEscapeListener(redraw);
  redraw();
}

function setInputValue(value: string, redraw: () => void): void {
  if (!_dialog) return;
  _dialog = { ..._dialog, inputValue: value };
  redraw();
}

/** Splits the free-text input on commas, trims, and drops empty entries — v1 free text, no chip UI. */
function parseTags(inputValue: string): string[] {
  return inputValue
    .split(',')
    .map(t => t.trim())
    .filter(t => t.length > 0);
}

/**
 * Applies the parsed tag(s) to every selected study via `bulkAddTags`, then clears the selection
 * and closes — matches `moveAliasDialog.ts`'s own commit shape. Empty input is a no-op (also
 * enforced by the disabled Apply button below).
 */
async function commit(redraw: () => void): Promise<void> {
  if (!_dialog) return;
  const tags = parseTags(_dialog.inputValue);
  if (tags.length === 0) return;
  await bulkAddTags(tags);
  clearSelection();
  closeBulkTagDialog();
  redraw();
}

/**
 * Renders the currently-open dialog, or `null` when closed — itemListView.ts includes this once
 * per render pass (mirrors `renderMoveAliasDialog`'s no-op-when-closed contract).
 */
export function renderBulkTagDialog(redraw: () => void): VNode | null {
  if (!_dialog) return null;
  const { ids, inputValue } = _dialog;
  const count = ids.length;
  const canApply = parseTags(inputValue).length > 0;

  return h('div.sentry-move-dialog-overlay', {
    on: { click: () => { closeBulkTagDialog(); redraw(); } },
  }, [
    h('div.sentry-move-dialog', {
      on: { click: (e: Event) => e.stopPropagation() },
    }, [
      h('div.sentry-move-dialog__header', [
        h('h3', `Tag ${count} game${count === 1 ? '' : 's'}`),
        h('p', 'Adds the tag(s) below to every selected game. Existing tags are kept.'),
      ]),
      h('div.sentry-tag-dialog__body', [
        h('input.sentry-tag-dialog__input', {
          attrs: { type: 'text', placeholder: 'Tag name(s), comma-separated…', value: inputValue },
          hook: { insert: vn => (vn.elm as HTMLInputElement).focus() },
          on: {
            input: (e: Event) => setInputValue((e.target as HTMLInputElement).value, redraw),
            keydown: (e: KeyboardEvent) => {
              if (e.key === 'Enter' && canApply) void commit(redraw);
            },
          },
        }),
      ]),
      h('div.sentry-move-dialog__footer', [
        h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--ghost', {
          attrs: { type: 'button' },
          on: { click: () => { closeBulkTagDialog(); redraw(); } },
        }, 'Cancel'),
        h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--primary', {
          attrs: { type: 'button', disabled: !canApply },
          on: { click: () => { void commit(redraw); } },
        }, [navIcon('tag', { size: 13 }), h('span', 'Apply')]),
      ]),
    ]),
  ]);
}
