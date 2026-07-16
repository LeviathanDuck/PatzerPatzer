// Games tab rendering: filter bar, sort controls, game table, compact game list.
// Game metadata helpers (getUserColor, gameResult, gameSourceUrl, renderCompactGameRow)
// live here so main.ts stays as bootstrap-only code.
//
// Operates on importedGames in-memory — no separate data system.

import { h, type VNode } from 'snabbdom';
import { parsePgnHeader, type ImportedGame } from '../import/types';
import type { ChessAccount } from '../accounts';
import { chesscom } from '../import/chesscom';
import { lichess } from '../import/lichess';
import {
  enqueueBulkReview, enqueueAtFront, appendBulkReviewRunSource, getReviewProgress, isBulkRunning, isBulkPaused, getQueueSummary,
  getReviewQueueItems,
  isGameErrored, formatReviewDuration, getFailedReviewStatus, skipFailedReviewGame, isLeaderTab,
  getReviewCrashContext, subscribeReviewQueueState,
  type QueueSummary, type ReviewQueueItemView,
} from '../engine/reviewQueue';
import {
  reviewRunStartFromContext,
  selectedGameIdsInSourceOrder,
  visibleListReviewRunContext,
  type ReviewRunSourceContext,
} from '../engine/reviewRun';
import type { ReviewedGameStatus } from '../engine/reviewedStatusDerivation';
import { LOSS_THRESHOLDS } from '../engine/winchances';
import { getMissedMoments, type MissedMoment } from '../engine/tactics';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import { serializeAnalysisSelectedGameRoute } from '../analyse/routeState';
import { writeHashRoute } from '../router';
import {
  filterGameProjections,
  projectImportedGame,
  type GameFilterAnalysisState,
  type GameFilterMissedTacticSeverity,
  type GameFilterProjection,
  type GameFilterQuery,
  type GameFilterReviewIssueState,
  type GameFilterSortKey,
} from '../gameFilters';
import {
  parseGamesRouteState,
  resolveGamesRoutePage,
  serializeGamesRouteState,
  type GamesRouteAccountOverride,
  type GamesRouteDensity,
  type GamesRouteState,
} from './routeState';
import {
  renderRichGameRow,
  renderReviewControl,
  renderSecondaryActions,
  renderLibraryChip,
  renderStudiedPulse,
  renderStoryChip,
  playerDotClass,
  gameExtras,
  formatDelta,
  resolveRatingDeltas,
  openingPreview,
  formatMovePreview,
  TIME_CLASS_ICON,
  NO_CLOCK_ICON,
  type GameExtras,
  type ReviewControlOpts,
  type ReviewControlState,
  type RichGameRowDeps,
  type RichRowIconInputs,
  type RichRowSecondaryAction,
  type RichRowTagInputs,
} from './richRow';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';

const NEW_IMPORT_WINDOW_MS = 60 * 60 * 1000;
const GAME_LIST_PAGE_SIZE_OPTIONS = [25, 50, 100] as const;
type GameListPageSize = typeof GAME_LIST_PAGE_SIZE_OPTIONS[number];
const GAME_LIST_PAGE_SIZE_STORAGE_KEY = 'patzer.games.underboardPageSize.v1';

// ---------------------------------------------------------------------------
// Game metadata helpers (moved from main.ts — Step 16)
// ---------------------------------------------------------------------------

function isRecentlyImported(game: ImportedGame): boolean {
  return game.importedAt !== undefined && Date.now() - game.importedAt < NEW_IMPORT_WINDOW_MS;
}

function parsePgnTimestamp(pgn: string, dateTag: string, timeTag: string): number | null {
  const date = parsePgnHeader(pgn, dateTag);
  const time = parsePgnHeader(pgn, timeTag);
  if (!date || !time) return null;
  const ts = Date.parse(`${date.replace(/\./g, '-')}T${time}Z`);
  return Number.isNaN(ts) ? null : ts;
}

function parseGameDateOnly(date: string | undefined): number | null {
  if (!date) return null;
  const day = date.slice(0, 10);
  const ts = Date.parse(`${day}T00:00:00Z`);
  return Number.isNaN(ts) ? null : ts;
}

function exactPlayedTimestamp(game: ImportedGame): number | null {
  if (game.source === 'chesscom') {
    return parsePgnTimestamp(game.pgn, 'EndDate', 'EndTime')
      ?? parsePgnTimestamp(game.pgn, 'UTCDate', 'UTCTime');
  }
  return parsePgnTimestamp(game.pgn, 'UTCDate', 'UTCTime')
    ?? parsePgnTimestamp(game.pgn, 'EndDate', 'EndTime');
}

function playedTimestamp(game: ImportedGame): number | null {
  return exactPlayedTimestamp(game) ?? parseGameDateOnly(game.date);
}

/** Determine which side the importing user played in a given game. */
export function getUserColor(game: ImportedGame): 'white' | 'black' | null {
  // Prefer importedUsername stored at import time (reliable after IDB restore).
  // Fall back to current adapter usernames for games imported before this field existed.
  const knownNames = [game.importedUsername, chesscom.username, lichess.username]
    .map(n => n?.trim().toLowerCase())
    .filter((n): n is string => !!n);
  if (knownNames.length === 0) return null;
  if (game.white && knownNames.includes(game.white.toLowerCase())) return 'white';
  if (game.black && knownNames.includes(game.black.toLowerCase())) return 'black';
  return null;
}

/** Derive win/loss/draw relative to user. Returns null when user color cannot be determined. */
export function gameResult(game: ImportedGame): 'win' | 'loss' | 'draw' | null {
  const color = getUserColor(game);
  if (!game.result) return null;
  if (game.result.includes('1/2')) return 'draw';
  if (!color) return null;
  if (color === 'white') return game.result === '1-0' ? 'win' : 'loss';
  return game.result === '0-1' ? 'win' : 'loss';
}

/** Returns the source platform URL for a game, extracted from PGN headers. */
export function gameSourceUrl(game: ImportedGame): string | undefined {
  const link = parsePgnHeader(game.pgn, 'Link');
  if (link?.startsWith('http')) return link;
  const site = parsePgnHeader(game.pgn, 'Site');
  if (site?.startsWith('https://lichess.org/')) return site;
  return undefined;
}







// Returns the tactic-icon glyph(s) for Line 1's right side (or null), reusing richRow.ts's
// glyph/severity convention (`!`x1-3 orange missed-tactic, `#` purple missed-mate) instead of the
// old "M?!" text badge, per the approved V4 icon spec.
// - Swing/collapse severity maps to ! count via LOSS_THRESHOLDS (same thresholds as per-move glyphs).
// - Missed forced mate shows a separate `#` glyph.
// - Falls back to a single ! when moment detail is unavailable (e.g. previous-session IDB restore).
function renderCompactTacticIcons(gameId: string, hasMissedTactic: boolean): VNode | null {
  if (!hasMissedTactic) return null;

  const moments = getMissedMoments(gameId);
  const hasMate = moments.some((m: MissedMoment) => m.kind === 'missed-mate');
  const swingMoments = moments.filter((m: MissedMoment) => m.kind !== 'missed-mate');
  const worstLoss = swingMoments.length > 0 ? Math.max(...swingMoments.map((m: MissedMoment) => m.loss)) : 0;

  const exclamCount = worstLoss >= LOSS_THRESHOLDS.blunder    ? 3
    : worstLoss >= LOSS_THRESHOLDS.mistake    ? 2
    : worstLoss >= LOSS_THRESHOLDS.inaccuracy ? 1
    : 0;

  const icons: (VNode | null)[] = [];
  if (hasMate) {
    icons.push(h('span.grr__icon.--missed-mate', { attrs: { title: 'Missed forced mate' } }, '#'));
  }
  if (exclamCount > 0) {
    icons.push(h('span.grr__icon.--missed-tactic', { attrs: { title: 'Missed tactic' } }, '!'.repeat(exclamCount)));
  } else if (!hasMate) {
    // No rich data (IDB-restored from a previous session) — show single fallback !
    icons.push(h('span.grr__icon.--missed-tactic', { attrs: { title: 'Missed tactic' } }, '!'));
  }

  return h('span.grl__tactic-icons', icons);
}

function importedAccountColor(game: ImportedGame): 'white' | 'black' | null {
  const username = game.importedUsername?.trim().toLowerCase();
  if (!username) return null;
  if (game.white?.trim().toLowerCase() === username) return 'white';
  if (game.black?.trim().toLowerCase() === username) return 'black';
  return null;
}




function compressTimestamp(display: string): string {
  const year = new Date().getFullYear();
  return display.replace(new RegExp(`,\\s*${year}$`), '');
}











export interface CompactRowExtras {
  tags?:        RichRowTagInputs;
  reviewState?: ReviewControlState;
  addLibrary?:  { onAdd: () => void } | null;
}

export function renderCompactGameRow(
  game: ImportedGame,
  isAnalyzed: boolean,
  hasMissedTactic: boolean,
  accuracy?: { user: number | null; opp: number | null },
  extras?: CompactRowExtras,
): (VNode | null)[] {
  const result    = gameResult(game);
  const userColor = getUserColor(game);
  const opponent  = userColor === 'white' ? (game.black ?? game.id)
    : userColor === 'black' ? (game.white ?? game.id)
    : (game.white && game.black ? `${game.white} vs ${game.black}` : game.id);

  const isNewImport = isRecentlyImported(game);
  const openingLabel = game.opening?.trim() || null;
  const pgnExtras: GameExtras = gameExtras(game);




  const deltas = resolveRatingDeltas(game, userColor);




  const oppDotCls  = playerDotClass('opponent', result);
  const acctDotCls = playerDotClass('account', result);

  // Line 1 -- per-player dot + name (chip + rating + delta) -> vs pill -> imported account (dot +
  // name + chip + rating + delta), each followed by inline accuracy once Game Review data exists
  // (V4 design, desktop compact section). Opponent NEVER truncates; account shrinks first (CSS).
  const oppColor  = userColor === 'white' ? 'black' : userColor === 'black' ? 'white' : null;
  const oppChip   = oppColor ? h('span.color-chip.--' + oppColor) : null;
  const oppRating = userColor === 'white' ? game.blackRating : userColor === 'black' ? game.whiteRating : undefined;
  const oppDelta  = userColor === 'white' ? deltas.black : userColor === 'black' ? deltas.white : null;
  const oppAccNode = accuracy?.opp !== null && accuracy?.opp !== undefined
    ? h('span.grl__accuracy', `${Math.round(accuracy.opp)}%`)
    : null;

  const acctColor  = importedAccountColor(game);
  const acctChip   = acctColor ? h('span.color-chip.--' + acctColor) : null;
  const acctName   = game.importedUsername?.trim() || null;
  const acctRating = acctColor === 'white' ? game.whiteRating : acctColor === 'black' ? game.blackRating : undefined;
  const acctDelta  = userColor === 'white' ? deltas.white : userColor === 'black' ? deltas.black : null;
  const acctAccNode = accuracy?.user !== null && accuracy?.user !== undefined
    ? h('span.grl__accuracy', `${Math.round(accuracy.user)}%`)
    : null;

  const renderDelta = (delta: number | null): VNode | null => delta === null ? null
    : h('span.grl__delta', { class: { '--gain': delta > 0, '--loss': delta < 0 } }, formatDelta(delta));

  // Tactic icons on Line 1's right side (V4) — reuses richRow.ts's glyph/severity convention.
  const tacticIcons = renderCompactTacticIcons(game.id, hasMissedTactic);

  const line1 = h('div.grl__line1', [
    h('div.grl__matchup', [
      h('span.grl__player.--opponent', [
        h('span.grl__dot.--' + oppDotCls),
        h('span.grl__name', opponent),
        oppRating !== undefined ? h('span.grl__rating', String(oppRating)) : null,
        renderDelta(oppDelta),
        oppChip,
        oppAccNode,
      ]),
      h('span.grr__vs-pill', 'vs'),
      h('span.grl__player.--account', [
        h('span.grl__dot.--' + acctDotCls),
        h('span.grl__name.--account', acctName ?? game.id),
        acctRating !== undefined ? h('span.grl__rating', String(acctRating)) : null,
        renderDelta(acctDelta),
        acctChip,
        acctAccNode,
      ]),
    ]),
    tacticIcons,
  ]);

  // Line 2 -- opening strip (subtle background) + tertiary Reviewed/+Library status chips (only
  // when a caller opts in via `extras`) + compressed timestamp + colored time-class icon. The
  // Reviewed label never sits on Line 1 (V4 rule).
  const preview = openingPreview(game);
  const totalMoves = preview ? Math.ceil(preview.totalPlies / 2) : null;
  const moveCountLabel = totalMoves !== null ? `${totalMoves} move${totalMoves === 1 ? '' : 's'}` : null;
  const sanPreviewLabel = preview && preview.sanMoves.length > 0 ? formatMovePreview(preview.sanMoves) : null;
  const tcIcon = (game.timeClass ? TIME_CLASS_ICON[game.timeClass] : undefined) ?? NO_CLOCK_ICON;
  const tcTitle = game.timeClass ? game.timeClass.charAt(0).toUpperCase() + game.timeClass.slice(1) : 'Study import · No clock';
  const tsTooltip = [pgnExtras.timestamp.iso, pgnExtras.timestamp.sourceLabel].filter(Boolean).join(' · ') || pgnExtras.timestamp.display;









  const statusChips = extras?.reviewState !== undefined ? h('div.grr__chips', [
    renderStudiedPulse(extras.reviewState, !!game.questionnaire),
    renderStoryChip(game),
    renderLibraryChip(extras.addLibrary),
  ]) : null;

  // The "Analyzed" ✓ badge is redundant once a caller opts into the review control + Reviewed
  // chip (extras.reviewState) — those already state reviewed status prominently. Consumers that
  // omit extras (header import list, Study library divergence list) have no other reviewed
  // indicator, so they keep the badge — on Line 2, never Line 1 (V4 rule applies to both).
  const showAnalyzedBadge = isAnalyzed && extras?.reviewState === undefined;

  const line2 = h('div.grl__line2', [
    h('div.grl__opening', { attrs: { title: [openingLabel, sanPreviewLabel, moveCountLabel].filter(Boolean).join(' — ') } }, [
      openingLabel ? h('span.grl__opening-name', openingLabel) : null,
      sanPreviewLabel ? h('span.grl__opening-san', sanPreviewLabel) : null,
      moveCountLabel ? h('span.grl__opening-moves', moveCountLabel) : null,
    ]),
    statusChips,
    isNewImport ? h('span.grl__badge.--new', { attrs: { title: 'Newly imported' } }, 'NEW') : null,
    showAnalyzedBadge ? h('span.grl__badge.--ok', { attrs: { title: 'Analyzed' } }, '✓') : null,
    h('span.grl__timestamp', { attrs: { title: tsTooltip } }, compressTimestamp(pgnExtras.timestamp.display)),
    h('span.grl__tc-icon.' + tcIcon.cls, { attrs: { 'data-icon': tcIcon.glyph, title: tcTitle } }),
  ]);

  return [line1, line2];
}

