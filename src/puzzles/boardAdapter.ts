




























import type { Config as CgConfig } from '@lichess-org/chessground/config';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { parseFen } from 'chessops/fen';
import type { Role } from 'chessops';
import type { VNode } from 'snabbdom';
import { onBoardAnimationChange, puzzleBoardAnimationConfig } from '../board/animation';
import { PromotionCtrl } from '../board/promotion';
import { registerModuleAutoShapesProvider, syncArrowForced } from '../board/shapeSink';
import type {
  WorkspaceBoardInputModule,
  WorkspaceBoardPort,
  WorkspaceCursor,
} from '../analyse/workspaceCore';
import type { TreeNode } from '../tree/types';

/** The minimal puzzle-definition shape the solve module reads (structurally a `PuzzleDefinition`). */
export interface PuzzleSolveDefinition {
  readonly id: string;
  readonly startFen: string;
  /** The opponent's trigger move (UCI). When present the board is locked at mount until the trigger
   *  animation applies the post-trigger movable config; when absent the solver is live immediately. */
  readonly triggerMove?: string;
}

/** A board position the solve module writes through the guarded port (trigger, reply, sync, revert). */
export interface PuzzleBoardPosition {
  readonly fen: string;
  readonly turnColor: 'white' | 'black';
  /** Highlighted last move, or omitted for a fresh/cleared position. */
  readonly lastMove?: [Key, Key];
  /** The solver's legal destinations for this position (empty Map to freeze input). */
  readonly dests: Map<Key, Key[]>;
  /** Movable color for this position (`'both'` for post-solve exploration). */
  readonly movableColor: 'white' | 'black' | 'both';
}

/**
 * The puzzle solve controller returned by {@link createPuzzleSolveBoardController}: the
 * `WorkspaceBoardInputModule` the workspace core mounts, plus the cursor/orientation getters the
 * `WorkspaceAdapter` reads, the port-driven board programs the later solve wiring drives, promotion
 * access, and `isLive()` (round-generation-current AND the attached port is live).
 */
export interface PuzzleSolveBoardController {
  /** The mode-named board-input module handed to `mountWorkspace` via the `WorkspaceAdapter`. */
  readonly module: WorkspaceBoardInputModule;
  /** Ephemeral single-leaf cursor for workspace identity/observability (never a shared move tree). */
  getCursor(): WorkspaceCursor;
  /** Current board orientation (the solver's pov). */
  getOrientation(): 'white' | 'black';
  /** Round-generation-current AND the attached `WorkspaceBoardPort.isLive()`. */
  isLive(): boolean;

  // --- Board programs (each updates module state, then writes through the guarded port). ---
  /** Sync the board to a tree/live position (post-solve navigation, context peek). */
  syncFromRound(pos: PuzzleBoardPosition): void;
  /** Apply the opponent trigger move before the solver gets control (`port.set`, never `port.move`). */
  applyTriggerPosition(pos: PuzzleBoardPosition): void;
  /** Apply a scripted opponent reply after a correct solver move (`port.set`, never `port.move`). */
  applyOpponentReply(pos: PuzzleBoardPosition): void;
  /** Restore the live position after a wrong move or a cancelled promotion chooser. */
  restoreLivePosition(pos: PuzzleBoardPosition): void;
  /** Toggle board orientation (and, via the shared overlay, the promotion overlay orientation). */
  flip(): void;

  // --- Promotion (board-neutral; drives the port, never a raw CgApi). ---
  /** The puzzle-owned promotion chooser controller. */
  readonly promotion: PromotionCtrl;
  /** Render the pending promotion chooser (or null), for placement beside the puzzle board. */
  renderPromotion(): VNode | null;

  // --- Hint hooks (implemented below; called from the puzzle round in src/puzzles/ctrl.ts). ---
  /** Show the single green origin-square hint for the expected move. */
  showHint(expectedUci: string): void;
  /** Clear the hint. */
  clearHint(): void;
}

