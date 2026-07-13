// IndexedDB persistence layer.
// DB name: 'patzer-pro' — see DB_VERSION and openGameDb() for the current schema.
// Mirrors the pattern of lichess-org/lila: ui/analyse/src/idbTree.ts

import type { ImportedGame } from '../import/types';
import type { ChessAccount, AccountPlatform } from '../accounts';
import type { PuzzleCandidate, TreeNode } from '../tree/types';
import { classifyLoss, type MoveLabel } from '../engine/winchances';
import type { RetroOutcome } from '../analyse/retroCtrl';
import { parseQuestionnaireFromPgn } from '../analyse/questionnaire/model';
import type { GameSummary } from '../stats/types';
import { classifyOpening } from '../openings/eco';
import type { RemoteSyncItem, RemoteSyncStoreName } from '../sync/remoteSync';
import {
  isDataManagementReviewWriteStale,
  recordDataManagementStaleWriteDrop,
  type DataManagementReviewStore,
} from '../sync/dataManagementRuntime';
import type { DiagnosticAggregate, DiagnosticAggregateKind, DiagnosticEvent, DiagnosticSession } from '../diagnostics/types';
import type { DiagnosticReport as AssembledDiagnosticReport } from '../diagnostics/reporting/reportAssembly';
import type { ReportIssueDraft, ReportIssueDraftStatus } from '../diagnostics/reporting/reportDraftTypes';



import { record, record as recordDiagnostic, Severity } from '../diagnostics';
import { captureStorageEstimate } from '../diagnostics/performance/deviceSignals';
import type { ReviewRunManifest } from '../engine/reviewRun';

/**
 * Resolve when an IDB transaction commits; reject on error or abort.
 * Instruments onerror/onabort to emit a diagnostic event with the store
 * name, operation, and error name — no record data or PII is included.
 * QuotaExceededError additionally triggers a navigator.storage.estimate()
 * call so quota and usage are captured alongside the failure context.
 */
function txDone(tx: IDBTransaction, operationType?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();

    const handleTxFailure = (eventLabel: string) => {
      const err = tx.error;
      const storeNames = Array.from(tx.objectStoreNames);
      const storeName = storeNames.length === 1 ? storeNames[0]! : storeNames.join(',');
      const mode = tx.mode ?? 'unknown';
      const operation = operationType ?? (mode === 'readonly' ? 'read' : 'write');
      const errorName = err?.name ?? 'UnknownError';

      if (errorName === 'QuotaExceededError') {
        const estimateAvailable =
          typeof navigator !== 'undefined' &&
          typeof navigator.storage?.estimate === 'function';

        if (estimateAvailable) {
          navigator.storage.estimate().then(({ quota, usage }) => {
            record({
              kind: 'idb',
              severity: Severity.Error,
              sourceTag: 'idb',
              message: `IDB ${eventLabel}: QuotaExceededError`,
              metadata: {
                storeName,
                operation,
                mode,
                errorName,
                quota: quota ?? null,
                usage: usage ?? null,
                quotaBytes: quota ?? null,
                usageBytes: usage ?? null,
              },
              redactionClass: 'safe',
            });
          }).catch(() => {
            // estimate() failed — log without storage numbers
            record({
              kind: 'idb',
              severity: Severity.Error,
              sourceTag: 'idb',
              message: `IDB ${eventLabel}: QuotaExceededError (estimate unavailable)`,
              metadata: { storeName, operation, mode, errorName },
              redactionClass: 'safe',
            });
          });
        } else {
          record({
            kind: 'idb',
            severity: Severity.Error,
            sourceTag: 'idb',
            message: `IDB ${eventLabel}: QuotaExceededError (estimate API absent)`,
            metadata: { storeName, operation, mode, errorName },
            redactionClass: 'safe',
          });
        }
      } else {
        record({
          kind: 'idb',
          severity: Severity.Error,
          sourceTag: 'idb',
          message: `IDB transaction ${eventLabel}`,
          metadata: { storeName, operation, mode, errorName },
          redactionClass: 'safe',
        });
      }

      reject(err);
    };

    tx.onerror = () => handleTxFailure('onerror');
    tx.onabort = () => handleTxFailure('onabort');
  });
}

/**
 * Produce a safe key descriptor for diagnostic logging.
 * Reports the key's JS type and, for strings, its length — never the raw value.
 * No game IDs, usernames, or any user-identifiable content is included.
 */
function redactKeyDescriptor(key: unknown): string {
  if (key === undefined || key === null) return 'none';
  const t = typeof key;
  if (t === 'string') return `string(${(key as string).length})`;
  if (t === 'number') return 'number';
  if (t === 'boolean') return 'boolean';
  if (Array.isArray(key)) return `array(${key.length})`;
  return t;
}

/**
 * Emit a diagnostic event for an individual IDB request failure and return
 * the error so callers can re-reject with it.
 * Captures the current route (window.location.pathname) at the time of failure.
 * Session ID is captured automatically by record().
 * Raw key values are never included — only a type/length descriptor.
 */
function recordReqFailure(
  req: IDBRequest,
  storeName: string,
  operation: 'read' | 'write' | 'delete' | 'cursor',
  key?: unknown,
): DOMException | null {
  const err = req.error;
  const errorName = err?.name ?? 'UnknownError';
  const metadata: Record<string, string | number> = {
    storeName,
    operation,
    errorName,
  };
  if (key !== undefined) metadata.keyDescriptor = redactKeyDescriptor(key);
  record({
    kind: 'idb',
    severity: Severity.Error,
    sourceTag: 'idb',
    message: `IDB request onerror: ${operation} on ${storeName}`,
    metadata,
    redactionClass: 'safe',
  });
  return err;
}
















function recordTxFailure(tx: IDBTransaction, eventLabel: string, operationType?: string): void {
  const storeNames = Array.from(tx.objectStoreNames);
  const storeName = storeNames.length === 1 ? storeNames[0]! : storeNames.join(',');
  const mode = tx.mode ?? 'unknown';
  record({
    kind: 'idb',
    severity: Severity.Error,
    sourceTag: 'idb',
    message: `IDB transaction ${eventLabel}`,
    metadata: {
      storeName,
      operation: operationType ?? (mode === 'readonly' ? 'read' : 'write'),
      mode,
      errorName: tx.error?.name ?? 'UnknownError',
    },
    redactionClass: 'safe',
  });
}

function enqueueMainDbPut(storeName: RemoteSyncStoreName, itemKey: string, payload: unknown, updatedAt = Date.now()): void {
  void import('../sync/remoteSync')
    .then(({ enqueueRemoteSyncUpsert }) => enqueueRemoteSyncUpsert(storeName, itemKey, payload, updatedAt))
    .catch(e => console.warn('[idb] Remote sync enqueue failed', e));
}










function enqueueMainDbPutClearingDeletedAt(
  storeName: RemoteSyncStoreName,
  itemKey: string,
  payload: unknown,
  updatedAt = Date.now(),
): void {
  void import('../sync/remoteSync')
    .then(({ clearRemoteSyncDeletedAtMarker, enqueueRemoteSyncUpsert }) => {
      clearRemoteSyncDeletedAtMarker(storeName, itemKey);
      enqueueRemoteSyncUpsert(storeName, itemKey, payload, updatedAt);
    })
    .catch(e => console.warn('[idb] Remote sync enqueue failed', e));
}

function enqueueMainDbDelete(storeName: RemoteSyncStoreName, itemKey: string): void {
  void import('../sync/remoteSync')
    .then(({ enqueueRemoteSyncDelete }) => enqueueRemoteSyncDelete(storeName, itemKey))
    .catch(e => console.warn('[idb] Remote sync delete enqueue failed', e));
}

function enqueueMainDbPutBatch(items: RemoteSyncItem[]): void {
  if (items.length === 0) return;
  void import('../sync/remoteSync')
    .then(({ enqueueRemoteSyncItemsBatch }) => enqueueRemoteSyncItemsBatch(items))
    .catch(e => console.warn('[idb] Remote sync batch enqueue failed', e));
}

// --- Stored schemas ---

export interface StoredGames {
  games:      ImportedGame[];
  selectedId: string | null;
  path?:      string;
}

interface StoredGameLibrary {
  games: ImportedGame[];
}

interface StoredGameNavState {
  selectedId: string | null;
  path?:      string;
}

// Bumped when the analysis node schema changes. Records from older versions are discarded.
export const ANALYSIS_VERSION = 2; // path-keyed nodes (was node.id-keyed in v1)

export type AnalysisStatus = 'idle' | 'partial' | 'complete';

export interface ReviewEngineMetadata {
  engineName:       string;
  engineModel:      string;
  strengthLabel:    'full strength';
  uciLimitStrength: false;
  reviewDepth:      number;
  capturedAt:       string;



  /** The depth this run was ASKED for (entry.depth), as opposed to reviewDepth's min-reached stamp. */
  requestedDepth?: number;

  profileId?:      'bulk' | 'one-off';
  /** Movetime actually in effect for this entry at completion: the live Bulk movetime for a
   *  'bulk' entry, or null for a depth-only 'one-off' entry (which never carries a movetime clause). */
  movetimeMs?:     number | null;
}

export interface StoredNodeEntry {
  nodeId: string;
  path:   string;
  fen:    string;
  cp?:    number;
  mate?:  number;
  best?:  string;
  loss?:  number;
  delta?: number;
  /** Explicit move-review annotation derived from win-chance loss at analysis time.
   *  Absent on older records (ANALYSIS_VERSION < 3) and on moves with no label (good moves). */
  label?: MoveLabel;
  /**
   * Primary PV move sequence from this position, in UCI notation.
   * Persisted from PositionEval.moves at save time for use by retrospection answer reveal
   * and later near-best parity work.
   * Absent on older records and on positions where the engine produced no PV line.
   * Mirrors lichess-org/lila: RetroCandidate solution line (from comp child moves array).
   */
  bestLine?: string[];






  depth?: number;
}

export interface StoredAnalysis {
  gameId:          string;
  analysisVersion: number;
  analysisDepth:   number;
  reviewEngine?:   ReviewEngineMetadata;
  status:          AnalysisStatus;
  updatedAt:       number; // Date.now()
  nodes:           Record<string, StoredNodeEntry>; // keyed by path
}

export interface CompletedAnalysisMetadata {
  gameId:       string;
  reviewEngine?: ReviewEngineMetadata;
  updatedAt:    number;
  nodes:        Record<string, StoredNodeEntry>;
}








export interface PartialAnalysisMetadata {
  gameId:    string;
  updatedAt: number;
  status:    AnalysisStatus;
}

export interface VersionStaleAnalysisMetadata {
  gameId:          string;
  updatedAt:       number;
  analysisVersion: number;
}

export interface AnalysisLibraryClassification {
  complete:     CompletedAnalysisMetadata[];
  partial:      PartialAnalysisMetadata[];
  versionStale: VersionStaleAnalysisMetadata[];
}

// --- Analysis serialization ---

export function buildReviewEngineMetadata(
  engineName: string | undefined,
  reviewDepth: number,



  requestBudget?: { requestedDepth?: number; profileId?: 'bulk' | 'one-off'; movetimeMs?: number | null },
): ReviewEngineMetadata {
  return {
    engineName:       engineName?.trim() || 'Stockfish 18 smallnet',
    engineModel:      'sf_18_smallnet',
    strengthLabel:    'full strength',
    uciLimitStrength: false,
    reviewDepth,
    capturedAt:       new Date().toISOString(),
    ...(requestBudget?.requestedDepth !== undefined ? { requestedDepth: requestBudget.requestedDepth } : {}),
    ...(requestBudget?.profileId !== undefined ? { profileId: requestBudget.profileId } : {}),
    ...(requestBudget?.movetimeMs !== undefined ? { movetimeMs: requestBudget.movetimeMs } : {}),
  };
}