// ---------------------------------------------------------------------------
// Dependency surface injected by main.ts at render time
// ---------------------------------------------------------------------------






export interface GameReviewIncompleteStatus {
  classification: 'partial' | 'version-stale';
  updatedAt:      number;
}

export interface GamesViewDeps {
  importedGames:         ImportedGame[];
  /** Registered chess accounts, for the account lens switcher. */
  accounts:              ChessAccount[];
  selectedGameId:        string | null;
  reviewedStatusIndex:   ReadonlyMap<string, ReviewedGameStatus>;
  reviewIncompleteIndex: ReadonlyMap<string, GameReviewIncompleteStatus>;
  analyzedGameIds:       Set<string>;
  missedTacticGameIds:   Set<string>;
  analyzedGameAccuracy:  Map<string, { white: number | null; black: number | null }>;
  savedPuzzles:          Array<{ gameId: string | null }>;
  gameResult:            (game: ImportedGame) => 'win' | 'loss' | 'draw' | null;
  getUserColor:          (game: ImportedGame) => 'white' | 'black' | null;
  gameSourceUrl:         (game: ImportedGame) => string | undefined;
  renderCompactGameRow:  (game: ImportedGame, analyzed: boolean, missed: boolean, accuracy?: { user: number | null; opp: number | null }, extras?: CompactRowExtras) => (VNode | null)[];
  /** Set selectedGameId + call loadGame (used for click-to-load in the game list). */
  selectGame:            (game: ImportedGame) => void;
  /** selectGame + navigate to analysis + enqueue priority review (used for Review button). */
  reviewGame:            (game: ImportedGame) => void;
  /** Run batch analysis on an ordered list of games sequentially. */
  reviewAllGames:        (games: ImportedGame[], sourceContext?: ReviewRunSourceContext) => void;
  routeQuery?:            string;
  redraw:                () => void;
}

export function reviewedStatusForGame(deps: GamesViewDeps, gameId: string): ReviewedGameStatus | undefined {
  return deps.reviewedStatusIndex.get(gameId);
}

export function isReviewedGame(deps: GamesViewDeps, gameId: string): boolean {
  return reviewedStatusForGame(deps, gameId)?.reviewed === true || deps.analyzedGameIds.has(gameId);
}

// Never true at the same time as isReviewedGame for the same gameId — hydration keeps the two
// indexes disjoint (a record is either complete, or partial/version-stale, never both).
export function reviewIncompleteStatusForGame(
  deps: GamesViewDeps,
  gameId: string,
): GameReviewIncompleteStatus | undefined {
  return deps.reviewIncompleteIndex.get(gameId);
}

export function reviewedAccuracyForGame(
  deps: GamesViewDeps,
  gameId: string,
): { white: number | null; black: number | null } | undefined {
  return reviewedStatusForGame(deps, gameId)?.accuracy ?? deps.analyzedGameAccuracy.get(gameId);
}

// ---------------------------------------------------------------------------
// Filter / sort state (owned by this module)
// ---------------------------------------------------------------------------

type GamesResultFilter = 'win' | 'loss' | 'draw';
type GamesSortField    = 'date' | 'result' | 'opponent' | 'timeClass';
type ReviewIssueFilter = 'all' | 'failed-skipped';
type GameListReviewFilter = '' | 'reviewed' | 'not-reviewed';

let gamesFilterResults:  Set<GamesResultFilter> = new Set(); // empty = all
let gamesFilterSpeeds:   Set<string>            = new Set(); // empty = all
let gamesFilterOpponent  = '';
let gamesFilterColor:    '' | 'white' | 'black' = '';
// Tactics severity filter: '!' inaccuracy+, '!!' mistake+, '!!!' blunder, 'M?!' missed mate
// Multi-select OR: show games matching any selected severity.
let gamesFilterTactics:  Set<string>            = new Set();
// Opening name substring filter (case-insensitive).
let gamesFilterOpening = '';
let gamesFilterReviewIssues: ReviewIssueFilter = 'all';
let gamesSortField: GamesSortField = 'date';
let gamesSortDir:   'asc' | 'desc' = 'desc';
const GAMES_PAGE_SIZE = 50;
let gamesPage = 0;
// Full Games page row density: 'full' (rich row feed, default) or 'compact' (renderCompactGameRow
// list style, reusing the underboard's compact fragments). URL-owned, see routeState.ts.
let gamesDensity: GamesRouteDensity = 'full';



let gamesFilterRatingMin: number | null = null;
let gamesFilterRatingMax: number | null = null;
let gamesFilterDateFrom = ''; // 'YYYY-MM-DD', played-date lower bound (inclusive)
let gamesFilterDateTo   = ''; // 'YYYY-MM-DD', played-date upper bound (inclusive)

let gamesAdvancedPanelOpen = false;

// Separate filter state for the compact underboard game list.
// Kept independent of the Games-tab filter state so the two views don't cross-contaminate.
let gameListSearch = '';
let gameListFilterResults: Set<'win' | 'loss' | 'draw'> = new Set();
let gameListFilterSpeeds:  Set<string>                   = new Set();
let gameListFilterColor:   '' | 'white' | 'black'        = '';
let gameListFilterReview:  GameListReviewFilter          = '';
let gameListPage = 0;
let gameListPageSize: GameListPageSize = loadGameListPageSize();



let gameListMorePillsOpen = false;



type UnderboardDensity = 'compact' | 'rich';
const GAME_LIST_DENSITY_STORAGE_KEY = 'patzer.games.underboardDensity.v1';
let gameListDensity: UnderboardDensity = loadGameListDensity();
// Measured by a ResizeObserver on the underboard's rendered width (installed in renderGameList's
// insert hook) — rich rows only actually render when both the density preference is 'rich' AND
// the container is wide enough for the 132px thumbnail + body content (Phase 1 design: "the
// underboard MAY step up to rich rows when layout permits").
const UNDERBOARD_RICH_MIN_WIDTH = 460;
let gameListWideEnough = false;

// Account lens shared by both game list views: whose games are shown.
// "My accounts" = all mine-category accounts plus uncategorized PGN-paste games.
// A lens rather than a filter — any registered account is selectable here.
type AccountFilterState =
  | { mode: 'all' }
  | { mode: 'custom'; includeMine: boolean; accountIds: string[] };
type CustomAccountFilterState = Extract<AccountFilterState, { mode: 'custom' }>;

const ACCOUNT_FILTER_STORAGE_KEY = 'patzer.games.accountFilter.v1';
const DEFAULT_ACCOUNT_FILTER: CustomAccountFilterState = { mode: 'custom', includeMine: true, accountIds: [] };

let accountFilterState: AccountFilterState = loadAccountFilterState();
let accountFilterMenuOpen = false;
let unsubscribeQueueHealthStatus: (() => void) | null = null;
let lastHydratedGamesRouteQuery: string | null = null;
let pendingGamesRouteState: GamesRouteState | null = null;
let pendingGamesRouteQuery: string | null = null;
let gamesRouteAccountOverrideActive = false;

function reportGamesIssue(): void {
  const session = reportIssue({ triggeredBy: 'games-route', route: '/games' });
  console.info('[diagnostics] report issue session', session);
}

function bindQueueHealthStatus(redraw: () => void): void {
  if (unsubscribeQueueHealthStatus !== null) return;
  unsubscribeQueueHealthStatus = subscribeReviewQueueState(redraw);
}

function unbindQueueHealthStatus(): void {
  unsubscribeQueueHealthStatus?.();
  unsubscribeQueueHealthStatus = null;
}

// Multi-select state shared across both game list views.
// Tracks the set of selected game IDs and the last-clicked game for shift-range selection.
// Mirrors the multi-select pattern in standard file-manager UIs.
let selectedGameIds: Set<string> = new Set();
let lastClickedGameId: string | null = null;
// Select mode: when true, plain taps toggle selection instead of loading the game.

export function selectedGameIdsInCurrentVisibleOrder(games: readonly ImportedGame[]): string[] {
  return selectedGameIdsInSourceOrder(games, selectedGameIds);
}

function selectedGamesInCurrentVisibleOrder(games: readonly ImportedGame[]): ImportedGame[] {
  const orderedIds = new Set(selectedGameIdsInCurrentVisibleOrder(games));
  return games.filter(game => orderedIds.has(game.id));
}

function selectedReviewRunContext(selectedGames: readonly ImportedGame[]): ReviewRunSourceContext {
  const sourceGameIds = selectedGames.map(game => game.id);
  return {
    sourceMode: 'selected-games',
    sourceGameIds,
  };
}

function selectedReviewRunStart(selectedGames: readonly ImportedGame[]): {
  batchGames: ImportedGame[];
  sourceContext: ReviewRunSourceContext;
} {
  return reviewRunStartFromContext(selectedGames, selectedReviewRunContext(selectedGames));
}

type ReviewRowLifecycleLabel = {
  label: string;
  title: string;
  modifier: 'active' | 'queued' | 'paused' | 'warning';
};

const REVIEW_RUN_WAVE_CLASS_COUNT = 6;

function reviewQueueItemProgressPercent(item: ReviewQueueItemView): number {
  if (item.status === 'complete') return 100;
  if (item.total <= 0) return 0;
  return Math.round((Math.min(Math.max(0, item.done), item.total) / item.total) * 100);
}

function reviewRunWaveClasses(item: ReviewQueueItemView | undefined): Record<string, boolean> {
  if (!item) return {};
  return {
    'review-run-member': true,
    [`review-run-wave--${item.waveIndex % REVIEW_RUN_WAVE_CLASS_COUNT}`]: true,
  };
}

function reviewRowLifecycleLabel(
  summary: QueueSummary | null,
  gameId: string,
  item: ReviewQueueItemView | undefined,
): ReviewRowLifecycleLabel | null {
  if (!summary || !item) return null;
  const current = summary.currentGameId === gameId;
  if (current && summary.stale) {
    const age = formatReviewDuration(summary.lastProgressSeconds);
    return {
      label:    'Stalled',
      title:    `No analysis progress${age ? ` for ${age}` : ''}`,
      modifier: 'warning',
    };
  }
  if (current && summary.lifecycleState === 'hidden-suspended') {
    return { label: 'Hidden', title: 'Analysis suspended while the owning tab is hidden', modifier: 'paused' };
  }
  if (current && summary.lifecycleState === 'interrupted-after-reload') {
    return { label: 'Resume', title: 'Analysis interrupted after reload and requires manual resume', modifier: 'paused' };
  }
  if (current && summary.paused) {
    return { label: 'Paused', title: 'Analysis is paused', modifier: 'paused' };
  }
  if (current) {
    return { label: 'Analyzing', title: 'Current analysis game', modifier: 'active' };
  }
  const progress = reviewQueueItemProgressPercent(item);
  const waveLabel = `Wave ${item.waveIndex + 1}`;
  return {
    label:    `${progress}%`,
    title:    item.isFuture ? `Queued for Bulk Review ${waveLabel}` : `Queued in the current Bulk Review ${waveLabel}`,
    modifier: 'queued',
  };
}

