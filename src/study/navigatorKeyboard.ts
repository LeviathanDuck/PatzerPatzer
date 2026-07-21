
























import { current } from '../router';
import {
  bulkDeleteStudies,
  clearSelection,
  cursorId,
  rangeSelectToId,
  selectAllDisplayed,
  selectedIds,
  shiftArrowSelect,
  toggleSelectId,
} from './studyCtrl';

export type FocusedPane = 'navigation' | 'list';

let _focusedPane: FocusedPane = 'list';

export function focusedPane(): FocusedPane {
  return _focusedPane;
}

export function setFocusedPane(pane: FocusedPane): void {
  _focusedPane = pane;
}

/**
 * Everything the pure handler needs FROM the shell for the current render -- refreshed every call
 * to `bindNavigatorKeyboard()` (see header comment). The `nav*` members describe
 * navigatorShellView.ts's own `_selection` (a single value, not part of the D09 multi-select
 * model) -- injected rather than imported, since that state is shell-local.
 */
export interface NavigatorKeyboardDeps {
  /** Item-list pane ids in current display order (T5-D09's own `displayedIds` shape). */
  listDisplayedIds(): readonly string[];
  /** Nav-pane row keys ("section-<id>" / "folder-<sectionId>-<folderId>" / "lens-<id>") in
   * CURRENTLY VISIBLE (collapse-aware) top-to-bottom order. */
  navDisplayedKeys(): readonly string[];
  /** The nav-pane row key the shell's `_selection` currently resolves to, or null. */
  navSelectedKey(): string | null;
  /** Set the shell's `_selection` to whichever NavigatorSelection this key resolves to. */
  selectNavKey(key: string): void;
  /** Whether the row for `key` can expand/collapse (has children). */
  navIsExpandable(key: string): boolean;
  /** Whether the row for `key` is currently expanded (only meaningful when expandable). */
  navIsExpanded(key: string): boolean;
  /** Toggle expand/collapse for `key` via the EXISTING navigationPaneView.ts mechanism (a
   * synthetic click on the real row -- see navigatorShellView.ts's own comment for why). */
  toggleNavExpand(key: string): void;


  pageSize(pane: FocusedPane): number;
  /** Scroll the given pane's CURRENT row (nav selection / list cursor) into view (finding #4:
   * "selection stays visible"). Called after a page/cursor move so the moved selection is never
   * stranded offscreen — replaces F1's bare `scrollBy`, which moved the viewport without the
   * cursor. */
  revealCurrent(pane: FocusedPane): void;
  /** Move REAL keyboard/AT focus into the destination pane (T5-D10 finding #3). The shell focuses
   * the destination pane's focusable container so `document.activeElement` actually moves — a
   * `setFocusedPane()` variable flip alone leaves DOM focus behind and defeats the NN
   * focus-containment gate (`shouldNavigatorHandleEvent`). */
  focusPane(pane: FocusedPane): void;
  redraw(): void;
}

let _deps: NavigatorKeyboardDeps | null = null;
let _listener: ((event: KeyboardEvent) => void) | null = null;

/**
 * NN focus-containment gate (mirrors `useKeyboardNavigation`'s `data-navigator-focused` check plus
 * `isKeyboardEventContextBlocked`): the navigator only owns a key event that ORIGINATES inside one
 * of its two panes (`.lib-nav-wrap` / `.lib-items-wrap`) and NOT inside the tool rail or any open
 * dialog. The tool rail (`.lib-rail`, which runs its own roving-arrow handler and preventDefault),
 * the resize divider, and every modal/dialog live OUTSIDE those two pane wrappers, so their keys
 * never leak into the navigator's selection model -- fixing finding #1's document-listener key
 * theft. Duck-typed on `closest` (no `instanceof Element`) so the plain-Node test harness can drive
 * it with a fake target; a target with no `closest` (or none inside a pane) is not "the navigator
 * focused", so the handler stays inert until the user actually focuses a pane (NN focus-required).
 */










