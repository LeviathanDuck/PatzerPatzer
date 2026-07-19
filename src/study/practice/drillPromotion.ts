




















import { parseUci } from 'chessops/util';
import { parseFen, makeFen, INITIAL_FEN } from 'chessops/fen';
import { Chess } from 'chessops/chess';
import type { Position } from 'chessops/chess';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import {
  parsePgn, makePgn, startingPosition, ChildNode, Node as PgnNode, defaultHeaders,
  type Game, type PgnNodeData,
} from 'chessops/pgn';
import type { EngineDrillRecord } from '../types';
import type { StudyItem } from '../types';
import type { BranchRole } from './material';
import type { StudyPracticeDecisionRow } from '../studyDb';
import { pgnToTree } from '../../tree/pgn';
import { extractLessonModel } from './lessonExtract';
import { decisionRowOf } from './lessonPersistence';

// --- Selections and destinations --------------------------------------------

/** Indexes address the CHAINED played line (see `chainDrillLine`), not raw record move indexes. */
export type PromotionSelection =
  | { readonly kind: 'complete-drill' }
  | { readonly kind: 'move-range'; readonly fromIndex: number; readonly toIndex: number }
  | { readonly kind: 'continuation'; readonly fromIndex: number };

export type PromotionDestination =
  | { readonly kind: 'new-study-item'; readonly title: string; readonly folderId?: string }
  | { readonly kind: 'variation'; readonly studyItemId: string };

export type PromotionFailureReason =
  | 'empty-line'
  | 'unchainable-record'
  | 'invalid-range'
  /** the private implementation record (Sol B10): the contract sanctions exactly three pairings — complete drill/move
   *  range → NEW chapter; continuation → variation at a matched node. Anything else refuses. */
  | 'unsanctioned-pairing'
  | 'missing-study'
  | 'study-parse-failed'
  | 'unmatched-node'
  | 'duplicate-study-id'
  | 'write-failed';

export interface ChainedMove {
  readonly uci: string;
  readonly san: string;
  readonly fenBefore: string;
  readonly fenAfter: string;
  readonly byLearner: boolean;
}

export interface PromotionPreview {
  readonly startFen: string;
  /** FEN of the position the promoted material begins at (anchor for continuations). */
  readonly anchorFen: string;
  readonly sanLine: readonly string[];
  readonly uciLine: readonly string[];
  readonly moveCount: number;
  /** §13 defaults: full-game material → 'reference-only'; branch material → 'needs-classification'. */
  readonly defaultRole: BranchRole;
  /** ALWAYS 'untrainable' — "Promotion never creates trainability automatically." */
  readonly trainability: 'untrainable';
  readonly destinationDescription: string;
}

export interface DrillPromotionPlan {
  readonly drillId: string;
  readonly selection: PromotionSelection;
  readonly destination: PromotionDestination;
  readonly preview: PromotionPreview;
  /** Complete PGN text for new-study-item destinations. */
  readonly pgn?: string;
  readonly moves: readonly ChainedMove[];


  readonly learnerSide: 'white' | 'black';
}

export type PlanResult =
  | { readonly ok: true; readonly plan: DrillPromotionPlan }
  | { readonly ok: false; readonly reason: PromotionFailureReason; readonly detail?: string };

export type ApplyResult =
  | { readonly ok: true; readonly studyItemId: string }
  | { readonly ok: false; readonly reason: PromotionFailureReason; readonly detail?: string };

export interface PromotionPlanDeps {
  /** Load the destination Study for variation promotion (undefined = missing). */
  loadStudy(studyItemId: string): Promise<StudyItem | undefined>;
}

export interface PromotionApplyDeps extends PromotionPlanDeps {



  createStudyWithRows(
    item: StudyItem,
    rows: readonly StudyPracticeDecisionRow[],
  ): Promise<{ readonly duplicate: boolean }>;
  saveStudy(item: StudyItem): Promise<void>;
  mintId(): string;
  now(): number;
}

// --- Played-line reconstruction ----------------------------------------------