export function currentVisibleListReviewRunContext(games: readonly ImportedGame[]): ReviewRunSourceContext {
  return visibleListReviewRunContext(games, {
    sortKey:       gamesSortField,
    sortDirection: gamesSortDir,
  });
}

function visibleListReviewRunStart(games: readonly ImportedGame[]): {
  batchGames: ImportedGame[];
  sourceContext: ReviewRunSourceContext;
} {
  return reviewRunStartFromContext(games, currentVisibleListReviewRunContext(games));
}

function fixedVisibleListReviewRunStart(
  games: readonly ImportedGame[],
  sortKey: string,
  sortDirection: 'asc' | 'desc',
): {
  batchGames: ImportedGame[];
  sourceContext: ReviewRunSourceContext;
} {
  return reviewRunStartFromContext(games, visibleListReviewRunContext(games, { sortKey, sortDirection }));
}
// Enables multi-select on touch devices where ctrl/shift+click is unavailable.
let selectModeActive = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function loadGameListPageSize(): GameListPageSize {
  try {
    const raw = parseInt(localStorage.getItem(GAME_LIST_PAGE_SIZE_STORAGE_KEY) ?? '', 10);
    if (GAME_LIST_PAGE_SIZE_OPTIONS.includes(raw as GameListPageSize)) return raw as GameListPageSize;
  } catch {
    // Non-critical: fall back to the compact-list default.
  }
  return 50;
}

function setGameListPageSize(size: GameListPageSize): void {
  gameListPageSize = size;
  resetGameListPage();
  try {
    localStorage.setItem(GAME_LIST_PAGE_SIZE_STORAGE_KEY, String(size));
  } catch {
    // Non-critical: setting still works for the current session.
  }
}

function loadGameListDensity(): UnderboardDensity {
  try {
    const raw = localStorage.getItem(GAME_LIST_DENSITY_STORAGE_KEY);
    if (raw === 'compact' || raw === 'rich') return raw;
  } catch {
    // Non-critical: fall back to the compact-list default.
  }
  return 'compact';
}

function setGameListDensity(density: UnderboardDensity): void {
  gameListDensity = density;
  try {
    localStorage.setItem(GAME_LIST_DENSITY_STORAGE_KEY, density);
  } catch {
    // Non-critical: setting still works for the current session.
  }
}




type GameListElement = HTMLElement & { __glResizeObserver: ResizeObserver | undefined };

function observeGameListWidth(vnode: VNode, redraw: () => void): void {
  const el = vnode.elm as GameListElement | undefined;
  if (!el) return;
  const update = (width: number) => {
    const nowWide = width >= UNDERBOARD_RICH_MIN_WIDTH;
    if (nowWide !== gameListWideEnough) {
      gameListWideEnough = nowWide;
      redraw();
    }
  };
  update(el.clientWidth);
  const observer = new ResizeObserver(entries => {
    const entry = entries[0];
    if (entry) update(entry.contentRect.width);
  });
  observer.observe(el);
  el.__glResizeObserver = observer;
}

function unobserveGameListWidth(vnode: VNode): void {
  const el = vnode.elm as GameListElement | undefined;
  el?.__glResizeObserver?.disconnect();
  if (el) el.__glResizeObserver = undefined;
}

function resetGameListPage(): void {
  gameListPage = 0;
}

export function resetGamesAccountFilterRuntimeForDataManagement(): void {
  accountFilterState = DEFAULT_ACCOUNT_FILTER;
  accountFilterMenuOpen = false;
  selectedGameIds = new Set();
  lastClickedGameId = null;
  selectModeActive = false;
  resetGameListPage();
}

function loadAccountFilterState(): AccountFilterState {
  try {
    const raw = localStorage.getItem(ACCOUNT_FILTER_STORAGE_KEY);
    if (!raw) return DEFAULT_ACCOUNT_FILTER;
    const parsed = JSON.parse(raw) as Partial<AccountFilterState>;
    if (parsed.mode === 'all') return { mode: 'all' };
    if (parsed.mode === 'custom') {
      return {
        mode: 'custom',
        includeMine: parsed.includeMine === true,
        accountIds: Array.isArray(parsed.accountIds)
          ? parsed.accountIds.filter((id): id is string => typeof id === 'string')
          : [],
      };
    }
  } catch {
    // Ignore invalid older localStorage payloads and restore the safe default.
  }
  return DEFAULT_ACCOUNT_FILTER;
}

function saveAccountFilterState(): void {
  try {
    localStorage.setItem(ACCOUNT_FILTER_STORAGE_KEY, JSON.stringify(accountFilterState));
  } catch {
    // Non-critical: filtering still works for the current session.
  }
}

function normalizeAccountFilter(accounts: ChessAccount[]): void {
  if (accountFilterState.mode === 'all') return;
  const validIds = new Set(accounts.map(a => a.id));
  const uniqueIds = [...new Set(accountFilterState.accountIds)].filter(id => validIds.has(id));
  const includeMine = accountFilterState.includeMine || uniqueIds.length === 0;
  if (includeMine !== accountFilterState.includeMine || uniqueIds.length !== accountFilterState.accountIds.length) {
    accountFilterState = { mode: 'custom', includeMine, accountIds: uniqueIds };
    saveAccountFilterState();
  }
}

function accountFiltersEqual(a: AccountFilterState, b: AccountFilterState): boolean {
  if (a.mode !== b.mode) return false;
  if (a.mode === 'all' || b.mode === 'all') return true;
  if (a.includeMine !== b.includeMine) return false;
  if (a.accountIds.length !== b.accountIds.length) return false;
  return a.accountIds.every((id, index) => id === b.accountIds[index]);
}

function accountFilterFromRouteOverride(override: GamesRouteAccountOverride): AccountFilterState {
  return override.mode === 'all'
    ? { mode: 'all' }
    : {
        mode: 'custom',
        includeMine: override.includeMine || override.accountIds.length === 0,
        accountIds: [...new Set(override.accountIds)],
      };
}

function accountRouteOverrideFromCurrent(): GamesRouteAccountOverride {
  return accountFilterState.mode === 'all'
    ? { mode: 'all' }
    : {
        mode: 'custom',
        includeMine: accountFilterState.includeMine,
        accountIds: [...accountFilterState.accountIds],
      };
}

function currentGamesRouteStateSnapshot(): GamesRouteState {
  return {
    accountOverride: gamesRouteAccountOverrideActive ? accountRouteOverrideFromCurrent() : null,
    accountSource: gamesRouteAccountOverrideActive ? 'route-override' : 'saved-default',
    results: [...gamesFilterResults] as GamesRouteState['results'],
    speeds: [...gamesFilterSpeeds] as GamesRouteState['speeds'],
    opponent: gamesFilterOpponent,
    opening: gamesFilterOpening,
    color: gamesFilterColor,
    misses: [...gamesFilterTactics] as GamesRouteState['misses'],
    review: gamesFilterReviewIssues,
    sort: { field: gamesSortField, direction: gamesSortDir },
    page: gamesPage + 1,
    density: gamesDensity,
    ...(gamesFilterRatingMin !== null ? { ratingMin: gamesFilterRatingMin } : {}),
    ...(gamesFilterRatingMax !== null ? { ratingMax: gamesFilterRatingMax } : {}),
    ...(gamesFilterDateFrom ? { dateFrom: gamesFilterDateFrom } : {}),
    ...(gamesFilterDateTo ? { dateTo: gamesFilterDateTo } : {}),
  };
}

type GamesRouteReplaceWriter = (
  hashRoute: string,
  options: { mode: 'replace' },
) => { changed: boolean } | void;

export function writeGamesRouteStateFromSnapshotForTests(
  snapshot: GamesRouteState,
  writer: GamesRouteReplaceWriter,
): { route: string; changed?: boolean } {
  const route = serializeGamesRouteState(snapshot);
  const result = writer(route, { mode: 'replace' });
  return result ? { route, changed: result.changed } : { route };
}

function writeCurrentGamesRouteState(deps: GamesViewDeps): void {
  if (deps.routeQuery === undefined) return;
  writeHashRoute(serializeGamesRouteState(currentGamesRouteStateSnapshot()), { mode: 'replace' });
}

function applyGamesRouteStateForView(state: GamesRouteState): void {
  gamesFilterResults = new Set(state.results);
  gamesFilterSpeeds = new Set(state.speeds);
  gamesFilterOpponent = state.opponent;
  gamesFilterOpening = state.opening;
  gamesFilterColor = state.color;
  gamesFilterTactics = new Set(state.misses);
  gamesFilterReviewIssues = state.review;
  gamesSortField = state.sort.field;
  gamesSortDir = state.sort.direction;
  gamesPage = Math.max(0, state.page - 1);
  gamesDensity = state.density ?? 'full';
  gamesFilterRatingMin = state.ratingMin ?? null;
  gamesFilterRatingMax = state.ratingMax ?? null;
  gamesFilterDateFrom = state.dateFrom ?? '';
  gamesFilterDateTo = state.dateTo ?? '';
  gamesRouteAccountOverrideActive = state.accountSource === 'route-override';

  if (state.accountOverride) {
    const nextAccountFilter = accountFilterFromRouteOverride(state.accountOverride);
    if (!accountFiltersEqual(accountFilterState, nextAccountFilter)) {
      accountFilterState = nextAccountFilter;
      selectedGameIds = new Set();
      lastClickedGameId = null;
    }
  } else if (state.accountSource === 'saved-default') {
    const savedAccountFilter = loadAccountFilterState();
    if (!accountFiltersEqual(accountFilterState, savedAccountFilter)) {
      accountFilterState = savedAccountFilter;
      selectedGameIds = new Set();
      lastClickedGameId = null;
    }
  }
}

export function resetGamesViewRouteStateForTests(): void {
  gamesFilterResults = new Set();
  gamesFilterSpeeds = new Set();
  gamesFilterOpponent = '';
  gamesFilterOpening = '';
  gamesFilterColor = '';
  gamesFilterTactics = new Set();
  gamesFilterReviewIssues = 'all';
  gamesSortField = 'date';
  gamesSortDir = 'desc';
  gamesPage = 0;
  gamesDensity = 'full';
  gamesFilterRatingMin = null;
  gamesFilterRatingMax = null;
  gamesFilterDateFrom = '';
  gamesFilterDateTo = '';
  gamesAdvancedPanelOpen = false;
  gameListSearch = '';
  gameListFilterResults = new Set();
  gameListFilterSpeeds = new Set();
  gameListFilterColor = '';
  gameListFilterReview = '';
  gameListPage = 0;
  accountFilterState = loadAccountFilterState();
  selectedGameIds = new Set();
  lastClickedGameId = null;
  lastHydratedGamesRouteQuery = null;
  pendingGamesRouteState = null;
  pendingGamesRouteQuery = null;
  gamesRouteAccountOverrideActive = false;
}

export function getGamesViewRouteSnapshotForTests(): {
  results: GamesResultFilter[];
  speeds: string[];
  opponent: string;
  opening: string;
  color: '' | 'white' | 'black';
  misses: string[];
  review: ReviewIssueFilter;
  sort: { field: GamesSortField; direction: 'asc' | 'desc' };
  pageIndex: number;
  density: GamesRouteDensity;
  accountFilter: AccountFilterState;
  compact: {
    search: string;
    results: ('win' | 'loss' | 'draw')[];
    speeds: string[];
    color: '' | 'white' | 'black';
    review: GameListReviewFilter;
    pageIndex: number;
  };
} {
  return {
    results: [...gamesFilterResults],
    speeds: [...gamesFilterSpeeds],
    opponent: gamesFilterOpponent,
    opening: gamesFilterOpening,
    color: gamesFilterColor,
    misses: [...gamesFilterTactics],
    review: gamesFilterReviewIssues,
    sort: { field: gamesSortField, direction: gamesSortDir },
    pageIndex: gamesPage,
    density: gamesDensity,
    accountFilter: accountFilterState.mode === 'all'
      ? { mode: 'all' }
      : {
          mode: 'custom',
          includeMine: accountFilterState.includeMine,
          accountIds: [...accountFilterState.accountIds],
        },
    compact: {
      search: gameListSearch,
      results: [...gameListFilterResults],
      speeds: [...gameListFilterSpeeds],
      color: gameListFilterColor,
      review: gameListFilterReview,
      pageIndex: gameListPage,
    },
  };
}

