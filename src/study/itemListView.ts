

































































































import { h, type VNode } from 'snabbdom';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';
import type { ImportedGame } from '../import/types';
import type { StudyItem } from './types';
import { renderCompactGameRow, type CompactRowExtras } from '../games/view';
import { renderRichGameRow, type RichGameRowDeps, type ReviewControlState } from '../games/richRow';
import {
  advVisibility,
  bulkDeleteStudies,
  bulkSetFavorite,
  clearSelection,
  collectStudyQueryScope,
  createStudyQueryPlan,
  cursorId,
  folders,
  isSelected,
  rangeSelectToId,
  selectAllDisplayed,
  selectAllInScope,
  selectedIds,
  selectionCount,
  selectionSurfaceGeneration,
  sortKey,
  toggleSelectId,
  type StudyQueryOptions,
} from './studyCtrl';
import { deriveHomeFolderId } from './studyDb';
import { navIcon, type NavIconNameOrAlias } from './navIcons';
import {
  openGameContextMenu,
  renderGameContextMenu,
  type GameMenuContext,
} from './navigatorContextMenu';
import {
  beginGameDrag,
  draggingIds,
  draggingKind,
  endDrag,
  shouldSuppressClick,
} from './navigatorDragDrop';
import { openMoveAliasDialog, renderMoveAliasDialog } from './moveAliasDialog';
import { openBulkTagDialog, renderBulkTagDialog } from './bulkTagDialog';
import { openBulkAddToOrpDialog, renderBulkAddToOrpDialog } from './bulkAddToOrp';
import { isHidden, showHiddenItems } from './hiddenItems';

export type ItemListDensity = 'compact' | 'full';

// ---------------------------------------------------------------------------------------------
// StudyItem -> ImportedGame-compatible adapter
// ---------------------------------------------------------------------------------------------

/**
 * Minimal, structurally ImportedGame-compatible view over a StudyItem so this pane can call the
 * existing games-list row renderers without forking them. Only the fields both shapes share are
 * populated; StudyItem carries no chess.com/lichess platform metadata (rating, timeClass,
 * importedUsername, source), so those stay absent and the reused renderers' own existing null-safe
 * branches apply -- e.g. getUserColor() falls back to matching the logged-in account's own
 * registered username against white/black (still resolves correctly for "My Played Games" items
 * saved from the user's own games); NO_CLOCK_ICON's own "Study import - No clock" fallback already
 * exists for exactly the no-time-control case; rating spans are conditionally rendered and simply
 * omitted. exactOptionalPropertyTypes (tsconfig.base.json) forbids assigning `undefined` to an
 * optional field explicitly, hence the conditional spreads below rather than plain field copies.
 */
function studyItemAsGameRow(item: StudyItem): ImportedGame {
  return {
    id: item.id,
    pgn: item.pgn,
    ...(item.white !== undefined ? { white: item.white } : {}),
    ...(item.black !== undefined ? { black: item.black } : {}),
    ...(item.result !== undefined ? { result: item.result } : {}),
    ...(item.opening !== undefined ? { opening: item.opening } : {}),
    ...(item.eco !== undefined ? { eco: item.eco } : {}),
  };
}

// Inert placeholder review state shared by both density modes: this slice performs no engine/
// reviewQueue cross-referencing (StudyItem -> sourceGameId -> reviewedStatusIndex is out of scope --
// src/engine/* is a no-touch zone here), so every row's review control and Studied/Library chips
// render their existing, already-designed "not yet available" fallback look rather than a fabricated
// status. This matches the baseline's own existing behavior elsewhere in the app (e.g. the Games
// page's own rows currently pass `addLibrary: null` unconditionally too) -- not a Study-specific gap.
const INERT_REVIEW_STATE: ReviewControlState = { kind: 'unreviewed' };

























