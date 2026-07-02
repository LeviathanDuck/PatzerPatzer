/**
 * Opening Explorer — API transport layer.
 *
 * Typed fetch layer for the Lichess opening explorer API:
 * supports /masters, /lichess, and /player endpoints,
 * NDJSON streaming, and abortable requests.
 *
 * Adapted from lichess-org/lila:
 *   ui/analyse/src/explorer/explorerXhr.ts
 *   ui/analyse/src/explorer/interfaces.ts
 */
import { getRemoteSyncGeneration, getRemoteSyncToken } from '../sync/remoteSync';
import { record, Severity } from '../diagnostics';

/**
 * Route explorer requests through the local dev-server proxy at /api/explorer/:db.
 * The proxy forwards to explorer.lichess.ovh and injects a LICHESS_TOKEN bearer
 * token (set via env var) — required since the Lichess explorer API demands auth.
 */
export const EXPLORER_ENDPOINT = '/api/explorer';
const REMOTE_SYNC_BOOK_EXPLORER_ENDPOINT = '/api/patzer-sync/book-explorer.php';

export class ExplorerBookAuthError extends Error {
  constructor(message = 'Lichess book access is required.') {
    super(message);
    this.name = 'ExplorerBookAuthError';
  }
}

export function isExplorerBookAuthError(error: unknown): boolean {
  return error instanceof ExplorerBookAuthError
    || (error instanceof Error && error.name === 'ExplorerBookAuthError');
}

// ============================================================
// Types — adapted from lichess-org/lila: ui/analyse/src/explorer/interfaces.ts
// ============================================================

export type RemoteExplorerDb = 'lichess' | 'masters' | 'player';
export type ExplorerDb = RemoteExplorerDb | 'repertoire';
export type ExplorerMode = 'casual' | 'rated';
export type ExplorerSpeed =
  | 'ultraBullet' | 'bullet' | 'blitz' | 'rapid' | 'classical' | 'correspondence';

export interface OpeningGame {
  id: string;
  white: { name: string; rating: number };
  black: { name: string; rating: number };
  winner?: 'white' | 'black';
  year?: string;
  month?: string;
  speed?: ExplorerSpeed;
  mode?: ExplorerMode;
  uci?: string;
}

export interface OpeningMoveStats {
  uci: string;
  san: string;
  white: number;
  black: number;
  draws: number;
  averageRating?: number;
  averageOpponentRating?: number;
  performance?: number;
  game?: OpeningGame;
  opening?: { eco: string; name: string };
}

/** Backward-compat alias — existing callers use ExplorerMove. */
export type ExplorerMove = OpeningMoveStats;

/** Base explorer response shape — common to all DBs. */
export interface ExplorerData {
  fen: string;
  moves: OpeningMoveStats[];
  isOpening?: true;
}

/** Full opening DB response (masters / lichess / player). */
export interface OpeningData extends ExplorerData {
  white: number;
  black: number;
  draws: number;
  moves: OpeningMoveStats[];
  topGames?: OpeningGame[];
  recentGames?: OpeningGame[];
  opening?: { eco: string; name: string };
  queuePosition?: number;
}

/** Read-only helper for UI badges that need to test loaded explorer data without fetching. */
export function openingDataHasMove(data: OpeningData | undefined, uci: string): boolean {
  return !!data?.moves.some(move => move.uci === uci);
}

// ============================================================
// NDJSON streaming reader
// Adapted from lichess-org/lila: ui/lib/src/xhr.ts readNdJson
// ============================================================

function looksLikeHtml(contentType: string, text: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return contentType.toLowerCase().includes('text/html')
    || trimmed.startsWith('<!doctype html')
    || trimmed.startsWith('<html');
}

function parseExplorerLine<T>(line: string): T {
  try {
    return JSON.parse(line) as T;
  } catch {
    if (looksLikeHtml('', line)) {
      throw new ExplorerBookAuthError('Lichess book access is required.');
    }
    throw new Error('Explorer returned malformed data.');
  }
}

