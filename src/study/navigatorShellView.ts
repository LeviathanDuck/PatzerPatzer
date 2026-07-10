





















































import { h, type VNode } from 'snabbdom';
import {
  collapseAllSections,
  expandAllSections,
  hasAnyExpanded,
  nonInternalTagCounts,
  renderNavigationPane,
  SYSTEM_LENSES,
  SYSTEM_SMART_TAGS,
  type StudyLensId,
} from './navigationPaneView';
import { renderItemListPane, type ItemListDensity } from './itemListView';
import {
  STUDY_SECTIONS,
  type StudyNavigationFolderGroup,
  type StudyNavigationTree,
  type StudySectionId,
} from './navigationIndexProvider';
import type { StudyItem } from './types';
import { PaneResizeController } from './paneResize';
import { applyNavigatorSettings, renderNavigatorAppearanceSettings } from './navigatorSettings';
import { navIcon, type NavIconName, type NavIconNameOrAlias } from './navIcons';
import { showHiddenItems, toggleShowHidden } from './hiddenItems';
import {
  createFolder,
  folders,
  queryStudyItems,
  searchQuery,
  setActiveFolderId,
  setSearch,
  sortDir,
  setSortDir,
  sortKey,
  setSortKey,
  type StudySortKey,
} from './studyCtrl';
import { current, writeHashRoute } from '../router';
import { bindNavigatorKeyboard, setFocusedPane, type FocusedPane } from './navigatorKeyboard';
import { deriveHomeFolderId } from './studyDb';

// ---------------------------------------------------------------------------------------------
// Selection model — BASIC single-selection only (T5-D09 owns multi-select). Kept as a single
// tagged value in a shape D09 can upgrade (e.g. to `ReadonlySet<string>` of these same keys)
// without needing to change how `navigationIndexProvider.ts` or the pane views are consumed.
// ---------------------------------------------------------------------------------------------

export type NavigatorSelection =
  | { kind: 'lens'; lensId: StudyLensId }
  | { kind: 'section'; sectionId: StudySectionId }
  | { kind: 'folder'; sectionId: StudySectionId; folderId: string }




  | { kind: 'tag'; tagName: string };

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
  if (selection.kind === 'tag') return `tag-${selection.tagName}`;
  return `folder-${selection.sectionId}-${selection.folderId}`;
}