function shouldDropDataManagementReviewWrite(
  store: DataManagementReviewStore,
  gameId: string,
  requestedAt: number,
): boolean {
  if (!isDataManagementReviewWriteStale(gameId, requestedAt)) return false;
  recordDataManagementStaleWriteDrop(store, gameId, requestedAt);
  return true;
}

async function persistAnalysisToIdb(
  status: AnalysisStatus,
  gameId: string,
  nodes:  Record<string, StoredNodeEntry>,
  depth:  number,
  reviewEngine?: ReviewEngineMetadata,
  requestedAt = Date.now(),
): Promise<void> {
  if (shouldDropDataManagementReviewWrite('analysis', gameId, requestedAt)) return;
  const existingReviewEngine = reviewEngine === undefined && status === 'complete'
    ? (await loadAnalysisFromIdb(gameId))?.reviewEngine
    : undefined;
  if (shouldDropDataManagementReviewWrite('analysis', gameId, requestedAt)) return;
  const storedReviewEngine = reviewEngine ?? existingReviewEngine;
  const db = await openGameDb();
  const record: StoredAnalysis = {
    gameId,
    analysisVersion: ANALYSIS_VERSION,
    analysisDepth:   depth,
    ...(storedReviewEngine !== undefined ? { reviewEngine: storedReviewEngine } : {}),
    status,
    updatedAt:       Date.now(),
    nodes,
  };
  const tx = db.transaction('analysis-library', 'readwrite');
  tx.objectStore('analysis-library').put(record, gameId);
  await txDone(tx);



  if (status === 'complete') enqueueMainDbPutClearingDeletedAt('analysis', gameId, record, record.updatedAt);
  else enqueueMainDbPut('analysis', gameId, record, record.updatedAt);
  void captureStorageEstimate('post-idb-write');
}

type PositionEvalLike = { cp?: number; mate?: number; best?: string; loss?: number; delta?: number; moves?: string[]; depth?: number };








export function isDeeperEval(
  prev: { depth?: number } | undefined,
  next: { depth?: number },
): boolean {
  if (next.depth === undefined) return false;        // nothing to merge without a measured depth
  if (!prev || prev.depth === undefined) return true; // unknown prior depth → accept
  return next.depth > prev.depth;                      // strictly deeper wins; equal/shallower rejected
}










export function isStoredAnalysisLoadable(
  stored: Pick<StoredAnalysis, 'analysisVersion'> | undefined,
): boolean {
  return stored !== undefined && stored.analysisVersion === ANALYSIS_VERSION;
}


















export function storedAnalysisSatisfiesAskingDepth(
  stored: Pick<StoredAnalysis, 'status' | 'analysisVersion' | 'analysisDepth' | 'reviewEngine'> | undefined,
  askingDepth: number,
): boolean {
  if (stored?.status !== 'complete' || stored.analysisVersion !== ANALYSIS_VERSION) return false;
  const effectiveDepth = stored.reviewEngine?.requestedDepth ?? stored.analysisDepth;
  return effectiveDepth >= askingDepth;
}









export function buildAnalysisNodeEntry(nodeId: string, path: string, fen: string, ev: PositionEvalLike): StoredNodeEntry {
  const entry: StoredNodeEntry = { nodeId, path, fen };
  if (ev.cp    !== undefined) entry.cp    = ev.cp;
  if (ev.mate  !== undefined) entry.mate  = ev.mate;
  if (ev.best  !== undefined) entry.best  = ev.best;
  if (ev.loss  !== undefined) entry.loss  = ev.loss;
  if (ev.delta !== undefined) entry.delta = ev.delta;

  if (ev.depth !== undefined) entry.depth = ev.depth;
  // Persist the primary PV line for retrospection answer reveal and near-best parity.
  // Mirrors lichess-org/lila: retroCtrl.ts solution line from comp child moves array.
  if (ev.moves !== undefined && ev.moves.length > 0) entry.bestLine = ev.moves;
  const label = ev.loss !== undefined ? classifyLoss(ev.loss) : null;
  if (label !== null) entry.label = label;
  return entry;
}








export function buildAnalysisNodes(
  mainline: readonly TreeNode[],
  getEval:  (path: string) => PositionEvalLike | undefined,
): Record<string, StoredNodeEntry> {
  const nodes: Record<string, StoredNodeEntry> = {};
  // Serialize the ROOT eval under path '' too (BUG-2026-07-10-035). The loop below starts at
  // i=1, so without this the root (mainline[0], path '') is never persisted — yet
  // buildRetroCandidates needs getEval('') to flag ply-1 (first-move) mistakes, which then
  // silently vanish after reload. Additive and keyed by '', mirroring the i>=1 entries.
  const root = mainline[0];
  if (root) {
    const rootEval = getEval('');
    if (rootEval) nodes[''] = buildAnalysisNodeEntry(root.id, '', root.fen, rootEval);
  }
  let path = '';
  for (let i = 1; i < mainline.length; i++) {
    const node = mainline[i]!;
    path += node.id;
    const ev = getEval(path);
    if (ev) nodes[path] = buildAnalysisNodeEntry(node.id, path, node.fen, ev);
  }
  return nodes;
}

// --- Puzzle state ---
// Module-level; set at startup via setSavedPuzzles() and mutated by savePuzzle().

export let savedPuzzles: PuzzleCandidate[] = [];

/**
 * True only once loadPuzzlesFromIdb() has SUCCESSFULLY read the durable saved-puzzles singleton
 * (including a genuinely-empty library). A failed or absent load leaves this false so the in-memory
 * `savedPuzzles` mirror is never mistaken for the durable set. This flag is the guard that stops a
 * masked load failure from letting the next savePuzzle() overwrite — and permanently destroy — the
 * durable singleton (BUG-2026-07-10-017).
 *
 * setSavedPuzzles() deliberately does NOT set it: on the DB-open-failure path loadPuzzlesFromIdb
 * returns the masked-empty [] and the caller passes that [] straight to setSavedPuzzles(), which
 * must stay UN-hydrated — otherwise the guard would be defeated by exactly the failure it protects
 * against. Only loadPuzzlesFromIdb's success path may set it.
 */
let _savedPuzzlesHydrated = false;

export function setSavedPuzzles(puzzles: PuzzleCandidate[]): void {
  savedPuzzles = puzzles;
}

/**
 * Whether `savedPuzzles` is known to reflect a successful read of the durable singleton. Lets
 * callers distinguish a failed load (unhydrated) from a genuinely-empty library — the return value
 * of loadPuzzlesFromIdb alone ([] in both cases) cannot.
 */
export function isSavedPuzzlesHydrated(): boolean {
  return _savedPuzzlesHydrated;
}

// --- Retro session result ---

/**
 * Persisted outcome record for a single "Learn From Your Mistakes" session.
 * Stored in the 'retro-results' IDB object store, keyed by gameId.
 * Each gameId stores only the latest session; older sessions are overwritten.
 */
export interface RetroSessionResult {
  /** ID of the game the session was run against. */
  gameId: string;
  /** Date.now() when the record was last written. */
  savedAt: number;
  /** Total number of mistake candidates in the session. */
  totalCandidates: number;
  /**
   * Per-ply outcomes recorded during the session.
   * Keyed by ply number (as string for JSON compatibility).
   */
  outcomes: Record<string, RetroOutcome>;
  /** True when every candidate has been resolved (win, fail, view, or skip). */
  complete: boolean;
}

// --- Per-game record type ---






export interface StoredGameRecord {
  id:               string;
  pgn:              string;
  white:            string | null;
  black:            string | null;
  result:           string | null;
  date:             string | null;
  timeClass:        string | null;
  opening:          string | null;
  eco:              string | null;
  source:           'lichess' | 'chesscom' | 'pgn' | null;
  whiteRating:      number | null;
  blackRating:      number | null;
  importedUsername: string | null;
  accountId:        string | null;
  importedAt:       number;
  updatedAt:        number;









  platformAccuracies?: { white?: number; black?: number } | null;
  whiteResultCode?:    string | null;
  blackResultCode?:    string | null;
  termination?:        string | null;
  uuid?:               string | null;
  finalFen?:           string | null;
  openingUrl?:         string | null;
  variant?:            string | null;
  timeControl?:        string | null;
  rated?:              boolean | null;
  startTime?:          number | null;
  endTime?:            number | null;
  tournamentUrl?:      string | null;
  matchUrl?:           string | null;
  ratingDelta?:        number | null;
  opponentRatingDelta?: number | null;







  sourcePgn?: string | null;
}

// --- Player profiles ---










export interface PlayerProfileRecord {
  /** `${platform}:${lowercased username}`. */
  key:          string;
  platform:     AccountPlatform;
  /** Lowercased canonical username. */
  username:     string;
  /** Avatar image URL only — never an image blob (owner decision). */
  avatarUrl?:   string;
  /** ISO country code, uppercased. */
  countryCode?: string;
  /** Public display name (chess.com `name`; lichess `title`/`realName`). */
  displayName?: string;
  /** Date.now() of the last successful fetch. */
  fetchedAt:    number;
}

// --- DB connection ---

export const DB_NAME = 'patzer-pro';

export const DB_VERSION = 26;

let _idb: IDBDatabase | undefined;

