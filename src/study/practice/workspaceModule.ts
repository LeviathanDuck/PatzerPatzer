



















import type { TreePath } from '../../tree/types';
import type {
  WorkspaceBoardInputModule,
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