function hydrateGamesRouteState(deps: GamesViewDeps): void {
  if (deps.routeQuery === undefined) return;
  if (deps.routeQuery === lastHydratedGamesRouteQuery) return;

  const parsed = parseGamesRouteState(deps.routeQuery, {
    validAccountIds: deps.accounts.map(account => account.id),
  });
  applyGamesRouteStateForView(parsed.state);
  lastHydratedGamesRouteQuery = deps.routeQuery;
  pendingGamesRouteState = parsed.state;
  pendingGamesRouteQuery = deps.routeQuery;
}

function canonicalGamesRouteForQuery(query: string): string {
  return query ? `#/games?${query}` : '#/games';
}

function finalizeGamesRouteHydration(deps: GamesViewDeps, filteredGameCount: number): void {
  if (deps.routeQuery === undefined || pendingGamesRouteState === null || pendingGamesRouteQuery !== deps.routeQuery) {
    return;
  }

  const totalPages = Math.max(1, Math.ceil(filteredGameCount / GAMES_PAGE_SIZE));
  const pageResolution = resolveGamesRoutePage(pendingGamesRouteState, totalPages);
  gamesPage = pageResolution.internalPageIndex;

  const currentRoute = canonicalGamesRouteForQuery(deps.routeQuery);
  if (pageResolution.canonicalRoute !== currentRoute) {
    writeHashRoute(pageResolution.canonicalRoute, { mode: 'replace' });
  }

  pendingGamesRouteState = null;
  pendingGamesRouteQuery = null;
}

function customAccountFilter(accounts: ChessAccount[]): CustomAccountFilterState {
  normalizeAccountFilter(accounts);
  return accountFilterState.mode === 'custom' ? accountFilterState : DEFAULT_ACCOUNT_FILTER;
}

function applyAccountFilterState(next: AccountFilterState, deps: GamesViewDeps): void {
  accountFilterState = next.mode === 'all'
    ? { mode: 'all' }
    : {
        mode: 'custom',
        includeMine: next.includeMine || next.accountIds.length === 0,
        accountIds: [...new Set(next.accountIds)],
      };
  saveAccountFilterState();
  gamesPage = 0;
  resetGameListPage();
  // Selections must not survive a lens change: hidden-but-selected games
  // would silently leak into the next bulk-review action.
  selectedGameIds = new Set();
  lastClickedGameId = null;
  if (deps.routeQuery !== undefined) {
    gamesRouteAccountOverrideActive = true;
    writeCurrentGamesRouteState(deps);
  }
  deps.redraw();
}

function toggleGamesSort(field: GamesSortField, deps: GamesViewDeps): void {
  if (gamesSortField === field) {
    gamesSortDir = gamesSortDir === 'desc' ? 'asc' : 'desc';
  } else {
    gamesSortField = field;
    gamesSortDir = 'desc';
  }
  gamesPage = 0;
  writeCurrentGamesRouteState(deps);
  deps.redraw();
}

// Advanced-search-only filters (Layer 2): opponent/opening search, opponent rating range, and
// played-date range. Used to decide chip visibility while the advanced panel is collapsed.
function gamesAdvancedFiltersActive(): boolean {
  return gamesFilterOpponent.trim() !== '' || gamesFilterOpening.trim() !== '' ||
    gamesFilterRatingMin !== null || gamesFilterRatingMax !== null ||
    gamesFilterDateFrom !== '' || gamesFilterDateTo !== '';
}

function gamesFilterActive(): boolean {
  return gamesFilterResults.size > 0 || gamesFilterSpeeds.size > 0 ||
    gamesFilterColor !== '' || gamesFilterTactics.size > 0 ||
    gamesFilterReviewIssues !== 'all' || gamesAdvancedFiltersActive();
}

function clearGamesFilters(deps: GamesViewDeps): void {
  gamesFilterResults  = new Set();
  gamesFilterSpeeds   = new Set();
  gamesFilterOpponent = '';
  gamesFilterColor    = '';
  gamesFilterTactics  = new Set();
  gamesFilterOpening  = '';
  gamesFilterReviewIssues = 'all';
  gamesFilterRatingMin = null;
  gamesFilterRatingMax = null;
  gamesFilterDateFrom = '';
  gamesFilterDateTo = '';
  gamesSortField = 'date';
  gamesSortDir = 'desc';
  gamesPage = 0;
  writeCurrentGamesRouteState(deps);
  deps.redraw();
}

// Returns the set of tactics severity badges a game has, for filter matching.
function gameTacticsSeverities(gameId: string, hasMissedTactic: boolean): Set<string> {
  const result: Set<string> = new Set();
  if (!hasMissedTactic) return result;
  const moments = getMissedMoments(gameId);
  const hasMate = moments.some((m: MissedMoment) => m.kind === 'missed-mate');
  const swingMoments = moments.filter((m: MissedMoment) => m.kind !== 'missed-mate');
  const worstLoss = swingMoments.length > 0 ? Math.max(...swingMoments.map((m: MissedMoment) => m.loss)) : 0;
  if (hasMate) result.add('M?!');
  if (worstLoss >= LOSS_THRESHOLDS.blunder)    result.add('!!!');
  if (worstLoss >= LOSS_THRESHOLDS.mistake)    result.add('!!');
  if (worstLoss >= LOSS_THRESHOLDS.inaccuracy || hasMissedTactic) result.add('!');
  return result;
}

function isGameFilterMissedTacticSeverity(value: string): value is GameFilterMissedTacticSeverity {
  return value === '!' || value === '!!' || value === '!!!' || value === 'M?!';
}

function reviewIssueStateForGame(deps: GamesViewDeps, gameId: string): GameFilterReviewIssueState {
  const failedStatus = getFailedReviewStatus(gameId);
  if (failedStatus !== undefined && (failedStatus.attempts > 0 || failedStatus.skipped)) {
    return 'failed-skipped';
  }
  return reviewIncompleteStatusForGame(deps, gameId) ? 'incomplete' : 'none';
}

function analysisStateForGame(deps: GamesViewDeps, gameId: string): GameFilterAnalysisState {
  return isReviewedGame(deps, gameId) ? 'analyzed' : 'not-analyzed';
}

function projectionForImportedGame(game: ImportedGame, deps: GamesViewDeps): GameFilterProjection {
  const hasMissedTactic = deps.missedTacticGameIds.has(game.id);
  const playedAt = playedTimestamp(game);
  return projectImportedGame(game, {
    ownerResult: deps.gameResult(game),
    userColor: deps.getUserColor(game),
    opponentName: opponentName(game, deps.getUserColor),
    opponentRating: opponentRating(game, deps.getUserColor),
    missedTacticSeverities: [...gameTacticsSeverities(game.id, hasMissedTactic)]
      .filter(isGameFilterMissedTacticSeverity),
    reviewIssueState: reviewIssueStateForGame(deps, game.id),
    analysisState: analysisStateForGame(deps, game.id),
    playedAt,
    textAnyValues: [opponentName(game, deps.getUserColor), game.opening].filter((value): value is string => Boolean(value)),
  });
}

function filterImportedGamesWithQuery(
  games: readonly ImportedGame[],
  deps: GamesViewDeps,
  query: GameFilterQuery,
): ImportedGame[] {
  const gameById = new Map(games.map(game => [game.id, game]));
  const result = filterGameProjections(
    games.map(game => projectionForImportedGame(game, deps)),
    query,
  );
  return result.ids
    .map(id => gameById.get(id))
    .filter((game): game is ImportedGame => game !== undefined);
}

/** Games visible under the current account lens. */
function accountLensGames(deps: GamesViewDeps): ImportedGame[] {
  normalizeAccountFilter(deps.accounts);
  if (accountFilterState.mode === 'all') return deps.importedGames;
  const custom = customAccountFilter(deps.accounts);
  const mineIds = new Set(deps.accounts.filter(a => a.category === 'mine').map(a => a.id));
  const accountIds = new Set(custom.accountIds);
  return deps.importedGames.filter(g => {
    if (g.accountId === undefined) return custom.includeMine;
    return accountIds.has(g.accountId) || (custom.includeMine && mineIds.has(g.accountId));
  });
}

function accountLabel(account: ChessAccount): string {
  return `${account.displayName} (${account.platform === 'chesscom' ? 'Chess.com' : 'Lichess'} · ${account.category})`;
}

function accountFilterButtonLabel(accounts: ChessAccount[]): string {
  normalizeAccountFilter(accounts);
  if (accountFilterState.mode === 'all') return 'Accounts: All accounts';
  const custom = customAccountFilter(accounts);
  const byId = new Map(accounts.map(a => [a.id, a]));
  const labels: string[] = [];
  if (custom.includeMine) labels.push('My accounts');
  for (const id of custom.accountIds) {
    const account = byId.get(id);
    if (account) labels.push(account.displayName);
  }
  if (labels.length === 0) return 'Accounts: My accounts';
  if (labels.length <= 2) return `Accounts: ${labels.join(' + ')}`;
  return `Accounts: ${labels.length} selected`;
}

/** Account lens switcher shared by the compact and full games lists. */
function renderAccountLensSelect(deps: GamesViewDeps): VNode {
  normalizeAccountFilter(deps.accounts);
  const custom: CustomAccountFilterState = accountFilterState.mode === 'custom'
    ? customAccountFilter(deps.accounts)
    : { mode: 'custom', includeMine: false, accountIds: [] };
  const selectedIds = new Set(custom.accountIds);
  const toggleAccount = (id: string): void => {
    const nextIds = new Set(custom.accountIds);
    nextIds.has(id) ? nextIds.delete(id) : nextIds.add(id);
    applyAccountFilterState({ mode: 'custom', includeMine: custom.includeMine, accountIds: [...nextIds] }, deps);
  };

  return h('div.games-view__account-filter', [
    h('button.games-view__account-trigger', {
      class: { active: accountFilterMenuOpen },
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({
          label: 'Choose game accounts',
          description: `${accountFilterButtonLabel(deps.accounts)} is the current account lens.`,
        }),
        'aria-haspopup': 'true',
        'aria-expanded': String(accountFilterMenuOpen),
      },
      on: { click: () => { accountFilterMenuOpen = !accountFilterMenuOpen; deps.redraw(); } },
    }, accountFilterButtonLabel(deps.accounts)),
    accountFilterMenuOpen ? h('button.games-view__account-backdrop', {
      attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Close account filter' }) },
      on: { click: () => { accountFilterMenuOpen = false; deps.redraw(); } },
    }) : null,
    accountFilterMenuOpen ? h('div.games-view__account-menu', [
      h('button.games-view__account-option', {
        class: { active: accountFilterState.mode === 'all' },
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Show all accounts', description: 'Include games from every configured account.',
        }) },
        on: { click: () => applyAccountFilterState({ mode: 'all' }, deps) },
      }, [
        h('span.games-view__account-check', accountFilterState.mode === 'all' ? '✓' : ''),
        h('span', 'All accounts'),
      ]),
      h('button.games-view__account-option', {
        class: { active: accountFilterState.mode === 'custom' && custom.includeMine },
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Toggle my accounts', description: 'Include or exclude games owned by your accounts.',
        }) },
        on: { click: () => applyAccountFilterState({
          mode: 'custom',
          includeMine: !custom.includeMine,
          accountIds: custom.accountIds,
        }, deps) },
      }, [
        h('span.games-view__account-check', accountFilterState.mode === 'custom' && custom.includeMine ? '✓' : ''),
        h('span', 'My accounts'),
      ]),
      deps.accounts.length > 0 ? h('div.games-view__account-menu-sep') : null,
      ...deps.accounts.map(account =>
        h('button.games-view__account-option', {
          class: { active: accountFilterState.mode === 'custom' && selectedIds.has(account.id) },
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: `Toggle ${account.displayName}`, description: `Include or exclude games imported for ${accountLabel(account)}.`,
          }) },
          on: { click: () => toggleAccount(account.id) },
        }, [
          h('span.games-view__account-check', accountFilterState.mode === 'custom' && selectedIds.has(account.id) ? '✓' : ''),
          h('span', accountLabel(account)),
        ]),
      ),
    ]) : null,
  ]);
}

function gamesSortKeyForQuery(field: GamesSortField): GameFilterSortKey {
  if (field === 'date') return 'playedAt';
  if (field === 'opponent') return 'opponentName';
  if (field === 'timeClass') return 'timeClass';
  return 'ownerResult';
}

function playedDateRangeQuery(fromDate: string, toDate: string): GameFilterQuery['playedDate'] {
  if (!fromDate && !toDate) return undefined;
  return {
    ...(fromDate ? { from: Date.parse(`${fromDate}T00:00:00Z`) } : {}),
    ...(toDate ? { to: Date.parse(`${toDate}T23:59:59.999Z`) } : {}),
  };
}

