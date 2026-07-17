





















































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
import { applyNavigatorSettings } from './navigatorSettings';
import { requestAdvancedAppearance } from '../appearance/entryPoints';
import { navIcon, type NavIconName, type NavIconNameOrAlias } from './navIcons';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';
import { STUDY_DETAIL_PRACTICE_TOOL_TAB } from './detailRouteState';
import { showHiddenItems, toggleShowHidden } from './hiddenItems';
import {
  advAddedFrom,
  advAddedTo,
  advAnalysisStates,
  advDestinations,
  advModifiedFrom,
  advModifiedTo,
  advPlayers,
  advResults,
  advSources,
  advTags,
  advVisibility,
  bumpSelectionSurface,
  clearAdvancedSearch,
  createFolder,
  filterFav,
  folders,
  includeDescendants,
  navigatorFolderId,
  queryStudyItems,
  searchQuery,
  setActiveFolderId,
  setAdvAddedFrom,
  setAdvAddedTo,
  setAdvAnalysisStates,
  setAdvDestinations,
  setAdvModifiedFrom,
  setAdvModifiedTo,
  setAdvPlayers,
  setAdvResults,
  setAdvSources,
  setAdvTags,
  setAdvVisibility,
  setFilterFav,
  setIncludeDescendants,
  setNavigatorFolderId,
  setSearch,
  sortDir,
  setSortDir,
  sortKey,
  setSortKey,
  studyLibraryRouteSnapshot,
  studyTags,
  type StudyQueryOptions,
  type StudySortKey,
} from './studyCtrl';
import {
  serializeStudyRouteState,
  type StudyRouteAnalysisState,
  type StudyRouteDestination,
  type StudyRouteResult,
  type StudyRouteSource,
  type StudyRouteVisibility,
} from './routeState';
import { current, replaceHashRoute, writeHashRoute } from '../router';
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