function buildSelectionIndex(
  tree: StudyNavigationTree,
  allItems: readonly StudyItem[],
): Map<string, NavigatorSelection> {
  const index = new Map<string, NavigatorSelection>();



  for (const lens of [...SYSTEM_LENSES, ...SYSTEM_SMART_TAGS]) {
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
  for (const tag of nonInternalTagCounts(allItems)) {
    const selection: NavigatorSelection = { kind: 'tag', tagName: tag.name };
    index.set(selectionKey(selection), selection);
  }
  return index;
}




















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
): string[] {
  const visibleOrder: string[] = [];
  const visit = (node: VNode): void => {
    const key = node.key;
    if (typeof key === 'string') {
      const selection = keyIndex.get(key);
      if (selection) {
        visibleOrder.push(key);
        if (!node.data) node.data = {};
        const data = node.data;
        const isActive = key === activeKey;
        data.class = { ...(data.class ?? {}), '--active': isActive };
        data.attrs = { ...(data.attrs ?? {}), 'aria-selected': String(isActive), 'data-nav-key': key };
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
  return visibleOrder;
}

/**
 * Finds the live DOM element for a nav-pane row by the `data-nav-key` attribute
 * `wireSelectionHandlers` stamps onto every matched row (see its own comment above). Used only by
 * T5-D10's keyboard wiring (`renderNavigatorShell` below) to read `aria-expanded` and to dispatch a
 * synthetic click that reuses D05's OWN existing expand/collapse toggle — no new expansion state.
 * Manually escapes `"`/`\` (the only characters that matter inside a quoted attribute-selector
 * value) rather than `CSS.escape` (that API escapes for CSS *identifiers*, a stricter and
 * unnecessary rule for a quoted attribute value here).
 */
function findNavRowElement(key: string): HTMLElement | null {
  const escaped = key.replace(/["\\]/g, match => `\\${match}`);
  return document.querySelector<HTMLElement>(`.lib-nav-wrap [data-nav-key="${escaped}"]`);
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













function resolveSelectedItemIds(
  tree: StudyNavigationTree,
  selection: NavigatorSelection,
  includeDescendants: boolean,
): string[] {











  if (selection.kind === 'lens' || selection.kind === 'tag') return [];

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
  if (!folder) return [];
  if (includeDescendants) {
    const ids = new Set<string>();
    collectFolderItemIdsRecursive(folder, ids);
    return Array.from(ids);
  }
  return Array.from(new Set(folder.itemIds));
}












function findFolderGroupContainingItem(
  groups: readonly StudyNavigationFolderGroup[],
  folderId: string,
  itemId: string,
): StudyNavigationFolderGroup | null {
  for (const group of groups) {
    if (group.id === folderId && group.itemIds.includes(itemId)) return group;
    const found = findFolderGroupContainingItem(group.children, folderId, itemId);
    if (found) return found;
  }
  return null;
}

interface GameOpenScope {
  sectionId: StudySectionId;
  folderId: string | null;
  label: string;
  itemIds: string[];
}

/**
 * Resolves the open item's home-folder scope against the current tree snapshot, or `null` when
 * the item cannot be located in it yet (still loading, or a stale/unresolvable home-folder
 * reference) — callers fall back to showing just the single open item in that case, never the
 * whole library (cross-folder browsing stays unavailable in this state, per the design doc).
 */
function resolveGameOpenScope(
  tree: StudyNavigationTree,
  allItems: readonly StudyItem[],
  openItemId: string,
): GameOpenScope | null {
  const openItem = allItems.find(item => item.id === openItemId);
  if (!openItem) return null;
  const homeFolderId = deriveHomeFolderId(openItem);
  for (const section of tree.sections) {
    if (homeFolderId === null) {
      if (section.unfiledItemIds.includes(openItemId)) {
        return { sectionId: section.id, folderId: null, label: section.label, itemIds: section.unfiledItemIds };
      }
      continue;
    }
    const group = findFolderGroupContainingItem(section.folders, homeFolderId, openItemId);
    if (group) return { sectionId: section.id, folderId: group.id, label: group.name, itemIds: group.itemIds };
  }
  return null;
}

function resolveItems(ids: readonly string[], byId: ReadonlyMap<string, StudyItem>): StudyItem[] {
  const items: StudyItem[] = [];
  for (const id of ids) {
    const item = byId.get(id);
    if (item) items.push(item);
  }
  return items;
}














function resolveLensItems(lensId: StudyLensId, allItems: readonly StudyItem[]): StudyItem[] {
  switch (lensId) {
    case 'favorites':
      return allItems.filter(item => item.favorite === true);
    case 'studied':
      return allItems.filter(item => item.tags.includes('studied'));
    case 'saved-puzzles':
      return allItems.filter(item => item.source === 'puzzles');
    case 'unsorted':
      return allItems.filter(item => item.uncategorized === true);
    default:
      return [];
  }
}













function collectItemRowOrder(root: VNode, knownIds: ReadonlySet<string>): string[] {
  const order: string[] = [];
  const visit = (node: VNode): void => {
    const key = node.key;
    if (typeof key === 'string' && knownIds.has(key)) order.push(key);
    node.children?.forEach(child => {
      if (child != null && typeof child !== 'string') visit(child);
    });
  };
  visit(root);
  return order;
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







const ITEM_LIST_PANE_STORAGE_KEY = 'patzer.studyItemListPaneWidth';
const ITEM_LIST_PANE_DEFAULT_WIDTH = 280;
const ITEM_LIST_PANE_MIN_WIDTH = 220;
const ITEM_LIST_PANE_CSS_VAR = '---study-item-list-pane-width';

const _itemListDivider = new PaneResizeController({
  orientation: 'horizontal',
  defaultSize: ITEM_LIST_PANE_DEFAULT_WIDTH,
  minSize: ITEM_LIST_PANE_MIN_WIDTH,
  storageKey: ITEM_LIST_PANE_STORAGE_KEY,
  cssVar: ITEM_LIST_PANE_CSS_VAR,
  targetSelector: '.lib-shell',
  bodyClassDuringDrag: 'study-nav-resizing',
});

function renderDivider(redraw: () => void, controller: PaneResizeController = _navDivider): VNode {
  return h('div.lib-divider', {
    class: { '--dragging': controller.isDragging() },
    attrs: {
      role: 'separator',
      'aria-orientation': 'vertical',
      'aria-label': 'Resize navigation pane',
      title: 'Resize navigation pane',
    },
    on: {
      pointerdown: (event: PointerEvent) => controller.startDrag(event, redraw),
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























type RailSurface = { id: string; label: string; icon: NavIconName; active: boolean; disabled: boolean };

function railSurfaces(): RailSurface[] {
  return [
    { id: 'library', label: 'Library', icon: 'library', active: true, disabled: false },
    { id: 'repertoire-builder', label: 'Repertoire Builder', icon: 'hammer', active: false, disabled: true },
    { id: 'compliance-toolkit', label: 'Repertoire Compliance Toolkit', icon: 'shield-check', active: false, disabled: true },
    { id: 'orp', label: 'Opening Repetition Practice', icon: 'repeat', active: false, disabled: true },
  ];
}

function renderRail(): VNode {
  return h('div.lib-rail', { attrs: { role: 'toolbar', 'aria-label': 'Study Navigator tools', 'aria-orientation': 'vertical' } },
    railSurfaces().map(surface => h('button.lib-rail__btn', {
      key: `rail-${surface.id}`,
      class: { '--active': surface.active },
      attrs: {
        type: 'button',
        title: surface.disabled ? `${surface.label} (coming soon)` : surface.label,
        'aria-label': surface.disabled ? `${surface.label} (coming soon)` : surface.label,
        ...(surface.active ? { 'aria-pressed': 'true' } : {}),
        ...(surface.disabled ? { 'aria-disabled': 'true' } : {}),
      },
    }, [navIcon(surface.icon, { size: 18, className: 'lib-rail__icon' })])),
  );
}













let _settingsOpen = false;
























let _newFolderMode = false;
let _newFolderValue = '';











let _reorderMode = false;

/** NN row-1 semantics: "toggles by whether anything is expanded" — `hasAnyExpanded(tree)` reads
 * navigationPaneView.ts's own existing `_collapsedIds` state (via its exported query), so this
 * button never owns a second copy of expansion state. Disabled (aria-disabled, matching this
 * shell's own convention elsewhere) while reorder mode is active — the reorder panel replaces the
 * normal tree entirely, so there is nothing for expand/collapse to act on until the user exits. */
function renderExpandCollapseAllButton(redraw: () => void, tree: StudyNavigationTree): VNode {
  const anyExpanded = hasAnyExpanded(tree);
  const label = anyExpanded ? 'Collapse items' : 'Expand all items';
  return h('button.nav-toolbar__btn', {
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      ...(_reorderMode ? { 'aria-disabled': 'true' } : {}),
    },
    on: _reorderMode ? {} : {
      click: () => {
        if (anyExpanded) collapseAllSections(tree); else expandAllSections();
        redraw();
      },
    },
  }, [navIcon(anyExpanded ? 'chevrons-down-up' : 'chevrons-up-down', { size: 16 })]);
}










function renderHiddenItemsToggleButton(redraw: () => void): VNode {
  const active = showHiddenItems();
  const label = active ? 'Hide hidden folders, tags, and notes' : 'Show hidden folders, tags, and notes';
  return h('button.nav-toolbar__btn', {
    class: { '--active': active },
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      'aria-pressed': String(active),
    },
    on: {
      click: () => { toggleShowHidden(); redraw(); },
    },
  }, [navIcon('eye', { size: 16 })]);
}

/** The owner's "re-arrange button" (OD-5): toggles navigationPaneView.ts's reorder-mode render
 * (plumbed through `renderNavToolbar`'s caller below) via a plain module-level flag, the same
 * pattern `_settingsOpen`/`_newFolderMode` already use in this file. Entering reorder mode closes
 * an open new-folder input (belt-and-suspenders — the new-folder button itself is also disabled
 * below while reordering, so this should already be false, but a stale open input would otherwise
 * survive underneath the reorder panel with no visible affordance to commit/cancel it). */
function renderReorderToggleButton(redraw: () => void): VNode {
  const label = _reorderMode ? 'Done reordering' : 'Reorder navigation';
  return h('button.nav-toolbar__btn', {
    class: { '--active': _reorderMode },
    attrs: {
      type: 'button',
      title: label,
      'aria-label': label,
      'aria-pressed': String(_reorderMode),
    },
    on: {
      click: () => {
        _reorderMode = !_reorderMode;
        if (_reorderMode) { _newFolderMode = false; _newFolderValue = ''; }
        redraw();
      },
    },
  }, [navIcon('list-tree', { size: 16 })]);
}






function selectionSectionId(selection: NavigatorSelection): StudySectionId | null {
  return selection.kind === 'section' || selection.kind === 'folder' ? selection.sectionId : null;
}

/** Whether the current selection can parent a new folder (a section or a folder only — neither a
 * lens nor a tag, T5 Wave A6c, has a folder tree to parent one under). */
function canParentNewFolder(selection: NavigatorSelection): boolean {
  return selection.kind === 'section' || selection.kind === 'folder';
}

/** `createFolder`'s existing signature returns `Promise<void>` (studyCtrl.ts is a no-touch,
 * exports-only file this slice does not edit to add a return value) — so the newly created
 * folder's id is recovered by reading `folders()` right after the awaited call resolves.
 * `createFolder` always appends the new record (`_folders = [..._folders, folder]`), so the last
 * element of the post-create array is always the just-created folder; the `name` check below is a
 * defensive sanity assertion, not the actual lookup mechanism. */
async function commitNewFolder(selection: NavigatorSelection, redraw: () => void): Promise<void> {
  const name = _newFolderValue.trim();
  _newFolderMode = false;
  _newFolderValue = '';
  const sectionId = selectionSectionId(selection);
  if (!name || sectionId === null) {
    redraw();
    return;
  }
  const parentId = selection.kind === 'folder' ? selection.folderId : undefined;
  await createFolder(name, parentId);
  const all = folders();
  const created = all.length > 0 ? all[all.length - 1] : undefined;
  if (created && created.name === name) {
    _selection = { kind: 'folder', sectionId, folderId: created.id };
    setActiveFolderId(created.id);
  }
  redraw();
}

function renderNavToolbar(redraw: () => void, selection: NavigatorSelection, tree: StudyNavigationTree): VNode {
  if (_newFolderMode) {
    return h('div.nav-toolbar', { attrs: { role: 'toolbar', 'aria-label': 'Navigation actions' } }, [
      h('input.nav-toolbar__new-folder-input', {
        attrs: { type: 'text', placeholder: 'Folder name…', value: _newFolderValue },
        hook: { insert: vn => (vn.elm as HTMLInputElement).focus() },
        on: {
          input: (e: Event) => { _newFolderValue = (e.target as HTMLInputElement).value; },
          blur: () => { void commitNewFolder(selection, redraw); },
          keydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { _newFolderMode = false; _newFolderValue = ''; redraw(); }
          },
        },
      }),
    ]);
  }
  // New folder is also disabled while reorder mode is active (matching the expand/collapse-all
  // button just above it) — reorder mode replaces the tree entirely, so there is no rendered
  // section/folder row to parent a new folder under until the user exits.
  const canCreate = canParentNewFolder(selection) && !_reorderMode;
  return h('div.nav-toolbar', { attrs: { role: 'toolbar', 'aria-label': 'Navigation actions' } }, [
    renderExpandCollapseAllButton(redraw, tree),
    renderHiddenItemsToggleButton(redraw),
    renderReorderToggleButton(redraw),
    h('button.nav-toolbar__btn', {
      attrs: {
        type: 'button',
        title: canCreate ? 'New folder' : 'Select a section or folder to add a new folder',
        'aria-label': 'New folder',
        ...(canCreate ? {} : { 'aria-disabled': 'true' }),
      },
      on: canCreate ? { click: () => { _newFolderMode = true; _newFolderValue = ''; redraw(); } } : {},
    }, [navIcon('folder-plus', { size: 16 })]),
  ]);
}









let _itemSearchOpen = false;
let _sortMenuOpen = false;
let _importMenuOpen = false;
let _includeDescendants = false;

function renderSearchButton(redraw: () => void): VNode {
  return h('button.item-toolbar__btn', {
    class: { '--active': _itemSearchOpen },
    attrs: {
      type: 'button', title: 'Search', 'aria-label': 'Search', 'aria-expanded': String(_itemSearchOpen),
    },
    on: {
      click: () => {
        _itemSearchOpen = !_itemSearchOpen;
        // Closing the toggle clears the query rather than leaving an invisible active filter
        // silently narrowing the list with no visible control showing why (there is no other
        // "clear search" affordance in this slice).
        if (!_itemSearchOpen) setSearch('');
        redraw();
      },
    },
  }, [navIcon('search', { size: 16 })]);
}

function renderSearchInputRow(redraw: () => void): VNode {
  return h('div.item-toolbar__search-row', [
    h('input.item-toolbar__search-input', {
      attrs: { type: 'text', placeholder: 'Search games…', value: searchQuery() },
      hook: { insert: vn => (vn.elm as HTMLInputElement).focus() },
      on: {
        input: (e: Event) => { setSearch((e.target as HTMLInputElement).value); redraw(); },
        keydown: (e: KeyboardEvent) => {
          if (e.key === 'Escape') { _itemSearchOpen = false; setSearch(''); redraw(); }
        },
      },
    }),
  ]);
}

function renderDescendantsButton(redraw: () => void): VNode {
  return h('button.item-toolbar__btn', {
    class: { '--active': _includeDescendants },
    attrs: {
      type: 'button',
      title: 'Show games from subfolders',
      'aria-label': 'Show games from subfolders',
      'aria-pressed': String(_includeDescendants),
    },
    on: { click: () => { _includeDescendants = !_includeDescendants; redraw(); } },
  }, [navIcon('layers', { size: 16 })]);
}

// Field rows for the sort menu (inventory §2's "Date edited/Date created/Title" rows, narrowed to
// Patzer's actual three StudySortKey values). Field icons reuse NN's own mapping 1:1 where a
// Patzer field matches an NN one: created -> `calendar-plus`, modified -> `calendar-clock`,
// title -> `type`; NN's fourth field (filename -> `file-text`) has no Patzer analog (StudyItem has
// no filename), so it is not offered.
const SORT_FIELDS: ReadonlyArray<{ key: StudySortKey; label: string; icon: NavIconName }> = [
  { key: 'createdAt', label: 'Date saved', icon: 'calendar-plus' },
  { key: 'updatedAt', label: 'Last modified', icon: 'calendar-clock' },
  { key: 'title', label: 'Title', icon: 'type' },
];

// Patzer's one global sort default (studyCtrl.ts's own `_sortKey`/`_sortDir` initial values) is
// the analog of NN's per-folder "default sort" — the one config nothing has overridden yet.
const DEFAULT_SORT_KEY: StudySortKey = 'createdAt';

/** The toolbar button's OWN icon mirrors NN's real sort-icon logic (inventory §2): while the
 * FIELD is still Patzer's own default (`createdAt` — direction may still vary), show a generic
 * direction glyph (`sort-asc`/`sort-desc`, i.e. this file's own aliases for
 * `arrow-up-narrow-wide`/`arrow-down-wide-narrow`) rather than naming the field, exactly matching
 * R4's own reference screenshot (a plain arrow, not a calendar icon, at rest); once the FIELD is
 * overridden away from that default, the button switches to that field's own icon so it's clear
 * which field is now driving sort. */
function sortButtonIcon(): NavIconNameOrAlias {
  if (sortKey() === DEFAULT_SORT_KEY) return sortDir() === 'asc' ? 'sort-asc' : 'sort-desc';
  return SORT_FIELDS.find(f => f.key === sortKey())?.icon ?? 'arrow-up-down';
}

function renderSortButton(redraw: () => void): VNode {
  return h('button.item-toolbar__btn', {
    class: { '--active': _sortMenuOpen },
    attrs: {
      type: 'button', title: 'Change sort', 'aria-label': 'Change sort', 'aria-expanded': String(_sortMenuOpen),
    },
    on: { click: () => { _sortMenuOpen = !_sortMenuOpen; redraw(); } },
  }, [navIcon(sortButtonIcon(), { size: 16 })]);
}

/** NN-shaped sort menu (inventory §2's "Sort & Group" popover): disabled "Sort by" header, field
 * rows with check state, a separator, then Ascending/Descending rows with check state. NN's
 * manual-sort row, "Edit sort order...", "Remove sort property", and the entire "Group by" section
 * are DEFERRED (no Patzer manual-sort or grouping model exists yet) — disclosed, not silently
 * dropped. No vendored Lucide "check" glyph exists in the ISC set this slice transcribes from, so
 * check state uses a plain "✓" text glyph, consistent with this codebase's existing use of plain
 * unicode accents elsewhere (e.g. libraryView.ts's own ✎/× folder-action glyphs). */
function renderSortMenu(redraw: () => void): VNode | null {
  if (!_sortMenuOpen) return null;
  const closeAnd = (fn: () => void) => () => { fn(); _sortMenuOpen = false; redraw(); };
  return h('div.nav-menu.item-toolbar__sort-menu', { attrs: { role: 'menu', 'aria-label': 'Sort and group' } }, [
    h('div.nav-menu__header', { attrs: { role: 'presentation', 'aria-disabled': 'true' } }, [
      navIcon('arrow-up-down', { size: 14 }),
      h('span', 'Sort by'),
    ]),
    h('div.nav-menu__sep'),
    ...SORT_FIELDS.map(field => h('button.nav-menu__item', {
      key: field.key,
      attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(sortKey() === field.key) },
      on: { click: closeAnd(() => setSortKey(field.key)) },
    }, [
      h('span.nav-menu__check', sortKey() === field.key ? '✓' : ''),
      navIcon(field.icon, { size: 14 }),
      h('span', field.label),
    ])),
    h('div.nav-menu__sep'),
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(sortDir() === 'asc') },
      on: { click: closeAnd(() => setSortDir('asc')) },
    }, [h('span.nav-menu__check', sortDir() === 'asc' ? '✓' : ''), h('span', 'Ascending')]),
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(sortDir() === 'desc') },
      on: { click: closeAnd(() => setSortDir('desc')) },
    }, [h('span.nav-menu__check', sortDir() === 'desc' ? '✓' : ''), h('span', 'Descending')]),
  ]);
}

function renderAppearanceButton(redraw: () => void): VNode {
  // Carries BOTH `.item-toolbar__btn` (this slice's new toolbar styling) and the ORIGINAL
  // `.nav-settings-trigger` class (see the T5-D08 comment block above for why the old class stays).
  return h('button.item-toolbar__btn.nav-settings-trigger', {
    class: { '--active': _settingsOpen },
    attrs: {
      type: 'button', title: 'Appearance', 'aria-label': 'Appearance', 'aria-expanded': String(_settingsOpen),
    },
    on: { click: () => { _settingsOpen = !_settingsOpen; redraw(); } },
  }, [navIcon('palette', { size: 16 })]);
}

function renderNewNoteButton(redraw: () => void): VNode {
  return h('button.item-toolbar__btn', {
    class: { '--active': _importMenuOpen },
    attrs: {
      type: 'button', title: 'New game entry', 'aria-label': 'New game entry', 'aria-expanded': String(_importMenuOpen),
    },
    on: { click: () => { _importMenuOpen = !_importMenuOpen; redraw(); } },
  }, [navIcon('square-pen', { size: 16 })]);
}























function renderImportMenu(redraw: () => void, onImportPgnClick: () => void): VNode | null {
  if (!_importMenuOpen) return null;
  const closeAnd = (fn: () => void) => () => { fn(); _importMenuOpen = false; redraw(); };
  return h('div.nav-menu.item-toolbar__import-menu', { attrs: { role: 'menu', 'aria-label': 'New game entry' } }, [
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitem' },
      on: { click: closeAnd(onImportPgnClick) },
    }, [navIcon('file-plus', { size: 14 }), h('span', 'Import PGN')]),
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitem' },
      on: { click: closeAnd(() => { writeHashRoute('#/editor'); }) },
    }, [navIcon('external-link', { size: 14 }), h('span', 'Paste FEN / position')]),
  ]);
}