function ensureIndex(
  store: IDBObjectStore,
  name: string,
  keyPath: string | string[],
  options?: IDBIndexParameters,
): void {
  if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function ensureStore(
  db: IDBDatabase,
  event: IDBVersionChangeEvent,
  name: string,
  options?: IDBObjectStoreParameters,
): IDBObjectStore {
  if (!db.objectStoreNames.contains(name)) return db.createObjectStore(name, options);
  const tx = (event.target as IDBOpenDBRequest).transaction;
  if (!tx) throw new Error(`IndexedDB upgrade transaction missing for ${name}.`);
  return tx.objectStore(name);
}

export function upgradeGameDbSchema(db: IDBDatabase, event: IDBVersionChangeEvent): void {
  ensureStore(db, event, 'game-library');
  ensureStore(db, event, 'puzzle-library');
  ensureStore(db, event, 'analysis-library');
  ensureStore(db, event, 'retro-results');
  ensureStore(db, event, 'game-summaries');

  // Per-game store: each game is an individual record keyed by game id.
  // Indexes support filtered queries without loading all games into memory.
  // Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts cursor patterns.
  const gamesStore = ensureStore(db, event, 'games', { keyPath: 'id' });
  ensureIndex(gamesStore, 'date',             'date',             { unique: false });
  ensureIndex(gamesStore, 'importedUsername', 'importedUsername', { unique: false });
  ensureIndex(gamesStore, 'source',           'source',           { unique: false });
  ensureIndex(gamesStore, 'timeClass',        'timeClass',        { unique: false });
  ensureIndex(gamesStore, 'eco',              'eco',              { unique: false });
  ensureIndex(gamesStore, 'opening',          'opening',          { unique: false });
  ensureIndex(gamesStore, 'accountId',        'accountId',        { unique: false });


  const studiesStore = ensureStore(db, event, 'studies', { keyPath: 'id' });
  ensureIndex(studiesStore, 'createdAt', 'createdAt', { unique: false });
  ensureIndex(studiesStore, 'updatedAt', 'updatedAt', { unique: false });
  ensureIndex(studiesStore, 'source',    'source',    { unique: false });
  ensureIndex(studiesStore, 'favorite',  'favorite',  { unique: false });

  const practiceStore = ensureStore(db, event, 'practice-lines', { keyPath: 'id' });
  ensureIndex(practiceStore, 'studyItemId', 'studyItemId', { unique: false });
  ensureIndex(practiceStore, 'status',      'status',      { unique: false });

  const progressStore = ensureStore(db, event, 'position-progress', { keyPath: 'key' });
  ensureIndex(progressStore, 'nextDueAt', 'nextDueAt', { unique: false });

  const attemptsStore = ensureStore(db, event, 'drill-attempts', { autoIncrement: true });
  ensureIndex(attemptsStore, 'positionKey', 'positionKey', { unique: false });
  ensureIndex(attemptsStore, 'timestamp',   'timestamp',   { unique: false });

  // v9: study folder hierarchy store
  const foldersStore = ensureStore(db, event, 'folders', { keyPath: 'id' });
  ensureIndex(foldersStore, 'parentId',  'parentId',  { unique: false });
  ensureIndex(foldersStore, 'createdAt', 'createdAt', { unique: false });


  const accountsStore = ensureStore(db, event, 'accounts', { keyPath: 'id' });
  ensureIndex(accountsStore, 'category', 'category', { unique: false });
  ensureIndex(accountsStore, 'platform', 'platform', { unique: false });








  const accountsCursorReq = accountsStore.openCursor();
  accountsCursorReq.onsuccess = () => {
    const cursor = accountsCursorReq.result;
    if (!cursor) return;
    const record = cursor.value as ChessAccount;
    let changed = false;
    if (record.section === undefined) {
      record.section = record.category === 'opponent' ? 'research' : 'study';
      changed = true;
    }
    if (record.order === undefined) {
      record.order = record.addedAt;
      changed = true;
    }
    if (changed) cursor.update(record);
    cursor.continue();
  };



  ensureStore(db, event, 'review-queue', { keyPath: 'gameId' });


  const reviewFailuresStore = ensureStore(db, event, 'review-failures', { keyPath: 'key' });
  ensureIndex(reviewFailuresStore, 'gameId', 'gameId', { unique: false });
  ensureIndex(reviewFailuresStore, 'depth',  'depth',  { unique: false });



  const reviewRunsStore = ensureStore(db, event, 'review-runs', { keyPath: 'runId' });
  ensureIndex(reviewRunsStore, 'lifecycleState', 'lifecycleState', { unique: false });
  ensureIndex(reviewRunsStore, 'updatedAt',      'updatedAt',      { unique: false });


  const diagnosticEventsStore = ensureStore(db, event, 'diagnostic-events', { keyPath: 'eventId' });
  ensureIndex(diagnosticEventsStore, 'timestamp', 'timestamp', { unique: false });
  ensureIndex(diagnosticEventsStore, 'kind',      'kind',      { unique: false });
  ensureIndex(diagnosticEventsStore, 'severity',  'severity',  { unique: false });
  ensureIndex(diagnosticEventsStore, 'route',     'route',     { unique: false });
  ensureIndex(diagnosticEventsStore, 'sessionId', 'sessionId', { unique: false });


  const diagnosticSessionsStore = ensureStore(db, event, 'diagnostic-sessions', { keyPath: 'sessionId' });
  ensureIndex(diagnosticSessionsStore, 'startedAt', 'startedAt', { unique: false });
  ensureIndex(diagnosticSessionsStore, 'sessionId', 'sessionId', { unique: false });


  const diagnosticReportsStore = ensureStore(db, event, 'diagnostic-reports', { keyPath: 'reportId' });
  ensureIndex(diagnosticReportsStore, 'createdAt', 'createdAt', { unique: false });
  ensureIndex(diagnosticReportsStore, 'timestamp', 'timestamp', { unique: false });
  ensureIndex(diagnosticReportsStore, 'severity',  'severity',  { unique: false });
  ensureIndex(diagnosticReportsStore, 'route',     'route',     { unique: false });
  ensureIndex(diagnosticReportsStore, 'sessionId', 'sessionId', { unique: false });
  ensureIndex(diagnosticReportsStore, 'status',    'status',    { unique: false });


  const diagnosticOutboxStore = ensureStore(db, event, 'diagnostic-outbox', { keyPath: 'outboxId' });
  ensureIndex(diagnosticOutboxStore, 'queuedAt', 'queuedAt', { unique: false });
  ensureIndex(diagnosticOutboxStore, 'reportId', 'reportId', { unique: false });
  ensureIndex(diagnosticOutboxStore, 'status',   'status',   { unique: false });

  // v21: derived diagnostics aggregate store. Values contain safe rollup keys,
  // counts, and timestamps only; raw event messages/metadata stay in events.
  const diagnosticAggregatesStore = ensureStore(db, event, 'diagnostic-aggregates', { keyPath: 'aggregateId' });
  ensureIndex(diagnosticAggregatesStore, 'kind', 'kind', { unique: false });
  ensureIndex(diagnosticAggregatesStore, 'lastSeen', 'lastSeen', { unique: false });


  const diagnosticReportDraftsStore = ensureStore(db, event, 'diagnostic-report-drafts', { keyPath: 'draftId' });
  ensureIndex(diagnosticReportDraftsStore, 'issueId', 'issueId', { unique: false });
  ensureIndex(diagnosticReportDraftsStore, 'status', 'status', { unique: false });
  ensureIndex(diagnosticReportDraftsStore, 'updatedAt', 'updatedAt', { unique: false });
  ensureIndex(diagnosticReportDraftsStore, 'routeAtTrigger', 'routeAtTrigger', { unique: false });



  const repertoireSourcesStore = ensureStore(db, event, 'repertoire-sources', { keyPath: 'id' });
  ensureIndex(repertoireSourcesStore, 'contentVersion', 'contentVersion', { unique: false });
  ensureIndex(repertoireSourcesStore, 'side', 'side', { unique: false });
  ensureIndex(repertoireSourcesStore, 'enabled', 'enabled', { unique: false });
  ensureIndex(repertoireSourcesStore, 'updatedAt', 'updatedAt', { unique: false });

  const repertoireMatchRecordsStore = ensureStore(db, event, 'repertoire-match-records', { keyPath: 'key' });
  ensureIndex(repertoireMatchRecordsStore, 'sourceId', 'sourceId', { unique: false });
  ensureIndex(repertoireMatchRecordsStore, 'sourceVersion', 'sourceVersion', { unique: false });
  ensureIndex(repertoireMatchRecordsStore, 'gameId', 'gameId', { unique: false });
  ensureIndex(repertoireMatchRecordsStore, 'status', 'status', { unique: false });
  ensureIndex(repertoireMatchRecordsStore, 'accountId', 'accountId', { unique: false });
  ensureIndex(repertoireMatchRecordsStore, 'timeClass', 'timeClass', { unique: false });
  ensureIndex(repertoireMatchRecordsStore, 'scannedAt', 'scannedAt', { unique: false });

  const repertoireScanRunsStore = ensureStore(db, event, 'repertoire-scan-runs', { keyPath: 'runId' });
  ensureIndex(repertoireScanRunsStore, 'lifecycleState', 'lifecycleState', { unique: false });
  ensureIndex(repertoireScanRunsStore, 'updatedAt', 'updatedAt', { unique: false });




  ensureStore(db, event, 'player-profiles', { keyPath: 'key' });





  ensureStore(db, event, 'user-tree', { keyPath: 'gameId' });
}

function openGameDb(): Promise<IDBDatabase> {
  if (_idb) return Promise.resolve(_idb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = (e.target as IDBOpenDBRequest).result;
      const upgradeStart = Date.now();
      const oldVersion = e.oldVersion;
      const newVersion = e.newVersion ?? DB_VERSION;
      upgradeGameDbSchema(db, e);
      // Emit upgrade duration after the synchronous schema mutations complete.
      // oldVersion/newVersion contain no PII — they are integer schema version numbers.
      const tx = (e.target as IDBOpenDBRequest).transaction;
      if (tx) {
        tx.oncomplete = () => {
          record({
            kind: 'idb',
            severity: Severity.Info,
            sourceTag: 'idb',
            message: 'IDB schema upgraded',
            metadata: {
              oldVersion,
              newVersion,
              durationMs: Date.now() - upgradeStart,
            },
            redactionClass: 'safe',
          });
        };
      }
    };
    req.onsuccess = () => {
      _idb = req.result;
      // Log the DB version on every successful open — no PII, integer version only.
      record({
        kind: 'idb',
        severity: Severity.Info,
        sourceTag: 'idb',
        message: 'IDB opened',
        metadata: { version: _idb.version },
        redactionClass: 'safe',
      });
      // Attach versionchange handler: fires when another tab requests a DB upgrade.
      // This tab holds an open connection that blocks the upgrade until we close.
      // No PII — integer version numbers only.
      _idb.onversionchange = (e: IDBVersionChangeEvent) => {
        record({
          kind: 'idb',
          severity: Severity.Warn,
          sourceTag: 'idb',
          message: 'IDB versionchange: another tab is requesting a schema upgrade; this tab should reload',
          metadata: {
            currentVersion: e.oldVersion,
            requestedVersion: e.newVersion,
          },
          redactionClass: 'safe',
        });
      };
      resolve(_idb);
    };
    // onblocked fires when this open() call cannot proceed because another tab
    // holds a connection to an older schema version. No PII — version numbers only.
    req.onblocked = (e: IDBVersionChangeEvent) => {
      record({
        kind: 'idb',
        severity: Severity.Warn,
        sourceTag: 'idb',
        message: 'IDB open blocked: another tab holds an older schema version',
        metadata: {
          oldVersion: e.oldVersion,
          newVersion: e.newVersion,
        },
        redactionClass: 'safe',
      });
    };
    req.onerror   = () => reject(req.error);
  });
}

// --- Diagnostics ---

export type DiagnosticReportStatus = 'pending' | 'submitted' | 'failed';
export type DiagnosticReportTriageState = 'new' | 'investigating' | 'reproduced' | 'fixed' | 'invalid' | 'archived';

export interface DiagnosticReport extends AssembledDiagnosticReport {
  timestamp: number;
  severity:  AssembledDiagnosticReport['userInput']['severity'];
  route:     string;
  status:    DiagnosticReportStatus;
  triageState?: DiagnosticReportTriageState;
  adminNotes: string;
}

export interface DiagnosticOutboxEntry {
  outboxId:      string;
  reportId:      string;
  queuedAt:      number;
  timestamp:     number;
  updatedAt:     number;
  status:        'pending' | 'failed' | 'sent' | 'abandoned';
  attemptCount:  number;
  payload:       string;
}

export type DiagnosticReportDraft = ReportIssueDraft;
export type DiagnosticReportDraftStatus = ReportIssueDraftStatus;

export async function putDiagnosticEvent(event: DiagnosticEvent): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-events', 'readwrite');
  tx.objectStore('diagnostic-events').put(event);
  await txDone(tx);
}


















export async function getDiagnosticEvents(options: { limit?: number; kind?: string } = {}): Promise<DiagnosticEvent[]> {
  const limit = options.limit ?? 100;
  if (limit <= 0) return [];

  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: DiagnosticEvent[] | undefined;

    const settleResolve = (result: DiagnosticEvent[]): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('diagnostic-events', 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult);
      } else {
        settleReject(new Error(
          'Diagnostic-events cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordTxFailure(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Diagnostic-events read transaction failed'));
    };
    tx.onabort = () => {
      recordTxFailure(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Diagnostic-events read transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore('diagnostic-events').index('timestamp').openCursor();
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const events: DiagnosticEvent[] = [];

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = events;
        return;
      }

      const event = cursor.value as DiagnosticEvent;
      if (options.kind === undefined || event.kind === options.kind) {
        events.push(event);
        if (events.length >= limit) {
          // Limit reached: stop driving the cursor and let the transaction auto-commit; only
          // tx.oncomplete resolves. Do NOT continue().
          completedResult = events;
          return;
        }
      }

      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(recordReqFailure(cursorRequest, 'diagnostic-events', 'cursor'));
    };
  });
}

export async function putDiagnosticSession(session: DiagnosticSession): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-sessions', 'readwrite');
  tx.objectStore('diagnostic-sessions').put(session);
  await txDone(tx);
}

export async function getDiagnosticSession(sessionId: string): Promise<DiagnosticSession | undefined> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('diagnostic-sessions', 'readonly')
      .objectStore('diagnostic-sessions')
      .get(sessionId);
    req.onsuccess = () => resolve(req.result as DiagnosticSession | undefined);
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-sessions', 'read', sessionId));
  });
}








