

















import type { Config as CgConfig } from '@lichess-org/chessground/config';
import type { Key } from '@lichess-org/chessground/types';
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















/** Read-only context handed to a module's config policy / callbacks (synchronous, bounded). */
export interface WorkspaceBoardInputContext {
  readonly instanceId: string;
  readonly mode: BoardInputMode;
  readonly session: WorkspaceSessionSnapshot;
}

/**
 * How a mount's Chessground config is produced.
 * - `analysis-default`: the existing Analysis initial/sync configuration, unchanged.
 * - `module-owned`: the module supplies the COMPLETE applicable configuration; it must not inherit
 *   Analysis callbacks accidentally.
 * The config functions must be synchronous and bounded: no engine work, persistence, awaits, tree
 * scans, shell redraws, or timers.
 */
export type WorkspaceBoardConfigPolicy =
  | {
      readonly kind: 'analysis-default';
    }
  | {
      readonly kind: 'module-owned';
      initial(context: WorkspaceBoardInputContext): CgConfig;
      sync(context: WorkspaceBoardInputContext): CgConfig;
    };

/**
 * How a user move made on the board is dispatched.
 * - `shared-tree`: normal tree move generation, promotion, existing-child following, move hooks, and
 *   `WorkspaceInstance.handleUserMove` (installed on `events.move`).
 * - `module-owned`: bypasses all Analysis tree/promotion hooks; installed as `movable.events.after`.
 */
export type WorkspaceBoardMoveDispatch =
  | {
      readonly kind: 'shared-tree';
      navigate(path: TreePath): void;
    }
  | {
      readonly kind: 'module-owned';
      handleMove(orig: Key, dest: Key): void;
    };

/**
 * Keyboard ownership for a mount.
 * - `analysis-default`: today's app-wide Analysis shortcut block stays active.
 * - `surface-owned`: the module receives the keydown and the Analysis shortcut block does not run.
 */
export type WorkspaceKeyboardPolicy =
  | {
      readonly kind: 'analysis-default';
    }
  | {
      readonly kind: 'surface-owned';
      handleKeydown(event: KeyboardEvent): void;
    };

/** The narrow board handle a module gets at `attach` time (no raw CgApi, no destroy). */
export interface WorkspaceBoardPort {
  readonly instanceId: string;
  isLive(): boolean;
  set(config: CgConfig): void;
  move(orig: Key, dest: Key): void;
}

/**
 * A surface's board-input module: the complete, mode-named ownership of board config, move dispatch,
 * and keyboard policy for one mount. Supplied to `mountWorkspace` via `WorkspaceAdapter`.
 */
export interface WorkspaceBoardInputModule {
  readonly id: string;
  readonly mode: BoardInputMode;
  readonly allowResize: boolean;
  readonly configPolicy: WorkspaceBoardConfigPolicy;
  readonly moveDispatch: WorkspaceBoardMoveDispatch;
  readonly keyboardPolicy: WorkspaceKeyboardPolicy;

  attach(port: WorkspaceBoardPort, boardEl: HTMLElement): void;
  detach(reason: string): void;
}

/**
 * The instance-visible facade. Every callable member is guarded against supersession; lifecycle
 * `detach` remains exclusively core-owned (so it is omitted here — see `WorkspaceInstance.teardown`).
 */
export interface WorkspaceBoardInputHandle
  extends Omit<WorkspaceBoardInputModule, 'detach'> {
  isLive(): boolean;
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
  /**
   * Optional mode-aware board-input module (CCW-H03a-1). When omitted, the mount resolves to a
   * `null` board-input handle and behaves exactly as before (Analysis is the only permitted
   * no-module mount — the fail-closed check for that lands in H03a-3, once Study has a real module).
   */
  boardInputModule?: WorkspaceBoardInputModule;
  getCursor: () => WorkspaceCursor;
  getOrientation: () => Color;
  redraw: () => void;
  /**
   * Commit a user-move-created node at `parentPath` and navigate to it. D-core-22a: the board
   * lifecycle's `applyMoveToTree` ADD path calls this instead of hardcoding `addNode`+`_navigate`,
   * so a future Study mount can commit moves its own way (e.g. always-new-variation + autosave)
   * without forking the board. Analysis's adapter implementation is add-and-navigate verbatim.
   */
  handleUserMove: (parentPath: TreePath, node: TreeNode) => void;
}

/**
 * A mounted workspace. D-core-03 wired `session()` (read by the board lifecycle) plus identity and
 * teardown; D-core-22a adds `handleUserMove`. `navigate`/`flip`/`registerShapeProvider`/`restore`
 * are added by later D-core slices (declared in the design §3.2 seam, implemented incrementally).
 */
export interface WorkspaceInstance {
  readonly instanceId: string;
  readonly boardInputMode: BoardInputMode;
  /**
   * The guarded board-input facade for this mount, or `null` when the adapter supplied no module
   * (CCW-H03a-1). Guarded means every callable member no-ops once this instance is superseded/torn
   * down; module-owned `initial`/`sync` return `{}` when stale. `detach` is core-owned via
   * `teardown`, so it is intentionally absent from the facade.
   */
  readonly boardInputModule: WorkspaceBoardInputHandle | null;
  session(): WorkspaceSessionSnapshot;
  /** Commit a user-move-created node at `parentPath` and navigate to it. Delegates to the mounting
   *  adapter's `handleUserMove` (see WorkspaceAdapter doc above). */
  handleUserMove(parentPath: TreePath, node: TreeNode): void;
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
      const prev = active;
      active = next;
      prev?.teardown(reason);
    },
  };
}