function folderGroupsContainItem(
  groups: readonly StudyNavigationFolderGroup[],
  itemId: string,
): boolean {
  for (const group of groups) {
    if (group.itemIds.includes(itemId) || folderGroupsContainItem(group.children, itemId)) return true;
  }
  return false;
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
  const section = tree.sections.find(candidate =>
    candidate.unfiledItemIds.includes(openItemId) || folderGroupsContainItem(candidate.folders, openItemId)
  );
  if (!section) return null;
  if (homeFolderId === null) {
    if (!section.unfiledItemIds.includes(openItemId)) return null;
    return { sectionId: section.id, folderId: null, label: section.label, itemIds: section.unfiledItemIds };
  }
  const homeFolder = folders().find(folder => folder.id === homeFolderId);
  if (!homeFolder) return null;

  // The shared Study query plan is the folder-membership authority. Passing the loaded scope
  // through it includes both aliases (`folders`) and canonical-home-only records.
  return {
    sectionId: section.id,
    folderId: homeFolder.id,
    label: homeFolder.name,
    itemIds: allItems.map(item => item.id),
  };
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
      ...controlExplainerAttrs({ label: 'Resize navigation pane', description: 'Drag to change the width of the adjacent Study pane.' }),
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





















type RailSurface = {
  id: string;
  label: string;
  icon: NavIconName;
  active: boolean;
  disabled: boolean;
  /** Essential help text for the enabled control. */
  description: string;
  /** Essential disabled-reason (required by renderDisabledControlExplainer when `disabled`). */
  disabledReason: string;
  /** Single synchronous route-write callback for an enabled control (no SRS/session action). */
  onClick?: (() => void) | undefined;
};

/**
 * ORP V2 Package C, slice C2 — the rail becomes context-aware for the permanent Practice entry.
 * The `orp` "coming soon" placeholder is REPLACED by a stable `practice` surface (the `orp` TOOL
 * TAB in `STUDY_TOOL_TABS` below is a DIFFERENT authoring action and is intentionally kept). C2 is
 * pure navigation scaffolding: `onClick` only writes the route — no due queries, session builders,
 * scheduler, workspace mount, or C1 factory import (that is C3). Active state and enablement are
 * derived from the parsed detail route on every render, never a module-level boolean.
 */
interface RailContext {
  /** A Study detail workspace is open (game-open shell). Practice is enabled only then. */
  studyOpen: boolean;
  /** The Practice tool route is active (`toolsOpen && activeToolTab === 'practice'`). */
  practiceActive: boolean;
  /** Opens the Practice tool route for the current Study (writes tools=1&toolTab=practice). */
  onSelectPractice?: () => void;
  /** Returns to the ordinary Study detail surface by clearing the Practice tool route. */
  onLeavePractice?: () => void;
}

const DEFAULT_RAIL_CONTEXT: RailContext = { studyOpen: false, practiceActive: false };

function railSurfaces(ctx: RailContext): RailSurface[] {
  const { practiceActive } = ctx;
  return [
    {
      id: 'library',
      label: 'Library',
      icon: 'library',
      // When Practice is active the Library rail becomes the "return to Study detail" control and
      // is no longer the active surface; otherwise it is the current surface (existing behavior).
      active: !practiceActive,
      disabled: false,
      description: practiceActive
        ? 'Returns to the ordinary Study detail surface by clearing the Practice tool route.'
        : 'Shows the Study Library surface.',
      disabledReason: 'Library is coming soon.',
      onClick: practiceActive ? ctx.onLeavePractice : undefined,
    },
    { id: 'repertoire-builder', label: 'Repertoire Builder', icon: 'hammer', active: false, disabled: true, description: 'Repertoire Builder is coming soon.', disabledReason: 'Repertoire Builder is coming soon.' },
    { id: 'compliance-toolkit', label: 'Repertoire Compliance Toolkit', icon: 'shield-check', active: false, disabled: true, description: 'Repertoire Compliance Toolkit is coming soon.', disabledReason: 'Repertoire Compliance Toolkit is coming soon.' },
    {
      id: 'practice',
      label: 'Practice',
      icon: 'repeat',
      active: practiceActive,
      // Permanent entry: always present, but only usable when a Study workspace exists to host it.
      disabled: !ctx.studyOpen,
      description: 'Opens Practice tools for the current Study without starting a session.',
      disabledReason: 'Open a Study to use Practice.',
      onClick: ctx.studyOpen ? ctx.onSelectPractice : undefined,
    },
  ];
}

function renderRail(ctx: RailContext = DEFAULT_RAIL_CONTEXT): VNode {
  return h('div.lib-rail', { attrs: { role: 'toolbar', 'aria-label': 'Study Navigator tools', 'aria-orientation': 'vertical' } },
    railSurfaces(ctx).map(surface => surface.disabled
      ? renderDisabledControlExplainer(
          { label: surface.label, description: surface.disabledReason },
          h('button.lib-rail__btn', {
            key: `rail-${surface.id}`,
            attrs: { type: 'button', disabled: true },
          }, [navIcon(surface.icon, { size: 18, className: 'lib-rail__icon' })]),
        )
      : h('button.lib-rail__btn', {
          key: `rail-${surface.id}`,
          class: { '--active': surface.active },
          attrs: { type: 'button', 'aria-pressed': String(surface.active), ...iconControlExplainerAttrs({ label: surface.label, description: surface.description }) },
          on: surface.onClick ? { click: surface.onClick } : {},
        }, [navIcon(surface.icon, { size: 18, className: 'lib-rail__icon' })])),
  );
}





































let _newFolderMode = false;
let _newFolderValue = '';











let _reorderMode = false;

/** NN row-1 semantics: "toggles by whether anything is expanded" — `hasAnyExpanded(tree)` reads
 * navigationPaneView.ts's own existing `_collapsedIds` state (via its exported query), so this
 * button never owns a second copy of expansion state. Disabled (aria-disabled, matching this
 * shell's own convention elsewhere) while reorder mode is active — the reorder panel replaces the
 * normal tree entirely, so the shared disabled-control wrapper explains why it is unavailable. */
function renderExpandCollapseAllButton(redraw: () => void, tree: StudyNavigationTree): VNode {
  const anyExpanded = hasAnyExpanded(tree);
  const label = anyExpanded ? 'Collapse items' : 'Expand all items';
  const control = h('button.nav-toolbar__btn', {
    attrs: {
      type: 'button',
      ...iconControlExplainerAttrs({ label, description: `${anyExpanded ? 'Collapses' : 'Expands'} every Study navigation group.` }),
    },
    on: _reorderMode ? {} : {
      click: () => {
        if (anyExpanded) collapseAllSections(tree); else expandAllSections();
        redraw();
      },
    },
  }, [navIcon(anyExpanded ? 'chevrons-down-up' : 'chevrons-up-down', { size: 16 })]);
  return _reorderMode
    ? renderDisabledControlExplainer(
        { label, description: 'Finish reordering before changing navigation expansion.' },
        h('button.nav-toolbar__btn', { attrs: { type: 'button', disabled: true } }, [navIcon(anyExpanded ? 'chevrons-down-up' : 'chevrons-up-down', { size: 16 })]),
      )
    : control;
}










function renderHiddenItemsToggleButton(redraw: () => void): VNode {
  const active = showHiddenItems();
  const label = active ? 'Hide hidden folders, tags, and notes' : 'Show hidden folders, tags, and notes';
  return h('button.nav-toolbar__btn', {
    class: { '--active': active },
    attrs: {
      type: 'button',
      'aria-pressed': String(active),
      ...iconControlExplainerAttrs({ label, description: `${active ? 'Hides' : 'Shows'} hidden Study folders, tags, notes, and games.` }),
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
      'aria-pressed': String(_reorderMode),
      ...iconControlExplainerAttrs({ label, description: `${_reorderMode ? 'Finishes' : 'Starts'} navigation reordering mode.` }),
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
    setNavigatorFolderId(created.id);
  }
  redraw();
}

function renderNavToolbar(redraw: () => void, selection: NavigatorSelection, tree: StudyNavigationTree): VNode {
  if (_newFolderMode) {
    return h('div.nav-toolbar', { attrs: { role: 'toolbar', 'aria-label': 'Navigation actions' } }, [
      h('input.nav-toolbar__new-folder-input', {
        attrs: { type: 'text', placeholder: 'Folder name…', value: _newFolderValue, 'aria-label': 'New folder name', ...controlExplainerAttrs({ label: 'New folder name', description: 'Creates a folder under the selected Study section or folder.' }) },
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
    canCreate
      ? h('button.nav-toolbar__btn', {
          attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'New folder', description: 'Creates a folder under the current Study location.' }) },
          on: { click: () => { _newFolderMode = true; _newFolderValue = ''; redraw(); } },
        }, [navIcon('folder-plus', { size: 16 })])
      : renderDisabledControlExplainer(
          { label: 'New folder', description: _reorderMode ? 'Finish reordering before creating a folder.' : 'Select a section or folder before creating a folder.' },
          h('button.nav-toolbar__btn', { attrs: { type: 'button', disabled: true } }, [navIcon('folder-plus', { size: 16 })]),
        ),
  ]);
}









let _itemSearchOpen = false;
let _sortMenuOpen = false;
let _importMenuOpen = false;













function writeLibraryRouteState(): void {
  if (current().name !== 'study') return;
  replaceHashRoute(serializeStudyRouteState(studyLibraryRouteSnapshot()));
}

function renderSearchButton(redraw: () => void): VNode {
  return h('button.item-toolbar__btn', {
    class: { '--active': _itemSearchOpen },
    attrs: {
      type: 'button', 'aria-expanded': String(_itemSearchOpen), ...iconControlExplainerAttrs({ label: 'Search', description: `${_itemSearchOpen ? 'Closes' : 'Opens'} the Study game search field.` }),
    },
    on: {
      click: () => {
        _itemSearchOpen = !_itemSearchOpen;




        if (!_itemSearchOpen) { setSearch(''); _advancedSearchOpen = false; writeLibraryRouteState(); }
        redraw();
      },
    },
  }, [navIcon('search', { size: 16 })]);
}




function renderSearchInputRow(redraw: () => void, withAdvancedToggle: boolean): VNode {
  return h('div.item-toolbar__search-row', [
    h('input.item-toolbar__search-input', {
      attrs: { type: 'text', placeholder: 'Search games…', value: searchQuery(), 'aria-label': 'Search Study games', ...controlExplainerAttrs({ label: 'Search Study games', description: 'Filters the current Study list as you type.' }) },
      hook: { insert: vn => (vn.elm as HTMLInputElement).focus() },
      on: {
        input: (e: Event) => { setSearch((e.target as HTMLInputElement).value); writeLibraryRouteState(); redraw(); },
        keydown: (e: KeyboardEvent) => {
          // Escape closes the search row; also close the advanced panel whose toggle lives here.
          if (e.key === 'Escape') { _itemSearchOpen = false; _advancedSearchOpen = false; setSearch(''); writeLibraryRouteState(); redraw(); }
        },
      },
    }),
    withAdvancedToggle ? renderAdvancedSearchButton(redraw) : null,
  ]);
}

function renderDescendantsButton(redraw: () => void): VNode {





  const active = includeDescendants();
  return h('button.item-toolbar__btn', {
    class: { '--active': active },
    attrs: {
      type: 'button',
      'aria-pressed': String(active),
      ...iconControlExplainerAttrs({ label: 'Show games from subfolders', description: `${active ? 'Stops including' : 'Includes'} games from descendant folders in this list.` }),
    },
    on: { click: () => { setIncludeDescendants(!active); redraw(); } },
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
      type: 'button', 'aria-expanded': String(_sortMenuOpen), ...iconControlExplainerAttrs({ label: 'Change sort', description: 'Opens the Study sort field and direction menu.' }),
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
  // Every action in this menu mutates sort (setSortKey/setSortDir), so the route write-back belongs
  // in the shared wrapper — closing over sort edits live to the address bar (design §2.2).
  const closeAnd = (fn: () => void) => () => { fn(); writeLibraryRouteState(); _sortMenuOpen = false; redraw(); };
  return h('div.nav-menu.item-toolbar__sort-menu', { attrs: { role: 'menu', 'aria-label': 'Sort and group', ...controlExplainerAttrs({ label: 'Sort and group menu' }) } }, [
    h('div.nav-menu__header', { attrs: { role: 'presentation', 'aria-disabled': 'true' } }, [
      navIcon('arrow-up-down', { size: 14 }),
      h('span', 'Sort by'),
    ]),
    h('div.nav-menu__sep'),
    ...SORT_FIELDS.map(field => h('button.nav-menu__item', {
      key: field.key,
      attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(sortKey() === field.key), ...controlExplainerAttrs({ label: `Sort by ${field.label}`, description: `Uses ${field.label.toLowerCase()} to order Study games.` }) },
      on: { click: closeAnd(() => setSortKey(field.key)) },
    }, [
      h('span.nav-menu__check', sortKey() === field.key ? '✓' : ''),
      navIcon(field.icon, { size: 14 }),
      h('span', field.label),
    ])),
    h('div.nav-menu__sep'),
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(sortDir() === 'asc'), ...controlExplainerAttrs({ label: 'Sort ascending', description: 'Orders Study games in ascending order.' }) },
      on: { click: closeAnd(() => setSortDir('asc')) },
    }, [h('span.nav-menu__check', sortDir() === 'asc' ? '✓' : ''), h('span', 'Ascending')]),
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitemradio', 'aria-checked': String(sortDir() === 'desc'), ...controlExplainerAttrs({ label: 'Sort descending', description: 'Orders Study games in descending order.' }) },
      on: { click: closeAnd(() => setSortDir('desc')) },
    }, [h('span.nav-menu__check', sortDir() === 'desc' ? '✓' : ''), h('span', 'Descending')]),
  ]);
}