export async function getRecentDiagnosticSessions(limit: number): Promise<DiagnosticSession[]> {
  if (limit <= 0) return [];

  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: DiagnosticSession[] | undefined;

    const settleResolve = (result: DiagnosticSession[]): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('diagnostic-sessions', 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult);
      } else {
        settleReject(new Error(
          'Diagnostic-sessions cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordTxFailure(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Diagnostic-sessions read transaction failed'));
    };
    tx.onabort = () => {
      recordTxFailure(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Diagnostic-sessions read transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore('diagnostic-sessions').index('startedAt').openCursor(null, 'prev');
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const sessions: DiagnosticSession[] = [];

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        completedResult = sessions;
        return;
      }

      sessions.push(cursor.value as DiagnosticSession);
      if (sessions.length >= limit) {
        completedResult = sessions;
        return;
      }

      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(recordReqFailure(cursorRequest, 'diagnostic-sessions', 'cursor'));
    };
  });
}

export async function putDiagnosticReport(report: DiagnosticReport): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-reports', 'readwrite');
  tx.objectStore('diagnostic-reports').put(report);
  await txDone(tx);
}

export async function getDiagnosticReport(reportId: string): Promise<DiagnosticReport | undefined> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('diagnostic-reports', 'readonly')
      .objectStore('diagnostic-reports')
      .get(reportId);
    req.onsuccess = () => resolve(req.result as DiagnosticReport | undefined);
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-reports', 'read', reportId));
  });
}

export async function getAllDiagnosticReports(): Promise<DiagnosticReport[]> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('diagnostic-reports', 'readonly')
      .objectStore('diagnostic-reports')
      .index('timestamp')
      .getAll();
    req.onsuccess = () => {
      const reports = ((req.result as DiagnosticReport[] | undefined) ?? [])
        .sort((a, b) => b.timestamp - a.timestamp);
      resolve(reports);
    };
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-reports', 'read'));
  });
}

export async function deleteDiagnosticReport(reportId: string): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-reports', 'readwrite');
  tx.objectStore('diagnostic-reports').delete(reportId);
  await txDone(tx, 'delete');
}

export async function putDiagnosticOutboxEntry(entry: DiagnosticOutboxEntry): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-outbox', 'readwrite');
  tx.objectStore('diagnostic-outbox').put(entry);
  await txDone(tx);
}

export async function getPendingOutboxEntries(): Promise<DiagnosticOutboxEntry[]> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('diagnostic-outbox', 'readonly')
      .objectStore('diagnostic-outbox')
      .index('status')
      .getAll('pending');
    req.onsuccess = () => resolve((req.result as DiagnosticOutboxEntry[] | undefined) ?? []);
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-outbox', 'read'));
  });
}

export async function deleteDiagnosticOutboxEntry(outboxId: string): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-outbox', 'readwrite');
  tx.objectStore('diagnostic-outbox').delete(outboxId);
  await txDone(tx);
}

export async function putDiagnosticReportDraft(draft: DiagnosticReportDraft): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-report-drafts', 'readwrite');
  tx.objectStore('diagnostic-report-drafts').put(draft);
  await txDone(tx);
}

export async function getDiagnosticReportDraft(draftId: string): Promise<DiagnosticReportDraft | undefined> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('diagnostic-report-drafts', 'readonly')
      .objectStore('diagnostic-report-drafts')
      .get(draftId);
    req.onsuccess = () => resolve(req.result as DiagnosticReportDraft | undefined);
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-report-drafts', 'read', draftId));
  });
}

export async function getActiveDiagnosticReportDraft(): Promise<DiagnosticReportDraft | undefined> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('diagnostic-report-drafts', 'readonly')
      .objectStore('diagnostic-report-drafts')
      .index('status')
      .getAll('active');
    req.onsuccess = () => {
      const drafts = ((req.result as DiagnosticReportDraft[] | undefined) ?? [])
        .sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(drafts[0]);
    };
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-report-drafts', 'read'));
  });
}

export async function updateDiagnosticReportDraftStatus(
  draftId: string,
  status: DiagnosticReportDraftStatus,
): Promise<DiagnosticReportDraft | undefined> {
  const existing = await getDiagnosticReportDraft(draftId);
  if (!existing) return undefined;
  const updated: DiagnosticReportDraft = {
    ...existing,
    status,
    updatedAt: Date.now(),
  };
  await putDiagnosticReportDraft(updated);
  return updated;
}

export async function deleteDiagnosticReportDraft(draftId: string): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-report-drafts', 'readwrite');
  tx.objectStore('diagnostic-report-drafts').delete(draftId);
  await txDone(tx, 'delete');
}



export async function putPlayerProfile(profile: PlayerProfileRecord): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('player-profiles', 'readwrite');
  tx.objectStore('player-profiles').put(profile);
  await txDone(tx);
}

export async function getPlayerProfile(key: string): Promise<PlayerProfileRecord | undefined> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('player-profiles', 'readonly')
      .objectStore('player-profiles')
      .get(key);
    req.onsuccess = () => resolve(req.result as PlayerProfileRecord | undefined);
    req.onerror = () => reject(recordReqFailure(req, 'player-profiles', 'read', key));
  });
}

export async function replaceDiagnosticAggregates(
  kind: DiagnosticAggregateKind,
  aggregates: DiagnosticAggregate[],
): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('diagnostic-aggregates', 'readwrite');
  const store = tx.objectStore('diagnostic-aggregates');
  const req = store.index('kind').openCursor(kind);

  await new Promise<void>((resolve, reject) => {
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        for (const aggregate of aggregates) store.put(aggregate);
        resolve();
        return;
      }

      cursor.delete();
      cursor.continue();
    };
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-aggregates', 'cursor'));
  });

  await txDone(tx);
}








export async function getDiagnosticAggregates(kind?: DiagnosticAggregateKind): Promise<DiagnosticAggregate[]> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: DiagnosticAggregate[] | undefined;

    const settleResolve = (result: DiagnosticAggregate[]): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('diagnostic-aggregates', 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult);
      } else {
        settleReject(new Error(
          'Diagnostic-aggregates cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordTxFailure(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Diagnostic-aggregates read transaction failed'));
    };
    tx.onabort = () => {
      recordTxFailure(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Diagnostic-aggregates read transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      const store = tx.objectStore('diagnostic-aggregates');
      cursorRequest = kind
        ? store.index('kind').openCursor(kind)
        : store.openCursor();
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const aggregates: DiagnosticAggregate[] = [];

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        completedResult = aggregates;
        return;
      }

      aggregates.push(cursor.value as DiagnosticAggregate);
      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(recordReqFailure(cursorRequest, 'diagnostic-aggregates', 'cursor'));
    };
  });
}

// --- Game library ---

/** Convert an ImportedGame (optional fields) to a StoredGameRecord (nullable fields). */
export function importedGameToRecord(game: ImportedGame): StoredGameRecord {
  return {
    id:               game.id,
    pgn:              game.pgn,
    white:            game.white            ?? null,
    black:            game.black            ?? null,
    result:           game.result           ?? null,
    date:             game.date             ?? null,
    timeClass:        game.timeClass        ?? null,
    opening:          game.opening          ?? null,
    eco:              game.eco              ?? null,
    source:           game.source           ?? null,
    whiteRating:      game.whiteRating      ?? null,
    blackRating:      game.blackRating      ?? null,
    importedUsername: game.importedUsername ?? null,
    accountId:        game.accountId        ?? null,
    importedAt:       game.importedAt       ?? Date.now(),
    updatedAt:        Date.now(),

    platformAccuracies: game.platformAccuracies ?? null,
    whiteResultCode:    game.whiteResultCode    ?? null,
    blackResultCode:    game.blackResultCode    ?? null,
    termination:        game.termination        ?? null,
    uuid:               game.uuid               ?? null,
    finalFen:           game.finalFen           ?? null,
    openingUrl:         game.openingUrl         ?? null,
    variant:            game.variant            ?? null,
    timeControl:        game.timeControl        ?? null,
    rated:              game.rated              ?? null,
    startTime:          game.startTime          ?? null,
    endTime:            game.endTime            ?? null,
    tournamentUrl:      game.tournamentUrl      ?? null,
    matchUrl:           game.matchUrl           ?? null,
    ratingDelta:        game.ratingDelta        ?? null,
    opponentRatingDelta: game.opponentRatingDelta ?? null,

    sourcePgn:          game.sourcePgn          ?? null,
  };
}

/**
 * Save a batch of games to IDB.
 * Writes each game as an individual record to the `games` store (new path)
 * and also writes the full array to `game-library` (legacy path, backward compat).
 * Both writes share a single transaction per store.
 */