function positionFromFen(fen: string): Position | null {
  const setup = parseFen(fen);
  if (setup.isErr) return null;
  const pos = Chess.fromSetup(setup.value);
  return pos.isErr ? null : pos.value;
}

/**
 * Reconstruct the drill's PLAYED line from the append-only move records: chain forward from
 * `startFen`, at each position consuming the LAST unconsumed record whose `fenBefore` matches —
 * a post-takeback replay is appended later than the move it supersedes, so last-match-wins
 * excludes taken-back dead ends. (Known edge, disclosed: the D13 snapshot does not serialize
 * takeback marks, so a final learner move taken back WITHOUT a replay before the drill ended is
 * indistinguishable from a played final move and stays in the line.) Every step is re-validated
 * with chessops; SANs are recomputed from the replay (reply records may lack `san`).
 */
export function chainDrillLine(record: EngineDrillRecord): ChainedMove[] | null {



  const takenBack = new Set(record.snapshot.takenBackIndices ?? []);
  const all = record.snapshot.moves.filter(m => !(m.byLearner && takenBack.has(m.index)));
  const consumed = new Set<number>();
  const line: ChainedMove[] = [];
  let pos = positionFromFen(record.startFen);
  if (pos === null) return null;
  let currentFen = record.startFen;
  for (let step = 0; step < all.length; step++) {
    let pick = -1;
    for (let i = all.length - 1; i >= 0; i--) {
      if (!consumed.has(i) && all[i]!.fenBefore === currentFen) { pick = i; break; }
    }
    if (pick === -1) break; // line ended
    consumed.add(pick);
    const m = all[pick]!;
    const move = parseUci(m.uci);
    if (!move || !pos.isLegal(move)) return null; // corrupt record — never guess
    const san = makeSanAndPlay(pos, move);
    const fenAfter = makeFen(pos.toSetup());
    line.push({ uci: m.uci, san, fenBefore: currentFen, fenAfter, byLearner: m.byLearner });
    currentFen = fenAfter;
  }
  return line;
}

// --- Planning ----------------------------------------------------------------

/** Position-identity key for node matching: board/turn/castling/en-passant (move counters vary). */
function fenKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

function buildNewChapterPgn(record: EngineDrillRecord, moves: readonly ChainedMove[], anchorFen: string, title: string): string {
  const headers = defaultHeaders();
  headers.set('Event', title);
  headers.set('Site', 'ChessPatzer');
  const learnerIsWhite = record.snapshot.learnerIsWhite;
  const result =
    record.outcome === 'won'  ? (learnerIsWhite ? '1-0' : '0-1') :
    record.outcome === 'lost' ? (learnerIsWhite ? '0-1' : '1-0') :
    record.outcome === 'draw' ? '1/2-1/2' : '*';
  headers.set('Result', result);
  if (fenKey(anchorFen) !== fenKey(INITIAL_FEN)) {
    headers.set('SetUp', '1');
    headers.set('FEN', anchorFen);
  }
  const root = new PgnNode<PgnNodeData>();
  let cursor: PgnNode<PgnNodeData> = root;
  for (const m of moves) {
    const child = new ChildNode<PgnNodeData>({ san: m.san });
    cursor.children.push(child);
    cursor = child;
  }
  return makePgn({ headers, moves: root });
}

function selectionSlice(
  line: readonly ChainedMove[],
  selection: PromotionSelection,
): { readonly moves: readonly ChainedMove[]; readonly anchorFen: string } | null {
  if (line.length === 0) return null;
  switch (selection.kind) {
    case 'complete-drill':
      return { moves: line, anchorFen: line[0]!.fenBefore };
    case 'move-range': {
      const { fromIndex, toIndex } = selection;
      if (!Number.isInteger(fromIndex) || !Number.isInteger(toIndex)
        || fromIndex < 0 || toIndex >= line.length || fromIndex > toIndex) return null;
      const moves = line.slice(fromIndex, toIndex + 1);
      return { moves, anchorFen: moves[0]!.fenBefore };
    }
    case 'continuation': {
      const { fromIndex } = selection;
      if (!Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= line.length) return null;
      const moves = line.slice(fromIndex);
      return { moves, anchorFen: moves[0]!.fenBefore };
    }
  }
}

