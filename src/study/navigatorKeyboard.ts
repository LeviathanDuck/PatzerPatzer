
























import { current } from '../router';
import {
  bulkDeleteStudies,
  clearSelection,
  cursorId,
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
  /** Page-scroll the given pane's own scroll container by roughly one page. */
  pageScroll(pane: FocusedPane, direction: 1 | -1): void;
  redraw(): void;
}

let _deps: NavigatorKeyboardDeps | null = null;
let _bound = false;

/**
 * Attach the ONE document-level keydown listener (idempotent) and refresh the deps closures this
 * render will use. Call once per `renderNavigatorShell()` -- mirrors src/keyboard.ts's own
 * `bindKeyboardHandlers(deps)` precedent (a single always-on document listener, deps injected).
 */
export function bindNavigatorKeyboard(deps: NavigatorKeyboardDeps): void {
  _deps = deps;
  if (_bound) return;
  _bound = true;
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    // Route-gated like src/keyboard.ts's own routeName checks -- this handler must stay inert on
    // every other page (analysis board, puzzles, etc.), never fighting src/keyboard.ts's own
    // global arrow-key bindings there.
    if (current().name !== 'study') return;
    if (!_deps) return;
    handleNavigatorKeydown(event, _deps);
  });
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
      if (pane === 'list') jumpListBoundary(edge, deps.listDisplayedIds());
      else jumpNavBoundary(edge, deps);
      deps.redraw();
      return;
    }
    case 'PageUp':
    case 'PageDown': {
      event.preventDefault();
      deps.pageScroll(pane, event.key === 'PageUp' ? -1 : 1);
      return;
    }
    case 'ArrowLeft': {
      if (pane === 'list') {
        // "List pane: switch focus to navigation pane" (§2.2).
        event.preventDefault();
        setFocusedPane('navigation');
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
        if (pane === 'list') { event.preventDefault(); setFocusedPane('navigation'); deps.redraw(); }
        return;
      }
      // "Tab: Nav->list" (§2.2); "list->editor" has no equivalent surface here (see ArrowRight).
      if (pane === 'navigation') { event.preventDefault(); setFocusedPane('list'); deps.redraw(); }
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