const DIALOG_SELECTOR =
  '[role="dialog"], [aria-modal="true"], .study-modal-backdrop, .study-modal, .sentry-move-dialog-overlay';





const PANE_CONTROL_SELECTOR = 'button, a, input, select, textarea, [role="toolbar"]';

export function shouldNavigatorHandleEvent(target: EventTarget | null): boolean {
  const el = target as { closest?: (selectors: string) => unknown } | null;
  if (!el || typeof el.closest !== 'function') return false;
  // Rail / open-dialog controls are explicitly NOT the navigator -- their own keys win.
  if (el.closest('.lib-rail')) return false;
  if (el.closest(DIALOG_SELECTOR)) return false;
  // Must originate inside a navigator pane...
  if (el.closest('.lib-nav-wrap') === null && el.closest('.lib-items-wrap') === null) return false;
  // ...and NOT from a toolbar/interactive control INSIDE that pane (finding #2a). Only the pane
  // wrapper itself (focused container) or a list/tree row navigates.
  if (el.closest(PANE_CONTROL_SELECTOR)) return false;
  return true;
}

/**
 * Real-DOM modal block (finding #1/#2b, NN `isKeyboardEventContextBlocked`): while ANY app
 * modal/dialog is open -- including the item-pane bulk dialogs -- it owns the keyboard even if focus
 * is momentarily elsewhere, so never steal keys from underneath it. Guarded so the plain-Node test
 * harness (fake `document`, no `querySelector`) never throws; the pure `handleNavigatorKeydown` the
 * unit test drives never reaches this.
 */
function isBlockingModalOpen(): boolean {
  if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return false;
  return document.querySelector(DIALOG_SELECTOR) !== null;
}

/** The navigation keys the navigator claims -- used only by the dead-keys recovery path (below) to
 * decide whether a key that arrived with focus stranded on `<body>` is worth recovering for.
 * Exported for the unit test (the recovery path itself lives in the real-DOM document listener). */
