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
import { record, Severity } from '../diagnostics';
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

export function setSavedPuzzles(puzzles: PuzzleCandidate[]): void {
  savedPuzzles = puzzles;
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
    const events: DiagnosticEvent[] = [];
    const tx = db.transaction('diagnostic-events', 'readonly');
    const req = tx.objectStore('diagnostic-events').index('timestamp').openCursor();

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(events);
        return;
      }

      const event = cursor.value as DiagnosticEvent;
      if (options.kind === undefined || event.kind === options.kind) {
        events.push(event);
        if (events.length >= limit) {
          resolve(events);
          return;
        }
      }

      cursor.continue();
    };

    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-events', 'cursor'));
    tx.onabort = () => {
      record({
        kind: 'idb',
        severity: Severity.Error,
        sourceTag: 'idb',
        message: 'IDB transaction onabort',
        metadata: {
          storeName: 'diagnostic-events',
          operation: 'read',
          mode: tx.mode,
          errorName: tx.error?.name ?? 'UnknownError',
        },
        redactionClass: 'safe',
      });
      reject(tx.error);
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
    const sessions: DiagnosticSession[] = [];
    const tx = db.transaction('diagnostic-sessions', 'readonly');
    const req = tx.objectStore('diagnostic-sessions').index('startedAt').openCursor(null, 'prev');

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(sessions);
        return;
      }

      sessions.push(cursor.value as DiagnosticSession);
      if (sessions.length >= limit) {
        resolve(sessions);
        return;
      }

      cursor.continue();
    };

    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-sessions', 'cursor'));
    tx.onabort = () => {
      record({
        kind: 'idb',
        severity: Severity.Error,
        sourceTag: 'idb',
        message: 'IDB transaction onabort',
        metadata: {
          storeName: 'diagnostic-sessions',
          operation: 'read',
          mode: tx.mode,
          errorName: tx.error?.name ?? 'UnknownError',
        },
        redactionClass: 'safe',
      });
      reject(tx.error);
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
    const aggregates: DiagnosticAggregate[] = [];
    const tx = db.transaction('diagnostic-aggregates', 'readonly');
    const store = tx.objectStore('diagnostic-aggregates');
    const req = kind
      ? store.index('kind').openCursor(kind)
      : store.openCursor();

    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve(aggregates);
        return;
      }

      aggregates.push(cursor.value as DiagnosticAggregate);
      cursor.continue();
    };
    req.onerror = () => reject(recordReqFailure(req, 'diagnostic-aggregates', 'cursor'));
    tx.onabort = () => reject(tx.error);
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
  }
}

/**
 * Save a single game to the per-game `games` store.
 * Use after analysis or when a game's metadata is updated.
 */
export async function saveGameToIdb(game: ImportedGame): Promise<void> {
  try {
    const db = await openGameDb();
    const record = importedGameToRecord(game);
    const tx = db.transaction('games', 'readwrite');
    tx.objectStore('games').put(record);
    await txDone(tx);
    enqueueMainDbPut('games', record.id, record, record.updatedAt);
    void captureStorageEstimate('post-idb-write');
  } catch (e) {
    console.warn('[idb] single-game save failed', e);
  }
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
 * Adapted from lichess-org/lila: ui/lib/src/objectStorage.ts getMany() pattern.
 */
export async function loadGamesFromIdb(): Promise<StoredGames | undefined> {
  try {
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
  } catch (e) {
    console.warn('[idb] load failed', e);
    return undefined;
  }
}

/**
 * Load all games belonging to one registry account, via the `accountId` index
 * (no full-store scan). Used by the Opponents page shared-store read path.
 */
export async function loadGamesByAccountFromIdb(accountId: string): Promise<StoredGameRecord[]> {
  try {
    const db = await openGameDb();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('games', 'readonly')
        .objectStore('games').index('accountId').getAll(accountId);
      req.onsuccess = () => resolve((req.result as StoredGameRecord[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'games', 'read'));
    });
  } catch (e) {
    console.warn('[idb] account games load failed', e);
    return [];
  }
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






export async function listAnalysisLibraryClassificationFromIdb(
  analysisVersion: number,
): Promise<AnalysisLibraryClassification> {
  const db = await openGameDb();
  return new Promise((resolve, reject) => {
    const complete:     CompletedAnalysisMetadata[]    = [];
    const partial:      PartialAnalysisMetadata[]      = [];
    const versionStale: VersionStaleAnalysisMetadata[] = [];
    const req = db.transaction('analysis-library', 'readonly')
      .objectStore('analysis-library')
      .openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) {
        resolve({ complete, partial, versionStale });
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
      cursor.continue();
    };
    req.onerror = () => reject(recordReqFailure(req, 'analysis-library', 'cursor'));
  });
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
  }
}

// --- Puzzles ---

async function savePuzzlesToIdb(): Promise<void> {
  try {
    const db = await openGameDb();
    const tx = db.transaction('puzzle-library', 'readwrite');
    tx.objectStore('puzzle-library').put(savedPuzzles, 'saved-puzzles');
    await txDone(tx);
    enqueueMainDbPut('saved-review-puzzles', 'saved-puzzles', savedPuzzles, Date.now());
  } catch (e) {
    console.warn('[idb] puzzle save failed', e);
  }
}

export async function loadPuzzlesFromIdb(): Promise<PuzzleCandidate[]> {
  try {
    const db = await openGameDb();
    return new Promise((resolve, reject) => {
      const req = db.transaction('puzzle-library', 'readonly')
        .objectStore('puzzle-library').get('saved-puzzles');
      req.onsuccess = () => resolve((req.result as PuzzleCandidate[] | undefined) ?? []);
      req.onerror   = () => reject(recordReqFailure(req, 'puzzle-library', 'read', 'saved-puzzles'));
    });
  } catch (e) {
    console.warn('[idb] puzzle load failed', e);
    return [];
  }
}

export function savePuzzle(c: PuzzleCandidate, redraw: () => void): void {
  const already = savedPuzzles.some(p => p.gameId === c.gameId && p.path === c.path);
  if (already) return;
  savedPuzzles = [...savedPuzzles, c];
  void savePuzzlesToIdb();
  redraw();
}
