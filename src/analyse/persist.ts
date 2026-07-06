
















import { buildPgn } from './pgnExport';
import { saveGameToIdb } from '../idb';
import { getQueueSummary } from '../engine/reviewQueue';
import type { ImportedGame } from '../import/types';

// --- Injected deps (mirrors initPgnExport's pattern, avoiding a circular import on main.ts) ---

let _getImportedGames:  () => ImportedGame[]                  = () => [];
let _getSelectedGameId: () => string | null                   = () => null;
let _onPersisted:       (gameId: string, pgn: string) => void  = () => {};

export function initPersist(deps: {
  getImportedGames:  () => ImportedGame[];
  getSelectedGameId: () => string | null;
  /** Called after a successful write so the in-memory game array stays in sync with IDB
   *  (mirrors the existing applyEnrichmentPatch pattern for other background game updates). */
  onPersisted: (gameId: string, pgn: string) => void;
}): void {
  _getImportedGames  = deps.getImportedGames;
  _getSelectedGameId = deps.getSelectedGameId;
  _onPersisted       = deps.onPersisted;
}

const GAME_PERSIST_DEBOUNCE_MS = 800;

let _pendingGameId: string | null = null;
let _pendingTimer:  ReturnType<typeof setTimeout> | null = null;








export function scheduleGamePersist(gameId: string): void {
  if (_pendingTimer !== null) clearTimeout(_pendingTimer);
  _pendingGameId = gameId;
  _pendingTimer = setTimeout(() => {
    _pendingTimer = null;
    void performGamePersist(gameId);
  }, GAME_PERSIST_DEBOUNCE_MS);
}
























export function flushPendingGamePersist(opts?: { isUnload?: boolean }): void {
  if (_pendingTimer === null || _pendingGameId === null) return;
  clearTimeout(_pendingTimer);
  _pendingTimer = null;
  void performGamePersist(_pendingGameId, opts);
}

async function performGamePersist(gameId: string, opts?: { isUnload?: boolean }): Promise<void> {
  // Stale-drop (contract §5): the selected game may have changed since this write was
  // scheduled — never write an annotated PGN built from ctrl.root onto the wrong game.
  if (_getSelectedGameId() !== gameId) return;

  // Library-backed games ONLY (contract §5 scope guard): the sample game and synthetic/
  // from-position boards (Board Editor, practice hand-offs) have no games-store record and
  // stay session-local until explicitly saved (T2's future categorize-on-save).
  const game = _getImportedGames().find(g => g.id === gameId);
  if (!game) return;















  if (getQueueSummary().currentGameId === gameId && !opts?.isUnload) {
    scheduleGamePersist(gameId);
    return;
  }

  // Serialize the CURRENT tree via the contract-conformant annotated exporter (§2-§4: header
  // roster, conditional FEN/SetUp, ECO/Opening/etc., %eval/%csl/%cal, RAV order). buildPgn()
  // reads whichever game is currently selected, which the stale-drop check above just
  // confirmed is still gameId.
  const pgn = buildPgn(true);

  // Upsert into the games store, replacing pgn only — sourcePgn (write-once at import,
  // src/import/types.ts) is never referenced here, so spreading `game` preserves whatever
  // value it already carries (or its absence, for legacy rows) instead of touching it.
  await saveGameToIdb({ ...game, pgn });
  _onPersisted(gameId, pgn);
}