function renderItemListToolbar(redraw: () => void, onImportPgnClick: () => void): VNode {
  return h('div.item-toolbar', { attrs: { role: 'toolbar', 'aria-label': 'Item list actions' } }, [
    renderSearchButton(redraw),
    renderDescendantsButton(redraw),
    h('div.item-toolbar__group', [renderSortButton(redraw), renderSortMenu(redraw)]),
    renderAppearanceButton(redraw),
    h('div.item-toolbar__group', [renderNewNoteButton(redraw), renderImportMenu(redraw, onImportPgnClick)]),
  ]);
}




















/** Chevron + single-segment breadcrumb sitting above the item-list toolbar, ONLY in `--game-open`
 * mode. The chevron re-expands the nav pane and returns to State 1 as-is (no forced selection
 * change) — the breadcrumb, when a real folder/section scope was resolved, jumps to State 1
 * scoped to that folder/section (`exitToFolder`). A full multi-level breadcrumb PATH (the R2
 * mockup's `08-Development / PatzerPro / ...`) is explicitly out of this slice's scope — this is
 * the one segment needed for exit affordance (c). */
function renderGameOpenItemListHeader(scopeLabel: string | null, exitPlain: () => void, exitToFolder: () => void): VNode {
  return h('div.lib-game-open-header', [
    h('button.lib-game-open-header__chevron', {
      attrs: { type: 'button', title: 'Back to Library', 'aria-label': 'Back to Library' },
      on: { click: exitPlain },
    }, [navIcon('chevron-left', { size: 16 })]),
    scopeLabel
      ? h('button.lib-game-open-header__breadcrumb', {
          attrs: { type: 'button', title: `Back to ${scopeLabel}`, 'aria-label': `Back to ${scopeLabel}` },
          on: { click: exitToFolder },
        }, scopeLabel)
      : null,
  ]);
}