function renderAppearanceButton(_redraw: () => void): VNode {
  // Carries BOTH `.item-toolbar__btn` (this slice's new toolbar styling) and the ORIGINAL
  // `.nav-settings-trigger` class (see the T5-D08 comment block above for why the old class stays).
  return h('button.item-toolbar__btn.nav-settings-trigger', {
    attrs: {
      type: 'button', ...iconControlExplainerAttrs({ label: 'Appearance', description: 'Open Study Navigator settings in Advanced Appearance.' }),
    },
    on: { click: (event: Event) => requestAdvancedAppearance('graphs-lists', event.currentTarget as HTMLElement) },
  }, [navIcon('palette', { size: 16 })]);
}

function renderNewNoteButton(redraw: () => void): VNode {
  return h('button.item-toolbar__btn', {
    class: { '--active': _importMenuOpen },
    attrs: {
      type: 'button', 'aria-expanded': String(_importMenuOpen), ...iconControlExplainerAttrs({ label: 'New game entry', description: 'Opens options to import a game or position.' }),
    },
    on: { click: () => { _importMenuOpen = !_importMenuOpen; redraw(); } },
  }, [navIcon('square-pen', { size: 16 })]);
}























function renderImportMenu(redraw: () => void, onImportPgnClick: () => void): VNode | null {
  if (!_importMenuOpen) return null;
  const closeAnd = (fn: () => void) => () => { fn(); _importMenuOpen = false; redraw(); };
  return h('div.nav-menu.item-toolbar__import-menu', { attrs: { role: 'menu', 'aria-label': 'New game entry', ...controlExplainerAttrs({ label: 'New game entry menu' }) } }, [
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitem', ...controlExplainerAttrs({ label: 'Import PGN', description: 'Opens the Study PGN import dialog.' }) },
      on: { click: closeAnd(onImportPgnClick) },
    }, [navIcon('file-plus', { size: 14 }), h('span', 'Import PGN')]),
    h('button.nav-menu__item', {
      attrs: { type: 'button', role: 'menuitem', ...controlExplainerAttrs({ label: 'Paste FEN or position', description: 'Opens the board editor to enter a position.' }) },
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










































let _advancedSearchOpen = false;

const ADV_SOURCE_OPTIONS: ReadonlyArray<{ value: StudyRouteSource; label: string }> = [
  { value: 'analysis', label: 'Analysis' },
  { value: 'openings', label: 'Openings' },
  { value: 'puzzles', label: 'Puzzles' },
  { value: 'manual', label: 'Manual' },
  { value: 'import', label: 'Import' },
];
// Raw PGN outcome, NOT owner-color Win/Loss (§3.3 / §8.3 ratified). "Unknown" = the landed
// absence sentinel (slice 2 maps it to RESULT_ABSENT_FACET_VALUE).
const ADV_RESULT_OPTIONS: ReadonlyArray<{ value: StudyRouteResult; label: string }> = [
  { value: 'white', label: 'White won' },
  { value: 'black', label: 'Black won' },
  { value: 'draw', label: 'Draw' },
  { value: 'unknown', label: 'Unknown' },
];





const ADV_ANALYSIS_OPTIONS: ReadonlyArray<{ value: StudyRouteAnalysisState; label: string }> = [
  { value: 'analyzed', label: 'Analyzed' },
  { value: 'not-analyzed', label: 'Not analyzed' },


  { value: 'no-game', label: 'No game' },
];
// Display labels mirror SAVE_FLOW_GAME_DESTINATIONS (src/save/saveFlowCtrl.ts) plus the synthetic
// Unsorted bucket for `uncategorized` (slice 2 maps that to DESTINATION_UNSORTED_FACET_VALUE).
const ADV_DEST_OPTIONS: ReadonlyArray<{ value: StudyRouteDestination; label: string }> = [
  { value: 'played', label: 'My Played Games' },
  { value: 'masters', label: 'Masters Game Study' },
  { value: 'repertoire', label: 'Repertoire Library' },
  { value: 'prep', label: 'Opponent Prep' },
  { value: 'uncategorized', label: 'Unsorted' },
];
// Tri-state hidden-item visibility (§4). Selecting the active option again clears it back to unset,
// which returns control to the plain eye toggle (slice 2's plan falls back to showHiddenItems()).
const ADV_VIS_OPTIONS: ReadonlyArray<{ value: StudyRouteVisibility; label: string }> = [
  { value: 'exclude', label: 'Visible only' },
  { value: 'include', label: 'Include hidden' },
  { value: 'only', label: 'Hidden only' },
];

function advLabelOf<T extends string>(options: ReadonlyArray<{ value: T; label: string }>, value: T): string {
  return options.find(option => option.value === value)?.label ?? value;
}

/** True when any advanced facet (or the panel-hosted favorite toggle) is currently active. */
function advancedFilterActive(): boolean {
  return Boolean(
    advSources()?.length || advTags()?.length || advPlayers()
    || advResults()?.length || advDestinations()?.length || advAnalysisStates()?.length
    || advAddedFrom() || advAddedTo() || advModifiedFrom() || advModifiedTo()
    || advVisibility() || filterFav(),
  );
}

/** Shared post-mutation commit — mirrors the q/sort controls exactly (the setter already ran). */
function commitAdvancedEdit(redraw: () => void): void {
  writeLibraryRouteState();
  redraw();
}

/** Toggle a value into/out of a multi-select array, order-stable via a Set. */
function toggleAdvValue<T>(current: readonly T[] | undefined, value: T): T[] {
  const next = new Set(current ?? []);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next];
}

function advDateRangeLabel(from: string | undefined, to: string | undefined): string {
  if (from && to) return `${from} – ${to}`;
  if (from) return `since ${from}`;
  return `until ${to}`;
}

function renderAdvMultiChips<T extends string>(
  ariaGroupLabel: string,
  options: ReadonlyArray<{ value: T; label: string }>,
  selected: readonly T[] | undefined,
  onToggle: (value: T) => void,
): VNode {
  const active = new Set(selected ?? []);
  return h('div.item-adv__chip-row', { attrs: { role: 'group', 'aria-label': ariaGroupLabel } },
    options.map(option => h('button.item-adv__chip', {
      key: option.value,
      class: { '--active': active.has(option.value) },
      attrs: { type: 'button', 'aria-pressed': String(active.has(option.value)), ...controlExplainerAttrs({ label: `${active.has(option.value) ? 'Remove' : 'Add'} ${option.label} filter`, description: `${active.has(option.value) ? 'Removes' : 'Adds'} this ${ariaGroupLabel.toLowerCase()} filter.` }) },
      on: { click: () => onToggle(option.value) },
    }, option.label)),
  );
}

function renderAdvTagChips(redraw: () => void): VNode {
  const active = new Set(advTags() ?? []);
  // Union of the library's existing tags with any currently-active advanced tags (so a still-active
  // tag whose last item was removed stays selectable to clear it).
  const tagNames = [...new Set([...studyTags(), ...(advTags() ?? [])])];
  return h('div.item-adv__chip-row', { attrs: { role: 'group', 'aria-label': 'Tags' } },
    tagNames.map(tag => h('button.item-adv__chip', {
      key: tag,
      class: { '--active': active.has(tag) },
      attrs: { type: 'button', 'aria-pressed': String(active.has(tag)), ...controlExplainerAttrs({ label: `${active.has(tag) ? 'Remove' : 'Add'} ${tag} tag filter`, description: `${active.has(tag) ? 'Removes' : 'Adds'} this tag filter.` }) },
      on: { click: () => { setAdvTags(toggleAdvValue(advTags(), tag)); commitAdvancedEdit(redraw); } },
    }, tag)),
  );
}

function renderAdvDateField(label: string, value: string | undefined, onInput: (value: string) => void): VNode {
  return h('label.item-adv__field', [
    h('span.item-adv__field-label', label),
    h('input.item-adv__input.--date', {
      attrs: { type: 'date', value: value ?? '', 'aria-label': label, ...controlExplainerAttrs({ label, description: 'Sets a date boundary for advanced Study search.' }) },
      on: { input: (e: Event) => onInput((e.target as HTMLInputElement).value) },
    }),
  ]);
}

function renderAdvancedSearchPanel(redraw: () => void): VNode {
  const folderBrowsed = navigatorFolderId() !== null;
  return h('div.item-adv__panel', { attrs: { role: 'group', 'aria-label': 'Advanced search filters' } }, [
    // Date — recentlyAdded / recentlyModified inclusive bounds (P2-LIB-9 names these explicitly).
    h('div.item-adv__section', [
      h('h4.item-adv__section-title', 'Date'),
      h('div.item-adv__row', [
        renderAdvDateField('Added from', advAddedFrom(), v => { setAdvAddedFrom(v); commitAdvancedEdit(redraw); }),
        renderAdvDateField('Added to', advAddedTo(), v => { setAdvAddedTo(v); commitAdvancedEdit(redraw); }),
        renderAdvDateField('Modified from', advModifiedFrom(), v => { setAdvModifiedFrom(v); commitAdvancedEdit(redraw); }),
        renderAdvDateField('Modified to', advModifiedTo(), v => { setAdvModifiedTo(v); commitAdvancedEdit(redraw); }),
      ]),
    ]),
    // People — one players substring input (title/white/black; folds in the "opponent" concept —
    // study-item has no separate owner-color/opponent facet, design §3.1).
    h('div.item-adv__section', [
      h('h4.item-adv__section-title', 'People'),
      h('label.item-adv__field', [
        h('span.item-adv__field-label', 'Players'),
        h('input.item-adv__input', {
          attrs: { type: 'search', placeholder: 'Name…', value: advPlayers() ?? '', 'aria-label': 'Players', ...controlExplainerAttrs({ label: 'Players', description: 'Filters Study games by player name.' }) },
          on: { input: (e: Event) => { setAdvPlayers((e.target as HTMLInputElement).value); commitAdvancedEdit(redraw); } },
        }),
      ]),
    ]),
    // Game Metadata — Result chips only (opening/eco deferred: no landed route field, see header).
    h('div.item-adv__section', [
      h('h4.item-adv__section-title', 'Result'),
      renderAdvMultiChips('Result', ADV_RESULT_OPTIONS, advResults(), value => {
        setAdvResults(toggleAdvValue(advResults(), value));
        commitAdvancedEdit(redraw);
      }),
    ]),




    h('div.item-adv__section', [
      h('h4.item-adv__section-title', 'Analysis'),
      renderAdvMultiChips('Analysis', ADV_ANALYSIS_OPTIONS, advAnalysisStates(), value => {
        setAdvAnalysisStates(toggleAdvValue(advAnalysisStates(), value));
        commitAdvancedEdit(redraw);
      }),
    ]),
    // Study Organization — sources / destinations / tags multi-select + favorite toggle.
    h('div.item-adv__section', [
      h('h4.item-adv__section-title', 'Organization'),
      h('span.item-adv__field-label', 'Sources'),
      renderAdvMultiChips('Sources', ADV_SOURCE_OPTIONS, advSources(), value => {
        setAdvSources(toggleAdvValue(advSources(), value));
        commitAdvancedEdit(redraw);
      }),
      h('span.item-adv__field-label', 'Destinations'),
      renderAdvMultiChips('Destinations', ADV_DEST_OPTIONS, advDestinations(), value => {
        setAdvDestinations(toggleAdvValue(advDestinations(), value));
        commitAdvancedEdit(redraw);
      }),
      ...(studyTags().length || advTags()?.length
        ? [h('span.item-adv__field-label', 'Tags'), renderAdvTagChips(redraw)]
        : []),
      h('div.item-adv__chip-row', [
        h('button.item-adv__chip', {
          class: { '--active': filterFav() },
          attrs: { type: 'button', 'aria-pressed': String(filterFav()), ...controlExplainerAttrs({ label: `${filterFav() ? 'Remove' : 'Add'} Favorites-only filter`, description: `${filterFav() ? 'Stops limiting' : 'Limits'} results to favorite games.` }) },
          on: { click: () => { setFilterFav(!filterFav()); commitAdvancedEdit(redraw); } },
        }, '★ Favorites only'),
      ]),
    ]),
    // Visibility — tri-state (§4), re-click clears back to the eye-toggle default.
    h('div.item-adv__section', [
      h('h4.item-adv__section-title', 'Visibility'),
      h('div.item-adv__chip-row', { attrs: { role: 'group', 'aria-label': 'Visibility' } },
        ADV_VIS_OPTIONS.map(option => h('button.item-adv__chip', {
          key: option.value,
          class: { '--active': advVisibility() === option.value },
          attrs: { type: 'button', 'aria-pressed': String(advVisibility() === option.value), ...controlExplainerAttrs({ label: `${advVisibility() === option.value ? 'Remove' : 'Apply'} ${option.label} filter`, description: 'Changes how hidden games participate in advanced search.' }) },
          on: { click: () => {
            setAdvVisibility(advVisibility() === option.value ? undefined : option.value);
            commitAdvancedEdit(redraw);
          } },
        }, option.label)),
      ),
    ]),
    // Folders — DISABLED-with-explanation (§3.2(B) ratified option B). No advanced folders route
    // field landed (slice 1), so there is no enabled multi-select here at all this slice — never a
    // silent no-op (design §9).
    h('div.item-adv__section', [
      h('h4.item-adv__section-title', 'Folders'),
      h('p.item-adv__folders-note', { attrs: { role: 'note' } },
        folderBrowsed
          ? 'Folder filter is unavailable while browsing a single folder. Clear the folder selection first.'
          : 'Filtering by specific folders from advanced search is not available yet.'),
    ]),
    // Footer — Clear filters (advanced facets + the panel's favorite toggle) and Done (collapse).
    h('div.item-adv__actions', [
      advancedFilterActive()
        ? h('button.item-adv__clear', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Clear advanced filters', description: 'Removes every advanced Study search filter.' }) },
            on: { click: () => { clearAdvancedSearch(); setFilterFav(false); commitAdvancedEdit(redraw); } },
          }, 'Clear filters')
        : null,
      h('button.item-adv__apply', {
        attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Done editing advanced search' }) },
        on: { click: () => { _advancedSearchOpen = false; redraw(); } },
      }, 'Done'),
    ]),
  ]);
}

/** Collapsed-panel chips: one removable chip per active advanced facet group + a Clear-all, so no
 * active filter is hidden while the panel is closed (mirrors Games' `chipsBar`, design §3.1). */
function renderAdvancedChipsBar(redraw: () => void): VNode {
  const chips: VNode[] = [];
  const pushChip = (label: string, onRemove: () => void): void => {
    chips.push(h('span.item-adv__active-chip', [
      h('span.item-adv__active-chip-label', label),
      h('button.item-adv__active-chip-remove', {
        attrs: { type: 'button', ...iconControlExplainerAttrs({ label: `Remove ${label}`, description: 'Removes this active advanced-search filter.' }) },
        on: { click: () => { onRemove(); commitAdvancedEdit(redraw); } },
      }, '×'),
    ]));
  };

  const sources = advSources();
  if (sources?.length) pushChip(`Sources: ${sources.map(s => advLabelOf(ADV_SOURCE_OPTIONS, s)).join(', ')}`, () => setAdvSources(undefined));
  const tags = advTags();
  if (tags?.length) pushChip(`Tags: ${tags.join(', ')}`, () => setAdvTags(undefined));
  const players = advPlayers();
  if (players) pushChip(`Players: ${players}`, () => setAdvPlayers(''));
  const results = advResults();
  if (results?.length) pushChip(`Result: ${results.map(r => advLabelOf(ADV_RESULT_OPTIONS, r)).join(', ')}`, () => setAdvResults(undefined));
  const analysisStates = advAnalysisStates();
  if (analysisStates?.length) pushChip(`Analysis: ${analysisStates.map(a => advLabelOf(ADV_ANALYSIS_OPTIONS, a)).join(', ')}`, () => setAdvAnalysisStates(undefined));
  const destinations = advDestinations();
  if (destinations?.length) pushChip(`Destination: ${destinations.map(d => advLabelOf(ADV_DEST_OPTIONS, d)).join(', ')}`, () => setAdvDestinations(undefined));
  const addedFrom = advAddedFrom(), addedTo = advAddedTo();
  if (addedFrom || addedTo) pushChip(`Added ${advDateRangeLabel(addedFrom, addedTo)}`, () => { setAdvAddedFrom(undefined); setAdvAddedTo(undefined); });
  const modifiedFrom = advModifiedFrom(), modifiedTo = advModifiedTo();
  if (modifiedFrom || modifiedTo) pushChip(`Modified ${advDateRangeLabel(modifiedFrom, modifiedTo)}`, () => { setAdvModifiedFrom(undefined); setAdvModifiedTo(undefined); });
  const visibility = advVisibility();
  if (visibility) pushChip(`Visibility: ${advLabelOf(ADV_VIS_OPTIONS, visibility)}`, () => setAdvVisibility(undefined));
  if (filterFav()) pushChip('Favorites only', () => setFilterFav(false));

  chips.push(h('button.item-adv__clear.--chips', {
    attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Clear all advanced filters', description: 'Removes every active advanced-search filter.' }) },
    on: { click: () => { clearAdvancedSearch(); setFilterFav(false); commitAdvancedEdit(redraw); } },
  }, 'Clear all'));

  return h('div.item-adv__chips', chips);
}




function renderAdvancedSearchButton(redraw: () => void): VNode {
  return h('button.item-toolbar__btn.item-adv__toggle', {
    class: { '--active': _advancedSearchOpen },
    attrs: {
      type: 'button', ...iconControlExplainerAttrs({ label: 'Advanced search', description: `${_advancedSearchOpen ? 'Closes' : 'Opens'} the advanced Study search filters.` }),
      'aria-expanded': String(_advancedSearchOpen),
    },
    on: { click: () => { _advancedSearchOpen = !_advancedSearchOpen; redraw(); } },
  }, [navIcon('sliders-horizontal', { size: 16 })]);
}





function renderAdvancedSearchRegion(redraw: () => void): VNode | null {
  const body = _advancedSearchOpen
    ? renderAdvancedSearchPanel(redraw)
    : (advancedFilterActive() ? renderAdvancedChipsBar(redraw) : null);
  return body ? h('div.item-adv', [body]) : null;
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
      attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Back to Library' }) },
      on: { click: exitPlain },
    }, [navIcon('chevron-left', { size: 16 })]),
    scopeLabel
      ? h('button.lib-game-open-header__breadcrumb', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: `Back to ${scopeLabel}`, description: 'Returns to the game list scoped to this Study location.' }) },
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














