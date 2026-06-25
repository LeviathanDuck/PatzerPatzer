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
  enqueueBulkReview, enqueueAtFront, getReviewProgress, isBulkRunning, isBulkPaused, getQueueSummary,
  isGameErrored, formatReviewDuration, getFailedReviewStatus, skipFailedReviewGame, isLeaderTab,
  getReviewCrashContext, subscribeReviewQueueState,
  type QueueSummary,
} from '../engine/reviewQueue';
import {
  firstReviewRunBatch,
  reviewRunStartFromContext,
  selectedGameIdsInSourceOrder,
  visibleListReviewRunContext,
  type ReviewRunSourceContext,
} from '../engine/reviewRun';
import { LOSS_THRESHOLDS } from '../engine/winchances';
import { getMissedMoments, type MissedMoment } from '../engine/tactics';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import { serializeAnalysisSelectedGameRoute } from '../analyse/routeState';
import { writeHashRoute } from '../router';
import {
  parseGamesRouteState,
  resolveGamesRoutePage,
  serializeGamesRouteState,
  type GamesRouteAccountOverride,
  type GamesRouteState,
} from './routeState';

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

function compareByPlayedDate(
  a: ImportedGame,
  b: ImportedGame,
  direction: 'asc' | 'desc',
): number {
  const aPlayed = playedTimestamp(a);
  const bPlayed = playedTimestamp(b);
  const aHasPlayedDate = aPlayed !== null;
  const bHasPlayedDate = bPlayed !== null;

  // Undated games stay after dated games in both directions.
  if (aHasPlayedDate !== bHasPlayedDate) return aHasPlayedDate ? -1 : 1;

  if (aPlayed !== null && bPlayed !== null && aPlayed !== bPlayed) {
    return direction === 'desc' ? bPlayed - aPlayed : aPlayed - bPlayed;
  }

  const aImported = a.importedAt ?? 0;
  const bImported = b.importedAt ?? 0;
  if (aImported !== bImported) {
    return direction === 'desc' ? bImported - aImported : aImported - bImported;
  }

  return a.id.localeCompare(b.id);
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

/**
 * Shared structured row children for compact game lists (header panel + underboard).
 * Fields: result dot · opponent name · date · time class icon · badges.
 */
// Returns a badge (or null) reflecting the severity of missed moments.
// - Swing/collapse severity maps to ! count via LOSS_THRESHOLDS (same thresholds as per-move glyphs).
// - Missed forced mate shows a separate purple M?! badge.
// - Falls back to a single ! when moment detail is unavailable (e.g. previous-session IDB restore).
function renderMissedBadge(gameId: string, hasMissedTactic: boolean): VNode | null {
  if (!hasMissedTactic) return null;

  const moments = getMissedMoments(gameId);
  const hasMate = moments.some((m: MissedMoment) => m.kind === 'missed-mate');
  const swingMoments = moments.filter((m: MissedMoment) => m.kind !== 'missed-mate');
  const worstLoss = swingMoments.length > 0 ? Math.max(...swingMoments.map((m: MissedMoment) => m.loss)) : 0;

  const exclamCount = worstLoss >= LOSS_THRESHOLDS.blunder    ? 3
    : worstLoss >= LOSS_THRESHOLDS.mistake    ? 2
    : worstLoss >= LOSS_THRESHOLDS.inaccuracy ? 1
    : 0;

  const badges: (VNode | null)[] = [];
  if (hasMate) {
    badges.push(h('span.grl__badge.--missed-mate', { attrs: { title: 'Missed forced mate' } }, 'M?!'));
  }
  if (exclamCount > 0) {
    badges.push(h('span.grl__badge.--warn', { attrs: { title: 'Missed tactic' } }, '!'.repeat(exclamCount)));
  } else if (!hasMate) {
    // No rich data (IDB-restored from a previous session) — show single fallback !
    badges.push(h('span.grl__badge.--warn', { attrs: { title: 'Missed tactic' } }, '!'));
  }

  return h('span.grl__missed-indicators', badges);
}

function importedAccountColor(game: ImportedGame): 'white' | 'black' | null {
  const username = game.importedUsername?.trim().toLowerCase();
  if (!username) return null;
  if (game.white?.trim().toLowerCase() === username) return 'white';
  if (game.black?.trim().toLowerCase() === username) return 'black';
  return null;
}

function importedAccountLabel(game: ImportedGame): string | null {
  const username = game.importedUsername?.trim();
  if (!username) return null;
  const color = importedAccountColor(game);
  const rating = color === 'white' ? game.whiteRating
    : color === 'black' ? game.blackRating
    : undefined;
  return rating !== undefined ? `${username} (${rating})` : username;
}

export function renderCompactGameRow(
  game: ImportedGame,
  isAnalyzed: boolean,
  hasMissedTactic: boolean,
  accuracy?: { user: number | null; opp: number | null },
): (VNode | null)[] {
  const result    = gameResult(game);
  const userColor = getUserColor(game);
  const opponent  = userColor === 'white' ? (game.black ?? game.id)
    : userColor === 'black' ? (game.white ?? game.id)
    : (game.white && game.black ? `${game.white} vs ${game.black}` : game.id);

  const date = game.date ? game.date.slice(0, 10) : null;

  const tcIconMap: Record<string, string> = {
    ultrabullet: '\ue032',
    bullet:      '\ue032',
    blitz:       '\ue008',
    rapid:       '\ue002',
  };
  const tcIcon = game.timeClass ? (tcIconMap[game.timeClass] ?? null) : null;
  const isNewImport = isRecentlyImported(game);
  const accountLabel = importedAccountLabel(game);
  const openingLabel = game.opening?.trim() || null;

  const resultCls = result === 'win'  ? 'grl__result--win'
    : result === 'loss' ? 'grl__result--loss'
    : result === 'draw' ? 'grl__result--draw'
    : 'grl__result--unknown';

  const oppColor  = userColor === 'white' ? 'black' : userColor === 'black' ? 'white' : null;
  const oppChip   = oppColor ? h('span.color-chip.--' + oppColor) : null;
  const oppRating = userColor === 'white' ? game.blackRating : userColor === 'black' ? game.whiteRating : undefined;
  const oppLabel  = oppRating !== undefined ? `${opponent} (${oppRating})` : opponent;
  const oppAccNode = accuracy?.opp !== null && accuracy?.opp !== undefined
    ? h('span.grl__opp-accuracy', `${Math.round(accuracy.opp)}%`)
    : null;

  return [
    h('span.grl__result.' + resultCls, '●'),
    h('span.grl__opponent', [oppLabel, oppChip, oppAccNode]),
    openingLabel ? h('span.grl__opening', { attrs: { title: openingLabel } }, openingLabel) : null,
    accountLabel ? h('span.grl__account', accountLabel) : null,
    date ? h('span.grl__date', date) : null,
    tcIcon ? h('span.grl__tc', { attrs: { 'data-icon': tcIcon, ...(game.timeClass ? { title: game.timeClass } : {}) } }) : null,
    (isNewImport || isAnalyzed || hasMissedTactic) ? h('span.grl__badges', [
      isNewImport ? h('span.grl__badge.--new', { attrs: { title: 'Newly imported' } }, 'NEW') : null,
      isAnalyzed  ? h('span.grl__badge.--ok',  { attrs: { title: 'Analyzed' } },       '✓') : null,
      renderMissedBadge(game.id, hasMissedTactic),
    ]) : null,
  ];
}

// ---------------------------------------------------------------------------
// Dependency surface injected by main.ts at render time
// ---------------------------------------------------------------------------

export interface GamesViewDeps {
  importedGames:         ImportedGame[];
  /** Registered chess accounts, for the account lens switcher. */
  accounts:              ChessAccount[];
  selectedGameId:        string | null;
  analyzedGameIds:       Set<string>;
  missedTacticGameIds:   Set<string>;
  analyzedGameAccuracy:  Map<string, { white: number | null; black: number | null }>;
  savedPuzzles:          Array<{ gameId: string | null }>;
  gameResult:            (game: ImportedGame) => 'win' | 'loss' | 'draw' | null;
  getUserColor:          (game: ImportedGame) => 'white' | 'black' | null;
  gameSourceUrl:         (game: ImportedGame) => string | undefined;
  renderCompactGameRow:  (game: ImportedGame, analyzed: boolean, missed: boolean, accuracy?: { user: number | null; opp: number | null }) => (VNode | null)[];
  /** Set selectedGameId + call loadGame (used for click-to-load in the game list). */
  selectGame:            (game: ImportedGame) => void;
  /** selectGame + navigate to analysis + startBatchWhenReady (used for Review button). */
  reviewGame:            (game: ImportedGame) => void;
  /** Run batch analysis on an ordered list of games sequentially. */
  reviewAllGames:        (games: ImportedGame[], sourceContext?: ReviewRunSourceContext) => void;
  routeQuery?:            string;
  redraw:                () => void;
}

// ---------------------------------------------------------------------------
// Filter / sort state (owned by this module)
// ---------------------------------------------------------------------------

type GamesResultFilter = 'win' | 'loss' | 'draw';
type GamesSortField    = 'date' | 'result' | 'opponent' | 'timeClass';
type ReviewIssueFilter = 'all' | 'failed-skipped';

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

// Separate filter state for the compact underboard game list.
// Kept independent of the Games-tab filter state so the two views don't cross-contaminate.
let gameListSearch = '';
let gameListFilterResults: Set<'win' | 'loss' | 'draw'> = new Set();
let gameListFilterSpeeds:  Set<string>                   = new Set();
let gameListPage = 0;
let gameListPageSize: GameListPageSize = loadGameListPageSize();

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
  const activeBatchIds = firstReviewRunBatch(sourceGameIds);
  return {
    sourceMode: 'selected-games',
    sourceGameIds,
    activeBatchIds,
  };
}