export async function planDrillPromotion(
  record: EngineDrillRecord,
  selection: PromotionSelection,
  destination: PromotionDestination,
  deps: PromotionPlanDeps,
): Promise<PlanResult> {



  const sanctioned =
    (selection.kind === 'continuation') === (destination.kind === 'variation');
  if (!sanctioned) return { ok: false, reason: 'unsanctioned-pairing' };

  const line = chainDrillLine(record);
  if (line === null) return { ok: false, reason: 'unchainable-record' };
  const slice = selectionSlice(line, selection);
  if (slice === null) {
    return line.length === 0
      ? { ok: false, reason: 'empty-line' }
      : { ok: false, reason: 'invalid-range' };
  }
  if (slice.moves.length === 0) return { ok: false, reason: 'empty-line' };

  // §13 defaults: complete drill / move range are FULL-GAME material → Reference only;
  // a continuation is BRANCH material that might become trainable → Needs classification.
  const defaultRole: BranchRole =
    selection.kind === 'continuation' ? 'needs-classification' : 'reference-only';

  if (destination.kind === 'new-study-item') {
    const title = destination.title.trim();
    if (title.length === 0) return { ok: false, reason: 'invalid-range', detail: 'empty title' };
    const pgn = buildNewChapterPgn(record, slice.moves, slice.anchorFen, title);
    return {
      ok: true,
      plan: {
        drillId: record.drillId, selection, destination,
        preview: {
          startFen: record.startFen,
          anchorFen: slice.anchorFen,
          sanLine: slice.moves.map(m => m.san),
          uciLine: slice.moves.map(m => m.uci),
          moveCount: slice.moves.length,
          defaultRole,
          trainability: 'untrainable',
          destinationDescription: `New Study chapter “${title}”`,
        },
        pgn,
        moves: slice.moves,
        learnerSide: record.snapshot.learnerIsWhite ? 'white' : 'black',
      },
    };
  }

  // Variation at a matched Study node: the anchor position must exist in the destination tree.
  const study = await deps.loadStudy(destination.studyItemId);
  if (study === undefined) return { ok: false, reason: 'missing-study' };
  const located = locateAnchorInStudyPgn(study.pgn, slice.anchorFen);
  if (located === 'parse-failed') return { ok: false, reason: 'study-parse-failed' };
  if (located === 'unmatched') return { ok: false, reason: 'unmatched-node' };
  return {
    ok: true,
    plan: {
      drillId: record.drillId, selection, destination,
      preview: {
        startFen: record.startFen,
        anchorFen: slice.anchorFen,
        sanLine: slice.moves.map(m => m.san),
        uciLine: slice.moves.map(m => m.uci),
        moveCount: slice.moves.length,
        defaultRole,
        trainability: 'untrainable',
        destinationDescription: `Variation in “${study.title}” at the matched position`,
      },
      moves: slice.moves,
      learnerSide: record.snapshot.learnerIsWhite ? 'white' : 'black',
    },
  };
}

// --- Destination-tree walking (chessops node graph; annotations preserved) ----

type Located = { readonly node: PgnNode<PgnNodeData>; readonly pos: Position };

function walkForAnchor(
  game: Game<PgnNodeData>,
  anchorKey: string,
): Located | 'parse-failed' | 'unmatched' {
  const start = startingPosition(game.headers);
  if (start.isErr) return 'parse-failed';
  let found: Located | null = null;
  const visit = (node: PgnNode<PgnNodeData>, pos: Position): void => {
    if (found !== null) return;
    if (fenKey(makeFen(pos.toSetup())) === anchorKey) { found = { node, pos }; return; }
    for (const child of node.children) {
      // Destination trees carry SAN; parseSan validates against the exact position.
      const move = parseSan(pos, child.data.san);
      if (move === undefined) continue; // unreadable branch — skip, never guess
      const next = pos.clone();
      next.play(move);
      visit(child, next);
      if (found !== null) return;
    }
  };
  visit(game.moves, start.value);
  return found ?? 'unmatched';
}