const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dateGroupLabel(dateValue: number, now: number): string {
  const diffDays = Math.floor((startOfDay(now) - startOfDay(dateValue)) / DAY_MS);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 days';
  if (diffDays <= 30) return 'Previous 30 days';
  const itemDate = new Date(dateValue);
  const nowDate = new Date(now);
  if (itemDate.getFullYear() === nowDate.getFullYear()) {
    return itemDate.toLocaleDateString(undefined, { month: 'long' });
  }
  return String(itemDate.getFullYear());
}






const _collapsedDateGroups = new Set<string>();

function isDateGroupCollapsed(label: string): boolean {
  return _collapsedDateGroups.has(label);
}

function toggleDateGroupCollapsed(label: string, redraw: () => void): void {
  if (_collapsedDateGroups.has(label)) _collapsedDateGroups.delete(label);
  else _collapsedDateGroups.add(label);
  redraw();
}

function renderDateGroupHeader(label: string, redraw: () => void): VNode {
  const collapsed = isDateGroupCollapsed(label);
  return h('div.sentry-group-header.sentry-group-header--date', {
    key: `group-${label}`,
    attrs: { role: 'button', tabindex: '0', 'aria-expanded': String(!collapsed), ...controlExplainerAttrs({ label: `${collapsed ? 'Expand' : 'Collapse'} ${label}`, description: `${collapsed ? 'Shows' : 'Hides'} games in this date group.` }) },
    on: {
      click: () => toggleDateGroupCollapsed(label, redraw),
      keydown: (e: KeyboardEvent) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        toggleDateGroupCollapsed(label, redraw);
      },
    },
  }, [
    navIcon(collapsed ? 'chevron-right' : 'chevron-down', { size: 13, className: 'sentry-group-header__chevron' }),
    h('span', label),
  ]);
}


















function handleItemListClick(id: string, displayedIds: readonly string[], e: Pick<MouseEvent, 'shiftKey'>): void {



  if (shouldSuppressClick()) return;
  if (e.shiftKey && cursorId() !== null) {
    rangeSelectToId(id, displayedIds);
  } else {
    toggleSelectId(id, displayedIds);
  }
}

/** Selection-adjacency lookup for the contiguous-run corner-squaring CSS (NN's own
 * `.nn-has-selected-above`/`-below` mechanic, adapted into `.sentry-row--adj-above`/`-below` in
 * main.scss). Computed once per rendered row SEQUENCE (the pinned group and the regular list are
 * two separate sequences, each with their own adjacency), against whatever order that sequence is
 * actually rendered in. */
function withSelectionAdjacency(
  orderedIds: readonly string[],
  selected: ReadonlySet<string>,
): Map<string, { above: boolean; below: boolean }> {
  const info = new Map<string, { above: boolean; below: boolean }>();
  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]!;
    if (!selected.has(id)) continue;
    const above = i > 0 && selected.has(orderedIds[i - 1]!);
    const below = i < orderedIds.length - 1 && selected.has(orderedIds[i + 1]!);
    info.set(id, { above, below });
  }
  return info;
}













const PINNED_IDS_STORAGE_KEY = 'patzer.studyPinnedItemIds';

