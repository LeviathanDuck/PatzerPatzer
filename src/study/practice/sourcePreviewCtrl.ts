































import type { Config as CgConfig } from '@lichess-org/chessground/config';
import { uciToMove } from '@lichess-org/chessground/util';
import type { Color } from 'chessops/types';
import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs, renderDisabledControlExplainer } from '../../ui/controlExplainer';
import { renderMoveList } from '../../analyse/moveList';
import { renderMoveNavBar, type MoveNavOverride } from '../../analyse/analysisControls';
import { renderBoard } from '../../board/index';
import { chessBoardAnimationConfig } from '../../board/animation';
import {
  mountWorkspace,
  unmountWorkspace,
  type WorkspaceBoardInputModule,
  type WorkspaceBoardPort,
  type WorkspaceCursor,
  type WorkspaceInstance,
  type WorkspaceSessionSnapshot,
} from '../../analyse/workspaceCore';
import { mainlineNodeList, nodeAtPath, nodeListAt, pathInit } from '../../tree/ops';
import type { TreeNode, TreePath } from '../../tree/types';

// --- Consumer contract (the D4 → D5 producer output D5 renders read-only) ---------------------------

/**
 * Descriptive source attribution for the preview header (rights/API gate §3: author username, study
 * title, id, and a link back MUST be shown; imported material is never presented as Patzer-authored).
 * DESCRIPTIVE ONLY — never an identity: the durable grouping key is the minted `sourceLineageId`, which
 * is stamped at IMPORT time (D3), never here. Structurally matches D4's `VerifiedStudyDescriptor`
 * (lichessLibrary.ts) so the acquisition/import-wiring slice maps D4's descriptor straight onto this
 * without D5 importing D4's network client. All fields optional so honest non-ready states
 * (offline-cached-only, unavailable) can still surface whatever attribution is known.
 */
export interface SourcePreviewDescriptor {
  readonly studyId?: string;
  readonly author?: string;
  readonly title?: string;
  readonly url?: string;
  /** Convenience label if the wiring slice already flattened title/author (D4's `VerifiedSourceDescriptor.label`). */
  readonly label?: string;
}

/**
 * One parsed source chapter — a title plus its full move `TreeNode` root. Structurally matches D4's
 * `ResolvedChapter`. D5 navigates these read-only; it NEVER parses PGN or fetches — D4 owns resolve/parse
 * and hands D5 the resolved snapshot in hand.
 */
export interface SourcePreviewChapter {
  readonly title: string;
  readonly tree: TreeNode;
}

/** Hand-off invoked by the Import control. The actual import (which WRITES a local linked Study and
 *  stamps D3 provenance via saveAction) is EXECUTED OUTSIDE this read-only surface — the import-wiring
 *  slice injects this. When absent, Import is disabled-with-reason (D5 itself writes nothing). */
export type SourcePreviewImport = (
  descriptor: SourcePreviewDescriptor,
  chapters: readonly SourcePreviewChapter[],
) => void;

export interface OpenSourcePreviewOptions {
  readonly onImport?: SourcePreviewImport;
  readonly orientation?: Color;
  readonly initialChapterIndex?: number;
}

// --- State -----------------------------------------------------------------------------------------



type SourcePreviewStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'empty'
  | 'error'
  | 'unavailable'
  | 'offline';

interface SourcePreviewState {
  status: SourcePreviewStatus;
  descriptor: SourcePreviewDescriptor | null;
  chapters: SourcePreviewChapter[];
  chapterIndex: number | null;
  path: TreePath;
  orientation: Color;
  /** Why the source is unavailable (gate §5): removed (404) or turned private (403). */
  unavailableReason: 'removed' | 'private' | null;
  /** Whether the "what an import would create" manifest is expanded (creates nothing). */
  showImportManifest: boolean;
  /** Injected import hand-off, or null when import wiring is not available (Import disabled-with-reason). */
  onImport: SourcePreviewImport | null;
}

