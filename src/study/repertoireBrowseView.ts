





import type { Config as CgConfig } from '@lichess-org/chessground/config';
import { uciToMove } from '@lichess-org/chessground/util';
import type { Color } from 'chessops/types';
import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs } from '../ui/controlExplainer';
import { renderMoveList } from '../analyse/moveList';
import { renderMoveNavBar, type MoveNavOverride } from '../analyse/analysisControls';
import { renderBoard } from '../board/index';
import { chessBoardAnimationConfig } from '../board/animation';
import {
  mountWorkspace,
  unmountWorkspace,
  type WorkspaceBoardInputModule,
  type WorkspaceBoardPort,
  type WorkspaceCursor,
  type WorkspaceInstance,
  type WorkspaceSessionSnapshot,
} from '../analyse/workspaceCore';
import { mainlineNodeList, nodeAtPath, nodeListAt, pathInit } from '../tree/ops';
import type { TreeNode, TreePath, Uci } from '../tree/types';
import { parseRepertoirePgn, type ParsedRepertoireGame } from '../repertoire/parse';
import type { RepertoireSource } from '../repertoire';

interface RepertoireBrowseState {
  source: RepertoireSource | null;
  accentIndex: number;
  chapters: ParsedRepertoireGame[];
  chapterIndex: number | null;
  path: TreePath;
  orientation: 'white' | 'black';
  loading: boolean;
  error: boolean;
}

const emptyState = (): RepertoireBrowseState => ({
  source: null,
  accentIndex: 0,
  chapters: [],
  chapterIndex: null,
  path: '',
  orientation: 'white',
  loading: false,
  error: false,
});

let _state = emptyState();

// --- Workspace-core migration state (CCW-H02) ---
// Repertoire Browse is now a module-owned read-only workspace surface (its inline
// WorkspaceBoardInputModule drives the shared board through a guarded port) rather than a forked
// Chessground. `_workspaceInstance` is the instance mounted for the current browse generation;
// `_browseController` is its read-only controller; `_browseGeneration` is a monotonic id used to
// stale-guard close/teardown so a superseded browse or a route/destroy transition can never tear
// down a newer workspace.
let _workspaceInstance: WorkspaceInstance | null = null;
let _browseController: BrowseBoardController | null = null;
let _browseGeneration = 0;

function sourceOrientation(source: RepertoireSource): 'white' | 'black' {
  return source.side === 'black' ? 'black' : 'white';
}

function chapterTitle(chapter: ParsedRepertoireGame, index: number): string {
  const parserFallback = `Game ${index + 1}`;
  return chapter.title === parserFallback ? `Chapter ${index + 1}` : chapter.title;
}

function countMoves(node: TreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countMoves(child), 0);
}

function activeChapter(): ParsedRepertoireGame | null {
  return _state.chapterIndex === null ? null : (_state.chapters[_state.chapterIndex] ?? null);
}

function activeRoot(): TreeNode | null {
  return activeChapter()?.tree ?? null;
}

function activeNode(): TreeNode | null {
  const root = activeRoot();
  return root ? (nodeAtPath(root, _state.path) ?? root) : null;
}

interface RepertoireBrowsePrefixMatch {
  path: TreePath;
  matchedCount: number;
}

function pathForUciPrefix(root: TreeNode, uciPrefix: readonly Uci[]): RepertoireBrowsePrefixMatch {
  let node = root;
  let path = '';
  let matchedCount = 0;
  for (const uci of uciPrefix) {
    const child = node.children.find(candidate => candidate.uci === uci);
    if (!child) break;
    path += child.id;
    node = child;
    matchedCount += 1;
  }
  return { path, matchedCount };
}

function browseTargetForUciPrefix(
  chapters: readonly ParsedRepertoireGame[],
  uciPrefix: readonly Uci[],
): { chapterIndex: number | null; path: TreePath } {
  if (uciPrefix.length > 0) {
    let best: { chapterIndex: number; path: TreePath; matchedCount: number } | null = null;
    for (let index = 0; index < chapters.length; index += 1) {
      const match = pathForUciPrefix(chapters[index]!.tree, uciPrefix);
      if (match.matchedCount === uciPrefix.length) return { chapterIndex: index, path: match.path };
      if (match.matchedCount > 0 && (!best || match.matchedCount > best.matchedCount)) {
        best = { chapterIndex: index, path: match.path, matchedCount: match.matchedCount };
      }
    }
    if (best) return { chapterIndex: best.chapterIndex, path: best.path };
  }
  return { chapterIndex: chapters.length > 0 ? 0 : null, path: '' };
}

function turnColorForPly(ply: number): 'white' | 'black' {
  return ply % 2 === 0 ? 'white' : 'black';
}