function loadPinnedIds(): Set<string> {
  try {
    const raw = localStorage.getItem(PINNED_IDS_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return new Set(); // corrupt/unavailable localStorage -- falls back to "nothing pinned".
  }
}

function persistPinnedIds(ids: ReadonlySet<string>): void {
  try {
    localStorage.setItem(PINNED_IDS_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Best-effort only (private browsing, quota) -- pins simply reset to none next load.
  }
}

let _pinnedIds: Set<string> = loadPinnedIds();

export function isItemPinned(id: string): boolean {
  return _pinnedIds.has(id);
}

/** Toggle-pin over a set of ids in ONE call -- serves both the single-item menu row ([id], a
 * trivial toggle) and the multi-select row (inventory §3: pins every unpinned target if ANY of
 * `ids` is unpinned, otherwise unpins every one of them). */
export function toggleItemsPinned(ids: readonly string[]): void {
  const anyUnpinned = ids.some(id => !_pinnedIds.has(id));
  const next = new Set(_pinnedIds);
  for (const id of ids) {
    if (anyUnpinned) next.add(id);
    else next.delete(id);
  }
  _pinnedIds = next;
  persistPinnedIds(_pinnedIds);
}

let _pinnedGroupCollapsed = false;

function openRowContextMenu(
  clickedId: string,
  itemsById: ReadonlyMap<string, StudyItem>,
  currentFolderId: string | null,
  x: number,
  y: number,
  redraw: () => void,
): void {
  const ctx: GameMenuContext = {
    clickedId,
    selectedIds: selectedIds(),
    itemsById,
    currentFolderId,
    isPinned: isItemPinned,
    onTogglePin: toggleItemsPinned,
  };
  openGameContextMenu(ctx, x, y, redraw);
}




const LONG_PRESS_MS = 500;
let _longPressTimer: ReturnType<typeof setTimeout> | null = null;

function beginLongPress(
  itemId: string,
  itemsById: ReadonlyMap<string, StudyItem>,
  currentFolderId: string | null,
  e: TouchEvent,
  redraw: () => void,
): void {
  cancelLongPress();
  const touch = e.touches[0];
  if (!touch) return;
  const x = touch.clientX;
  const y = touch.clientY;
  _longPressTimer = setTimeout(() => {
    _longPressTimer = null;
    openRowContextMenu(itemId, itemsById, currentFolderId, x, y, redraw);
  }, LONG_PRESS_MS);
}

function cancelLongPress(): void {
  if (_longPressTimer !== null) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
}









const _expandedRailIds = new Set<string>();

function toggleRailExpanded(id: string, redraw: () => void): void {
  if (_expandedRailIds.has(id)) _expandedRailIds.delete(id);
  else _expandedRailIds.add(id);
  redraw();
}

interface RailActionDef {
  glyph: string;
  title: string;
}

const RAIL_ACTIONS: readonly RailActionDef[] = [
  { glyph: '#', title: 'Add tag' },
  { glyph: '★', title: 'Add to Favorites' },
  { glyph: '▶', title: 'Add to ORP queue' },
  { glyph: '↗', title: 'Open workspace, new tab' },
  { glyph: '↓', title: 'Export as annotated PGN' },
];

function renderActionRail(itemId: string, redraw: () => void): VNode {
  const expanded = _expandedRailIds.has(itemId);
  return h('div.sentry-rail', { class: { '--expanded': expanded } }, [
    expanded
      ? h('div.sentry-rail__actions', RAIL_ACTIONS.map(action => renderDisabledControlExplainer(
          { label: action.title, description: `${action.title} is not available yet.` },
          h('button.sentry-rail__btn', {
            key: action.title,
            attrs: { type: 'button', disabled: true },
          }, action.glyph),
        )))
      : null,
    h('button.sentry-rail__toggle', {
      attrs: {
        type: 'button',
        'aria-expanded': String(expanded),
        ...iconControlExplainerAttrs({ label: expanded ? 'Collapse actions' : 'Show actions', description: `${expanded ? 'Hides' : 'Shows'} the actions available for this game.` }),
      },
      on: { click: (e: Event) => { e.stopPropagation(); toggleRailExpanded(itemId, redraw); } },
    }, expanded ? '‹' : '›'),
  ]);
}



























function isAliasHere(item: StudyItem, currentFolderId: string | null): boolean {
  return currentFolderId !== null && deriveHomeFolderId(item) !== currentFolderId;
}

/** Resolves a home-folder id to its display name for the "from <home>" line, falling back to
 * "Unsorted" when the derived home is `null` (no explicit home, falls to section-derived
 * placement -- studyDb.ts's own deriveHomeFolderId doc comment) or points at a folder id that no
 * longer exists (defensive -- e.g. a stale reference after the home folder itself was deleted). */
function resolveHomeFolderName(homeId: string | null): string {
  if (homeId === null) return 'Unsorted';
  return folders().find(f => f.id === homeId)?.name ?? 'Unsorted';
}




















































export interface BulkActionBarAction {
  key: string;
  /** Singular/plural label, D09/A4 precedent (see navigatorContextMenu.ts's own `isMulti` labels). */
  label: (count: number) => string;
  icon: NavIconNameOrAlias;
  /** Delete-style warning treatment. */
  danger?: boolean;
  /** Accent/primary treatment (Add-to-ORP, A-sel-c's designated primary action). Mutually exclusive
   * with `danger` in practice; the bar applies `--primary` styling. */
  primary?: boolean;
  run: (ids: readonly string[]) => void | Promise<void>;
}

let _bulkBarRedraw: (() => void) | null = null;
let _bulkBarFolderContext: string | null = null;

const LIBRARY_BULK_ACTIONS: readonly BulkActionBarAction[] = [
  {
    key: 'add-to-orp',
    label: count => `Add ${count} to ORP`,
    icon: 'git-branch',
    primary: true,
    run: ids => {
      if (_bulkBarRedraw) openBulkAddToOrpDialog(ids, _bulkBarRedraw);
    },
  },
  {
    key: 'move',
    label: count => `Move ${count} game${count === 1 ? '' : 's'}…`,
    icon: 'folder-input',
    run: ids => {
      if (_bulkBarRedraw) openMoveAliasDialog(ids, _bulkBarFolderContext, _bulkBarRedraw);
    },
  },
  {
    key: 'tag',
    label: count => `Tag ${count} game${count === 1 ? '' : 's'}…`,
    icon: 'tag',
    run: ids => {
      if (_bulkBarRedraw) openBulkTagDialog(ids, _bulkBarRedraw);
    },
  },
  {
    key: 'favorite',
    label: count => `Favorite ${count} game${count === 1 ? '' : 's'}`,
    icon: 'star',
    run: () => bulkSetFavorite(true),
  },
  {
    key: 'delete',
    label: count => `Delete ${count} game${count === 1 ? '' : 's'}`,
    icon: 'trash-2',
    danger: true,
    run: ids => {
      if (!confirm(`Delete ${ids.length} selected game${ids.length === 1 ? '' : 's'} everywhere?`)) return;
      return bulkDeleteStudies();
    },
  },
];

function renderBulkActionBar(redraw: () => void, currentFolderId: string | null): VNode | null {
  const count = selectionCount();
  if (count === 0) return null;
  const ids = Array.from(selectedIds());
  _bulkBarRedraw = redraw;
  _bulkBarFolderContext = currentFolderId;

  const runAction = (action: BulkActionBarAction) => {
    void Promise.resolve(action.run(ids)).then(redraw);
  };

  return h('div.sentry-bulk-bar', [
    h('span.sentry-bulk-bar__count', `${count} selected`),
    h('div.sentry-bulk-bar__actions', LIBRARY_BULK_ACTIONS.map(action => h('button.sentry-bulk-bar__btn', {
      key: action.key,
      class: {
        'sentry-bulk-bar__btn--danger': Boolean(action.danger),
        'sentry-bulk-bar__btn--primary': Boolean(action.primary),
      },
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: action.label(count),
        description: action.key === 'delete'
          ? 'Permanently deletes the selected games after confirmation.'
          : action.key === 'move'
            ? 'Opens the folder picker to move or alias the selected games.'
            : action.key === 'tag'
              ? 'Opens the tag dialog for every selected game.'
              : action.key === 'add-to-orp'
                ? 'Adds each selected game’s mainline to Opening Repetition Practice.'
                : 'Adds every selected game to Favorites.',
      }) },
      on: { click: () => runAction(action) },
    }, [
      navIcon(action.icon, { size: 13 }),
      h('span', action.label(count)),
    ]))),
    h('button.sentry-bulk-bar__btn.sentry-bulk-bar__btn--clear', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Clear selection', description: 'Deselects every selected game.' }) },
      on: { click: () => { clearSelection(); redraw(); } },
    }, [
      navIcon('x', { size: 13 }),
      h('span', 'Clear'),
    ]),
  ]);
}




























