











import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { makeFen, parseFen } from 'chessops/fen';
import { chessgroundDests } from 'chessops/compat';
import { Chess } from 'chessops/chess';
import { parseUci, roleToChar } from 'chessops/util';
import type { Move, Role } from 'chessops';
import { makeSan } from 'chessops/san';
import { scalachessCharPair } from 'chessops/compat';
import { parsePgn } from 'chessops/pgn';
import type { VNode } from 'snabbdom';
import type { TreeNode, TreePath } from '../tree/types';
import { nodeAtPath, mainlineNodeList, nodeListAt, addNode, deleteNodeAt, pathInit } from '../tree/ops';
import { pgnToTree } from '../tree/pgn';
import { listPuzzleDefinitions, listPuzzleDefinitionsBySource, countPuzzleDefinitionsBySource, getPuzzleDefinition, savePuzzleDefinition, saveAttempt, getAttempts, getAllAttemptsByPuzzle, getMeta, saveMeta, getUserPuzzlePerf, saveUserPuzzlePerf, getPuzzleRatedEligibility, appendRatingHistory, syncRatedLadder, findRatedPuzzleInShards } from './puzzleDb';
import { bindBoardResizeHandle } from '../board/index';
import { PromotionCtrl } from '../board/promotion';
import { playMoveSound } from '../board/sound';
import { loadManifest, loadFilteredShard, findMatchingShards, getManifestThemes, getManifestOpenings, getManifestTotalCount, type PuzzleManifest, type ShardMeta } from './shardLoader';
import { lichessShardRecordToDefinition, type LichessShardRecord } from './adapters';
import type { PuzzleDefinition, PuzzleAttempt, SolveResult, FailureReason, PuzzleSourceKind, PuzzleMoveQuality, PuzzleUserMeta, PuzzleSessionMode, UserPuzzlePerf, RatedEligibility, NonRatedReason, PuzzleDifficulty, PuzzleRatingDelta, RatedScoringOutcome, ImportedLichessPuzzleDefinition, PuzzleRatingSnapshot, PuzzleFailSeverity, PuzzleAssistanceType } from './types';
import { DEFAULT_USER_PUZZLE_PERF, PUZZLE_DIFFICULTY_OFFSETS, DEFAULT_PUZZLE_DIFFICULTY, PUZZLE_GLICKO_CAPS } from './types';
import {
  protocol as engineProtocol,
  engineEnabled as sharedEngineEnabled,
  engineReady as sharedEngineReady,
  clearEvalPositionOverride,
  evalCurrentPosition,
  setEngineEnabledFlag,
  setEvalPositionOverride,
  toggleEngine,
  visibleEvalForFen,
  type PositionEval,
} from '../engine/ctrl';
import { evalWinChances, LOSS_THRESHOLDS } from '../engine/winchances';
import { contextFromNodeList, type EnginePositionContext } from '../engine/positionContext';
import { onBoardAnimationChange, puzzleBoardAnimationConfig } from '../board/animation';
import { record, Severity } from '../diagnostics';
import { replaceHashRoute, writeHashRoute } from '../router';
import {
  defaultPuzzleRouteState,
  parsePuzzleRouteState,
  serializePuzzleRouteState,
  type PuzzleRouteSortToken,
  type PuzzleRouteState,
} from './routeState';

// Alt-castle mappings — Lichess puzzles store castling as king-to-rook-square
// but chessground may emit king-to-destination. Both forms must be accepted.
// Adapted from lichess-org/lila: ui/puzzle/src/moveTest.ts
const altCastles: Record<string, string> = {
  e1a1: 'e1c1',
  e1h1: 'e1g1',
  e8a8: 'e8c8',
  e8h8: 'e8g8',
};

/**
 * Check if two UCI strings match, accounting for alternate castle notations.
 */
function uciMatches(played: string, expected: string): boolean {
  if (played === expected) return true;
  // Check both directions of alt-castle mapping
  if (altCastles[played] === expected) return true;
  if (altCastles[expected] === played) return true;
  return false;
}

/**
 * Replay a sequence of UCI moves from a FEN to obtain the resulting position.
 * Returns the Chess position after all moves, or undefined on error.
 */
/** Get SAN for a UCI move at a given position. Returns UCI as fallback. */
function uciToSanAtPos(pos: Chess, uci: string): string {
  const move = parseUci(uci);
  if (!move) return uci;
  try { return makeSan(pos, move); } catch { return uci; }
}

/**
 * True when `move` advances a pawn to the back rank WITHOUT a promotion role.
 * Playing such a move via chessops leaves a PAWN on the 8th/1st rank (an illegal
 * position) instead of promoting — the source of the puzzle tree corruption
 * (BUG-2026-07-10-025, empirically reproduced). Every raw-play site guards against it so
 * only suffixed promotion UCIs (produced by the promotion chooser) ever enter a position.
 * This is a targeted promotion-path guard, NOT a general isLegal() gate (arbitrary
 * malformed-definition hardening is explicitly out of this lane's scope).
 */
function isUnsuffixedBackRankPawnMove(pos: Chess, move: Move): boolean {
  if (!('from' in move)) return false; // drops never occur in standard puzzle play
  if (move.promotion) return false;
  if (pos.board.get(move.from)?.role !== 'pawn') return false;
  const destRank = move.to >> 3; // 0-based rank; 7 = 8th rank, 0 = 1st rank
  return destRank === 7 || destRank === 0;
}

function positionAfterMoves(fen: string, uciMoves: string[]): Chess | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  const chess = pos.value;
  for (const uci of uciMoves) {
    const move = parseUci(uci);
    if (!move) return undefined;
    // Never raw-play an unsuffixed back-rank pawn move — it corrupts the position.
    if (isUnsuffixedBackRankPawnMove(chess, move)) return undefined;
    chess.play(move);
  }
  return chess;
}

export type PuzzleView = 'library' | 'round';

export interface PuzzlePageState {
  view: PuzzleView;
  puzzleId?: string;
}

// ---------------------------------------------------------------------------
// Puzzle list browsing state
// Supports filtered, paginated browsing of puzzles by source kind.
// ---------------------------------------------------------------------------

export interface PuzzleListFilters {
  ratingMin?: number;
  ratingMax?: number;
  theme?: string;
  opening?: string;
}

export interface PuzzleListState {
  source: PuzzleSourceKind;
  /** All puzzles matching the source (before client-side filters). */
  allForSource: PuzzleDefinition[];
  /** Puzzles after applying filters. */
  filtered: PuzzleDefinition[];
  /** Currently visible page of puzzles. */
  visible: PuzzleDefinition[];
  filters: PuzzleListFilters;
  sort: PuzzleRouteSortToken;
  page: number;
  pageSize: number;
  /** All unique themes found in the source pool (for the theme dropdown). */
  availableThemes: string[];
  /** All unique openings found in the source pool. */
  availableOpenings: string[];
  loading: boolean;
}

export interface LibraryCounts {
  imported: number;
  user: number;
}

export interface PuzzleRoundState {
  definition: PuzzleDefinition | null;
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

export type PuzzleRoundRouteValidationFailure =
  | 'empty'
  | 'too-long'
  | 'malformed'
  | 'payload-like';

export interface PuzzleRoundRouteValidationResult {
  valid: boolean;
  id: string | null;
  reason?: PuzzleRoundRouteValidationFailure;
}

type PuzzleSetClass =
  | 'round-idb'
  | 'library-counts'
  | 'user-library'
  | 'imported-lichess'
  | 'imported-session'
  | 'rated-stream'
  | 'next-puzzle'
  | 'retry-session'
  | 'due-session';

function classifyPuzzleError(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function recordPuzzleLoadFail(error: unknown, setClass: PuzzleSetClass): void {
  record({
    kind: 'error',
    severity: Severity.Error,
    source: 'puzzles/ctrl',
    sourceTag: 'puzzle-load-fail',
    message: 'puzzle-load-fail',
    metadata: {
      errorClass: classifyPuzzleError(error),
      setClass,
    },
    redactionClass: 'safe',
  });
}

function recordPuzzleSetEmpty(setClass: PuzzleSetClass): void {
  record({
    kind: 'render',
    severity: Severity.Warn,
    source: 'puzzles/ctrl',
    sourceTag: 'puzzle-set-empty',
    message: 'puzzle-set-empty',
    metadata: { setClass },
    redactionClass: 'safe',
  });
}

function recordPuzzleInvalidStateTransition(
  fromState: string,
  toState: string,
  action: string,
): void {
  record({
    kind: 'render',
    severity: Severity.Warn,
    source: 'puzzles/ctrl',
    sourceTag: 'puzzle-invalid-state-transition',
    message: 'puzzle-invalid-state-transition',
    metadata: {
      fromState,
      toState,
      action,
    },
    redactionClass: 'safe',
  });
}

function isValidRoundStatusTransition(from: RoundStatus, to: RoundStatus): boolean {
  if (from === to) return true;
  if (from === 'playing') return to === 'solved' || to === 'failed' || to === 'viewing';
  if (from === 'viewing') return to === 'playing';
  return false;
}


















export type RoundStatus = 'playing' | 'solved' | 'failed' | 'viewing';
export type RoundFeedback = 'none' | 'good' | 'fail';
/** Lichess-style puzzle mode: 'play' = first attempt, 'try' = retrying after wrong move, 'view' = post-solve. */
export type PuzzleMode = 'play' | 'try' | 'view';

/**
 * Build the initial puzzle tree from startFen + triggerMove.
 * The tree starts with just the root and trigger — solution moves
 * are appended incrementally as the user plays them correctly.
 * This prevents future solution moves from leaking into the DOM.
 */
function buildInitialPuzzleTree(
  def: PuzzleDefinition,
): { root: TreeNode; path: TreePath; node: TreeNode } {
  // Determine starting ply from FEN
  const fenParts = def.startFen.split(' ');
  const fullMove = parseInt(fenParts[5] ?? '1', 10);
  const isBlack = fenParts[1] === 'b';
  const startPly = (fullMove - 1) * 2 + (isBlack ? 1 : 0);

  // Root node at startFen
  const root: TreeNode = {
    id: '',
    ply: startPly,
    fen: def.startFen,
    children: [],
  };

  let currentNode = root;
  let currentPath: TreePath = '';

  // Add trigger move as first child if present
  if (def.triggerMove) {
    const triggerNode = makeTreeNode(def.startFen, def.triggerMove, startPly + 1);
    if (triggerNode) {
      root.children.push(triggerNode);
      currentNode = triggerNode;
      currentPath = triggerNode.id;
    }
  }

  return { root, path: currentPath, node: currentNode };
}

/**
 * Create a TreeNode for a UCI move from a given FEN.
 * Returns undefined if the move or FEN is invalid.
 */
function makeTreeNode(fen: string, uci: string, ply: number): TreeNode | undefined {
  const setup = parseFen(fen);
  if (setup.isErr) return undefined;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return undefined;
  const move = parseUci(uci);
  if (!move) return undefined;
  // Never build a tree node from an unsuffixed back-rank pawn move — playing it leaves a
  // pawn on the 8th/1st rank (illegal). Only suffixed promotion UCIs may reach here.
  if (isUnsuffixedBackRankPawnMove(pos.value, move)) return undefined;
  const san = makeSan(pos.value, move);
  const id = scalachessCharPair(move);
  pos.value.play(move);
  const newFen = makeFen(pos.value.toSetup());
  return { id, ply, uci, san, fen: newFen, children: [] };
}

/**
 * Append the next solution move pair (user move + opponent reply) to the puzzle tree.
 * Called after the user plays a correct move and the opponent replies.
 */
function appendSolutionMoveToTree(rc: PuzzleRoundCtrl, uci: string): void {
  // Find the FEN at the current tree leaf
  const parentNode = rc.treeNode;
  const newPly = parentNode.ply + 1;
  const newNode = makeTreeNode(parentNode.fen, uci, newPly);
  if (!newNode) return;
  addNode(rc.treeRoot, rc.treePath, newNode);
  rc.treePath = rc.treePath + newNode.id;
  rc.livePath = rc.treePath;
  rc.treeNode = newNode;
  rc.treeMainline = mainlineNodeList(rc.treeRoot);
}

/**
 * After solve/fail, add all remaining solution moves to the tree
 * so the user can see and navigate the full solution.
 */
function completeSolutionTree(rc: PuzzleRoundCtrl): void {
  // Find where we are in the solution line relative to the tree
  // The tree has: root -> trigger? -> solution[0..progressPly-1]
  // We need to add solution[progressPly..end]
  for (let i = rc.progressPly; i < rc.solutionLine.length; i++) {
    appendSolutionMoveToTree(rc, rc.solutionLine[i]!);
  }
}










let _puzzleRoundTokenCounter = 0;

export class PuzzleRoundCtrl {
  readonly definition: PuzzleDefinition;
  readonly solutionLine: string[];
  /** Unique monotonic token for this round lifetime (see _puzzleRoundTokenCounter). */
  readonly roundToken: number;
  status: RoundStatus;
  /** How many solution moves the user has correctly played (0-based). */
  progressPly: number;
  readonly startedAt: number;
  /** Transient per-move feedback — reset before each user move. */
  feedback: RoundFeedback;
  failureReasons: FailureReason[];
  usedHint: boolean;
  usedEngineReveal: boolean;
  revealedSolution: boolean;
  /** Ply (within solutionLine) where the first wrong move occurred, if any. */
  firstWrongPly: number | undefined;
  /** Whether an attempt record has already been persisted for this round. */
  private attemptRecorded: boolean;
  /** The color the solver plays. */
  pov: 'white' | 'black';
  /** Lichess-style mode: 'play' on first attempt, 'try' after wrong move, 'view' after solve/fail+give up. */
  mode: PuzzleMode;
  /** Whether "View Solution" should be available. */
  canViewSolution: boolean;
  private readonly redraw: () => void;

  // --- Puzzle engine assist layer ---
  // Engine eval is for VIEWING after a solve attempt completes, NOT for
  // determining correctness. The submitUserMove path never consults this.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts ceval integration
  /** Whether the post-solve engine assist is currently active for this round. */
  puzzleEngineEnabled: boolean;

  /**
   * Session mode for this round. Copied from the module-level _currentSessionMode
   * at construction time. Immutable after construction — switch-to-casual changes
   * this field on the active round to downgrade it.
   */
  currentSessionMode: PuzzleSessionMode;






  /**
   * Whether the rated assistance warning modal is currently visible.
   * Set to true when the user triggers a restricted tool in a rated round.
   */
  showAssistanceWarning: boolean;

  /**
   * The tool action that triggered the warning. Used by the modal to label
   * what tool was requested so the user can confirm or cancel.
   */
  pendingAssistanceAction: FailureReason | null;

  /**
   * The captured tool action to run when the user resolves the warning modal.
   * Decision 4 continuation contract: executed EXACTLY once on a verdict
   * (switch-to-practice or stay-rated), never on cancel. Null when idle.
   */
  private pendingAssistanceExec: (() => void) | null = null;






  private pendingAssistanceToken: number | null = null;







  private opponentReplyOwed = false;

  /**
   * Whether the user has checked "remember my choice" in the warning modal.
   * Scope: current puzzle-solving session only. Reset when this round controller
   * is replaced (new puzzle loaded). Never persisted.
   */
  rememberAssistanceChoice: boolean;

  /**
   * The remembered choice from a prior warning in this session.
   * null = no remembered choice.
   * 'switch-to-casual' = user previously chose to switch for this puzzle session.
   * 'stay-rated' = user previously chose to stay rated (accept immediate-fail).
   * Scope: current puzzle-solving session only.
   */
  rememberedAssistanceChoice: 'switch-to-casual' | 'stay-rated' | null;

  /**
   * Engine-based quality assessments for each user move played during the round.
   * Populated by evaluateMove() after each submitUserMove, regardless of correctness.
   * This is data collection only — the UI rendering layer reads this for contextual feedback.
   */
  moveQualities: PuzzleMoveQuality[];

  /** Full game PGN fetched from Lichess API (available post-fetch, undefined until loaded). */
  gamePgn: string | undefined;
  /** Full game tree parsed from gamePgn. Null until PGN loads and is parsed. */
  gameTree: TreeNode | null;
  /** Path within gameTree to the puzzle start position. */
  gameTreePuzzlePath: TreePath | null;
  /** Whether analysis mode is active (full game tree + free navigation). */
  analysisMode: boolean;
  /** Saved puzzle tree root — restored when leaving analysis mode. */
  private puzzleTreeRoot: TreeNode;
  /** Saved puzzle tree path — restored when leaving analysis mode. */
  private puzzleTreePath: TreePath;
  /** The tree path at the actual live play position (not a browsed position). Updated as moves are confirmed. */
  livePath: TreePath;
  /** Path within gameTree being previewed read-only. Null when not in context-peek mode. */
  contextPeekPath: TreePath | null;

  // --- Move tree ---
  // Full tree structure for analysis-board-style move list and navigation.
  // Built incrementally during play (nodes added as moves are confirmed).
  // Post-solve, the full solution line is in the tree and variations can be added.
  treeRoot: TreeNode;
  treePath: TreePath;
  treeNode: TreeNode;
  treeMainline: TreeNode[];

  // --- Lazy-parsed PGN header cache ---
  private _pgnHeaders: { white: string; black: string; result: string } | null | undefined = undefined;

  /**
   * PGN headers (White, Black, Result) lazily parsed from gamePgn.
   * Returns null when gamePgn is unavailable or unparseable.
   */
  get pgnHeaders(): { white: string; black: string; result: string } | null {
    if (this._pgnHeaders !== undefined) return this._pgnHeaders;
    if (!this.gamePgn) { this._pgnHeaders = null; return null; }
    try {
      const game = parsePgn(this.gamePgn)[0];
      if (!game) { this._pgnHeaders = null; return null; }
      this._pgnHeaders = {
        white: game.headers.get('White') ?? '',
        black: game.headers.get('Black') ?? '',
        result: game.headers.get('Result') ?? '*',
      };
      return this._pgnHeaders;
    } catch {
      this._pgnHeaders = null;
      return null;
    }
  }

  /**
   * Clock times (in centiseconds) at the puzzle start position, from the game tree.
   * Walks the game tree mainline from root to the puzzle position and finds
   * the most recent clock for each color — same logic as getClocksAtPath on
   * the analysis board.
   */
  get puzzleClocks(): { white: number | undefined; black: number | undefined } {
    if (!this.gameTree) return { white: undefined, black: undefined };
    const targetPath = this.gameTreePuzzlePath ?? '';
    const nodes = nodeListAt(this.gameTree, targetPath);
    let white: number | undefined;
    let black: number | undefined;
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      if (!n || n.clock === undefined) continue;
      if (n.ply % 2 === 1 && white === undefined) white = n.clock;
      if (n.ply % 2 === 0 && n.ply > 0 && black === undefined) black = n.clock;
      if (white !== undefined && black !== undefined) break;
    }
    return { white, black };
  }

  constructor(definition: PuzzleDefinition, redraw: () => void) {
    this.roundToken = ++_puzzleRoundTokenCounter;
    this.definition = definition;
    this.solutionLine = definition.solutionLine;
    this.status = 'playing';
    this.progressPly = 0;
    this.startedAt = Date.now();
    this.feedback = 'none';
    this.failureReasons = [];
    this.usedHint = false;
    this.usedEngineReveal = false;
    this.revealedSolution = false;
    this.firstWrongPly = undefined;
    this.attemptRecorded = false;
    this.redraw = redraw;
    this.puzzleEngineEnabled = false;
    // Copy the module-level session mode at round construction time.
    // Imported-lichess puzzles honour the mode; user-library puzzles are
    // always practice regardless (enforced at completion, not here).
    this.currentSessionMode = _currentSessionMode;
    this.showAssistanceWarning = false;
    this.pendingAssistanceAction = null;
    this.rememberAssistanceChoice = false;
    this.rememberedAssistanceChoice = null;
    this.moveQualities = [];
    this.mode = 'play';
    this.canViewSolution = false;
    this.gamePgn = undefined;
    this.gameTree = null;
    this.gameTreePuzzlePath = null;
    this.analysisMode = false;

    // Determine solver's color.
    // Imported Lichess puzzles include a trigger move, so startFen is the
    // pre-trigger position and the solver is opposite the side to move.
    // User-library puzzles start directly from the solver-to-move position,
    // so the solver matches the side to move when no trigger exists.
    const setup = parseFen(definition.startFen);
    this.pov = setup.isOk
      ? definition.triggerMove
        ? (setup.value.turn === 'white' ? 'black' : 'white')
        : setup.value.turn
      : 'white'; // fallback

    // Build initial tree: root node at startFen, plus trigger move if present.
    // Solution moves are added incrementally as the user plays correctly.
    const { root, path, node } = buildInitialPuzzleTree(definition);
    this.treeRoot = root;
    this.treePath = path;
    this.treeNode = node;
    this.treeMainline = mainlineNodeList(root);
    this.puzzleTreeRoot = root;
    this.puzzleTreePath = path;
    this.livePath = path;
    this.contextPeekPath = null;
  }

  private setRoundStatus(nextStatus: RoundStatus, action: string): void {
    if (!isValidRoundStatusTransition(this.status, nextStatus)) {
      recordPuzzleInvalidStateTransition(
        `round:${this.status}`,
        `round:${nextStatus}`,
        action,
      );
    }
    this.status = nextStatus;
  }

  private setPuzzleMode(nextMode: PuzzleMode, action: string): void {
    const valid =
      this.mode === nextMode
      || (this.mode === 'play' && (nextMode === 'try' || nextMode === 'view'))
      || (this.mode === 'try' && nextMode === 'view')
      || (this.mode === 'view' && nextMode === 'play');
    if (!valid) {
      recordPuzzleInvalidStateTransition(
        `mode:${this.mode}`,
        `mode:${nextMode}`,
        action,
      );
    }
    this.mode = nextMode;
  }

  /**
   * Returns the next expected user move from the solution line,
   * or undefined if the puzzle is complete or out of bounds.
   */
  /** All moves from startFen to reach the current position (trigger + solution moves played). */
  private allMovesPlayed(): string[] {
    const moves: string[] = [];
    if (this.definition.triggerMove) moves.push(this.definition.triggerMove);
    moves.push(...this.solutionLine.slice(0, this.progressPly));
    return moves;
  }

  /**
   * Parse the full game PGN into a tree and find the puzzle start position.
   * Switches to the game tree when analysis mode is activated.
   */
  loadGameTree(): boolean {
    if (!this.gamePgn) return false;
    try {
      this.gameTree = pgnToTree(this.gamePgn);
      // Find the puzzle start position by walking the mainline and matching FEN
      // We match by comparing the position part of FEN (ignore halfmove/fullmove counters)
      const puzzleFenParts = this.definition.startFen.split(' ').slice(0, 4).join(' ');
      const mainline = mainlineNodeList(this.gameTree);
      for (let i = 0; i < mainline.length; i++) {
        const nodeFenParts = mainline[i]!.fen.split(' ').slice(0, 4).join(' ');
        if (nodeFenParts === puzzleFenParts) {
          // Build path from root to this node
          let path = '';
          for (let j = 1; j <= i; j++) path += mainline[j]!.id;
          this.gameTreePuzzlePath = path;
          return true;
        }
      }
      // FEN not found in mainline — still usable, just no path
      this.gameTreePuzzlePath = null;
      return true;
    } catch (e) {
      console.warn('[puzzle-ctrl] failed to parse game PGN', e);
      return false;
    }
  }

  /**
   * Toggle analysis mode — switches between puzzle tree and full game tree.
   */
  toggleAnalysisMode(redraw: () => void): void {
    if (this.analysisMode) {
      // Switch back to puzzle tree
      this.analysisMode = false;
      this.treeRoot = this.puzzleTreeRoot;
      this.setTreePath(this.puzzleTreePath);
    } else {
      // Switch to full game tree
      if (!this.gameTree && !this.loadGameTree()) return;
      if (!this.gameTree) return;
      // Save current puzzle tree state
      this.puzzleTreeRoot = this.treeRoot;
      this.puzzleTreePath = this.treePath;
      this.analysisMode = true;
      this.treeRoot = this.gameTree;
      // Navigate to the puzzle start position in the game tree
      const startPath = this.gameTreePuzzlePath ?? '';
      this.setTreePath(startPath);
    }
    syncPuzzleBoard();
    redraw();
  }

  /**
   * Navigate to a specific position in the full game tree without changing puzzle state.
   * Used when the user clicks a pre-puzzle context move to browse the game.
   * Puzzle progress, status, and solution state are preserved — only the board view changes.
   */
  browseGameAt(path: TreePath, redraw: () => void): void {
    if (!this.gameTree && !this.loadGameTree()) return;
    if (!this.gameTree) return;
    // Save puzzle state if entering browse mode for the first time
    if (!this.analysisMode) {
      this.puzzleTreeRoot = this.treeRoot;
      this.puzzleTreePath = this.treePath;
    }
    this.analysisMode = true;
    this.treeRoot = this.gameTree;
    this.setTreePath(path);
    syncPuzzleBoard();
    redraw();
  }

  /** Navigate the tree to a given path. Updates treeNode and syncs the board. Exits context-peek mode. */
  setTreePath(path: TreePath): void {
    const target = nodeAtPath(this.treeRoot, path);
    if (!target) return;
    this.contextPeekPath = null;
    this.treePath = path;
    this.treeNode = target;
    this.treeMainline = mainlineNodeList(this.treeRoot);
  }

  /** Add a variation move at the current tree position (post-solve free play). */
  addVariationMove(uci: string): TreeNode | undefined {
    const newNode = makeTreeNode(this.treeNode.fen, uci, this.treeNode.ply + 1);
    if (!newNode) return undefined;
    addNode(this.treeRoot, this.treePath, newNode);
    this.treePath = this.treePath + newNode.id;
    this.treeNode = newNode;
    this.treeMainline = mainlineNodeList(this.treeRoot);
    return newNode;
  }

  /** Delete a variation node at a given path. If currently inside the deleted variation, navigate up to its parent. */
  deleteVariation(path: TreePath): void {
    deleteNodeAt(this.treeRoot, path);
    if (this.treePath.startsWith(path)) {
      this.setTreePath(pathInit(path));
    }
    this.treeMainline = mainlineNodeList(this.treeRoot);
  }

  currentExpectedMove(): string | undefined {
    if (this.progressPly >= this.solutionLine.length) return undefined;
    return this.solutionLine[this.progressPly];
  }

  /**
   * Evaluate the quality of a played move relative to the expected solution move.
   * Uses engine win-chance evaluation to classify the move independently of
   * whether it matched the strict solution line.
   *
   * This is the shared concept used by both the puzzle product and Learn From
   * Your Mistakes to provide contextual "how good was your move" feedback.
   *
   * Adapted from lichess-org/lila: ui/analyse/src/retrospect/retroCtrl.ts
   * povDiff threshold model and ui/lib/src/ceval/winningChances.ts.
   *
   * @param playedUci   - the UCI move the user actually played
   * @param expectedUci - the UCI move the solution line expected
   * @param matched     - whether playedUci matched expectedUci (from strict check)
   * @param fenBefore   - FEN of the position before the move was played
   */
  evaluateMove(
    playedUci: string,
    expectedUci: string,
    matched: boolean,
    fenBefore: string,
  ): PuzzleMoveQuality {
    // If matched, classify as 'best' immediately — no engine eval needed.
    if (matched) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: true,
        quality: 'best',
        fenBefore,
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Compute positions before and after the played move to get evals.
    // "Before" = fenBefore. "After" = position after applying playedUci.
    const setupBefore = parseFen(fenBefore);
    if (setupBefore.isErr) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'blunder',
        fenBefore,
      };
      this.moveQualities.push(quality);
      return quality;
    }

