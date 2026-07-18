



















import type { Color } from 'chessops/types';
import type { TreeNode, TreePath } from '../../tree/types';
import { mountWorkspace } from '../../analyse/workspaceCore';
import type {
  WorkspaceBoardInputModule,
  WorkspaceCursor,
  WorkspaceInstance,
  WorkspaceShapeOwnership,
  WorkspaceSessionOwnership,
} from '../../analyse/workspaceCore';
import type { PracticeSelectedSession } from './sessionBuilder';
import { routePracticeCompletion, type PracticeCompletionRoute } from './sessionBuilder';

/**
 * The deferred `study-practice` feature-session shape, SUPPLIED by Package D/D11 (`workspaceModule.ts`
 * previously declared `featureStateDeferred:true` with no data shape — C1 §3). For the Practice-Selected
 * (mixed scope) mount it is exactly the assembled `PracticeSelectedSession`: the per-line replays plus
 * the Learn/Practice routing partition. Threading this to the mount lets the board host consume ONE
 * coherent mixed-scope session and route each completion correctly (Learn → D9, Practice → metrics-only).
 *
 * D11 supplies the SHAPE + the pure split routing; it does NOT do the full grader-dispatch swap (that is
 * the C3/C4-mount consumer slice — C1 §3): the completion→D9 (Learn) vs metrics-only (Practice) `await`
 * is the host's, driven by `routeCompletion` below, not module logic.
 */
export type StudyPracticeFeatureState = PracticeSelectedSession;

/**
 * The only dependency C1 accepts: the shared-tree navigation the host already owns. Before a grader
 * exists, accepted moves continue through the shared tree/navigation path — this avoids inventing a
 * no-op or speculative move grader. D7 replaces this with the module-owned grader dispatch.
 *
 * D11 additively threads the optional Practice-Selected feature-state (the mixed-scope session + split).
 * When present, the module's `sessionOwnership.featureStateDeferred` flips to `false` (the shape is now
 * supplied) and the module exposes it plus the pure `routeCompletion` split for the host to consult.
 */
export interface StudyPracticeWorkspaceModuleDeps {
  navigate(path: TreePath): void;
  /** Optional D11 Practice-Selected feature-state (replays + Learn/Practice routing partition). */
  readonly practiceSession?: StudyPracticeFeatureState;
}

/**
 * C1's refined return type: the base module contract with the declarative ownership metadata made
 * REQUIRED (they are optional on the base interface for additive back-compat with older modules).
 *
 * D11 additively exposes the supplied Practice-Selected feature-state and a pure `routeCompletion` split
 * (present only when a `practiceSession` was threaded in) so the board host can enforce schedule-neutral
 * Practice: it routes ONLY Learn-selected completions to D9 and keeps Practice-learned metrics-only.
 */
export interface StudyPracticeWorkspaceModule extends WorkspaceBoardInputModule {
  readonly shapeOwnership: WorkspaceShapeOwnership;
  readonly sessionOwnership: WorkspaceSessionOwnership;
  /** The supplied D11 Practice-Selected feature-state, or undefined when none was threaded in. */
  readonly practiceSession?: StudyPracticeFeatureState;
  /**
   * Pure per-completion routing split (undefined when no `practiceSession`): `learn` → the host awaits
   * D9 `applyOrpDecisionOutcome`; `practice` → METRICS-ONLY, the adapter is NEVER called (byte-identical
   * `dueAt`, P2-ORP-14); `context` → not a scored target. A pure set-membership read — no board-blocking
   * work, so board input stays P0.
   */
  readonly routeCompletion?: (targetId: string) => PracticeCompletionRoute;
}

/**
 * Build the shared `study-practice` board-input module. This is a hosting ownership DECLARATION, not
 * a grading API: it declares the stable identity/resize/ownership contract and uses Analysis-default
 * config + keyboard and shared-tree move dispatch until Package D supplies real behavior.
 *
 * All callbacks are synchronous, bounded, and resource-free (P0 — board navigation wins the frame):
 * `attach`/`detach` own no resources, and the module contributes no shapes, so no lower-priority
 * work can delay board input.
 */
