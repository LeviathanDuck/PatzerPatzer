















import type { ImportedGame } from './types';

/** True when the game id is a canonical platform game id (set by the import adapters). */
export function hasPlatformGameId(game: ImportedGame): boolean {
  return game.id.startsWith('lichess:') || game.id.startsWith('chesscom:');
}

/**
 * Composite fallback key for games without a platform id (PGN paste, or adapter games whose game
 * URL failed to parse). Avoids holding full PGN strings in the dedup Set (anti-pattern AP-6).
 * Format: "white:black:date:result" — compact (~40 chars vs ~10 KB per PGN).
 */
export function gameCompositeKey(game: ImportedGame): string {
  return `${game.white ?? ''}:${game.black ?? ''}:${game.date ?? ''}:${game.result ?? ''}`;
}

/**
 * Durability coverage identity for an imported game — the ONE shared key used for both in-memory
 * dedupe equivalence and durability provenance. Platform game → `id:<canonical game id>`;
 * PGN/non-platform game → `composite:<white>:<black>:<date>:<result>`.
 *
 * The composite case for PGN is load-bearing (design consult §2 "Coverage key"): a retry regenerates
 * a fresh `game.id` for the same pasted PGN, so an id-only pending set would never match the retry
 * and would reproduce the textarea-loss bug.
 */
export function importedGameCoverageKey(game: ImportedGame): string {
  return hasPlatformGameId(game) ? `id:${game.id}` : `composite:${gameCompositeKey(game)}`;
}

/**
 * Dedupe by canonical game id: platform ids are globally unique, so re-imports and overlapping
 * batches drop out by construction, while distinct same-day games against the same opponent both
 * survive. Games without a platform id fall back to the composite key so pasting the same PGN twice
 * still dedupes. (Moved verbatim from main.ts — no semantic change.)
 */
export function dedupeImportedGames(existing: ImportedGame[], incoming: ImportedGame[]): ImportedGame[] {
  const seenIds = new Set(existing.map(g => g.id));
  const seenKeys = new Set(existing.filter(g => !hasPlatformGameId(g)).map(gameCompositeKey));
  const deduped: ImportedGame[] = [];
  const importedAt = Date.now();
  for (const game of incoming) {
    if (seenIds.has(game.id)) continue;
    if (!hasPlatformGameId(game)) {
      const key = gameCompositeKey(game);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
    }
    seenIds.add(game.id);
    deduped.push({ ...game, importedAt });
  }
  return deduped;
}

/** Injected durable batch writer — full-library snapshot in, durable-success boolean out. */
export type SaveGamesToIdb = (games: ImportedGame[]) => Promise<boolean>;

export interface ImportDurabilityCoordinator {
  /**
   * Record that `games` were just added optimistically to the in-memory library and are not yet
   * durability-covered. Called on the first attempt for a freshly-deduped batch, before the durable
   * write is requested. A retry (dedupe returns empty) does NOT re-mark — the keys are still pending.
   */
  markOptimisticAddition(games: ImportedGame[]): void;
  /**
   * Ensure the incoming batch is durably covered, and resolve to whether it now is.
   *
   * - If none of `incomingGames`' coverage keys is still pending, the batch is already durable in
   *   this page session (a prior successful write, or the durable hydration baseline) → resolves
   *   `true`, no write.
   * - If a pending key remains (e.g. after a previously-settled failure), requests a durable write
   *   of a fresh full-library snapshot (from `getLibrarySnapshot`) and resolves to exactly that
   *   write's boolean. On success, every pending key present in that snapshot is cleared; on failure
   *   or rejection nothing is cleared.
   * - Single-flight (design consult §4): at most one snapshot write from the import lane is active at
   *   a time. A duplicate request whose pending targets are all covered by the active flight attaches
   *   to it (no second write); a distinct batch added mid-flight serialises its write behind the
   *   active flight. This is scoped to the import lane only — never a global persistence lock.
   */
  ensureIncomingDurable(
    incomingGames: ImportedGame[],
    getLibrarySnapshot: () => readonly ImportedGame[],
  ): Promise<boolean>;
  /** Test/diagnostic inspection of the current pending coverage-key count. */
  pendingKeyCount(): number;
}

export function createImportDurabilityCoordinator(
  saveGamesToIdb: SaveGamesToIdb,
): ImportDurabilityCoordinator {
  // Coverage keys added optimistically but not yet covered by a successful batch write.
  const pending = new Set<string>();

  interface Flight {
    keys: Set<string>;          // immutable snapshot coverage keys, captured before the save call
    promise: Promise<boolean>;  // shared result; duplicate requests attach to this
  }
  let activeFlight: Flight | null = null;
  // Serialisation tail: settles when the most recently scheduled flight settles. A distinct batch
  // added mid-flight chains its write behind this so only one saveGamesToIdb runs at a time.
  let tail: Promise<unknown> = Promise.resolve();
  // Count of flights scheduled-but-not-yet-settled (active + queued). idle == 0. Guards the
  // synchronous idle-start so a concurrent duplicate observes the active flight and attaches instead
  // of launching a redundant second write.
  let scheduled = 0;

  function beginFlight(getLibrarySnapshot: () => readonly ImportedGame[]): Promise<boolean> {
    const snapshot = getLibrarySnapshot().slice();
    const keys = new Set(snapshot.map(importedGameCoverageKey));
    const flight: Flight = { keys, promise: Promise.resolve(false) };
    activeFlight = flight;
    // saveGamesToIdb is invoked synchronously here so activeFlight is observable before any await —
    // a concurrent duplicate request can attach to this exact flight rather than starting its own.
    const settle = Promise.resolve(saveGamesToIdb(snapshot))
      .then(
        ok => {
          if (ok) for (const key of keys) pending.delete(key);
          return ok;
        },
        () => false, // a rejected durable write is a failure, never a silent success
      )
      .finally(() => {
        if (activeFlight === flight) activeFlight = null;
      });
    flight.promise = settle;
    return settle;
  }

  return {
    markOptimisticAddition(games: ImportedGame[]): void {
      for (const game of games) pending.add(importedGameCoverageKey(game));
    },

    ensureIncomingDurable(incomingGames, getLibrarySnapshot): Promise<boolean> {
      const pendingIncoming = incomingGames
        .map(importedGameCoverageKey)
        .filter(key => pending.has(key));
      if (pendingIncoming.length === 0) {
        // Already durably covered (prior successful write, or hydration baseline). No write.
        return Promise.resolve(true);
      }
      const active = activeFlight;
      if (active && pendingIncoming.every(key => active.keys.has(key))) {
        // Duplicate request fully covered by the in-flight snapshot: attach, no second write.
        return active.promise;
      }
      if (scheduled === 0) {
        // Idle: start synchronously so a concurrent duplicate observes the active flight and attaches.
        scheduled++;
        const started = beginFlight(getLibrarySnapshot);
        tail = started.catch(() => {});
        return started.finally(() => { scheduled--; });
      }
      // Busy: a distinct batch. Serialise its write behind everything scheduled so far — the snapshot
      // is captured only when this flight actually runs, so it contains every game added meanwhile.
      scheduled++;
      const queued = tail.catch(() => {}).then(() => beginFlight(getLibrarySnapshot));
      tail = queued.catch(() => {});
      return queued.finally(() => { scheduled--; });
    },

    pendingKeyCount(): number {
      return pending.size;
    },
  };
}
