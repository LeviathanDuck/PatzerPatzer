



















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

/**
 * The only dependency C1 accepts: the shared-tree navigation the host already owns. Before a grader
 * exists, accepted moves continue through the shared tree/navigation path — this avoids inventing a
 * no-op or speculative move grader. D7 replaces this with the module-owned grader dispatch.
 */
export interface StudyPracticeWorkspaceModuleDeps {
  navigate(path: TreePath): void;
}

/**
 * C1's refined return type: the base module contract with the declarative ownership metadata made
 * REQUIRED (they are optional on the base interface for additive back-compat with older modules).
 */
export interface StudyPracticeWorkspaceModule extends WorkspaceBoardInputModule {
  readonly shapeOwnership: WorkspaceShapeOwnership;
  readonly sessionOwnership: WorkspaceSessionOwnership;
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
    // Practice lesson/target/traversal state is module-owned but its data shape is DEFERRED to
    // Package D (no data shape declared here).
    sessionOwnership: {
      cursor: 'core',
      featureState: 'module',
      featureStateDeferred: true,
    },

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
  const module = createStudyPracticeWorkspaceModule({ navigate: host.navigate });
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