async function assertExplorerResponse(res: Response): Promise<void> {
  const contentType = res.headers.get('content-type') ?? '';
  if (res.ok && !contentType.toLowerCase().includes('text/html')) return;

  const text = await res.text();
  if (res.status === 401 || res.status === 403 || looksLikeHtml(contentType, text)) {
    throw new ExplorerBookAuthError('Lichess book access is required.');
  }

  if (contentType.toLowerCase().includes('application/json')) {
    try {
      const body = JSON.parse(text) as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) {
        throw new Error(body.error);
      }
    } catch (error) {
      if (error instanceof Error && error.message !== 'Unexpected end of JSON input') throw error;
    }
  }

  throw new Error(`Explorer API error ${res.status}`);
}

async function readNdJson<T>(res: Response, cb: (chunk: T) => void): Promise<void> {
  await assertExplorerResponse(res);
  const reader = res.body?.getReader();
  if (!reader) {
    // Fallback: no streaming support — parse as single JSON
    const text = await res.text();
    if (text.trim()) cb(parseExplorerLine<T>(text));
    return;
  }
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed) cb(parseExplorerLine<T>(trimmed));
    }
  }
  const tail = buf.trim();
  if (tail) cb(parseExplorerLine<T>(tail));
}

// ============================================================
// Failure instrumentation — API diagnostics
// Logs endpoint class, HTTP status, and latency on failure.
// Raw API response payloads, FEN strings, and tokens are
// never included in the metadata passed to record().
// ============================================================

interface ExplorerFailureContext {
  endpointClass: string;
  httpStatus: number;
  latencyMs: number;
  errorName: string;
}

function recordExplorerFailure(ctx: ExplorerFailureContext): void {
  record({
    kind: 'api',
    severity: Severity.Error,
    sourceTag: 'explorer',
    message: `Explorer API failure: ${ctx.endpointClass} ${ctx.httpStatus || '(no response)'}`,
    metadata: {
      endpointClass: ctx.endpointClass,
      httpStatus: ctx.httpStatus,
      latencyMs: ctx.latencyMs,
      errorName: ctx.errorName,
    },
    redactionClass: 'safe',
  });
}

function openingRequestTarget(db: RemoteExplorerDb): { url: URL; headers: Headers } {
  const token = getRemoteSyncToken().trim();
  const headers = new Headers();
  const localDevHost = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname === '[::1]'
    || window.location.hostname === '::1';
  if (token && !localDevHost) {
    headers.set('Authorization', `Bearer ${token}`);
    const generation = getRemoteSyncGeneration();
    if (generation !== undefined) headers.set('X-Patzer-Sync-Generation', String(generation));
    const url = new URL(REMOTE_SYNC_BOOK_EXPLORER_ENDPOINT, window.location.origin);
    url.searchParams.set('db', db);
    return { url, headers };
  }
  return {
    url: new URL(`${EXPLORER_ENDPOINT}/${db}`, window.location.origin),
    headers,
  };
}

// ============================================================
// Request param types — one per DB, matching Lichess param model
// ============================================================

interface BaseOpeningParams {
  fen: string;
  play?: string[];       // UCI moves from root FEN (optional; FEN-only also works)
  topGames?: boolean;
  recentGames?: boolean;
}

export interface MastersParams extends BaseOpeningParams {
  db: 'masters';
  variant?: string;
  since?: string;        // YYYY
  until?: string;        // YYYY
}

export interface LichessParams extends BaseOpeningParams {
  db: 'lichess';
  variant?: string;
  speeds?: ExplorerSpeed[];
  ratings?: number[];
  since?: string;        // YYYY-MM
  until?: string;        // YYYY-MM
}

export interface PlayerParams extends BaseOpeningParams {
  db: 'player';
  player: string;
  color: 'white' | 'black';
  speeds?: ExplorerSpeed[];
  modes?: ExplorerMode[];
  since?: string;        // YYYY-MM
  until?: string;        // YYYY-MM
}

export type OpeningParams = MastersParams | LichessParams | PlayerParams;

// ============================================================
// Core transport — openingFetch
// Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerXhr.ts opening()
// Streams NDJSON chunks; callers merge and redraw progressively.
// ============================================================

/**
 * Fetch opening explorer data for a position.
 * Calls onData for each NDJSON chunk as it arrives — callers
 * should merge chunks via Object.assign to build the final response.
 * Pass an AbortSignal to cancel in-flight requests on navigation.
 *
 * On failure, records a diagnostic event with endpoint class, HTTP status,
 * and latency. Raw API payloads, FEN strings, and tokens are never logged.
 */