export async function saveGamesToIdb(games: ImportedGame[]): Promise<void> {
  try {
    const db = await openGameDb();
    const records = games.map(importedGameToRecord);
    // Write individual records to the new per-game store.
    const gamesTx = db.transaction('games', 'readwrite');
    const gamesStore = gamesTx.objectStore('games');
    for (const record of records) gamesStore.put(record);
    await txDone(gamesTx);

    // Also write legacy array record for backward compatibility during transition.
    const legacyTx = db.transaction('game-library', 'readwrite');
    legacyTx.objectStore('game-library').put(
      { games } satisfies StoredGameLibrary,
      'imported-games',
    );
    await txDone(legacyTx);

    enqueueMainDbPutBatch(records.map(record => ({
      store: 'games' as const,
      itemKey: record.id,
      payload: record,
      updatedAt: record.updatedAt,
      operation: 'upsert' as const,
    })));
    void captureStorageEstimate('post-idb-write');
  } catch (e) {
    console.warn('[idb] save failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveGamesToIdb on games,game-library',
      metadata: {
        storeName: 'games,game-library',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}











export async function saveGameToIdb(game: ImportedGame): Promise<boolean> {
  try {
    const db = await openGameDb();
    const record = importedGameToRecord(game);
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(record);
    await txDone(tx);
    enqueueMainDbPut('games', record.id, record, record.updatedAt);
    void captureStorageEstimate('post-idb-write');
    return true;
  } catch (e) {
    console.warn('[idb] single-game save failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveGameToIdb on games',
      metadata: {
        storeName: 'games',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
    return false;
  }
}

















export type GamesDeltaSyncItem = RemoteSyncItem & {
  conflictIntent?: 'recreate-over-tombstone';
};

export interface SaveGamesDeltaOptions {








  recreateOverTombstoneIds?: ReadonlySet<string>;
}

export interface GamesDeltaResult {
  /** The changed records, in first-appearance input order — exactly the rows put to `games`. */
  changed: StoredGameRecord[];
  /** One upsert sync item per changed record (distinct itemKeys), recreate-intent stamped per option. */
  syncItems: GamesDeltaSyncItem[];
}

/** How each StoredGameRecord key participates in delta detection (fix round 2, Sol REQUIRED-1):
 *  - `content`          — participates in the delta signature; incoming value is authoritative
 *                         (replace semantics: an omitted optional becomes a null overwrite).
 *  - `write-once`       — participates in the signature, but buildDeltaCandidate preserves the
 *                         prior stored value on updates (`importedAt` always; `sourcePgn` when the
 *                         prior is non-null), so it can neither spuriously flip a stable row nor be
 *                         rewritten/nulled by a partial incoming game.
 *  - `volatile`         — EXCLUDED from the signature: a write stamp, not content, so re-persisting
 *                         an unchanged game never registers as a change (`updatedAt` only). */
type GameDeltaKeyRole = 'content' | 'write-once' | 'volatile';

// COMPILE-TIME EXHAUSTIVENESS: `satisfies Record<keyof StoredGameRecord, ...>` forces every key of
// StoredGameRecord — present and future — to be classified here. Adding a field to the record type
// breaks `tsc` at this literal until the new key is given an explicit role, so a future field can
// never silently bypass the content signature. The delta harness additionally pins the emitted key
// set at runtime as the test-side alarm.
const GAME_DELTA_KEY_ROLES = {
  id:                  'content',
  pgn:                 'content',
  white:               'content',
  black:               'content',
  result:              'content',
  date:                'content',
  timeClass:           'content',
  opening:             'content',
  eco:                 'content',
  source:              'content',
  whiteRating:         'content',
  blackRating:         'content',
  importedUsername:    'content',
  accountId:           'content',
  importedAt:          'write-once',
  updatedAt:           'volatile',
  platformAccuracies:  'content',
  whiteResultCode:     'content',
  blackResultCode:     'content',
  termination:         'content',
  uuid:                'content',
  finalFen:            'content',
  openingUrl:          'content',
  variant:             'content',
  timeControl:         'content',
  rated:               'content',
  startTime:           'content',
  endTime:             'content',
  tournamentUrl:       'content',
  matchUrl:            'content',
  ratingDelta:         'content',
  opponentRatingDelta: 'content',
  sourcePgn:           'write-once',
} as const satisfies Record<keyof StoredGameRecord, GameDeltaKeyRole>;

// Every non-volatile key participates in the signature (write-once keys are already normalized to
// the prior row's value by buildDeltaCandidate before the signature comparison runs).
const GAME_DELTA_CONTENT_KEYS: readonly (keyof StoredGameRecord)[] =
  (Object.keys(GAME_DELTA_KEY_ROLES) as (keyof StoredGameRecord)[])
    .filter(key => GAME_DELTA_KEY_ROLES[key] !== 'volatile');

/** Canonical content signature (excludes `updatedAt`; treats absent optional === null) so two
 *  records are "content-equal" iff every game field except the write stamp matches. */
function gameRecordContentSignature(record: StoredGameRecord): string {
  const canonical: Record<string, unknown> = {};
  for (const key of GAME_DELTA_CONTENT_KEYS) {
    const value = record[key];
    canonical[key] = value === undefined ? null : value;
  }
  return JSON.stringify(canonical);
}











function buildDeltaCandidate(game: ImportedGame, prior: StoredGameRecord | undefined): StoredGameRecord {
  const record = importedGameToRecord(game);
  if (prior) {
    record.importedAt = prior.importedAt;
    if (prior.sourcePgn !== null && prior.sourcePgn !== undefined) record.sourcePgn = prior.sourcePgn;
  }
  return record;
}

/**
 * Pure delta computation (no IDB) — testable in isolation. De-dupes the input by id (last write
 * wins, first-appearance order preserved), then emits exactly the rows whose content differs from
 * the corresponding stored record (or that have no stored record). Each changed record yields one
 * upsert sync item; recreate-over-tombstone intent is stamped only for ids in
 * `recreateOverTombstoneIds`.
 */
export function computeGamesDelta(
  games: readonly ImportedGame[],
  existingById: ReadonlyMap<string, StoredGameRecord>,
  recreateOverTombstoneIds?: ReadonlySet<string>,
): GamesDeltaResult {
  const order: string[] = [];
  const gameById = new Map<string, ImportedGame>();
  for (const game of games) {
    if (!gameById.has(game.id)) order.push(game.id);
    gameById.set(game.id, game); // last occurrence wins
  }

  const changed: StoredGameRecord[] = [];
  for (const id of order) {
    const game = gameById.get(id)!;
    const prior = existingById.get(id);
    const candidate = buildDeltaCandidate(game, prior);
    if (prior && gameRecordContentSignature(prior) === gameRecordContentSignature(candidate)) continue;
    changed.push(candidate);
  }

  const syncItems: GamesDeltaSyncItem[] = changed.map(record => {
    const item: GamesDeltaSyncItem = {
      store: 'games',
      itemKey: record.id,
      payload: record,
      updatedAt: record.updatedAt,
      operation: 'upsert',
    };
    if (recreateOverTombstoneIds?.has(record.id)) item.conflictIntent = 'recreate-over-tombstone';
    return item;
  });

  return { changed, syncItems };
}

// Keyed games reads are TRANSACTION-BOUNDED (fix round 1, Sol IMPORTANT-2; design R1 "bounded"
// primitives): at most this many keyed requests ride one readonly transaction. Larger id sets run
// one short transaction per chunk and merge — a 30k-id probe never pins a single transaction with
// an unbounded request flood.
const GAMES_KEYED_READ_TX_LIMIT = 1000;

function chunkGameIds(ids: readonly string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
  return chunks;
}

/** Read one CHUNK of game records by id in a single short readonly transaction — only the
 *  requested ids, never a full-store scan. Rejects on storage failure (honest-rejection contract,
 *  BUG-2026-07-10-007); a missing id is simply absent from the result, not an error. */
function readGameRecordsChunk(db: IDBDatabase, ids: readonly string[], into: Map<string, StoredGameRecord>): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('games', 'readonly');
    const store = tx.objectStore('games');
    let settled = false;
    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err ?? new DOMException('games read failed', 'UnknownError'));
    };
    for (const id of ids) {
      const req = store.get(id);
      req.onsuccess = () => {
        const record = req.result as StoredGameRecord | undefined;
        if (record) into.set(id, record);
      };
      req.onerror = () => fail(recordReqFailure(req, 'games', 'read', id));
    }
    tx.oncomplete = () => { if (!settled) { settled = true; resolve(); } };
    tx.onabort = () => fail(tx.error);
    tx.onerror = () => fail(tx.error);
  });
}

/** Read specific game records by id: deduplicated, then chunked at GAMES_KEYED_READ_TX_LIMIT ids
 *  per short readonly transaction, results merged. Rejects on the first failed chunk. */
async function readGameRecordsByIds(db: IDBDatabase, ids: readonly string[]): Promise<Map<string, StoredGameRecord>> {
  const result = new Map<string, StoredGameRecord>();
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return result;
  for (const chunk of chunkGameIds(distinct, GAMES_KEYED_READ_TX_LIMIT)) {
    await readGameRecordsChunk(db, chunk, result);
  }
  return result;
}

/**
 * Bounded read: fetch specific game records by id (first-occurrence input order preserved,
 * duplicate ids deduplicated, missing ids skipped). Only the requested ids are read — never a
 * full-store `getAll()` — in transaction-bounded chunks (GAMES_KEYED_READ_TX_LIMIT). Rejects on
 * storage failure.
 */
export async function getGamesByIds(ids: readonly string[]): Promise<StoredGameRecord[]> {
  const db = await openGameDb();
  const map = await readGameRecordsByIds(db, ids);
  const out: StoredGameRecord[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const record = map.get(id);
    if (record) out.push(record);
  }
  return out;
}

/**
 * Bounded read: which of the SUPPLIED game ids already exist in the `games` store, via keys-only
 * `getKey(id)` probes — never `getAll()`/`getAllKeys()`, so the cost is O(supplied ids), not
 * O(library) (fix round 1, Sol IMPORTANT-1; CR-2/AP-2 — no record values are deserialized and the
 * whole library's key set is never materialized). Input ids are deduplicated and probed in
 * transaction-bounded chunks (GAMES_KEYED_READ_TX_LIMIT). Returns the subset of supplied ids that
 * exist. Rejects on storage failure.
 */
export async function getExistingGameKeys(ids: readonly string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  const distinct = [...new Set(ids)];
  if (distinct.length === 0) return existing;
  const db = await openGameDb();
  for (const chunk of chunkGameIds(distinct, GAMES_KEYED_READ_TX_LIMIT)) {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('games', 'readonly');
      const store = tx.objectStore('games');
      let settled = false;
      const fail = (err: unknown) => {
        if (settled) return;
        settled = true;
        reject(err ?? new DOMException('games key probe failed', 'UnknownError'));
      };
      for (const id of chunk) {
        const req = store.getKey(id);
        req.onsuccess = () => { if (req.result !== undefined) existing.add(id); };
        req.onerror = () => fail(recordReqFailure(req, 'games', 'read', id));
      }
      tx.oncomplete = () => { if (!settled) { settled = true; resolve(); } };
      tx.onabort = () => fail(tx.error);
      tx.onerror = () => fail(tx.error);
    });
  }
  return existing;
}

/** Bounded read: number of stored game records via the index-backed `count()` (no record reads). */
export async function countGamesInIdb(): Promise<number> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('games', 'readonly').objectStore('games').count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(recordReqFailure(req, 'games', 'read'));
  });
}









export async function saveGamesDeltaToIdb(
  games: readonly ImportedGame[],
  options: SaveGamesDeltaOptions = {},
): Promise<void> {
  if (games.length === 0) return;
  const db = await openGameDb();
  const ids = [...new Set(games.map(game => game.id))];
  const existingById = await readGameRecordsByIds(db, ids);
  const { changed, syncItems } = computeGamesDelta(games, existingById, options.recreateOverTombstoneIds);
  if (changed.length === 0) return; // duplicate delta: zero writes, zero enqueues

  const tx = db.transaction('games', 'readwrite');
  const store = tx.objectStore('games');
  for (const record of changed) store.put(record);
  await txDone(tx, 'write'); // REJECTS on transaction failure — before the enqueue below

  enqueueMainDbPutBatch(syncItems);
  void captureStorageEstimate('post-idb-write');
}