export function createStudyPracticeWorkspaceModule(
  deps: StudyPracticeWorkspaceModuleDeps,
): StudyPracticeWorkspaceModule {
  return {
    // Stable identity — names the reusable Study-owned module family, not the old `orp-drill`
    // controller and not either host surface.
    id: 'study-practice',
    // Stable mode — already exists in BoardInputMode; mount validation requires exact mode agreement.
    mode: 'practice-grading',
    // Stable — this is a full analysis-grade board hosted on Analysis and Study, NOT the legacy
    // fixed drill wrapper (`allowResize: false`).
    allowResize: true,

    // Temporary hosting placeholder (D7/D8 replace): C1 has no honest complete grading config, so it
    // reuses the existing Analysis initial/sync configuration rather than fabricate module-owned
    // callbacks that would accidentally inherit Analysis behavior or run dead.
    configPolicy: { kind: 'analysis-default' },

    // Temporary hosting placeholder (D7 replaces with the grader dispatch): accepted moves continue
    // through the shared tree/navigation path via the injected `navigate`.
    moveDispatch: { kind: 'shared-tree', navigate: deps.navigate },

    // Temporary hosting placeholder (D7/accessibility work replaces): there is no Learn/Retry/Hint
    // state machine yet, so today's app-wide Analysis shortcut block stays active.
    keyboardPolicy: { kind: 'analysis-default' },

    // Declarative shape ownership: Practice shape semantics are module-owned but applied ONLY through
    // the shared sink; C1 registers no provider (shape data is a Package D concern).
    shapeOwnership: {
      owner: 'module',
      application: 'shared-sink',
      registersProvider: false,
    },

    // Declarative session ownership: the shared core owns board cursor/FEN/orientation/lifecycle;
    // Practice lesson/target/traversal state is module-owned. Its data shape was DEFERRED to Package D
    // (C1); D11 SUPPLIES it as the Practice-Selected feature-state, so `featureStateDeferred` is false
    // exactly when a `practiceSession` was threaded in (still deferred/back-compat otherwise).
    sessionOwnership: {
      cursor: 'core',
      featureState: 'module',
      featureStateDeferred: deps.practiceSession === undefined,
    },

    // D11 Practice-Selected feature-state (mixed-scope session + Learn/Practice routing partition) and
    // the pure completion-routing split. Present only when a `practiceSession` was supplied; both are
    // OMITTED otherwise (exactOptionalPropertyTypes). `routeCompletion` is a pure set-membership read —
    // no board-blocking work — so board input stays P0. The completion→D9 (Learn) vs metrics-only
    // (Practice) `await` is the HOST's, driven by this split, not module logic (no grader-dispatch swap).
    ...(deps.practiceSession !== undefined
      ? {
          practiceSession: deps.practiceSession,
          routeCompletion: (targetId: string): PracticeCompletionRoute =>
            routePracticeCompletion(deps.practiceSession!, targetId),
        }
      : {}),

    // Resource-free: C1 consumes the narrow WorkspaceBoardPort only and need not even call it. It
    // acquires nothing at attach and releases nothing at detach.
    attach(): void {
      /* non-scoring host scaffolding — no resources to acquire (Package D wires real attach) */
    },
    detach(): void {
      /* non-scoring host scaffolding — no resources to release (Package D wires real detach) */
    },
  };
}











/**
 * Host-neutral mount inputs for the shared Study-Practice workspace. A host supplies its OWN adapter
 * identity plus the live board mechanics it already owns (cursor/orientation/redraw + the shared-tree
 * navigation and tree-commit the module's placeholder dispatch flows through). The factory owns the
 * fixed module/mode composition; the host owns everything host-specific.
 */
export interface StudyPracticeWorkspaceHost {
  /**
   * The MOUNTING HOST's adapter identity (Analysis's `'analysis'`, or the Study host's own id) — NOT
   * the module id. The adapter id names the host; the module id (`study-practice`) names the feature.
   * The core enforces board-input MODE equality only, never `adapter.id === module.id`.
   */
  readonly hostId: string;
  /** Live tree-cursor read (the host's own AnalyseCtrl / study session — the SAME cursor its normal
   *  mount reads; there is no second cursor). */
  getCursor: () => WorkspaceCursor;
  /** Live board orientation read (the host's shared orientation — no second/duplicate snapshot). */
  getOrientation: () => Color;
  /** Host shell redraw/sync. */
  redraw: () => void;
  /** Shared-tree navigation (existing-child follow) the C1 module's placeholder move dispatch flows
   *  through until Package D supplies the module-owned grader dispatch. */
  navigate: (path: TreePath) => void;
  /** Host tree-commit for a board-created node (Analysis's add-and-navigate). */
  handleUserMove: (parentPath: TreePath, node: TreeNode) => void;
  /** Optional D11 Practice-Selected feature-state to mount (the mixed-scope session + Learn/Practice
   *  routing partition). When supplied the mounted module exposes it plus the pure `routeCompletion`
   *  split; omit for the non-scoring C1 hosting mount (back-compat). */
  readonly practiceSession?: StudyPracticeFeatureState;
}

/**
 * Mount the shared `study-practice` module into the caller's single workspace slot as an in-place
 * `practice-grading` takeover, returning the mounted `WorkspaceInstance` for the host to own and
 * later guard-unmount. Each call builds a FRESH module instance from
 * `createStudyPracticeWorkspaceModule` (never a shared mutable singleton) and fixes
 * `boardInputMode: 'practice-grading'` so the core's mode-equality mount validation passes.
 *
 * Purely synchronous and bounded (P0 — board navigation wins the frame): it constructs the module and
 * calls `mountWorkspace`; no engine, persistence, scheduling, tree scan, or async. Hosting only — no
 * grading, session, SRS, route, or UI behavior (that is Package D).
 */
export function mountStudyPracticeWorkspace(host: StudyPracticeWorkspaceHost): WorkspaceInstance {
  const module = createStudyPracticeWorkspaceModule({
    navigate: host.navigate,
    // Thread the optional D11 Practice-Selected feature-state through to the module (omitted when the
    // host supplies none, keeping the non-scoring C1 mount unchanged for back-compat).
    ...(host.practiceSession !== undefined ? { practiceSession: host.practiceSession } : {}),
  });
  return mountWorkspace({
    id: host.hostId,
    boardInputMode: 'practice-grading',
    boardInputModule: module,
    getCursor: host.getCursor,
    getOrientation: host.getOrientation,
    redraw: host.redraw,
    handleUserMove: host.handleUserMove,
  });
}
