
































import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs, renderDisabledControlExplainer } from '../ui/controlExplainer';
import { navIcon } from './navIcons';
import { addAliasToFolder, clearSelection, folders, moveGameToFolder } from './studyCtrl';

type MoveAliasMode = 'move' | 'alias';

interface MoveAliasDialogState {
  ids: readonly string[];
  /** The item-list's current folder context at open time (itemListView.ts's `currentFolderId`) —
   * null when the selection was made while browsing a section/lens rather than a specific folder.
   * Passed through unchanged to `moveGameToFolder` as its `sourceFolderId` (Move mode only). */
  sourceFolderId: string | null;
  mode: MoveAliasMode;
  targetFolderId: string | null;
}

let _dialog: MoveAliasDialogState | null = null;
let _escapeListener: ((e: KeyboardEvent) => void) | null = null;




let _dialogOpener: HTMLElement | null = null;

function detachEscapeListener(): void {
  if (_escapeListener) {
    document.removeEventListener('keydown', _escapeListener, true);
    _escapeListener = null;
  }
}

function closeMoveAliasDialog(): void {
  _dialog = null;
  detachEscapeListener();
}

function attachEscapeListener(redraw: () => void): void {
  detachEscapeListener();
  _escapeListener = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {














      e.stopPropagation();
      closeMoveAliasDialog();
      redraw();
    }
  };
  document.addEventListener('keydown', _escapeListener, true);
}

/**
 * Opens the bulk Move / Add-alias dialog for `ids` (the current selection, caller-supplied so this
 * module never reads selection state itself) scoped against `sourceFolderId`. Mode always starts on
 * **Move** — the owner-locked default (OD-7 REVISED: "a labeled toggle/segmented control... not a
 * hidden modifier" — Move is the plain, unmarked choice; aliasing is only ever an explicit switch).
 * No-op on an empty selection.
 */
export function openMoveAliasDialog(
  ids: readonly string[],
  sourceFolderId: string | null,
  redraw: () => void,
): void {
  if (ids.length === 0) return;
  // `typeof HTMLElement` is load-bearing, not belt-and-braces: under bare node (the focused test
  // harnesses import this module directly) `HTMLElement` is UNDECLARED, so a bare `instanceof`
  // throws ReferenceError rather than evaluating false.
  _dialogOpener = typeof document !== 'undefined' && typeof HTMLElement !== 'undefined'
    && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  _dialog = { ids, sourceFolderId, mode: 'move', targetFolderId: null };
  attachEscapeListener(redraw);
  redraw();
}

function setMode(mode: MoveAliasMode, redraw: () => void): void {
  if (!_dialog || _dialog.mode === mode) return;
  _dialog = { ..._dialog, mode };
  redraw();
}

function setTarget(folderId: string, redraw: () => void): void {
  if (!_dialog) return;
  _dialog = { ..._dialog, targetFolderId: folderId };
  redraw();
}

/**
 * Applies the current mode to every selected id, then clears the selection and closes — matches
 * the mockup's committed flow ("the alias appears in the target folder while the original stays
 * put" / move "leaves" the source). Sequential (not `Promise.all`) so per-id IDB writes apply in a
 * predictable order for a typical small bulk selection; each call is independent (see
 * `moveGameToFolder`'s / `addAliasToFolder`'s own doc comments), so ordering has no correctness
 * effect, only determinism.
 */
async function commit(redraw: () => void): Promise<void> {
  if (!_dialog || !_dialog.targetFolderId) return;
  const { ids, sourceFolderId, mode, targetFolderId } = _dialog;
  if (mode === 'move') {
    for (const id of ids) await moveGameToFolder(id, targetFolderId, sourceFolderId);
  } else {
    for (const id of ids) await addAliasToFolder(id, targetFolderId);
  }
  clearSelection();
  closeMoveAliasDialog();
  redraw();
}

/**
 * Renders the currently-open dialog, or `null` when closed — itemListView.ts includes this once
 * per render pass (mirrors navigatorContextMenu.ts's `renderGameContextMenu` no-op-when-closed
 * contract).
 */
