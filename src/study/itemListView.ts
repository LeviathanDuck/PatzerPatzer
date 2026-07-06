






























































import { h, type VNode } from 'snabbdom';
import type { ImportedGame } from '../import/types';
import type { StudyItem } from './types';
import { renderCompactGameRow, type CompactRowExtras } from '../games/view';
import { renderRichGameRow, type RichGameRowDeps, type ReviewControlState } from '../games/richRow';

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

// ---------------------------------------------------------------------------------------------
// Row renderer -- reuses the games-list v2/V4 baseline; adds only the two named Study
// customizations (title line, action rail) around it.
// ---------------------------------------------------------------------------------------------

function renderItemRow(
  item: StudyItem,
  density: ItemListDensity,
  onOpenItem: ((item: StudyItem) => void) | undefined,
  redraw: () => void,
): VNode {
  const gameLike = studyItemAsGameRow(item);
  const extras: CompactRowExtras = { reviewState: INERT_REVIEW_STATE, addLibrary: null };

  const reusedRow = density === 'full'
    ? renderRichGameRow(gameLike, {
        selected: false,
        reviewState: INERT_REVIEW_STATE,
        addLibrary: null,
      } satisfies RichGameRowDeps)
    : h('div.game-list__row', renderCompactGameRow(gameLike, false, false, undefined, extras));

  return h('div.sentry-row', {
    key: item.id,
    on: { click: () => onOpenItem?.(item) },
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
): VNode[] {
  const sorted = [...items].sort((a, b) => b.updatedAt - a.updatedAt);
  const now = Date.now();
  const nodes: VNode[] = [];
  let currentLabel: string | null = null;

  for (const item of sorted) {
    const label = dateGroupLabel(item.updatedAt, now);
    if (label !== currentLabel) {
      nodes.push(h('div.sentry-group-header', { key: `group-${label}` }, label));
      currentLabel = label;
    }
    nodes.push(renderItemRow(item, density, onOpenItem, redraw));
  }
  return nodes;
}

















export function renderItemListPane(
  items: readonly StudyItem[],
  density: ItemListDensity,
  redraw: () => void,
  onOpenItem?: (item: StudyItem) => void,
): VNode {
  return h('div.lib-items', [
    h('div.sentry-list', { attrs: { 'data-pane': 'items' } },
      items.length === 0
        ? [renderEmptyState()]
        : renderGroupedRows(items, density, onOpenItem, redraw)),
  ]);
}