/** Text-entry guard duplicated (not imported) from navigatorKeyboard.ts's own `isTextEntryTarget`
 * — that file is outside this slice's edit fence, and this is a 3-line, self-contained check, not
 * shared stateful logic, so a small disclosed duplication is preferable to widening the fence. */
function isGameOpenEscapeTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as { tagName?: string; isContentEditable?: boolean } | null;
  if (!el) return false;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return true;
  return el.isContentEditable === true;
}

/** `Escape` exit affordance (states-design §1: "Escape steps back one state, State 2 -> State
 * 1"). Mirrors `bindNavigatorKeyboard`'s own established shape (`navigatorKeyboard.ts`): ONE
 * idempotent document-level listener, route-gated (`study-detail` only, so this stays inert
 * everywhere else including plain `study`, which already has its own D10 handler), refreshed via a
 * module-level callback re-armed on every `--game-open` render rather than re-attaching a new
 * listener each time. */
let _gameOpenExit: (() => void) | null = null;
let _gameOpenEscapeBound = false;

function armGameOpenEscape(onExit: () => void): void {
  _gameOpenExit = onExit;
  if (_gameOpenEscapeBound) return;
  _gameOpenEscapeBound = true;
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (current().name !== 'study-detail') return;
    if (isGameOpenEscapeTextEntryTarget(event.target)) return;
    _gameOpenExit?.();
  });
}