type ReviewRowLifecycleLabel = {
  label: string;
  title: string;
  modifier: 'active' | 'queued' | 'paused' | 'warning';
};

function reviewRowLifecycleLabel(summary: QueueSummary | null, gameId: string): ReviewRowLifecycleLabel | null {
  if (!summary || !summary.activeBatchGameIds.includes(gameId)) return null;
  const current = summary.currentGameId === gameId;
  if (current && summary.stale) {
    const age = formatReviewDuration(summary.lastProgressSeconds);
    return {
      label:    'Stalled',
      title:    `No review progress${age ? ` for ${age}` : ''}`,
      modifier: 'warning',
    };
  }
  if (current && summary.lifecycleState === 'hidden-suspended') {
    return { label: 'Hidden', title: 'Review suspended while the owning tab is hidden', modifier: 'paused' };
  }
  if (current && summary.lifecycleState === 'interrupted-after-reload') {
    return { label: 'Resume', title: 'Review interrupted after reload and requires manual resume', modifier: 'paused' };
  }
  if (current && summary.paused) {
    return { label: 'Paused', title: 'Review is paused', modifier: 'paused' };
  }
  if (current) {
    return { label: 'Reviewing', title: 'Current review game', modifier: 'active' };
  }
  return { label: 'Queued', title: 'Queued in the current review batch', modifier: 'queued' };
}