export async function saveNavStateToIdb(selectedId: string | null, path: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('game-library', 'readwrite');
    tx.objectStore('game-library').put(
      { selectedId, path } satisfies StoredGameNavState,
      'imported-nav',
    );
    await txDone(tx);
  } catch (e) {
    console.warn('[idb] nav-state save failed', e);




    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveNavStateToIdb on game-library',
      metadata: {
        storeName: 'game-library',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

/** Convert a stored per-game record back to the ImportedGame shape used at runtime. */
export function storedGameRecordToImportedGame(record: StoredGameRecord): ImportedGame {
  const game: ImportedGame = { id: record.id, pgn: record.pgn };
  if (record.white            !== null) game.white            = record.white;
  if (record.black            !== null) game.black            = record.black;
  if (record.result           !== null) game.result           = record.result;
  if (record.date             !== null) game.date             = record.date;
  if (record.timeClass        !== null) game.timeClass        = record.timeClass;
  if (record.opening          !== null) game.opening          = record.opening;
  if (record.eco              !== null) game.eco              = record.eco;
  if (record.source === 'chesscom' || record.source === 'lichess') game.source = record.source;
  if (record.whiteRating      !== null) game.whiteRating      = record.whiteRating;
  if (record.blackRating      !== null) game.blackRating      = record.blackRating;
  if (record.importedUsername !== null) game.importedUsername = record.importedUsername;
  if (record.accountId        !== null && record.accountId !== undefined) game.accountId = record.accountId;
  game.importedAt = record.importedAt;


  if (record.platformAccuracies !== null && record.platformAccuracies !== undefined) {
    game.platformAccuracies = record.platformAccuracies;
  }
  if (record.whiteResultCode !== null && record.whiteResultCode !== undefined) game.whiteResultCode = record.whiteResultCode;
  if (record.blackResultCode !== null && record.blackResultCode !== undefined) game.blackResultCode = record.blackResultCode;
  if (record.termination     !== null && record.termination     !== undefined) game.termination     = record.termination;
  if (record.uuid            !== null && record.uuid            !== undefined) game.uuid            = record.uuid;
  if (record.finalFen        !== null && record.finalFen        !== undefined) game.finalFen        = record.finalFen;
  if (record.openingUrl      !== null && record.openingUrl      !== undefined) game.openingUrl      = record.openingUrl;
  if (record.variant         !== null && record.variant         !== undefined) game.variant         = record.variant;
  if (record.timeControl     !== null && record.timeControl     !== undefined) game.timeControl     = record.timeControl;
  if (record.rated           !== null && record.rated           !== undefined) game.rated           = record.rated;
  if (record.startTime       !== null && record.startTime       !== undefined) game.startTime       = record.startTime;
  if (record.endTime         !== null && record.endTime         !== undefined) game.endTime         = record.endTime;
  if (record.tournamentUrl   !== null && record.tournamentUrl   !== undefined) game.tournamentUrl   = record.tournamentUrl;
  if (record.matchUrl        !== null && record.matchUrl        !== undefined) game.matchUrl        = record.matchUrl;
  if (record.ratingDelta     !== null && record.ratingDelta     !== undefined) game.ratingDelta     = record.ratingDelta;
  if (record.opponentRatingDelta !== null && record.opponentRatingDelta !== undefined) game.opponentRatingDelta = record.opponentRatingDelta;


  if (record.sourcePgn !== null && record.sourcePgn !== undefined) game.sourcePgn = record.sourcePgn;






  if (record.pgn.includes('[PatzerStudied')) {
    const questionnaire = parseQuestionnaireFromPgn(record.pgn);
    if (questionnaire) game.questionnaire = questionnaire;
  }

  return game;
}

/**
 * Load all games from the per-game `games` store.
 * Returns the games array and nav state, or undefined if the store is empty.
 * Falls back to the legacy `game-library` path if the new store has no records.
 *
 * Storage failures (DB-open failure, aborted/failed read) REJECT — callers MUST distinguish a
 * genuine failure from a legitimately empty store, which still resolves `undefined` via
 * `onsuccess`. Mirrors `getAccountFromIdb`'s propagate-don't-mask contract (BUG-2026-07-10-007):
 * an earlier outer catch collapsed every failure to `undefined`, silently rendering the games
 * list as if the user had no games.
 *
 * Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts getMany() pattern.
 */
export async function loadGamesFromIdb(): Promise<StoredGames | undefined> {
  const db = await openGameDb();


  const gamesFromNewStore = await new Promise<StoredGameRecord[]>((resolve, reject) => {
    const req = db.transaction('games', 'readonly').objectStore('games').getAll();
    req.onsuccess = () => resolve((req.result as StoredGameRecord[] | undefined) ?? []);
    req.onerror   = () => reject(recordReqFailure(req, 'games', 'read'));
  });

  if (gamesFromNewStore.length > 0) {
    // Read nav state from game-library (selectedId / path are stored there).
    const navRecord = await new Promise<StoredGameNavState | undefined>((resolve, reject) => {
      const req = db.transaction('game-library', 'readonly')
        .objectStore('game-library').get('imported-nav');
      req.onsuccess = () => resolve(req.result as StoredGameNavState | undefined);
      req.onerror   = () => reject(recordReqFailure(req, 'game-library', 'read', 'imported-nav'));
    });
    const games = gamesFromNewStore.map(storedGameRecordToImportedGame);
    return {
      games,
      selectedId: navRecord?.selectedId ?? null,
      ...(navRecord?.path !== undefined ? { path: navRecord.path } : {}),
    };
  }

  // Legacy fallback: read from game-library single-record store.
  return new Promise((resolve, reject) => {
    const tx = db.transaction('game-library', 'readonly');
    const store = tx.objectStore('game-library');
    const gamesReq = store.get('imported-games');
    const navReq = store.get('imported-nav');
    let gamesDone = false;
    let navDone = false;
    let libraryRecord: StoredGameLibrary | StoredGames | undefined;
    let navRecord: StoredGameNavState | undefined;

    const maybeResolve = () => {
      if (!gamesDone || !navDone) return;
      if (!libraryRecord && !navRecord) {
        resolve(undefined);
        return;
      }
      const games = libraryRecord?.games ?? [];
      const selectedId = navRecord?.selectedId
        ?? (libraryRecord && 'selectedId' in libraryRecord ? libraryRecord.selectedId : null);
      const path = navRecord?.path
        ?? (libraryRecord && 'path' in libraryRecord ? libraryRecord.path : undefined);
      resolve({
        games,
        selectedId,
        ...(path !== undefined ? { path } : {}),
      });
    };

    gamesReq.onsuccess = () => {
      libraryRecord = gamesReq.result as StoredGameLibrary | StoredGames | undefined;
      gamesDone = true;
      maybeResolve();
    };
    navReq.onsuccess = () => {
      navRecord = navReq.result as StoredGameNavState | undefined;
      navDone = true;
      maybeResolve();
    };
    gamesReq.onerror = () => reject(recordReqFailure(gamesReq, 'game-library', 'read', 'imported-games'));
    navReq.onerror = () => reject(recordReqFailure(navReq, 'game-library', 'read', 'imported-nav'));
  });
}

/**
 * Load all games belonging to one registry account, via the `accountId` index
 * (no full-store scan). Used by the Opponents page shared-store read path.
 *
 * Storage failures (DB-open failure, aborted/failed read) REJECT — callers MUST distinguish a
 * genuine failure from an account that legitimately has no games, which still resolves `[]` via
 * `onsuccess`. Mirrors `loadGamesFromIdb` / `getAccountFromIdb`'s propagate-don't-mask contract
 * (BUG-2026-07-10-007 slice 2): an earlier outer catch collapsed every failure to `[]`, silently
 * rendering the account's Opponents surface as if it had no games.
 */
export async function loadGamesByAccountFromIdb(accountId: string): Promise<StoredGameRecord[]> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('games', 'readonly')
      .objectStore('games').index('accountId').getAll(accountId);
    req.onsuccess = () => resolve((req.result as StoredGameRecord[] | undefined) ?? []);
    req.onerror   = () => reject(recordReqFailure(req, 'games', 'read'));
  });
}
















export async function reduceGamesByAccountFromIdb<T>(
  accountId: string,
  reduce: (accumulator: T, record: StoredGameRecord) => T,
  initial: T,
): Promise<T> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    let settled = false;
    // Wrapped so a legitimately-undefined T still counts as an explicitly-settled result.
    let completedResult: { value: T } | undefined;

    const settleResolve = (value: T): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('games', 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult.value);
      } else {
        settleReject(new Error(
          'Games account-reduce cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordTxFailure(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Games account-reduce read transaction failed'));
    };
    tx.onabort = () => {
      recordTxFailure(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Games account-reduce read transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore('games').index('accountId').openCursor(IDBKeyRange.only(accountId));
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    let accumulator = initial;

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = { value: accumulator };
        return;
      }
      try {
        accumulator = reduce(accumulator, cursor.value as StoredGameRecord);
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(recordReqFailure(cursorRequest, 'games', 'cursor'));
    };
  });
}

/**
 * Load the PGN for a single game by id from the per-game `games` store.
 * Returns undefined if the record does not exist (e.g. pre-migration session).
 */
export async function loadGamePgn(gameId: string): Promise<string | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('games', 'readonly').objectStore('games').get(gameId);
      req.onsuccess = () => {
        const record = req.result as StoredGameRecord | undefined;
        resolve(record?.pgn);
      };
      req.onerror = () => reject(recordReqFailure(req, 'games', 'read', gameId));
    });
  } catch (e) {
    console.warn('[idb] loadGamePgn failed', e);
    return undefined;
  }
}








export async function loadGameFacetSourceFromIdb(gameId: string): Promise<
  Pick<StoredGameRecord, 'white' | 'black' | 'result' | 'opening' | 'importedUsername'> | undefined
> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('games', 'readonly').objectStore('games').get(gameId);
      req.onsuccess = () => {
        const record = req.result as StoredGameRecord | undefined;
        resolve(record ? {
          white: record.white,
          black: record.black,
          result: record.result,
          opening: record.opening,
          importedUsername: record.importedUsername,
        } : undefined);
      };
      req.onerror = () => reject(recordReqFailure(req, 'games', 'read', gameId));
    });
  } catch (e) {
    console.warn('[idb] loadGameFacetSourceFromIdb failed', e);
    return undefined;
  }
}

// --- Chess account registry ---
// Store plumbing only. The public API for account records is src/accounts;
// other modules must import from there rather than calling these helpers.

/**
 * Persist an account record. Unlike the warn-and-continue game helpers, save
 * errors propagate: import flows must not silently proceed believing an
 * account was registered when the write failed.
 */
function accountSyncUpdatedAt(account: ChessAccount): number {
  return Math.max(
    typeof account.profileUpdatedAt === 'number' && Number.isFinite(account.profileUpdatedAt) ? account.profileUpdatedAt : 0,
    typeof account.syncCursorUpdatedAt === 'number' && Number.isFinite(account.syncCursorUpdatedAt) ? account.syncCursorUpdatedAt : 0,
    account.lastSyncedAt ?? 0,
    account.newestGameTimestamp ?? 0,
    account.oldestGameTimestamp ?? 0,
    account.addedAt,
  );
}

export async function saveAccountToIdb(account: ChessAccount): Promise<void> {
  const db = await openGameDb();
  const tx = db.transaction('accounts', 'readwrite');
  tx.objectStore('accounts').put(account);
  await txDone(tx);
  enqueueMainDbPut('accounts', account.id, account, accountSyncUpdatedAt(account));
}

/**
 * Read one account record. Errors propagate rather than mapping to undefined:
 * registerAccount uses this lookup to decide create-vs-update, and a swallowed
 * read error would silently rebuild an existing account and reset its
 * addedAt/sync cursors. "Not found" and "read failed" must stay distinct.
 */
export async function getAccountFromIdb(id: string): Promise<ChessAccount | undefined> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('accounts', 'readonly').objectStore('accounts').get(id);
    req.onsuccess = () => resolve(req.result as ChessAccount | undefined);
    req.onerror   = () => reject(recordReqFailure(req, 'accounts', 'read', id));
  });
}

export async function listAccountsFromIdb(): Promise<ChessAccount[]> {
  try {
    const db = await openGameDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('accounts', 'readonly').objectStore('accounts').getAll();
      req.onsuccess = () => resolve((req.result as ChessAccount[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'accounts', 'read'));
    });
  } catch (e) {
    console.warn('[idb] account list failed', e);
    return [];
  }
}

// --- Analysis ---









export async function saveAnalysisToIdb(
  status: AnalysisStatus,
  gameId: string,
  nodes:  Record<string, StoredNodeEntry>,
  depth:  number,
  reviewEngine?: ReviewEngineMetadata,
): Promise<void> {
  const requestedAt = Date.now();
  try {
    await persistAnalysisToIdb(status, gameId, nodes, depth, reviewEngine, requestedAt);
  } catch (e) {
    console.warn('[idb] analysis save failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveAnalysisToIdb on analysis-library',
      metadata: {
        storeName: 'analysis-library',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function saveAnalysisToIdbStrict(
  status: AnalysisStatus,
  gameId: string,
  nodes:  Record<string, StoredNodeEntry>,
  depth:  number,
  reviewEngine?: ReviewEngineMetadata,
): Promise<void> {
  const requestedAt = Date.now();
  await persistAnalysisToIdb(status, gameId, nodes, depth, reviewEngine, requestedAt);
}

export async function loadAnalysisFromIdb(gameId: string): Promise<StoredAnalysis | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('analysis-library', 'readonly')
        .objectStore('analysis-library').get(gameId);
      req.onsuccess = () => resolve(req.result as StoredAnalysis | undefined);
      req.onerror   = () => reject(recordReqFailure(req, 'analysis-library', 'read', gameId));
    });
  } catch (e) {
    console.warn('[idb] analysis load failed', e);
    return undefined;
  }
}

export type AnalysisRecordClassification = 'complete' | 'partial' | 'version-stale';










export function classifyStoredAnalysisRecord(
  stored: Pick<StoredAnalysis, 'status' | 'analysisVersion'>,
  analysisVersion: number,
): AnalysisRecordClassification {
  if (stored.analysisVersion !== analysisVersion) return 'version-stale';
  return stored.status === 'complete' ? 'complete' : 'partial';
}



















