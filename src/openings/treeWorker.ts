



















































import { OpeningTreeBuilder } from './tree';
import type { ResearchGame } from './types';

/** A serialized edge (move) out of a position in the compact index. */
export interface OpeningTreeWorkerEdge {
  san: string;
  uci: string;
  targetPosKey: string;
  total: number;
  white: number;
  draws: number;
  black: number;
  avgRating: number;
  lastPlayed: string;
}

/** A serialized position node in the compact index. */
export interface OpeningTreeWorkerPosition {
  fen: string;
  posKey: string;
  total: number;
  white: number;
  draws: number;
  black: number;
  parentCount: number;
  /** Edges sorted by frequency (most common first) — matches builder freeze order. */
  edges: OpeningTreeWorkerEdge[];
}

/**
 * Compact, structured-clone-safe position index — the Worker's result payload.
 * Encodes every position's aggregate result counts and its outgoing edges
 * (with target position keys), which is sufficient to reconstruct root totals,
 * per-edge results, position keys, and visible paths on the main thread.
 */
export interface OpeningTreeWorkerIndex {
  rootPosKey: string;
  positions: OpeningTreeWorkerPosition[];
}

// --- Inbound (main → worker) messages ---------------------------------------

export interface OpeningTreeWorkerStartMessage {
  type: 'start';
  buildGeneration: number;
  accountSourceId: string;
}

export interface OpeningTreeWorkerBatchMessage {
  type: 'batch';
  buildGeneration: number;
  accountSourceId: string;
  games: ResearchGame[];
}

export interface OpeningTreeWorkerFinishMessage {
  type: 'finish';
  buildGeneration: number;
  accountSourceId: string;
}

export interface OpeningTreeWorkerCancelMessage {
  type: 'cancel';
  buildGeneration: number;
  accountSourceId: string;
}

export type OpeningTreeWorkerInbound =
  | OpeningTreeWorkerStartMessage
  | OpeningTreeWorkerBatchMessage
  | OpeningTreeWorkerFinishMessage
  | OpeningTreeWorkerCancelMessage;

// --- Outbound (worker → main) messages --------------------------------------

export interface OpeningTreeWorkerProgressMessage {
  type: 'progress';
  buildGeneration: number;
  accountSourceId: string;
  processedGames: number;
  positionsCount: number;
}

export interface OpeningTreeWorkerResultMessage {
  type: 'result';
  buildGeneration: number;
  accountSourceId: string;
  processedGames: number;
  index: OpeningTreeWorkerIndex;
}

export interface OpeningTreeWorkerErrorMessage {
  type: 'error';
  buildGeneration: number;
  accountSourceId: string;
  message: string;
}

export type OpeningTreeWorkerOutbound =
  | OpeningTreeWorkerProgressMessage
  | OpeningTreeWorkerResultMessage
  | OpeningTreeWorkerErrorMessage;

/**
 * Serialize a builder's aggregated state into the compact, clone-safe index.
 *
 * Pure over the builder's public `positions`/`root`. Edges are sorted by total
 * (descending) and `avgRating` is rounded exactly as `freeze()` does, so the
 * index preserves the same edge ordering / visible paths a full freeze would.
 */
export function serializeOpeningTreeIndex(builder: OpeningTreeBuilder): OpeningTreeWorkerIndex {
  const positions: OpeningTreeWorkerPosition[] = [];
  for (const position of builder.positions.values()) {
    const edges: OpeningTreeWorkerEdge[] = [...position.edges.values()]
      .sort((a, b) => b.results.total - a.results.total)
      .map(edge => ({
        san: edge.san,
        uci: edge.uci,
        targetPosKey: edge.targetPosKey,
        total: edge.results.total,
        white: edge.results.white,
        draws: edge.results.draws,
        black: edge.results.black,
        avgRating: edge.ratingCount > 0 ? Math.round(edge.ratingSum / edge.ratingCount) : 0,
        lastPlayed: edge.lastPlayed,
      }));
    positions.push({
      fen: position.fen,
      posKey: position.posKey,
      total: position.results.total,
      white: position.results.white,
      draws: position.results.draws,
      black: position.results.black,
      parentCount: position.parentCount,
      edges,
    });
  }
  return { rootPosKey: builder.root.posKey, positions };
}