export interface PuzzleSolveBoardControllerDeps {
  /** The puzzle being solved. Read at construction for the initial config identity. */
  definition: PuzzleSolveDefinition;
  /** The solver's pov (active round controller's color), or null for the null-controller fallback
   *  (a solve workspace prepared from `roundState.definition` before/without an active round). */
  pov: 'white' | 'black' | null;
  /**
   * Graded-move entry — the later solve wiring routes this to the EXISTING puzzle grading path
   * (`handlePuzzleMove` → `submitUserMove` during solving / `addVariationMove` post-solve). The
   * module calls it only after resolving promotion; `promotionRole` is set when the move came through
   * the chooser (submitted as a suffixed UCI). The module never reaches `sharedTreeMoveTarget`,
   * Analysis promotion, Analysis hooks, or `WorkspaceInstance.handleUserMove`.
   */
  gradeMove: (orig: Key, dest: Key, promotionRole?: Role) => void;
  /** Surface redraw (drives re-evaluation of the promotion chooser view). */
  redraw: () => void;
  /** True while THIS controller's round generation is still the current one (round-token/generation
   *  gate). Combined with the live port to form `isLive()`. */
  isRoundCurrent: () => boolean;
  /** One-shot hook run once the port attaches (the later wiring kicks the trigger animation +
   *  solution-enable timers here, matching today's DOM-insert timing — design §8). */
  onAttached?: () => void;
}

/** Side-to-move parsed from a FEN, defaulting to white on any parse failure. */
function turnOfFen(fen: string): 'white' | 'black' {
  const setup = parseFen(fen);
  if (setup.isErr) return 'white';
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return 'white';
  return pos.value.turn;
}

/** Legal destinations for a FEN, or an empty Map on any parse failure. */
function destsOfFen(fen: string): Map<Key, Key[]> {
  const setup = parseFen(fen);
  if (setup.isErr) return new Map();
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return new Map();
  return chessgroundDests(pos.value) as Map<Key, Key[]>;
}

/**
 * Create the puzzle solve board-input controller/module.
 *
 * All board mutations go through the attached {@link WorkspaceBoardPort} (`set`/`move`); this module
 * never touches a raw Chessground instance or `movable.events`. The board lifecycle
 * (`src/board/index.ts`) owns the canonical `movable.events.after` callback and reproduces the config
 * this module returns from its `configPolicy.initial`/`sync`.
 */