export async function openingFetch(
  params: OpeningParams,
  onData: (chunk: Partial<OpeningData>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { url, headers } = openingRequestTarget(params.db);
  const p = url.searchParams;
  // Endpoint class identifies the DB type — not position-specific data.
  const endpointClass = `explorer-${params.db}`;

  p.set('fen', params.fen);
  if (params.play?.length) p.set('play', params.play.join(','));
  p.set('topGames', params.topGames === false ? '0' : '1');
  p.set('recentGames', params.recentGames === false ? '0' : '1');

  if (params.db === 'masters') {
    if (params.variant && params.variant !== 'standard') p.set('variant', params.variant);
    if (params.since) p.set('since', params.since.split('-')[0]!);  // year only for masters
    if (params.until) p.set('until', params.until.split('-')[0]!);
  } else if (params.db === 'lichess') {
    if (params.variant && params.variant !== 'standard') p.set('variant', params.variant);
    if (params.speeds?.length) p.set('speeds', params.speeds.join(','));
    if (params.ratings?.length) p.set('ratings', params.ratings.join(','));
    if (params.since) p.set('since', params.since);
    if (params.until) p.set('until', params.until);
  } else {
    if (!params.player) throw new Error('Player name required for player DB');
    p.set('player', params.player);
    p.set('color', params.color);
    if (params.speeds?.length) p.set('speeds', params.speeds.join(','));
    if (params.modes?.length) p.set('modes', params.modes.join(','));
    if (params.since) p.set('since', params.since);
    if (params.until) p.set('until', params.until);
  }

  const t0 = Date.now();
  let httpStatus = 0;

  performance.mark('opening-explorer-fetch-start');
  try {
    const res = await fetch(url.href, {
      cache: 'default',
      credentials: 'same-origin',
      headers,
      ...(signal ? { signal } : {}),
    });

    httpStatus = res.status;

    await readNdJson<Partial<OpeningData>>(res, chunk => {
      chunk.isOpening = true;
      chunk.fen = params.fen;
      onData(chunk);
    });
    performance.mark('opening-explorer-fetch-end');
  } catch (err) {
    performance.mark('opening-explorer-fetch-end');
    // AbortError means the caller cancelled intentionally — not a failure worth logging.
    if (err instanceof Error && err.name === 'AbortError') throw err;

    const latencyMs = Date.now() - t0;

    recordExplorerFailure({
      endpointClass,
      httpStatus,
      latencyMs,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });

    throw err;
  }
}

// ============================================================
// Tablebase support
// Adapted from lichess-org/lila: ui/analyse/src/explorer/tablebaseView.ts
// Public endpoint — no auth required.
// ============================================================

const TABLEBASE_ENDPOINT = 'https://tablebase.lichess.ovh/standard';

/** Tablebase outcome category from the side-to-move's perspective.
 *  'win'  = side to move loses (opponent wins).
 *  'loss' = side to move wins (opponent loses). (Lichess naming is from engine POV.)
 *  Mirrors lichess-org/lila: ui/analyse/src/explorer/interfaces.ts TablebaseCategory
 */
export type TablebaseCategory =
  | 'win' | 'unknown' | 'maybe-win' | 'syzygy-loss' | 'blessed-loss'
  | 'draw' | 'cursed-win' | 'maybe-win' | 'maybe-loss' | 'syzygy-win' | 'loss';

/** Per-move stats returned by the tablebase endpoint.
 *  Adapted from lichess-org/lila: ui/analyse/src/explorer/interfaces.ts TablebaseMoveStats
 */
export interface TablebaseMoveStats {
  uci: string;
  san: string;
  dtz?: number;
  dtm?: number;
  dtw?: number;
  dtc?: number;
  checkmate?: boolean;
  stalemate?: boolean;
  insufficient_material?: boolean;
  variant_win?: boolean;
  variant_loss?: boolean;
  zeroing?: boolean;
  category: TablebaseCategory;
}

/** Full tablebase response for a position. */
export interface TablebaseData {
  fen: string;
  dtz?: number;
  dtm?: number;
  category?: TablebaseCategory;
  moves: TablebaseMoveStats[];
  checkmate?: boolean;
  stalemate?: boolean;
  variant_win?: boolean;
  variant_loss?: boolean;
  insufficient_material?: boolean;
}

/**
 * Count total pieces on the board from a FEN string.
 * Tablebase covers positions with ≤7 pieces (Syzygy).
 */
export function countPieces(fen: string): number {
  return (fen.split(' ')[0] ?? '').replace(/[^a-zA-Z]/g, '').length;
}

/** Returns true when the position has ≤7 pieces — tablebase territory. */
export function isTablebasePosition(fen: string): boolean {
  return countPieces(fen) <= 7;
}

/**
 * Fetch tablebase data for a position from tablebase.lichess.ovh.
 * Public endpoint — no auth needed.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerXhr.ts tablebase()
 *
 * On failure, records a diagnostic event with endpoint class, HTTP status,
 * and latency. Raw API payloads and FEN strings are never logged.
 */
export async function tablebaseFetch(
  fen: string,
  signal?: AbortSignal,
): Promise<TablebaseData> {
  const url = new URL(TABLEBASE_ENDPOINT);
  url.searchParams.set('fen', fen);
  const t0 = Date.now();
  let httpStatus = 0;

  try {
    const res = await fetch(url.href, { ...(signal ? { signal } : {}), credentials: 'omit' });
    httpStatus = res.status;

    if (!res.ok) {
      const latencyMs = Date.now() - t0;
      recordExplorerFailure({
        endpointClass: 'tablebase',
        httpStatus,
        latencyMs,
        errorName: 'HttpError',
      });
      throw new Error(`Tablebase API error ${res.status}`);
    }

    const data = await res.json() as TablebaseData;
    data.fen = fen;
    return data;
  } catch (err) {
    // AbortError means the caller cancelled intentionally — not a failure worth logging.
    if (err instanceof Error && err.name === 'AbortError') throw err;

    // Re-throw errors already handled above (HttpError thrown after logging).
    if (err instanceof Error && err.message.startsWith('Tablebase API error')) throw err;

    // Network-level failure (no response received).
    const latencyMs = Date.now() - t0;
    recordExplorerFailure({
      endpointClass: 'tablebase',
      httpStatus,
      latencyMs,
      errorName: err instanceof Error ? err.name : 'UnknownError',
    });

    throw err;
  }
}







const _cache = new Map<string, OpeningData>();
let _loading = false;
let _error: string | null = null;
let _enabled = false;
let _data: OpeningData | null = null;
let _abortCtrl: AbortController | null = null;

export function explorerEnabled(): boolean { return _enabled; }
export function explorerLoading(): boolean { return _loading; }
export function explorerError(): string | null { return _error; }
export function explorerData(): OpeningData | null { return _data; }

export function toggleExplorer(): void {
  _enabled = !_enabled;
  if (!_enabled) {
    _abortCtrl?.abort();
    _abortCtrl = null;
    _data = null;
    _loading = false;
    _error = null;
  }
}






export async function fetchExplorer(fen: string, redraw: () => void): Promise<void> {
  if (!_enabled) return;

  const cached = _cache.get(fen);
  if (cached) {
    _data = cached;
    _loading = false;
    _error = null;
    redraw();
    return;
  }

  _abortCtrl?.abort();
  _abortCtrl = new AbortController();
  _loading = true;
  _error = null;
  redraw();

  const merged: Partial<OpeningData> = {};
  try {
    await openingFetch(
      {
        db: 'lichess',
        fen,
        speeds: ['blitz', 'rapid', 'classical'],
        ratings: [1600, 1800, 2000, 2200, 2500],
        topGames: false,
        recentGames: false,
      },
      chunk => {
        Object.assign(merged, chunk);
        if ('moves' in merged) {
          const data = merged as OpeningData;
          _cache.set(fen, data);
          _data = data;
          _loading = false;
          _error = null;
          redraw();
        }
      },
      _abortCtrl.signal,
    );
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    _loading = false;
    _error = err instanceof Error ? err.message : 'Explorer fetch failed.';
    _data = null;
    redraw();
  }
}
