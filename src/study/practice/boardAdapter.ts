











import type { Config as CgConfig } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
import type { Color } from 'chessops/types';
import { playDrillFeedbackSound } from '../../board/sound';
import { onBoardAnimationChange, puzzleBoardAnimationConfig } from '../../board/animation';
import type {
  WorkspaceBoardInputModule,
  WorkspaceBoardPort,
  WorkspaceCursor,
} from '../../analyse/workspaceCore';
import type { TreeNode } from '../../tree/types';

export type FeedbackType = 'correct' | 'incorrect';

// Feedback flash duration — preserved exactly from the pre-migration adapter.
const FLASH_DURATION_MS = 350;

/**
 * The drill controller returned by {@link createDrillBoardAdapter}: the `WorkspaceBoardInputModule`
 * the workspace core mounts, plus the cursor/orientation getters the `WorkspaceAdapter` reads, the
 * port-driven board operations `drillView` drives, and `isLive()` (drill-run-current AND the
 * attached port is live).
 */
export interface DrillBoardController {
  /** The mode-named board-input module handed to `mountWorkspace` via the `WorkspaceAdapter`. */
  readonly module: WorkspaceBoardInputModule;
  /** Ephemeral single-leaf cursor for workspace identity/observability (never a shared move tree). */
  getCursor(): WorkspaceCursor;
  /** Current board orientation (the active sequence's `trainAs`). */
  getOrientation(): Color;
  /** Drill-run-current AND the attached `WorkspaceBoardPort.isLive()`. */
  isLive(): boolean;

  // --- Board operations (each updates module state, then writes through the guarded port). ---
  /** Set board to a position (clears last move, disables input). */
  setPosition(fen: string, orientation: 'white' | 'black'): void;
  /** Re-orient for a mixed-color sequence change (orientation + movable color). */
  reorient(orientation: 'white' | 'black'): void;
  /** Animate opponent piece movement, then freeze board. */
  animateOpponentMove(from: Key, to: Key, afterFen: string): void;
  /** Enable user input for their color (the orientation color) with the given legal destinations. */
  enableUserInput(legalDests: Map<Key, Key[]>): void;
  /** Disable all user input (opponent turn, feedback display, etc.). */
  disableUserInput(): void;
  /** Animate the correct move onto the board (called after too many failures). */
  showCorrectMove(from: Key, to: Key, afterFen: string): void;
  /** Brief CSS flash on the board wrapper (green = correct, red = incorrect). */
  flashFeedback(type: FeedbackType): void;
}

export interface DrillBoardControllerDeps {
  /** Initial position the module starts on (immediately overwritten by the first `syncDrillBoard`). */
  initialFen: string;
  /** Initial orientation / movable color (the first sequence's `trainAs`). */
  initialOrientation: 'white' | 'black';
  /**
   * Graded-attempt entry — `drillView.onUserMove`. The shared board lifecycle installs it as
   * `movable.events.after` for module-owned dispatch; the drill never enters the Analysis pipeline.
   */
  handleMove: (orig: Key, dest: Key) => void;
  /** Surface-owned drill keyboard behavior (Enter/Space/Escape/arrows). */
  handleKeydown: (event: KeyboardEvent) => void;
  /** One-shot initial board sync, invoked once after the port attaches (`drillView.syncDrillBoard`). */
  onAttached: () => void;
  /** True while THIS controller's drill run is still the current one (drillView run generation). */
  isRunCurrent: () => boolean;
}

/**
 * Create the ORP-drill board-input controller/module.
 *
 * All board mutations go through the attached {@link WorkspaceBoardPort} (`set`/`move`); this module
 * never touches a raw Chessground instance or `movable.events`. The board lifecycle
 * (`src/board/index.ts`) owns the canonical `movable.events.after` callback and reproduces the config
 * this module returns from {@link WorkspaceBoardConfigPolicy.initial}/`sync`.
 */