function locateAnchorInStudyPgn(pgn: string, anchorFen: string): 'ok' | 'parse-failed' | 'unmatched' {
  const games = parsePgn(pgn);
  const game = games[0];
  if (game === undefined) return 'parse-failed';
  const located = walkForAnchor(game, fenKey(anchorFen));
  if (located === 'parse-failed') return 'parse-failed';
  if (located === 'unmatched') return 'unmatched';
  return 'ok';
}

// --- Apply -------------------------------------------------------------------

export async function applyDrillPromotion(
  plan: DrillPromotionPlan,
  deps: PromotionApplyDeps,
): Promise<ApplyResult> {
  if (plan.destination.kind === 'new-study-item') {
    if (plan.pgn === undefined) return { ok: false, reason: 'write-failed', detail: 'plan missing pgn' };
    const now = deps.now();
    const item: StudyItem = {
      id: deps.mintId(),
      pgn: plan.pgn,
      title: plan.destination.title.trim(),
      source: 'manual',
      tags: ['drill-promoted'],
      folders: plan.destination.folderId !== undefined ? [plan.destination.folderId] : [],
      ...(plan.destination.folderId !== undefined ? { homeFolderId: plan.destination.folderId } : {}),
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };




    let rows: StudyPracticeDecisionRow[];
    try {
      const root = pgnToTree(plan.pgn);
      const model = extractLessonModel({
        root, lessonId: item.id, learnerSide: plan.learnerSide, sourceKind: 'pgn',
        content: new Map(), mintId: deps.mintId,
      });
      rows = model.decisions.map(decision => ({
        ...decisionRowOf(decision, { status: 'promoted', now: deps.now() }),
        role: plan.preview.defaultRole,
        trainability: 'untrainable',
      }));
    } catch (e) {
      return { ok: false, reason: 'write-failed', detail: `classification derivation failed: ${String(e)}` };
    }
    try {
      const created = await deps.createStudyWithRows(item, rows);
      if (created.duplicate) return { ok: false, reason: 'duplicate-study-id' };
    } catch (e) {
      return { ok: false, reason: 'write-failed', detail: String(e) };
    }
    return { ok: true, studyItemId: item.id };
  }

  const study = await deps.loadStudy(plan.destination.studyItemId);
  if (study === undefined) return { ok: false, reason: 'missing-study' };
  const games = parsePgn(study.pgn);
  const game = games[0];
  if (game === undefined) return { ok: false, reason: 'study-parse-failed' };
  const located = walkForAnchor(game, fenKey(plan.preview.anchorFen));
  if (located === 'parse-failed') return { ok: false, reason: 'study-parse-failed' };
  if (located === 'unmatched') return { ok: false, reason: 'unmatched-node' };

  // Append the continuation at the matched node, descending through moves that already exist
  // (same SAN child) so promotion never duplicates an existing branch prefix.
  let cursor: PgnNode<PgnNodeData> = located.node;
  const pos = located.pos.clone();
  for (const m of plan.moves) {
    const move = parseUci(m.uci);
    if (!move || !pos.isLegal(move)) return { ok: false, reason: 'unchainable-record' };
    const san = makeSanAndPlay(pos, move);
    const existing = cursor.children.find(c => c.data.san === san);
    if (existing !== undefined) {
      cursor = existing;
      continue;
    }
    const child = new ChildNode<PgnNodeData>({ san });
    cursor.children.push(child);
    cursor = child;
  }

  const updated: StudyItem = { ...study, pgn: makePgn(game), updatedAt: deps.now() };
  try {
    await deps.saveStudy(updated);
  } catch (e) {
    return { ok: false, reason: 'write-failed', detail: String(e) };
  }
  return { ok: true, studyItemId: study.id };
}