const emptyState = (): SourcePreviewState => ({
  status: 'idle',
  descriptor: null,
  chapters: [],
  chapterIndex: null,
  path: '',
  orientation: 'white',
  unavailableReason: null,
  showImportManifest: false,
  onImport: null,
});

let _state = emptyState();

// --- Workspace-core mount state (mirror repertoireBrowseView.ts:54-63) ---
// The preview is a module-owned read-only workspace surface: its inline WorkspaceBoardInputModule
// drives the shared board through a guarded port — NEVER a forked Chessground. `_workspaceInstance`
// is the instance mounted for the current preview generation; `_previewController` is its read-only
// controller; `_previewGeneration` is a monotonic id used to stale-guard close/teardown so a
// superseded preview or a route/destroy transition can never tear down a newer workspace.
let _workspaceInstance: WorkspaceInstance | null = null;
let _previewController: PreviewBoardController | null = null;
let _previewGeneration = 0;

// --- Cursor helpers (mirror repertoireBrowseView.ts:78-89) -----------------------------------------

function activeChapter(): SourcePreviewChapter | null {
  return _state.chapterIndex === null ? null : (_state.chapters[_state.chapterIndex] ?? null);
}

function activeRoot(): TreeNode | null {
  return activeChapter()?.tree ?? null;
}

function activeNode(): TreeNode | null {
  const root = activeRoot();
  return root ? (nodeAtPath(root, _state.path) ?? root) : null;
}

function turnColorForPly(ply: number): 'white' | 'black' {
  return ply % 2 === 0 ? 'white' : 'black';
}

function countMoves(node: TreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countMoves(child), 0);
}

/** Count distinct LINES (leaf paths) in a chapter tree — used only for the read-only import manifest. */
function countLines(node: TreeNode): number {
  if (node.children.length === 0) return 1;
  return node.children.reduce((sum, child) => sum + countLines(child), 0);
}

// --- Read-only board configuration (mirror repertoireBrowseView.ts:146-175) ------------------------
//
// View-only, no legal destinations, no premoves, no drawing, no arrows. `drawable.visible:false` is
// load-bearing in the shared-board world: `enabled:false` only blocks user drawing, but a late
// Analysis engine-arrow write targets the global board instance, and an invisible drawable layer keeps
// it off the preview (the preview must never paint an engine arrow it did not compute).

function previewInitialConfig(session: WorkspaceSessionSnapshot): CgConfig {
  const node = session.node;
  const lastMove = uciToMove(node.uci);
  return {
    fen: node.fen,
    orientation: session.orientation,
    coordinates: true,
    viewOnly: true,
    animation: chessBoardAnimationConfig(),
    turnColor: turnColorForPly(node.ply),
    movable: { free: false, dests: new Map(), showDests: false },
    premovable: { enabled: false, showDests: false, castle: false },
    drawable: { enabled: false, visible: false, shapes: [], autoShapes: [] },
    ...(lastMove ? { lastMove } : {}),
  };
}

function previewSyncConfig(session: WorkspaceSessionSnapshot): CgConfig {
  const node = session.node;
  const lastMove = uciToMove(node.uci);
  return {
    fen: node.fen,
    orientation: session.orientation,
    turnColor: turnColorForPly(node.ply),
    movable: { free: false, dests: new Map(), showDests: false },
    premovable: { enabled: false, showDests: false, castle: false },
    drawable: { enabled: false, visible: false, shapes: [], autoShapes: [] },
    lastMove: lastMove ?? [],
  };
}