export type StudyToolTabId = 'comments' | 'questionnaire' | 'organize' | 'orp';

const STUDY_TOOL_TABS: ReadonlyArray<{ id: StudyToolTabId; label: string }> = [
  { id: 'comments', label: 'Comments' },
  { id: 'questionnaire', label: 'Questionnaire' },
  { id: 'organize', label: 'Organize' },
  { id: 'orp', label: 'ORP' },
];

export function normalizeStudyToolTab(value: string | undefined): StudyToolTabId {
  return STUDY_TOOL_TABS.some(tab => tab.id === value) ? (value as StudyToolTabId) : 'comments';
}




const STUDY_TOOL_TAB_PLACEHOLDER: Readonly<Record<StudyToolTabId, string>> = {
  comments:      'Move-tree comments — coming soon.',
  questionnaire: 'Questionnaire answers — coming soon.',
  organize:      'Title / Organize / Assign to Study — coming soon.',
  orp:           'ORP flag — coming soon.',
};

function renderStudyToolsColumn(opts: GameOpenShellOptions): VNode {
  return h('div.study-tools-col__back-wrap', [
    h('button.study-tools-col__back', {
      attrs: { type: 'button', title: 'Back to game list', 'aria-label': 'Back to game list' },
      on: { click: opts.onCloseTools },
    }, [navIcon('chevron-left', { size: 16 }), h('span', 'Back to game list')]),
    h('div.study-tools-col__tabs', { attrs: { role: 'tablist', 'aria-label': 'Study tools' } },
      STUDY_TOOL_TABS.map(tab => h('button.study-tools-col__tab', {
        key: tab.id,
        class: { '--active': tab.id === opts.activeToolTab },
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': String(tab.id === opts.activeToolTab),
        },
        on: { click: () => opts.onSelectToolTab(tab.id) },
      }, tab.label))),
    opts.toolPanelContent ?? h('div.study-tools-col__placeholder', STUDY_TOOL_TAB_PLACEHOLDER[opts.activeToolTab]),
  ]);
}