function renderSelectAllPageControl(redraw: () => void, displayedIds: readonly string[]): VNode | null {
  if (displayedIds.length === 0) return null;
  const allSelected = displayedIds.length > 0 && displayedIds.every(id => isSelected(id));
  const label = allSelected
    ? `All ${displayedIds.length} on this page selected`
    : `Select all ${displayedIds.length} on this page`;
  return h('div.sentry-select-all-page', [
    h('input.sentry-select-all-page__checkbox', {
      attrs: {
        type: 'checkbox',
        'aria-label': allSelected ? 'Clear selection' : label,
        ...controlExplainerAttrs({ label: allSelected ? 'Clear page selection' : label, description: `${allSelected ? 'Deselects' : 'Selects'} every loaded game on this page.` }),
      },
      props: { checked: allSelected },
      on: {
        click: (e: Event) => {
          e.stopPropagation();
          if (allSelected) clearSelection();
          else selectAllDisplayed(displayedIds);
          redraw();
        },
      },
    }),
    h('span.sentry-select-all-page__label', label),
  ]);
}

type ScopeBannerCache =
  | { queryHash: string; status: 'pending' }
  | { queryHash: string; status: 'ready'; ids: string[] }
  | { queryHash: string; status: 'error' };

let _scopeBannerCache: ScopeBannerCache | null = null;

