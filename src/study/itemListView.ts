





































































import { h, type VNode } from 'snabbdom';
import type { ImportedGame } from '../import/types';
import type { StudyItem } from './types';
import { renderCompactGameRow, type CompactRowExtras } from '../games/view';
import { renderRichGameRow, type RichGameRowDeps, type ReviewControlState } from '../games/richRow';
import { cursorId, isSelected, rangeSelectToId, selectedIds, toggleSelectId } from './studyCtrl';
import { navIcon } from './navIcons';
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

// ---------------------------------------------------------------------------------------------
// Date-grouping headers (Study §1.5: Today / Yesterday / Previous 7 days / Previous 30 days / month
// name within the current year / bare year for older material). Buckets by StudyItem.updatedAt
// (last-modified) -- the closest universally-populated analog to NN's file mtime/ctime grouping
// key; StudyItem has no single "date played" field that is meaningful across all four P2-LIB-2
// sections (a repertoire line or masters import has no played date).
// ---------------------------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function dateGroupLabel(updatedAt: number, now: number): string {
  const diffDays = Math.floor((startOfDay(now) - startOfDay(updatedAt)) / DAY_MS);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 days';
  if (diffDays <= 30) return 'Previous 30 days';
  const itemDate = new Date(updatedAt);
  const nowDate = new Date(now);
  if (itemDate.getFullYear() === nowDate.getFullYear()) {
    return itemDate.toLocaleDateString(undefined, { month: 'long' });
  }
  return String(itemDate.getFullYear());
}


















function handleItemListClick(id: string, displayedIds: readonly string[], e: MouseEvent): void {



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
  x: number,
  y: number,
  redraw: () => void,
): void {
  const ctx: GameMenuContext = {
    clickedId,
    selectedIds: selectedIds(),
    itemsById,
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
    openRowContextMenu(itemId, itemsById, x, y, redraw);
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
      ? h('div.sentry-rail__actions', RAIL_ACTIONS.map(action => h('button.sentry-rail__btn', {
          key: action.title,
          attrs: { type: 'button', disabled: true, title: action.title, 'aria-label': action.title },
          on: { click: (e: Event) => e.stopPropagation() },
        }, action.glyph)))
      : null,
    h('button.sentry-rail__toggle', {
      attrs: {
        type: 'button',
        title: expanded ? 'Collapse actions' : 'Show actions',
        'aria-label': expanded ? 'Collapse actions' : 'Show actions',
        'aria-expanded': String(expanded),
      },
      on: { click: (e: Event) => { e.stopPropagation(); toggleRailExpanded(itemId, redraw); } },
    }, expanded ? '‹' : '›'),
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

  return h('div.sentry-row', {
    key: item.id,
    attrs: { draggable: 'true' },
    class: {
      'sentry-row--selected': selected,
      'sentry-row--adj-above': Boolean(selected && adjacency?.above),
      'sentry-row--adj-below': Boolean(selected && adjacency?.below),
      'sentry-row--dragging': dragging,
    },
    on: {




      click: (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        handleItemListClick(item.id, displayedIds, e);
        redraw();
      },
      contextmenu: (e: MouseEvent) => {
        e.preventDefault();
        openRowContextMenu(item.id, itemsById, e.clientX, e.clientY, redraw);
      },
      touchstart: (e: TouchEvent) => beginLongPress(item.id, itemsById, e, redraw),
      touchend: cancelLongPress,
      touchmove: cancelLongPress,
      touchcancel: cancelLongPress,



      dragstart: (e: DragEvent) => {
        beginGameDrag(item.id, item.title, e);
        redraw();
      },
      dragend: () => {
        endDrag();
        redraw();
      },
    },
  }, [
    h('div.sentry-stack', [
      h('div.sentry-title', { attrs: { title: item.title || 'Untitled' } }, item.title || 'Untitled'),
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
): VNode[] {
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  const adjacency = withSelectionAdjacency(sorted.map(i => i.id), selectedIds());
  const now = Date.now();
  const nodes: VNode[] = [];
  let currentLabel: string | null = null;

  for (const item of sorted) {
    const label = dateGroupLabel(item.updatedAt, now);
    if (label !== currentLabel) {
      nodes.push(h('div.sentry-group-header', { key: `group-${label}` }, label));
      currentLabel = label;
    }
    nodes.push(renderItemRow(item, density, onOpenItem, redraw, displayedIds, adjacency.get(item.id), itemsById));
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
): VNode {
  const ids = pinnedItems.map(i => i.id);
  const adjacency = withSelectionAdjacency(ids, selectedIds());
  return h('div.sentry-pinned-group', [
    h('div.sentry-group-header.sentry-group-header--pinned', {
      attrs: { role: 'button', 'aria-expanded': String(!_pinnedGroupCollapsed) },
      on: { click: () => { _pinnedGroupCollapsed = !_pinnedGroupCollapsed; redraw(); } },
    }, [
      navIcon(_pinnedGroupCollapsed ? 'chevron-right' : 'chevron-down', { size: 13, className: 'sentry-group-header__chevron' }),
      h('span', 'Pinned'),
    ]),
    _pinnedGroupCollapsed
      ? null
      : h('div.sentry-pinned-group__rows', pinnedItems.map(item =>
          renderItemRow(item, density, onOpenItem, redraw, displayedIds, adjacency.get(item.id), itemsById))),
  ]);
}




















export function renderItemListPane(
  items: readonly StudyItem[],
  density: ItemListDensity,
  redraw: () => void,
  onOpenItem?: (item: StudyItem) => void,
): VNode {
  const displayedIds = items.map(i => i.id);
  const itemsById = new Map(items.map(i => [i.id, i] as const));
  const pinnedItems = items.filter(i => isItemPinned(i.id));
  const pinnedSet = new Set(pinnedItems.map(i => i.id));
  const restItems = items.filter(i => !pinnedSet.has(i.id));

  return h('div.lib-items', [
    h('div.sentry-list', { attrs: { 'data-pane': 'items' } }, [
      pinnedItems.length > 0
        ? renderPinnedGroup(pinnedItems, density, onOpenItem, redraw, displayedIds, itemsById)
        : null,
      ...(items.length === 0
        ? [renderEmptyState()]
        : renderGroupedRows(restItems, density, onOpenItem, redraw, displayedIds, itemsById)),
    ]),
    renderGameContextMenu(redraw),
  ]);
}