export interface GameOpenShellOptions {
  /** The `StudyItem.id` currently open on the board — drives the item-list rescope. */
  openItemId: string;
  /** The main-region content to mount in the freed nav-pane width — `studyDetailView.ts`'s
   * `renderStudyDetail` output, unchanged board mount, per this slice's fence. */
  mainContent: VNode;





  toolsOpen: boolean;
  /** Active tool-tab id when `toolsOpen` — route `toolTab`, default `comments`. */
  activeToolTab: StudyToolTabId;






  toolPanelContent?: VNode;
  /** Clears `tools` → State 2. Wired to the tools column's "Back to game list" affordance AND
   * (below) State 3's first Escape step. */
  onCloseTools: () => void;
  /** Writes `toolTab` (and ensures `tools=1`) for the clicked tab. */
  onSelectToolTab: (tab: StudyToolTabId) => void;
}
















function renderGameOpenShell(
  tree: StudyNavigationTree,
  allItems: readonly StudyItem[],
  redraw: () => void,
  onImportPgnClick: () => void,
  opts: GameOpenShellOptions,
): VNode {
  const scope = resolveGameOpenScope(tree, allItems, opts.openItemId);

  const exitPlain = () => { writeHashRoute('#/study'); };
  const exitToFolder = () => {
    if (scope) {
      _selection = scope.folderId
        ? { kind: 'folder', sectionId: scope.sectionId, folderId: scope.folderId }
        : { kind: 'section', sectionId: scope.sectionId };
      setActiveFolderId(scope.folderId);
    }
    writeHashRoute('#/study');
  };
  // State 3's first Escape step closes tools (→ State 2); State 2's own second step (this same
  // exitPlain, re-armed once toolsOpen is false on the next render) is unchanged.
  armGameOpenEscape(opts.toolsOpen ? opts.onCloseTools : exitPlain);

  // Item-list pane is only built when it will actually be shown (State 2) — skipping
  // `renderItemListPane` while the tools column is open avoids rendering a hidden pane's rows for
  // no visible benefit (CR-3/CR-4); none of the module-level list state (search/sort/divider
  // width) is read or mutated by skipping this, so State 2's own list is unchanged when the user
  // returns via "Back to game list". State 2's children stay a flat array directly under
  // `.lib-items-wrap` (unchanged DOM shape from before this slice); State 3 swaps in the single
  // study-tools-column vnode instead.
  const itemListWrapChildren: Array<VNode | null> = opts.toolsOpen
    ? [renderStudyToolsColumn(opts)]
    : (() => {
        const byId = new Map(allItems.map(item => [item.id, item] as const));
        const rawItems = scope
          ? resolveItems(scope.itemIds, byId)
          : (byId.has(opts.openItemId) ? [byId.get(opts.openItemId)!] : []);
        const items = queryStudyItems(rawItems, { folderScope: 'already-resolved' });




        const itemListPane = renderItemListPane(items, 'compact', redraw, undefined, scope?.folderId ?? null);
        return [
          renderGameOpenItemListHeader(scope?.label ?? null, exitPlain, exitToFolder),
          renderItemListToolbar(redraw, onImportPgnClick),
          _itemSearchOpen ? renderSearchInputRow(redraw) : null,
          _settingsOpen ? renderNavigatorAppearanceSettings(redraw) : null,
          itemListPane,
        ];
      })();

  return h('div.lib-shell.lib-shell--game-open', {
    attrs: { style: _itemListDivider.styleDeclaration() },
  }, [
    renderRail(),
    h('div.lib-items-wrap', {
      class: { 'lib-items-wrap--tools': opts.toolsOpen },
      on: {
        click: () => setFocusedPane('list'),
        focusin: () => setFocusedPane('list'),
      },
    }, itemListWrapChildren),
    renderDivider(redraw, _itemListDivider),
    h('div.lib-main-region', [opts.mainContent]),
  ]);
}