export function renderMoveAliasDialog(redraw: () => void): VNode | null {
  if (!_dialog) return null;
  const { ids, mode, targetFolderId, sourceFolderId } = _dialog;
  const count = ids.length;
  const isAlias = mode === 'alias';
  // `folders()` never contains section ids (sections are classified from source/tags/destination,
  // not stored membership — see studyCtrl.ts's `moveGameToFolder` doc comment), so filtering only
  // needs to drop the browsed folder itself when there is one.
  const destinations = folders().filter(f => f.id !== sourceFolderId);
  const primaryLabel = isAlias ? 'Add alias' : 'Move here';
  const description = isAlias
    ? 'Adds a linked alias in the chosen folder while the selection keeps its current home.'
    : "Re-homes the selection to the chosen folder and removes it from the folder you're browsing now.";

  return h('div.sentry-move-dialog-overlay', {
    attrs: { 'aria-label': 'Close folder dialog', ...controlExplainerAttrs({ label: 'Close folder dialog' }) },
    on: { click: () => { closeMoveAliasDialog(); redraw(); } },




    key: 'move-alias-dialog',







    hook: { destroy: () => { if (_dialog !== null) return; _dialogOpener?.focus(); _dialogOpener = null; } },
  }, [
    h('div.sentry-move-dialog', {
      attrs: { 'aria-label': 'Folder dialog', ...controlExplainerAttrs({ label: 'Folder dialog' }) },
      on: { click: (e: Event) => e.stopPropagation() },
    }, [
      h('div.sentry-move-dialog__header', [
        h('h3', `${count} game${count === 1 ? '' : 's'} selected`),
        h('p', 'Choose what happens, then pick a destination.'),
      ]),
      h('div.sentry-move-dialog__seg', { attrs: { role: 'group', 'aria-label': 'Move or add alias' } }, [
        h('button.sentry-move-dialog__seg-btn', {
          class: { 'sentry-move-dialog__seg-btn--on': !isAlias },
          attrs: { type: 'button', 'aria-pressed': String(!isAlias), ...controlExplainerAttrs({ label: 'Move selected games', description: "Re-homes the selection and removes it from the folder you're browsing now." }) },
          on: { click: () => setMode('move', redraw) },
        }, [navIcon('folder-input', { size: 13 }), h('span', 'Move')]),
        h('button.sentry-move-dialog__seg-btn', {
          class: {
            'sentry-move-dialog__seg-btn--on': isAlias,
            'sentry-move-dialog__seg-btn--alias': isAlias,
          },
          attrs: { type: 'button', 'aria-pressed': String(isAlias), ...controlExplainerAttrs({ label: 'Add aliases for selected games', description: 'Adds links in another folder while keeping the current home.' }) },
          on: { click: () => setMode('alias', redraw) },
        }, [navIcon('corner-down-right', { size: 13 }), h('span', 'Add alias to…')]),
      ]),
      h('p.sentry-move-dialog__desc', description),
      h('div.sentry-move-dialog__picker', destinations.length === 0
        ? [h('div.sentry-move-dialog__empty', 'No other folders yet — create one first.')]
        : destinations.map(folder => h('button.sentry-move-dialog__pick', {
            key: folder.id,
            class: { 'sentry-move-dialog__pick--on': targetFolderId === folder.id },
            attrs: { type: 'button', 'aria-pressed': String(targetFolderId === folder.id), ...controlExplainerAttrs({ label: `Choose ${folder.name}`, description: `Sets ${folder.name} as the destination folder.` }) },
            on: { click: () => setTarget(folder.id, redraw) },
          }, [navIcon('folder-closed', { size: 14 }), h('span', folder.name)]))),
      h('div.sentry-move-dialog__footer', [
        h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--ghost', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel folder change' }) },
          on: { click: () => { closeMoveAliasDialog(); redraw(); } },
        }, 'Cancel'),
        targetFolderId ? h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--primary', {
          class: { 'sentry-move-dialog__btn--alias': isAlias },
          attrs: { type: 'button', ...controlExplainerAttrs({ label: primaryLabel, description }) },
          on: { click: () => { void commit(redraw); } },
        }, [navIcon(isAlias ? 'corner-down-right' : 'folder-input', { size: 13 }), h('span', primaryLabel)]) : renderDisabledControlExplainer(
          { label: primaryLabel, description: 'Choose a destination folder before continuing.' },
          h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--primary', {
            class: { 'sentry-move-dialog__btn--alias': isAlias },
            attrs: { type: 'button', disabled: true },
          }, [navIcon(isAlias ? 'corner-down-right' : 'folder-input', { size: 13 }), h('span', primaryLabel)]),
        ),
      ]),
    ]),
  ]);
}