// --- Read-only preview board controller (mirror repertoireBrowseView.ts:185-258) -------------------
//
// One controller per successfully-resolved preview source. It owns only its guarded WorkspaceBoardPort
// and reads the live preview `_state` for its cursor/orientation. `handleMove` is a REQUIRED no-op:
// the shared board lifecycle always installs module-owned dispatch as `movable.events.after`, but
// viewOnly:true blocks all board input so it can never fire. Keyboard is surface-owned with a no-op
// handler so Analysis shortcuts (nav, flip, engine, arrows) do not run while preview is visible;
// preview owns its own on-screen nav buttons.
interface PreviewBoardController {
  readonly module: WorkspaceBoardInputModule;
  getCursor(): WorkspaceCursor;
  getOrientation(): Color;
  sync(): void;
}

// Defensive-only FEN for the unreachable no-cursor case (a controller is mounted only for a resolved
// source with a valid active node, and a valid chapter stays selected for its lifetime).
const PREVIEW_FALLBACK_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function createPreviewBoardController(): PreviewBoardController {
  let attachedPort: WorkspaceBoardPort | null = null;

  function getCursor(): WorkspaceCursor {
    const root = activeRoot();
    const node = activeNode();
    if (!root || !node) {
      const leaf: TreeNode = { id: '', ply: 0, fen: PREVIEW_FALLBACK_FEN, children: [] };
      return { root: leaf, path: '', node: leaf, nodeList: [leaf], mainline: [leaf] };
    }
    return {
      root,
      path: _state.path,
      node,
      nodeList: nodeListAt(root, _state.path),
      mainline: mainlineNodeList(root),
    };
  }

  const getOrientation = (): Color => _state.orientation;

  function sync(): void {
    const port = attachedPort;
    if (!port || !activeNode()) return;
    const session: WorkspaceSessionSnapshot = {
      ...getCursor(),
      orientation: _state.orientation,
      instanceId: port.instanceId,
    };
    port.set(previewSyncConfig(session));
  }

  const module: WorkspaceBoardInputModule = {
    id: 'study-source-preview',
    mode: 'read-only-source-browsing',
    allowResize: false,
    configPolicy: {
      kind: 'module-owned',
      initial: context => previewInitialConfig(context.session),
      sync: context => previewSyncConfig(context.session),
    },
    moveDispatch: {
      kind: 'module-owned',
      handleMove: () => {},
    },
    keyboardPolicy: {
      kind: 'surface-owned',
      handleKeydown: () => {},
    },
    attach(port: WorkspaceBoardPort): void {
      attachedPort = port;
      sync();
    },
    detach(): void {
      attachedPort = null;
    },
  };

  return { module, getCursor, getOrientation, sync };
}

/** Push the current preview position onto the shared board through the active controller's port. */
function syncPreviewBoard(): void {
  _previewController?.sync();
}

// --- Navigation (mirror repertoireBrowseView.ts:265-308) — pure cursor state, no persistence -------

function setPath(path: TreePath, redraw: () => void): void {
  const root = activeRoot();
  if (!root) return;
  if (path !== '' && !nodeAtPath(root, path)) return;
  _state.path = path;
  syncPreviewBoard();
  redraw();
}

function navigateFirst(redraw: () => void): void {
  setPath('', redraw);
}

function navigatePrev(redraw: () => void): void {
  if (_state.path === '') return;
  setPath(pathInit(_state.path), redraw);
}

function navigateNext(redraw: () => void): void {
  const node = activeNode();
  if (!node?.children[0]) return;
  setPath(_state.path + node.children[0].id, redraw);
}

function navigateLast(redraw: () => void): void {
  const root = activeRoot();
  if (!root) return;
  let node: TreeNode = root;
  let path = '';
  while (node.children[0]) {
    const child = node.children[0];
    path += child.id;
    node = child;
  }
  setPath(path, redraw);
}

function selectChapter(index: number, redraw: () => void): void {
  if (!_state.chapters[index]) return;
  _state.chapterIndex = index;
  _state.path = '';
  _state.showImportManifest = false;
  syncPreviewBoard();
  redraw();
}

// --- Public open/close API -------------------------------------------------------------------------

export function isSourcePreviewOpen(): boolean {
  return _state.status !== 'idle';
}