export function createPuzzleSolveBoardController(
  deps: PuzzleSolveBoardControllerDeps,
): PuzzleSolveBoardController {
  const def = deps.definition;

  // --- Initial config identity (design §4 "Configuration identity"; byte-parity with the legacy
  //     mountPuzzleBoard config). orientation = pov or the FEN-derived fallback; solverColor =
  //     orientation. Trigger present → omit movable.color + empty dests (board locked until the
  //     trigger animation); trigger absent → movable.color = solverColor + legal dests immediately. ---
  const _turnColor: 'white' | 'black' = turnOfFen(def.startFen);
  const _orientationInit: 'white' | 'black' =
    deps.pov ?? (_turnColor === 'white' ? 'black' : 'white');
  const triggerPresent = def.triggerMove !== undefined && def.triggerMove !== '';

  // --- Module board state (the single source of truth for initial()/sync()). ---
  let _fen = def.startFen;
  let _orientation: 'white' | 'black' = _orientationInit;
  let _turn: 'white' | 'black' = _turnColor;
  // `null` movable color → the config OMITS movable.color (exactOptionalPropertyTypes-safe), matching
  // the trigger-present branch of mountPuzzleBoard.
  let _movableColor: 'white' | 'black' | 'both' | null = triggerPresent ? null : _orientationInit;
  let _dests: Map<Key, Key[]> = triggerPresent ? new Map() : destsOfFen(def.startFen);
  let _lastMove: [Key, Key] | null = null;

  // --- Attach-time resources (all released in detach). ---
  let _port: WorkspaceBoardPort | null = null;
  let _unsubAnimation: (() => void) | null = null;
  let _disposeHintProvider: (() => void) | null = null;
  let _promotionPreMoveFen: string | null = null;

  // Hint identity is adapter-owned and exact: a shape is visible only for this puzzle and the FEN
  // at which the hint was requested. Position programs leave the stored identity intact so the
  // provider itself stale-drops on mismatch; clear/detach erase it explicitly.
  let _hintPuzzleId: string | null = null;
  let _hintFen: string | null = null;
  let _hintOrigin: Key | null = null;

  // --- Ephemeral cursor (workspace identity/observability; never becomes a shared move tree). ---
  function computePly(fen: string): number {
    const parts = fen.split(' ');
    const blackToMove = parts[1] === 'b';
    const fullmove = Number.parseInt(parts[5] ?? '1', 10);
    const fm = Number.isFinite(fullmove) && fullmove > 0 ? fullmove : 1;
    return (fm - 1) * 2 + (blackToMove ? 1 : 0);
  }

  function currentLeaf(): TreeNode {
    return { id: '', ply: computePly(_fen), fen: _fen, children: [] };
  }

  function getCursor(): WorkspaceCursor {
    const leaf = currentLeaf();
    return { root: leaf, path: '', node: leaf, nodeList: [leaf], mainline: [leaf] };
  }

  function livePort(): WorkspaceBoardPort | null {
    const port = _port;
    return deps.isRoundCurrent() && port?.isLive() ? port : null;
  }

  const isLive = (): boolean => livePort() !== null;

  // --- Module-owned config (§4): a COMPLETE applicable puzzle-solve config from module state,
  //     byte-identical to the legacy mountPuzzleBoard config MINUS the events callback (the board
  //     lifecycle installs the canonical movable.events.after separately). ---
  function buildConfig(): CgConfig {
    return {
      fen: _fen,
      orientation: _orientation,
      turnColor: _turn,
      viewOnly: false,
      animation: puzzleBoardAnimationConfig(),
      movable: {
        free: false,
        ...(_movableColor !== null ? { color: _movableColor } : {}),
        dests: _dests,
        showDests: true,
      },
      drawable: { enabled: true },
      ...(_lastMove ? { lastMove: _lastMove } : {}),
    };
  }

  // --- Board-neutral promotion chooser (src/board/promotion.ts, additive port path). The chooser is
  //     bound to the guarded port via applyPromotedVisual; no raw CgApi is ever exposed. ---
  const promotion = new PromotionCtrl({
    // Module-owned surface: no raw Chessground. The port path never consults withGround.
    withGround: () => undefined,
    orientation: () => _orientation,
    redraw: deps.redraw,
    // Under movable.events.after the pawn is already on the back rank. Restore the module-tracked
    // PRE-move FEN through the guarded port; PromotionCtrl.cancel() owns the single redraw.
    cancel: () => {
      const preMoveFen = _promotionPreMoveFen;
      _promotionPreMoveFen = null;
      if (preMoveFen) livePort()?.set({ fen: preMoveFen });
    },
    submit: (orig, dest, role) => {
      _promotionPreMoveFen = null;
      deps.gradeMove(orig, dest, role);
    },
    // Temporary promoted-piece visual through the guarded port (no raw CgApi).
    applyPromotedVisual: (fen: string) => { livePort()?.set({ fen }); },
  });

  // --- Module-owned move dispatch (§4 "User moves and grading"). Installed by the board lifecycle as
  //     movable.events.after (fires AFTER Chessground has moved the piece onto dest). Detect promotion
  //     from the module's tracked pre-move FEN; if required, open the chooser and defer grading;
  //     otherwise grade once. Never reaches the shared-tree / Analysis pipeline. ---
  function handleMove(orig: Key, dest: Key): void {
    // Pre-move FEN is the module's tracked position (the position BEFORE this move applied).
    const preMoveFen = _fen;
    if (promotion.startFromFen(preMoveFen, orig, dest)) {
      _promotionPreMoveFen = preMoveFen;
      return; // chooser opened → defer grading
    }
    deps.gradeMove(orig, dest);
  }

  // --- Port-driven board programs. Each updates module state first, then writes through the guarded
  //     port (a no-op when the port is stale). ---

  function updateState(pos: PuzzleBoardPosition): void {
    _fen = pos.fen;
    _turn = pos.turnColor;
    _lastMove = pos.lastMove ?? null;
    _movableColor = pos.movableColor;
    _dests = pos.dests;
  }

  function syncFromRound(pos: PuzzleBoardPosition): void {
    updateState(pos);
    livePort()?.set({
      fen: pos.fen,
      turnColor: pos.turnColor,
      ...(pos.lastMove ? { lastMove: pos.lastMove } : {}),
      movable: { color: pos.movableColor, free: false, dests: pos.dests, showDests: true },
      animation: puzzleBoardAnimationConfig(),
    });
    syncArrowForced();
  }

  function applyTriggerPosition(pos: PuzzleBoardPosition): void {
    updateState(pos);
    // Board PROGRAM: port.set (never port.move) so the trigger cannot enter grading.
    livePort()?.set({
      fen: pos.fen,
      turnColor: pos.turnColor,
      ...(pos.lastMove ? { lastMove: pos.lastMove } : {}),
      movable: { color: pos.movableColor, dests: pos.dests, showDests: true },
    });
    syncArrowForced();
  }

  function applyOpponentReply(pos: PuzzleBoardPosition): void {
    updateState(pos);
    // Board PROGRAM: the round appends the tree node + progress; here only port.set (never port.move),
    // so the reply cannot enter module dispatch.
    livePort()?.set({
      fen: pos.fen,
      turnColor: pos.turnColor,
      ...(pos.lastMove ? { lastMove: pos.lastMove } : {}),
      movable: { color: pos.movableColor, dests: pos.dests },
    });
    syncArrowForced();
  }

  function restoreLivePosition(pos: PuzzleBoardPosition): void {
    // Wrong-move revert / promotion cancel: re-assert the live position through the port.
    syncFromRound(pos);
  }

  function flip(): void {
    _orientation = _orientation === 'white' ? 'black' : 'white';
    livePort()?.set({ orientation: _orientation });
  }

  // --- H05 hint ownership. The shared shape sink owns the Chessground write; this adapter owns the
  //     exact puzzle/FEN/origin identity and forces immediate recomputation on every state change. ---
  function hintShapes(): DrawShape[] {
    if (
      _hintPuzzleId !== def.id
      || _hintFen !== _fen
      || _hintOrigin === null
      || livePort() === null
    ) return [];
    return [{ orig: _hintOrigin, brush: 'green' }];
  }

  function clearHintState(): void {
    _hintPuzzleId = null;
    _hintFen = null;
    _hintOrigin = null;
  }

  function showHint(expectedUci: string): void {
    _hintPuzzleId = def.id;
    _hintFen = _fen;
    _hintOrigin = expectedUci.slice(0, 2) as Key;
    syncArrowForced();
  }

  function clearHint(): void {
    clearHintState();
    syncArrowForced();
  }

  const module: WorkspaceBoardInputModule = {
    id: 'puzzle-solve',
    mode: 'practice-grading',
    allowResize: true,

    configPolicy: {
      kind: 'module-owned',
      initial: () => buildConfig(),
      sync: () => buildConfig(),
    },

    moveDispatch: {
      kind: 'module-owned',
      handleMove,
    },

    keyboardPolicy: {
      // Surface-owned no-op: keyboard.ts's existing puzzle-round block owns arrow navigation before
      // module policy is consulted, and all Analysis shortcuts stay suppressed on the puzzle board.
      kind: 'surface-owned',
      handleKeydown: () => {},
    },

    attach(port: WorkspaceBoardPort): void {
      _port = port;
      _disposeHintProvider?.();
      _disposeHintProvider = registerModuleAutoShapesProvider(hintShapes);
      // Own the puzzle-animation subscription at the port scope. Only write when the round + port are
      // still live.
      _unsubAnimation = onBoardAnimationChange('puzzle', () => {
        livePort()?.set({ animation: puzzleBoardAnimationConfig() });
      });
      // Trigger + solution-enable timers begin from attach (design §8), matching today's DOM-insert
      // timing. The later solve wiring supplies this.
      deps.onAttached?.();
    },

    detach(): void {
      // Idempotent, and must never write through the dead port: only unsubscribe, clear any pending
      // promotion chooser, and drop refs.
      clearHintState();
      _disposeHintProvider?.();
      _disposeHintProvider = null;
      if (_unsubAnimation) {
        _unsubAnimation();
        _unsubAnimation = null;
      }
      promotion.reset();
      _promotionPreMoveFen = null;
      _port = null;
      syncArrowForced();
    },
  };

  return {
    module,
    getCursor,
    getOrientation: () => _orientation,
    isLive,
    syncFromRound,
    applyTriggerPosition,
    applyOpponentReply,
    restoreLivePosition,
    flip,
    promotion,
    renderPromotion: () => promotion.view(),
    showHint,
    clearHint,
  };
}