function ensureScopeBannerIds(
  queryOptions: StudyQueryOptions,
  queryHash: string,
  redraw: () => void,
): void {
  if (_scopeBannerCache?.queryHash === queryHash) return;
  _scopeBannerCache = { queryHash, status: 'pending' };




  const dispatchedSurface = selectionSurfaceGeneration();
  void collectStudyQueryScope(queryOptions).then(result => {
    const activeHash = createStudyQueryPlan(queryOptions).queryHash;
    if (
      _scopeBannerCache?.queryHash !== queryHash ||
      activeHash !== queryHash ||
      result.queryHash !== queryHash ||
      selectionSurfaceGeneration() !== dispatchedSurface
    ) return;
    _scopeBannerCache = { queryHash, status: 'ready', ids: result.ids };
    redraw();
  }).catch(() => {
    if (_scopeBannerCache?.queryHash !== queryHash) return;
    _scopeBannerCache = { queryHash, status: 'error' };
    redraw();
  });
}

function renderSelectAllScopeBanner(
  redraw: () => void,
  folderContext: string | null,
  displayedIds: readonly string[],
  queryOptions: StudyQueryOptions,
): VNode | null {
  if (folderContext === null) return null; // section/lens scope total: out of scope this slice (see header comment)
  if (displayedIds.length === 0) return null;

  const allLoadedSelected = displayedIds.every(id => isSelected(id));
  if (!allLoadedSelected) {
    _scopeBannerCache = null;
    return null;
  }

  const queryHash = createStudyQueryPlan(queryOptions).queryHash;
  ensureScopeBannerIds(queryOptions, queryHash, redraw);
  if (_scopeBannerCache?.queryHash !== queryHash || _scopeBannerCache.status !== 'ready') return null;
  if (_scopeBannerCache.ids.length <= displayedIds.length) return null;

  const folderName = folders().find(f => f.id === folderContext)?.name ?? 'this folder';
  const scopeIds = _scopeBannerCache.ids;
  const fullScopeSelected = scopeIds.every(id => isSelected(id));

  if (fullScopeSelected) {
    return h('div.sentry-bulk-bar.sentry-scope-banner', [
      h('span.sentry-scope-banner__text', `All ${scopeIds.length} in ${folderName} selected.`),
    ]);
  }

  return h('div.sentry-bulk-bar.sentry-scope-banner', [
    h('span.sentry-scope-banner__text', `All ${displayedIds.length} on this page selected.`),
    h('button.sentry-scope-banner__action', {
      attrs: { type: 'button', ...controlExplainerAttrs({ label: `Select all ${scopeIds.length} in ${folderName}`, description: 'Extends the selection from this page to every game in the folder.' }) },
      on: {
        click: () => {
          void selectAllInScope(queryOptions).then(redraw).catch(redraw);
        },
      },
    }, `Select all ${scopeIds.length} in ${folderName}`),
  ]);
}