function collectAnalysisLibraryClassificationCursor(
  db: IDBDatabase,
  analysisVersion: number,
): Promise<AnalysisLibraryClassification> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let completedResult: AnalysisLibraryClassification | undefined;

    const settleResolve = (result: AnalysisLibraryClassification): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const settleReject = (error: unknown): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    let openedTx: IDBTransaction;
    try {
      openedTx = db.transaction('analysis-library', 'readonly');
    } catch (error) {
      settleReject(error);
      return;
    }
    const tx = openedTx;

    tx.oncomplete = () => {
      if (completedResult !== undefined) {
        settleResolve(completedResult);
      } else {
        settleReject(new Error(
          'Analysis-library classification cursor transaction completed before settling a result (coding invariant violation)',
        ));
      }
    };
    tx.onerror = () => {
      recordTxFailure(tx, 'onerror', 'read');
      settleReject(tx.error ?? new Error('Analysis-library classification transaction failed'));
    };
    tx.onabort = () => {
      recordTxFailure(tx, 'onabort', 'read');
      settleReject(tx.error ?? new DOMException('Analysis-library classification transaction aborted', 'AbortError'));
    };

    let cursorRequest: IDBRequest<IDBCursorWithValue | null>;
    try {
      cursorRequest = tx.objectStore('analysis-library').openCursor();
    } catch (error) {
      settleReject(error);
      try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      return;
    }

    const complete:     CompletedAnalysisMetadata[]    = [];
    const partial:      PartialAnalysisMetadata[]      = [];
    const versionStale: VersionStaleAnalysisMetadata[] = [];

    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        // Exhaustion: record the result but do not resolve here — wait for tx.oncomplete.
        completedResult = { complete, partial, versionStale };
        return;
      }
      const stored = cursor.value as StoredAnalysis;
      if (typeof stored.gameId === 'string' && stored.gameId.trim()) {
        const updatedAt = typeof stored.updatedAt === 'number' ? stored.updatedAt : 0;
        switch (classifyStoredAnalysisRecord(stored, analysisVersion)) {
          case 'complete':
            complete.push({
              gameId: stored.gameId,
              ...(stored.reviewEngine !== undefined ? { reviewEngine: stored.reviewEngine } : {}),
              updatedAt,
              nodes: stored.nodes ?? {},
            });
            break;
          case 'partial':
            partial.push({ gameId: stored.gameId, updatedAt, status: stored.status });
            break;
          case 'version-stale':
            versionStale.push({ gameId: stored.gameId, updatedAt, analysisVersion: stored.analysisVersion });
            break;
        }
      }
      try {
        cursor.continue();
      } catch (error) {
        settleReject(error);
        try { tx.abort(); } catch { /* Transaction may already be inactive. */ }
      }
    };
    cursorRequest.onerror = () => {
      settleReject(recordReqFailure(cursorRequest, 'analysis-library', 'cursor'));
    };
  });
}








export async function listAnalysisLibraryClassificationFromIdb(
  analysisVersion: number,
): Promise<AnalysisLibraryClassification> {
  const db = await openGameDb();
  return collectAnalysisLibraryClassificationCursor(db, analysisVersion);
}

// Back-compat entry point: existing callers (e.g. reviewedStatusDerivation.ts) only need the
// "complete" bucket. Delegates to the single classification pass above rather than re-walking the
// store, so callers of both this and listAnalysisLibraryClassificationFromIdb in the same
// hydration cycle never trigger two cursor sweeps (main.ts hydration calls the classification
// function directly for that reason).
export async function listCompletedAnalysisMetadataFromIdb(
  analysisVersion: number,
): Promise<CompletedAnalysisMetadata[]> {
  const classification = await listAnalysisLibraryClassificationFromIdb(analysisVersion);
  return classification.complete;
}

export async function clearAnalysisFromIdb(gameId: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('analysis-library', 'readwrite');
    tx.objectStore('analysis-library').delete(gameId);
    await txDone(tx, 'delete');
    enqueueMainDbDelete('analysis', gameId);
  } catch (e) {
    console.warn('[idb] analysis clear failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: clearAnalysisFromIdb on analysis-library',
      metadata: {
        storeName: 'analysis-library',
        operation: 'delete',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}













export interface StoredUserTree {
  gameId:    string;
  updatedAt: number;
  /** Serialized via serializeUserTreeNode: engine/session-only fields are omitted. */
  root:      TreeNode;
}

/**
 * Recursively strip engine/session-only fields (eval, ceval, clock, moveTime, timeControl,
 * shapes, forceVariation) from a node, keeping identity/structure (id, ply, uci, san, fen,
 * children) plus the actual user edits (comments, glyphs, nags).
 * Mirrors lichess-org/lila: ui/analyse/src/idbTree.ts IdbTree.serializeNode.
 */
export function serializeUserTreeNode(n: TreeNode): TreeNode {
  return {
    id: n.id,
    ply: n.ply,
    ...(n.uci !== undefined ? { uci: n.uci } : {}),
    ...(n.san !== undefined ? { san: n.san } : {}),
    fen: n.fen,
    ...(n.comments && n.comments.length ? { comments: n.comments } : {}),
    ...(n.glyphs && n.glyphs.length ? { glyphs: n.glyphs } : {}),
    ...(n.nags && n.nags.length ? { nags: n.nags } : {}),
    children: n.children.map(serializeUserTreeNode),
  };
}

export async function saveUserTreeToIdb(gameId: string, root: TreeNode): Promise<void> {
  try {
    const db = await openGameDb();
    const record: StoredUserTree = {
      gameId,
      updatedAt: Date.now(),
      root: serializeUserTreeNode(root),
    };
    const tx = db.transaction('user-tree', 'readwrite');
    tx.objectStore('user-tree').put(record);
    await txDone(tx);
  } catch (e) {
    console.warn('[idb] user tree save failed', e);




    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveUserTreeToIdb on user-tree',
      metadata: {
        storeName: 'user-tree',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function loadUserTreeFromIdb(gameId: string): Promise<StoredUserTree | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('user-tree', 'readonly').objectStore('user-tree').get(gameId);
      req.onsuccess = () => resolve(req.result as StoredUserTree | undefined);
      req.onerror   = () => reject(recordReqFailure(req, 'user-tree', 'read', gameId));
    });
  } catch (e) {
    console.warn('[idb] user tree load failed', e);
    return undefined;
  }
}

// --- Retro session results ---

export async function saveRetroResult(result: RetroSessionResult): Promise<void> {
  if (!result.gameId) return;
  const requestedAt = Date.now();
  if (shouldDropDataManagementReviewWrite('retro-results', result.gameId, requestedAt)) return;
  try {
    const db = await openGameDb();
    if (shouldDropDataManagementReviewWrite('retro-results', result.gameId, requestedAt)) return;
    const tx = db.transaction('retro-results', 'readwrite');
    tx.objectStore('retro-results').put(result, result.gameId);
    await txDone(tx);
    enqueueMainDbPut('retro-results', result.gameId, result, result.savedAt);
  } catch (e) {
    console.warn('[idb] retro-result save failed', e);




    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveRetroResult on retro-results',
      metadata: {
        storeName: 'retro-results',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function getRetroResult(gameId: string): Promise<RetroSessionResult | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('retro-results', 'readonly')
        .objectStore('retro-results').get(gameId);
      req.onsuccess = () => resolve(req.result as RetroSessionResult | undefined);
      req.onerror   = () => reject(recordReqFailure(req, 'retro-results', 'read', gameId));
    });
  } catch (e) {
    console.warn('[idb] retro-result load failed', e);
    return undefined;
  }
}

export async function listRetroResults(): Promise<RetroSessionResult[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('retro-results', 'readonly')
        .objectStore('retro-results').getAll();
      req.onsuccess = () => resolve((req.result as RetroSessionResult[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'retro-results', 'read'));
    });
  } catch (e) {
    console.warn('[idb] retro-result list failed', e);
    return [];
  }
}

// --- Background review queue manifest ---
// Lightweight per-game status record persisted on enqueue and on each status
// transition in engine/reviewQueue.ts, so a bulk review run survives a reload.
// Deliberately excludes the full AnalyseCtrl/eval cache — those are rebuilt
// from the game's PGN and re-analyzed on resume.

export interface ReviewQueueManifestEntry {
  gameId: string;
  status: 'pending' | 'analyzing' | 'complete' | 'error';
  depth:            number;
  minimumDepthUsed?: number;
  done:             number;
  total:            number;
}

export interface ReviewQueueManifestLoadResult {
  entries: ReviewQueueManifestEntry[];
  errorDetail: string | null;
}

export interface ReviewFailureRecord {
  key:          string;
  gameId:       string;
  depth:        number;
  attempts:     number;
  lastFailedAt: number;
  skipped?:     boolean;
  skippedAt?:   number;
}

export async function saveReviewQueueManifest(entry: ReviewQueueManifestEntry): Promise<boolean> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('review-queue', 'readwrite');
    tx.objectStore('review-queue').put(entry);
    await txDone(tx);
    return true;
  } catch (e) {
    console.warn('[idb] review-queue manifest save failed', e);





    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveReviewQueueManifest on review-queue',
      metadata: {
        storeName: 'review-queue',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
    return false;
  }
}