    const posBefore = Chess.fromSetup(setupBefore.value);
    if (posBefore.isErr) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'blunder',
        fenBefore,
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Derive the position after the played move
    const posAfterPlayed = posBefore.value.clone();
    const move = parseUci(playedUci);
    if (!move || isUnsuffixedBackRankPawnMove(posBefore.value, move)) {
      // Unparseable, or an unsuffixed back-rank pawn move whose raw play would corrupt
      // the position — record structure without playing it.
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'blunder',
        fenBefore,
      };
      this.moveQualities.push(quality);
      return quality;
    }
    posAfterPlayed.play(move);

    // Also derive position after the expected (solution) move for comparison
    const posAfterExpected = posBefore.value.clone();
    const expectedMove = parseUci(expectedUci);
    if (expectedMove) {
      posAfterExpected.play(expectedMove);
    }

    // Get static evaluation via shared engine eval if available.
    // Note: full engine eval requires async analysis — for the synchronous path
    // we record the structure and leave evalBefore/evalAfter undefined.
    // The engine assist layer (enablePuzzleEngine) can fill these in later.
    // For now, if the shared engine has a cached eval, use it.
    const currentEngineEval = this.getPuzzleEval();
    const evalBefore = (currentEngineEval.cp !== undefined || currentEngineEval.mate !== undefined)
      ? { cp: currentEngineEval.cp, mate: currentEngineEval.mate }
      : undefined;



    if (!evalBefore) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        quality: 'mistake',
        fenBefore,
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Compute win chances from the solver's perspective.
    // evalBefore is white-perspective. Convert to solver's POV.
    const povSign = this.pov === 'white' ? 1 : -1;
    // Build evalBefore without explicit undefined keys.
    const eb: { cp?: number; mate?: number } = {};
    if (evalBefore.cp !== undefined) eb.cp = evalBefore.cp;
    if (evalBefore.mate !== undefined) eb.mate = evalBefore.mate;

    const wcBefore = evalWinChances(eb);

    if (wcBefore === undefined) {
      const quality: PuzzleMoveQuality = {
        playedUci,
        expectedUci,
        matched: false,
        evalBefore: eb,
        quality: 'mistake',
        fenBefore,
      };
      this.moveQualities.push(quality);
      return quality;
    }

    // Win-chance loss = (wcBefore_pov - wcAfter_pov) / 2
    // Mirrors retroCtrl.ts povDiff: (parentWc - nodeWc) / 2 from mover's perspective.
    // Without eval for the position after the played move, we approximate:
    // The solution move should maintain the position; the played move may not.
    // For now, record what we have and classify conservatively.
    const wcBeforePov = wcBefore * povSign;

    // Build the quality record with available data
    const quality: PuzzleMoveQuality = {
      playedUci,
      expectedUci,
      matched: false,
      evalBefore: eb,
      fenBefore,
      quality: 'mistake',
    };

    this.moveQualities.push(quality);
    return quality;
  }

  /**
   * Synchronously classify a move quality from pre-computed win-chance loss.
   * Uses the same thresholds as game analysis (LOSS_THRESHOLDS from winchances.ts).
   *
   * @param wcLoss - win-chance loss from solver's perspective (0–0.5 scale)
   * @returns quality classification
   */
  static classifyMoveQuality(wcLoss: number): PuzzleMoveQuality['quality'] {
    if (wcLoss <= 0) return 'good';
    if (wcLoss < LOSS_THRESHOLDS.inaccuracy) return 'good';
    if (wcLoss < LOSS_THRESHOLDS.mistake) return 'inaccuracy';
    if (wcLoss < LOSS_THRESHOLDS.blunder) return 'mistake';
    return 'blunder';
  }

  /**
   * Refine a previously recorded move quality with engine evaluation data.
   * Called when async engine eval becomes available for the position.
   * This allows the initial evaluateMove() call to be synchronous while
   * still providing accurate quality data once the engine finishes.
   */
  refineMoveQuality(
    index: number,
    evalBefore: { cp?: number; mate?: number },
    evalAfter: { cp?: number; mate?: number },
  ): void {
    const mq = this.moveQualities[index];
    if (!mq || mq.matched) return; // don't refine correct moves

    mq.evalBefore = evalBefore;
    mq.evalAfter = evalAfter;

    const povSign = this.pov === 'white' ? 1 : -1;
    const wcBefore = evalWinChances(evalBefore);
    const wcAfter = evalWinChances(evalAfter);

    if (wcBefore !== undefined && wcAfter !== undefined) {
      // Win-chance loss from solver's perspective.
      // Mirrors retroCtrl.ts povDiff: (parentWc - nodeWc) / 2
      const wcBeforePov = wcBefore * povSign;
      const wcAfterPov = wcAfter * povSign;
      const loss = (wcBeforePov - wcAfterPov) / 2;
      mq.wcLoss = Math.max(0, loss);
      mq.quality = PuzzleRoundCtrl.classifyMoveQuality(mq.wcLoss);
    }

    if (evalBefore.cp !== undefined && evalAfter.cp !== undefined) {
      // Centipawn loss from solver's perspective (positive = worse).
      const cpBeforePov = evalBefore.cp * povSign;
      const cpAfterPov = evalAfter.cp * povSign;
      mq.cpLoss = Math.max(0, cpBeforePov - cpAfterPov);
    }
  }

  /**
   * Whether the current position is the user's turn to move.
   * Even progressPly indices (0, 2, 4…) are user moves in our convention.
   */
  isUserTurn(): boolean {
    // solutionLine[0] = user's first answer, solutionLine[1] = opponent's reply.
    // Even indices are user moves, odd indices are opponent moves.
    return this.progressPly % 2 === 0;
  }

  /**
   * Validate a user move against the stored solution line.
   * Adapted from lichess-org/lila: ui/puzzle/src/moveTest.ts
   *
   * On correct move: advances progressPly, sets feedback='good',
   * checks for solve completion.
   * On wrong move: sets status='failed', records failure reason.
   */
  submitUserMove(uci: string): { accepted: boolean } {






    if (this.showAssistanceWarning) {
      this.revertUserMove();
      return { accepted: false };
    }
    if (this.status !== 'playing') {
      recordPuzzleInvalidStateTransition(`round:${this.status}`, 'round:playing', 'submit-user-move');
      return { accepted: false };
    }
    if (this.mode === 'view') {
      recordPuzzleInvalidStateTransition('mode:view', 'mode:play', 'submit-user-move');
      return { accepted: false };
    }

    const expected = this.currentExpectedMove();
    if (!expected) {
      recordPuzzleInvalidStateTransition(`solution:${this.progressPly}`, 'solution:expected-move', 'submit-user-move');
      return { accepted: false };
    }

    // Compute the FEN before this move for quality evaluation.
    const posBefore = positionAfterMoves(this.definition.startFen, this.allMovesPlayed());
    const fenBefore = posBefore ? makeFen(posBefore.toSetup()) : this.definition.startFen;

    const matched = uciMatches(uci, expected);

    // Clear any hint highlight
    const cg = getPuzzleCg();
    if (cg) cg.setAutoShapes([]);

    // Record move quality — this is data collection only, separate from correctness.
    this.evaluateMove(uci, expected, matched, fenBefore);

    // --- Terminal checkmate acceptance (before line match) ---
    // Any legal move whose resulting position is checkmate wins immediately, BEFORE
    // the UCI comparison against the stored line — multi-mate positions are common and
    // a delivered mate that differs from the stored line must still solve.
    // This branch is TERMINAL: it sets status='solved'/mode='view' and records the
    // attempt before any line-tail logic, appends the ACTUAL mating move (never the
    // stored remaining solution), and never schedules an opponent reply — the board
    // move handler's solved-status short-circuit relies on status being 'solved' here.
    // Adapted from lichess-org/lila: ui/puzzle/src/moveTest.ts
    const submittedMove = parseUci(uci);
    if (submittedMove && posBefore && posBefore.isLegal(submittedMove)) {
      const posAfter = posBefore.clone();
      posAfter.play(submittedMove);
      if (posAfter.isCheckmate()) {
        // Play move sound for the actual mating move.
        if (posBefore) playMoveSound(uciToSanAtPos(posBefore, uci));
        this.feedback = 'good';
        this.progressPly++;
        // Append the ACTUAL mating move to the tree — not the stored line's move.
        appendSolutionMoveToTree(this, uci);
        this.setRoundStatus('solved', 'submit-user-move');
        this.setPuzzleMode('view', 'submit-user-move');
        this.recordAttempt();
        // Sync board to allow both sides to move in analysis mode.
        syncPuzzleBoard();
        this.redraw();
        return { accepted: true };
      }
    }

    if (matched) {
      // Play move sound
      if (posBefore) playMoveSound(uciToSanAtPos(posBefore, uci));
      this.feedback = 'good';
      this.progressPly++;

      // Append the correct user move to the tree
      appendSolutionMoveToTree(this, uci);

      // Check if puzzle is solved (all solution moves played)
      if (this.progressPly >= this.solutionLine.length) {
        this.setRoundStatus('solved', 'submit-user-move');
        this.setPuzzleMode('view', 'submit-user-move');
        this.recordAttempt();
        // Sync board to allow both sides to move in analysis mode
        syncPuzzleBoard();
      }
      this.redraw();
      return { accepted: true };
    }

    // --- Wrong move: revert piece and allow retry ---
    // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts applyProgress('fail')
    if (this.firstWrongPly === undefined) {
      this.firstWrongPly = this.progressPly;
    }
    this.feedback = 'fail';
    const reason: FailureReason = this.progressPly === 0
      ? 'wrong-first-move'
      : 'wrong-later-move';
    if (!this.failureReasons.includes(reason)) {
      this.failureReasons.push(reason);
    }

    // On first wrong move, switch from 'play' to 'try' and send result.
    // lila parity (ui/puzzle/src/ctrl.ts:395-408): the first fail in play mode
    // sends the rated loss once. Latch the rated failure here (send-once); a
    // later recovered solve cannot unlatch it.
    if (this.mode === 'play') {
      this.setPuzzleMode('try', 'submit-user-move');
      this.canViewSolution = true;
      this.latchRatedFailure('rated-failure');
    }

    // Revert the piece back to its original square after a short delay
    this.revertUserMove();
    this.redraw();
    return { accepted: false };
  }

  /**
   * Revert the last wrong user move on the board — snap piece back.
   * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts revertUserMove
   */
  private revertUserMove(): void {
    setTimeout(() => {




      if (this.isStaleRound()) return;
      // Restore the board to the current correct position
      const cg = getPuzzleCg();
      if (!cg) return;
      const pos = positionAfterMoves(this.definition.startFen, this.allMovesPlayed());
      if (pos) {
        const dests = chessgroundDests(pos) as Map<Key, Key[]>;
        cg.set({
          fen: makeFen(pos.toSetup()),
          turnColor: pos.turn,
          movable: {
            color: this.pov,
            dests,
          },
        });
      }
      this.redraw();
    }, 300);
  }

  /**
   * Give up and view the solution. Marks the puzzle as failed.
   * Routed through the rated assistance gate (giving up to see the solution is
   * a P2-PZ-4 RED true fail): in an active rated solve the reveal defers to the
   * warning modal and runs on the verdict. Non-rated runs freely.
   * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts viewSolution
   */
  viewSolution(redraw: () => void): void {
    this.requestAssistanceDuringRated('solution-revealed', () => this.viewSolutionCore(redraw));
  }

  /** Perform the give-up-and-view-solution action. */
  private viewSolutionCore(redraw: () => void): void {
    if (this.mode === 'view') return;
    this.setRoundStatus('failed', 'view-solution');
    this.setPuzzleMode('view', 'view-solution');
    this.revealedSolution = true;
    this.recordAttempt();
    // Add remaining solution moves to the tree for navigation
    completeSolutionTree(this);
    syncPuzzleBoard();
    redraw();
  }

  /**
   * After a correct user move, play the opponent's scripted reply from the
   * solution line on the Chessground board.
   * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts playUci / sendMoveAt
   *
   * Does nothing if:
   * - puzzle is already solved/failed
   * - it's the user's turn (no opponent reply pending)
   * - there's no next move in the solution line
   */
  playOpponentReply(): void {




    if (this.showAssistanceWarning) {
      if (this.status === 'playing' && !this.isUserTurn()) this.opponentReplyOwed = true;
      return;
    }
    if (this.status !== 'playing') {
      recordPuzzleInvalidStateTransition(`round:${this.status}`, 'round:playing', 'opponent-reply');
      return;
    }
    if (this.isUserTurn()) {
      recordPuzzleInvalidStateTransition('turn:user', 'turn:opponent', 'opponent-reply');
      return;
    } // opponent moves are at odd indices

    const opponentUci = this.currentExpectedMove();
    if (!opponentUci) {
      recordPuzzleInvalidStateTransition(`solution:${this.progressPly}`, 'solution:opponent-move', 'opponent-reply');
      return;
    }

    const cg = getPuzzleCg();
    if (!cg) {
      recordPuzzleInvalidStateTransition('board:missing', 'board:mounted', 'opponent-reply');
      return;
    }

    // Play opponent move sound
    const preOpponentPos = positionAfterMoves(this.definition.startFen, this.allMovesPlayed());
    if (preOpponentPos) playMoveSound(uciToSanAtPos(preOpponentPos, opponentUci));

    // Append opponent move to tree and advance progress
    appendSolutionMoveToTree(this, opponentUci);
    this.progressPly++;

    // Check if puzzle is solved after opponent reply (shouldn't happen normally,
    // but handle edge case where solution ends on opponent move)
    if (this.progressPly >= this.solutionLine.length) {
      this.setRoundStatus('solved', 'opponent-reply');
      this.recordAttempt();
      this.redraw();
      return;
    }

    // Apply the opponent move by setting the new position directly.
    // Using cg.set() instead of cg.move() avoids firing the move event handler.
    const orig = opponentUci.slice(0, 2) as Key;
    const dest = opponentUci.slice(2, 4) as Key;
    const pos = positionAfterMoves(this.definition.startFen, this.allMovesPlayed());
    if (pos) {
      const dests = chessgroundDests(pos) as Map<Key, Key[]>;
      cg.set({
        fen: makeFen(pos.toSetup()),
        turnColor: pos.turn,
        lastMove: [orig, dest],
        movable: {
          color: this.pov,
          dests,
        },
      });
    }

    // Reset feedback to 'none' so the view shows "Your turn" again.
    // A short delay keeps "Best move!" visible during the position transition.
    setTimeout(() => {


      if (this.isStaleRound()) return;
      if (this.status === 'playing') {
        this.feedback = 'none';
        this.redraw();
      }
    }, 200);
    this.redraw();
  }

  /**
   * Build a PuzzleAttempt from the current round state and persist it to IDB.
   * Idempotent — only records once per round lifecycle.
   */
  recordAttempt(): PuzzleAttempt | undefined {
    if (this.attemptRecorded) return undefined;
    if (this.status !== 'solved' && this.status !== 'failed') return undefined;
    this.attemptRecorded = true;

    const result = this.computeSolveResult();
    const attempt: PuzzleAttempt = {
      puzzleId: this.definition.id,
      startedAt: this.startedAt,
      completedAt: Date.now(),
      result,
      failureReasons: [...this.failureReasons],
      usedHint: this.usedHint,
      usedEngineReveal: this.usedEngineReveal,
      revealedSolution: this.revealedSolution,
      openedNotesDuringSolve: false, // not implemented yet
      skipped: false,
      sessionMode: this.currentSessionMode,
      // ratingBefore / ratingAfter: populated by the future rating algorithm
      // when currentSessionMode === 'rated'. Left undefined for practice mode.
    };
    if (this.firstWrongPly !== undefined) attempt.firstWrongPly = this.firstWrongPly;

    // P2-PZ-4 [LOCKED]: attempt records MUST store severity + specific assistance type.
    const p2Outcome = this.computeP2FailOutcome();
    if (p2Outcome.severity) attempt.p2Severity = p2Outcome.severity;
    if (p2Outcome.assistanceTypes.length > 0) attempt.assistanceTypes = p2Outcome.assistanceTypes;

    // --- Rated completion path ---
    // Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleFinisher.scala
    // Branches mirror: casual → record only; rated first-play → update perf + history
    const isRatedPersistencePath =
      this.currentSessionMode === 'rated' && this.definition.sourceKind === 'imported-lichess';
    if (isRatedPersistencePath) {
      // Determine win/loss for the Glicko computation, honoring the send-once
      // failure latch (lila resultSent parity). Once a rated loss has latched
      // — first wrong move in play mode, or a stay-rated assistance verdict —
      // a later solve CANNOT flip the outcome to a win (P2-PZ-4: a recovered
      // solve is a RED true fail). When nothing latched, a solve wins.
      let isWin: boolean;
      let ratedOutcome: RatedScoringOutcome;
      if (this.ratedFailureLatched) {
        isWin = false;
        ratedOutcome = this.ratedLatchedOutcome ?? 'rated-failure';
      } else {
        isWin = this.status === 'solved';
        ratedOutcome = isWin ? 'rated-success' : 'rated-failure';
      }

      attempt.ratedOutcome = ratedOutcome;
      this.finalizeRatedAttemptOrdered(attempt, isWin);
    } else {
      attempt.ratedOutcome = 'not-rated';
      attempt.nonRatedReason = this.currentSessionMode === 'practice'
        ? 'session-practice'
        : 'source-not-rated';
    }

    // Update active session history with granular result:
    // 'clean' = solved with no wrong moves, no hints, no engine assists
    // 'assisted' = solved but had wrong moves, used hints, or used engine
    // 'failed' = gave up or skipped
    let sessionResult: 'clean' | 'assisted' | 'failed';
    if (this.status !== 'solved') {
      sessionResult = 'failed';
    } else if (
      this.failureReasons.length > 0 ||
      this.usedHint ||
      this.usedEngineReveal ||
      this.revealedSolution ||
      this.mode === 'try'
    ) {
      sessionResult = 'assisted';
    } else {
      sessionResult = 'clean';
    }
    sessionRecordResult(this.definition.id, sessionResult);

    // Auto-next: advance to the next puzzle after a short delay
    if (_autoNext && this.status === 'solved') {
      const redraw = this.redraw;
      setTimeout(() => {




        if (this.isStaleRound()) return;
        nextPuzzle(redraw);
      }, 800);
    }






    if (!isRatedPersistencePath) {
      persistAttemptOrdered(attempt);
    }

    return attempt;
  }












  private finalizeRatedAttemptOrdered(attempt: PuzzleAttempt, isWin: boolean): void {
    const puzzleDef = this.definition as ImportedLichessPuzzleDefinition;
    const now = Date.now();
    attempt.ratingBefore = {
      rating: _currentUserPerf.glicko.rating,
      deviation: _currentUserPerf.glicko.deviation,
      timestamp: now,
    };
    attempt.sessionMode = 'rated';

    const capturedPerf = { ..._currentUserPerf };
    const capturedPuzzleRating = puzzleDef.rating;
    const capturedAttempt = attempt;
    void (async () => {
      try {



        const eligibility = await (
          _ratedPersistenceTestHooks?.eligibility ?? getPuzzleRatedEligibility
        )(puzzleDef.id);
        if (!eligibility.eligible) {
          capturedAttempt.ratedOutcome = 'not-rated';
          capturedAttempt.nonRatedReason = eligibility.reason;
          if (eligibility.reason === 'already-solved') this.ratedOutcomeResolved = 'already-solved';
        } else {
          const { newPerf, delta } = computeRatedUpdate(capturedPerf, capturedPuzzleRating, isWin, now);
          capturedAttempt.ratingAfter = {
            rating: newPerf.glicko.rating,
            deviation: newPerf.glicko.deviation,
            timestamp: now,
          };
          capturedAttempt.ratingDelta = delta;
          this.ratedOutcomeResolved = capturedAttempt.ratedOutcome ?? null;
          this.lastRatingDelta = delta.delta;
          await persistUserPerf(newPerf);
          await appendRatingHistory({
            timestamp: now,
            rating: Math.round(newPerf.glicko.rating),
            deviation: newPerf.glicko.deviation,
          });








          if (_ratedStreamActive && activeRoundCtrl?.roundToken === this.roundToken) {
            const completedId = capturedAttempt.puzzleId ?? this.definition.id;
            _sessionSeenIds.add(completedId);
            const redrawFn = this.redraw;
            setTimeout(async () => {
              if (!_ratedStreamActive) return; // user may have stopped stream

              if (activeRoundCtrl?.roundToken !== this.roundToken) return;
              redrawFn(); // refresh rating display first
              try {
                const next = await selectNextRatedPuzzle();


                if (!_ratedStreamActive || activeRoundCtrl?.roundToken !== this.roundToken) return;
                if (next) {
                  _ratedStreamCount++;
                  _sessionSeenIds.add(next.id);
                  await openGeneratedPuzzleRoundRoute(next.id, redrawFn);
                } else {
                  _emptyRatedStream = true;
                  _ratedStreamActive = false;
                  redrawFn();
                }
              } catch (e) {
                // selectNextRatedPuzzle() now rethrows genuine storage failures (BUG-2026-07-10-002)
                // instead of resolving an empty list; this setTimeout callback has no caller to
                // propagate to, so fall back to the existing empty-stream state instead of leaving
                // an unhandled promise rejection.
                console.warn('[puzzle-ctrl] rated stream advance failed', e);


                if (activeRoundCtrl?.roundToken !== this.roundToken) return;
                _emptyRatedStream = true;
                _ratedStreamActive = false;
                redrawFn();
              }
            }, 300);
          }
        }
      } catch (e) {
        // Rating math failed — the ordered write below still lands the
        // LATCHED outcome (never a silent loss of the attempt itself).
        console.warn('[puzzle-round] rated update failed', e);
      }
      // Decision 5: the ONE ordered write, strictly AFTER the rating math
      // resolved (or conclusively failed). Teardown adjudication (round-token
      // machinery): the attempt was snapshotted from the completed round and
      // is keyed by its own puzzleId, so the write still lands when the round
      // was replaced mid-math — round-data-scoped, it can never record
      // against a different round; only the stream-advance navigation above
      // is round-scoped and token-guarded.
      try {
        await _ratedPersistenceTestHooks?.beforeAttemptWrite?.(capturedAttempt);
      } catch (e) {
        console.warn('[puzzle-round] beforeAttemptWrite test hook failed', e);
      }
      persistAttemptOrdered(capturedAttempt);
    })();
  }

  /**
   * Determine the SolveResult from the current round state.
   * Priority: skipped > failed > assisted-solve > recovered-solve > clean-solve
   */
  private computeSolveResult(): SolveResult {
    if (this.status === 'failed') return 'failed';

    // Solved — determine quality
    if (this.usedHint || this.usedEngineReveal || this.revealedSolution) {
      return 'assisted-solve';
    }
    if (this.failureReasons.length > 0 || this.firstWrongPly !== undefined) {
      return 'recovered-solve';
    }
    return 'clean-solve';
  }

  /**
   * Skip the current puzzle — marks as failed with 'skipped' result.
   * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts skip action
   */
  skipPuzzle(): void {

    if (this.showAssistanceWarning) return;
    if (this.status !== 'playing') return;
    if (!this.failureReasons.includes('skip-pressed')) {
      this.failureReasons.push('skip-pressed');
    }
    this.setRoundStatus('failed', 'skip-puzzle');
    this.setPuzzleMode('view', 'skip-puzzle');
    this.feedback = 'fail';

    // Record with skipped flag — bypass normal recordAttempt to set skipped=true
    if (!this.attemptRecorded) {
      this.attemptRecorded = true;
      const attempt: PuzzleAttempt = {
        puzzleId: this.definition.id,
        startedAt: this.startedAt,
        completedAt: Date.now(),
        result: 'skipped',
        failureReasons: [...this.failureReasons],
        usedHint: this.usedHint,
        usedEngineReveal: this.usedEngineReveal,
        revealedSolution: this.revealedSolution,
        openedNotesDuringSolve: false,
        skipped: true,
        sessionMode: this.currentSessionMode,
      };
      if (this.firstWrongPly !== undefined) attempt.firstWrongPly = this.firstWrongPly;
      // P2-PZ-4: record severity + assistance type on the skip attempt too.
      const p2Outcome = this.computeP2FailOutcome();
      if (p2Outcome.severity) attempt.p2Severity = p2Outcome.severity;
      if (p2Outcome.assistanceTypes.length > 0) attempt.assistanceTypes = p2Outcome.assistanceTypes;
      if (this.currentSessionMode === 'rated' && this.definition.sourceKind === 'imported-lichess') {





        attempt.ratedOutcome = this.ratedFailureLatched
          ? (this.ratedLatchedOutcome ?? 'rated-failure')
          : 'rated-failure';
        this.finalizeRatedAttemptOrdered(attempt, false);
      } else {
        // Practice skip: immediate write, unchanged (no rating math applies).
        persistAttemptOrdered(attempt);
      }
    }

    this.redraw();
  }

  // --- Assist action methods ---
  // These methods log assist actions (hint, engine reveal, solution reveal)
  // so the attempt record captures WHY a solve was assisted. Each sets the
  // relevant boolean flag and appends a FailureReason if not already present.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts hint / ceval / solution

  /**
   * Mark that the user requested a hint.
   * Routed through the rated assistance gate: in an active rated solve the
   * captured action defers to the warning modal and runs exactly once on the
   * user's verdict (P2-PZ-4 / Decision 4). Non-rated and post-round runs freely.
   */
  useHint(redraw: () => void): void {
    this.requestAssistanceDuringRated('hint-used', () => this.useHintCore(redraw));
  }

  /** Perform the hint action. The strict correctness model never consults this. */
  private useHintCore(redraw: () => void): void {
    if (this.status !== 'playing') return;
    this.usedHint = true;
    if (!this.failureReasons.includes('hint-used')) {
      this.failureReasons.push('hint-used');
    }
    // Highlight the origin square of the expected move on the board
    const expected = this.currentExpectedMove();
    const cg = getPuzzleCg();
    if (expected && cg) {
      const orig = expected.slice(0, 2) as Key;
      cg.setAutoShapes([{
        orig,
        brush: 'green',
      }]);
    }
    redraw();
  }

  /**
   * Mark that the user revealed the solution.
   * Routed through the rated assistance gate (solution reveal is a P2-PZ-4 RED
   * true fail): in an active rated solve it defers to the warning modal and
   * runs on the verdict. Post-fail reveal (status 'failed') runs freely.
   */
  revealSolution(redraw: () => void): void {
    this.requestAssistanceDuringRated('solution-revealed', () => this.revealSolutionCore(redraw));
  }

  /** Perform the solution-reveal action. */
  private revealSolutionCore(redraw: () => void): void {
    if (this.status !== 'playing' && this.status !== 'failed') return;
    this.revealedSolution = true;
    if (!this.failureReasons.includes('solution-revealed')) {
      this.failureReasons.push('solution-revealed');
    }
    redraw();
  }

  /**
   * Mark that the user requested engine lines and activate the engine.
   * Only available after solve/fail (post-round viewing), so the rated
   * assistance gate is a no-op here (post-round study is free); the gate is
   * kept on the path for uniformity with the other assistance actions. The
   * live active-solve engine reveal is intercepted separately by
   * `engineRevealGate()` before any line content renders.
   */
  showEngineLines(redraw: () => void): void {
    this.requestAssistanceDuringRated('engine-lines-shown', () => this.showEngineLinesCore(redraw));
  }

  /** Perform the engine-lines reveal. */
  private showEngineLinesCore(redraw: () => void): void {
    if (this.status !== 'solved' && this.status !== 'failed') return;
    // Only mark as assisted if used before/during solve — post-solve study is free
    if (this.status === 'failed') {
      this.usedEngineReveal = true;
      if (!this.failureReasons.includes('engine-lines-shown')) {
        this.failureReasons.push('engine-lines-shown');
      }
    }
    this.enablePuzzleEngine(redraw);
  }

  /**
   * Mark that the user requested engine arrows on the board.
   * Sets usedEngineReveal flag and records 'engine-arrows-shown' failure reason.
   * Only available after solve/fail (post-round viewing).
   */
  showEngineArrows(redraw: () => void): void {
    if (this.status !== 'solved' && this.status !== 'failed') return;
    // Only mark as assisted if used before/during solve — post-solve study is free
    if (this.status === 'failed') {
      this.usedEngineReveal = true;
      if (!this.failureReasons.includes('engine-arrows-shown')) {
        this.failureReasons.push('engine-arrows-shown');
      }
    }
    redraw();
  }

  // --- Post-solve engine assist ---
  // These methods provide a seam for requesting/stopping engine evaluation of
  // the current puzzle position AFTER a solve attempt completes. The engine
  // eval is purely for viewing — it never influences submitUserMove or the
  // strict solutionLine correctness model.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts cevalEnabled / doStartCeval

  /**
   * Current puzzle-board engine context.
   * Uses the active puzzle/analysis tree path so repeated positions preserve
   * move history when Stockfish searches the post-solve assist position.
   */
  currentEnginePositionContext(surface = 'puzzle-engine'): EnginePositionContext {
    return contextFromNodeList(nodeListAt(this.treeRoot, this.treePath), surface, this.treePath);
  }

  /**
   * Activate engine evaluation for the current puzzle position.
   * Only permitted after the round has ended (solved or failed).
   * Uses the shared Stockfish protocol to evaluate the puzzle board's current
   * position — does NOT go through the analysis board's evalCurrentPosition.
   */
  enablePuzzleEngine(redraw: () => void): void {
    if (this.status !== 'solved' && this.status !== 'failed') return;
    if (this.puzzleEngineEnabled) return;

    this.puzzleEngineEnabled = true;
    setEngineEnabledFlag(true); // makes renderCeval/renderPvBox show as active

    // Use the current board position (tracks analysis-mode navigation)
    const positionContext = this.currentEnginePositionContext();
    setEvalPositionOverride('puzzle-post-solve', positionContext);

    if (sharedEngineReady) {
      evalCurrentPosition();
      redraw();
    } else {
      // Engine not yet initialized — start it, then evaluate on ready
      redraw();
      void engineProtocol.init('/stockfish-web').then(() => {
        if (this.puzzleEngineEnabled) {
          setEvalPositionOverride('puzzle-post-solve', this.currentEnginePositionContext());
          evalCurrentPosition();
          redraw();
        }
      }).catch((err: unknown) => {
        console.error('[puzzle-engine] failed to load:', err);
        this.puzzleEngineEnabled = false;
        setEngineEnabledFlag(false);
        redraw();
      });
    }
  }

  /**
   * Called by the view whenever the shared engine toggle is on during an active
   * solve.  Idempotent — only marks the round the first time.
   * Triggers are: mode === 'play' or 'try' AND engineEnabled() returns true.
   */
  notifyEngineUsedDuringSolve(): void {
    if (this.usedEngineReveal) return;
    if (this.status === 'solved' || this.status === 'failed') return;
    this.usedEngineReveal = true;
    if (!this.failureReasons.includes('engine-lines-shown')) {
      this.failureReasons.push('engine-lines-shown');
    }
  }

  /** True once the active-solve engine reveal has been resolved by a verdict. */
  private engineRevealResolved = false;













  interceptEngineToggle(): boolean {
    if (this.isStaleRound()) return false;         // stale handler: swallow, do nothing
    if (sharedEngineEnabled) return true;          // turning OFF is always allowed
    if (this.status !== 'playing' || this.mode === 'view') return true; // post-round study is free
    if (this.currentSessionMode !== 'rated') {
      // Practice active solve: enabling the engine is an assist — mark and allow.
      this.notifyEngineUsedDuringSolve();
      return true;
    }
    if (this.engineRevealResolved) return true;    // verdict already accepted this round
    if (this.showAssistanceWarning) return false;  // verdict pending: swallow, don't re-capture
    this.requestAssistanceDuringRated('engine-lines-shown', () => {
      this.engineRevealResolved = true;
      this.notifyEngineUsedDuringSolve();
      toggleEngine(); // perform the intercepted toggle exactly once, post-verdict
    });
    return false;
  }

  /**
   * Pre-render interception seam for the shared-engine toggle during an active
   * rated solve (Decision 4: the toggle is INTERCEPTED before lines become
   * visible; the post-hoc notifyEngineUsedDuringSolve notice is NOT the seam).
   * The view calls this each render with whether the shared engine is enabled,
   * and MUST NOT render engine line content when it returns false.
   *
   * @returns whether engine line content may render this frame.
   */
  engineRevealGate(engineOn: boolean): boolean {
    if (!engineOn) return true;                                 // nothing enabled
    if (this.status !== 'playing' || this.mode === 'view') return true; // post-round study is free
    if (this.currentSessionMode !== 'rated') {
      // Practice active solve: mark assisted (existing behavior); no line gating.
      this.notifyEngineUsedDuringSolve();
      return true;
    }
    if (this.engineRevealResolved) return true;                 // verdict already given
    // Rated active solve: raise the modal once and suppress line content until
    // the user resolves it. The captured action marks the reveal resolved.
    if (!this.showAssistanceWarning) {
      this.requestAssistanceDuringRated('engine-lines-shown', () => {
        this.engineRevealResolved = true;
        this.notifyEngineUsedDuringSolve();
      });
    }
    return false;
  }

  /**
   * Stop engine evaluation for the puzzle position.
   */
  disablePuzzleEngine(): void {
    if (!this.puzzleEngineEnabled) return;
    this.puzzleEngineEnabled = false;
    setEngineEnabledFlag(false);
    clearEvalPositionOverride('puzzle-post-solve');
    engineProtocol.stop();
  }

  /**
   * Returns the current engine eval from the shared engine state.
   * Only meaningful when puzzleEngineEnabled is true — otherwise returns
   * an empty eval. The caller should check puzzleEngineEnabled before
   * using the result for display.
   */
  getPuzzleEval(): PositionEval {
    if (!this.puzzleEngineEnabled) return {};
    return visibleEvalForFen(this.currentEnginePositionContext().currentFen);
  }








  /**
   * Gate a restricted tool action behind the rated assistance flow.
   * - Non-rated / post-round: runs `exec` immediately and returns true.
   * - Remembered 'switch-to-casual': downgrades to practice, runs `exec`, returns true.
   * - Remembered 'stay-rated': latches an immediate-fail, runs `exec`, returns true.
   * - Otherwise: captures `action` + `exec`, shows the modal, returns false; the
   *   captured action runs exactly once when the user picks a verdict.
   */
  requestAssistanceDuringRated(action: FailureReason, exec: () => void): boolean {


    if (this.isStaleRound()) return false;
    // Blocking dialog: while a verdict is already pending, refuse new requests —
    // never overwrite the captured continuation (double-capture = lost action).
    if (this.showAssistanceWarning) return false;
    // Only an active rated solve is gated. Practice mode (the production default
    // once the dormancy guard normalizes rated → practice) and post-round study
    // both run freely.
    if (this.currentSessionMode !== 'rated' || this.status !== 'playing' || this.mode === 'view') {
      exec();
      return true;
    }
    if (this.rememberedAssistanceChoice === 'switch-to-casual') {
      // Already chose to switch for this session — silently continue as casual.
      this.currentSessionMode = 'practice';
      exec();
      return true;
    }
    if (this.rememberedAssistanceChoice === 'stay-rated') {
      // Already chose to stay rated — latch immediate-fail, then allow the tool.
      this.latchRatedFailure('rated-immediate-fail');
      exec();
      return true;
    }


    this.pendingAssistanceAction = action;
    this.pendingAssistanceExec = exec;
    this.pendingAssistanceToken = this.roundToken;
    this.showAssistanceWarning = true;
    return false;
  }







  private lifecycleDestroyed = false;









  markDestroyed(): void {
    this.lifecycleDestroyed = true;
    this.invalidatePendingAssistance();
    if (activeRoundCtrl !== null && activeRoundCtrl.roundToken === this.roundToken) {
      activeRoundCtrl = null;
    }
  }
















  isStaleRound(): boolean {
    return this.lifecycleDestroyed
      || activeRoundCtrl === null
      || activeRoundCtrl.roundToken !== this.roundToken;
  }







  invalidatePendingAssistance(): void {
    this.showAssistanceWarning = false;
    this.pendingAssistanceExec = null;
    this.pendingAssistanceAction = null;
    this.pendingAssistanceToken = null;
    this.opponentReplyOwed = false;
    this.rememberAssistanceChoice = false;
  }







  private executePendingAssistance(): void {
    const exec = this.pendingAssistanceExec;
    const token = this.pendingAssistanceToken;
    this.pendingAssistanceExec = null;
    this.pendingAssistanceAction = null;
    this.pendingAssistanceToken = null;
    if (token === null || activeRoundCtrl === null || activeRoundCtrl.roundToken !== token) return;
    if (exec) exec();
  }

  /**
   * User chose to cancel — do not use the tool, leave round as rated.
   * Executes NOTHING and clears the captured action cleanly. If the pending
   * action was the shared-engine reveal and the engine is somehow already on
   * (enabled before this round started), it is turned OFF so the render gate
   * does not immediately re-raise the warning (Sol IMPORTANT-3 cancel stability).
   */
  dismissAssistanceWarning(): void {
    if (this.isStaleRound()) { this.invalidatePendingAssistance(); return; }
    if (this.pendingAssistanceAction === 'engine-lines-shown' && sharedEngineEnabled) {
      toggleEngine();
    }
    this.showAssistanceWarning = false;
    this.pendingAssistanceExec = null;
    this.pendingAssistanceAction = null;
    this.pendingAssistanceToken = null;
    this.rememberAssistanceChoice = false;


    this.rekickOwedOpponentReply();
  }

  /**
   * User chose to switch this round to casual (practice) mode.
   * The round is downgraded — no rated scoring will apply at completion — and
   * the captured action is then executed exactly once (in practice mode).
   * No-ops (and clears) on a stale round: identity is checked against the
   * current active round controller.
   */
  chooseAssistanceSwitchToCasual(): void {
    if (this.isStaleRound()) { this.invalidatePendingAssistance(); return; }
    if (!this.showAssistanceWarning) return; // only actionable while the modal is open
    this.currentSessionMode = 'practice';
    if (this.rememberAssistanceChoice) {
      this.rememberedAssistanceChoice = 'switch-to-casual';
    }
    this.showAssistanceWarning = false;
    this.rememberAssistanceChoice = false;
    this.executePendingAssistance();
    this.rekickOwedOpponentReply();
  }

  /**
   * User chose to stay rated and proceed with tool use.
   * Latches an immediate rated failure for the round (send-once) regardless of
   * whether the user eventually finds the solution, then executes the captured
   * action exactly once. No-ops (and clears) on a stale round.
   * Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleFinisher.scala.
   */
  chooseStayRatedAndProceed(): void {
    if (this.isStaleRound()) { this.invalidatePendingAssistance(); return; }
    if (!this.showAssistanceWarning) return; // only actionable while the modal is open
    this.latchRatedFailure('rated-immediate-fail');
    if (this.rememberAssistanceChoice) {
      this.rememberedAssistanceChoice = 'stay-rated';
    }
    this.showAssistanceWarning = false;
    this.rememberAssistanceChoice = false;
    this.executePendingAssistance();
    this.rekickOwedOpponentReply();
  }








  private rekickOwedOpponentReply(): void {
    if (!this.opponentReplyOwed) return;
    this.opponentReplyOwed = false; // exactly once
    const token = this.roundToken;
    setTimeout(() => {
      if (activeRoundCtrl === null || activeRoundCtrl.roundToken !== token) return;
      if (this.status !== 'playing') return;
      this.playOpponentReply();
    }, 300);
  }

  // --- Rated failure latch (lila send-once / resultSent parity) ---
  // ui/puzzle/src/ctrl.ts:395-408 sends the rated loss ONCE, guarded by
  // `resultSent`: the first fail in play mode sends `false`, and a later win
  // recovered through 'try' mode never sends a success. Patzer computes the
  // rated outcome lazily in recordAttempt(), so we latch the failure the moment
  // it happens (first wrong move in play mode, or a stay-rated assistance
  // verdict). Once latched, a subsequent solve cannot flip the outcome to a win.
  // P2-PZ-4 [LOCKED]: a recovered solve is a RED true fail for rated purposes.

  /** True once this round's rated outcome has latched to a loss (send-once). */
  ratedFailureLatched = false;
  /** The latched rated loss outcome ('rated-failure' for wrong move, 'rated-immediate-fail' for stay-rated assistance). */
  ratedLatchedOutcome: RatedScoringOutcome | null = null;
  /**
   * Structural send-once counter (lila resultSent parity). Incremented exactly
   * once when the rated loss latches, regardless of how many further wrong moves
   * or assistance verdicts follow. Asserted by tests to prove exactly-one send.
   */
  ratedLossSendCount = 0;

  /**
   * Latch the rated outcome to a loss, once (lila send-once). No-op when the
   * round is not rated, or when a loss is already latched.
   * @param outcome the loss classification to record on the attempt.
   */
  private latchRatedFailure(outcome: 'rated-failure' | 'rated-immediate-fail'): void {
    if (this.currentSessionMode !== 'rated') return; // only rated rounds latch
    if (this.ratedFailureLatched) return;            // send-once guard (resultSent)
    this.ratedFailureLatched = true;
    this.ratedLatchedOutcome = outcome;
    this.ratedLossSendCount++;
  }

  /**
   * Compute the P2-PZ-4 severity + specific assistance types for this attempt.
   * Register (P2-PZ-4 [LOCKED]): RED true fail = wrong move / engine assistance /
   * solution reveal; YELLOW soft fail = hint used / own-notes reveal. RED wins
   * over YELLOW when both apply. Returns null severity for a clean solve.
   */
  computeP2FailOutcome(): { severity: PuzzleFailSeverity | null; assistanceTypes: PuzzleAssistanceType[] } {
    const has = (r: FailureReason): boolean => this.failureReasons.includes(r);
    const types: PuzzleAssistanceType[] = [];
    let red = false;
    let yellow = false;
    if (has('wrong-first-move') || has('wrong-later-move') || this.firstWrongPly !== undefined) {
      types.push('wrong-move');
      red = true;
    }
    if (this.usedEngineReveal || has('engine-lines-shown') || has('engine-arrows-shown')) {
      types.push('engine-assistance');
      red = true;
    }
    if (this.revealedSolution || has('solution-revealed')) {
      types.push('solution-reveal');
      red = true;
    }
    if (this.usedHint || has('hint-used')) {
      types.push('hint');
      yellow = true;
    }
    if (has('notes-opened')) {
      types.push('notes');
      yellow = true;
    }
    const severity: PuzzleFailSeverity | null = red ? 'red' : (yellow ? 'yellow' : null);
    return { severity, assistanceTypes: types };
  }

  /**
   * The resolved rated outcome for this round, populated after `recordAttempt()` completes.
   * Used by the UI to show already-solved notice or practice-mode label.
   * Undefined until the round completes.
   */
  ratedOutcomeResolved: RatedScoringOutcome | 'already-solved' | null = null;

  /**
   * Integer rating delta from the last completed rated round.
   * Populated after `computeRatedUpdate()` resolves.
   * Used by `renderRatingDisplay` to show "+8" or "-12".
   */
  lastRatingDelta: number | undefined = undefined;
}