export function sourcePreviewStudyId(): string | null {
  return _state.descriptor?.studyId ?? null;
}

/** The current preview generation — a host/caller captures this to stale-guard a deferred close hook. */
export function sourcePreviewGeneration(): number {
  return _previewGeneration;
}

/**
 * Close the preview takeover and release its workspace. Idempotent and generation-guarded: when
 * `expectedGeneration` is supplied and no longer matches the current generation, this is a no-op, so a
 * stale close (e.g. after a source switch, a discard, or a route already left) can never tear down a
 * newer workspace. The generation is incremented FIRST so any subsequent stale close no-ops, then the
 * stored controller/instance are cleared and the workspace is guardedly unmounted (which only releases
 * it if it is still the active workspace). NO IDB delete — nothing was ever written (P2-ORP-20).
 */
export function closeSourcePreview(reason: string = 'close', expectedGeneration?: number): void {
  if (expectedGeneration !== undefined && expectedGeneration !== _previewGeneration) return;
  _previewGeneration++;
  const instance = _workspaceInstance;
  _workspaceInstance = null;
  _previewController = null;
  if (instance) unmountWorkspace(instance, reason);
  _state = emptyState();
}

/** Shared entry: tear down any previous preview generation (guarded unmount + generation bump), then
 *  install a fresh state and — only for a resolved source with a valid active node — mount a read-only
 *  workspace. Loading, error, unavailable, offline, and zero-chapter states create no board instance. */
function startPreview(next: SourcePreviewState): void {
  closeSourcePreview('source-switch');
  _state = next;
  if (_state.status === 'ready' && activeNode()) {
    const controller = createPreviewBoardController();
    _previewController = controller;
    _workspaceInstance = mountWorkspace({
      id: 'study-source-preview',
      boardInputMode: 'read-only-source-browsing',
      boardInputModule: controller.module,
      getCursor: controller.getCursor,
      getOrientation: controller.getOrientation,
      redraw: () => {},
      // Module-owned dispatch runs on movable.events.after; this shared-tree commit hook is
      // intentionally unreachable for a read-only surface.
      handleUserMove: () => {},
    });
  }
}

/**
 * Open a full read-only preview of a resolved verified source (P2-ORP-20 "creates a full read-only
 * Source Preview before import"). The resolved snapshot (descriptor + parsed chapters) is handed in —
 * D5 does NO fetch/parse. WHO calls this from the acquisition list is out of D5 scope (a later
 * acquisition/import-wiring slice), exactly as libraryView calls openRepertoireSourceBrowse.
 */
export function openSourcePreview(
  descriptor: SourcePreviewDescriptor,
  chapters: readonly SourcePreviewChapter[],
  options: OpenSourcePreviewOptions = {},
): void {
  const list = [...chapters];
  const requestedIndex = options.initialChapterIndex ?? 0;
  const chapterIndex = list.length > 0
    ? Math.min(Math.max(requestedIndex, 0), list.length - 1)
    : null;
  startPreview({
    ...emptyState(),
    status: list.length === 0 ? 'empty' : 'ready',
    descriptor,
    chapters: list,
    chapterIndex,
    path: '',
    orientation: options.orientation ?? 'white',
    onImport: options.onImport ?? null,
  });
}

/** Loading state — D4's snapshot is still resolving (no board mounted, no fabricated position). */
export function openSourcePreviewLoading(descriptor: SourcePreviewDescriptor | null = null): void {
  startPreview({ ...emptyState(), status: 'loading', descriptor });
}

/** Source-unavailable state (gate §5): the source returned 404 (removed) / 403 (private) — stop
 *  serving content as live, disable Import with a reason, and NEVER cascade a local delete. */
export function openSourcePreviewUnavailable(
  descriptor: SourcePreviewDescriptor,
  reason: 'removed' | 'private',
): void {
  startPreview({ ...emptyState(), status: 'unavailable', descriptor, unavailableReason: reason });
}