// --- Read-only board configuration (CCW-H02) ---
//
// browseInitialConfig / browseSyncConfig reproduce the pre-migration forked-board configuration for
// the shared workspace board, byte-for-byte in observable behavior: view-only, no legal
// destinations, no premoves, no drawing, and no arrows. The previously-implicit Chessground defaults
// (coordinates, premoves disabled) are made explicit so the read-only contract never inherits an
// Analysis default through the shared board's deep-merge. `drawable.visible:false` is required in the
// shared-board world: `enabled:false` only blocks user drawing, but a late Analysis engine-arrow
// write targets the global board instance, and an invisible drawable layer keeps it off Browse
// (mirrors Lichess's read-only ui/analyse/src/study/multiBoard.ts). The initial config omits
// `lastMove` at the root (conditional) while the sync config always sends `lastMove ?? []` — the
// empty array is how Chessground's configure() clears the root last-move highlight through the
// guarded port, replacing the pre-migration raw `state.lastMove = []; redrawAll()` escape hatch.

function browseInitialConfig(session: WorkspaceSessionSnapshot): CgConfig {
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

function browseSyncConfig(session: WorkspaceSessionSnapshot): CgConfig {
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

// --- Read-only browse board controller (CCW-H02) ---
//
// One controller per successfully-parsed browse source. It owns only its guarded WorkspaceBoardPort
// and reads the live browse `_state` for its cursor/orientation. `handleMove` is a REQUIRED no-op:
// the shared board lifecycle always installs module-owned dispatch as `movable.events.after`, but
// viewOnly:true blocks all board input so it can never fire. Keyboard is surface-owned with a no-op
// handler so Analysis shortcuts (nav, flip, engine, arrows, best-move) do not run while Browse is
// visible; Browse has no keyboard-navigation contract of its own.
interface BrowseBoardController {
  readonly module: WorkspaceBoardInputModule;
  getCursor(): WorkspaceCursor;
  getOrientation(): Color;
  /** Write the current browse position through the attached guarded port (no-op if detached). */
  sync(): void;
}

// Defensive-only FEN for the unreachable no-cursor case (a controller is mounted only for a valid
// parsed source with a valid active node, and a valid chapter stays selected for its lifetime).
const BROWSE_FALLBACK_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function createBrowseBoardController(): BrowseBoardController {
  let attachedPort: WorkspaceBoardPort | null = null;

  function getCursor(): WorkspaceCursor {
    const root = activeRoot();
    const node = activeNode();
    if (!root || !node) {
      // Unreachable while mounted; return a coherent single leaf so session()/config never
      // dereferences a null node.
      const leaf: TreeNode = { id: '', ply: 0, fen: BROWSE_FALLBACK_FEN, children: [] };
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
    port.set(browseSyncConfig(session));
  }

  const module: WorkspaceBoardInputModule = {
    id: 'repertoire-browse',
    mode: 'read-only-source-browsing',
    allowResize: false,
    configPolicy: {
      kind: 'module-owned',
      initial: context => browseInitialConfig(context.session),
      sync: context => browseSyncConfig(context.session),
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

/** Push the current browse position onto the shared board through the active controller's port. */
function syncBrowseBoard(): void {
  _browseController?.sync();
}

function setPath(path: TreePath, redraw: () => void): void {
  const root = activeRoot();
  if (!root) return;
  if (path !== '' && !nodeAtPath(root, path)) return;
  _state.path = path;
  syncBrowseBoard();
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
  syncBrowseBoard();
  redraw();
}

export function repertoireBrowseSourceId(): string | null {
  return _state.source?.id ?? null;
}

export function isRepertoireSourceBrowseOpen(): boolean {
  return _state.source !== null || _state.loading || _state.error;
}

/** The current browse generation — libraryView captures this to stale-guard its takeover destroy hook. */
export function repertoireBrowseGeneration(): number {
  return _browseGeneration;
}

/**
 * Close the browse takeover and release its workspace. Idempotent and generation-guarded: when
 * `expectedGeneration` is supplied and no longer matches the current generation, this is a no-op, so
 * a stale destroy hook (e.g. after a back button already closed, or after a source switch) can never
 * tear down a newer workspace. The generation is incremented FIRST so any subsequent stale close
 * no-ops, then the stored controller/instance are cleared and the workspace is guardedly unmounted
 * (which only releases it if it is still the active workspace).
 */
export function closeRepertoireSourceBrowse(reason: string = 'close', expectedGeneration?: number): void {
  if (expectedGeneration !== undefined && expectedGeneration !== _browseGeneration) return;
  _browseGeneration++;
  const instance = _workspaceInstance;
  _workspaceInstance = null;
  _browseController = null;
  if (instance) unmountWorkspace(instance, reason);
  _state = emptyState();
}

export function openRepertoireSourceBrowse(
  source: RepertoireSource,
  accentIndex: number,
  options: { uciPrefix?: readonly Uci[] } = {},
): void {
  // Tear down any previous browse generation first (guarded unmount + generation bump), then start a
  // fresh generation for this source.
  closeRepertoireSourceBrowse('source-switch');
  _state = {
    source,
    accentIndex,
    chapters: [],
    chapterIndex: null,
    path: '',
    orientation: sourceOrientation(source),
    loading: true,
    error: false,
  };
  try {
    const chapters = parseRepertoirePgn(source.rawPgn);
    const target = browseTargetForUciPrefix(chapters, options.uciPrefix ?? []);
    _state = {
      ..._state,
      chapters,
      chapterIndex: target.chapterIndex,
      path: target.path,
      loading: false,
      error: false,
    };
  } catch {
    _state = {
      ..._state,
      chapters: [],
      chapterIndex: null,
      loading: false,
      error: true,
    };
  }
  // Mount a read-only workspace only for a successfully-parsed source with a valid active node.
  // Loading, parse-error, and zero-chapter states create no board instance.
  if (activeNode()) {
    const controller = createBrowseBoardController();
    _browseController = controller;
    _workspaceInstance = mountWorkspace({
      id: 'repertoire-browse',
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

function renderChip(source: RepertoireSource): VNode {
  const side = source.side === 'white' ? 'W' : source.side === 'black' ? 'B' : 'WB';
  return h(`span.repertoire__chip.repertoire__accent--${_state.accentIndex % 8}`, [
    h('span.repertoire__chip-dot'),
    h('span.repertoire__chip-name', source.name),
    h('span.repertoire__side-badge', side),
  ]);
}

function renderChapterList(redraw: () => void): VNode {
  return h('div.repertoire__chapter-list', _state.chapters.map((chapter, index) => {
    const active = index === _state.chapterIndex;
    return h('button.repertoire__chapter-row', {
      key: `${index}:${chapter.sourceGameIndex}`,
      class: { active },
      attrs: {
        'aria-label': `Open ${chapterTitle(chapter, index)}`,
        'aria-pressed': String(active),
        ...controlExplainerAttrs({ label: `Open ${chapterTitle(chapter, index)}`, description: 'Loads this chapter on the repertoire board.' }),
      },
      on: { click: () => selectChapter(index, redraw) },
    }, [
      h('span.repertoire__chapter-title', chapterTitle(chapter, index)),
      h('span.repertoire__chapter-meta', `${countMoves(chapter.tree)} moves`),
    ]);
  }));
}

function renderBrowseBoard(): VNode {
  // Sizing wrapper around the canonical shared board. `.repertoire__browse-board` supplies the square
  // dimensions; renderBoard() owns the `.cg-wrap`, Chessground construction, the guarded port, and
  // module attach/detach. The generation key forces a fresh board insert+attach on a real source
  // switch so the newly-mounted module receives its port. The update hook preserves the pre-migration
  // redraw-time resync, now routed through the guarded port.
  return h('div.repertoire__browse-board', {
    key: `repertoire-browse-board:${_browseGeneration}`,
    hook: {
      update: () => syncBrowseBoard(),
    },
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
  return root ? renderMoveNavBar([], nav) : h('div.repertoire__browse-nav-empty');
}

function renderChapterViewer(redraw: () => void): VNode {
  const chapter = activeChapter();
  const root = chapter?.tree;
  if (!chapter || !root) {
    return h('div.repertoire__browse-empty', 'Select a chapter to browse.');
  }
  return h('div.repertoire__browse-layout', [
    h('div.repertoire__browse-board-col', [
      renderBrowseBoard(),
      renderNav(redraw),
    ]),
    h('div.repertoire__browse-tree-col', [
      h('div.repertoire__browse-chapter-heading', chapterTitle(chapter, _state.chapterIndex ?? 0)),
      h('div.repertoire__browse-move-list',
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
        )
      ),
    ]),
  ]);
}

export function renderRepertoireSourceBrowse(redraw: () => void): VNode {
  const source = _state.source;
  if (_state.loading) {
    return h('section.repertoire__browse', [
      h('div.repertoire__browse-loading', 'Loading repertoire source...'),
    ]);
  }
  if (!source) {
    return h('section.repertoire__browse', [
      h('button.repertoire__browse-back', {
        attrs: { ...controlExplainerAttrs({ label: 'Back to Study Library' }) },
        on: { click: () => { closeRepertoireSourceBrowse(); redraw(); } },
      }, '← Library'),
      h('div.repertoire__browse-empty', 'No repertoire source selected.'),
    ]);
  }
  if (_state.error) {
    return h('section.repertoire__browse', [
      h('button.repertoire__browse-back', {
        attrs: { ...controlExplainerAttrs({ label: 'Back to Study Library' }) },
        on: { click: () => { closeRepertoireSourceBrowse(); redraw(); } },
      }, '← Library'),
      h('div.repertoire__browse-error', 'Could not parse this repertoire source.'),
    ]);
  }
  return h('section.repertoire__browse', [
    h('div.repertoire__browse-header', [
      h('button.repertoire__browse-back', {
        attrs: { ...controlExplainerAttrs({ label: 'Back to Study Library' }) },
        on: { click: () => { closeRepertoireSourceBrowse(); redraw(); } },
      }, '← Library'),
      renderChip(source),
      h('span.repertoire__browse-count', `${_state.chapters.length} ${_state.chapters.length === 1 ? 'chapter' : 'chapters'}`),
    ]),
    _state.chapters.length === 0
      ? h('div.repertoire__browse-empty', 'No chapters found in this source.')
      : h('div.repertoire__browse-content', [
          renderChapterList(redraw),
          renderChapterViewer(redraw),
        ]),
  ]);
}
