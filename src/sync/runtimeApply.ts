export interface RuntimeApplyGameRecord {
  id: string;
  pgn: string;
}

export interface RuntimeApplyPlan {
  games: boolean;
  accounts: boolean;
  puzzles: boolean;
  openings: boolean;
  review: boolean;
  settings: boolean;
}

export type RuntimeBoardReloadReason =
  | 'active-game-deleted'
  | 'active-game-replaced';

export interface RuntimeGameApplyInput<TGame extends RuntimeApplyGameRecord> {
  games: readonly TGame[];
  storedSelectedId?: string | null;
  previousSelectedId: string | null;
  previousSelectedPgn: string | null;
  routeGameId?: string | null;
}

export interface RuntimeGameApplyDecision<TGame extends RuntimeApplyGameRecord> {
  selectedGame: TGame | null;
  routeGameDeleted: boolean;
  shouldReloadBoard: boolean;
  boardReloadReason: RuntimeBoardReloadReason | null;
}

const GAME_STORES = new Set(['games']);
const ACCOUNT_STORES = new Set(['accounts']);
const PUZZLE_STORES = new Set([
  'retro-results',
  'saved-review-puzzles',
  'puzzle-definitions',
  'puzzle-attempts',
  'puzzle-user-meta',
  'puzzle-user-perf',
  'puzzle-rating-history',
  'practice-lines',
  'position-progress',
  'drill-attempts',
]);
const OPENING_STORES = new Set([
  'opening-collections',
  'opening-session',
  'opening-training-variations',
  'repertoire-sources',
  'repertoire-match-records',
  'repertoire-scan-runs',
]);
const REVIEW_STORES = new Set([
  'analysis',
  'game-summaries',
  'retro-results',
  'saved-review-puzzles',
]);
const SETTINGS_STORES = new Set(['settings']);

function hasAnyStore(stores: ReadonlySet<string>, candidates: ReadonlySet<string>): boolean {
  for (const store of candidates) {
    if (stores.has(store)) return true;
  }
  return false;
}

export function planRemoteSyncRuntimeApply(stores: Iterable<string>): RuntimeApplyPlan {
  const changed = new Set(stores);
  return {
    games: hasAnyStore(changed, GAME_STORES),
    accounts: hasAnyStore(changed, ACCOUNT_STORES),
    puzzles: hasAnyStore(changed, PUZZLE_STORES),
    openings: hasAnyStore(changed, OPENING_STORES),
    review: hasAnyStore(changed, REVIEW_STORES),
    settings: hasAnyStore(changed, SETTINGS_STORES),
  };
}

export function decideRuntimeGameApply<TGame extends RuntimeApplyGameRecord>(
  input: RuntimeGameApplyInput<TGame>,
): RuntimeGameApplyDecision<TGame> {
  const previousSelectedGame = input.previousSelectedId
    ? input.games.find(game => game.id === input.previousSelectedId) ?? null
    : null;
  const routeGameDeleted = !!input.routeGameId
    && !input.games.some(game => game.id === input.routeGameId);

  if (previousSelectedGame) {
    const gameReplaced = previousSelectedGame.pgn !== input.previousSelectedPgn;
    return {
      selectedGame: previousSelectedGame,
      routeGameDeleted,
      shouldReloadBoard: gameReplaced,
      boardReloadReason: gameReplaced ? 'active-game-replaced' : null,
    };
  }

  if (input.previousSelectedId) {
    const fallback = (input.routeGameId
      ? input.games.find(game => game.id === input.routeGameId) ?? null
      : null)
      ?? (input.storedSelectedId ? input.games.find(game => game.id === input.storedSelectedId) ?? null : null)
      ?? input.games[0]
      ?? null;
    return {
      selectedGame: fallback,
      routeGameDeleted,
      shouldReloadBoard: true,
      boardReloadReason: 'active-game-deleted',
    };
  }

  return {
    selectedGame: null,
    routeGameDeleted,
    shouldReloadBoard: false,
    boardReloadReason: null,
  };
}