function filteredGamesQuery(): GameFilterQuery {
  const playedDate = playedDateRangeQuery(gamesFilterDateFrom, gamesFilterDateTo);
  return {
    ...(gamesFilterResults.size > 0 ? { results: [...gamesFilterResults] } : {}),
    ...(gamesFilterSpeeds.size > 0 ? { timeClasses: [...gamesFilterSpeeds] } : {}),
    ...(gamesFilterOpponent.trim() ? { opponents: [gamesFilterOpponent.trim()] } : {}),
    ...(gamesFilterColor ? { colors: [gamesFilterColor] } : {}),
    ...(gamesFilterTactics.size > 0
      ? { missedTactics: [...gamesFilterTactics].filter(isGameFilterMissedTacticSeverity) }
      : {}),
    ...(gamesFilterOpening.trim() ? { openings: [gamesFilterOpening.trim()] } : {}),
    ...(gamesFilterRatingMin !== null || gamesFilterRatingMax !== null
      ? {
          opponentRating: {
            ...(gamesFilterRatingMin !== null ? { from: gamesFilterRatingMin } : {}),
            ...(gamesFilterRatingMax !== null ? { to: gamesFilterRatingMax } : {}),
          },
        }
      : {}),
    ...(playedDate ? { playedDate } : {}),
    ...(gamesFilterReviewIssues === 'failed-skipped' ? { reviewIssues: ['failed-skipped'] } : {}),
    sort: { key: gamesSortKeyForQuery(gamesSortField), direction: gamesSortDir },
  };
}

function filteredGames(deps: GamesViewDeps): ImportedGame[] {
  return filterImportedGamesWithQuery(accountLensGames(deps), deps, filteredGamesQuery());
}

function compactGameListQuery(): GameFilterQuery {
  return {
    ...(gameListSearch.trim() ? { textAny: gameListSearch.trim() } : {}),
    ...(gameListFilterResults.size > 0 ? { results: [...gameListFilterResults] } : {}),
    ...(gameListFilterSpeeds.size > 0 ? { timeClasses: [...gameListFilterSpeeds] } : {}),
    ...(gameListFilterColor ? { colors: [gameListFilterColor] } : {}),
    ...(gameListFilterReview === 'reviewed'
      ? { analysisStates: ['analyzed'] }
      : gameListFilterReview === 'not-reviewed'
      ? { analysisStates: ['not-analyzed'] }
      : {}),
    sort: { key: 'playedAt', direction: 'desc' },
  };
}

function filteredCompactGameListGames(deps: GamesViewDeps): ImportedGame[] {
  return filterImportedGamesWithQuery(accountLensGames(deps), deps, compactGameListQuery());
}

export function getFilteredGameIdsForTests(deps: GamesViewDeps): string[] {
  hydrateGamesRouteState(deps);
  return filteredGames(deps).map(game => game.id);
}

export function getCompactGameListIdsForTests(deps: GamesViewDeps): string[] {
  return filteredCompactGameListGames(deps).map(game => game.id);
}

function opponentName(
  game: ImportedGame,
  getUserColor: (g: ImportedGame) => 'white' | 'black' | null,
): string | undefined {
  const color = getUserColor(game);
  if (color === 'white') return game.black;
  if (color === 'black') return game.white;
  // If user color unknown, show white vs black
  return (game.white && game.black) ? `${game.white} vs ${game.black}` : undefined;
}



function opponentRating(
  game: ImportedGame,
  getUserColor: (g: ImportedGame) => 'white' | 'black' | null,
): number | undefined {
  const color = getUserColor(game);
  return color === 'white' ? game.blackRating : color === 'black' ? game.whiteRating : undefined;
}

const SORT_FIELD_LABEL: Record<GamesSortField, string> = {
  date: 'Date', result: 'Result', opponent: 'Opponent', timeClass: 'Time',
};

// Toolbar sort pill — replaces the old sortable-table-header affordance now that the full
// Games page renders a row feed instead of a `<table>`; keeps the same gamesSortField/
// gamesSortDir pipeline and click-to-toggle-direction behavior as the retired `<th>` version.
function renderSortPill(field: GamesSortField, deps: GamesViewDeps): VNode {
  const active = gamesSortField === field;
  const arrow  = active ? (gamesSortDir === 'desc' ? ' ↓' : ' ↑') : '';
  return h('button.games-view__pill', {
    class: { active },
    attrs: { type: 'button', ...controlExplainerAttrs({
      label: `Sort by ${SORT_FIELD_LABEL[field]}`,
      description: active ? `Games are sorted ${gamesSortDir === 'desc' ? 'descending' : 'ascending'} by this field.` : 'Sort games by this field.',
    }) },
    on:    { click: () => toggleGamesSort(field, deps) },
  }, SORT_FIELD_LABEL[field] + arrow);
}



function renderGamesChip(label: string, onRemove: () => void): VNode {
  return h('span.games-view__chip', [
    h('span.games-view__chip-label', label),
    h('button.games-view__chip-remove', {
      attrs: { type: 'button', ...iconControlExplainerAttrs({ label: `Remove filter: ${label}` }) },
      on: { click: onRemove },
    }, '✕'),
  ]);
}

function renderGamesPageButton(
  label: string,
  visibleText: string,
  description: string,
  disabledReason: string | null,
  onClick: () => void,
): VNode {
  const explainer = { label, description: disabledReason ?? description };
  const control = h('button.games-view__page-btn', {
    attrs: { type: 'button', disabled: Boolean(disabledReason), ...controlExplainerAttrs(explainer) },
    on: { click: onClick },
  }, visibleText);
  return disabledReason ? renderDisabledControlExplainer(explainer, control) : control;
}

const SPEED_ICONS: Record<string, string> = {
  ultrabullet: '\ue059',
  bullet:      '\ue032',
  blitz:       '\ue008',
  rapid:       '\ue002',
  classical:   '\ue007', // licon.Turtle
};

// ---------------------------------------------------------------------------
// Multi-select helpers
// ---------------------------------------------------------------------------

/**
 * Handle a game row click with optional modifier keys.
 * - ctrl/cmd+click: toggle game in selection set without navigating
 * - shift+click: range-select from last clicked to current in the visible list
 * - plain click: clear selection, load the game (existing single-game behavior)
 */
function handleGameRowClick(
  game: ImportedGame,
  visibleGames: ImportedGame[],
  e: MouseEvent | KeyboardEvent,
  deps: GamesViewDeps,
  onPlainClick: () => void,
): void {
  if (e.ctrlKey || e.metaKey || selectModeActive) {
    const s = new Set(selectedGameIds);
    s.has(game.id) ? s.delete(game.id) : s.add(game.id);
    selectedGameIds = s;
    lastClickedGameId = game.id;
    deps.redraw();
  } else if (e.shiftKey && lastClickedGameId) {
    const lastIdx = visibleGames.findIndex(g => g.id === lastClickedGameId);
    const curIdx  = visibleGames.findIndex(g => g.id === game.id);
    if (lastIdx >= 0 && curIdx >= 0) {
      const from = Math.min(lastIdx, curIdx);
      const to   = Math.max(lastIdx, curIdx);
      const s    = new Set(selectedGameIds);
      for (let i = from; i <= to; i++) s.add(visibleGames[i]!.id);
      selectedGameIds = s;
    }
    deps.redraw();
  } else {
    selectedGameIds   = new Set();
    lastClickedGameId = game.id;
    onPlainClick();
  }
}

function selectAnalysisGame(game: ImportedGame, deps: GamesViewDeps): void {
  deps.selectGame(game);
  writeHashRoute(serializeAnalysisSelectedGameRoute(game.id));
}

// ---------------------------------------------------------------------------
// Exported render functions
// ---------------------------------------------------------------------------