// `practice` (ORP V2 Package C, slice C2) is the permanent Practice tool entry, DISTINCT from the
// existing `orp` ORP-flag authoring tab which is intentionally retained. Adding it here also adds it
// to `normalizeStudyToolTab` below (that function derives from this list), so a deep link to
// `toolTab=practice` normalizes to `practice` instead of silently falling back to `comments`.
export type StudyToolTabId = 'comments' | 'questionnaire' | 'organize' | 'orp' | 'practice';

const STUDY_TOOL_TABS: ReadonlyArray<{ id: StudyToolTabId; label: string }> = [
  { id: 'comments', label: 'Comments' },
  { id: 'questionnaire', label: 'Questionnaire' },
  { id: 'organize', label: 'Organize' },
  { id: 'orp', label: 'ORP' },
  { id: STUDY_DETAIL_PRACTICE_TOOL_TAB, label: 'Practice' },
];

export function normalizeStudyToolTab(value: string | undefined): StudyToolTabId {
  return STUDY_TOOL_TABS.some(tab => tab.id === value) ? (value as StudyToolTabId) : 'comments';
}




const STUDY_TOOL_TAB_PLACEHOLDER: Readonly<Record<StudyToolTabId, string>> = {
  comments:      'Move-tree comments — coming soon.',
  questionnaire: 'Questionnaire answers — coming soon.',
  organize:      'Title / Organize / Assign to Study — coming soon.',
  orp:           'ORP flag — coming soon.',
  // Honest inert C2 placeholder: the real Practice workspace panel mounts in C3. C2 must not imply
  // Learn/Review is operational, so this stays a plain "coming soon" line with no session controls.
  practice:      'Practice workspace — coming soon.',
};

