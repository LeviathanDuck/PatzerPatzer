// Repertoire source browser for Study Library Surface D.
// Reuses the Study standalone board pattern and the analysis move-list renderer in read-only mode.

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import { uciToMove } from '@lichess-org/chessground/util';
import { h, type VNode } from 'snabbdom';
import { renderMoveList } from '../analyse/moveList';
import { renderMoveNavBar, type MoveNavOverride } from '../analyse/analysisControls';
import { chessBoardAnimationConfig } from '../board/animation';
import { nodeAtPath, pathInit } from '../tree/ops';
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
let _cgRef: CgApi | undefined;

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

function syncBrowseBoard(): void {
  const node = activeNode();
  if (!_cgRef || !node) return;
  const lastMove = uciToMove(node.uci);
  const config = {
    fen: node.fen,
    orientation: _state.orientation,
    turnColor: turnColorForPly(node.ply),
    movable: { free: false, dests: new Map(), showDests: false },
    lastMove: lastMove ?? [],
  };
  _cgRef.set(config);
  if (!lastMove) {
    _cgRef.state.lastMove = [];
    _cgRef.redrawAll();
  }
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

export function closeRepertoireSourceBrowse(): void {
  _cgRef?.destroy();
  _cgRef = undefined;
  _state = emptyState();
}

export function openRepertoireSourceBrowse(
  source: RepertoireSource,
  accentIndex: number,
  options: { uciPrefix?: readonly Uci[] } = {},
): void {
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
  syncBrowseBoard();
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
        title: `Open ${chapterTitle(chapter, index)}`,
        'aria-label': `Open ${chapterTitle(chapter, index)}`,
      },
      on: { click: () => selectChapter(index, redraw) },
    }, [
      h('span.repertoire__chapter-title', chapterTitle(chapter, index)),
      h('span.repertoire__chapter-meta', `${countMoves(chapter.tree)} moves`),
    ]);
  }));
}

function renderBrowseBoard(): VNode {
  return h('div.cg-wrap.repertoire__browse-board', {
    key: 'repertoire-browse-board',
    hook: {
      insert: (vnode) => {
        const node = activeNode();
        if (!node) return;
        const lastMove = uciToMove(node.uci);
        _cgRef = makeChessground(vnode.elm as HTMLElement, {
          orientation: _state.orientation,
          viewOnly: true,
          animation: chessBoardAnimationConfig(),
          fen: node.fen,
          turnColor: turnColorForPly(node.ply),
          movable: { free: false, dests: new Map(), showDests: false },
          drawable: { enabled: false },
          ...(lastMove ? { lastMove } : {}),
        });
      },
      update: () => syncBrowseBoard(),
      destroy: () => {
        _cgRef?.destroy();
        _cgRef = undefined;
      },
    },
  });
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
        attrs: { title: 'Back to Study Library', 'aria-label': 'Back to Study Library' },
        on: { click: () => { closeRepertoireSourceBrowse(); redraw(); } },
      }, '← Library'),
      h('div.repertoire__browse-empty', 'No repertoire source selected.'),
    ]);
  }
  if (_state.error) {
    return h('section.repertoire__browse', [
      h('button.repertoire__browse-back', {
        attrs: { title: 'Back to Study Library', 'aria-label': 'Back to Study Library' },
        on: { click: () => { closeRepertoireSourceBrowse(); redraw(); } },
      }, '← Library'),
      h('div.repertoire__browse-error', 'Could not parse this repertoire source.'),
    ]);
  }
  return h('section.repertoire__browse', [
    h('div.repertoire__browse-header', [
      h('button.repertoire__browse-back', {
        attrs: { title: 'Back to Study Library', 'aria-label': 'Back to Study Library' },
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