export function renderGameList(deps: GamesViewDeps): VNode {
  if (deps.importedGames.length === 0) return h('div');

  const lensGames = accountLensGames(deps);
  const q = gameListSearch.trim().toLowerCase();
  const visible = filteredCompactGameListGames(deps);

  const anyFilter = q.length > 0 || gameListFilterResults.size > 0 ||
    gameListFilterSpeeds.size > 0 || gameListFilterColor !== '' || gameListFilterReview !== '';

  const totalPages = Math.max(1, Math.ceil(visible.length / gameListPageSize));
  if (gameListPage >= totalPages) gameListPage = totalPages - 1;
  if (gameListPage < 0) gameListPage = 0;

  const pageStart = gameListPage * gameListPageSize;
  const pageEnd = Math.min(visible.length, pageStart + gameListPageSize);
  const pageGames = visible.slice(pageStart, pageEnd);
  const visibleRangeLabel = visible.length === 0 ? '0' : `${pageStart + 1}-${pageEnd}`;

  const countLabel = anyFilter
    ? `${visibleRangeLabel} of ${visible.length} matching (${lensGames.length} total)`
    : `${visibleRangeLabel} of ${lensGames.length} game${lensGames.length === 1 ? '' : 's'}`;

  const toggleResult = (r: 'win' | 'loss' | 'draw') => {
    const s = new Set(gameListFilterResults);
    s.has(r) ? s.delete(r) : s.add(r);
    gameListFilterResults = s;
    resetGameListPage();
    deps.redraw();
  };

  const toggleSpeed = (tc: string) => {
    const s = new Set(gameListFilterSpeeds);
    s.has(tc) ? s.delete(tc) : s.add(tc);
    gameListFilterSpeeds = s;
    resetGameListPage();
    deps.redraw();
  };

  const toggleColor = (color: 'white' | 'black') => {
    gameListFilterColor = gameListFilterColor === color ? '' : color;
    resetGameListPage();
    deps.redraw();
  };

  const toggleReview = (review: Exclude<GameListReviewFilter, ''>) => {
    gameListFilterReview = gameListFilterReview === review ? '' : review;
    resetGameListPage();
    deps.redraw();
  };

  const clearAll = () => {
    gameListSearch = '';
    gameListFilterResults = new Set();
    gameListFilterSpeeds = new Set();
    gameListFilterColor = '';
    gameListFilterReview = '';
    resetGameListPage();
    deps.redraw();
  };

  const listSelectedCount = [...selectedGameIds].filter(id => lensGames.some(g => g.id === id)).length;

  const toolbar = h('div.game-list__toolbar', [
    h('div.game-list__toolbar-top', [
      renderAccountLensSelect(deps),



      h('div.game-list__density-toggle', [
        h('button.games-view__density-btn', {
          class: { active: gameListDensity === 'rich' },
          attrs: { type: 'button', 'aria-pressed': String(gameListDensity === 'rich'), ...controlExplainerAttrs({
            label: 'Rich row view', description: 'Show rich game cards when the panel is wide enough.',
          }) },
          on: { click: () => { if (gameListDensity !== 'rich') { setGameListDensity('rich'); deps.redraw(); } } },
        }, '▤'),
        h('button.games-view__density-btn', {
          class: { active: gameListDensity === 'compact' },
          attrs: { type: 'button', 'aria-pressed': String(gameListDensity === 'compact'), ...controlExplainerAttrs({
            label: 'Compact row view', description: 'Show games as compact rows.',
          }) },
          on: { click: () => { if (gameListDensity !== 'compact') { setGameListDensity('compact'); deps.redraw(); } } },
        }, '☰'),
      ]),
    ]),
    h('input.games-view__search', {
      attrs: { type: 'search', name: 'game-list-search', placeholder: 'Search opponent/opening...', value: gameListSearch, ...controlExplainerAttrs({
        label: 'Search games', description: 'Filter games by opponent or opening.',
      }) },
      on: { input: (e: Event) => { gameListSearch = (e.target as HTMLInputElement).value; resetGameListPage(); deps.redraw(); } },
    }),



    h('div.game-list__filter-pills', [
      h('button.games-view__pill.--review-filter', {
        class: { active: gameListFilterReview === 'reviewed' },
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({ label: 'Analyzed games', description: 'Toggle games with completed engine analysis.' }),
          'aria-pressed': String(gameListFilterReview === 'reviewed'),
        },
        on: { click: () => toggleReview('reviewed') },
      }, 'Analyzed'),
      h('button.games-view__pill.--review-filter', {
        class: { active: gameListFilterReview === 'not-reviewed' },
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({ label: 'Not analyzed games', description: 'Toggle games without completed engine analysis.' }),
          'aria-pressed': String(gameListFilterReview === 'not-reviewed'),
        },
        on: { click: () => toggleReview('not-reviewed') },
      }, 'Not analyzed'),
      ...(['win', 'loss', 'draw'] as const).map(r =>
        h('button.games-view__pill', {
          class: { active: gameListFilterResults.has(r) },
          attrs: controlExplainerAttrs({ label: `${r} games`, description: `Toggle games recorded as a ${r}.` }),
          on: { click: () => toggleResult(r) },
        }, r.charAt(0).toUpperCase() + r.slice(1)),
      ),
      h('button.games-view__pill.--more', {
        class: { active: gameListMorePillsOpen },
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({
            label: gameListMorePillsOpen ? 'Hide more filters' : 'Show more filters',
            description: 'Show or hide color and time-control filters.',
          }),
          'aria-expanded': String(gameListMorePillsOpen),
        },
        on: { click: () => { gameListMorePillsOpen = !gameListMorePillsOpen; deps.redraw(); } },
      }, gameListMorePillsOpen ? 'More ▴' : 'More ▾'),
      anyFilter
        ? h('button.games-view__clear', {
            attrs: iconControlExplainerAttrs({ label: 'Clear filters', description: 'Remove every active game-list filter.' }),
            on: { click: clearAll },
          }, '×')
        : null,
      // Select mode toggle — primary way to multi-select on touch devices.
      // On desktop, ctrl/cmd+click still works alongside this button.
      h('button.games-view__select-toggle', {
        class: { active: selectModeActive },
        attrs: controlExplainerAttrs({
          label: selectModeActive ? 'Exit game selection' : 'Select games',
          description: 'Toggle game selection for bulk analysis.',
        }),
        on: { click: () => {
          selectModeActive = !selectModeActive;
          if (!selectModeActive) selectedGameIds = new Set();
          deps.redraw();
        }},
      }, selectModeActive ? 'Done' : 'Select'),
      listSelectedCount > 1
        ? h('button.games-view__review-all-btn', {
            on: { click: () => {
              const selectedGames = selectedGamesInCurrentVisibleOrder(lensGames);
              const { batchGames, sourceContext } = selectedReviewRunStart(selectedGames);
              selectedGameIds = new Set();
              selectModeActive = false;
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: controlExplainerAttrs({
              label: `Analyze ${listSelectedCount} selected games`, description: 'Queue the selected games for sequential engine analysis.',
            }),
          }, `Analyze ${listSelectedCount}`)
        : null,
      pageGames.length > 1
        ? h('button.games-view__review-all-btn', {
            on: { click: () => {
              const { batchGames, sourceContext } = fixedVisibleListReviewRunStart(pageGames, 'date', 'desc');
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: controlExplainerAttrs({
              label: 'Analyze all games on this page', description: 'Queue the visible page for sequential engine analysis.',
            }),
          }, 'Analyze All')
        : null,
    ]),
    gameListMorePillsOpen ? h('div.game-list__filter-pills.--overflow', [
      ...(['white', 'black'] as const).map(color =>
        h('button.games-view__pill', {
          class: { active: gameListFilterColor === color },
          attrs: {
            type: 'button',
            ...controlExplainerAttrs({ label: `${color} games`, description: `Toggle games where the selected account played ${color}.` }),
            'aria-pressed': String(gameListFilterColor === color),
          },
          on: { click: () => toggleColor(color) },
        }, color.charAt(0).toUpperCase() + color.slice(1)),
      ),
      ...(['bullet', 'blitz', 'rapid'] as const).map(tc =>
        h('button.games-view__pill', {
          class: { active: gameListFilterSpeeds.has(tc) },
          attrs: { 'data-icon': SPEED_ICONS[tc] ?? '', ...controlExplainerAttrs({
            label: `${tc} games`, description: `Toggle ${tc} games.`,
          }) },
          on: { click: () => toggleSpeed(tc) },
        }, tc.charAt(0).toUpperCase() + tc.slice(1)),
      ),
    ]) : null,
    h('div.game-list__page-size', [
      h('span.game-list__page-size-label', 'Show'),
      ...GAME_LIST_PAGE_SIZE_OPTIONS.map(size =>
        h('button.game-list__page-size-btn', {
          class: { active: gameListPageSize === size },
          attrs: {
            type: 'button',
            ...controlExplainerAttrs({ label: `Show ${size} games`, description: `Set the page size to ${size} games.` }),
            'aria-pressed': String(gameListPageSize === size),
          },
          on: { click: () => { setGameListPageSize(size); deps.redraw(); } },
        }, String(size)),
      ),
    ]),
  ]);

  const queueSummaryCandidate = getQueueSummary();
  const queueSummary = queueSummaryCandidate.running
    || queueSummaryCandidate.paused
    || queueSummaryCandidate.lifecycleState === 'batch-complete'
    || queueSummaryCandidate.lifecycleState === 'no-more-eligible-games'
    || queueSummaryCandidate.lifecycleState === 'stale'
    ? queueSummaryCandidate
    : null;
  const queueItemsByGameId = new Map(getReviewQueueItems().map(item => [item.gameId, item]));
  const totalWaveCount = [...queueItemsByGameId.values()].reduce((max, item) => Math.max(max, item.waveIndex + 1), 1);
  // Rich rows only actually render once the ResizeObserver (installed below) confirms the
  // underboard is wide enough; otherwise the ▤ preference still shows compact v2 rows.
  const effectiveDensity: UnderboardDensity = gameListDensity === 'rich' && gameListWideEnough ? 'rich' : 'compact';
  const paginationBar = totalPages > 1 ? h('div.game-list__pagination', [
    renderGamesPageButton('Previous games page', 'Prev', 'Show the previous page of games.',
      gameListPage === 0 ? 'You are on the first games page.' : null,
      () => { gameListPage--; deps.redraw(); }),
    h('span.games-view__page-info', `Page ${gameListPage + 1} of ${totalPages}`),
    renderGamesPageButton('Next games page', 'Next', 'Show the next page of games.',
      gameListPage >= totalPages - 1 ? 'You are on the last games page.' : null,
      () => { gameListPage++; deps.redraw(); }),
  ]) : null;

  return h('div.game-list', {
    hook: {
      insert: vnode => observeGameListWidth(vnode, deps.redraw),
      destroy: unobserveGameListWidth,
    },
  }, [
    h('div.game-list__header', countLabel),
    toolbar,
    queueSummary
      ? h('div.game-list__queue-status', {
          class: {
            '--active': queueSummary.running,
            '--stalled': queueSummary.paused || queueSummary.lifecycleState === 'stale',
          },
          hook: {
            insert: () => bindQueueHealthStatus(deps.redraw),
            destroy: unbindQueueHealthStatus,
          },
        }, (() => {
          const elapsed = formatReviewDuration(queueSummary.elapsedSeconds);
          const role = isLeaderTab() ? 'leader' : 'observer';
          const reviewContext = getReviewCrashContext();
          const details = [
            `Queue depth: ${queueSummary.total}`,
            `Role: ${role}`,
            reviewContext ? `Analyzing: ${reviewContext.safeGameId ?? 'unknown'}` : null,
            reviewContext ? `Progress: ${reviewContext.positionsDone} / ${reviewContext.totalPositions} positions` : null,
            `Watchdog: ${queueSummary.watchdogTriggered ? 'triggered' : 'alive'}`,
            queueSummary.watchdogLastTriggerTimestamp !== null
              ? `Last trigger: ${new Date(queueSummary.watchdogLastTriggerTimestamp).toLocaleString()}`
              : null,
            `Last checkpoint: ${
              queueSummary.lastCheckpointTimestamp !== null
                ? new Date(queueSummary.lastCheckpointTimestamp).toLocaleString()
                : 'none'
            }`,
            queueSummary.failed > 0 ? `${queueSummary.failed} failed` : null,
            queueSummary.skipped > 0 ? `${queueSummary.skipped} skipped` : null,
            queueSummary.paused ? 'paused' : null,
          ].filter(Boolean).join(' · ');
          const suffix = `games${details ? ` · ${details}` : ''}…${elapsed ? ` Elapsed ${elapsed}` : ''}`;
          return [
            'Analyzing ',
            h('span.game-list__queue-counter', `${queueSummary.done} / ${queueSummary.total}`),
            ` ${suffix}`,
          ];
        })())
      : null,
    visible.length === 0
      ? h('div.game-list__no-results', 'No games match.')
      : h('ul', pageGames.map(game => {
          const isAnalyzed       = isReviewedGame(deps, game.id);
          const hasMissedTactic  = deps.missedTacticGameIds.has(game.id);
          const srcUrl           = deps.gameSourceUrl(game);
          const queueItem        = queueItemsByGameId.get(game.id);
          const { state, opts }  = richRowReviewState(deps, game, queueSummary, queueItemsByGameId, totalWaveCount);
          const accuracy         = richRowAccuracy(deps, game, isAnalyzed);
          const secondaryActions = richRowSecondaryActions(deps, game, visible, state);

          const srcLink = srcUrl ? h('a.game-ext-link', {
            attrs: { href: srcUrl, target: '_blank', rel: 'noopener', ...iconControlExplainerAttrs({
              label: 'View source game', description: 'Open this game on its source platform in a new tab.',
            }) },
            on: { click: (e: Event) => e.stopPropagation() },
          }) : null;

          if (effectiveDensity === 'rich') {
            const rowDeps: RichGameRowDeps = {
              selected:    selectedGameIds.has(game.id),
              open:        game.id === deps.selectedGameId,
              ...(accuracy !== undefined ? { accuracy } : {}),
              reviewState: state,
              reviewOpts:  opts,
              icons:       richRowIcons(deps, game),
              tags:        richRowTags(deps, game),
              addLibrary:  null,
              ...(secondaryActions.length > 0 ? { secondaryActions } : {}),
              onSelectRow: (g, e) => handleGameRowClick(g, visible, e, deps, () => selectAnalysisGame(g, deps)),
              sourceUrl:   srcUrl ?? null,
            };



            return h('li', { class: reviewRunWaveClasses(queueItem) }, [
              renderRichGameRow(game, rowDeps),
            ]);
          }

          return h('li', {
            class: reviewRunWaveClasses(queueItem),
          }, [
            h('button.game-list__row', {
              class: {
                active:    game.id === deps.selectedGameId,
                selected:  selectedGameIds.has(game.id),
                analyzing: state.kind === 'running',
              },
              attrs: controlExplainerAttrs({
                label: `Open ${game.white || 'White'} versus ${game.black || 'Black'}`,
                description: 'Open this game on the Analysis Board.',
              }),
              on: { click: (e: MouseEvent) => handleGameRowClick(game, visible, e, deps, () => selectAnalysisGame(game, deps)) },
            }, deps.renderCompactGameRow(game, isAnalyzed, hasMissedTactic, accuracy, {
              tags: richRowTags(deps, game),
              reviewState: state,
              addLibrary: null,
            })),
            h('div.grr__review-group', [
              renderReviewControl(state, { ...opts, compact: true }),
              renderSecondaryActions(secondaryActions),
            ]),
            srcLink,
          ]);
        })),
    paginationBar,
  ]);
}









/** Per-game accuracy for the shared row renderers; undefined until Game Review data exists. */
function richRowAccuracy(
  deps: GamesViewDeps,
  game: ImportedGame,
  isAnalyzed: boolean,
): { user: number | null; opp: number | null } | undefined {
  if (!isAnalyzed) return undefined;
  const accEntry = reviewedAccuracyForGame(deps, game.id);
  if (!accEntry) return undefined;
  const userColor = deps.getUserColor(game);
  return {
    user: userColor === 'white' ? accEntry.white : userColor === 'black' ? accEntry.black : null,
    opp:  userColor === 'white' ? accEntry.black : userColor === 'black' ? accEntry.white : null,
  };
}

function richRowIcons(deps: GamesViewDeps, game: ImportedGame): RichRowIconInputs {
  const hasMissedTactic = deps.missedTacticGameIds.has(game.id);
  const severities = gameTacticsSeverities(game.id, hasMissedTactic);
  const missedTacticSeverity = severities.has('!!!') ? 3 : severities.has('!!') ? 2 : severities.has('!') ? 1 : undefined;
  return {
    hasMissedMate: severities.has('M?!'),
    ...(missedTacticSeverity !== undefined ? { missedTacticSeverity } : {}),
  };
}

function richRowTags(deps: GamesViewDeps, game: ImportedGame): RichRowTagInputs {
  const generatedPuzzleCount = deps.savedPuzzles.filter(p => p.gameId === game.id).length;
  return generatedPuzzleCount > 0 ? { generatedPuzzleCount } : {};
}

/**
 * Maps this game's current review/queue status to the shared seven-state review control model
 * (unreviewed/queued/running/failed/reviewed/stalled/incomplete). Mirrors the exact resting-order
 * priority the retired `<table>` review cell used: errored > analyzing > pending > incomplete >
 * unreviewed. `totalWaveCount` comes from scanning the already-fetched queue items list (no new
 * reviewQueue.ts reads).
 */
function richRowReviewState(
  deps: GamesViewDeps,
  game: ImportedGame,
  queueSummary: QueueSummary | null,
  queueItemsByGameId: ReadonlyMap<string, ReviewQueueItemView>,
  totalWaveCount: number,
): { state: ReviewControlState; opts: ReviewControlOpts } {
  if (isReviewedGame(deps, game.id)) {
    return {
      state: { kind: 'reviewed' },
      opts:  { onOpenReview: () => selectAnalysisGame(game, deps) },
    };
  }

  if (isGameErrored(game.id)) {
    const failedStatus = getFailedReviewStatus(game.id);
    return {
      state: { kind: 'failed', ...(failedStatus ? { attempts: failedStatus.attempts } : {}) },
      opts: {
        onRetry: () => { enqueueBulkReview([game]); deps.redraw(); },
        onSkip:  () => { skipFailedReviewGame(game.id); deps.redraw(); },
      },
    };
  }

  const queueItem      = queueItemsByGameId.get(game.id);
  const reviewProgress = getReviewProgress(game.id);
  const isAnalyzing    = reviewProgress !== undefined && reviewProgress < 100;
  const isPending      = !isAnalyzing && queueItem !== undefined;
  const lifecycleLabel = reviewRowLifecycleLabel(queueSummary, game.id, queueItem);

  if (isAnalyzing) {
    if (lifecycleLabel?.modifier === 'warning') {
      return { state: { kind: 'stalled' }, opts: { onResume: () => { enqueueBulkReview([game]); deps.redraw(); } } };
    }
    return { state: { kind: 'running', percent: reviewProgress ?? 0 }, opts: {} };
  }

  if (isPending) {
    const wave = (queueItem?.waveIndex ?? 0) + 1;
    return { state: { kind: 'queued', wave, totalWaves: Math.max(wave, totalWaveCount) }, opts: {} };
  }

  if (reviewIncompleteStatusForGame(deps, game.id)) {
    return {
      state: { kind: 'incomplete' },
      opts:  { onResume: () => { enqueueBulkReview([game]); deps.redraw(); } },
    };
  }

  return {
    state: { kind: 'unreviewed' },
    opts:  { onReview: () => { enqueueBulkReview([game]); deps.redraw(); } },
  };
}












function richRowSecondaryActions(
  deps: GamesViewDeps,
  game: ImportedGame,
  allFilteredGames: ImportedGame[],
  reviewState: ReviewControlState,
): RichRowSecondaryAction[] {
  if (reviewState.kind !== 'unreviewed' || !isBulkRunning()) return [];
  const bulkGames = () => selectedGameIds.size > 1 && selectedGameIds.has(game.id)
    ? allFilteredGames.filter(g => selectedGameIds.has(g.id))
    : [game];
  return [
    {
      glyph: '⬆',
      title: 'Analyze next',
      onClick: () => {


        enqueueAtFront(bulkGames(), undefined, 'bulk');
        deps.redraw();
      },
    },
    {
      glyph: '⬇',
      title: 'Add to queue',
      onClick: () => {
        appendBulkReviewRunSource(bulkGames());
        deps.redraw();
      },
    },
  ];
}

/** Full Games page, density: 'full' — rich row feed (thumbnails, players, review control). */
function renderRichRowsFeed(
  deps: GamesViewDeps,
  games: ImportedGame[],
  allFilteredGames: ImportedGame[],
  queueSummary: QueueSummary | null,
  queueItemsByGameId: ReadonlyMap<string, ReviewQueueItemView>,
  totalWaveCount: number,
): VNode {
  return h('div.games-view__feed', games.map(game => {
    const isAnalyzed = isReviewedGame(deps, game.id);
    const { state, opts } = richRowReviewState(deps, game, queueSummary, queueItemsByGameId, totalWaveCount);
    const accuracy = richRowAccuracy(deps, game, isAnalyzed);
    const secondaryActions = richRowSecondaryActions(deps, game, allFilteredGames, state);
    const rowDeps: RichGameRowDeps = {
      selected:    selectedGameIds.has(game.id),
      open:        game.id === deps.selectedGameId,
      ...(accuracy !== undefined ? { accuracy } : {}),
      reviewState: state,
      reviewOpts:  opts,
      icons:       richRowIcons(deps, game),
      tags:        richRowTags(deps, game),
      addLibrary:  null,
      ...(secondaryActions.length > 0 ? { secondaryActions } : {}),
      onSelectRow: (g, e) => handleGameRowClick(g, games, e, deps, () => selectAnalysisGame(g, deps)),
      sourceUrl:   deps.gameSourceUrl(game) ?? null,
    };
    return renderRichGameRow(game, rowDeps);
  }));
}

/**
 * Full Games page, density: 'compact' — reuses deps.renderCompactGameRow's fragments (the same
 * compact row style as the underboard game list) plus the shared renderReviewControl, per the
 * Phase 1 design's "compact review control states match the full set."
 */
function renderGamesCompactFeed(
  deps: GamesViewDeps,
  games: ImportedGame[],
  allFilteredGames: ImportedGame[],
  queueSummary: QueueSummary | null,
  queueItemsByGameId: ReadonlyMap<string, ReviewQueueItemView>,
  totalWaveCount: number,
): VNode {
  return h('div.game-list', [
    h('ul', games.map(game => {
      const isAnalyzed      = isReviewedGame(deps, game.id);
      const hasMissedTactic = deps.missedTacticGameIds.has(game.id);
      const srcUrl          = deps.gameSourceUrl(game);
      const queueItem       = queueItemsByGameId.get(game.id);
      const { state, opts } = richRowReviewState(deps, game, queueSummary, queueItemsByGameId, totalWaveCount);
      const secondaryActions = richRowSecondaryActions(deps, game, allFilteredGames, state);

      return h('li', { class: reviewRunWaveClasses(queueItem) }, [
        h('button.game-list__row', {
          class: {
            active:   game.id === deps.selectedGameId,
            selected: selectedGameIds.has(game.id),
          },
          attrs: controlExplainerAttrs({
            label: `Open ${game.white || 'White'} versus ${game.black || 'Black'}`,
            description: 'Open this game on the Analysis Board.',
          }),
          on: { click: (e: MouseEvent) => handleGameRowClick(game, games, e, deps, () => selectAnalysisGame(game, deps)) },
        }, deps.renderCompactGameRow(game, isAnalyzed, hasMissedTactic, richRowAccuracy(deps, game, isAnalyzed))),
        h('div.grr__review-group', [
          renderReviewControl(state, { ...opts, compact: true }),
          renderSecondaryActions(secondaryActions),
        ]),
        srcUrl ? h('a.game-ext-link', {
          attrs: { href: srcUrl, target: '_blank', rel: 'noopener', ...iconControlExplainerAttrs({
            label: 'View source game', description: 'Open this game on its source platform in a new tab.',
          }) },
          on: { click: (e: Event) => e.stopPropagation() },
        }) : null,
      ]);
    })),
  ]);
}

/** Full Games tab view: filter bar + density-switchable row feed (rich or compact). */
export function renderGamesView(deps: GamesViewDeps): VNode {
  hydrateGamesRouteState(deps);
  const games = filteredGames(deps);
  finalizeGamesRouteHydration(deps, games.length);
  const lensTotal = accountLensGames(deps).length;
  const { redraw } = deps;




  const totalPages = Math.max(1, Math.ceil(games.length / GAMES_PAGE_SIZE));
  if (gamesPage >= totalPages) gamesPage = totalPages - 1;
  if (gamesPage < 0) gamesPage = 0;
  const pageStart = gamesPage * GAMES_PAGE_SIZE;
  const pageGames = games.slice(pageStart, pageStart + GAMES_PAGE_SIZE);





  const filterBar = h('div.games-view__controls', [
    // Account lens
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Account'),
      renderAccountLensSelect(deps),
    ]),



    h('div.games-view__filter-group', [
      h('button.games-view__advanced-toggle', {
        class: { active: gamesAdvancedPanelOpen },
        attrs: { type: 'button', 'aria-expanded': String(gamesAdvancedPanelOpen), ...controlExplainerAttrs({
          label: gamesAdvancedPanelOpen ? 'Hide advanced search' : 'Show advanced search',
          description: 'Show or hide opponent, opening, rating, date, and sort controls.',
        }) },
        on: { click: () => { gamesAdvancedPanelOpen = !gamesAdvancedPanelOpen; redraw(); } },
      }, gamesAdvancedPanelOpen ? 'Advanced search ▴' : 'Advanced search ▾'),
    ]),

    // Summary + clear + multi-select review
    h('div.games-view__filter-group.--right', [


      h('div.games-view__density-toggle', [
        h('button.games-view__density-btn', {
          class: { active: gamesDensity === 'full' },
          attrs: { type: 'button', 'aria-pressed': String(gamesDensity === 'full'), ...controlExplainerAttrs({
            label: 'Rich row view', description: 'Show games as rich cards.',
          }) },
          on: { click: () => {
            if (gamesDensity === 'full') return;
            gamesDensity = 'full';
            writeCurrentGamesRouteState(deps);
            redraw();
          }},
        }, '▤'),
        h('button.games-view__density-btn', {
          class: { active: gamesDensity === 'compact' },
          attrs: { type: 'button', 'aria-pressed': String(gamesDensity === 'compact'), ...controlExplainerAttrs({
            label: 'Compact row view', description: 'Show games as compact rows.',
          }) },
          on: { click: () => {
            if (gamesDensity === 'compact') return;
            gamesDensity = 'compact';
            writeCurrentGamesRouteState(deps);
            redraw();
          }},
        }, '☰'),
      ]),
      h('span.games-view__summary', `${games.length} of ${lensTotal} game${lensTotal === 1 ? '' : 's'}`),
      h('button.games-view__clear', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Report Games issue', description: 'Open a diagnostic report for the Games page.',
        }) },
        on: { click: reportGamesIssue },
      }, 'Report issue'),
      gamesFilterActive() ? h('button.games-view__clear', {
        attrs: controlExplainerAttrs({ label: 'Clear filters', description: 'Remove every active Games filter.' }),
        on: { click: () => clearGamesFilters(deps) },
      }, 'Clear filters') : null,
      selectedGameIds.size > 1
        ? h('button.games-view__review-all-btn', {
            on: { click: () => {
              const selectedGames = selectedGamesInCurrentVisibleOrder(games);
              const { batchGames, sourceContext } = selectedReviewRunStart(selectedGames);
              selectedGameIds = new Set();
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: controlExplainerAttrs({
              label: `Analyze ${selectedGameIds.size} selected games`, description: 'Queue the selected games for sequential engine analysis.',
            }),
          }, `Analyze Selected (${selectedGameIds.size})`)
        : null,
      pageGames.length > 1
        ? h('button.games-view__review-all-btn', {
            on: { click: () => {
              const { batchGames, sourceContext } = visibleListReviewRunStart(pageGames);
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: controlExplainerAttrs({
              label: 'Analyze all games on this page', description: 'Queue the visible page for sequential engine analysis.',
            }),
          }, 'Analyze All')
        : null,
    ]),
  ]);

  // Layer 1 — quick filter pills: result, time class, color, review state, missed tactics.
  // Always visible, one-click toggles wired 1:1 onto the existing filter state (no semantics
  // change from the retired per-group toolbar layout, only presentation).
  const quickPillsBar = h('div.games-view__quick-pills', [
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Result'),
      ...(['win', 'loss', 'draw'] as GamesResultFilter[]).map(r =>
        h('button.games-view__pill.--quick', {
          class: { active: gamesFilterResults.has(r) },
          attrs: { type: 'button', 'aria-pressed': String(gamesFilterResults.has(r)), ...controlExplainerAttrs({
            label: `${r} games`, description: `Toggle games recorded as a ${r}.`,
          }) },
          on: { click: () => {
            const s = new Set(gamesFilterResults);
            s.has(r) ? s.delete(r) : s.add(r);
            gamesFilterResults = s;
            gamesPage = 0;
            writeCurrentGamesRouteState(deps);
            redraw();
          }},
        }, r.charAt(0).toUpperCase() + r.slice(1))
      ),
    ]),

    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Time'),
      ...(['bullet', 'blitz', 'rapid'] as string[]).map(tc =>
        h('button.games-view__pill.--quick', {
          class: { active: gamesFilterSpeeds.has(tc) },
          attrs: { 'data-icon': SPEED_ICONS[tc] ?? '', type: 'button', 'aria-pressed': String(gamesFilterSpeeds.has(tc)), ...controlExplainerAttrs({
            label: `${tc} games`, description: `Toggle ${tc} games.`,
          }) },
          on: { click: () => {
            const s = new Set(gamesFilterSpeeds);
            s.has(tc) ? s.delete(tc) : s.add(tc);
            gamesFilterSpeeds = s;
            gamesPage = 0;
            writeCurrentGamesRouteState(deps);
            redraw();
          }},
        }, tc.charAt(0).toUpperCase() + tc.slice(1))
      ),
    ]),

    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Color'),
      h('button.games-view__pill.--quick', {
        class: { active: gamesFilterColor === 'white' },
        attrs: { type: 'button', 'aria-pressed': String(gamesFilterColor === 'white'), ...controlExplainerAttrs({
          label: 'White games', description: 'Toggle games where the selected account played White.',
        }) },
        on: { click: () => {
          gamesFilterColor = gamesFilterColor === 'white' ? '' : 'white';
          gamesPage = 0;
          writeCurrentGamesRouteState(deps);
          redraw();
        } },
      }, 'White'),
      h('button.games-view__pill.--quick', {
        class: { active: gamesFilterColor === 'black' },
        attrs: { type: 'button', 'aria-pressed': String(gamesFilterColor === 'black'), ...controlExplainerAttrs({
          label: 'Black games', description: 'Toggle games where the selected account played Black.',
        }) },
        on: { click: () => {
          gamesFilterColor = gamesFilterColor === 'black' ? '' : 'black';
          gamesPage = 0;
          writeCurrentGamesRouteState(deps);
          redraw();
        } },
      }, 'Black'),
    ]),

    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Analysis'),
      h('button.games-view__pill.--quick', {
        class: { active: gamesFilterReviewIssues === 'failed-skipped' },
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({
            label: 'Failed or skipped analysis', description: 'Toggle games whose analysis failed or was skipped.',
          }),
          'aria-pressed': String(gamesFilterReviewIssues === 'failed-skipped'),
        },
        on: { click: () => {
          gamesFilterReviewIssues = gamesFilterReviewIssues === 'failed-skipped' ? 'all' : 'failed-skipped';
          gamesPage = 0;
          writeCurrentGamesRouteState(deps);
          redraw();
        }},
      }, 'Failed / skipped'),
    ]),

    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Misses'),
      ...(['!', '!!', '!!!', 'M?!'] as string[]).map(sev =>
        h('button.games-view__pill.--quick', {
          class: { active: gamesFilterTactics.has(sev) },
          attrs: { type: 'button', 'aria-pressed': String(gamesFilterTactics.has(sev)), ...controlExplainerAttrs({
            label: `${sev} missed tactics`, description: `Toggle games with ${sev} missed-tactic severity.`,
          }) },
          on: { click: () => {
            const s = new Set(gamesFilterTactics);
            s.has(sev) ? s.delete(sev) : s.add(sev);
            gamesFilterTactics = s;
            gamesPage = 0;
            writeCurrentGamesRouteState(deps);
            redraw();
          }},
        }, sev)
      ),
    ]),
  ]);




  const advancedChips: VNode[] = [];
  if (gamesFilterOpponent.trim()) {
    const value = gamesFilterOpponent.trim();
    advancedChips.push(renderGamesChip(`Opponent: ${value}`, () => {
      gamesFilterOpponent = '';
      gamesPage = 0;
      writeCurrentGamesRouteState(deps);
      redraw();
    }));
  }
  if (gamesFilterOpening.trim()) {
    const value = gamesFilterOpening.trim();
    advancedChips.push(renderGamesChip(`Opening: ${value}`, () => {
      gamesFilterOpening = '';
      gamesPage = 0;
      writeCurrentGamesRouteState(deps);
      redraw();
    }));
  }
  if (gamesFilterRatingMin !== null || gamesFilterRatingMax !== null) {
    const label = gamesFilterRatingMin !== null && gamesFilterRatingMax !== null
      ? `Opp rating ${gamesFilterRatingMin}–${gamesFilterRatingMax}`
      : gamesFilterRatingMin !== null
      ? `Opp rating ≥ ${gamesFilterRatingMin}`
      : `Opp rating ≤ ${gamesFilterRatingMax}`;
    advancedChips.push(renderGamesChip(label, () => {
      gamesFilterRatingMin = null;
      gamesFilterRatingMax = null;
      gamesPage = 0;
      writeCurrentGamesRouteState(deps);
      redraw();
    }));
  }
  if (gamesFilterDateFrom || gamesFilterDateTo) {
    const label = gamesFilterDateFrom && gamesFilterDateTo
      ? `Played ${gamesFilterDateFrom} – ${gamesFilterDateTo}`
      : gamesFilterDateFrom
      ? `Played since ${gamesFilterDateFrom}`
      : `Played until ${gamesFilterDateTo}`;
    advancedChips.push(renderGamesChip(label, () => {
      gamesFilterDateFrom = '';
      gamesFilterDateTo = '';
      gamesPage = 0;
      writeCurrentGamesRouteState(deps);
      redraw();
    }));
  }
  const chipsBar = (!gamesAdvancedPanelOpen && advancedChips.length > 0)
    ? h('div.games-view__chips', advancedChips)
    : null;

  // Layer 2 — advanced search panel: opponent/opening/opponent-rating-range, played-date range,
  // and sort. Collapsed by default; the panel footer holds Clear filters (clears quick pills too)
  // and Apply (collapses the panel back — filters already apply live, matching existing behavior).
  const advancedPanel = gamesAdvancedPanelOpen ? h('div.games-view__advanced-panel', [
    h('div.games-view__advanced-group', [
      h('h4.games-view__advanced-group-title', 'Opponent & opening'),
      h('div.games-view__advanced-row', [
        h('label.games-view__advanced-field', [
          h('span.games-view__filter-label', 'Opponent'),
          h('input.games-view__search', {
            attrs: { type: 'search', name: 'games-opponent', placeholder: 'Name…', value: gamesFilterOpponent, ...controlExplainerAttrs({
              label: 'Opponent name', description: 'Filter games by opponent name.',
            }) },
            on: { input: (e: Event) => {
              gamesFilterOpponent = (e.target as HTMLInputElement).value;
              gamesPage = 0;
              writeCurrentGamesRouteState(deps);
              redraw();
            } },
          }),
        ]),
        h('label.games-view__advanced-field', [
          h('span.games-view__filter-label', 'Opening'),
          h('input.games-view__search', {
            attrs: { type: 'search', name: 'games-opening', placeholder: 'Name...', value: gamesFilterOpening, ...controlExplainerAttrs({
              label: 'Opening name', description: 'Filter games by opening name.',
            }) },
            on: { input: (e: Event) => {
              gamesFilterOpening = (e.target as HTMLInputElement).value;
              gamesPage = 0;
              writeCurrentGamesRouteState(deps);
              redraw();
            } },
          }),
        ]),
        h('label.games-view__advanced-field', [
          h('span.games-view__filter-label', 'Opp rating min'),
          h('input.games-view__search.--num', {
            attrs: {
              type: 'number', min: '0', max: '4000', placeholder: 'Min',
              name: 'games-opponent-rating-min',
              value: gamesFilterRatingMin === null ? '' : String(gamesFilterRatingMin),
              ...controlExplainerAttrs({ label: 'Minimum opponent rating', description: 'Set the lowest opponent rating to include.' }),
            },
            on: { input: (e: Event) => {
              const raw = (e.target as HTMLInputElement).value.trim();
              const parsed = raw === '' ? NaN : Number(raw);
              gamesFilterRatingMin = Number.isFinite(parsed) ? Math.max(0, Math.min(4000, Math.round(parsed))) : null;
              gamesPage = 0;
              writeCurrentGamesRouteState(deps);
              redraw();
            } },
          }),
        ]),
        h('label.games-view__advanced-field', [
          h('span.games-view__filter-label', 'Opp rating max'),
          h('input.games-view__search.--num', {
            attrs: {
              type: 'number', min: '0', max: '4000', placeholder: 'Max',
              name: 'games-opponent-rating-max',
              value: gamesFilterRatingMax === null ? '' : String(gamesFilterRatingMax),
              ...controlExplainerAttrs({ label: 'Maximum opponent rating', description: 'Set the highest opponent rating to include.' }),
            },
            on: { input: (e: Event) => {
              const raw = (e.target as HTMLInputElement).value.trim();
              const parsed = raw === '' ? NaN : Number(raw);
              gamesFilterRatingMax = Number.isFinite(parsed) ? Math.max(0, Math.min(4000, Math.round(parsed))) : null;
              gamesPage = 0;
              writeCurrentGamesRouteState(deps);
              redraw();
            } },
          }),
        ]),
      ]),
    ]),
    h('div.games-view__advanced-group', [
      h('h4.games-view__advanced-group-title', 'Date'),
      h('div.games-view__advanced-row', [
        h('label.games-view__advanced-field', [
          h('span.games-view__filter-label', 'Played since'),
          h('input.games-view__search', {
            attrs: { type: 'date', name: 'games-played-since', value: gamesFilterDateFrom, ...controlExplainerAttrs({
              label: 'Played since', description: 'Include games played on or after this date.',
            }) },
            on: { input: (e: Event) => {
              gamesFilterDateFrom = (e.target as HTMLInputElement).value;
              gamesPage = 0;
              writeCurrentGamesRouteState(deps);
              redraw();
            } },
          }),
        ]),
        h('label.games-view__advanced-field', [
          h('span.games-view__filter-label', 'Played until'),
          h('input.games-view__search', {
            attrs: { type: 'date', name: 'games-played-until', value: gamesFilterDateTo, ...controlExplainerAttrs({
              label: 'Played until', description: 'Include games played on or before this date.',
            }) },
            on: { input: (e: Event) => {
              gamesFilterDateTo = (e.target as HTMLInputElement).value;
              gamesPage = 0;
              writeCurrentGamesRouteState(deps);
              redraw();
            } },
          }),
        ]),
      ]),
    ]),
    h('div.games-view__advanced-group', [
      h('h4.games-view__advanced-group-title', 'Sort'),
      h('div.games-view__advanced-row', [
        ...(['date', 'result', 'opponent', 'timeClass'] as GamesSortField[]).map(field => renderSortPill(field, deps)),
      ]),
    ]),
    h('div.games-view__advanced-actions', [
      gamesFilterActive()
        ? h('button.games-view__clear', { attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Clear filters', description: 'Remove every active Games filter.',
          }) }, on: { click: () => clearGamesFilters(deps) } }, 'Clear filters')
        : null,
      h('button.games-view__advanced-apply', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Apply advanced filters', description: 'Keep the live filter values and close advanced search.',
        }) },
        on: { click: () => { gamesAdvancedPanelOpen = false; redraw(); } },
      }, 'Apply'),
    ]),
  ]) : null;

  const filterBars = [filterBar, quickPillsBar, chipsBar, advancedPanel];

  // Empty state
  if (deps.importedGames.length === 0) {
    return h('div.games-view', [
      ...filterBars,
      h('div.games-view__empty', [
        h('p', 'No games imported yet.'),
        h('p.games-view__empty-hint', 'Use the search bar above to import from Chess.com or Lichess.'),
      ]),
    ]);
  }

  // Lens matched nothing while the library has games: say so instead of an
  // empty table with no explanation.
  if (games.length === 0 && !gamesFilterActive()) {
    return h('div.games-view', [
      ...filterBars,
      h('div.games-view__empty', [
        h('p', 'No games for this account yet.'),
        h('p.games-view__empty-hint', 'Import this account from the search bar above, or switch the Account lens.'),
      ]),
    ]);
  }

  const paginationBar = totalPages > 1 ? h('div.games-view__pagination', [
    renderGamesPageButton('Previous games page', '← Prev', 'Show the previous page of games.',
      gamesPage === 0 ? 'You are on the first games page.' : null,
      () => { gamesPage--; writeCurrentGamesRouteState(deps); redraw(); }),
    h('span.games-view__page-info', `Page ${gamesPage + 1} of ${totalPages}`),
    renderGamesPageButton('Next games page', 'Next →', 'Show the next page of games.',
      gamesPage >= totalPages - 1 ? 'You are on the last games page.' : null,
      () => { gamesPage++; writeCurrentGamesRouteState(deps); redraw(); }),
  ]) : null;
  const tableQueueSummaryCandidate = getQueueSummary();
  const tableQueueSummary = tableQueueSummaryCandidate.running
    || tableQueueSummaryCandidate.paused
    || tableQueueSummaryCandidate.lifecycleState === 'batch-complete'
    || tableQueueSummaryCandidate.lifecycleState === 'no-more-eligible-games'
    || tableQueueSummaryCandidate.lifecycleState === 'stale'
    ? tableQueueSummaryCandidate
    : null;
  const tableQueueItemsByGameId = new Map(getReviewQueueItems().map(item => [item.gameId, item]));
  const tableTotalWaveCount = [...tableQueueItemsByGameId.values()]
    .reduce((max, item) => Math.max(max, item.waveIndex + 1), 1);

  // Row feed: rich (default) or compact density — same pagination/queue read model the retired
  // sortable `<table>` used, now rendered through richRow.ts's shared row/review-control renderers.
  const rowsFeed = pageGames.length === 0
    ? h('div.games-view__empty', 'No games match current filters.')
    : gamesDensity === 'full'
    ? renderRichRowsFeed(deps, pageGames, games, tableQueueSummary, tableQueueItemsByGameId, tableTotalWaveCount)
    : renderGamesCompactFeed(deps, pageGames, games, tableQueueSummary, tableQueueItemsByGameId, tableTotalWaveCount);

  return h('div.games-view', [...filterBars, rowsFeed, paginationBar]);
}
