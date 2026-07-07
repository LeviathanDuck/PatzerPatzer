

















import type { Color } from 'chessops/types';
import type { TreeNode, TreePath } from '../tree/types';

/**
 * Board input mode — an OPEN string union (design §1 scope-correction), NOT a two-value enum, so
 * ORP-drill's practice grading and Repertoire Browse's read-only source browsing name themselves
 * when those surfaces migrate later (§7), without reshaping this type.
 */
export type BoardInputMode =
  | 'free-analysis'
  | 'always-new-variation'
  | 'read-only-source-browsing'
  | 'practice-grading'
  | (string & {});

/** The live tree-cursor unit a surface exposes (mirrors WorkspaceSession's fields; read view). */
export interface WorkspaceCursor {
  root: TreeNode;
  path: TreePath;
  node: TreeNode;
  nodeList: TreeNode[];
  mainline: TreeNode[];
}

/** A point-in-time snapshot of the active workspace (cursor + orientation + owning instance id). */
export interface WorkspaceSessionSnapshot extends WorkspaceCursor {
  orientation: Color;
  instanceId: string;
}

/**
 * The surface-supplied wiring a mount reads through. For Analysis, `getCursor` reads the live
 * AnalyseCtrl session and `getOrientation` reads src/board/index.ts's module-level orientation (its
 * backing store — orientation gains CONCEPTUAL ownership here via `session().orientation`, but the
 * physical `let orientation` declaration relocation is deferred to D-core-03b per the reconciliation).
 *
 * `route`/`onMutation` (design §3.2) are the durable-route and persistence hook points; they are
 * intentionally not declared until the slice that wires them (Task Scope Rule — do not build
 * speculative API).
 */
export interface WorkspaceAdapter {
  id: string;
  boardInputMode: BoardInputMode;
  getCursor: () => WorkspaceCursor;
  getOrientation: () => Color;
  redraw: () => void;
}

/**
 * A mounted workspace. D-core-03 wires only `session()` (read by the board lifecycle) plus identity
 * and teardown; `navigate`/`handleUserMove`/`flip`/`registerShapeProvider`/`restore` are added by
 * D-core-04..06 (declared in the design §3.2 seam, implemented incrementally).
 */
export interface WorkspaceInstance {
  readonly instanceId: string;
  readonly boardInputMode: BoardInputMode;
  session(): WorkspaceSessionSnapshot;
  /** Release anything this instance owns. D-core-03 owns nothing releasable yet (cgInstance and the
   *  orientation store stay module singletons per design §5); later slices tear down their own
   *  provider/nav registrations here so a superseded instance's work becomes a guaranteed no-op. */
  teardown(reason: string): void;
}

/**
 * Single-active-slot-with-teardown (design §5) — generalized ONCE here rather than a fourth
 * hand-rolled copy (cf. src/board/premoves/controller.ts:34-41). Setting a new active value tears
 * down the outgoing one first; setting the same value is a no-op. Only the NEW WorkspaceInstance
 * slot uses this — cgInstance/orientation/activeHost keep their existing single-purpose singletons
 * (design §5 out-of-scope fence).
 */
export function createActiveSlot<T extends { teardown(reason: string): void }>(): {
  get: () => T | null;
  set: (next: T | null, reason: string) => void;
} {
  let active: T | null = null;
  return {
    get: () => active,
    set(next: T | null, reason: string): void {
      if (next === active) return;
      active?.teardown(reason);
      active = next;
    },
  };
}

const workspaceSlot = createActiveSlot<WorkspaceInstance>();

/** The currently-mounted workspace, or null before any mount. The board lifecycle reads this. */
export function activeWorkspace(): WorkspaceInstance | null {
  return workspaceSlot.get();
}

/**
 * Construct and activate a workspace for `adapter`. The single place a workspace instance is made
 * (equivalent to lila conditionally building `this.study = new makeStudy(...)`). Any previously
 * active instance is torn down first (§5).
 */
export function mountWorkspace(adapter: WorkspaceAdapter): WorkspaceInstance {
  // Human-readable id: adapter id + mount timestamp (design §9 open-decision 2 default) — sufficient
  // for the single-active-slot model; no cross-process collision-proofing needed.
  const instanceId = `${adapter.id}-${Date.now()}`;
  const instance: WorkspaceInstance = {
    instanceId,
    boardInputMode: adapter.boardInputMode,
    session(): WorkspaceSessionSnapshot {
      const c = adapter.getCursor();
      return {
        root: c.root,
        path: c.path,
        node: c.node,
        nodeList: c.nodeList,
        mainline: c.mainline,
        orientation: adapter.getOrientation(),
        instanceId,
      };
    },
    teardown(_reason: string): void {
      // D-core-03: nothing owned to release yet — see interface doc above.
    },
  };
  workspaceSlot.set(instance, `mount:${adapter.id}`);
  return instance;
}

// --- Instance-keyed providers (D-core-06 / ledger F3) ---
//
// A callback tagged with the workspace-instance id active when it was registered. A keyed provider
// is LIVE only while its registering instance is still the active workspace — one left behind by a
// superseded/torn-down instance becomes a guaranteed no-op (the single-active-slot stale-drop
// discipline above, extended to registered callbacks). A null id (registered before any workspace
// mounted) is treated as NOT instance-scoped = ALWAYS live, so a pre-mount registration is never
// silently dropped. Used by src/board/shapeSink.ts's arrow/shape provider registration.
export interface KeyedProvider<T> {
  fn: T;
  instanceId: string | null;
}

export function keyProvider<T>(fn: T): KeyedProvider<T> {
  return { fn, instanceId: activeWorkspace()?.instanceId ?? null };
}

export function providerIsLive(p: { instanceId: string | null }): boolean {
  return p.instanceId === null || p.instanceId === (activeWorkspace()?.instanceId ?? null);
}