function renderItemRow(
  item: StudyItem,
  density: ItemListDensity,
  onOpenItem: ((item: StudyItem) => void) | undefined,
  redraw: () => void,
  displayedIds: readonly string[],
  adjacency: { above: boolean; below: boolean } | undefined,
  itemsById: ReadonlyMap<string, StudyItem>,
  currentFolderId: string | null,
): VNode {
  const gameLike = studyItemAsGameRow(item);
  const extras: CompactRowExtras = { reviewState: INERT_REVIEW_STATE, addLibrary: null };
  const selected = isSelected(item.id);

  const reusedRow = density === 'full'
    ? renderRichGameRow(gameLike, {
        selected: false,
        reviewState: INERT_REVIEW_STATE,
        addLibrary: null,
      } satisfies RichGameRowDeps)
    : h('div.game-list__row', renderCompactGameRow(gameLike, false, false, undefined, extras));

  const dragging = draggingKind() === 'game' && draggingIds().includes(item.id);
  const isAlias = isAliasHere(item, currentFolderId);





  const isHomeHere = currentFolderId !== null && !isAlias;
  const homeName = isAlias ? resolveHomeFolderName(deriveHomeFolderId(item)) : null;





  const hidden = isHidden('game', item.id);

  return h('div.sentry-row', {
    key: item.id,
    attrs: {
      draggable: 'true',
      style: hidden ? 'opacity:0.5' : '',
      role: 'button',
      tabindex: '0',
      ...controlExplainerAttrs({ label: `${selected ? 'Deselect' : 'Select'} ${item.title || 'Untitled'}`, description: 'Changes this game selection for Study bulk actions.' }),
    },
    class: {
      'sentry-row--selected': selected,
      'sentry-row--adj-above': Boolean(selected && adjacency?.above),
      'sentry-row--adj-below': Boolean(selected && adjacency?.below),
      'sentry-row--dragging': dragging,
      'sentry-row--hidden': hidden,






      'sentry-row--alias': isAlias,
    },
    on: {




      click: (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        handleItemListClick(item.id, displayedIds, e);
        redraw();
      },
      keydown: (e: KeyboardEvent) => {
        if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
        e.preventDefault();
        handleItemListClick(item.id, displayedIds, { shiftKey: e.shiftKey });
        redraw();
      },
      contextmenu: (e: MouseEvent) => {
        e.preventDefault();
        openRowContextMenu(item.id, itemsById, currentFolderId, e.clientX, e.clientY, redraw);
      },
      touchstart: (e: TouchEvent) => beginLongPress(item.id, itemsById, currentFolderId, e, redraw),
      touchend: cancelLongPress,
      touchmove: cancelLongPress,
      touchcancel: cancelLongPress,







      dragstart: (e: DragEvent) => {
        beginGameDrag(item.id, item.title, e, currentFolderId);
        redraw();
      },
      dragend: () => {
        endDrag();
        redraw();
      },
    },
  }, [


















    h('input.sentry-checkbox', {
      attrs: {
        type: 'checkbox',
        'aria-label': `${selected ? 'Deselect' : 'Select'} ${item.title || 'Untitled'}`,
        ...controlExplainerAttrs({ label: `${selected ? 'Deselect' : 'Select'} ${item.title || 'Untitled'}`, description: 'Changes this game selection for Study bulk actions.' }),
      },
      props: { checked: selected },
      on: {
        click: (e: Event) => {
          e.stopPropagation();
          handleItemListClick(item.id, displayedIds, e as MouseEvent);
          redraw();
        },
      },
    }),
    h('div.sentry-stack', [
      h('div.sentry-title-row', [






        isAlias ? navIcon('corner-down-right', { size: 11, className: 'sentry-alias-badge' }) : null,
        h('div.sentry-title', item.title || 'Untitled'),





        isAlias ? h('span.sentry-alias-chip', 'Alias') : null,
        isHomeHere ? h('span.sentry-home-chip', 'Home') : null,
      ]),


      isAlias && density === 'full' ? h('div.sentry-alias-from', `↳ from ${homeName}`) : null,
      reusedRow,
    ]),
    renderActionRail(item.id, redraw),
  ]);
}