/** Live aggregation session state for a single build generation. */
interface WorkerSession {
  buildGeneration: number;
  accountSourceId: string;
  builder: OpeningTreeBuilder;
  processedGames: number;
  cancelled: boolean;
}

/**
 * Stateful message handler, isolated from the Worker global so it can be driven
 * directly by parity/cancellation harnesses. Returns a `dispatch` closure over
 * a caller-supplied `post` sink and the single-session state.
 *
 * Generation binding is strict: `batch`/`finish` for a generation/source that
 * no longer matches the active session are stale-dropped. A `cancel` for the
 * active generation, or any newer `start` (which replaces the session), makes
 * completion output for the superseded generation impossible.
 */
export function createOpeningTreeWorkerHandler(
  post: (message: OpeningTreeWorkerOutbound) => void,
): (message: OpeningTreeWorkerInbound) => void {
  let session: WorkerSession | null = null;

  const matchesActive = (message: { buildGeneration: number; accountSourceId: string }): boolean =>
    session !== null
    && !session.cancelled
    && session.buildGeneration === message.buildGeneration
    && session.accountSourceId === message.accountSourceId;

  return function dispatch(message: OpeningTreeWorkerInbound): void {
    switch (message.type) {
      case 'start': {
        // A newer start supersedes any in-flight session: the previous
        // generation can no longer emit completion output (its finish will
        // fail the active-session match below).
        session = {
          buildGeneration: message.buildGeneration,
          accountSourceId: message.accountSourceId,
          builder: new OpeningTreeBuilder(),
          processedGames: 0,
          cancelled: false,
        };
        return;
      }
      case 'batch': {
        if (!matchesActive(message)) return; // stale / cancelled generation — drop
        const active = session!;
        try {
          active.builder.addGames(message.games);
          active.processedGames += message.games.length;
          post({
            type: 'progress',
            buildGeneration: active.buildGeneration,
            accountSourceId: active.accountSourceId,
            processedGames: active.processedGames,
            positionsCount: active.builder.positions.size,
          });
        } catch (error) {
          post({
            type: 'error',
            buildGeneration: active.buildGeneration,
            accountSourceId: active.accountSourceId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
      case 'finish': {
        if (!matchesActive(message)) return; // cancelled or superseded — no completion output
        const active = session!;
        post({
          type: 'result',
          buildGeneration: active.buildGeneration,
          accountSourceId: active.accountSourceId,
          processedGames: active.processedGames,
          index: serializeOpeningTreeIndex(active.builder),
        });
        return;
      }
      case 'cancel': {
        // Only the active generation may be cancelled; a cancel for an already
        // superseded generation is a no-op (that generation is already dead).
        if (
          session !== null
          && session.buildGeneration === message.buildGeneration
          && session.accountSourceId === message.accountSourceId
        ) {
          session.cancelled = true;
        }
        return;
      }
    }
  };
}

/**
 * Detect a real dedicated-worker global scope. `importScripts` exists only in a
 * Worker; it is absent both on the browser main-thread window and in Node (where
 * the parity harness imports this module), so the runtime bootstrap below stays
 * inert outside an actual Worker.
 */
function isDedicatedWorkerScope(): boolean {
  return (
    typeof self !== 'undefined'
    && typeof (self as unknown as { importScripts?: unknown }).importScripts === 'function'
  );
}

if (isDedicatedWorkerScope()) {
  const dispatch = createOpeningTreeWorkerHandler(message => self.postMessage(message));
  self.onmessage = (event: MessageEvent<OpeningTreeWorkerInbound>) => {
    dispatch(event.data);
  };
}