export function isNavigatorKey(event: KeyboardEvent): boolean {
  switch (event.key) {
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
    case 'Home': case 'End': case 'PageUp': case 'PageDown':
    case 'Tab': case 'Delete': case 'Backspace':
      return true;
    default:
      return Boolean((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a');
  }
}

/** True when keyboard focus has fallen to the document body/root (or nowhere) -- e.g. a dialog that
 * closed removed its own focused button without restoring focus. In that state a navigator key can
 * be recovered by refocusing the last-focused pane (finding #2c). Exported for the unit test. */
export function isFocusOnBody(target: EventTarget | null): boolean {
  if (target === null) return true;
  if (typeof document === 'undefined') return false;
  return target === document.body || target === document.documentElement;
}

/**
 * Attach the ONE document-level keydown listener (idempotent) and refresh the deps closures this
 * render will use. Call once per `renderNavigatorShell()` -- mirrors src/keyboard.ts's own
 * `bindKeyboardHandlers(deps)` precedent (a single always-on document listener, deps injected).
 * `unbindNavigatorKeyboard()` (below, wired to the shell root's Snabbdom `destroy` hook) removes the
 * listener and drops the retained deps on unmount, per the NN attach/cleanup lifecycle.
 */
export function bindNavigatorKeyboard(deps: NavigatorKeyboardDeps): void {
  _deps = deps;
  if (_listener) return;
  _listener = (event: KeyboardEvent) => {
    // Route-gated like src/keyboard.ts's own routeName checks -- inert on every other page.
    if (current().name !== 'study') return;
    if (!_deps) return;
    // Modal block first (finding #1/#2b): while any dialog is open it owns the keyboard, full stop.
    if (isBlockingModalOpen()) return;
    // NN containment: act when the event originates inside a navigator pane (and not a toolbar/
    // control or dialog). The rail, divider, toolbars, and dialogs are all excluded.
    if (shouldNavigatorHandleEvent(event.target)) {
      handleNavigatorKeydown(event, _deps);
      return;
    }
    // Dead-keys recovery (finding #2c): focus has fallen to <body> (e.g. a closed dialog removed
    // its focused control without restoring focus) while the navigator is mounted and no modal is
    // open. Refocus the LAST-focused pane and handle this key, so navigation is not dead until the
    // user clicks back in. Generic here -- individual dialogs are not patched (the PGN dialog's
    // proper opener-focus-restore is filed as a UPN, not fixed in libraryView.ts).
    if (isFocusOnBody(event.target) && isNavigatorKey(event)) {
      _deps.focusPane(focusedPane());
      handleNavigatorKeydown(event, _deps);
    }
  };
  document.addEventListener('keydown', _listener);
}

/**
 * Remove the document keydown listener and drop the retained deps closures (finding #1: "clean up
 * on shell unmount, no retained `_deps` closures"). Wired to the Study Navigator shell root's
 * Snabbdom `destroy` hook so leaving `#/study` (or entering the game-open shell that does not mount
 * the nav pane) detaches the listener; a later `bindNavigatorKeyboard()` re-attaches it.
 */
export function unbindNavigatorKeyboard(): void {
  if (_listener) {
    document.removeEventListener('keydown', _listener);
    _listener = null;
  }
  _deps = null;
}

/** True while `target` is a text-entry surface (INPUT/TEXTAREA/contenteditable) -- NN's own §2.2
 * rule: "input is dropped entirely while a text field has focus." Duck-typed (no `instanceof
 * HTMLElement`) so this also runs correctly in the plain-Node test harness, which has no DOM
 * globals at all. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  return el.isContentEditable === true;
}

function clampIndex(idx: number, length: number): number {
  if (idx < 0) return 0;
  if (idx >= length) return length - 1;
  return idx;
}

/**
 * Plain (non-shift) arrow move in the item-list pane: single-selects the adjacent displayed id.
 * There is no dedicated "plain move" transition in studyCtrl.ts's own D09 API (only the
 * shift-arrow/toggle/range/select-all transitions it exports) -- reusing `clearSelection` +
 * `toggleSelectId` composes the same effect (toggleSelectId's "select" branch always both selects
 * AND moves the cursor to the given id) without needing a new studyCtrl.ts export, which the
 * no-touch fence forbids adding. A stale/unset cursor recovers onto the FIRST displayed id,
 * mirroring `shiftArrowSelect`'s own recovery convention in studyCtrl.ts, rather than guessing a
 * direction-dependent start.
 */
function moveListSelection(direction: 1 | -1, displayedIds: readonly string[]): void {
  if (displayedIds.length === 0) return;
  const cursor = cursorId();
  const currentIdx = cursor !== null ? displayedIds.indexOf(cursor) : -1;
  const nextIdx = currentIdx === -1 ? 0 : clampIndex(currentIdx + direction, displayedIds.length);
  const nextId = displayedIds[nextIdx];
  if (nextId === undefined) return;
  clearSelection();
  toggleSelectId(nextId, displayedIds);
}

function jumpListBoundary(edge: 'first' | 'last', displayedIds: readonly string[]): void {
  if (displayedIds.length === 0) return;
  const id = edge === 'first' ? displayedIds[0] : displayedIds[displayedIds.length - 1];
  if (id === undefined) return;
  clearSelection();
  toggleSelectId(id, displayedIds);
}

/** Same index-clamped single-move as `moveListSelection`, over the nav pane's own single-value
 * selection (via the injected deps rather than studyCtrl.ts, since nav selection is shell-local). */
function moveNavSelection(direction: 1 | -1, deps: NavigatorKeyboardDeps): void {
  const keys = deps.navDisplayedKeys();
  if (keys.length === 0) return;
  const currentKey = deps.navSelectedKey();
  const currentIdx = currentKey !== null ? keys.indexOf(currentKey) : -1;
  const nextIdx = currentIdx === -1 ? 0 : clampIndex(currentIdx + direction, keys.length);
  const nextKey = keys[nextIdx];
  if (nextKey !== undefined) deps.selectNavKey(nextKey);
}

function jumpNavBoundary(edge: 'first' | 'last', deps: NavigatorKeyboardDeps): void {
  const keys = deps.navDisplayedKeys();
  if (keys.length === 0) return;
  const key = edge === 'first' ? keys[0] : keys[keys.length - 1];
  if (key !== undefined) deps.selectNavKey(key);
}






function pageMoveListSelection(direction: 1 | -1, pageSize: number, displayedIds: readonly string[]): void {
  if (displayedIds.length === 0) return;
  const cursor = cursorId();
  const currentIdx = cursor !== null ? displayedIds.indexOf(cursor) : -1;
  const baseIdx = currentIdx === -1 ? (direction > 0 ? 0 : displayedIds.length - 1) : currentIdx;
  const nextIdx = clampIndex(baseIdx + direction * pageSize, displayedIds.length);
  const nextId = displayedIds[nextIdx];
  if (nextId === undefined) return;
  clearSelection();
  toggleSelectId(nextId, displayedIds);
}

/** PageUp/PageDown in the nav pane: same page-sized move over the shell-local single-value nav
 * selection (via the injected deps, not studyCtrl.ts). */
function pageMoveNavSelection(direction: 1 | -1, pageSize: number, deps: NavigatorKeyboardDeps): void {
  const keys = deps.navDisplayedKeys();
  if (keys.length === 0) return;
  const currentKey = deps.navSelectedKey();
  const currentIdx = currentKey !== null ? keys.indexOf(currentKey) : -1;
  const baseIdx = currentIdx === -1 ? (direction > 0 ? 0 : keys.length - 1) : currentIdx;
  const nextIdx = clampIndex(baseIdx + direction * pageSize, keys.length);
  const nextKey = keys[nextIdx];
  if (nextKey !== undefined) deps.selectNavKey(nextKey);
}

/** Delete/Backspace behind the SAME bare `confirm()` + `bulkDeleteStudies()` pattern already used
 * elsewhere in this module (navigatorContextMenu.ts's context-menu delete, itemListView.ts's bulk
 * action bar) -- reusing the existing confirm-dialog CONVENTION, not inventing a new one, per this
 * slice's "do not add a new confirm" fence. */
function deleteListSelection(redraw: () => void): void {
  const count = selectedIds().size;
  if (count === 0) return;
  if (!confirm(`Delete ${count} selected game${count === 1 ? '' : 's'}?`)) return;
  void bulkDeleteStudies().then(redraw);
}







export function handleNavigatorKeydown(event: KeyboardEvent, deps: NavigatorKeyboardDeps): void {
  if (isTextEntryTarget(event.target)) return; // NN §2.2's own rule -- search/rename fields keep working

  const mod = event.metaKey || event.ctrlKey;
  const pane = focusedPane();

  if (mod && event.key.toLowerCase() === 'a') {
    // Cmd/Ctrl+A ("select all files in the current folder/tag/property view", §2.2) is a
    // list/file-view action only -- no defined nav-pane meaning in the quoted table.
    if (pane === 'list') {
      event.preventDefault();
      selectAllDisplayed(deps.listDisplayedIds());
      deps.redraw();
    }
    return;
  }

  switch (event.key) {
    case 'ArrowDown':
    case 'ArrowUp': {
      const direction: 1 | -1 = event.key === 'ArrowDown' ? 1 : -1;
      event.preventDefault();
      if (pane === 'list') {
        const ids = deps.listDisplayedIds();
        if (event.shiftKey) shiftArrowSelect(direction, ids);
        else moveListSelection(direction, ids);
      } else {
        moveNavSelection(direction, deps);
      }
      deps.redraw();
      return;
    }
    case 'Home':
    case 'End': {
      const edge: 'first' | 'last' = event.key === 'Home' ? 'first' : 'last';
      event.preventDefault();
      if (pane === 'list') {
        const ids = deps.listDisplayedIds();
        if (event.shiftKey) {
          // Shift+Home/End RANGE-SELECTS from the cursor to the boundary (§2.2 key map), instead of
          // the plain-jump branch's clear-then-single-select (finding #5). Reuses D09's own
          // `rangeSelectToId` -- the exact merge shift-click uses (studyCtrl.ts): it selects every
          // id between the current cursor and the boundary inclusive, merges into any existing
          // selection, and moves the cursor to the boundary. With no prior cursor it collapses to
          // just the boundary id, matching that helper's documented no-cursor fallback.
          if (ids.length > 0) {
            const boundaryId = edge === 'first' ? ids[0]! : ids[ids.length - 1]!;
            rangeSelectToId(boundaryId, ids);
          }
        } else {
          jumpListBoundary(edge, ids);
        }
      } else {
        // Nav pane is single-select (no range concept) -- Shift is ignored, plain jump either way.
        jumpNavBoundary(edge, deps);
      }
      deps.redraw();
      return;
    }
    case 'PageUp':
    case 'PageDown': {
      event.preventDefault();
      const direction: 1 | -1 = event.key === 'PageUp' ? -1 : 1;
      const pageSize = Math.max(1, deps.pageSize(pane));
      if (pane === 'list') pageMoveListSelection(direction, pageSize, deps.listDisplayedIds());
      else pageMoveNavSelection(direction, pageSize, deps);
      deps.revealCurrent(pane); // finding #4: keep the moved cursor/selection visible
      deps.redraw();
      return;
    }
    case 'ArrowLeft': {
      if (pane === 'list') {
        // "List pane: switch focus to navigation pane" (§2.2).
        event.preventDefault();
        setFocusedPane('navigation');
        deps.focusPane('navigation'); // finding #3: move REAL DOM/AT focus, not just the flag
        deps.redraw();
        return;
      }



      {
        const key = deps.navSelectedKey();
        if (key !== null && deps.navIsExpandable(key) && deps.navIsExpanded(key)) {
          event.preventDefault();
          deps.toggleNavExpand(key);
        }
      }
      return;
    }
    case 'ArrowRight': {
      if (pane === 'navigation') {
        const key = deps.navSelectedKey();
        if (key !== null && deps.navIsExpandable(key) && !deps.navIsExpanded(key)) {
          // "Navigation pane: expand" (§2.2).
          event.preventDefault();
          deps.toggleNavExpand(key);
          return;
        }
        // "...or switch focus to list pane if already expanded" (§2.2).
        event.preventDefault();
        setFocusedPane('list');
        deps.focusPane('list'); // finding #3: move REAL DOM/AT focus, not just the flag
        deps.redraw();
        return;
      }
      // List pane: NN's "switch to editor" has no equivalent surface in this composed shell --
      // out of scope for this slice, no-op.
      return;
    }
    case 'Tab': {
      if (event.shiftKey) {
        // "Shift+Tab: List->nav" (§2.2).
        if (pane === 'list') { event.preventDefault(); setFocusedPane('navigation'); deps.focusPane('navigation'); deps.redraw(); }
        return;
      }
      // "Tab: Nav->list" (§2.2); "list->editor" has no equivalent surface here (see ArrowRight).
      if (pane === 'navigation') { event.preventDefault(); setFocusedPane('list'); deps.focusPane('list'); deps.redraw(); }
      return;
    }
    case 'Delete':
    case 'Backspace': {
      if (pane === 'list') {
        event.preventDefault();
        deleteListSelection(deps.redraw);
      }
      return;
    }
    default:
      return;
  }
}