function renderEmptyState(): VNode {
  return h('div.sentry-empty', 'No games');
}

function renderGroupedRows(
  items: readonly StudyItem[],
  density: ItemListDensity,
  onOpenItem: ((item: StudyItem) => void) | undefined,
  redraw: () => void,
  displayedIds: readonly string[],
  itemsById: ReadonlyMap<string, StudyItem>,
  currentFolderId: string | null,
): VNode[] {
  const activeSortKey = sortKey();

  const dateField: 'createdAt' | 'updatedAt' | null =
    activeSortKey === 'createdAt' || activeSortKey === 'updatedAt' ? activeSortKey : null;

  // Non-date sort (Title/etc.): flat list in the caller's already-sorted order (navigatorShellView.
  // ts's `sortItemsForList`) -- NO date buckets. This is the A2 fix: previously every render forced
  // an `updatedAt`-descending re-bucket here regardless of `items`' real incoming order, so a Title
  // sort never actually rendered as a flat A->Z list.
  if (dateField === null) {
    const adjacency = withSelectionAdjacency(items.map(i => i.id), selectedIds());
    return items.map(item =>
      renderItemRow(item, density, onOpenItem, redraw, displayedIds, adjacency.get(item.id), itemsById, currentFolderId));
  }

  // Date sort: group into date-bucket headers IN THE CALLER'S INCOMING ORDER (already sorted by
  // this same field + direction upstream) -- this function no longer re-sorts anything itself.
  // Collapsed groups' rows are omitted from the render entirely; the adjacency map is computed
  // against only the VISIBLE row sequence so contiguous-selection corner-squaring never treats two
  // rows straddling a collapsed group as adjacent.
  const now = Date.now();
  const labelForItem = new Map<string, string>();
  const visibleIds: string[] = [];
  for (const item of items) {
    const label = dateGroupLabel(item[dateField], now);
    labelForItem.set(item.id, label);
    if (!isDateGroupCollapsed(label)) visibleIds.push(item.id);
  }
  const adjacency = withSelectionAdjacency(visibleIds, selectedIds());

  const nodes: VNode[] = [];
  let currentLabel: string | null = null;
  for (const item of items) {
    const label = labelForItem.get(item.id)!;
    if (label !== currentLabel) {
      nodes.push(renderDateGroupHeader(label, redraw));
      currentLabel = label;
    }
    if (isDateGroupCollapsed(label)) continue;
    nodes.push(renderItemRow(item, density, onOpenItem, redraw, displayedIds, adjacency.get(item.id), itemsById, currentFolderId));
  }
  return nodes;
}

/**
 * Renders the collapsible "Pinned" group at the very top of the item list (OD-6 game half,
 * inventory §4). `pinnedItems` is a partition of the CALLER's already-sorted `items` array (see
 * `renderItemListPane`), so its own row order tracks the active sort exactly -- inventory §4's
 * "pinned notes always float to the top as a group, but within that group they re-sort themselves
 * whenever the active sort option changes", satisfied by construction rather than by re-deriving a
 * sort here. No per-item date-grouping inside this group (NN's own pinned group has none either);
 * `_pinnedGroupCollapsed` is this module's own ephemeral per-session collapse toggle.
 */