/**
 * The ONE attempt-persistence chain: save the attempt row, then refresh the
 * puzzle's due-again metadata from the full attempt history. Rated attempts
 * reach this ONLY after the rating math resolves (Decision 5); non-rated
 * attempts call it directly from the sync tail. Append-only semantics.
 */
function persistAttemptOrdered(attempt: PuzzleAttempt): void {
  saveAttempt(attempt)
    .then(() => getAttempts(attempt.puzzleId))
    .then(allAttempts => updateDueMeta(attempt.puzzleId, allAttempts))
    .catch(e => console.warn('[puzzle-round] attempt save / due-meta update failed', e));
}







export interface RatedPersistenceTestHooks {
  /** Replaces the rated eligibility lookup (stall/shape the rating math). */
  eligibility?: (puzzleId: string) => Promise<RatedEligibility>;
  /** Awaited immediately before the single ordered attempt write. */
  beforeAttemptWrite?: (attempt: PuzzleAttempt) => Promise<void> | void;
}

let _ratedPersistenceTestHooks: RatedPersistenceTestHooks | null = null;


export function __setRatedPersistenceTestHooks(hooks: RatedPersistenceTestHooks | null): void {
  _ratedPersistenceTestHooks = hooks;
}

// ---------------------------------------------------------------------------
// Round ctrl singleton + factory
// ---------------------------------------------------------------------------