/** Offline-cached-only state (gate §6): no full content available offline — an honest state, never a
 *  fabricated board. */
export function openSourcePreviewOffline(descriptor: SourcePreviewDescriptor | null = null): void {
  startPreview({ ...emptyState(), status: 'offline', descriptor });
}

/** Error state: parse/resolve failure — honest error, no fabricated board. */
export function openSourcePreviewError(descriptor: SourcePreviewDescriptor | null = null): void {
  startPreview({ ...emptyState(), status: 'error', descriptor });
}

// --- Import manifest (read-only; creates NOTHING) --------------------------------------------------

interface ImportManifest {
  readonly chapterCount: number;
  readonly lineCount: number;
  readonly moveCount: number;
  readonly author: string | null;
  readonly title: string | null;
  readonly linkedSourceLabel: string | null;
}

/** Truthful summary of what an import WOULD create, derived purely from the descriptor + chapters in
 *  hand. It creates no StudyItem, no decision rows, no provenance stamp — a description, not a write. */
function importManifest(): ImportManifest {
  const chapters = _state.chapters;
  const lineCount = chapters.reduce((sum, c) => sum + countLines(c.tree), 0);
  const moveCount = chapters.reduce((sum, c) => sum + countMoves(c.tree), 0);
  const d = _state.descriptor;
  return {
    chapterCount: chapters.length,
    lineCount,
    moveCount,
    author: d?.author ?? null,
    title: d?.title ?? d?.label ?? null,
    linkedSourceLabel: d?.label ?? d?.url ?? null,
  };
}

function toggleImportManifest(redraw: () => void): void {
  _state.showImportManifest = !_state.showImportManifest;
  redraw();
}

/** Hand the resolved snapshot to the injected import path and close the preview. The WRITE happens
 *  OUTSIDE this read-only surface (import-wiring slice). No-op when no import wiring is injected. */
function confirmImport(redraw: () => void): void {
  const onImport = _state.onImport;
  const descriptor = _state.descriptor;
  const chapters = _state.chapters;
  if (!onImport || !descriptor) return;
  closeSourcePreview('import');
  onImport(descriptor, chapters);
  redraw();
}

// --- Rendering (mirror repertoireBrowseView.ts:398-532) --------------------------------------------

function descriptorTitle(descriptor: SourcePreviewDescriptor | null): string {
  return descriptor?.title ?? descriptor?.label ?? descriptor?.studyId ?? 'External source';
}

function chapterDisplayTitle(chapter: SourcePreviewChapter, index: number): string {
  return chapter.title.trim() || `Chapter ${index + 1}`;
}

function renderAttributionHeader(redraw: () => void): VNode {
  const d = _state.descriptor;
  const title = descriptorTitle(d);
  const author = d?.author;
  const url = d?.url;
  return h('div.source-preview__header', [
    h('button.source-preview__close', {
      attrs: {
        type: 'button',
        // Essential: discards only the in-memory preview/scratch and writes nothing durable.
        ...controlExplainerAttrs({
          label: 'Close preview',
          description: 'Discards this in-memory source preview and returns to Study. Nothing is saved or created.',
          tier: 'essential',
        }),
      },
      on: { click: () => { closeSourcePreview('close'); redraw(); } },
    }, '← Close preview'),
    h('div.source-preview__attribution', [
      h('span.source-preview__badge', 'Source preview'),
      h('span.source-preview__title', title),
      author ? h('span.source-preview__author', `by ${author}`) : null,
      url
        ? h('a.source-preview__link', {
            attrs: {
              href: url,
              target: '_blank',
              rel: 'noopener noreferrer',
              // More Help: optional context; not an unexplained bare link.
              ...controlExplainerAttrs({
                label: `Open the original study${author ? ` by ${author}` : ''} on the source site`,
                description: 'Opens the original source study in a new tab. Imported material is never presented as Patzer-authored.',
              }),
            },
          }, 'View source')
        : null,
    ]),
  ]);
}

