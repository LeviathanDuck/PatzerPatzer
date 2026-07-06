














































import { h, type VNode } from 'snabbdom';
import { renderNavigationPane, SYSTEM_LENSES, type StudyLensId } from './navigationPaneView';
import { renderItemListPane, type ItemListDensity } from './itemListView';
import {
  STUDY_SECTIONS,
  type StudyNavigationFolderGroup,
  type StudyNavigationTree,
  type StudySectionId,
} from './navigationIndexProvider';
import type { StudyItem } from './types';
import { PaneResizeController } from './paneResize';

// ---------------------------------------------------------------------------------------------
// Selection model — BASIC single-selection only (T5-D09 owns multi-select). Kept as a single
// tagged value in a shape D09 can upgrade (e.g. to `ReadonlySet<string>` of these same keys)
// without needing to change how `navigationIndexProvider.ts` or the pane views are consumed.
// ---------------------------------------------------------------------------------------------

export type NavigatorSelection =
  | { kind: 'lens'; lensId: StudyLensId }
  | { kind: 'section'; sectionId: StudySectionId }
  | { kind: 'folder'; sectionId: StudySectionId; folderId: string };

/** Module-level, per-session (mirrors navigationPaneView.ts's own `_collapsedIds` pattern) — not
 * persisted to IDB/localStorage; a fresh page load re-defaults via `defaultSelection` below. */
let _selection: NavigatorSelection | null = null;

function defaultSelection(): NavigatorSelection {



  const first = STUDY_SECTIONS[0]!;
  return { kind: 'section', sectionId: first.id };
}

/** The exact Snabbdom `key` string D05 assigns to the row representing this selection —
 * byte-for-byte the same template literals `navigationPaneView.ts` itself uses
 * (`renderLensRow`/`renderSectionBlock`/`renderFolderRow`). Constructing (not parsing) these
 * strings avoids any ambiguity from section ids that themselves contain hyphens. */
function selectionKey(selection: NavigatorSelection): string {
  if (selection.kind === 'lens') return `lens-${selection.lensId}`;
  if (selection.kind === 'section') return `section-${selection.sectionId}`;
  return `folder-${selection.sectionId}-${selection.folderId}`;
}

/** Builds the full key -> Selection index for the CURRENT tree/lens set, independently of
 * whatever subset of rows D05 actually rendered (which depends on its own private collapse
 * state) — every lens/section/folder gets an entry regardless of collapse state, so a click on
 * any row D05 chooses to render always resolves. */
function buildSelectionIndex(tree: StudyNavigationTree): Map<string, NavigatorSelection> {
  const index = new Map<string, NavigatorSelection>();
  for (const lens of SYSTEM_LENSES) {
    const selection: NavigatorSelection = { kind: 'lens', lensId: lens.id };
    index.set(selectionKey(selection), selection);
  }
  const walkFolders = (sectionId: StudySectionId, groups: readonly StudyNavigationFolderGroup[]): void => {
    for (const group of groups) {
      const selection: NavigatorSelection = { kind: 'folder', sectionId, folderId: group.id };
      index.set(selectionKey(selection), selection);
      walkFolders(sectionId, group.children);
    }
  };
  for (const section of tree.sections) {
    const selection: NavigatorSelection = { kind: 'section', sectionId: section.id };
    index.set(selectionKey(selection), selection);
    walkFolders(section.id, section.folders);
  }
  return index;
}

/**
 * Walks the vnode tree `renderNavigationPane` returned and, for every row whose `key` is in
 * `keyIndex`, merges in a click handler (composed with whatever click handler D05 already
 * attached — both fire, in this order: select, then D05's own collapse/expand toggle) plus an
 * `--active` class / `aria-selected` marker when that row is the current selection. Mutates the
 * FRESH vnode tree D05 just returned for THIS render pass only (a new tree every redraw, per this
 * codebase's re-render-from-scratch model) — never a previously-patched/live tree, and never
 * navigationPaneView.ts's own source.
 */
// Snabbdom's own `Listener<T>` type declares `this: VNode` and a specific event subtype per key
// (e.g. MouseEvent for 'click'), which — combined with `On`'s index signature — resolves to an
// unwieldy intersection type at the call site. This file only ever needs to call THROUGH an
// existing handler opaquely (never caring about its precise event subtype or `this` binding), so
// it re-reads `data.on.click` as this simpler, self-contained alias instead of fighting that
// intersection type; D05's own handlers (plain arrow functions ignoring `this`) satisfy it as-is.
type PlainClickHandler = (event: Event, vnode: VNode) => void;

function wireSelectionHandlers(
  root: VNode,
  keyIndex: ReadonlyMap<string, NavigatorSelection>,
  activeKey: string,
  onSelect: (selection: NavigatorSelection) => void,
): void {
  const visit = (node: VNode): void => {
    const key = node.key;
    if (typeof key === 'string') {
      const selection = keyIndex.get(key);
      if (selection) {
        if (!node.data) node.data = {};
        const data = node.data;
        const isActive = key === activeKey;
        data.class = { ...(data.class ?? {}), '--active': isActive };
        data.attrs = { ...(data.attrs ?? {}), 'aria-selected': String(isActive) };
        const existingClick = data.on?.click as PlainClickHandler | PlainClickHandler[] | undefined;
        data.on = {
          ...(data.on ?? {}),
          click: (event: Event) => {
            onSelect(selection);
            if (typeof existingClick === 'function') existingClick(event, node);
            else if (Array.isArray(existingClick)) existingClick.forEach(fn => fn(event, node));
          },
        };
      }
    }
    node.children?.forEach(child => {
      // Snabbdom children arrays commonly carry a literal `null`/`undefined` "no vnode here"
      // placeholder (used throughout navigationPaneView.ts, e.g. `hasChildren ? h(...) : null`) —
      // `typeof null === 'object'` in JS, so that check alone would call visit(null) and crash on
      // `node.key`. Guard both away explicitly before recursing.
      if (child != null && typeof child !== 'string') visit(child);
    });
  };
  visit(root);
}