let activeRoundCtrl: PuzzleRoundCtrl | null = null;

/**
 * Create and activate a new round controller for the given puzzle definition.
 * Sets up the board at startFen with the solver's orientation.
 *
 * Note: the opponent's trigger move is not stored in our PuzzleDefinition
 * (it was stripped during import). The startFen is the position before the
 * trigger, but our board shows it as-is. A future phase may animate the
 * trigger move if the original move is recoverable.
 */
export function startPuzzleRound(
  definition: PuzzleDefinition,
  redraw: () => void,
): PuzzleRoundCtrl {
  // Round change: drop any promotion pending from the previous round so its chooser can
  // never submit a move into this new round's board (sprint Decision 2 cancellation).
  puzzlePromotionCtrl?.reset();


  activeRoundCtrl?.invalidatePendingAssistance();
  activeRoundCtrl = new PuzzleRoundCtrl(definition, redraw);
  return activeRoundCtrl;
}

export function getActiveRoundCtrl(): PuzzleRoundCtrl | null {
  return activeRoundCtrl;
}



let _previewPuzzleId: string | null = null;
let _previewRoundCtrl: PuzzleRoundCtrl | null = null;

export function getPreviewPuzzleId(): string | null { return _previewPuzzleId; }
export function getPreviewRoundCtrl(): PuzzleRoundCtrl | null { return _previewRoundCtrl; }

export function clearPreview(): void {
  _previewPuzzleId = null;
  _previewRoundCtrl = null;
}

/**
 * Load a puzzle definition into the library preview mode.
 * Creates a view-only PuzzleRoundCtrl so navigation works without triggering solve logic.
 * Mirrors the Lichess pattern of using an existing ctrl in 'view' mode post-solve.
 */
export async function selectPuzzleForPreview(id: string, redraw: () => void): Promise<void> {
  // Persist the definition if it came from a shard (not yet in IDB)
  if (puzzleListState) {
    const def = puzzleListState.allForSource.find(p => p.id === id);
    if (def) await savePuzzleDefinition(def);
  }
  const def = await getPuzzleDefinition(id);
  if (!def) return;
  _previewPuzzleId = id;
  const rc = new PuzzleRoundCtrl(def, redraw);
  rc.mode = 'view'; // preview is view-only: no solve logic runs
  _previewRoundCtrl = rc;
  redraw();
}

/**
 * Mount a view-only preview board for the current preview puzzle.
 * Reuses the shared puzzleCg slot; shows start position with free exploration.
 * Adapted from mountPuzzleBoard, stripped of solve callbacks.
 */
export function mountPreviewBoard(el: HTMLElement, _redraw: () => void): void {
  const rc = _previewRoundCtrl;
  if (!rc) return;
  const setup = parseFen(rc.treeNode.fen);
  if (setup.isErr) return;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return;
  const dests = chessgroundDests(pos.value) as Map<Key, Key[]>;
  const turn: 'white' | 'black' = pos.value.turn;
  puzzleOrientation = rc.pov;
  puzzleCg?.destroy();
  puzzlePromotionCtrl = null; // preview board has no solve-move promotion flow
  puzzleCgAnimationScope = 'puzzle';
  puzzleCg = makeChessground(el, {
    orientation: puzzleOrientation,
    fen: rc.treeNode.fen,
    turnColor: turn,
    animation: puzzleBoardAnimationConfig(),
    movable: { free: false, color: 'both', dests, showDests: true },
    draggable: { enabled: true, showGhost: true },
    events: {},
  });
  bindBoardResizeHandle(el);
}

let state: PuzzlePageState = { view: 'library' };
let libraryCounts: LibraryCounts | undefined;
let roundState: PuzzleRoundState | null = null;

const MAX_PUZZLE_ROUND_ROUTE_ID_LENGTH = 80;

function decodePuzzleRoundRouteId(rawId: string): string | null {
  try {
    return decodeURIComponent(rawId);
  } catch {
    return null;
  }
}