const workspaceSlot = createActiveSlot<WorkspaceInstance>();

/** The currently-mounted workspace, or null before any mount. The board lifecycle reads this. */
export function activeWorkspace(): WorkspaceInstance | null {
  return workspaceSlot.get();
}

/**
 * Wrap a raw adapter module in the instance-visible guarded facade (design §"Instance guarding").
 * `isLive` is the mount's liveness predicate (`!tornDown && providerIsLive(liveKey)`). Every callable
 * member is guarded: stale `navigate`/`handleMove`/`handleKeydown`/`attach` return without effect,
 * and stale module-owned `initial`/`sync` return `{}` (never applied by the board). The raw module's
 * `detach` is NOT exposed here — teardown owns it (see `mountWorkspace`).
 */
function guardBoardInputModule(
  raw: WorkspaceBoardInputModule,
  isLive: () => boolean,
): WorkspaceBoardInputHandle {
  const rawConfig = raw.configPolicy;
  const configPolicy: WorkspaceBoardConfigPolicy =
    rawConfig.kind === 'analysis-default'
      ? { kind: 'analysis-default' }
      : {
          kind: 'module-owned',
          initial(context: WorkspaceBoardInputContext): CgConfig {
            return isLive() ? rawConfig.initial(context) : {};
          },
          sync(context: WorkspaceBoardInputContext): CgConfig {
            return isLive() ? rawConfig.sync(context) : {};
          },
        };

  const rawDispatch = raw.moveDispatch;
  const moveDispatch: WorkspaceBoardMoveDispatch =
    rawDispatch.kind === 'shared-tree'
      ? {
          kind: 'shared-tree',
          navigate(path: TreePath): void {
            if (isLive()) rawDispatch.navigate(path);
          },
        }
      : {
          kind: 'module-owned',
          handleMove(orig: Key, dest: Key): void {
            if (isLive()) rawDispatch.handleMove(orig, dest);
          },
        };

  const rawKeyboard = raw.keyboardPolicy;
  const keyboardPolicy: WorkspaceKeyboardPolicy =
    rawKeyboard.kind === 'analysis-default'
      ? { kind: 'analysis-default' }
      : {
          kind: 'surface-owned',
          handleKeydown(event: KeyboardEvent): void {
            if (isLive()) rawKeyboard.handleKeydown(event);
          },
        };

  return {
    id: raw.id,
    mode: raw.mode,
    allowResize: raw.allowResize,
    configPolicy,
    moveDispatch,
    keyboardPolicy,
    attach(port: WorkspaceBoardPort, boardEl: HTMLElement): void {
      if (isLive()) raw.attach(port, boardEl);
    },
    isLive,
  };
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

  // Instance guarding (design §"Instance guarding") — one liveKey per mount, reusing the EXISTING
  // providerIsLive discipline (NOT a second active registry/map). A mount's facade is live only
  // while this instance is still the active workspace and teardown has not run.
  const liveKey = { instanceId };
  let tornDown = false;
  const isLive = (): boolean => !tornDown && providerIsLive(liveKey);

  // The raw adapter module is retained PRIVATELY only so teardown can call `detach`; no consumer
  // reads it. The instance-visible handle is the guarded facade (or null when no module was given).
  const rawModule = adapter.boardInputModule ?? null;
  const boardInputModule: WorkspaceBoardInputHandle | null =
    rawModule ? guardBoardInputModule(rawModule, isLive) : null;

  const instance: WorkspaceInstance = {
    instanceId,
    boardInputMode: adapter.boardInputMode,
    boardInputModule,
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
    handleUserMove(parentPath: TreePath, node: TreeNode): void {



      if (isLive()) adapter.handleUserMove(parentPath, node);
    },
    teardown(reason: string): void {
      // Idempotent: set tornDown BEFORE detach (so the facade is already dead when the module's
      // detach runs), and call the raw module's detach at most once. A superseding mount (via
      // workspaceSlot.set) and an explicit unmountWorkspace both route through here.
      if (tornDown) return;
      tornDown = true;
      rawModule?.detach(reason);
    },
  };
  workspaceSlot.set(instance, `mount:${adapter.id}`);
  return instance;
}

/**
 * Deactivate `instance` iff it is STILL the active workspace, and tear it down once (design §"Guarded
 * unmount"). Returns true only when `instance` was active and was removed; false for an already-
 * unmounted or superseded instance. A stale instance can never tear down a newer workspace, and a
 * successful call leaves `activeWorkspace()` null. Study (H03a-2) and the ORP drill (H03b) call this
 * on route/drill exit.
 */
export function unmountWorkspace(instance: WorkspaceInstance, reason: string): boolean {
  if (workspaceSlot.get() !== instance) return false;
  workspaceSlot.set(null, `unmount:${reason}`);
  return true;
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