export async function clearReviewQueueManifestEntry(gameId: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('review-queue', 'readwrite');
    tx.objectStore('review-queue').delete(gameId);
    await txDone(tx, 'delete');
  } catch (e) {
    console.warn('[idb] review-queue manifest clear failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: clearReviewQueueManifestEntry on review-queue',
      metadata: {
        storeName: 'review-queue',
        operation: 'delete',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function clearReviewQueueManifest(): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('review-queue', 'readwrite');
    tx.objectStore('review-queue').clear();
    await txDone(tx, 'clear');
  } catch (e) {
    console.warn('[idb] review-queue manifest clear-all failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: clearReviewQueueManifest on review-queue',
      metadata: {
        storeName: 'review-queue',
        operation: 'clear',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

function diagnosticIdbErrorDetail(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || 'Error';
  if (error instanceof DOMException) return error.message || error.name || 'DOMException';
  if (typeof error === 'string') return error || 'UnknownError';
  if (error === null || error === undefined) return 'UnknownError';
  return 'NonErrorThrow';
}

export async function loadReviewQueueManifestWithDiagnostics(): Promise<ReviewQueueManifestLoadResult> {
  try {
    const db = await openGameDb();
    const entries = await new Promise<ReviewQueueManifestEntry[]>((resolve, reject) => {
      const req = db.transaction('review-queue', 'readonly').objectStore('review-queue').getAll();
      req.onsuccess = () => resolve((req.result as ReviewQueueManifestEntry[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'review-queue', 'read'));
    });
    return { entries, errorDetail: null };
  } catch (e) {
    console.warn('[idb] review-queue manifest load failed', e);
    return {
      entries: [],
      errorDetail: diagnosticIdbErrorDetail(e),
    };
  }
}

export async function loadReviewQueueManifest(): Promise<ReviewQueueManifestEntry[]> {
  const result = await loadReviewQueueManifestWithDiagnostics();
  return result.entries;
}

export async function saveReviewRunManifest(manifest: ReviewRunManifest): Promise<boolean> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('review-runs', 'readwrite');
    tx.objectStore('review-runs').put(manifest);
    await txDone(tx);
    return true;
  } catch (e) {
    console.warn('[idb] review-runs manifest save failed', e);




    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveReviewRunManifest on review-runs',
      metadata: {
        storeName: 'review-runs',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
    return false;
  }
}

export async function loadReviewRunManifests(): Promise<ReviewRunManifest[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('review-runs', 'readonly').objectStore('review-runs').getAll();
      req.onsuccess = () => resolve((req.result as ReviewRunManifest[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'review-runs', 'read'));
    });
  } catch (e) {
    console.warn('[idb] review-runs manifest load failed', e);
    return [];
  }
}

export async function loadLatestReviewRunManifest(): Promise<ReviewRunManifest | null> {
  const manifests = await loadReviewRunManifests();
  return manifests.sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;
}

export async function clearReviewRunManifest(runId: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('review-runs', 'readwrite');
    tx.objectStore('review-runs').delete(runId);
    await txDone(tx, 'delete');
  } catch (e) {
    console.warn('[idb] review-runs manifest clear failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: clearReviewRunManifest on review-runs',
      metadata: {
        storeName: 'review-runs',
        operation: 'delete',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function saveReviewFailureRecord(record: ReviewFailureRecord): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('review-failures', 'readwrite');
    tx.objectStore('review-failures').put(record);
    await txDone(tx);
  } catch (e) {
    console.warn('[idb] review-failures save failed', e);





    recordDiagnostic({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveReviewFailureRecord on review-failures',
      metadata: {
        storeName: 'review-failures',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function deleteReviewFailureRecord(key: string): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('review-failures', 'readwrite');
    tx.objectStore('review-failures').delete(key);
    await txDone(tx, 'delete');
  } catch (e) {
    console.warn('[idb] review-failures delete failed', e);



    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: deleteReviewFailureRecord on review-failures',
      metadata: {
        storeName: 'review-failures',
        operation: 'delete',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function loadReviewFailureRecords(): Promise<ReviewFailureRecord[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('review-failures', 'readonly').objectStore('review-failures').getAll();
      req.onsuccess = () => resolve((req.result as ReviewFailureRecord[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'review-failures', 'read'));
    });
  } catch (e) {
    console.warn('[idb] review-failures load failed', e);
    return [];
  }
}

// --- Game summaries ---

export async function saveGameSummary(summary: GameSummary): Promise<void> {
  if (!summary.gameId) return;
  const requestedAt = Date.now();
  if (shouldDropDataManagementReviewWrite('game-summaries', summary.gameId, requestedAt)) return;
  try {
    const db = await openGameDb();
    if (shouldDropDataManagementReviewWrite('game-summaries', summary.gameId, requestedAt)) return;
    const tx = db.transaction('game-summaries', 'readwrite');
    tx.objectStore('game-summaries').put(summary, summary.gameId);
    await txDone(tx);
    const analyzedAt = Date.parse(summary.analyzedAt);



    enqueueMainDbPutClearingDeletedAt('game-summaries', summary.gameId, summary, Number.isNaN(analyzedAt) ? Date.now() : analyzedAt);
  } catch (e) {
    console.warn('[idb] game-summary save failed', e);




    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: saveGameSummary on game-summaries',
      metadata: {
        storeName: 'game-summaries',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function getGameSummary(gameId: string): Promise<GameSummary | undefined> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('game-summaries', 'readonly')
        .objectStore('game-summaries').get(gameId);
      req.onsuccess = () => resolve(req.result as GameSummary | undefined);
      req.onerror   = () => reject(recordReqFailure(req, 'game-summaries', 'read', gameId));
    });
  } catch (e) {
    console.warn('[idb] game-summary load failed', e);
    return undefined;
  }
}

export async function listGameSummaries(): Promise<GameSummary[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('game-summaries', 'readonly')
        .objectStore('game-summaries').getAll();
      req.onsuccess = () => resolve((req.result as GameSummary[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'game-summaries', 'read'));
    });
  } catch (e) {
    console.warn('[idb] game-summary list failed', e);
    return [];
  }
}

// --- Opening backfill ---

/**
 * Classify existing games that are missing opening or ECO data.
 * Runs in the background at startup — does not block the UI.
 * Returns the count of records updated.
 */
export async function backfillOpenings(): Promise<number> {
  try {
    const db = await openGameDb();
    const updatedRecords: StoredGameRecord[] = [];
    const records = await new Promise<StoredGameRecord[]>((resolve, reject) => {
      const req = db.transaction('games', 'readonly').objectStore('games').getAll();
      req.onsuccess = () => resolve((req.result as StoredGameRecord[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'games', 'read'));
    });
    const toUpdate = records.filter(r => r.opening === null || r.eco === null);
    if (toUpdate.length === 0) return 0;
    const tx = db.transaction('games', 'readwrite');
    const store = tx.objectStore('games');
    let count = 0;
    for (const record of toUpdate) {
      const classified = classifyOpening(record.pgn);
      if (!classified) continue;
      if (record.opening === null) record.opening = classified.name;
      if (record.eco === null) record.eco = classified.eco;
      record.updatedAt = Date.now();
      store.put(record);
      updatedRecords.push(record);
      count++;
    }
    await txDone(tx, 'write');
    for (const record of updatedRecords) {
      enqueueMainDbPut('games', record.id, record, record.updatedAt);
    }
    if (count > 0) console.log(`[idb] Backfilled opening data for ${count} game(s)`);
    return count;
  } catch (e) {
    console.warn('[idb] backfillOpenings failed', e);






    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: backfillOpenings on games',
      metadata: {
        storeName: 'games',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
    return 0;
  }
}

// --- Full reset ---

/**
 * Clear all Patzer Pro IndexedDB data in a single transaction.
 * Called by the "Clear Local Data" action. Leaves the DB schema intact.
 */
export async function clearAllIdbData(): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction(['game-library', 'puzzle-library', 'analysis-library', 'retro-results', 'game-summaries', 'games', 'studies', 'practice-lines', 'position-progress', 'drill-attempts', 'folders', 'accounts', 'review-queue', 'review-failures', 'review-runs', 'repertoire-sources', 'repertoire-match-records', 'repertoire-scan-runs', 'player-profiles', 'user-tree'], 'readwrite');
    tx.objectStore('game-library').clear();
    tx.objectStore('puzzle-library').clear();
    tx.objectStore('analysis-library').clear();
    tx.objectStore('retro-results').clear();
    tx.objectStore('game-summaries').clear();
    tx.objectStore('games').clear();
    tx.objectStore('studies').clear();
    tx.objectStore('practice-lines').clear();
    tx.objectStore('position-progress').clear();
    tx.objectStore('drill-attempts').clear();
    tx.objectStore('folders').clear();
    tx.objectStore('accounts').clear();
    tx.objectStore('review-queue').clear();
    tx.objectStore('review-failures').clear();
    tx.objectStore('review-runs').clear();
    tx.objectStore('repertoire-sources').clear();
    tx.objectStore('repertoire-match-records').clear();
    tx.objectStore('repertoire-scan-runs').clear();
    tx.objectStore('player-profiles').clear();
    tx.objectStore('user-tree').clear();
    await txDone(tx, 'clear');
  } catch (e) {
    console.warn('[idb] clearAllIdbData failed', e);





    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: clearAllIdbData on all-idb-stores',
      metadata: {
        storeName: 'all-idb-stores',
        operation: 'clear',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

// --- Puzzles ---

async function savePuzzlesToIdb(): Promise<void> {
  if (!_savedPuzzlesHydrated) {
    // Last line of defense (BUG-2026-07-10-017): the saved-puzzles record is a SINGLETON — this
    // put() overwrites the whole durable set. Doing it from an in-memory `savedPuzzles` that is not
    // known to reflect the durable data (a failed/absent load) would permanently destroy every
    // previously saved puzzle. Refuse honestly: the write does not happen, and — importantly — the
    // destructive sync upsert below is not enqueued either.
    console.error('[idb] puzzle save refused: saved-puzzle set is unhydrated; refusing to overwrite the durable singleton');
    return;
  }
  try {
    const db = await openGameDb();
    const tx = db.transaction('puzzle-library', 'readwrite');
    tx.objectStore('puzzle-library').put(savedPuzzles, 'saved-puzzles');
    await txDone(tx);
    enqueueMainDbPut('saved-review-puzzles', 'saved-puzzles', savedPuzzles, Date.now());
  } catch (e) {
    console.warn('[idb] puzzle save failed', e);





    record({
      kind: 'idb',
      severity: Severity.Error,
      sourceTag: 'idb',
      message: 'IDB write failed: savePuzzlesToIdb on puzzle-library',
      metadata: {
        storeName: 'puzzle-library',
        operation: 'write',
        errorName: (e as { name?: string } | null | undefined)?.name ?? 'UnknownError',
      },
      redactionClass: 'safe',
    });
  }
}

export async function loadPuzzlesFromIdb(): Promise<PuzzleCandidate[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('puzzle-library', 'readonly')
        .objectStore('puzzle-library').get('saved-puzzles');
      req.onsuccess = () => {
        // A successful read hydrates the in-memory mirror's authority over the durable singleton,
        // whether it returns saved puzzles or a genuinely-empty library (req.result === undefined
        // -> []). This is the ONLY place _savedPuzzlesHydrated may become true.
        _savedPuzzlesHydrated = true;
        resolve((req.result as PuzzleCandidate[] | undefined) ?? []);
      };
      req.onerror   = () => {




        _savedPuzzlesHydrated = false;
        reject(recordReqFailure(req, 'puzzle-library', 'read', 'saved-puzzles'));
      };
    });
  } catch (e) {





    _savedPuzzlesHydrated = false;
    console.warn('[idb] puzzle load failed', e);
    return [];
  }
}







let _pendingUnhydratedSaves: Array<{ c: PuzzleCandidate; redraw: () => void }> = [];
let _rehydrationInFlight = false;

export function savePuzzle(c: PuzzleCandidate, redraw: () => void): void {
  if (!_savedPuzzlesHydrated) {
    // `savedPuzzles` is NOT known to reflect the durable singleton (a failed/absent load, or a
    // failure-invalidated mirror). Appending to it and persisting would overwrite — and destroy —
    // the durable saved-puzzle library (BUG-2026-07-10-017). Enqueue and share one re-hydration.
    _pendingUnhydratedSaves.push({ c, redraw });
    if (!_rehydrationInFlight) {
      _rehydrationInFlight = true;
      void drainPendingUnhydratedSaves();
    }
    return;
  }
  appendPuzzleAndPersist(c, redraw);
}








async function drainPendingUnhydratedSaves(): Promise<void> {
  try {
    const loaded = await loadPuzzlesFromIdb().catch(() => null);
    // loadPuzzlesFromIdb sets _savedPuzzlesHydrated true ONLY on a genuine successful read (and now
    // false on any failure). Trust that flag as the single source of truth for whether we may write.
    if (_savedPuzzlesHydrated && loaded) setSavedPuzzles(loaded);
  } finally {
    const pending = _pendingUnhydratedSaves;
    _pendingUnhydratedSaves = [];
    _rehydrationInFlight = false;
    if (_savedPuzzlesHydrated) {
      let appended = false;
      for (const { c } of pending) {
        if (savedPuzzles.some(p => p.gameId === c.gameId && p.path === c.path)) continue;
        savedPuzzles = [...savedPuzzles, c];
        appended = true;
      }
      // A single persist for the whole merged batch (the guard in savePuzzlesToIdb passes now that
      // the mirror is hydrated). Skip the write entirely if every candidate was a duplicate.
      if (appended) void savePuzzlesToIdb();
      for (const { redraw } of pending) redraw();
    } else {
      // Re-hydration failed (durable read unavailable): refuse the batch — do not overwrite the
      // durable set from an unhydrated mirror. Honest failure, no data destruction.
      console.error('[idb] savePuzzle refused: saved-puzzle library is unhydrated (durable read unavailable); not overwriting the durable set');
      for (const { redraw } of pending) redraw();
    }
  }
}

/**
 * Append a candidate to the (hydrated) in-memory set and persist. Dedupe is unchanged from the
 * original savePuzzle body (gameId + path identity). Callers MUST ensure _savedPuzzlesHydrated is
 * true before invoking this (savePuzzle enforces it above).
 */
function appendPuzzleAndPersist(c: PuzzleCandidate, redraw: () => void): void {
  const already = savedPuzzles.some(p => p.gameId === c.gameId && p.path === c.path);
  if (already) return;
  savedPuzzles = [...savedPuzzles, c];
  void savePuzzlesToIdb();
  redraw();
}