function renderChapterList(redraw: () => void): VNode {
  return h('div.source-preview__chapter-list', _state.chapters.map((chapter, index) => {
    const active = index === _state.chapterIndex;
    const label = chapterDisplayTitle(chapter, index);
    return h('button.source-preview__chapter-row', {
      key: `${index}:${label}`,
      class: { active },
      attrs: {
        type: 'button',
        'aria-pressed': String(active),
        // More Help: ordinary navigation, no label-echo (label is the chapter name; description differs).
        ...controlExplainerAttrs({
          label: `Open ${label}`,
          description: 'Loads this chapter on the read-only preview board.',
        }),
      },
      on: { click: () => selectChapter(index, redraw) },
    }, [
      h('span.source-preview__chapter-title', label),
      h('span.source-preview__chapter-meta', `${countMoves(chapter.tree)} moves`),
    ]);
  }));
}

function renderPreviewBoard(): VNode {
  // Sizing wrapper around the canonical shared board. renderBoard() owns Chessground, the guarded port,
  // and module attach/detach. The generation key forces a fresh board insert+attach on a real source
  // switch so the newly-mounted module receives its port; the update hook re-syncs through the port.
  return h('div.source-preview__board', {
    key: `source-preview-board:${_previewGeneration}`,
    hook: { update: () => syncPreviewBoard() },
  }, [renderBoard()]);
}

function renderNav(redraw: () => void): VNode {
  const root = activeRoot();
  const node = activeNode();
  const nav: MoveNavOverride = {
    canPrev: _state.path !== '',
    canNext: !!node?.children[0],
    first: () => navigateFirst(redraw),
    prev: () => navigatePrev(redraw),
    next: () => navigateNext(redraw),
    last: () => navigateLast(redraw),
    menuHidden: true,
  };
  return root ? renderMoveNavBar([], nav) : h('div.source-preview__nav-empty');
}

function renderMoveListView(redraw: () => void): VNode {
  const root = activeRoot();
  if (!root) return h('div.source-preview__move-list-empty');
  return h('div.source-preview__move-list',
    renderMoveList(
      root,
      _state.path,
      () => undefined,
      p => setPath(p, redraw),
      null,
      false,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { showComments: true, renderRawNags: true },
    ),
  );
}

function renderImportControls(redraw: () => void): VNode {
  const canImport = _state.onImport !== null && _state.status === 'ready';
  const manifest = importManifest();

  const importOpenBtn = h('button.source-preview__import-btn', {
    attrs: {
      type: 'button',
      // Essential: consequential — reveals what an import would create (a durable local Study/lesson).
      ...controlExplainerAttrs({
        label: _state.showImportManifest ? 'Hide import preview' : 'Import…',
        description: 'Shows what importing this source would create. Nothing is created until you confirm.',
        tier: 'essential',
      }),
    },
    on: { click: () => toggleImportManifest(redraw) },
  }, _state.showImportManifest ? 'Hide import preview' : 'Import…');

  const controls: Array<VNode | null> = [importOpenBtn];

  if (_state.showImportManifest) {
    const confirmBtn = h('button.source-preview__import-confirm', {
      attrs: {
        type: 'button',
        ...controlExplainerAttrs({
          label: 'Import this source',
          description: 'Creates a local linked Study/lesson from this source, carrying its author attribution.',
          tier: 'essential',
        }),
      },
      on: { click: () => confirmImport(redraw) },
    }, 'Import this source');

    // When import wiring is unavailable, the confirm control is disabled WITH a reason (standard
    // §Essential: a disabled action explains why it is unavailable).
    const confirmNode = canImport
      ? confirmBtn
      : renderDisabledControlExplainer(
          {
            label: 'Import this source',
            description: 'Import is unavailable here — this preview is read-only and no import action is wired to it yet.',
            tier: 'essential',
          },
          confirmBtn,
        );

    controls.push(
      h('div.source-preview__manifest', [
        h('div.source-preview__manifest-title', 'Importing this source would create:'),
        h('ul.source-preview__manifest-list', [
          h('li', `${manifest.chapterCount} ${manifest.chapterCount === 1 ? 'chapter' : 'chapters'}`),
          h('li', `${manifest.lineCount} ${manifest.lineCount === 1 ? 'line' : 'lines'} (${manifest.moveCount} moves)`),
          manifest.author ? h('li', `Author: ${manifest.author}`) : null,
          manifest.linkedSourceLabel ? h('li', `Linked source: ${manifest.linkedSourceLabel}`) : null,
        ]),
        h('div.source-preview__manifest-note', 'Nothing has been created yet. This is a preview of the import.'),
        confirmNode,
      ]),
    );
  }

  return h('div.source-preview__controls', controls);
}

