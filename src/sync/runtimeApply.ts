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
  practice: boolean;
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




export const PRACTICE_STORES = new Set([
  'study-practice-lessons',
  'study-practice-decisions',
  'study-practice-srs',
  'study-practice-attempts',
  'study-practice-sessions',
]);

// Parent-before-child apply rank: lessons (0) before decisions (1) before srs/attempts/sessions (2).
// A decision references its lesson; an SRS/attempt/session references both lesson and decision, but
// the durable orphan relationship that gates apply is the LESSON (every child row carries `lessonId`).
const PRACTICE_APPLY_RANK: Record<string, number> = {
  'study-practice-lessons': 0,
  'study-practice-decisions': 1,
  'study-practice-srs': 2,
  'study-practice-attempts': 2,
  'study-practice-sessions': 2,
};

export function isPracticeStore(store: string): boolean {
  return PRACTICE_STORES.has(store);
}

/** A practice CHILD store — a row that depends on its owning lesson being applied first. Lessons are
 *  the parents and are never children; the SRS/attempt/session/decision rows all carry `lessonId`. */
export function isPracticeChildStore(store: string): boolean {
  return store === 'study-practice-decisions'
    || store === 'study-practice-srs'
    || store === 'study-practice-attempts'
    || store === 'study-practice-sessions';
}

/** Apply-ordering rank for a practice store (lower applies first). Non-practice stores sort last so a
 *  mixed list keeps practice items grouped in parent-before-child order without disturbing the rest. */
export function practiceStoreApplyRank(store: string): number {
  return PRACTICE_APPLY_RANK[store] ?? Number.MAX_SAFE_INTEGER;
}

/** The owning lesson id a practice row depends on. For a lesson it is the row's own `lessonId`; for a
 *  child it is the parent `lessonId`. Pure — reads only the durable identity field, never chess
 *  material, and returns null when absent (an unparented row the apply path rejects as invalid). */
export function practiceParentLessonId(store: string, payload: unknown): string | null {
  const record = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  if (!record) return null;
  const lessonId = record.lessonId;
  return typeof lessonId === 'string' && lessonId.trim() ? lessonId : null;
}

export interface PracticeApplyItem {
  readonly store: string;
  readonly itemKey: string;
  /** Owning lesson id (own id for a lesson, parent id for a child); null when absent from the row. */
  readonly lessonId: string | null;
  /** A tombstone delete — never deferred (a delete must always land; no reanimation risk). */
  readonly deleted: boolean;
}

export interface PracticeApplyPlan {
  /** Items to apply this run, in parent-before-child order. */
  readonly ordered: PracticeApplyItem[];
  /** Orphan children whose owning lesson is neither known locally nor upserted in this batch — they
   *  defer to a later pull once the lesson lands (blocking skip; the cursor must not advance past). */
  readonly deferred: PracticeApplyItem[];
}

/**
 * Pure model of the B7 apply ordering + orphan-defer the live `applyIdbItem` path enforces per item.
 * Stable-sorts practice items into parent-before-child order, then defers any child upsert whose
 * owning lesson is not available after this batch (known locally OR upserted here). Mirrors the memo
 * B7 attack-surface requirements "child apply before parent" and "orphan child … defers"; the live
 * loop reaches the same outcome via a per-child parent-existence read plus server version ordering.
 */
export function planPracticeApplyOrder(
  items: readonly PracticeApplyItem[],
  knownLessonIds: ReadonlySet<string>,
): PracticeApplyPlan {
  const ordered = items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rankDelta = practiceStoreApplyRank(a.item.store) - practiceStoreApplyRank(b.item.store);
      return rankDelta !== 0 ? rankDelta : a.index - b.index;
    })
    .map(entry => entry.item);

  // Lessons available after this batch: everything already local plus every lesson UPSERT in the run.
  const availableLessons = new Set(knownLessonIds);
  for (const item of ordered) {
    if (item.store === 'study-practice-lessons' && !item.deleted && item.lessonId) {
      availableLessons.add(item.lessonId);
    }
  }

  const applied: PracticeApplyItem[] = [];
  const deferred: PracticeApplyItem[] = [];
  for (const item of ordered) {
    if (isPracticeChildStore(item.store) && !item.deleted
      && (!item.lessonId || !availableLessons.has(item.lessonId))) {
      deferred.push(item);
      continue;
    }
    applied.push(item);
  }
  return { ordered: applied, deferred };
}

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
    practice: hasAnyStore(changed, PRACTICE_STORES),
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