function renderReviewLifecyclePill(label: ReviewRowLifecycleLabel): VNode {
  return h(`span.game-list__row-progress.--${label.modifier}`, { attrs: { title: label.title } }, label.label);
}

function renderGamesReviewLifecyclePill(label: ReviewRowLifecycleLabel): VNode {
  return h(`span.games-view__review-lifecycle.--${label.modifier}`, { attrs: { title: label.title } }, label.label);
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

function resetGameListPage(): void {
  gameListPage = 0;
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
  accountFilter: AccountFilterState;
  compact: {
    search: string;
    results: ('win' | 'loss' | 'draw')[];
    speeds: string[];
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

function gamesFilterActive(): boolean {
  return gamesFilterResults.size > 0 || gamesFilterSpeeds.size > 0 ||
    gamesFilterOpponent.trim() !== '' || gamesFilterColor !== '' ||
    gamesFilterTactics.size > 0 || gamesFilterOpening.trim() !== '' ||
    gamesFilterReviewIssues !== 'all';
}

function clearGamesFilters(deps: GamesViewDeps): void {
  gamesFilterResults  = new Set();
  gamesFilterSpeeds   = new Set();
  gamesFilterOpponent = '';
  gamesFilterColor    = '';
  gamesFilterTactics  = new Set();
  gamesFilterOpening  = '';
  gamesFilterReviewIssues = 'all';
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
        title: 'Choose whose games to show',
        'aria-haspopup': 'true',
        'aria-expanded': String(accountFilterMenuOpen),
      },
      on: { click: () => { accountFilterMenuOpen = !accountFilterMenuOpen; deps.redraw(); } },
    }, accountFilterButtonLabel(deps.accounts)),
    accountFilterMenuOpen ? h('button.games-view__account-backdrop', {
      attrs: { type: 'button', 'aria-label': 'Close account filter' },
      on: { click: () => { accountFilterMenuOpen = false; deps.redraw(); } },
    }) : null,
    accountFilterMenuOpen ? h('div.games-view__account-menu', [
      h('button.games-view__account-option', {
        class: { active: accountFilterState.mode === 'all' },
        attrs: { type: 'button' },
        on: { click: () => applyAccountFilterState({ mode: 'all' }, deps) },
      }, [
        h('span.games-view__account-check', accountFilterState.mode === 'all' ? '✓' : ''),
        h('span', 'All accounts'),
      ]),
      h('button.games-view__account-option', {
        class: { active: accountFilterState.mode === 'custom' && custom.includeMine },
        attrs: { type: 'button' },
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
          attrs: { type: 'button' },
          on: { click: () => toggleAccount(account.id) },
        }, [
          h('span.games-view__account-check', accountFilterState.mode === 'custom' && selectedIds.has(account.id) ? '✓' : ''),
          h('span', accountLabel(account)),
        ]),
      ),
    ]) : null,
  ]);
}