export function renderNavigatorShell(
  tree: StudyNavigationTree,
  allItems: readonly StudyItem[],
  redraw: () => void,
  onImportPgnClick: () => void,
  gameOpen?: GameOpenShellOptions,
): VNode {
  // Apply-on-mount + apply-on-every-render (T5-D08): cheap and idempotent (a handful of
  // `document.body.style.setProperty` calls), so re-running it on every redraw — including the
  // very first, i.e. "mount" — is simpler and safer than tracking a separate one-shot mount flag.
  applyNavigatorSettings();

  if (gameOpen) return renderGameOpenShell(tree, allItems, redraw, onImportPgnClick, gameOpen);

  if (_selection === null) _selection = defaultSelection();

  const keyIndex = buildSelectionIndex(tree, allItems);
  const activeKey = selectionKey(_selection);
  const onSelect = (selection: NavigatorSelection): void => {
    _selection = selection;
    setActiveFolderId(selection.kind === 'folder' ? selection.folderId : null);
    redraw();
  };

  const navPane = renderNavigationPane(tree, redraw, allItems, SYSTEM_LENSES, _reorderMode);








  const navVisibleOrder = _reorderMode ? [] : wireSelectionHandlers(navPane, keyIndex, activeKey, onSelect);

  const byId = new Map(allItems.map(item => [item.id, item] as const));






  const selection = _selection;





  const rawItems = selection.kind === 'tag'
    ? allItems.filter(item => item.tags.includes(selection.tagName))
    : selection.kind === 'lens'
      ? resolveLensItems(selection.lensId, allItems)
      : resolveItems(resolveSelectedItemIds(tree, selection, _includeDescendants), byId);
  // The shared Study query narrows and sorts the already-resolved navigator scope.
  // `renderGroupedRows` preserves that order; `renderItemListPane` only partitions pinned rows to
  // the top while retaining relative query order inside each partition.
  const items = queryStudyItems(rawItems);







  const currentFolderId = _selection.kind === 'folder' ? _selection.folderId : null;
  const itemListPane = renderItemListPane(items, ITEM_LIST_DENSITY, redraw, undefined, currentFolderId);
  // See collectItemRowOrder's own comment: capture the true pinned-first on-screen order rather
  // than assuming it is always a 1:1 copy of the shared query array.
  const itemDisplayOrder = collectItemRowOrder(itemListPane, new Set(items.map(item => item.id)));








  bindNavigatorKeyboard({
    listDisplayedIds: () => itemDisplayOrder,
    navDisplayedKeys: () => navVisibleOrder,
    navSelectedKey: () => activeKey,
    selectNavKey: (key: string) => {
      const selection = keyIndex.get(key);
      if (selection) onSelect(selection);
    },
    navIsExpandable: (key: string) => findNavRowElement(key)?.hasAttribute('aria-expanded') ?? false,
    navIsExpanded: (key: string) => findNavRowElement(key)?.getAttribute('aria-expanded') === 'true',
    toggleNavExpand: (key: string) => findNavRowElement(key)?.click(),
    pageScroll: (pane: FocusedPane, direction: 1 | -1) => {
      const el = document.querySelector<HTMLElement>(pane === 'navigation' ? '.lib-nav' : '.lib-items');
      if (el) el.scrollBy({ top: direction * Math.round(el.clientHeight * 0.9) });
    },
    redraw,
  });








  return h('div.lib-shell', {
    attrs: { style: _navDivider.styleDeclaration() },
  }, [
    renderRail(),
    h('div.lib-nav-wrap', {
      on: {
        click: () => setFocusedPane('navigation'),
        focusin: () => setFocusedPane('navigation'),
      },
    }, [
      renderNavToolbar(redraw, _selection, tree),
      navPane,
    ]),
    renderDivider(redraw),
    h('div.lib-items-wrap', {
      on: {
        click: () => setFocusedPane('list'),
        focusin: () => setFocusedPane('list'),
      },
    }, [
      renderItemListToolbar(redraw, onImportPgnClick),
      _itemSearchOpen ? renderSearchInputRow(redraw) : null,
      _settingsOpen ? renderNavigatorAppearanceSettings(redraw) : null,
      itemListPane,
    ]),
  ]);
}