function renderReady(redraw: () => void): VNode {
  return h('section.source-preview', [
    renderAttributionHeader(redraw),
    h('div.source-preview__content', [
      renderChapterList(redraw),
      h('div.source-preview__viewer', [
        h('div.source-preview__board-col', [
          renderPreviewBoard(),
          renderNav(redraw),
        ]),
        h('div.source-preview__tree-col', [
          h('div.source-preview__chapter-heading', chapterDisplayTitle(activeChapter()!, _state.chapterIndex ?? 0)),
          renderMoveListView(redraw),
          renderImportControls(redraw),
        ]),
      ]),
    ]),
  ]);
}

function renderMessageState(redraw: () => void, message: string, extra: VNode | null = null): VNode {
  return h('section.source-preview', [
    renderAttributionHeader(redraw),
    h('div.source-preview__message', [
      h('p.source-preview__message-text', message),
      extra,
    ]),
  ]);
}

function renderUnavailable(redraw: () => void): VNode {
  const removed = _state.unavailableReason === 'removed';
  const message = removed
    ? 'This source is no longer available (it was removed at the origin).'
    : 'This source is no longer available (its visibility was changed to private).';
  // Import is disabled WITH a reason (gate §5): no cascade delete — nothing local exists pre-import.
  const disabledImport = renderDisabledControlExplainer(
    {
      label: 'Import this source',
      description: removed
        ? 'Import is unavailable because the source was removed at the origin. Nothing local is affected.'
        : 'Import is unavailable because the source is now private at the origin. Nothing local is affected.',
      tier: 'essential',
    },
    h('button.source-preview__import-btn', { attrs: { type: 'button' } }, 'Import…'),
  );
  return renderMessageState(redraw, message, h('div.source-preview__controls', [disabledImport]));
}

function renderOffline(redraw: () => void): VNode {
  const disabledImport = renderDisabledControlExplainer(
    {
      label: 'Import this source',
      description: 'Import is unavailable offline — the full source content could not be loaded.',
      tier: 'essential',
    },
    h('button.source-preview__import-btn', { attrs: { type: 'button' } }, 'Import…'),
  );
  return renderMessageState(
    redraw,
    'Source content is unavailable offline. Reconnect to preview and import this source.',
    h('div.source-preview__controls', [disabledImport]),
  );
}

/** Full-surface render entry — the Study-detail host returns this when isSourcePreviewOpen(). */
export function renderSourcePreview(redraw: () => void): VNode {
  switch (_state.status) {
    case 'ready':
      return renderReady(redraw);
    case 'loading':
      return renderMessageState(redraw, 'Loading source…');
    case 'empty':
      return renderMessageState(redraw, 'No chapters found in this source.');
    case 'error':
      return renderMessageState(redraw, 'This source could not be loaded.');
    case 'unavailable':
      return renderUnavailable(redraw);
    case 'offline':
      return renderOffline(redraw);
    case 'idle':
    default:
      // Not-yet-resolved / no source selected (mirrors repertoireBrowseView's no-source branch).
      return renderMessageState(redraw, 'No source selected.');
  }
}