function renderPinnedGroup(
  pinnedItems: readonly StudyItem[],
  density: ItemListDensity,
  onOpenItem: ((item: StudyItem) => void) | undefined,
  redraw: () => void,
  displayedIds: readonly string[],
  itemsById: ReadonlyMap<string, StudyItem>,
  currentFolderId: string | null,
): VNode {
  const ids = pinnedItems.map(i => i.id);
  const adjacency = withSelectionAdjacency(ids, selectedIds());
  return h('div.sentry-pinned-group', [
    h('div.sentry-group-header.sentry-group-header--pinned', {
      attrs: { role: 'button', tabindex: '0', 'aria-expanded': String(!_pinnedGroupCollapsed), ...controlExplainerAttrs({ label: `${_pinnedGroupCollapsed ? 'Expand' : 'Collapse'} pinned games`, description: `${_pinnedGroupCollapsed ? 'Shows' : 'Hides'} the pinned games group.` }) },
      on: {
        click: () => { _pinnedGroupCollapsed = !_pinnedGroupCollapsed; redraw(); },
        keydown: (e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          _pinnedGroupCollapsed = !_pinnedGroupCollapsed;
          redraw();
        },
      },
    }, [
      navIcon(_pinnedGroupCollapsed ? 'chevron-right' : 'chevron-down', { size: 13, className: 'sentry-group-header__chevron' }),
      h('span', 'Pinned'),
    ]),
    _pinnedGroupCollapsed
      ? null
      : h('div.sentry-pinned-group__rows', pinnedItems.map(item =>
          renderItemRow(item, density, onOpenItem, redraw, displayedIds, adjacency.get(item.id), itemsById, currentFolderId))),
  ]);
}




























export function renderItemListPane(
  items: readonly StudyItem[],
  density: ItemListDensity,
  redraw: () => void,
  onOpenItem?: (item: StudyItem) => void,
  currentFolderId?: string | null,
  queryOptions?: StudyQueryOptions,
): VNode {
  const folderContext = currentFolderId ?? null;
  const resolvedQueryOptions: StudyQueryOptions = queryOptions ?? {
    folderScope: 'already-resolved',
    resolvedFolderId: folderContext,
  };
















  const effectiveHiddenMode = advVisibility() ?? (showHiddenItems() ? 'include' : 'exclude');
  const visibleItems =
    effectiveHiddenMode === 'include'
      ? items
      : effectiveHiddenMode === 'only'
        ? items.filter(i => isHidden('game', i.id))
        : items.filter(i => !isHidden('game', i.id));
  const displayedIds = visibleItems.map(i => i.id);
  const itemsById = new Map(visibleItems.map(i => [i.id, i] as const));
  const pinnedItems = visibleItems.filter(i => isItemPinned(i.id));
  const pinnedSet = new Set(pinnedItems.map(i => i.id));
  const restItems = visibleItems.filter(i => !pinnedSet.has(i.id));

  return h('div.lib-items', [
    renderSelectAllPageControl(redraw, displayedIds),
    renderSelectAllScopeBanner(redraw, folderContext, displayedIds, resolvedQueryOptions),
    renderBulkActionBar(redraw, folderContext),
    h('div.sentry-list', { attrs: { 'data-pane': 'items' } }, [
      pinnedItems.length > 0
        ? renderPinnedGroup(pinnedItems, density, onOpenItem, redraw, displayedIds, itemsById, folderContext)
        : null,
      ...(visibleItems.length === 0
        ? [renderEmptyState()]
        : renderGroupedRows(restItems, density, onOpenItem, redraw, displayedIds, itemsById, folderContext)),
    ]),
    renderGameContextMenu(redraw),
    renderMoveAliasDialog(redraw),
    renderBulkTagDialog(redraw),
    renderBulkAddToOrpDialog(redraw),
  ]);
}