export function createDrillBoardAdapter(deps: DrillBoardControllerDeps): DrillBoardController {
  // --- Module board state (the single source of truth for initial()/sync()). ---
  let _fen: string = deps.initialFen;
  let _orientation: 'white' | 'black' = deps.initialOrientation;
  let _movableColor: 'white' | 'black' | 'both' = deps.initialOrientation;
  let _dests: Map<Key, Key[]> = new Map();
  let _lastMove: [Key, Key] | null = null;

  // --- Attach-time resources (all released in detach). ---
  let _port: WorkspaceBoardPort | null = null;
  let _wrapEl: HTMLElement | null = null;
  let _unsubAnimation: (() => void) | null = null;
  let _flashTimer: ReturnType<typeof setTimeout> | null = null;

  // --- Ephemeral cursor (workspace identity/observability; never becomes a shared move tree). ---
  // A single coherent leaf: root === node, path === '', node.fen is the position module state
  // currently represents, node.ply derived from the FEN's side-to-move + fullmove counter.
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

  const isLive = (): boolean => deps.isRunCurrent() && _port !== null && _port.isLive();

  // --- Module-owned config (§5): a COMPLETE applicable drill config from module state. It must
  //     never inherit Analysis drawing, premove, resize, promotion, or callback behavior — the
  //     board lifecycle installs the canonical move callback separately. Both initial() and sync()
  //     return this same shape. ---
  function buildConfig(): CgConfig {
    return {
      fen: _fen,
      orientation: _orientation,
      viewOnly: false,
      animation: puzzleBoardAnimationConfig(),
      movable: {
        free: false,
        color: _movableColor,
        dests: _dests,
        showDests: true,
      },
      premovable: {
        enabled: false,
        showDests: false,
        castle: false,
      },
      drawable: {
        enabled: false,
        shapes: [],
      },
      ...(_lastMove ? { lastMove: _lastMove } : {}),
    };
  }

  // --- Port-driven board operations (byte-identical to the pre-migration cg.set()/cg.move() calls,
  //     but routed through the guarded port; each keeps module state current first). ---

  function setPosition(fen: string, orientation: 'white' | 'black'): void {
    _fen = fen;
    _orientation = orientation;
    _movableColor = 'both';
    _dests = new Map();
    _lastMove = null;
    // Pass 'both' with empty dests to freeze the board between moves.
    _port?.set({
      fen,
      orientation,
      lastMove: [] as Key[],
      movable: { color: 'both', free: false, dests: new Map() },
      animation: puzzleBoardAnimationConfig(),
      drawable: { shapes: [] },
    });
  }

  function reorient(orientation: 'white' | 'black'): void {
    _orientation = orientation;
    _movableColor = orientation;


    _port?.set({ orientation, movable: { color: orientation } });
  }

  function animateOpponentMove(from: Key, to: Key, afterFen: string): void {
    _fen = afterFen;
    _lastMove = [from, to];
    _movableColor = 'both';
    _dests = new Map();
    _port?.set({
      fen: afterFen,
      lastMove: [from, to],
      movable: { color: 'both', free: false, dests: new Map() },
      animation: puzzleBoardAnimationConfig(),
    });
  }

  function enableUserInput(legalDests: Map<Key, Key[]>): void {
    _movableColor = _orientation;
    _dests = legalDests;
    // No event callback is installed here: module-owned dispatch is owned by the board lifecycle's
    // canonical `movable.events.after` (installed once at construction, preserved across deep-merge).
    _port?.set({
      movable: { color: _orientation, free: false, dests: legalDests },
      animation: puzzleBoardAnimationConfig(),
    });
  }

  function disableUserInput(): void {
    _movableColor = 'both';
    _dests = new Map();
    _port?.set({ movable: { color: 'both', free: false, dests: new Map() } });
  }

  function showCorrectMove(from: Key, to: Key, afterFen: string): void {
    _fen = afterFen;
    _lastMove = [from, to];
    _port?.move(from, to);
  }

  function flashFeedback(type: FeedbackType): void {
    const cls = type === 'correct' ? 'drill-flash--correct' : 'drill-flash--incorrect';
    const wrap = _wrapEl;
    // Capture the exact port live at schedule time so the 350ms removal can stale-drop like every
    // other delayed drill callback.
    const capturedPort = _port;
    if (wrap) {
      wrap.classList.add(cls);
      if (_flashTimer) clearTimeout(_flashTimer);
      _flashTimer = setTimeout(() => {
        _flashTimer = null;
        // Fire-time stale-drop (mirror the opponent/learn/advance callbacks): only touch the wrapper
        // if this run is still current and the same port captured at schedule time is still live. A
        // superseded/exited drill leaves the removal to detach (which clears the timer + classes).
        if (deps.isRunCurrent() && capturedPort !== null && _port === capturedPort && capturedPort.isLive()) {
          wrap.classList.remove(cls);
        }
      }, FLASH_DURATION_MS);
    }
    playDrillFeedbackSound(type);
  }

  const module: WorkspaceBoardInputModule = {
    id: 'orp-drill',
    mode: 'practice-grading',
    allowResize: false,

    configPolicy: {
      kind: 'module-owned',
      initial: () => buildConfig(),
      sync: () => buildConfig(),
    },

    moveDispatch: {
      kind: 'module-owned',
      handleMove: deps.handleMove,
    },

    keyboardPolicy: {
      kind: 'surface-owned',
      handleKeydown: deps.handleKeydown,
    },

    attach(port: WorkspaceBoardPort, boardEl: HTMLElement): void {
      _port = port;
      // Resolve the unchanged flash target (the outer `.drill-board-wrap`) once at attach.
      _wrapEl = boardEl.closest('.drill-board-wrap') as HTMLElement | null;
      // Own the puzzle-animation subscription at the port scope (was a module-level listener). Only
      // write when the run and the port are still live.
      _unsubAnimation = onBoardAnimationChange('puzzle', () => {
        const port2 = _port;
        if (deps.isRunCurrent() && port2 && port2.isLive()) {
          port2.set({ animation: puzzleBoardAnimationConfig() });
        }
      });
      // Run the existing initial board sync now that the port is attached.
      deps.onAttached();
    },

    detach(): void {
      // Idempotent, and must never write through the dead port: only unsubscribe, clear the flash
      // timer, strip flash classes directly from the retained wrapper, and drop refs.
      if (_unsubAnimation) {
        _unsubAnimation();
        _unsubAnimation = null;
      }
      if (_flashTimer) {
        clearTimeout(_flashTimer);
        _flashTimer = null;
      }
      if (_wrapEl) {
        _wrapEl.classList.remove('drill-flash--correct');
        _wrapEl.classList.remove('drill-flash--incorrect');
        _wrapEl = null;
      }
      _port = null;
    },
  };

  return {
    module,
    getCursor,
    getOrientation: () => _orientation,
    isLive,
    setPosition,
    reorient,
    animateOpponentMove,
    enableUserInput,
    disableUserInput,
    showCorrectMove,
    flashFeedback,
  };
}