function looksPuzzleRoundPayloadLike(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^[{\[]/.test(trimmed)) return true;
  if (/[\r\n]/.test(trimmed)) return true;
  if (/\b(FEN|PGN|Event|Site|Date)\b/i.test(trimmed)) return true;
  if (/^(1\.\s|\*)/.test(trimmed)) return true;
  if (/\b[prnbqkPRNBQK1-8]{1,8}\/[prnbqkPRNBQK1-8/]+\s[wb]\s[-KQkq]+\s[-a-h1-8]+\s\d+\s\d+\b/.test(trimmed)) {
    return true;
  }
  if (looksPuzzleRoundMoveArrayLike(trimmed)) return true;
  if (/^[A-Za-z0-9+/]{120,}={0,2}$/.test(trimmed)) return true;
  return false;
}

function looksPuzzleRoundMoveArrayLike(value: string): boolean {
  const parts = value
    .split(/[.,\s]+/)
    .map(part => part.trim())
    .filter(Boolean);
  if (parts.length < 2) return false;
  return parts.every(part => looksPuzzleRoundUciMoveLike(part) || looksPuzzleRoundSanMoveLike(part));
}

function looksPuzzleRoundUciMoveLike(value: string): boolean {
  return /^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(value);
}

function looksPuzzleRoundSanMoveLike(value: string): boolean {
  return /^(?:O-O(?:-O)?|0-0(?:-0)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?|[KQRBN]x?[a-h][1-8][+#]?)$/.test(value);
}

export function validatePuzzleRoundRouteId(rawId: string): PuzzleRoundRouteValidationResult {
  const decoded = decodePuzzleRoundRouteId(rawId);
  if (decoded === null) return { valid: false, id: null, reason: 'malformed' };

  const id = decoded.trim();
  if (!id) return { valid: false, id: null, reason: 'empty' };
  if (id.length > MAX_PUZZLE_ROUND_ROUTE_ID_LENGTH) return { valid: false, id: null, reason: 'too-long' };
  if (looksPuzzleRoundPayloadLike(id)) return { valid: false, id: null, reason: 'payload-like' };
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return { valid: false, id: null, reason: 'malformed' };

  return { valid: true, id };
}

function setPuzzleRoundRecoveryState(error: string, redraw: () => void): void {
  state = { view: 'round' };
  roundState = { definition: null, status: 'error', error };
  redraw();
}

function puzzleRoundRecoveryMessage(reason: PuzzleRoundRouteValidationFailure | 'missing'): string {
  if (reason === 'missing') return 'Could not restore this puzzle. It may have been deleted or is not available in this browser.';
  return 'Could not restore this puzzle. The puzzle link is invalid or no longer supported.';
}

export interface PuzzleRoundRouteOpenHooks {
  openRound?: (id: string, redraw: () => void) => Promise<void>;
  replaceRoute?: (route: string) => void;
  recover?: (message: string, reason: PuzzleRoundRouteValidationFailure, redraw: () => void) => void;
}

export type PuzzleRoundNavigationPolicy =
  | 'explicit-durable-selection'
  | 'generated-session-advancement';

export function puzzleRoundHashRoute(id: string): string {
  return `#/puzzles/${encodeURIComponent(id)}`;
}

export function writePuzzleRoundRoute(id: string, policy: PuzzleRoundNavigationPolicy): void {
  const route = puzzleRoundHashRoute(id);
  if (policy === 'generated-session-advancement') replaceHashRoute(route);
  else writeHashRoute(route);
}

interface GeneratedPuzzleRoundNavigationHooks extends PuzzleRoundRouteOpenHooks {
  saveDefinition?: (def: PuzzleDefinition) => Promise<void>;
  listDefinitions?: () => Promise<PuzzleDefinition[]>;
}

export async function openGeneratedPuzzleRoundRoute(
  id: string,
  redraw: () => void,
  hooks: PuzzleRoundRouteOpenHooks = {},
): Promise<PuzzleRoundRouteValidationResult> {
  const validation = validatePuzzleRoundRouteId(id);
  if (!validation.valid || !validation.id) {
    const reason = validation.reason ?? 'malformed';
    const message = puzzleRoundRecoveryMessage(reason);
    if (hooks.recover) hooks.recover(message, reason, redraw);
    else setPuzzleRoundRecoveryState(message, redraw);
    return validation;
  }

  const route = puzzleRoundHashRoute(validation.id);
  if (hooks.replaceRoute) hooks.replaceRoute(route);
  else replaceHashRoute(route);
  return openPuzzleRoundRoute(validation.id, '', redraw, hooks);
}

export function initPuzzleRoundShell(puzzleId?: string): void {
  const s: PuzzlePageState = { view: 'round' };
  if (puzzleId !== undefined) s.puzzleId = puzzleId;
  state = s;
}

export async function openPuzzleRoundRoute(
  rawId: string,
  rawQuery: string,
  redraw: () => void,
  hooks: PuzzleRoundRouteOpenHooks = {},
): Promise<PuzzleRoundRouteValidationResult> {
  const validation = validatePuzzleRoundRouteId(rawId);
  if (!validation.valid || !validation.id) {
    const reason = validation.reason ?? 'malformed';
    const message = puzzleRoundRecoveryMessage(reason);
    if (hooks.recover) hooks.recover(message, reason, redraw);
    else setPuzzleRoundRecoveryState(message, redraw);
    return validation;
  }

  if (rawQuery.trim()) {
    const route = puzzleRoundHashRoute(validation.id);
    if (hooks.replaceRoute) hooks.replaceRoute(route);
    else replaceHashRoute(route);
  }

  const openRound = hooks.openRound ?? openPuzzleRound;
  await openRound(validation.id, redraw);
  return validation;
}

interface PuzzleRoundOpenRuntimeHooks {
  getDefinition?: (id: string) => Promise<PuzzleDefinition | undefined>;
  initializePerf?: () => void;
  startRound?: (def: PuzzleDefinition, redraw: () => void) => void;
  recordSessionStart?: (id: string) => void;
  loadMeta?: (id: string) => Promise<PuzzleUserMeta>;
  dequeue?: (id: string) => void;
  loadPgn?: (def: PuzzleDefinition) => Promise<string | undefined>;
  prefetchPgns?: () => void;
}
let puzzleLibraryHydrationRun = 0;

type PuzzleRouteHydrationStalePredicate = () => boolean;

export function cancelPuzzleLibraryRouteHydration(): void {
  puzzleLibraryHydrationRun++;
}

interface ImportedSessionRouteSelection {
  themes: string[];
  openings: string[];
  ratingMin: number;
  ratingMax: number;
  tab: 'themes' | 'openings';
}

function dispatchImportedSessionRouteSelection(selection: ImportedSessionRouteSelection): void {
  window.dispatchEvent(new CustomEvent<ImportedSessionRouteSelection>('patzer:puzzle-imported-route-selection', {
    detail: selection,
  }));
}

// ---------------------------------------------------------------------------
// Session mode — rated vs practice
// Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleSession.scala
//
// This module-level flag owns whether the user is currently playing rated or
// practice. It persists across individual puzzle rounds within the same
// page session. Later prompts read it via getCurrentSessionMode() and set it
// via setSessionMode(). Individual PuzzleRoundCtrl instances copy it at
// construction time so the round owns its own immutable mode record.
// ---------------------------------------------------------------------------

let _currentSessionMode: PuzzleSessionMode = 'practice';

/** Return the current puzzle session mode (rated or practice). */
export function getCurrentSessionMode(): PuzzleSessionMode {
  return _currentSessionMode;
}

/**
 * Set the session mode. Affects newly opened puzzle rounds.
 * Switching to 'rated' is only meaningful for imported-lichess puzzles;
 * user-library rounds will still be treated as practice regardless.
 *
 * P2-PZ-9 (Q-PZ-4 option A, dormancy guard): the rated-mode UI entry points
 * (mode toggle, rated-stream card, rating display) have been removed from
 * view.ts, so there is no way to leave rated mode once in it. A 'rated'
 * value loaded/read from persisted state (e.g. a previously bookmarked or
 * hash-restored `#/puzzles?...&mode=rated` route) is normalized to
 * 'practice' here so no user is trapped in a mode with no UI. Rated logic,
 * Glicko data, attempts, and sync remain dormant and untouched elsewhere.
 */
export function setSessionMode(mode: PuzzleSessionMode): void {
  _currentSessionMode = mode === 'rated' ? 'practice' : mode;
}

// ---------------------------------------------------------------------------
// Rated puzzle stream — auto-advance session state
// Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleSession.scala
// (session tracking concept; Patzer uses client-side module state instead of
// a per-user server-side cache).
// ---------------------------------------------------------------------------

/** IDs of puzzles already served in the current stream session — excludes repeats. */
let _sessionSeenIds: Set<string> = new Set();
/** True while the user is in an active auto-advance rated stream. */
let _ratedStreamActive = false;
/** Number of puzzles served in the current stream session. */
let _ratedStreamCount = 0;
/** True if selectNextRatedPuzzle() returned null on the last stream attempt. */
let _emptyRatedStream = false;

export function isRatedStreamActive(): boolean { return _ratedStreamActive; }
export function getRatedStreamCount(): number { return _ratedStreamCount; }
export function isEmptyRatedStream(): boolean { return _emptyRatedStream; }

/**
 * Start an auto-advance rated stream session.
 * Sets session mode to 'rated', resets stream state, and opens the first puzzle.
 */
export async function startRatedSession(redraw: () => void): Promise<void> {
  _currentSessionMode = 'rated';
  _sessionSeenIds = new Set();
  _ratedStreamCount = 0;
  _ratedStreamActive = true;
  _emptyRatedStream = false;

  let def: PuzzleDefinition | null;
  try {
    def = await selectNextRatedPuzzle();
  } catch (e) {
    // selectNextRatedPuzzle() now rethrows genuine storage failures (BUG-2026-07-10-002) instead
    // of resolving an empty list; fall back to the existing empty-stream branch below.
    console.warn('[puzzle-ctrl] startRatedSession failed', e);
    def = null;
  }
  if (def) {
    _ratedStreamCount++;
    _sessionSeenIds.add(def.id);
    await openGeneratedPuzzleRoundRoute(def.id, redraw);
  } else {
    recordPuzzleSetEmpty('rated-stream');
    _emptyRatedStream = true;
    _ratedStreamActive = false;
    redraw();
  }
}

/**
 * Stop the rated stream without leaving rated mode.
 * The user remains in rated mode but auto-advance is disabled.
 */
export function stopRatedStream(): void {
  _ratedStreamActive = false;
  syncRatedLadder().catch(() => {});
}

// ---------------------------------------------------------------------------
// User puzzle rating calculator
// Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleFinisher.scala
// and modules/rating/src/main/Perf.scala (PerfExt.addOrReset)
// and chess.rating.glicko.GlickoCalculator
//
// Intentional Patzer divergence from full Lichess parity:
// - Only the USER rating updates; imported puzzle ratings stay fixed.
// - The full Lichess system updates both user and puzzle Glicko as a game.
//   Patzer treats the fixed puzzle rating as the "opponent" but does not
//   update it. This simplifies the system while preserving the signal.
// - dubiousPuzzle suppression is not implemented (single-user tool).
// ---------------------------------------------------------------------------

/**
 * Apply Glicko-2 updates to the user's puzzle perf after a rated solve.
 *
 * Lichess GlickoCalculator uses the formula from Glicko-2 paper (Glickman 2012).
 * We implement a simplified version that captures the key behaviours:
 * - win/loss probability based on rating difference
 * - deviation decay (larger deviation → bigger update)
 * - hard delta cap (maxRatingDelta = 700 per Glicko.scala)
 * - sanity check and cap on result (from GlickoExt)
 *
 * Returns the updated UserPuzzlePerf and the integer delta.
 */
export function computeRatedUpdate(
  perf: UserPuzzlePerf,
  puzzleRating: number,
  win: boolean,
  now: number,
): { newPerf: UserPuzzlePerf; delta: PuzzleRatingDelta } {
  const { rating, deviation, volatility } = perf.glicko;

  // Glicko-2 step 1: convert to mu/phi scale
  const MU_SCALE = 173.7178;
  const mu = (rating - 1500) / MU_SCALE;
  const phi = deviation / MU_SCALE;
  const mu_j = (puzzleRating - 1500) / MU_SCALE;
  // phi_j is the puzzle's deviation — Patzer uses a fixed approximation since
  // puzzle ratings are static. We use the standard default (c ≈ 0.0977 per period).
  const PHI_J_APPROX = 0.5;

  // Glicko-2 step 2: g function and E function
  const g = (p: number) => 1 / Math.sqrt(1 + 3 * p * p / (Math.PI * Math.PI));
  const E = (mu_i: number, mu_j: number, phi_j: number) =>
    1 / (1 + Math.exp(-g(phi_j) * (mu_i - mu_j)));

  const g_j = g(PHI_J_APPROX);
  const E_j = E(mu, mu_j, PHI_J_APPROX);
  const s_j = win ? 1 : 0;

  // Glicko-2 step 3: estimated variance v
  const v = 1 / (g_j * g_j * E_j * (1 - E_j));

  // step 4: delta (improvement)
  const delta = v * g_j * (s_j - E_j);

  // step 5: new phi* (phi with volatility update — simplified: use current volatility)
  const sigma_prime = volatility; // full volatility update (Illinois algorithm) deferred
  const phi_star = Math.sqrt(phi * phi + sigma_prime * sigma_prime);

  // step 6: new phi and mu
  const phi_prime = 1 / Math.sqrt(1 / (phi_star * phi_star) + 1 / v);
  const mu_prime = mu + phi_prime * phi_prime * g_j * (s_j - E_j);

  // Convert back to standard scale
  let newRating = mu_prime * MU_SCALE + 1500;
  let newDeviation = phi_prime * MU_SCALE;

  // Apply Lichess hard delta cap (maxRatingDelta = 700) — PerfExt.addOrReset
  newRating = Math.min(newRating, rating + PUZZLE_GLICKO_CAPS.maxRatingDelta);
  newRating = Math.max(newRating, rating - PUZZLE_GLICKO_CAPS.maxRatingDelta);

  // Clamp to cap values (GlickoExt.cap)
  newRating = Math.max(newRating, PUZZLE_GLICKO_CAPS.minRating);
  newRating = Math.min(newRating, PUZZLE_GLICKO_CAPS.maxRating);
  newDeviation = Math.max(newDeviation, PUZZLE_GLICKO_CAPS.minDeviation);
  newDeviation = Math.min(newDeviation, PUZZLE_GLICKO_CAPS.maxDeviation);

  // Sanity check (GlickoExt.sanityCheck): if values are wild, revert to default
  const sane =
    newRating > 0 && newRating < 4000 &&
    newDeviation > 0 && newDeviation < 1000 &&
    volatility > 0 && volatility < PUZZLE_GLICKO_CAPS.maxVolatility * 2;
  if (!sane) {
    newRating = rating; // do not apply insane update
    newDeviation = deviation;
  }

  const intRatingBefore = Math.round(rating);
  const intRatingAfter = Math.round(newRating);

  // Build the updated perf (matches PerfExt.addOrReset structure)
  const recentMaxSize = 12;
  const newRecent = [intRatingAfter, ...perf.recent].slice(0, recentMaxSize);
  const newPerf: UserPuzzlePerf = {
    glicko: { rating: newRating, deviation: newDeviation, volatility },
    nb: perf.nb + 1,
    recent: newRecent,
    latest: now,
  };

  const ratingDelta: PuzzleRatingDelta = {
    delta: intRatingAfter - intRatingBefore,
    ratingBefore: intRatingBefore,
    ratingAfter: intRatingAfter,
  };

  return { newPerf, delta: ratingDelta };
}

// ---------------------------------------------------------------------------
// Rated difficulty — module-level setting, persisted per-session only
// ---------------------------------------------------------------------------

let _currentDifficulty: PuzzleDifficulty = DEFAULT_PUZZLE_DIFFICULTY;

export function getCurrentDifficulty(): PuzzleDifficulty { return _currentDifficulty; }
export function setDifficulty(d: PuzzleDifficulty): void { _currentDifficulty = d; }

// ---------------------------------------------------------------------------
// Rating-aware puzzle selection
// Adapted from lichess-org/lila: modules/puzzle/src/main/PuzzleSelector.scala
// and modules/puzzle/src/main/PuzzleDifficulty.scala
//
// Simplified vs Lichess: no MongoDB path/tier infrastructure. We load from
// the in-memory shard cache (filtered by rating window) and pick randomly
// from eligible candidates. Lichess uses path-based sequential IDs;
// Patzer uses random selection within a rating band.
// ---------------------------------------------------------------------------

/** Rating window half-width for initial puzzle selection. */
const RATED_SELECTION_WINDOW = 100;
/** Widened window used when no eligible puzzles found in initial window. */
const RATED_SELECTION_WINDOW_WIDE = 250;

/**
/**
 * Select the next rated puzzle for the current user.
 *
 * Algorithm:
 * 1. Compute target rating = user rating + difficulty offset
 * 2. Search IDB definitions for imported-lichess puzzles within ±window of target
 * 3. Filter by rated eligibility (already-solved / recent-failure-cooldown)
 *    and session exclusion list (_sessionSeenIds)
 * 4. If none found: fall back to shard files (findRatedPuzzleInShards)
 * 5. Widen window once and retry both paths if still nothing
 * 6. Return null if all paths miss
 *
 * Lichess uses path-based sequential IDs; Patzer uses random selection within
 * a rating band (IDB first, shard fallback second).
 */
export async function selectNextRatedPuzzle(): Promise<PuzzleDefinition | null> {
  const perf = _currentUserPerf;
  const userRating = Math.round(perf.glicko.rating);
  const offset = PUZZLE_DIFFICULTY_OFFSETS[_currentDifficulty];
  const targetRating = userRating + offset;

  let allDefs: PuzzleDefinition[];
  try {
    allDefs = await listPuzzleDefinitions();
  } catch (e) {
    recordPuzzleLoadFail(e, 'rated-stream');
    throw e;
  }
  const importedDefs = allDefs.filter(d => d.sourceKind === 'imported-lichess');
  if (importedDefs.length === 0) recordPuzzleSetEmpty('rated-stream');

  async function pickFromIdb(window: number): Promise<PuzzleDefinition | null> {
    const rMin = targetRating - window;
    const rMax = targetRating + window;
    const candidates = importedDefs.filter(d => {
      const r = (d as { rating?: number }).rating;
      return typeof r === 'number' && r >= rMin && r <= rMax && !_sessionSeenIds.has(d.id);
    });
    if (candidates.length === 0) return null;

    // Filter by rated eligibility — check in random order to avoid bias
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    for (const def of shuffled) {
      const eligibility = await getPuzzleRatedEligibility(def.id);
      if (eligibility.eligible) return def;
    }
    return null;
  }

  // IDB path (narrow window)
  let result = await pickFromIdb(RATED_SELECTION_WINDOW);
  if (result) return result;

  // Shard fallback (narrow window)
  try {
    result = await findRatedPuzzleInShards(targetRating, RATED_SELECTION_WINDOW, _sessionSeenIds);
  } catch (e) {
    recordPuzzleLoadFail(e, 'rated-stream');
    throw e;
  }
  if (result) return result;

  // IDB path (wide window)
  result = await pickFromIdb(RATED_SELECTION_WINDOW_WIDE);
  if (result) return result;

  // Shard fallback (wide window)
  try {
    const fallback = await findRatedPuzzleInShards(targetRating, RATED_SELECTION_WINDOW_WIDE, _sessionSeenIds);
    if (!fallback) recordPuzzleSetEmpty('rated-stream');
    return fallback;
  } catch (e) {
    recordPuzzleLoadFail(e, 'rated-stream');
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Rated eligibility — source gating
// Only imported-lichess puzzles may enter rated flow.
// User-library puzzles are practice-only regardless of session mode.
// ---------------------------------------------------------------------------









export function getPuzzleSourceEligibility(def: PuzzleDefinition): RatedEligibility {
  if (def.sourceKind !== 'imported-lichess') {
    return { eligible: false, reason: 'source-not-rated' as NonRatedReason };
  }
  return { eligible: true };
}

// ---------------------------------------------------------------------------
// User puzzle perf — local restore seam
// Loaded once when the puzzle subsystem initializes.
// All rated-mode code reads/writes this module-level value and persists
// via saveUserPuzzlePerf(). Nothing in main.ts manages this.
// ---------------------------------------------------------------------------

let _currentUserPerf: UserPuzzlePerf = { ...DEFAULT_USER_PUZZLE_PERF };

/** Return the current cached UserPuzzlePerf. */
export function getCurrentUserPerf(): UserPuzzlePerf {
  return _currentUserPerf;
}

/** Update the cached perf and persist it to IDB. */
export async function persistUserPerf(perf: UserPuzzlePerf): Promise<void> {
  _currentUserPerf = perf;
  await saveUserPuzzlePerf(perf);
}

/**
 * Load the user's puzzle perf from IDB into module-level state.
 * Called once during puzzle subsystem initialisation (from initPuzzlePage
 * or route entry). Safe to call multiple times.
 */
export async function loadUserPerfFromStorage(): Promise<void> {
  _currentUserPerf = await getUserPuzzlePerf();
}

function initializePuzzlePerfFromStorage(): void {
  loadUserPerfFromStorage().catch(e => console.warn('[puzzle] loadUserPerfFromStorage failed', e));
  syncRatedLadder()
    .then(() => loadUserPerfFromStorage())
    .catch(e => console.warn('[puzzle] syncRatedLadder failed', e));
}

export function initPuzzlePage(view: PuzzleView, puzzleId?: string): void {
  const s: PuzzlePageState = { view };
  if (puzzleId !== undefined) s.puzzleId = puzzleId;
  state = s;
  // Load the user's puzzle rating from IDB in the background.
  // The perf is available immediately via getCurrentUserPerf() (returns the
  // cached default until the async load completes).
  initializePuzzlePerfFromStorage();
}

export function getPuzzlePageState(): PuzzlePageState {
  return state;
}

export function getLibraryCounts(): LibraryCounts | undefined {
  return libraryCounts;
}

// --- Puzzle round ---

export function getPuzzleRoundState(): PuzzleRoundState | null {
  return roundState;
}









let _puzzleRoundLoadGeneration = 0;

/**
 * Load a puzzle definition from IDB and transition to the round view.
 * Calls redraw once the definition is loaded (or on error).
 * Idempotent — skips if already loading/loaded for the same puzzle id.
 */
async function openPuzzleRoundWithRuntimeHooks(
  id: string,
  redraw: () => void,
  hooks: PuzzleRoundOpenRuntimeHooks = {},
): Promise<void> {
  const validation = validatePuzzleRoundRouteId(id);
  if (!validation.valid || !validation.id) {


    activeRoundCtrl?.markDestroyed();
    setPuzzleRoundRecoveryState(puzzleRoundRecoveryMessage(validation.reason ?? 'malformed'), redraw);
    return;
  }
  id = validation.id;

  // Any real navigation into a puzzle round dismisses a stale retry/due-review
  // completion screen (BUG-2026-07-05-016) so it never shadows the new view.
  retryQueueCompletion = null;

  // Avoid re-fetching if we already have the right puzzle loaded or loading
  if (roundState && state.puzzleId === id && roundState.status !== 'error') return;

  performance.mark('puzzle-load-start');








  const loadGeneration = ++_puzzleRoundLoadGeneration;
  const outgoingCtrl = activeRoundCtrl;
  state = { view: 'round', puzzleId: id };
  roundState = { definition: null, status: 'loading' };
  redraw();

  try {
    const def = await (hooks.getDefinition ?? getPuzzleDefinition)(id);




    if (loadGeneration !== _puzzleRoundLoadGeneration) return;
    if (!def) {
      recordPuzzleLoadFail(new Error('PuzzleDefinitionNotFound'), 'round-idb');
      roundState = { definition: null, status: 'error', error: puzzleRoundRecoveryMessage('missing') };




      if (outgoingCtrl !== null && activeRoundCtrl === outgoingCtrl) {
        outgoingCtrl.markDestroyed();
      }
    } else {
      roundState = { definition: def, status: 'ready' };
      (hooks.initializePerf ?? initializePuzzlePerfFromStorage)();
      (hooks.startRound ?? startPuzzleRound)(def, redraw);
      (hooks.recordSessionStart ?? sessionRecordStart)(def.id);
      // Pre-load user metadata for the editing surface
      (hooks.loadMeta ?? loadPuzzleMeta)(id).then(() => redraw());
      // Fetch full game PGN in the background — available for post-solve tree exploration
      (hooks.dequeue ?? dequeueSessionPuzzle)(def.id);
      (hooks.loadPgn ?? loadPuzzlePgn)(def).then(pgn => {
        console.log('[pgn] loadPuzzlePgn resolved', { pgn: !!pgn, defId: def.id, ctrlId: activeRoundCtrl?.definition.id });
        if (pgn && activeRoundCtrl?.definition.id === def.id) {
          activeRoundCtrl.gamePgn = pgn;
          activeRoundCtrl['_pgnHeaders'] = undefined; // invalidate lazy cache
          const treeOk = activeRoundCtrl.loadGameTree();
          console.log('[pgn] loadGameTree result', treeOk);
          redraw();
        }
      });
      // Prefetch PGNs for next puzzles in the session
      (hooks.prefetchPgns ?? prefetchSessionPgns)();
    }
  } catch (e) {
    // Diagnostics always record genuine load failures, even for superseded loads.
    recordPuzzleLoadFail(e, 'round-idb');

    if (loadGeneration !== _puzzleRoundLoadGeneration) return;
    roundState = {
      definition: null,
      status: 'error',
      error: e instanceof Error ? e.message : 'Failed to load puzzle',
    };

    if (outgoingCtrl !== null && activeRoundCtrl === outgoingCtrl) {
      outgoingCtrl.markDestroyed();
    }
  } finally {
    performance.mark('puzzle-load-end');
  }
  redraw();
}

export async function openPuzzleRound(id: string, redraw: () => void): Promise<void> {
  return openPuzzleRoundWithRuntimeHooks(id, redraw);
}

export async function __testOpenPuzzleRoundWithHooks(
  id: string,
  redraw: () => void,
  hooks: PuzzleRoundOpenRuntimeHooks,
): Promise<void> {
  return openPuzzleRoundWithRuntimeHooks(id, redraw, hooks);
}

// --- Puzzle board ---
// Puzzle-local Chessground instance. Kept separate from the analysis board's
// cgInstance so the two products don't interfere when only one is active.
// Mirrors lichess-org/lila: ui/puzzle/src/view/chessground.ts (per-puzzle CG lifecycle)

let puzzleCg: CgApi | undefined;
let puzzleOrientation: 'white' | 'black' = 'white';
let puzzleCgAnimationScope: 'puzzle' | 'static' = 'static';

/**
 * Puzzle-owned promotion chooser controller (board-neutral module, src/board/promotion.ts).
 * Instantiated per mounted solve board so it can read the live `puzzleCg`. Cleared on
 * round change (startPuzzleRound) and board destroy so a pending chooser never survives
 * into the next round. Rendered beside the puzzle `.cg-wrap` via renderPuzzlePromotion().
 */
let puzzlePromotionCtrl: PromotionCtrl | null = null;

export function getPuzzleCg(): CgApi | undefined { return puzzleCg; }
export function getPuzzleOrientation(): 'white' | 'black' { return puzzleOrientation; }

/** Test/inspection seam for the active puzzle promotion controller. */
export function getPuzzlePromotionCtrl(): PromotionCtrl | null { return puzzlePromotionCtrl; }

/** Render the pending promotion chooser (or null), for placement beside the puzzle board. */
export function renderPuzzlePromotion(): VNode | null {
  return puzzlePromotionCtrl ? puzzlePromotionCtrl.view() : null;
}

/** UCI promotion suffix char for a chosen role ('queen'→'q', 'knight'→'n', …). */
function roleToUciChar(role: Role): string {
  return roleToChar(role);
}

/**
 * Apply a user board move for the current round — the single routing point shared by the
 * plain move handler and the promotion chooser's submit hook. When `promotionRole` is set
 * the move is submitted as a suffixed UCI (e.g. e7e8q) so no path can play an unsuffixed
 * back-rank pawn move into a position.
 */
function handlePuzzleMove(
  rc: PuzzleRoundCtrl,
  orig: string,
  dest: string,
  redraw: () => void,
  promotionRole?: Role,
): void {
  const uci = `${orig}${dest}${promotionRole ? roleToUciChar(promotionRole) : ''}`;

  // Post-solve or analysis mode: add variation to tree
  if (rc.mode === 'view' || rc.analysisMode) {
    const newNode = rc.addVariationMove(uci);
    if (newNode) {
      playMoveSound(newNode.san);
      syncPuzzleBoard();
    }
    redraw();
    return;
  }

  if (rc.status !== 'playing') return;

  const result = rc.submitUserMove(uci);

  if (result.accepted) {
    // submitUserMove may transition status to 'solved'; cast defeats stale narrowing.
    if ((rc as PuzzleRoundCtrl).status === 'solved') {
      redraw();
      return;
    }
    // Correct move — schedule opponent reply
    setTimeout(() => {




      if (rc.isStaleRound()) return;
      rc.playOpponentReply();
    }, 300);
  } else {
    redraw();
  }
}

/**
 * Initialize (or reinitialize) the Chessground board for the current puzzle.
 * Call this from a Snabbdom insert hook once the DOM element is available.
 * Mirrors lichess-org/lila: ui/puzzle/src/view/chessground.ts makeConfig
 */
export function mountPuzzleBoard(el: HTMLElement, redraw: () => void): void {
  const def = roundState?.definition;
  if (!def) return;

  // Determine orientation from round controller's pov (solver's color).
  // In our model startFen has the opponent to move (trigger move side).
  // The solver plays the opposite color.
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts makeCgOpts + initiate
  const rc = getActiveRoundCtrl();
  const setup = parseFen(def.startFen);
  if (setup.isErr) {
    console.error('[puzzle-ctrl] invalid startFen', def.startFen);
    return;
  }
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) {
    console.error('[puzzle-ctrl] invalid position from startFen', def.startFen);
    return;
  }
  const turn: 'white' | 'black' = pos.value.turn;
  // Use round ctrl pov if available; otherwise derive from FEN
  puzzleOrientation = rc ? rc.pov : (turn === 'white' ? 'black' : 'white');

  // The solver's color for movable config — solver moves after the trigger
  const solverColor = puzzleOrientation;

  // Compute legal destinations for the starting position
  const dests = chessgroundDests(pos.value) as Map<Key, Key[]>;

  // Destroy previous instance if any
  puzzleCg?.destroy();
  puzzleCgAnimationScope = 'puzzle';

  // The board starts at startFen showing the solver's orientation.
  // Moves are validated against the stored solution line via PuzzleRoundCtrl.
  // Adapted from lichess-org/lila: ui/puzzle/src/view/chessground.ts
  puzzleCg = makeChessground(el, {
    orientation: puzzleOrientation,
    fen: def.startFen,
    turnColor: turn,
    viewOnly: false,
    movable: {
      free: false,
      // Trigger-less rounds (user-library / LFYM-saved puzzles) are live at mount:
      // the solver plays the first move, so configure the solver color + legal dests
      // immediately using the values already computed above. When a trigger move is
      // present, the board stays locked at mount (empty dests, color omitted) until the
      // trigger animation below applies the post-trigger movable config — this is what
      // preserves the double-count guard (the trigger uses cg.set(), not cg.move()).
      // Regression provenance: b598b2c76 unconditionally used the empty map here.
      // (color is omitted rather than set undefined for exactOptionalPropertyTypes.)
      ...(def.triggerMove ? {} : { color: solverColor }),
      dests: def.triggerMove ? new Map<Key, Key[]>() : dests,
      showDests: true,
    },
    drawable: { enabled: true },
    animation: puzzleBoardAnimationConfig(),
    events: {
      move: (orig, dest, _capturedPiece) => {
        if (!rc) return;
        // Pawn-to-back-rank → open the promotion chooser; the chooser's submit hook
        // routes the SUFFIXED UCI back through handlePuzzleMove. No auto-queen shortcut.
        if (puzzlePromotionCtrl && puzzlePromotionCtrl.start(orig as Key, dest as Key)) return;
        handlePuzzleMove(rc, orig, dest, redraw);
      },
    },
  });

  // Attach resize handle
  bindBoardResizeHandle(el);

  // Instantiate the puzzle-owned promotion chooser bound to the freshly mounted board.
  // The submit hook resolves the active round at selection time; cancel restores the
  // board to the live position.
  puzzlePromotionCtrl = new PromotionCtrl({
    withGround: <A,>(f: (g: CgApi) => A) => (puzzleCg ? f(puzzleCg) : undefined),
    orientation: () => puzzleOrientation,
    redraw,
    cancel: () => { syncPuzzleBoard(); },
    submit: (promoOrig, promoDest, role) => {
      const active = getActiveRoundCtrl();
      if (active) handlePuzzleMove(active, promoOrig, promoDest, redraw, role);
    },
  });

  // --- Trigger move: show the opponent's last move before the puzzle ---
  // Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts playInitialMove
  // Instead of cg.move() (which fires the move event and causes double-counting),
  // compute the post-trigger position and set it directly with lastMove highlight.
  if (def.triggerMove) {
    setTimeout(() => {





      if (rc && rc.isStaleRound()) return;
      const cg = getPuzzleCg();
      if (!cg) return;
      // Play trigger move sound
      const prePos = positionAfterMoves(def.startFen, []);
      if (prePos) playMoveSound(uciToSanAtPos(prePos, def.triggerMove!));
      const triggerPos = positionAfterMoves(def.startFen, [def.triggerMove!]);
      if (!triggerPos) return;
      const orig = def.triggerMove!.slice(0, 2) as Key;
      const dest = def.triggerMove!.slice(2, 4) as Key;
      const dests = chessgroundDests(triggerPos) as Map<Key, Key[]>;
      const solverColor = rc ? rc.pov : triggerPos.turn;
      cg.set({
        fen: makeFen(triggerPos.toSetup()),
        turnColor: triggerPos.turn,
        lastMove: [orig, dest],
        movable: {
          color: solverColor,
          dests,
          showDests: true,
        },
      });
      redraw();
    }, 500);
  }

  // Enable "View the solution" button after 4 seconds (matches Lichess gating)
  if (rc) {
    setTimeout(() => {



      if (rc.isStaleRound()) return;
      if (rc.mode !== 'view') {
        rc.canViewSolution = true;
        redraw();
      }
    }, 4000);
  }
}













export function destroyPuzzleBoard(forCtrl?: PuzzleRoundCtrl): void {
  puzzleCg?.destroy();
  puzzleCg = undefined;
  puzzleCgAnimationScope = 'static';
  // Clear any pending promotion so a chooser never survives a board teardown.
  puzzlePromotionCtrl = null;

  forCtrl?.markDestroyed();
}

/**
 * Navigate the puzzle tree to a given path and sync the board.
 * During play, restricts navigation to already-played moves.
 * Post-solve, allows free navigation.
 */
export function puzzleNavigate(path: TreePath, redraw: () => void): void {
  const rc = activeRoundCtrl;
  if (!rc) return;
  // During play (not analysis mode), don't allow tree navigation
  if (rc.mode !== 'view' && !rc.analysisMode) return;
  rc.setTreePath(path);
  syncPuzzleBoard();
  redraw();
}

/**
 * Sync the puzzle Chessground board to the current tree node.
 */
export function syncPuzzleBoard(rcOverride?: PuzzleRoundCtrl): void {
  const cg = puzzleCg;
  const rc = rcOverride ?? activeRoundCtrl;
  if (!cg || !rc) return;

  // Context-peek mode: show a game-tree position as read-only.
  // The user is browsing pre-puzzle game moves without affecting puzzle state.
  if (rc.contextPeekPath !== null && rc.gameTree) {
    const ctxNode = nodeAtPath(rc.gameTree, rc.contextPeekPath);
    if (ctxNode) {
      const ctxSetup = parseFen(ctxNode.fen);
      let ctxTurn: 'white' | 'black' = 'white';
      if (ctxSetup.isOk) {
        const ctxPos = Chess.fromSetup(ctxSetup.value);
        if (ctxPos.isOk) ctxTurn = ctxPos.value.turn;
      }
      const ctxCfg: Record<string, unknown> = {
        fen: ctxNode.fen,
        animation: puzzleBoardAnimationConfig(),
        turnColor: ctxTurn,
        movable: { color: rc.pov, dests: new Map<Key, Key[]>() },
      };
      if (ctxNode.uci) {
        ctxCfg.lastMove = [ctxNode.uci.slice(0, 2) as Key, ctxNode.uci.slice(2, 4) as Key];
      }
      cg.set(ctxCfg as Parameters<typeof cg.set>[0]);
      return;
    }
  }

  const node = rc.treeNode;
  const setup = parseFen(node.fen);
  if (setup.isErr) return;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return;
  const turn: 'white' | 'black' = pos.value.turn;
  const movableColor = (rc.mode === 'view' || rc.analysisMode) ? 'both' as const : rc.pov;
  // When browsed away from the live position during play, pass empty dests to prevent
  // accidental moves from a position that isn't the current solve state.
  const isBrowsed = rc.mode !== 'view' && !rc.analysisMode && rc.treePath !== rc.livePath;
  const dests = isBrowsed ? new Map<Key, Key[]>() : (chessgroundDests(pos.value) as Map<Key, Key[]>);
  const setCfg: Record<string, unknown> = {
    fen: node.fen,
    animation: puzzleBoardAnimationConfig(),
    turnColor: turn,
    movable: { color: movableColor, dests },
  };
  if (node.uci) {
    setCfg.lastMove = [node.uci.slice(0, 2) as Key, node.uci.slice(2, 4) as Key];
  }
  cg.set(setCfg as Parameters<typeof cg.set>[0]);
}

// ---------------------------------------------------------------------------
// Keyboard navigation — Adapted from lichess-org/lila: ui/puzzle/src/control.ts
// prev/next/first/last work across context-peek, puzzle tree, and analysis mode.
// ---------------------------------------------------------------------------

/**
 * Preview a pre-puzzle game position read-only.
 * Sets contextPeekPath and updates the board without affecting puzzle state.
 * Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts userJump (backward navigation)
 */
export function peekPuzzleContext(gameTreePath: TreePath, redraw: () => void): void {
  const rc = activeRoundCtrl;
  if (!rc || !rc.gameTree) return;
  rc.contextPeekPath = gameTreePath;
  syncPuzzleBoard();
  redraw();
}

/**
 * Navigate backward: through puzzle tree, then into context-peek if at root.
 * Adapted from lichess-org/lila: ui/puzzle/src/control.ts prev
 */
export function puzzlePrev(redraw: () => void): void {
  const rc = activeRoundCtrl;
  if (!rc) return;

  if (rc.contextPeekPath !== null) {
    // Backward within context (game tree before puzzle start)
    const parent = pathInit(rc.contextPeekPath);
    if (parent === rc.contextPeekPath) return; // already at game root
    rc.contextPeekPath = parent;
    syncPuzzleBoard();
    redraw();
    return;
  }

  if (rc.treePath === '') {
    // At puzzle tree root — enter context peek at puzzle start in game tree
    if (rc.gameTree && rc.gameTreePuzzlePath !== null) {
      rc.contextPeekPath = rc.gameTreePuzzlePath;
      syncPuzzleBoard();
      redraw();
    }
    return;
  }

  // Backward within puzzle tree (always safe — root/trigger are already-known positions)
  rc.setTreePath(pathInit(rc.treePath));
  syncPuzzleBoard();
  redraw();
}

/**
 * Navigate forward: through context-peek into puzzle tree, then advance played moves.
 * During play, only advances to positions at or before the live path.
 * Adapted from lichess-org/lila: ui/puzzle/src/control.ts next
 */
export function puzzleNext(redraw: () => void): void {
  const rc = activeRoundCtrl;
  if (!rc) return;

  if (rc.contextPeekPath !== null && rc.gameTree) {
    const ctxNode = nodeAtPath(rc.gameTree, rc.contextPeekPath);
    const child = ctxNode?.children[0];
    if (child) {
      // Advance within context
      rc.contextPeekPath = rc.contextPeekPath + child.id;
      syncPuzzleBoard();
      redraw();
    } else {
      // End of context — transition to puzzle tree root (same FEN as last context node)
      rc.contextPeekPath = null;
      syncPuzzleBoard();
      redraw();
    }
    return;
  }

  const child = rc.treeNode.children[0];
  if (!child) return;
  const nextPath = rc.treePath + child.id;

  if (rc.mode === 'view' || rc.analysisMode) {
    rc.setTreePath(nextPath);
    syncPuzzleBoard();
    redraw();
    return;
  }

  // During play: only advance toward the live (confirmed) position
  if (rc.livePath.startsWith(nextPath)) {
    rc.setTreePath(nextPath);
    syncPuzzleBoard();
    redraw();
  }
}

/**
 * Jump to the start (puzzle tree root = position before trigger).
 * Adapted from lichess-org/lila: ui/puzzle/src/control.ts first
 */
export function puzzleFirst(redraw: () => void): void {
  const rc = activeRoundCtrl;
  if (!rc) return;
  rc.setTreePath(''); // clears contextPeekPath via setTreePath
  syncPuzzleBoard();
  redraw();
}

/**
 * Jump to the end of already-played moves (live path during play, full mainline post-solve).
 * Adapted from lichess-org/lila: ui/puzzle/src/control.ts last
 */
export function puzzleLast(redraw: () => void): void {
  const rc = activeRoundCtrl;
  if (!rc) return;
  if (rc.mode === 'view' || rc.analysisMode) {
    const mainline = mainlineNodeList(rc.treeRoot);
    let path = '';
    for (const node of mainline.slice(1)) path += node.id;
    rc.setTreePath(path);
  } else {
    rc.setTreePath(rc.livePath);
  }
  syncPuzzleBoard();
  redraw();
}

/**
 * Mount an idle/decorative board for the library view.
 * Shows the standard starting position with no interaction.
 * Reuses the same puzzleCg slot so only one Chessground exists at a time.
 */
export function mountIdleBoard(el: HTMLElement): void {
  if (puzzleCg) { puzzleCg.destroy(); puzzleCg = undefined; }
  puzzlePromotionCtrl = null; // idle board is view-only, no promotion flow
  puzzleCgAnimationScope = 'static';
  puzzleCg = makeChessground(el, {
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    orientation: 'white',
    viewOnly: true,
    coordinates: true,
    animation: { enabled: false },
    drawable: { enabled: false },
  });
}

onBoardAnimationChange('puzzle', () => {
  if (puzzleCgAnimationScope !== 'puzzle') return;
  puzzleCg?.set({ animation: puzzleBoardAnimationConfig() });
});

// --- User metadata (favorites, notes, tags, folders) ---
// Thin cache layer over PuzzleUserMeta IDB records.
// Loaded once per round open; mutated by the metadata editing UI and saved back.

let metaCache: Map<string, PuzzleUserMeta> = new Map();

function defaultMeta(puzzleId: string): PuzzleUserMeta {
  return { puzzleId, folders: [], favorite: false, updatedAt: Date.now() };
}

export function getCachedMeta(puzzleId: string): PuzzleUserMeta | undefined {
  return metaCache.get(puzzleId);
}

export async function loadPuzzleMeta(puzzleId: string): Promise<PuzzleUserMeta | undefined> {
  try {
    const meta = await getMeta(puzzleId);
    if (meta) metaCache.set(puzzleId, meta);
    return meta;
  } catch (e) {
    console.warn('[puzzle-meta] loadPuzzleMeta failed', e);
    return undefined;
  }
}

export async function savePuzzleMeta(meta: PuzzleUserMeta): Promise<void> {
  meta.updatedAt = Date.now();
  metaCache.set(meta.puzzleId, meta);
  try {
    await saveMeta(meta);
  } catch (e) {
    console.warn('[puzzle-meta] savePuzzleMeta failed', e);
  }
}

export async function toggleFavorite(puzzleId: string, redraw: () => void): Promise<void> {
  let meta = metaCache.get(puzzleId) ?? (await getMeta(puzzleId)) ?? defaultMeta(puzzleId);
  meta = { ...meta, favorite: !meta.favorite };
  await savePuzzleMeta(meta);
  redraw();
}

/**
 * Get or create a PuzzleUserMeta for editing. Ensures the cache always has a
 * record for the given puzzleId so the editing UI can bind to it directly.
 */
export function getOrCreateMeta(puzzleId: string): PuzzleUserMeta {
  let meta = metaCache.get(puzzleId);
  if (!meta) {
    meta = defaultMeta(puzzleId);
    metaCache.set(puzzleId, meta);
  }
  return meta;
}

// --- Library counts ---

/**
 * Load puzzle counts from IndexedDB, grouped by sourceKind.
 * Calls redraw when complete so the view reflects the loaded data.
 */
export async function loadLibraryCounts(redraw: () => void): Promise<void> {
  try {
    // Count user-library puzzles using sourceKind index — avoids loading all records.
    const user = await countPuzzleDefinitionsBySource('user-library');
    // Imported count: use manifest totalCount (the full Lichess database)
    let imported = 0;
    try {
      const manifest = await loadManifest();
      imported = manifest.totalCount;
    } catch {
      recordPuzzleLoadFail(new Error('PuzzleManifestLoadFailed'), 'library-counts');
      // Manifest not available — fall back to IDB count by source
      imported = await countPuzzleDefinitionsBySource('imported-lichess');
    }
    libraryCounts = { imported, user };
    if (imported === 0 && user === 0) recordPuzzleSetEmpty('library-counts');
  } catch (e) {
    recordPuzzleLoadFail(e, 'library-counts');
    console.warn('[puzzle-ctrl] loadLibraryCounts failed', e);
    libraryCounts = { imported: 0, user: 0 };
  }
  redraw();
}

// ---------------------------------------------------------------------------
// Puzzle list browsing
// ---------------------------------------------------------------------------

const LIST_PAGE_SIZE = 50;
let puzzleListState: PuzzleListState | null = null;

export function getPuzzleListState(): PuzzleListState | null {
  return puzzleListState;
}

/**
 * Close the puzzle list view and return to the library.
 */
export function closePuzzleList(redraw: () => void): void {
  puzzleListState = null;
  replaceHashRoute('#/puzzles');
  redraw();
}

function currentPuzzleLibraryRouteState(): PuzzleRouteState {
  const routeState = defaultPuzzleRouteState();
  if (!puzzleListState) return routeState;
  routeState.source = puzzleListState.source;
  routeState.ratingMin = puzzleListState.filters.ratingMin ?? routeState.ratingMin;
  routeState.ratingMax = puzzleListState.filters.ratingMax ?? routeState.ratingMax;
  routeState.theme = puzzleListState.filters.theme ?? null;
  routeState.opening = puzzleListState.filters.opening ?? null;
  routeState.sort = puzzleListState.sort;
  routeState.page = puzzleListState.page;
  routeState.difficulty = _currentDifficulty;
  routeState.mode = puzzleListState.source === 'imported-lichess' ? _currentSessionMode : 'practice';
  return routeState;
}

function replacePuzzleLibraryRoute(state: PuzzleRouteState): void {
  replaceHashRoute(serializePuzzleRouteState(state));
}

function replaceCurrentPuzzleLibraryRoute(): void {
  replacePuzzleLibraryRoute(currentPuzzleLibraryRouteState());
}

export function replacePuzzleImportedLibraryRoute(selection: {
  themes: string[];
  openings: string[];
  ratingMin: number;
  ratingMax: number;
}): void {
  const routeState = defaultPuzzleRouteState();
  routeState.source = 'imported-lichess';
  routeState.theme = selection.themes.length === 1 ? selection.themes[0]! : null;
  routeState.opening = selection.openings.length === 1 ? selection.openings[0]! : null;
  routeState.ratingMin = selection.ratingMin;
  routeState.ratingMax = selection.ratingMax;
  routeState.difficulty = _currentDifficulty;
  routeState.mode = _currentSessionMode;
  routeState.page = puzzleListState?.source === 'imported-lichess' ? puzzleListState.page : 1;
  replacePuzzleLibraryRoute(routeState);
}

/**
 * Apply client-side filters to the loaded puzzle pool.
 * Resets visible page to 1.
 */
function applyListFilters(ls: PuzzleListState): void {
  let filtered = ls.allForSource;

  if (ls.filters.ratingMin !== undefined) {
    filtered = filtered.filter(p =>
      p.sourceKind === 'imported-lichess' ? p.rating >= ls.filters.ratingMin! : true,
    );
  }
  if (ls.filters.ratingMax !== undefined) {
    filtered = filtered.filter(p =>
      p.sourceKind === 'imported-lichess' ? p.rating <= ls.filters.ratingMax! : true,
    );
  }
  if (ls.filters.theme) {
    const theme = ls.filters.theme;
    filtered = filtered.filter(p =>
      p.sourceKind === 'imported-lichess' ? p.themes.includes(theme) : false,
    );
  }
  if (ls.filters.opening) {
    const opening = ls.filters.opening;
    filtered = filtered.filter(p =>
      p.sourceKind === 'imported-lichess' ? p.openingTags.includes(opening) : false,
    );
  }

  ls.filtered = filtered;
  ls.page = 1;
  applyPuzzleListSort(ls);
  ls.visible = filtered.slice(0, ls.pageSize);
}

function applyPuzzleListSort(ls: PuzzleListState): void {
  const sort = ls.sort;
  ls.filtered.sort((a, b) => {
    if (sort === 'rating.asc' || sort === 'rating.desc') {
      const ar = a.sourceKind === 'imported-lichess' ? a.rating : 0;
      const br = b.sourceKind === 'imported-lichess' ? b.rating : 0;
      return sort === 'rating.asc' ? ar - br : br - ar;
    }
    if (sort === 'title.asc' || sort === 'title.desc') {
      const at = puzzleTitleForSort(a);
      const bt = puzzleTitleForSort(b);
      return sort === 'title.asc' ? at.localeCompare(bt) : bt.localeCompare(at);
    }
    if (sort === 'created.asc') return a.createdAt - b.createdAt;
    return b.createdAt - a.createdAt;
  });
}

function puzzleTitleForSort(def: PuzzleDefinition): string {
  if (def.sourceKind === 'user-library') return def.title ?? def.sourceReason ?? def.id;
  return def.lichessPuzzleId ?? def.id;
}

// State for incremental shard loading
let _importedShards: ShardMeta[] = [];
let _importedShardIndex = 0;

/**
 * Open the puzzle list view for a given source kind.
 * For user-library: loads from IDB.
 * For imported-lichess: loads from the generated shard files (one shard at a time).
 */
export async function openPuzzleList(
  source: PuzzleSourceKind,
  redraw: () => void,
  options: { writeRoute?: boolean; isStale?: PuzzleRouteHydrationStalePredicate } = {},
): Promise<void> {
  const listState: PuzzleListState = {
    source,
    allForSource: [],
    filtered: [],
    visible: [],
    filters: {},
    sort: source === 'imported-lichess' ? 'rating.asc' : 'created.desc',
    page: 1,
    pageSize: LIST_PAGE_SIZE,
    availableThemes: [],
    availableOpenings: [],
    loading: true,
  };
  puzzleListState = listState;
  if (options.writeRoute !== false) replaceCurrentPuzzleLibraryRoute();
  redraw();

  try {
    if (source === 'imported-lichess') {
      await openImportedList(listState, redraw, options.isStale);
    } else {
      await openUserLibraryList(listState, options.isStale);
    }
  } catch (e) {
    if (options.isStale?.()) return;
    recordPuzzleLoadFail(e, source === 'imported-lichess' ? 'imported-lichess' : 'user-library');
    console.warn('[puzzle-ctrl] openPuzzleList failed', e);
    if (puzzleListState === listState) puzzleListState.loading = false;
  }
  if (options.isStale?.() || puzzleListState !== listState) return;
  redraw();
}

/** Load user-library puzzles from IDB. */
async function openUserLibraryList(
  listState: PuzzleListState,
  isStale?: PuzzleRouteHydrationStalePredicate,
): Promise<void> {
  const forSource = await listPuzzleDefinitionsBySource('user-library');
  if (isStale?.() || puzzleListState !== listState) return;
  forSource.sort((a, b) => b.createdAt - a.createdAt);
  if (forSource.length === 0) recordPuzzleSetEmpty('user-library');

  listState.allForSource = forSource;
  listState.availableThemes = [];
  listState.availableOpenings = [];
  listState.loading = false;
  applyListFilters(listState);
}

/** Load imported puzzles from shard files — first shard initially, more on demand. */
async function openImportedList(
  listState: PuzzleListState,
  redraw: () => void,
  isStale?: PuzzleRouteHydrationStalePredicate,
): Promise<void> {
  const manifest = await loadManifest();
  if (isStale?.() || puzzleListState !== listState) return;
  _importedShards = manifest.shards;
  _importedShardIndex = 0;
  listState.availableThemes = getManifestThemes();
  listState.availableOpenings = getManifestOpenings();

  // Load the first shard
  if (_importedShards.length > 0) {
    await loadNextImportedShard({ listState, isStale });
  } else {
    recordPuzzleSetEmpty('imported-lichess');
  }
  if (isStale?.() || puzzleListState !== listState) return;
  listState.loading = false;
  applyListFilters(listState);
  if (listState.filtered.length === 0) recordPuzzleSetEmpty('imported-lichess');
  redraw();
}

/** Load the next shard of imported puzzles and append to the list. */
async function loadNextImportedShard(options: {
  listState?: PuzzleListState;
  isStale?: PuzzleRouteHydrationStalePredicate | undefined;
} = {}): Promise<boolean> {
  if (options.isStale?.()) return false;
  const listState = options.listState ?? puzzleListState;
  if (!listState || puzzleListState !== listState) return false;
  if (_importedShardIndex >= _importedShards.length) return false;
  const shard = _importedShards[_importedShardIndex]!;

  const filters = listState.filters;
  const records = await loadFilteredShard(shard.id, filters);
  if (options.isStale?.() || puzzleListState !== listState) return false;
  _importedShardIndex++;

  // Convert shard records to PuzzleDefinitions
  const defs = records
    .map(r => lichessShardRecordToDefinition(r))
    .filter((d): d is NonNullable<typeof d> => d !== undefined);
  if (defs.length === 0) recordPuzzleSetEmpty('imported-lichess');

  listState.allForSource.push(...defs);
  // Sort by rating ascending
  listState.allForSource.sort((a, b) => {
    const ra = a.sourceKind === 'imported-lichess' ? a.rating : 0;
    const rb = b.sourceKind === 'imported-lichess' ? b.rating : 0;
    return ra - rb;
  });
  applyListFilters(listState);
  return true;
}

/**
 * Load more imported puzzle shards. Called from the "Load More" button.
 * Loads the next shard and appends results.
 */
export async function loadMoreImportedShards(redraw: () => void): Promise<void> {
  if (!puzzleListState || puzzleListState.source !== 'imported-lichess') return;
  const listState = puzzleListState;
  listState.loading = true;
  redraw();
  try {
    const loaded = await loadNextImportedShard({ listState });
    if (puzzleListState !== listState) return;
    listState.loading = false;
    if (!loaded) console.log('[puzzle-ctrl] all shards loaded');
  } catch (e) {
    recordPuzzleLoadFail(e, 'imported-lichess');
    if (puzzleListState === listState) listState.loading = false;
    console.warn('[puzzle-ctrl] loadMoreImportedShards failed', e);
  }
  if (puzzleListState !== listState) return;
  redraw();
}

export function hasMoreImportedShards(): boolean {
  return _importedShardIndex < _importedShards.length;
}

function routeStateForRuntime(parsed: PuzzleRouteState): PuzzleRouteState {
  const routeState = { ...parsed };
  // Retry, due, rated, favorites, and attempted sorting require broader
  // metadata/session lenses. Keep this slice honest by dropping them during
  // hydration instead of reconstructing queues or private metadata views.
  routeState.lens = 'browse';
  routeState.fav = false;
  if (routeState.sort === 'attempted.desc' || routeState.sort === 'due.asc') {
    routeState.sort = routeState.source === 'imported-lichess' ? 'rating.asc' : 'created.desc';
  }
  return routeState;
}

function applyRouteStateToOpenList(routeState: PuzzleRouteState): void {
  if (!puzzleListState) return;
  puzzleListState.sort = routeState.sort;
  puzzleListState.filters = {};
  if (puzzleListState.source === 'imported-lichess') {
    if (routeState.ratingMin !== 0) puzzleListState.filters.ratingMin = routeState.ratingMin;
    if (routeState.ratingMax !== 3200) puzzleListState.filters.ratingMax = routeState.ratingMax;
    if (routeState.theme) puzzleListState.filters.theme = routeState.theme;
    if (routeState.opening) puzzleListState.filters.opening = routeState.opening;
  }
  applyListFilters(puzzleListState);
}

async function revealPuzzleRoutePage(
  page: number,
  isStale?: PuzzleRouteHydrationStalePredicate,
): Promise<void> {
  if (!puzzleListState) return;
  const listState = puzzleListState;
  const targetPage = Math.max(1, page);
  while (
    !isStale?.()
    && puzzleListState === listState
    && listState.source === 'imported-lichess'
    && listState.filtered.length < targetPage * listState.pageSize
    && hasMoreImportedShards()
  ) {
    const loaded = await loadNextImportedShard({ listState, isStale });
    if (!loaded) break;
  }
  if (isStale?.() || puzzleListState !== listState) return;
  const availablePage = Math.max(1, Math.ceil(listState.filtered.length / listState.pageSize));
  listState.page = Math.min(targetPage, availablePage);
  listState.visible = listState.filtered.slice(0, listState.page * listState.pageSize);
}

function validateLoadedRouteState(routeState: PuzzleRouteState): PuzzleRouteState {
  const next = { ...routeState };
  if (!puzzleListState || puzzleListState.source !== 'imported-lichess') {
    next.theme = null;
    next.opening = null;
    next.ratingMin = 0;
    next.ratingMax = 3200;
    next.mode = 'practice';
    return next;
  }
  if (next.theme && !puzzleListState.availableThemes.includes(next.theme)) next.theme = null;
  if (next.opening && !puzzleListState.availableOpenings.includes(next.opening)) next.opening = null;
  return next;
}

export interface PuzzleLibraryHydrationSmokeResult {
  applied: boolean;
  replacedRoute: string | null;
  stale: boolean;
}

export async function __testPuzzleLibraryRouteHydrationGuards(
  query: string,
  seams: {
    loadList: () => Promise<void>;
    applyListState: (routeState: PuzzleRouteState) => void;
    replaceRoute: (route: string) => void;
    redraw: () => void;
  },
): Promise<PuzzleLibraryHydrationSmokeResult> {
  const run = ++puzzleLibraryHydrationRun;
  const isStale = () => run !== puzzleLibraryHydrationRun;
  const parsed = parsePuzzleRouteState(query);
  const routeState = routeStateForRuntime(parsed.state);

  await seams.loadList();
  if (isStale()) return { applied: false, replacedRoute: null, stale: true };

  seams.applyListState(routeState);
  if (isStale()) return { applied: true, replacedRoute: null, stale: true };

  const replacedRoute = serializePuzzleRouteState(routeState);
  seams.replaceRoute(replacedRoute);
  if (!isStale()) seams.redraw();
  return { applied: true, replacedRoute, stale: false };
}

export async function hydratePuzzleLibraryRoute(query: string, redraw: () => void): Promise<void> {
  const run = ++puzzleLibraryHydrationRun;
  const isStale = () => run !== puzzleLibraryHydrationRun;
  const redrawIfCurrent = () => {
    if (!isStale()) redraw();
  };
  const parsed = parsePuzzleRouteState(query);
  let routeState = routeStateForRuntime(parsed.state);

  initPuzzlePage('library');
  await loadLibraryCounts(redrawIfCurrent);
  if (isStale()) return;

  setDifficulty(routeState.difficulty);
  setSessionMode(routeState.mode);
  // Mirror the normalized mode back onto the local route state so a stale
  // `mode=rated` query param (P2-PZ-9 dormancy guard) isn't re-serialized
  // into the URL by replacePuzzleLibraryRoute() below.
  routeState.mode = getCurrentSessionMode();

  if (!routeState.source) {
    puzzleListState = null;
    replacePuzzleLibraryRoute(routeState);
    redrawIfCurrent();
    return;
  }

  await openPuzzleList(routeState.source, redrawIfCurrent, { writeRoute: false, isStale });
  if (isStale()) return;

  routeState = validateLoadedRouteState(routeState);
  dispatchImportedSessionRouteSelection({
    themes: routeState.theme ? [routeState.theme] : [],
    openings: routeState.opening ? [routeState.opening] : [],
    ratingMin: routeState.ratingMin,
    ratingMax: routeState.ratingMax,
    tab: routeState.opening ? 'openings' : 'themes',
  });
  applyRouteStateToOpenList(routeState);
  await revealPuzzleRoutePage(routeState.page, isStale);
  if (isStale()) return;

  routeState.page = puzzleListState?.page ?? 1;
  replacePuzzleLibraryRoute(routeState);
  redrawIfCurrent();
}

/**
 * Start an imported puzzle session using the selected themes/openings and rating range.
 * Loads matching puzzles across shards and opens the first match.
 */
export async function startImportedSession(
  themes: string[],
  openings: string[],
  ratingMin: number | undefined,
  ratingMax: number | undefined,
  redraw: () => void,
): Promise<void> {
  let manifest: PuzzleManifest;
  try {
    manifest = await loadManifest();
  } catch (e) {
    recordPuzzleLoadFail(e, 'imported-session');
    throw e;
  }
  const filters: { ratingMin?: number; ratingMax?: number; theme?: string } = {};
  if (ratingMin !== undefined) filters.ratingMin = ratingMin;
  if (ratingMax !== undefined) filters.ratingMax = ratingMax;

  // Find shards that match the rating range (theme check is per-record)
  const matchingShards = findMatchingShards(manifest, filters);
  if (matchingShards.length === 0) {
    recordPuzzleSetEmpty('imported-session');
    console.warn('[puzzle-ctrl] no shards match filters');
    return;
  }

  // Eager first-puzzle strategy: scan shards in order and navigate as soon as
  // the first matching puzzle is found. Remaining shards continue loading in
  // the background to fill the session queue. Shards are cached after first
  // fetch so the background pass costs only CPU filtering.
  let firstPick: PuzzleDefinition | null = null;
  let firstPickShardIndex = 0;

  for (let si = 0; si < matchingShards.length; si++) {
    let records: LichessShardRecord[];
    try {
      records = await loadFilteredShard(matchingShards[si]!.id, filters);
    } catch (e) {
      recordPuzzleLoadFail(e, 'imported-session');
      throw e;
    }
    for (const r of records) {
      if (themes.length > 0 && !themes.some(t => r.themes.includes(t))) continue;
      if (openings.length > 0 && !openings.some(o => r.openingTags.includes(o))) continue;
      const def = lichessShardRecordToDefinition(r);
      if (def) { firstPick = def; firstPickShardIndex = si; break; }
    }
    if (firstPick) break;
  }

  if (!firstPick) {
    recordPuzzleSetEmpty('imported-session');
    console.warn('[puzzle-ctrl] no imported puzzles match selection');
    _importedSessionError = 'No puzzles match your selection. Try widening the rating range or selecting different themes.';
    redraw();
    return;
  }

  // Save the first puzzle and navigate immediately — no waiting for the rest.
  await savePuzzleDefinition(firstPick);
  _importedSessionError = null;
  _sessionQueue = [];

  _activeSession = {
    themes: [...themes],
    openings: [...openings],
    ratingMin: ratingMin ?? 0,
    ratingMax: ratingMax ?? 3200,
    history: [{ puzzleId: firstPick.id, result: 'in-progress' }],
  };

  saveSessionToStorage();
  saveQueueToStorage();

  // Navigate immediately — queue fills behind the scenes.
  await openGeneratedPuzzleRoundRoute(firstPick.id, redraw);

  // Background: continue scanning remaining shards to populate the queue.
  // Uses the shard cache so already-fetched shards are free to re-scan.
  void fillSessionQueueBackground(
    matchingShards,
    firstPickShardIndex,
    themes,
    openings,
    filters,
    firstPick.id,
  );
}

/**
 * Background queue filler — called after the first puzzle is already navigated to.
 * Scans remaining shards (starting from the shard that yielded the first puzzle)
 * and populates _sessionQueue with up to 199 additional candidates.
 */
async function fillSessionQueueBackground(
  shards: ShardMeta[],
  startShardIndex: number,
  themes: string[],
  openings: string[],
  filters: { ratingMin?: number; ratingMax?: number },
  excludeId: string,
): Promise<void> {
  const candidates: PuzzleDefinition[] = [];

  for (let si = startShardIndex; si < shards.length && candidates.length < 199; si++) {
    let records: LichessShardRecord[];
    try {
      records = await loadFilteredShard(shards[si]!.id, filters);
    } catch (e) {
      recordPuzzleLoadFail(e, 'imported-session');
      throw e;
    }
    for (const r of records) {
      if (themes.length > 0 && !themes.some(t => r.themes.includes(t))) continue;
      if (openings.length > 0 && !openings.some(o => r.openingTags.includes(o))) continue;
      const def = lichessShardRecordToDefinition(r);
      if (!def || def.id === excludeId) continue;
      candidates.push(def);
      if (candidates.length >= 199) break;
    }
  }

  if (candidates.length === 0) {
    recordPuzzleSetEmpty('imported-session');
    return;
  }

  // Shuffle for variety before storing
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }

  _sessionQueue = candidates;
  saveQueueToStorage();
  prefetchSessionPgns();
}

/**
 * Retry all failed puzzles from the current session.
 * Loads the failed puzzle IDs back into the session queue and starts the first one.
 */
export async function retryFailedPuzzles(redraw: () => void): Promise<void> {
  if (!_activeSession) return;
  const failedIds = _activeSession.history
    .filter(e => e.result === 'failed' || e.result === 'assisted')
    .map(e => e.puzzleId);
  if (failedIds.length === 0) return;

  // Load definitions from IDB
  const defs: PuzzleDefinition[] = [];
  for (const id of failedIds) {
    let def: PuzzleDefinition | undefined;
    try {
      def = await getPuzzleDefinition(id);
    } catch (e) {
      recordPuzzleLoadFail(e, 'retry-session');
      throw e;
    }
    if (def) defs.push(def);
  }
  if (defs.length === 0) {
    recordPuzzleSetEmpty('retry-session');
    return;
  }

  // Shuffle for variety
  for (let i = defs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [defs[i], defs[j]] = [defs[j]!, defs[i]!];
  }

  const pick = defs[0]!;
  _sessionQueue = defs.slice(1);

  // Add retry entries to session history
  _activeSession.history.push({ puzzleId: pick.id, result: 'in-progress' });

  // Persist
  saveSessionToStorage();
  saveQueueToStorage();

  // Prefetch PGNs for the retry queue
  prefetchSessionPgns();

  roundState = null;
  activeRoundCtrl?.invalidatePendingAssistance();
  activeRoundCtrl = null;
  await openGeneratedPuzzleRoundRoute(pick.id, redraw);
}

// ---------------------------------------------------------------------------
// Game PGN fetcher — fetches full game PGNs from Lichess API on demand
// and caches them in IndexedDB to avoid refetching.
// ---------------------------------------------------------------------------

const PGN_CACHE_STORE = 'puzzle-pgn-cache';
const PGN_DB_NAME = 'patzer-puzzle-pgn';
const PGN_DB_VERSION = 1;

let _pgnDb: IDBDatabase | null = null;

function openPgnDb(): Promise<IDBDatabase> {
  if (_pgnDb) return Promise.resolve(_pgnDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PGN_DB_NAME, PGN_DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(PGN_CACHE_STORE);
    };
    req.onsuccess = () => { _pgnDb = req.result; resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function getCachedPgn(gameId: string): Promise<string | undefined> {
  const db = await openPgnDb();
  return new Promise((resolve) => {
    const tx = db.transaction(PGN_CACHE_STORE, 'readonly');
    const req = tx.objectStore(PGN_CACHE_STORE).get(gameId);
    req.onsuccess = () => resolve(req.result as string | undefined);
    req.onerror = () => resolve(undefined);
  });
}

async function cachePgn(gameId: string, pgn: string): Promise<void> {
  const db = await openPgnDb();
  return new Promise((resolve) => {
    const tx = db.transaction(PGN_CACHE_STORE, 'readwrite');
    tx.objectStore(PGN_CACHE_STORE).put(pgn, gameId);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
}

/** Extract the Lichess game ID from a gameUrl like "https://lichess.org/787zsVup/black#48" */
function extractGameId(gameUrl: string): string | undefined {
  try {
    const parts = gameUrl.replace('https://lichess.org/', '').split(/[/#]/);
    return parts[0] && parts[0].length >= 8 ? parts[0] : undefined;
  } catch { return undefined; }
}

/**
 * Fetch a game PGN from the Lichess API, with IDB cache.
 * Returns the PGN string, or undefined on failure.
 */
export async function fetchGamePgn(gameUrl: string): Promise<string | undefined> {
  const gameId = extractGameId(gameUrl);
  if (!gameId) { console.warn('[pgn] extractGameId failed for', gameUrl); return undefined; }

  // Check cache first
  const cached = await getCachedPgn(gameId);
  if (cached) { console.log('[pgn] cache hit for', gameId); return cached; }

  // Fetch from Lichess API
  console.log('[pgn] fetching from Lichess:', gameId);
  try {
    const res = await fetch(`https://lichess.org/game/export/${gameId}?evals=true&clocks=true`, {
      headers: { 'Accept': 'application/x-chess-pgn' },
    });
    if (!res.ok) { console.warn('[pgn] fetch failed', res.status, gameId); return undefined; }
    const pgn = await res.text();
    console.log('[pgn] fetched ok, length', pgn.length, 'for', gameId);
    // Cache for future use
    await cachePgn(gameId, pgn);
    return pgn;
  } catch (e) {
    console.warn('[pgn] fetch error', e);
    return undefined;
  }
}

// --- Session PGN prefetch queue ---
// When a session starts, we store the candidate puzzle queue.
// As puzzles are opened, we prefetch PGNs for the next few in the background.

const PREFETCH_AHEAD = 10;
let _sessionQueue: PuzzleDefinition[] = [];
let _prefetchInFlight = new Set<string>();

/** Prefetch PGNs for the next N puzzles in the session queue. */
function prefetchSessionPgns(): void {
  let fetched = 0;
  for (const def of _sessionQueue) {
    if (fetched >= PREFETCH_AHEAD) break;
    const url = def.sourceKind === 'imported-lichess' ? def.gameUrl : undefined;
    if (!url) continue;
    const gameId = extractGameId(url);
    if (!gameId || _prefetchInFlight.has(gameId)) continue;
    _prefetchInFlight.add(gameId);
    fetched++;
    // Fire and forget — cache silently in the background
    fetchGamePgn(url).finally(() => _prefetchInFlight.delete(gameId));
  }
}

/** Remove a puzzle from the front of the session queue (after it's been opened). */
function dequeueSessionPuzzle(id: string): void {
  _sessionQueue = _sessionQueue.filter(d => d.id !== id);
  saveQueueToStorage();
}

/** Get the PGN for the current puzzle round (fetches if needed). */
export async function loadPuzzlePgn(def: PuzzleDefinition): Promise<string | undefined> {
  if (def.sourceKind === 'user-library') return def.sourcePgn;
  if (!def.gameUrl) return undefined;
  return fetchGamePgn(def.gameUrl);
}

/** Error message from last imported session start attempt. */
let _importedSessionError: string | null = null;
export function getImportedSessionError(): string | null { return _importedSessionError; }
export function clearImportedSessionError(): void { _importedSessionError = null; }

// --- Active session tracking ---
// Tracks the current puzzle session so the sidebar can show session info and history.

export interface SessionHistoryEntry {
  puzzleId: string;
  /** 'clean' = correct first try, no assists. 'assisted' = solved but used hints/engine/had wrong moves. 'failed' = gave up. */
  result: 'clean' | 'assisted' | 'failed' | 'in-progress';
}

export interface ActiveSession {
  themes: string[];
  openings: string[];
  ratingMin: number;
  ratingMax: number;
  history: SessionHistoryEntry[];
}

const SESSION_STORAGE_KEY = 'puzzleSession';
const QUEUE_STORAGE_KEY = 'puzzleSessionQueue';
const AUTONEXT_STORAGE_KEY = 'puzzleAutoNext';

let _activeSession: ActiveSession | null = null;
let _autoNext = false;

// --- Session persistence (localStorage) ---

function saveSessionToStorage(): void {
  if (_activeSession) {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(_activeSession));
  } else {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }
}

function saveQueueToStorage(): void {
  if (_sessionQueue.length > 0) {
    // Store only IDs + essential fields to keep storage small
    const compact = _sessionQueue.map(d => d.id);
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(compact));
  } else {
    localStorage.removeItem(QUEUE_STORAGE_KEY);
  }
}

function restoreSessionFromStorage(): void {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (raw) _activeSession = JSON.parse(raw) as ActiveSession;
  } catch { /* ignore corrupt data */ }
  try {
    const v = localStorage.getItem(AUTONEXT_STORAGE_KEY);
    if (v === 'true') _autoNext = true;
  } catch { /* ignore */ }
}

export function getAutoNext(): boolean { return _autoNext; }
export function setAutoNext(v: boolean): void {
  _autoNext = v;
  localStorage.setItem(AUTONEXT_STORAGE_KEY, String(v));
}

export function getActiveSession(): ActiveSession | null { return _activeSession; }

export function clearActiveSession(): void {
  _activeSession = null;
  _sessionQueue = [];
  localStorage.removeItem(SESSION_STORAGE_KEY);
  localStorage.removeItem(QUEUE_STORAGE_KEY);
}

function resetPuzzleRoundRuntime(): void {
  activeRoundCtrl?.invalidatePendingAssistance();
  activeRoundCtrl = null;
  _previewPuzzleId = null;
  _previewRoundCtrl = null;
  roundState = null;
}

function clearSessionRuntimeOnly(): void {
  _activeSession = null;
  _sessionQueue = [];
  _autoNext = false;
  _sessionSeenIds = new Set();
  _ratedStreamActive = false;
  _ratedStreamCount = 0;
  _emptyRatedStream = false;
  retryQueue = [];
  retryIndex = 0;
  retrySessionActive = false;
  retryQueueKind = 'retry';
  retryQueueCompletion = null;
  retryCount = undefined;
  dueCount = undefined;
  _importedSessionError = null;
  _prefetchInFlight.clear();
}

export interface PuzzleDataManagementResetResult {
  activeRoundCleared: boolean;
  activeSessionCleared: boolean;
  metaCacheCleared: boolean;
  libraryCountsCleared: boolean;
}

export async function resetGeneratedPuzzleRuntimeForDataManagement(redraw: () => void): Promise<PuzzleDataManagementResetResult> {
  const activeRoundCleared = activeRoundCtrl?.definition.sourceKind === 'user-library'
    || _previewRoundCtrl?.definition.sourceKind === 'user-library';
  clearSessionRuntimeOnly();
  resetPuzzleRoundRuntime();
  metaCache = new Map();
  libraryCounts = undefined;
  state = { view: 'library' };
  cancelPuzzleLibraryRouteHydration();
  await loadUserPerfFromStorage();
  await loadLibraryCounts(redraw);
  redraw();
  return {
    activeRoundCleared: Boolean(activeRoundCleared),
    activeSessionCleared: true,
    metaCacheCleared: true,
    libraryCountsCleared: true,
  };
}

export async function resetPuzzleProgressRuntimeForDataManagement(redraw: () => void): Promise<PuzzleDataManagementResetResult> {
  const activeSessionCleared = _activeSession !== null || _sessionQueue.length > 0 || retrySessionActive || _ratedStreamActive;
  clearSessionRuntimeOnly();
  resetPuzzleRoundRuntime();
  metaCache = new Map();
  libraryCounts = undefined;
  state = { view: 'library' };
  cancelPuzzleLibraryRouteHydration();
  await loadUserPerfFromStorage();
  await loadLibraryCounts(redraw);
  redraw();
  return {
    activeRoundCleared: true,
    activeSessionCleared,
    metaCacheCleared: true,
    libraryCountsCleared: true,
  };
}

export function resetPuzzlePgnCacheRuntimeForDataManagement(): PuzzleDataManagementResetResult {
  _prefetchInFlight.clear();
  return {
    activeRoundCleared: false,
    activeSessionCleared: false,
    metaCacheCleared: false,
    libraryCountsCleared: false,
  };
}

/**
 * Get the puzzle ID to resume — the last in-progress puzzle,
 * or the last completed one if all are done.
 */
export function getResumePuzzleId(): string | undefined {
  if (!_activeSession) return undefined;
  const inProgress = _activeSession.history.find(e => e.result === 'in-progress');
  if (inProgress) return inProgress.puzzleId;
  // All done — return the last entry
  const last = _activeSession.history[_activeSession.history.length - 1];
  return last?.puzzleId;
}

// Restore on module load
restoreSessionFromStorage();

/** Record the current puzzle as in-progress in the session history. */
export function sessionRecordStart(puzzleId: string): void {
  if (!_activeSession) return;
  // Don't add if the puzzle already has an entry (completed or in-progress)
  if (_activeSession.history.some(e => e.puzzleId === puzzleId)) return;
  _activeSession.history.push({ puzzleId, result: 'in-progress' });
  saveSessionToStorage();
}

/** Update a session history entry with the solve result. */
export function sessionRecordResult(puzzleId: string, result: 'clean' | 'assisted' | 'failed'): void {
  if (!_activeSession) return;
  const entry = _activeSession.history.find(e => e.puzzleId === puzzleId);
  if (entry) entry.result = result;
  saveSessionToStorage();
}

/**
 * Update filters on the active puzzle list and re-apply.
 */
export function filterPuzzleList(
  filters: PuzzleListFilters,
  redraw: () => void,
): void {
  if (!puzzleListState) return;
  puzzleListState.filters = filters;
  applyListFilters(puzzleListState);
  replaceCurrentPuzzleLibraryRoute();
  redraw();
}

/**
 * Load the next page of puzzles into the visible list.
 */
export function loadMorePuzzles(redraw: () => void): void {
  if (!puzzleListState) return;
  const ls = puzzleListState;
  const nextEnd = (ls.page + 1) * ls.pageSize;
  ls.page++;
  ls.visible = ls.filtered.slice(0, nextEnd);
  replaceCurrentPuzzleLibraryRoute();
  redraw();
}

/**
 * Select a puzzle from the list and open it for solving.
 * For imported puzzles loaded from shards, saves to IDB first so
 * openPuzzleRound can find it via getPuzzleDefinition.
 */
export async function selectPuzzleFromList(
  id: string,
  redraw: () => void,
): Promise<void> {
  // If the puzzle is from the current list (e.g., an imported shard record not yet in IDB),
  // save it to IDB so the round can load it.
  if (puzzleListState) {
    const def = puzzleListState.allForSource.find(p => p.id === id);
    if (def) {
      await savePuzzleDefinition(def);
    }
  }
  // Navigate to the puzzle round route
  writePuzzleRoundRoute(id, 'explicit-durable-selection');
}

// --- Session navigation ---
// Adapted from lichess-org/lila: ui/puzzle/src/ctrl.ts nextPuzzle / reload

/**
 * Load a random next puzzle from the same sourceKind as the current puzzle.
 * Picks randomly from the available pool, excluding the current puzzle.
 * If no puzzles remain, stays on the current result screen.
 */
export async function nextPuzzle(
  redraw: () => void,
  hooks: GeneratedPuzzleRoundNavigationHooks = {},
): Promise<void> {
  const currentDef = roundState?.definition;
  if (!currentDef) return;

  // If there's a session queue, pick the next puzzle from it
  if (_sessionQueue.length > 0) {
    const pick = _sessionQueue[0]!;
    await (hooks.saveDefinition ?? savePuzzleDefinition)(pick);
    roundState = null;
    activeRoundCtrl?.invalidatePendingAssistance();
    activeRoundCtrl = null;
    await openGeneratedPuzzleRoundRoute(pick.id, redraw, hooks);
    return;
  }

  // Fallback: pick randomly from IDB
  const sourceKind: PuzzleSourceKind = currentDef.sourceKind;
  try {
    const all = await (hooks.listDefinitions ?? listPuzzleDefinitions)();
    const candidates = all.filter(
      p => p.sourceKind === sourceKind && p.id !== currentDef.id,
    );
    if (candidates.length === 0) {
      recordPuzzleSetEmpty('next-puzzle');
      console.warn('[puzzle-ctrl] no more puzzles of kind', sourceKind);
      return;
    }
    const pick = candidates[Math.floor(Math.random() * candidates.length)]!;
    roundState = null;
    activeRoundCtrl?.invalidatePendingAssistance();
    activeRoundCtrl = null;
    await openGeneratedPuzzleRoundRoute(pick.id, redraw, hooks);
  } catch (e) {
    recordPuzzleLoadFail(e, 'next-puzzle');
    console.warn('[puzzle-ctrl] nextPuzzle failed', e);
  }
}

export async function __testNextPuzzleFromSessionQueue(
  currentDef: PuzzleDefinition,
  nextDef: PuzzleDefinition,
  redraw: () => void,
  hooks: GeneratedPuzzleRoundNavigationHooks,
): Promise<void> {
  state = { view: 'round', puzzleId: currentDef.id };
  roundState = { definition: currentDef, status: 'ready' };
  _sessionQueue = [nextDef];
  await nextPuzzle(redraw, hooks);
}

/**
 * Retry the current puzzle — resets the round controller and remounts the board.
 */
export async function retryPuzzle(redraw: () => void): Promise<void> {
  const currentDef = roundState?.definition;
  if (!currentDef) return;

  // Reset and re-open the same puzzle
  const id = currentDef.id;
  roundState = null;
  activeRoundCtrl?.invalidatePendingAssistance();
  activeRoundCtrl = null;
  await openPuzzleRound(id, redraw);
}

// ---------------------------------------------------------------------------
// Retry Failed queue — repetition-oriented session
// Surfaces puzzles where the most recent attempt was failed, skipped,
// assisted-solve, or where no attempt exists yet (never tried).
// Adapted from the Lichess retry/repeat concept — simple queue, no SRS yet.
// ---------------------------------------------------------------------------

/** Attempt results that qualify a puzzle for the retry queue. */
const RETRY_RESULTS: Set<SolveResult> = new Set([
  'failed',
  'skipped',
  'assisted-solve',
]);

let retryQueue: PuzzleDefinition[] = [];
let retryIndex: number = -1;
let retrySessionActive: boolean = false;
/** Cached count of puzzles needing retry, loaded alongside library counts. */
let retryCount: number | undefined;

export function getRetryQueue(): readonly PuzzleDefinition[] { return retryQueue; }
export function getRetryIndex(): number { return retryIndex; }
export function isRetrySessionActive(): boolean { return retrySessionActive; }
export function getRetryCount(): number | undefined { return retryCount; }

/**
 * Which library action populated the shared retry/due-review queue above.
 * UI-labeling only (BUG-2026-07-05-016 progress/completion fix) — does not
 * affect due-date/interval/retry-eligibility semantics (Track T3, out of
 * scope for this fix).
 */
export type RetryQueueKind = 'retry' | 'due';
let retryQueueKind: RetryQueueKind = 'retry';
export function getRetryQueueKind(): RetryQueueKind { return retryQueueKind; }

/**
 * Set once a retry/due-review queue is exhausted so the view can show a
 * clear completion state instead of silently resetting on the last
 * puzzle's feedback screen (BUG-2026-07-05-016). Cleared when dismissed,
 * when a new queue session starts, or when any puzzle round is opened.
 */
export interface RetryQueueCompletion {
  kind: RetryQueueKind;
  total: number;
}
let retryQueueCompletion: RetryQueueCompletion | null = null;
export function getRetryQueueCompletion(): RetryQueueCompletion | null { return retryQueueCompletion; }
export function dismissRetryQueueCompletion(): void { retryQueueCompletion = null; }

/** End an active retry/due-review queue session before it finishes naturally. */
export function endRetryQueueSession(): void {
  retrySessionActive = false;
  retryQueue = [];
  retryIndex = -1;
  retryQueueCompletion = null;
}

/**
 * Build the retry queue: puzzles whose most recent attempt was not a clean
 * or recovered solve, plus puzzles that have never been attempted.
 */
export async function buildRetryQueue(): Promise<PuzzleDefinition[]> {
  let allDefs: PuzzleDefinition[];
  let attemptsByPuzzle: Map<string, PuzzleAttempt[]>;
  try {
    allDefs = await listPuzzleDefinitions();
    // Single pass over all attempts instead of N serial getAttempts() calls.
    attemptsByPuzzle = await getAllAttemptsByPuzzle();
  } catch (e) {
    recordPuzzleLoadFail(e, 'retry-session');
    throw e;
  }
  const queue: PuzzleDefinition[] = [];

  for (const def of allDefs) {
    const attempts = attemptsByPuzzle.get(def.id) ?? [];
    if (attempts.length === 0) {
      // Never attempted — include in retry queue
      queue.push(def);
      continue;
    }
    // Find the most recent attempt by completedAt
    let latest = attempts[0]!;
    for (let i = 1; i < attempts.length; i++) {
      if (attempts[i]!.completedAt > latest.completedAt) {
        latest = attempts[i]!;
      }
    }
    if (RETRY_RESULTS.has(latest.result)) {
      queue.push(def);
    }
  }

  if (queue.length === 0) recordPuzzleSetEmpty('retry-session');
  return queue;
}

/**
 * Load the retry count for display in the library view.
 * Called alongside loadLibraryCounts.
 */
export async function loadRetryCount(redraw: () => void): Promise<void> {
  try {
    const queue = await buildRetryQueue();
    retryCount = queue.length;
  } catch (e) {
    console.warn('[puzzle-ctrl] loadRetryCount failed', e);
    retryCount = 0;
  }
  redraw();
}

/**
 * Start a retry session: build the queue and open the first puzzle.
 */
export async function startRetrySession(redraw: () => void): Promise<void> {
  try {
    const queue = await buildRetryQueue();
    if (queue.length === 0) {
      recordPuzzleSetEmpty('retry-session');
      console.warn('[puzzle-ctrl] no puzzles need retry');
      return;
    }
    retryQueue = queue;
    retryIndex = 0;
    retrySessionActive = true;
    retryQueueKind = 'retry';
    retryQueueCompletion = null;

    // Navigate to the first puzzle in the queue
    const first = retryQueue[0]!;
    await openGeneratedPuzzleRoundRoute(first.id, redraw);
  } catch (e) {
    recordPuzzleLoadFail(e, 'retry-session');
    console.warn('[puzzle-ctrl] startRetrySession failed', e);
    retrySessionActive = false;
  }
}

/**
 * Advance to the next puzzle in the retry queue.
 * If the queue is exhausted, deactivates the session and returns to library.
 */
export async function nextRetryPuzzle(redraw: () => void): Promise<void> {
  if (!retrySessionActive || retryQueue.length === 0) {
    // Fallback to regular next puzzle
    return nextPuzzle(redraw);
  }

  retryIndex++;
  if (retryIndex >= retryQueue.length) {
    // Queue exhausted — surface a completion state (BUG-2026-07-05-016)
    // instead of silently clearing the session, which previously left the
    // user staring at the last puzzle's stale feedback screen with no
    // indication the batch had ended.
    retryQueueCompletion = { kind: retryQueueKind, total: retryQueue.length };
    retrySessionActive = false;
    retryQueue = [];
    retryIndex = -1;
    // Refresh retry/due counts to reflect any newly-solved puzzles
    loadRetryCount(redraw);
    loadDueCount(redraw);
    console.log('[puzzle-ctrl] retry queue complete');
    redraw();
    return;
  }

  const next = retryQueue[retryIndex]!;
  await openGeneratedPuzzleRoundRoute(next.id, redraw);
}

// ---------------------------------------------------------------------------
// Due-for-review — simple interval heuristic
// This is NOT spaced repetition. It uses fixed intervals based on the most
// recent attempt result to surface puzzles that are due for another try.
//
// Intervals:
//   clean-solve      → 7 days
//   recovered-solve  → 3 days
//   assisted-solve   → 1 day
//   failed / skipped → 1 day
//   no attempts      → due immediately (epoch 0)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** Interval map: result → milliseconds until the puzzle is due again. */
const DUE_INTERVALS: Record<SolveResult, number> = {
  'clean-solve':     7 * DAY_MS,
  'recovered-solve': 3 * DAY_MS,
  'assisted-solve':  1 * DAY_MS,
  'failed':          1 * DAY_MS,
  'skipped':         1 * DAY_MS,
};

/**
 * Compute the epoch-ms timestamp when a puzzle should next be retried,
 * based on its attempt history. Returns undefined only if the attempt
 * list is somehow malformed (should not happen in practice).
 *
 * Simple interval heuristic — not spaced repetition.
 */
export function computeDueDate(attempts: PuzzleAttempt[]): number | undefined {
  if (attempts.length === 0) return 0; // never tried → due immediately

  // Find most recent attempt by completedAt
  let latest = attempts[0]!;
  for (let i = 1; i < attempts.length; i++) {
    if (attempts[i]!.completedAt > latest.completedAt) {
      latest = attempts[i]!;
    }
  }

  const interval = DUE_INTERVALS[latest.result];
  if (interval === undefined) return undefined;
  return latest.completedAt + interval;
}

/**
 * After recording an attempt, update the puzzle's PuzzleUserMeta with
 * dueAt and lastAttemptResult so that filtering can use metadata alone
 * without re-scanning the attempts store.
 */
async function updateDueMeta(puzzleId: string, attempts: PuzzleAttempt[]): Promise<void> {
  const dueAt = computeDueDate(attempts);
  if (dueAt === undefined) return;

  // Find latest result
  let latest = attempts[0]!;
  for (let i = 1; i < attempts.length; i++) {
    if (attempts[i]!.completedAt > latest.completedAt) {
      latest = attempts[i]!;
    }
  }

  const existing = metaCache.get(puzzleId) ?? (await getMeta(puzzleId)) ?? defaultMeta(puzzleId);
  const updated: PuzzleUserMeta = {
    ...existing,
    dueAt,
    lastAttemptResult: latest.result,
  };
  await savePuzzleMeta(updated);
}

/** Cached count of puzzles due for review. */
let dueCount: number | undefined;

export function getDueCount(): number | undefined { return dueCount; }

/**
 * List all puzzle definitions that are currently due for review.
 * A puzzle is due when its meta.dueAt <= Date.now(), or when it has
 * never been attempted (no meta or dueAt absent → check attempts).
 */
export async function getDuePuzzles(): Promise<PuzzleDefinition[]> {
  let allDefs: PuzzleDefinition[];
  try {
    allDefs = await listPuzzleDefinitions();
  } catch (e) {
    recordPuzzleLoadFail(e, 'due-session');
    throw e;
  }
  const now = Date.now();
  const due: PuzzleDefinition[] = [];

  // Pre-load all attempts once for puzzles that lack cached meta.
  // Replaces N serial getAttempts() calls with a single cursor scan.
  let attemptsByPuzzle: Map<string, PuzzleAttempt[]>;
  try {
    attemptsByPuzzle = await getAllAttemptsByPuzzle();
  } catch (e) {
    recordPuzzleLoadFail(e, 'due-session');
    throw e;
  }

  for (const def of allDefs) {
    const meta = metaCache.get(def.id) ?? (await getMeta(def.id));

    if (meta && meta.dueAt !== undefined) {
      // Has due metadata — check if due
      if (meta.dueAt <= now) due.push(def);
    } else {
      // No due metadata — fall back to attempt check from pre-loaded map
      const attempts = attemptsByPuzzle.get(def.id) ?? [];
      if (attempts.length === 0) {
        // Never attempted → due immediately
        due.push(def);
      } else {
        // Has attempts but no dueAt cached — compute and check
        const dueAt = computeDueDate(attempts);
        if (dueAt !== undefined && dueAt <= now) due.push(def);
      }
    }
  }

  if (due.length === 0) recordPuzzleSetEmpty('due-session');
  return due;
}

/**
 * Load the due-for-review count for display in the library view.
 */
export async function loadDueCount(redraw: () => void): Promise<void> {
  try {
    const duePuzzles = await getDuePuzzles();
    dueCount = duePuzzles.length;
  } catch (e) {
    console.warn('[puzzle-ctrl] loadDueCount failed', e);
    dueCount = 0;
  }
  redraw();
}

/**
 * Start a review-due session: build the due queue and open the first puzzle.
 */
export async function startDueSession(redraw: () => void): Promise<void> {
  try {
    const queue = await getDuePuzzles();
    if (queue.length === 0) {
      recordPuzzleSetEmpty('due-session');
      console.warn('[puzzle-ctrl] no puzzles due for review');
      return;
    }
    retryQueue = queue;
    retryIndex = 0;
    retrySessionActive = true;
    retryQueueKind = 'due';
    retryQueueCompletion = null;

    const first = retryQueue[0]!;
    await openGeneratedPuzzleRoundRoute(first.id, redraw);
  } catch (e) {
    recordPuzzleLoadFail(e, 'due-session');
    console.warn('[puzzle-ctrl] startDueSession failed', e);
    retrySessionActive = false;
  }
}