function filteredGames(deps: GamesViewDeps): ImportedGame[] {
  // Copy: this list is sorted in place below and the lens may return the
  // shared importedGames array directly.
  let list = [...accountLensGames(deps)];

  if (gamesFilterResults.size > 0) {
    list = list.filter(g => {
      const r = deps.gameResult(g);
      return r !== null && gamesFilterResults.has(r);
    });
  }

  if (gamesFilterSpeeds.size > 0) {
    list = list.filter(g => g.timeClass && gamesFilterSpeeds.has(g.timeClass));
  }

  if (gamesFilterOpponent.trim()) {
    const q = gamesFilterOpponent.trim().toLowerCase();
    list = list.filter(g => {
      const opp = opponentName(g, deps.getUserColor)?.toLowerCase() ?? '';
      return opp.includes(q);
    });
  }

  if (gamesFilterColor) {
    list = list.filter(g => deps.getUserColor(g) === gamesFilterColor);
  }

  if (gamesFilterTactics.size > 0) {
    list = list.filter(g => {
      const hasMissed = deps.missedTacticGameIds.has(g.id);
      const severities = gameTacticsSeverities(g.id, hasMissed);
      for (const s of gamesFilterTactics) {
        if (severities.has(s)) return true;
      }
      return false;
    });
  }

  if (gamesFilterOpening.trim()) {
    const q = gamesFilterOpening.trim().toLowerCase();
    list = list.filter(g => g.opening?.toLowerCase().includes(q));
  }

  if (gamesFilterReviewIssues === 'failed-skipped') {
    list = list.filter(g => {
      const status = getFailedReviewStatus(g.id);
      return status !== undefined && (status.attempts > 0 || status.skipped);
    });
  }

  // Sort
  list.sort((a, b) => {
    let cmp = 0;
    if (gamesSortField === 'date') {
      cmp = compareByPlayedDate(a, b, gamesSortDir);
    } else if (gamesSortField === 'opponent') {
      cmp = (opponentName(a, deps.getUserColor) ?? '').localeCompare(opponentName(b, deps.getUserColor) ?? '');
    } else if (gamesSortField === 'timeClass') {
      cmp = (a.timeClass ?? '').localeCompare(b.timeClass ?? '');
    } else if (gamesSortField === 'result') {
      const ord = (g: ImportedGame) => {
        const r = deps.gameResult(g);
        return r === 'win' ? 0 : r === 'draw' ? 1 : r === 'loss' ? 2 : 3;
      };
      cmp = ord(a) - ord(b);
    }
    return gamesSortField === 'date' ? cmp : (gamesSortDir === 'desc' ? -cmp : cmp);
  });

  return list;
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

function renderResultIcon(r: 'win' | 'loss' | 'draw' | null): VNode {
  if (r === 'win')  return h('span.games-view__result.--win',  { attrs: { title: 'Win'  } }, '●');
  if (r === 'loss') return h('span.games-view__result.--loss', { attrs: { title: 'Loss' } }, '●');
  if (r === 'draw') return h('span.games-view__result.--draw', { attrs: { title: 'Draw' } }, '●');
  return h('span.games-view__result', '–');
}

function renderSortTh(label: string, field: GamesSortField, deps: GamesViewDeps): VNode {
  const active = gamesSortField === field;
  const arrow  = active ? (gamesSortDir === 'desc' ? ' ↓' : ' ↑') : '';
  return h('th', {
    class: { 'games-view__th--active': active },
    on:   { click: () => toggleGamesSort(field, deps) },
  }, label + arrow);
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
  e: MouseEvent,
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

  // Apply filters: account lens → opponent search → result → time class
  const lensGames = accountLensGames(deps);
  const q = gameListSearch.trim().toLowerCase();
  let visible: ImportedGame[] = q
    ? lensGames.filter(g => {
        const opp = opponentName(g, deps.getUserColor)?.toLowerCase() ?? '';
        const opening = g.opening?.toLowerCase() ?? '';
        return opp.includes(q) || opening.includes(q);
      })
    : [...lensGames];

  if (gameListFilterResults.size > 0) {
    visible = visible.filter(g => {
      const r = deps.gameResult(g);
      return r !== null && gameListFilterResults.has(r);
    });
  }

  if (gameListFilterSpeeds.size > 0) {
    visible = visible.filter(g => g.timeClass !== undefined && gameListFilterSpeeds.has(g.timeClass));
  }

  visible.sort((a, b) => compareByPlayedDate(a, b, 'desc'));

  const anyFilter = q.length > 0 || gameListFilterResults.size > 0 || gameListFilterSpeeds.size > 0;

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

  const clearAll = () => {
    gameListSearch = '';
    gameListFilterResults = new Set();
    gameListFilterSpeeds = new Set();
    resetGameListPage();
    deps.redraw();
  };

  const listSelectedCount = [...selectedGameIds].filter(id => lensGames.some(g => g.id === id)).length;

  const toolbar = h('div.game-list__toolbar', [
    renderAccountLensSelect(deps),
    h('input.games-view__search', {
      attrs: { type: 'search', placeholder: 'Search opponent/opening...', value: gameListSearch },
      on: { input: (e: Event) => { gameListSearch = (e.target as HTMLInputElement).value; resetGameListPage(); deps.redraw(); } },
    }),
    h('div.game-list__filter-pills', [
      ...(['win', 'loss', 'draw'] as const).map(r =>
        h('button.games-view__pill', {
          class: { active: gameListFilterResults.has(r) },
          on: { click: () => toggleResult(r) },
        }, r.charAt(0).toUpperCase() + r.slice(1)),
      ),
      ...(['bullet', 'blitz', 'rapid'] as const).map(tc =>
        h('button.games-view__pill', {
          class: { active: gameListFilterSpeeds.has(tc) },
          attrs: { 'data-icon': SPEED_ICONS[tc] ?? '' },
          on: { click: () => toggleSpeed(tc) },
        }, tc.charAt(0).toUpperCase() + tc.slice(1)),
      ),
      anyFilter
        ? h('button.games-view__clear', {
            attrs: { title: 'Clear filters', 'aria-label': 'Clear filters' },
            on: { click: clearAll },
          }, '×')
        : null,
      // Select mode toggle — primary way to multi-select on touch devices.
      // On desktop, ctrl/cmd+click still works alongside this button.
      h('button.games-view__select-toggle', {
        class: { active: selectModeActive },
        attrs: { title: selectModeActive ? 'Exit select mode' : 'Select games for bulk review' },
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
              const batchGames = firstReviewRunBatch(selectedGames);
              const sourceContext = selectedReviewRunContext(selectedGames);
              selectedGameIds = new Set();
              selectModeActive = false;
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: { title: `Analyze ${listSelectedCount} selected games sequentially` },
          }, `Review ${listSelectedCount}`)
        : null,
      visible.length > 1
        ? h('button.games-view__review-all-btn', {
            on: { click: () => {
              const { batchGames, sourceContext } = fixedVisibleListReviewRunStart(visible, 'date', 'desc');
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: { title: 'Analyze all visible games sequentially' },
          }, 'Review All')
        : null,
    ]),
    h('div.game-list__page-size', [
      h('span.game-list__page-size-label', 'Show'),
      ...GAME_LIST_PAGE_SIZE_OPTIONS.map(size =>
        h('button.game-list__page-size-btn', {
          class: { active: gameListPageSize === size },
          attrs: {
            type: 'button',
            title: `Show ${size} games`,
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
  const paginationBar = totalPages > 1 ? h('div.game-list__pagination', [
    h('button.games-view__page-btn', {
      attrs: { type: 'button', disabled: gameListPage === 0 },
      on: { click: () => { gameListPage--; deps.redraw(); } },
    }, 'Prev'),
    h('span.games-view__page-info', `Page ${gameListPage + 1} of ${totalPages}`),
    h('button.games-view__page-btn', {
      attrs: { type: 'button', disabled: gameListPage >= totalPages - 1 },
      on: { click: () => { gameListPage++; deps.redraw(); } },
    }, 'Next'),
  ]) : null;

  return h('div.game-list', [
    h('div.game-list__header', countLabel),
    toolbar,
    queueSummary
      ? h('div.game-list__queue-status', {
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
          const base = `Reviewing ${queueSummary.done} / ${queueSummary.total} games${details ? ` · ${details}` : ''}…`;
          return elapsed ? `${base} Elapsed ${elapsed}` : base;
        })())
      : null,
    visible.length === 0
      ? h('div.game-list__no-results', 'No games match.')
      : h('ul', pageGames.map(game => {
          const isAnalyzed      = deps.analyzedGameIds.has(game.id);
          const hasMissedTactic = deps.missedTacticGameIds.has(game.id);
          const srcUrl          = deps.gameSourceUrl(game);
          const progress        = getReviewProgress(game.id);
          const isErrored       = isGameErrored(game.id);
          const failedStatus    = getFailedReviewStatus(game.id);
          const isAnalyzing     = !isErrored && progress !== undefined && progress < 100;
          const isPending       = !isErrored && progress !== undefined && !isAnalyzing && !isAnalyzed;
          const lifecycleLabel  = reviewRowLifecycleLabel(queueSummary, game.id);
          const lifecyclePill   = lifecycleLabel ? renderReviewLifecyclePill(lifecycleLabel) : null;

          // Accuracy for this game (available once analyzed).
          const rawAcc    = deps.analyzedGameAccuracy.get(game.id);
          const userColor = deps.getUserColor(game);
          const userAcc   = rawAcc && userColor ? (userColor === 'white' ? rawAcc.white : rawAcc.black) : null;
          const oppAcc    = rawAcc && userColor ? (userColor === 'white' ? rawAcc.black : rawAcc.white) : null;
          const accuracy  = rawAcc ? { user: userAcc, opp: oppAcc } : undefined;

          // Per-row review control:
          // - error: show error indicator (game can be re-queued)
          // - analyzing: show live % progress
          // - pending in queue (not yet started): show "Queued"
          // - analyzed: show user accuracy % (or nothing if unavailable)
          // - not yet queued: show Review button
          const reviewControl = isErrored
            ? h('button.game-list__row-progress.--failed-skip', {
                attrs: {
                  type: 'button',
                  title: 'Skip this failed game',
                  'aria-label': `Skip failed review for ${game.white ?? 'White'} vs ${game.black ?? 'Black'}`,
                },
                on: { click: (e: MouseEvent) => {
                  e.stopPropagation();
                  skipFailedReviewGame(game.id);
                  deps.redraw();
                }},
              }, [
                h('span.--failed-label', failedStatus ? `Failed (${failedStatus.attempts})` : 'Failed'),
                h('span.--skip-label', 'Skip'),
              ])
            : isAnalyzing && lifecycleLabel?.modifier === 'warning'
            ? lifecyclePill
            : isAnalyzing
            ? h('span.game-list__row-progress', `${progress}%`)
            : isPending
              ? lifecyclePill ?? h('span.game-list__row-progress.--queued', 'Queued')
              : isAnalyzed
                ? (userAcc !== null && userAcc !== undefined
                    ? h('span.game-list__row-progress.--accuracy', `${Math.round(userAcc)}%`)
                    : null)
                : lifecyclePill
                  ? lifecyclePill
                : isBulkRunning()
                  ? h('div.game-list__row-queue-split', [
                      h('button.game-list__row-queue-btn.--top', {
                        attrs: { title: 'Review next', 'aria-label': 'Review next' },
                        on: { click: (e: MouseEvent) => {
                          e.stopPropagation();
                          const bulk = selectedGameIds.size > 1 && selectedGameIds.has(game.id)
                            ? deps.importedGames.filter(g => selectedGameIds.has(g.id))
                            : [game];
                          enqueueAtFront(bulk);
                          deps.redraw();
                        }},
                      }, '⬆'),
                      h('button.game-list__row-queue-btn.--bottom', {
                        attrs: { title: 'Add to queue', 'aria-label': 'Add to queue' },
                        on: { click: (e: MouseEvent) => {
                          e.stopPropagation();
                          const bulk = selectedGameIds.size > 1 && selectedGameIds.has(game.id)
                            ? deps.importedGames.filter(g => selectedGameIds.has(g.id))
                            : [game];
                          enqueueBulkReview(bulk);
                          deps.redraw();
                        }},
                      }, '⬇'),
                    ])
                  : h('button.game-list__row-review', {
                      attrs: { title: 'Queue for background review' },
                      on: { click: (e: MouseEvent) => {
                        e.stopPropagation();
                        enqueueBulkReview([game]);
                        deps.redraw();
                      }},
                    }, 'Review');

          return h('li', [
            h('button.game-list__row', {
              class: {
                active:    game.id === deps.selectedGameId,
                selected:  selectedGameIds.has(game.id),
                analyzing: isAnalyzing,
              },
              on: { click: (e: MouseEvent) => handleGameRowClick(game, visible, e, deps, () => selectAnalysisGame(game, deps)) },
            }, deps.renderCompactGameRow(game, isAnalyzed, hasMissedTactic, accuracy)),
            reviewControl,
            srcUrl ? h('a.game-ext-link', {
              attrs: { href: srcUrl, target: '_blank', rel: 'noopener', title: 'View on source platform' },
            }) : null,
          ]);
        })),
    paginationBar,
  ]);
}

/** Full Games tab view: filter bar + sortable table. */
export function renderGamesView(deps: GamesViewDeps): VNode {
  hydrateGamesRouteState(deps);
  const games = filteredGames(deps);
  finalizeGamesRouteHydration(deps, games.length);
  const lensTotal = accountLensGames(deps).length;
  const { redraw } = deps;

  // Controls bar
  const filterBar = h('div.games-view__controls', [
    // Account lens
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Account'),
      renderAccountLensSelect(deps),
    ]),

    // Result filter
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Result'),
      ...(['win', 'loss', 'draw'] as GamesResultFilter[]).map(r =>
        h('button.games-view__pill', {
          class: { active: gamesFilterResults.has(r) },
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

    // Time class filter
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Time'),
      ...(['bullet', 'blitz', 'rapid'] as string[]).map(tc =>
        h('button.games-view__pill', {
          class: { active: gamesFilterSpeeds.has(tc) },
          attrs: { 'data-icon': SPEED_ICONS[tc] ?? '' },
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

    // Color filter (playing as)
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Color'),
      h('button.games-view__pill', {
        class: { active: gamesFilterColor === 'white' },
        on: { click: () => {
          gamesFilterColor = gamesFilterColor === 'white' ? '' : 'white';
          gamesPage = 0;
          writeCurrentGamesRouteState(deps);
          redraw();
        } },
      }, 'White'),
      h('button.games-view__pill', {
        class: { active: gamesFilterColor === 'black' },
        on: { click: () => {
          gamesFilterColor = gamesFilterColor === 'black' ? '' : 'black';
          gamesPage = 0;
          writeCurrentGamesRouteState(deps);
          redraw();
        } },
      }, 'Black'),
    ]),

    // Tactics severity filter
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Misses'),
      ...(['!', '!!', '!!!', 'M?!'] as string[]).map(sev =>
        h('button.games-view__pill.--tactics', {
          class: { active: gamesFilterTactics.has(sev) },
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

    // Opponent search
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Opponent'),
      h('input.games-view__search', {
        attrs: { type: 'search', placeholder: 'Name…', value: gamesFilterOpponent },
        on: { input: (e: Event) => {
          gamesFilterOpponent = (e.target as HTMLInputElement).value;
          gamesPage = 0;
          writeCurrentGamesRouteState(deps);
          redraw();
        } },
      }),
    ]),

    // Opening filter
    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Opening'),
      h('input.games-view__search', {
        attrs: { type: 'search', placeholder: 'Name...', value: gamesFilterOpening },
        on: { input: (e: Event) => {
          gamesFilterOpening = (e.target as HTMLInputElement).value;
          gamesPage = 0;
          writeCurrentGamesRouteState(deps);
          redraw();
        } },
      }),
    ]),

    h('div.games-view__filter-group', [
      h('span.games-view__filter-label', 'Review'),
      h('button.games-view__pill', {
        class: { active: gamesFilterReviewIssues === 'failed-skipped' },
        attrs: {
          type: 'button',
          title: 'Show games with failed or skipped review state',
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

    // Summary + clear + multi-select review
    h('div.games-view__filter-group.--right', [
      h('span.games-view__summary', `${games.length} of ${lensTotal} game${lensTotal === 1 ? '' : 's'}`),
      h('button.games-view__clear', {
        attrs: { type: 'button', title: 'Report an issue with the Games page' },
        on: { click: reportGamesIssue },
      }, 'Report issue'),
      gamesFilterActive() ? h('button.games-view__clear', { on: { click: () => clearGamesFilters(deps) } }, 'Clear filters') : null,
      selectedGameIds.size > 1
        ? h('button.games-view__review-all-btn', {
            on: { click: () => {
              const selectedGames = selectedGamesInCurrentVisibleOrder(games);
              const batchGames = firstReviewRunBatch(selectedGames);
              const sourceContext = selectedReviewRunContext(selectedGames);
              selectedGameIds = new Set();
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: { title: `Analyze ${selectedGameIds.size} selected games sequentially` },
          }, `Review Selected (${selectedGameIds.size})`)
        : null,
      games.length > 1
        ? h('button.games-view__review-all-btn', {
            on: { click: () => {
              const { batchGames, sourceContext } = visibleListReviewRunStart(games);
              deps.reviewAllGames(batchGames, sourceContext);
            }},
            attrs: { title: 'Analyze all visible games sequentially' },
          }, 'Review All')
        : null,
    ]),
  ]);

  // Empty state
  if (deps.importedGames.length === 0) {
    return h('div.games-view', [
      filterBar,
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
      filterBar,
      h('div.games-view__empty', [
        h('p', 'No games for this account yet.'),
        h('p.games-view__empty-hint', 'Import this account from the search bar above, or switch the Account lens.'),
      ]),
    ]);
  }

  // Pagination: clamp page to valid range, slice filtered games.
  const totalPages = Math.max(1, Math.ceil(games.length / GAMES_PAGE_SIZE));
  if (gamesPage >= totalPages) gamesPage = totalPages - 1;
  if (gamesPage < 0) gamesPage = 0;
  const pageStart = gamesPage * GAMES_PAGE_SIZE;
  const pageGames = games.slice(pageStart, pageStart + GAMES_PAGE_SIZE);

  const paginationBar = totalPages > 1 ? h('div.games-view__pagination', [
    h('button.games-view__page-btn', {
      attrs: { disabled: gamesPage === 0 },
      on: { click: () => { gamesPage--; writeCurrentGamesRouteState(deps); redraw(); } },
    }, '← Prev'),
    h('span.games-view__page-info', `Page ${gamesPage + 1} of ${totalPages}`),
    h('button.games-view__page-btn', {
      attrs: { disabled: gamesPage >= totalPages - 1 },
      on: { click: () => { gamesPage++; writeCurrentGamesRouteState(deps); redraw(); } },
    }, 'Next →'),
  ]) : null;
  const tableQueueSummaryCandidate = getQueueSummary();
  const tableQueueSummary = tableQueueSummaryCandidate.running
    || tableQueueSummaryCandidate.paused
    || tableQueueSummaryCandidate.lifecycleState === 'batch-complete'
    || tableQueueSummaryCandidate.lifecycleState === 'no-more-eligible-games'
    || tableQueueSummaryCandidate.lifecycleState === 'stale'
    ? tableQueueSummaryCandidate
    : null;

  // Table
  const table = h('div.games-view__table-wrap', [
    h('table.games-view__table', [
      h('thead', h('tr', [
        renderSortTh('Result',   'result',    deps),
        renderSortTh('Opponent', 'opponent',  deps),
        h('th.games-view__rating-th', 'Rating'),
        h('th.games-view__account-th', 'Account'),
        renderSortTh('Date',     'date',      deps),
        renderSortTh('Time',     'timeClass', deps),
        h('th', 'Opening'),
        h('th.games-view__review-th', 'Review'),
        h('th.games-view__puzzles-th', 'Puzzles'),
        h('th'),
      ])),
      h('tbody', pageGames.length > 0
        ? pageGames.map(game => {
            const r       = deps.gameResult(game);
            const opp     = opponentName(game, deps.getUserColor) ?? '–';
            const date    = game.date ? game.date.slice(0, 10) : '–';
            const tc      = game.timeClass ?? '–';
            const tcIcon  = game.timeClass ? SPEED_ICONS[game.timeClass] : undefined;
            const opening = game.opening?.trim() || '–';
            const srcUrl  = deps.gameSourceUrl(game);
            const isAnalyzed = deps.analyzedGameIds.has(game.id);
            const hasMissed  = deps.missedTacticGameIds.has(game.id);
            const isNewImport = isRecentlyImported(game);
            const accountLabel = importedAccountLabel(game);

            // User accuracy: read from analyzedGameAccuracy map (populated at analysis-complete time).
            const accEntry  = deps.analyzedGameAccuracy.get(game.id);
            const userColor = deps.getUserColor(game);

            // Rating cell: opponent's rating only.
            const oppRating = userColor === 'white' ? game.blackRating : userColor === 'black' ? game.whiteRating : undefined;
            const ratingText = (() => {
              if (oppRating !== undefined) return String(oppRating);
              if (!userColor && (game.whiteRating !== undefined || game.blackRating !== undefined)) {
                const parts: string[] = [];
                if (game.whiteRating !== undefined) parts.push(`W:${game.whiteRating}`);
                if (game.blackRating !== undefined) parts.push(`B:${game.blackRating}`);
                return parts.join(' ');
              }
              return null;
            })();
            const ratingCell = h('td.games-view__rating', ratingText ?? '–');

            let accuracyText: string | null = null;
            if (isAnalyzed && accEntry) {
              if (userColor === 'white' && accEntry.white !== null) {
                accuracyText = `${Math.round(accEntry.white)}%`;
              } else if (userColor === 'black' && accEntry.black !== null) {
                accuracyText = `${Math.round(accEntry.black)}%`;
              } else if (!userColor) {
                const w = accEntry.white !== null ? `W:${Math.round(accEntry.white)}%` : null;
                const b = accEntry.black !== null ? `B:${Math.round(accEntry.black)}%` : null;
                accuracyText = [w, b].filter(Boolean).join(' ') || null;
              }
            }

            // Review status cell
            const reviewProgress  = !isAnalyzed ? getReviewProgress(game.id) : undefined;
            const isReviewErrored = !isAnalyzed && isGameErrored(game.id);
            const failedStatus    = !isAnalyzed ? getFailedReviewStatus(game.id) : undefined;
            const isAnalyzing     = !isReviewErrored && reviewProgress !== undefined && reviewProgress < 100;
            const lifecycleLabel  = !isAnalyzed ? reviewRowLifecycleLabel(tableQueueSummary, game.id) : null;
            const lifecyclePill   = lifecycleLabel ? renderGamesReviewLifecyclePill(lifecycleLabel) : null;
            const reviewCell = isAnalyzed
              ? h('td.games-view__review-cell', [
                  h('span.games-view__reviewed', { attrs: { title: 'Reviewed' } }, '✓'),
                  renderMissedBadge(game.id, hasMissed),
                  accuracyText ? h('span.games-view__accuracy', { attrs: { title: 'Your accuracy' } }, accuracyText) : null,
                ])
              : isReviewErrored
              ? h('td.games-view__review-cell', [
                  h('button.games-view__review-failed-skip', {
                    attrs: {
                      type: 'button',
                      title: 'Skip this failed game',
                      'aria-label': `Skip failed review for ${game.white ?? 'White'} vs ${game.black ?? 'Black'}`,
                    },
                    on: { click: (e: Event) => {
                      e.stopPropagation();
                      skipFailedReviewGame(game.id);
                      deps.redraw();
                    }},
                  }, [
                    h('span.--failed-label', failedStatus ? `Failed (${failedStatus.attempts})` : 'Failed'),
                    h('span.--skip-label', 'Skip'),
                  ]),
                ])
              : isAnalyzing && lifecycleLabel?.modifier === 'warning'
              ? h('td.games-view__review-cell', [lifecyclePill])
              : isAnalyzing
              ? h('td.games-view__review-cell', [
                  h('span.games-view__analyzing-progress', { attrs: { title: 'Reviewing…' } }, `${reviewProgress}%`),
                ])
              : h('td.games-view__review-cell', [
                  lifecyclePill
                    ? lifecyclePill
                    : isBulkRunning()
                    ? h('div.games-view__review-split', [
                        h('button.games-view__review-queue-btn.--top', {
                          attrs: { title: 'Review next', 'aria-label': 'Review next' },
                          on: { click: (e: Event) => {
                            e.stopPropagation();
                            const bulk = selectedGameIds.size > 1 && selectedGameIds.has(game.id)
                              ? games.filter(g => selectedGameIds.has(g.id))
                              : [game];
                            enqueueAtFront(bulk);
                            deps.redraw();
                          }},
                        }, '⬆'),
                        h('button.games-view__review-queue-btn.--bottom', {
                          attrs: { title: 'Add to queue', 'aria-label': 'Add to queue' },
                          on: { click: (e: Event) => {
                            e.stopPropagation();
                            const bulk = selectedGameIds.size > 1 && selectedGameIds.has(game.id)
                              ? games.filter(g => selectedGameIds.has(g.id))
                              : [game];
                            enqueueBulkReview(bulk);
                            deps.redraw();
                          }},
                        }, '⬇'),
                      ])
                    : h('button.games-view__review-btn', {
                        on: { click: (e: Event) => {
                          e.stopPropagation();
                          enqueueBulkReview([game]);
                          deps.redraw();
                        } },
                        attrs: { title: 'Queue for background review' },
                      }, 'Review'),
                ]);

            // Puzzle status: real data from savedPuzzles (persisted in IDB).
            const puzzleCount = deps.savedPuzzles.filter(p => p.gameId === game.id).length;
            const puzzleCell  = h('td.games-view__puzzles-cell',
              puzzleCount > 0
                ? h('span.games-view__puzzle-count', { attrs: { title: `${puzzleCount} saved puzzle${puzzleCount !== 1 ? 's' : ''}` } }, String(puzzleCount))
                : h('span.games-view__puzzle-none', '–')
            );

            return h('tr.games-view__row', {
              class: {
                active:   game.id === deps.selectedGameId,
                selected: selectedGameIds.has(game.id),
              },
              on: { click: (e: MouseEvent) => handleGameRowClick(game, games, e, deps, () => {
                selectAnalysisGame(game, deps);
              })},
            }, [
              h('td', renderResultIcon(r)),
              h('td.games-view__opponent', [
                opp,
                userColor ? h('span.color-chip.--' + (userColor === 'white' ? 'black' : 'white')) : null,
                isNewImport ? h('span.games-view__new-import', { attrs: { title: 'Newly imported' } }, 'NEW') : null,
              ]),
              ratingCell,
              h('td.games-view__account', accountLabel ?? ''),
              h('td.games-view__date', date),
              h('td.games-view__tc', [
                tcIcon
                  ? h('span', { attrs: { 'data-icon': tcIcon, style: 'font-family:lichess;margin-right:4px' } })
                  : null,
                tc.charAt(0).toUpperCase() + tc.slice(1),
              ]),
              h('td.games-view__opening', h('span', { attrs: { title: opening } }, opening)),
              reviewCell,
              puzzleCell,
              h('td.games-view__link-cell', srcUrl ? h('a.game-ext-link', {
                attrs: { href: srcUrl, target: '_blank', rel: 'noopener', title: 'View on source platform' },
                on: { click: (e: Event) => e.stopPropagation() },
              }) : null),
            ]);
          })
        : [h('tr', h('td', { attrs: { colspan: '10' } }, h('div.games-view__empty', 'No games match current filters.')))]
      ),
    ]),
  ]);

  return h('div.games-view', [filterBar, table, paginationBar]);
}