// ---------------------------------------------------------------------------------------------
// Selected node -> itemIds resolution (over the already-built P1 tree; no classification logic
// of its own — that all lives in navigationIndexProvider.ts, consumed here only).
// ---------------------------------------------------------------------------------------------

function collectFolderItemIdsRecursive(group: StudyNavigationFolderGroup, into: Set<string>): void {
  for (const id of group.itemIds) into.add(id);
  for (const child of group.children) collectFolderItemIdsRecursive(child, into);
}

function findFolderGroup(
  groups: readonly StudyNavigationFolderGroup[],
  folderId: string,
): StudyNavigationFolderGroup | null {
  for (const group of groups) {
    if (group.id === folderId) return group;
    const found = findFolderGroup(group.children, folderId);
    if (found) return found;
  }
  return null;
}

function resolveSelectedItemIds(tree: StudyNavigationTree, selection: NavigatorSelection): string[] {


  if (selection.kind === 'lens') return [];

  const section = tree.sections.find(s => s.id === selection.sectionId);
  if (!section) return [];

  if (selection.kind === 'section') {
    // A section selection shows every item classified into it — unfiled items plus everything
    // nested in any folder under it, deduped (P2-LIB-8 multi-membership means the same item can
    // be filed into two sibling/nested folders within one section, and buildTree() pushes it into
    // each matching folder group's own itemIds). This matches the section row's own displayed
    // count (navigationPaneView.ts's countSectionItems) — P2-LIB-2's "sections navigate and feel
    // like top-level folders."
    const ids = new Set<string>(section.unfiledItemIds);
    for (const folder of section.folders) collectFolderItemIdsRecursive(folder, ids);
    return Array.from(ids);
  }





  const folder = findFolderGroup(section.folders, selection.folderId);
  return folder ? Array.from(new Set(folder.itemIds)) : [];
}

function resolveItems(ids: readonly string[], byId: ReadonlyMap<string, StudyItem>): StudyItem[] {
  const items: StudyItem[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) items.push(item);
  }
  return items;
}

// ---------------------------------------------------------------------------------------------
// Pane divider — one module-level controller instance for the nav-pane/item-list split.
// Pixel defaults per design doc §1.5 [DEFAULT], bumped from NN's own 200/150 (Patzer's fixed
// section names run longer than a typical NN folder name, and the item-list's own three-zone row
// card needs more room than a plain-text NN row).
// ---------------------------------------------------------------------------------------------

const NAV_PANE_STORAGE_KEY = 'patzer.studyNavPaneWidth';
const NAV_PANE_DEFAULT_WIDTH = 240;
const NAV_PANE_MIN_WIDTH = 180;
const NAV_PANE_CSS_VAR = '---study-nav-pane-width';

const _navDivider = new PaneResizeController({
  orientation: 'horizontal',
  defaultSize: NAV_PANE_DEFAULT_WIDTH,
  minSize: NAV_PANE_MIN_WIDTH,
  storageKey: NAV_PANE_STORAGE_KEY,
  cssVar: NAV_PANE_CSS_VAR,
  targetSelector: '.lib-shell',
  bodyClassDuringDrag: 'study-nav-resizing',
});

function renderDivider(redraw: () => void): VNode {
  return h('div.lib-divider', {
    class: { '--dragging': _navDivider.isDragging() },
    attrs: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize navigation pane',
      title: 'Resize navigation pane',
    },
    on: {
      pointerdown: (event: PointerEvent) => _navDivider.startDrag(event, redraw),
    },
  }, [
    h('span.divider-badge'),
  ]);
}

// Item-list row density (P2-LIB-10's "compact/full density modes retained"). A density TOGGLE is
// not part of this slice's scope (no appearance-settings UI exists yet, T5-D08) — 'full' is this
// app's own existing default elsewhere (src/games/view.ts's `gamesDensity`), reused here rather
// than inventing a Study-specific default. itemListView.ts's signature already takes `density` as
// a plain parameter, so wiring a real toggle later needs no change here beyond passing a variable
// instead of this constant.
const ITEM_LIST_DENSITY: ItemListDensity = 'full';

/**
 * Render the Study Navigator's composing shell: nav pane (T5-D05) + resize divider + item-list
 * pane (T5-D06), wired with BASIC single-selection over the P1 navigation-index tree.
 *
 * `tree` is the current `studyNavigationTree()` snapshot; `allItems` is the currently-loaded
 * `StudyItem[]` (`allStudies()`) those tree itemIds are resolved against.
 */
export function renderNavigatorShell(
  tree: StudyNavigationTree,
  allItems: readonly StudyItem[],
  redraw: () => void,
): VNode {
  if (_selection === null) _selection = defaultSelection();

  const keyIndex = buildSelectionIndex(tree);
  const activeKey = selectionKey(_selection);
  const onSelect = (selection: NavigatorSelection): void => {
    _selection = selection;
    redraw();
  };

  const navPane = renderNavigationPane(tree, redraw);
  wireSelectionHandlers(navPane, keyIndex, activeKey, onSelect);

  const byId = new Map(allItems.map(item => [item.id, item] as const));
  const items = resolveItems(resolveSelectedItemIds(tree, _selection), byId);
  const itemListPane = renderItemListPane(items, ITEM_LIST_DENSITY, redraw);

  return h('div.lib-shell', {
    attrs: { style: _navDivider.styleDeclaration() },
  }, [
    navPane,
    renderDivider(redraw),
    itemListPane,
  ]);
}