function renderStudyToolsColumn(opts: GameOpenShellOptions): VNode {
  return h('div.study-tools-col__back-wrap', [
    h('button.study-tools-col__back', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Back to game list' }) },
      on: { click: opts.onCloseTools },
    }, [navIcon('chevron-left', { size: 16 }), h('span', 'Back to game list')]),
    h('div.study-tools-col__tabs', { attrs: { role: 'tablist', 'aria-label': 'Study tools', ...controlExplainerAttrs({ label: 'Study tools tabs' }) } },
      STUDY_TOOL_TABS.map(tab => h('button.study-tools-col__tab', {
        key: tab.id,
        class: { '--active': tab.id === opts.activeToolTab },
        attrs: {
          type: 'button',
          role: 'tab',
          'aria-selected': String(tab.id === opts.activeToolTab),
          ...controlExplainerAttrs({
            label: `${tab.label} tools`,
            // Practice (C2) is a permanent tool entry, not a per-game panel — its More Help must be
            // honest that opening it does not auto-start a session (no SRS policy on this path).
            description: tab.id === STUDY_DETAIL_PRACTICE_TOOL_TAB
              ? 'Opens the Practice workspace entry. It does not automatically start a session.'
              : `Shows the ${tab.label.toLowerCase()} panel for this Study game.`,
          }),
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
   * (below) State 3's first Escape step. C2 also reuses it as the Library-rail "leave Practice"
   * action (clears `tools`/`toolTab`). */
  onCloseTools: () => void;
  /** Writes `toolTab` (and ensures `tools=1`) for the clicked tab. */
  onSelectToolTab: (tab: StudyToolTabId) => void;
  /** ORP V2 Package C, slice C2: opens the permanent Practice tool entry from the rail — a single
   * synchronous route write (`tools=1&toolTab=practice`) with NO SRS/session action. Distinct rail
   * surface from the Practice text tab (which routes through `onSelectToolTab`), passed explicitly
   * by `libraryView.ts` so the SRS-free route-write boundary stays visible at the wiring point. */
  onSelectPractice: () => void;
}
















function renderGameOpenShell(
  tree: StudyNavigationTree,
  allItems: readonly StudyItem[],
  redraw: () => void,
  onImportPgnClick: () => void,
  opts: GameOpenShellOptions,
): VNode {
  const scope = resolveGameOpenScope(tree, allItems, opts.openItemId);













  const exitPlain = () => {
    bumpSelectionSurface();
    writeHashRoute(serializeStudyRouteState(studyLibraryRouteSnapshot()));
  };
  const exitToFolder = () => {
    bumpSelectionSurface();
    if (scope) {
      _selection = scope.folderId
        ? { kind: 'folder', sectionId: scope.sectionId, folderId: scope.folderId }
        : { kind: 'section', sectionId: scope.sectionId };
      setActiveFolderId(scope.folderId);
      setNavigatorFolderId(scope.folderId);
    }
    // Serialize AFTER the folder-scope writes above so the snapshot's `folder` reflects the
    // returned-to folder -- the lossless "back to that folder" landing (design §2.2 / CRIT-1).
    writeHashRoute(serializeStudyRouteState(studyLibraryRouteSnapshot()));
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
        const queryOptions: StudyQueryOptions = {
          folderScope: 'already-resolved',
          resolvedFolderId: scope?.folderId ?? null,
        };
        const items = queryStudyItems(rawItems, queryOptions);




        const itemListPane = renderItemListPane(
          items,
          'compact',
          redraw,
          undefined,
          scope?.folderId ?? null,
          queryOptions,
        );
        return [
          renderGameOpenItemListHeader(scope?.label ?? null, exitPlain, exitToFolder),
          renderItemListToolbar(redraw, onImportPgnClick),
          // State 2: no advanced-search toggle (IMP-3) — pass `false`.
          _itemSearchOpen ? renderSearchInputRow(redraw, false) : null,
          itemListPane,
        ];
      })();

  // C2: a Study detail workspace is open here, so Practice is enabled; its active state is derived
  // from the parsed route (`toolsOpen && activeToolTab === 'practice'`), never a rail-local boolean.
  const railContext: RailContext = {
    studyOpen: true,
    practiceActive: opts.toolsOpen && opts.activeToolTab === STUDY_DETAIL_PRACTICE_TOOL_TAB,
    onSelectPractice: opts.onSelectPractice,
    onLeavePractice: opts.onCloseTools,
  };

  return h('div.lib-shell.lib-shell--game-open', {
    attrs: { style: _itemListDivider.styleDeclaration() },
  }, [
    renderRail(railContext),
    h('div.lib-items-wrap', {
      attrs: { 'aria-label': 'Study item-list pane', ...controlExplainerAttrs({ label: 'Study item-list pane' }) },
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
    const folderId = selection.kind === 'folder' ? selection.folderId : null;
    setActiveFolderId(folderId);
    setNavigatorFolderId(folderId);
    redraw();
  };

  const navPane = renderNavigationPane(tree, redraw, allItems, SYSTEM_LENSES, _reorderMode);








  const navVisibleOrder = _reorderMode ? [] : wireSelectionHandlers(navPane, keyIndex, activeKey, onSelect);

  const byId = new Map(allItems.map(item => [item.id, item] as const));






  const selection = _selection;





  const currentFolderId = selection.kind === 'folder' ? selection.folderId : null;















  const queryOptions: StudyQueryOptions = {
    folderScope: 'current-filter',
  };
  const rawItems = selection.kind === 'tag'
    ? allItems.filter(item => item.tags.includes(selection.tagName))
    : selection.kind === 'lens'
      ? resolveLensItems(selection.lensId, allItems)
      : selection.kind === 'folder'
        // Folder membership (direct membership, PLUS descendant folders when the toggle is on) is
        // projected once by the shared query plan's folder facet (`resolveStudyQueryFolderScope`,
        // studyCtrl.ts) so aliases, canonical-home-only records, and the descendants toggle cannot
        // disagree with the banner/selection cursor — `queryStudyItems` below narrows this same
        // `allItems` scope through that one facet.
        ? allItems
        : resolveItems(resolveSelectedItemIds(tree, selection, includeDescendants()), byId);
  // The shared Study query narrows and sorts the already-resolved navigator scope.
  // `renderGroupedRows` preserves that order; `renderItemListPane` only partitions pinned rows to
  // the top while retaining relative query order inside each partition.
  const items = queryStudyItems(rawItems, queryOptions);







  const itemListPane = renderItemListPane(
    items,
    ITEM_LIST_DENSITY,
    redraw,
    undefined,
    currentFolderId,
    queryOptions,
  );
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
      attrs: { 'aria-label': 'Study navigation pane', ...controlExplainerAttrs({ label: 'Study navigation pane' }) },
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
      attrs: { 'aria-label': 'Study item-list pane', ...controlExplainerAttrs({ label: 'Study item-list pane' }) },
      on: {
        click: () => setFocusedPane('list'),
        focusin: () => setFocusedPane('list'),
      },
    }, [
      renderItemListToolbar(redraw, onImportPgnClick),

      _itemSearchOpen ? renderSearchInputRow(redraw, true) : null,
      // Advanced-search panel/chips region — State 1 only (IMP-3), toggle lives in the search row
      // above. State 2's `renderGameOpenShell` omits it entirely: the active advanced query still
      // narrows State 2's list read-only via the plan.
      renderAdvancedSearchRegion(redraw),
      itemListPane,
    ]),
  ]);
}
