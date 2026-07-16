// Move list / tree view rendering.
// Adapted from lichess-org/lila: ui/analyse/src/treeView/columnView.ts

import { h, thunk, type VNode } from 'snabbdom';
import { type MoveLabel } from '../engine/winchances';
import { labelForReviewEval } from './deepenedEval';
import { showReviewLabels } from '../engine/ctrl';
import { missedMomentConfig } from '../engine/tactics';
import { pathInit } from '../tree/ops';
import { nagToGlyph } from '../tree/pgn';
import type { ReviewEngineMetadata } from '../idb';
import type { Glyph, TreeNode, TreePath } from '../tree/types';
import { controlExplainerAttrs, iconControlExplainerAttrs } from '../ui/controlExplainer';

function activateOnKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

// True on touch/stylus devices — used to decide which context-menu trigger to attach.
// Mirrors lichess-org/lila: ui/lib/src/device.ts isTouchDevice()
const isTouchDevice = (): boolean => window.matchMedia('(hover: none)').matches;

// Build context-menu event handlers for a move element.
// Desktop: right-click (contextmenu event).
// Touch:   long-press (pointerdown hold ≥ 400ms) + double-tap (dblclick).
// Adapted from lichess-org/lila: ui/analyse/src/treeView/treeView.ts touch handler block.
function buildContextHandlers(
  path: string,
  onContextMenu: (path: string, e: MouseEvent) => void,
): Record<string, (e: Event) => void> {
  const handlers: Record<string, (e: Event) => void> = {
    contextmenu: (e) => { e.preventDefault(); onContextMenu(path, e as MouseEvent); },
  };
  if (isTouchDevice()) {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    handlers['dblclick'] = (e) => { e.preventDefault(); onContextMenu(path, e as MouseEvent); };
    handlers['pointerdown'] = (e) => {
      holdTimer = setTimeout(() => { onContextMenu(path, e as MouseEvent); }, 400);
    };
    handlers['pointerup']    = () => clearTimeout(holdTimer);
    handlers['pointerleave'] = () => clearTimeout(holdTimer);
  }
  return handlers;
}

// Eval lookup: returns review/eval data for a given path, or undefined.
// Typed structurally so callers don't need to import PositionEval.
type EvalLookup = (path: string) => { loss?: number; best?: string; mate?: number; label?: MoveLabel; depth?: number } | undefined;

export interface MoveListRenderOptions {
  showComments?: boolean;
  renderRawNags?: boolean;
  reviewEngine?: ReviewEngineMetadata;
}

function shouldShowReviewAnnotation(
  userColor: 'white' | 'black' | null,
  nodePly: number,
  userOnly: boolean,
): boolean {
  if (!userOnly || userColor === null) return true;
  const isWhiteMove = nodePly % 2 === 1;
  return (userColor === 'white' && isWhiteMove) || (userColor === 'black' && !isWhiteMove);
}

// Annotation glyph colors — mirrors lichess-org/lila: ui/lib/css/theme/_theme.default.scss
// $c-blunder / $c-mistake / $c-inaccuracy / $c-brilliant / $c-secondary / $c-interesting
// Canonical per-glyph color mapping — also reused by the glyph picker (annotationView.ts)
// so a glyph's color matches everywhere it appears (move list, board badges, picker).
export const GLYPH_COLORS: Record<string, string> = {
  '??':  'hsl(0,69%,60%)',    // blunder     — muted red
  '?':   'hsl(41,100%,45%)',  // mistake     — amber
  '?!':  'hsl(202,78%,62%)',  // inaccuracy  — steel blue
  '!!':  'hsl(129,71%,45%)',  // brilliant   — green
  '!':   'hsl(88,62%,37%)',   // good        — olive green
  '!?':  'hsl(307,80%,70%)',  // interesting — pink/purple
  'M?!': '#a855f7',           // missed forced mate — purple (matches games-list M?! badge)
};










function renderMoveSpan(
  node:                 TreeNode,
  path:                 TreePath,
  parent:               TreeNode,
  showIndex:            boolean,
  isActive:             boolean,
  getEval:              EvalLookup,
  navigate:             (p: string) => void,
  userColor:            'white' | 'black' | null,
  userOnly:             boolean,
  isContextActive:      boolean,
  onContextMenu:        ((path: string, e: MouseEvent) => void) | undefined,
  isWorstMiss:          boolean,
  bookmarkedPaths:      Set<string> | undefined,
  onToggleBookmark:     ((path: string) => void) | undefined,
  showReviewLabelsFlag: boolean,
  missedMateMaxN:       number,
  renderRawNags:        boolean | undefined,
  reviewEngine:         ReviewEngineMetadata | undefined,
  _evalCacheRevision:   number,
): VNode {
  const cached       = getEval(path);
  const parentCached = getEval(pathInit(path));

  // PGN glyphs take priority; fall back to review annotation. If a node was live-deepened beyond
  // the stored review stamp, classify from the current loss so the displayed label matches the
  // current eval and the delayed persistence path.
  // Mirrors lichess-org/lila: ui/analyse/src/treeView/inlineView.ts moveNode glyph priority.
  const pgnGlyphs: Glyph[] = renderRawNags
    ? (node.nags ?? []).map(nagToGlyph).filter((g): g is Glyph => g !== undefined)
    : (node.glyphs ?? []);
  const playedBest = node.uci !== undefined && node.uci === parentCached?.best;

  // Missed forced mate: the parent position had a short forced mate for the mover,
  // but the played move does not maintain it. Always shown for both players regardless
  // of the userOnly filter, so the opponent's missed mates are never hidden.
  const isWhiteMove  = node.ply % 2 === 1;
  const parentMate   = parentCached?.mate;
  const moverHadMate = parentMate !== undefined
    && (isWhiteMove ? parentMate > 0 : parentMate < 0)
    && Math.abs(parentMate) <= missedMateMaxN
    && parentCached?.best !== undefined;
  const mateWasLost  = cached?.mate === undefined
    || (isWhiteMove ? (cached.mate <= 0) : (cached.mate >= 0));
  const isMissedMate = showReviewLabelsFlag && !playedBest && moverHadMate && mateWasLost;

  const computedLabel: MoveLabel | null = labelForReviewEval(
    cached,
    playedBest,
    showReviewLabelsFlag && shouldShowReviewAnnotation(userColor, node.ply, userOnly),
    reviewEngine,
  );
  const computedSymbol = isMissedMate ? 'M?!'
    : computedLabel === 'blunder'    ? '??'
    : computedLabel === 'mistake'    ? '?'
    : computedLabel === 'inaccuracy' ? '?!'
    : null;

  const renderedGlyphs: Array<Pick<Glyph, 'symbol'>> = pgnGlyphs.length > 0
    ? pgnGlyphs
    : (computedSymbol ? [{ symbol: computedSymbol }] : []);
  const mate   = cached?.mate;

  // Build children matching Lichess tview2: index? + san + glyph? + eval?
  // Mirrors lichess-org/lila: ui/analyse/src/view/components.ts renderMoveNodes + renderIndex
  const inner: VNode[] = [];
  if (showIndex) {
    const n = Math.ceil(node.ply / 2);
    inner.push(h('index', node.ply % 2 === 1 ? `${n}.` : `${n}…`));
  }
  inner.push(h('san', node.san ?? ''));
  for (const glyph of renderedGlyphs) {
    inner.push(h('glyph', { attrs: { style: `color:${GLYPH_COLORS[glyph.symbol] ?? '#aaa'}` } }, glyph.symbol));
  }
  // mate === 0 = terminal checkmate position; use KO notation instead of +M0.
  if (mate !== undefined) inner.push(h('eval', mate === 0 ? '#KO!' : `+M${Math.abs(mate)}`));

  const isBookmarked = bookmarkedPaths?.has(path) ?? false;
  const moveVnode = h('move', {
    class: {
      active:           isActive,
      'context-active': isContextActive,
      'worst-miss':     isWorstMiss,
      bookmarked:       isBookmarked,
    },
    attrs: { p: path, role: 'button', tabindex: '0', ...iconControlExplainerAttrs({
      label: `Go to ${node.san ?? 'move'}`,
      description: 'Jump to this position in the move tree.',
    }) },
    on: {
      click: () => navigate(path),
      keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => navigate(path)),
      ...(onContextMenu ? buildContextHandlers(path, onContextMenu) : {}),
    },
  }, inner);

  if (!onToggleBookmark) return moveVnode;

  // Wrap move + bookmark toggle in a move-wrap element.
  // Bookmark button is shown on hover via CSS.
  return h('move-wrap', [
    moveVnode,
    h('button.bookmark-btn', {
      class:  { 'bookmark-btn--active': isBookmarked },
      attrs:  {
        ...iconControlExplainerAttrs({
          label: isBookmarked ? 'Remove bookmark' : 'Bookmark this position',
          description: isBookmarked
            ? 'Remove the bookmark from this move-tree position.'
            : 'Bookmark this move-tree position for quick reference.',
        }),
      },
      on:     { click: (e: MouseEvent) => { e.stopPropagation(); onToggleBookmark(path); } },
    }, '★'),
  ]);
}


















function renderMoveSpanMemo(
  node:              TreeNode,
  path:              TreePath,
  parent:            TreeNode,
  showIndex:         boolean,
  currentPath:       string,
  getEval:           EvalLookup,
  navigate:          (p: string) => void,
  userColor:         'white' | 'black' | null,
  userOnly:          boolean,
  contextMenuPath:   string | null | undefined,
  onContextMenu:     ((path: string, e: MouseEvent) => void) | undefined,
  worstMissPath:     string | undefined,
  bookmarkedPaths:   Set<string> | undefined,
  onToggleBookmark:  ((path: string) => void) | undefined,
  options:           MoveListRenderOptions | undefined,
  evalCacheRevision: number,
): VNode {
  const isActive        = path === currentPath;
  const isContextActive = contextMenuPath === path;
  const isWorstMiss      = worstMissPath !== undefined && path === worstMissPath;



  const glyphKey = node.glyphs ? node.glyphs.map(g => g.id).join(',') : '';
  const sel = onToggleBookmark ? 'move-wrap' : 'move';
  // No explicit key: these rows sit in a flat children array alongside unkeyed siblings
  // (index/interrupt/move.empty placeholders emitted by renderColumnNodes/renderInlineNodes).
  // Keeping these thunks unkeyed reconciles them the same (purely positional) way the unthunked
  // vnodes always were, rather than introducing a new keyed-vs-unkeyed mix into a list that was
  // never keyed before — the memoization win comes entirely from the thunk's args-equality check
  // in prepatch, not from a key, so there's no reason to add one here.
  return thunk(sel, renderMoveSpan, [
    node, path, parent, showIndex, isActive, getEval, navigate, userColor, userOnly,
    isContextActive, onContextMenu, isWorstMiss, bookmarkedPaths, onToggleBookmark,
    showReviewLabels, missedMomentConfig.missedMateMaxN,
    options?.renderRawNags, options?.reviewEngine,
    evalCacheRevision, glyphKey,
  ]);
}

function renderCommentNodes(node: TreeNode, options: MoveListRenderOptions | undefined): VNode[] {
  if (!options?.showComments || !node.comments?.length) return [];
  return node.comments
    .filter(comment => comment.text.trim().length > 0)
    .map(comment => h('comment', comment.text));
}

/**
 * Sideline helper: renders a variation line as inline moves until the line
 * branches again, then emits nested column-view lines instead of parenthetical
 * inline wrappers.
 * Mirrors lichess-org/lila: ui/analyse/src/treeView/inlineView.ts sidelineNodes
 */
function renderInlineNodes(
  nodes:              TreeNode[],
  parentPath:         TreePath,
  parent:             TreeNode,
  needsMoveNum:       boolean,
  currentPath:        string,
  getEval:            EvalLookup,
  navigate:           (p: string) => void,
  userColor:          'white' | 'black' | null,
  userOnly:           boolean,
  contextMenuPath:    string | null | undefined,
  onContextMenu:      ((path: string, e: MouseEvent) => void) | undefined,
  worstMissPath:      string | undefined,
  bookmarkedPaths:    Set<string> | undefined,
  onToggleBookmark:   ((path: string) => void) | undefined,
  options:            MoveListRenderOptions | undefined,
  evalCacheRevision:  number,
): VNode[] {
  if (nodes.length === 0) return [];
  if (nodes.length > 1) {
    return [
      h('lines', nodes.map(node => (
        h('line', renderInlineNodes([node], parentPath, parent, true, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision))
      ))),
    ];
  }

  const main = nodes[0]!;
  const mainPath = parentPath + main.id;
  const out: VNode[] = [];

  const showIndex = needsMoveNum || main.ply % 2 === 1;
  out.push(renderMoveSpanMemo(main, mainPath, parent, showIndex, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision));
  out.push(...renderCommentNodes(main, options));

  if (main.children.length > 1) {
    out.push(...renderInlineNodes(main.children, mainPath, main, true, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision));
  } else {
    out.push(...renderInlineNodes(main.children, mainPath, main, false, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision));
  }

  return out;
}

/**
 * Render the move tree into the flat sequence of flex children expected by
 * div.tview2.tview2-column.
 *
 * Column layout — each row is: index(13%) | white move(43.5%) | black move(43.5%)
 * index is a top-level flex child (not inside move).
 * Variations appear as full-width interrupt > lines > line blocks.
 *
 * Adapted from lichess-org/lila: ui/analyse/src/treeView/columnView.ts ColumnView.renderNodes
 */
function renderColumnNodes(
  nodes:              TreeNode[],
  parentPath:         TreePath,
  parent:             TreeNode,
  out:                VNode[],
  currentPath:        string,
  getEval:            EvalLookup,
  navigate:           (p: string) => void,
  userColor:          'white' | 'black' | null,
  userOnly:           boolean,
  deleteVariation:    ((path: string) => void) | undefined,
  contextMenuPath:    string | null | undefined,
  onContextMenu:      ((path: string, e: MouseEvent) => void) | undefined,
  worstMissPath:      string | undefined,
  foldedVariations:   Set<string> | undefined,
  onToggleFold:       ((path: string) => void) | undefined,
  bookmarkedPaths:    Set<string> | undefined,
  onToggleBookmark:   ((path: string) => void) | undefined,
  options:            MoveListRenderOptions | undefined,
  evalCacheRevision:  number,
): void {
  if (nodes.length === 0) return;
  const main       = nodes[0]!;
  const variations = nodes.slice(1);
  const mainPath = parentPath + main.id;
  const isWhite = main.ply % 2 === 1;

  // index element before white's move — direct flex child at 13% width.
  // Mirrors lichess-org/lila: columnView.ts isWhite && renderIndex(child.ply, false)
  if (isWhite) out.push(h('index', String(Math.ceil(main.ply / 2))));

  // The move — no embedded index for column view.
  out.push(renderMoveSpanMemo(main, mainPath, parent, false, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision));
  const comments = renderCommentNodes(main, options);

  // Variations — emit as full-width interrupt block.
  // Mirrors lichess-org/lila: columnView.ts interrupt > lines > line structure
  if (variations.length > 0 || comments.length > 0) {
    // Fill the unused black slot with an empty placeholder so the interrupt
    // starts on a new row. Mirrors columnView.ts isWhite && emptyMove().
    if (isWhite) out.push(h('move.empty', '…'));

    // Fold toggle: triangle button before the lines block.
    // Adapted from lichess-org/lila: ui/analyse/src/treeView/treeView.ts variation fold.
    const firstVarPath = variations[0] ? parentPath + variations[0].id : '';
    const isFolded = firstVarPath ? (foldedVariations?.has(firstVarPath) ?? false) : false;
    const interruptChildren: VNode[] = [];

    if (onToggleFold && firstVarPath) {
      interruptChildren.push(
        h('button.variation-fold', {
          class: { 'variation-fold--open': !isFolded },
          attrs: {
            ...iconControlExplainerAttrs({
              label: isFolded ? 'Show variations' : 'Hide variations',
              description: `${isFolded ? 'Expand' : 'Collapse'} the side variations at this move.`,
            }),
          },
          on:    { click: () => onToggleFold(firstVarPath) },
        }, isFolded ? '▶' : '▼'),
      );
    }

    if (!isFolded) {
      interruptChildren.push(...comments);
      const varLines = variations.map(v => {
        const varPath = parentPath + v.id;
        const lineNodes = renderInlineNodes([v], parentPath, parent, true, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision);
        // Variation remove affordance: small × button at start of each non-mainline line.
        // Mirrors lichess-org/lila: ui/analyse/src/treeView/contextMenu.ts deleteNode action.
        if (deleteVariation) {
          return h('line', [
            h('button.variation-remove', {
              attrs: iconControlExplainerAttrs({
                label: 'Remove variation',
                description: 'Delete this variation branch from the move tree.',
              }),
              on: { click: () => deleteVariation(varPath) },
            }, '×'),
            ...lineNodes,
          ]);
        }
        return h('line', lineNodes);
      });
      if (varLines.length > 0) interruptChildren.push(h('lines', varLines));
    }

    out.push(h('interrupt', interruptChildren));

    // After the interrupt re-anchor the next mainline move.
    // If white just varied, the next move is black's — emit index + empty white.
    // Mirrors columnView.ts isWhite && child.children.length > 0 re-anchor.
    if (isWhite && main.children.length > 0) {
      out.push(h('index', String(Math.ceil(main.ply / 2))));
      out.push(h('move.empty', '…'));
    }
  }

  renderColumnNodes(main.children, mainPath, main, out, currentPath, getEval, navigate, userColor, userOnly, deleteVariation, contextMenuPath, onContextMenu, worstMissPath, foldedVariations, onToggleFold, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision);
}

/**
 * Render a flat mainline sequence of nodes (e.g. game-context prefix before a
 * puzzle) using the same tview2 column index/move elements, without recursing
 * into children.  Returns a div.tview2.tview2-column.
 *
 * @param nodes        - ordered flat nodes (pre-computed paths, no children traversal)
 * @param pathOf       - returns the tree path string for each node in order
 * @param navigate     - called when user clicks a move
 * @param currentPath  - active path for highlight; pass '' to suppress
 * @param extraClass   - optional extra CSS class on the wrapper div
 */
export function renderContextMoves(
  nodes:      { node: TreeNode; path: string }[],
  navigate:   (p: string) => void,
  currentPath: string,
  extraClass?: string,
): VNode {
  const out: VNode[] = [];
  for (const { node, path } of nodes) {
    const isWhite = node.ply % 2 === 1;
    if (isWhite) out.push(h('index', String(Math.ceil(node.ply / 2))));
    out.push(h('move', {
      class: { active: path === currentPath },
      attrs: { p: path, role: 'button', tabindex: '0', 'aria-label': `Go to ${node.san ?? 'move'}`, ...controlExplainerAttrs({
        label: `Go to ${node.san ?? 'move'}`,
        description: 'Jump to this position in the move sequence.',
      }) },
      on: {
        click: () => navigate(path),
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => navigate(path)),
      },
    }, [h('san', node.san ?? '')]));
  }
  const cls = ['tview2', 'tview2-column', ...(extraClass ? [extraClass] : [])].join('.');
  return h(`div.${cls}`, out);
}















export function renderMoveList(
  root:               TreeNode,
  currentPath:        string,
  getEval:            EvalLookup,
  navigate:           (p: string) => void,
  userColor:          'white' | 'black' | null,
  userOnly:           boolean,
  deleteVariation?:   (path: string) => void,
  contextMenuPath?:   string | null,
  onContextMenu?:     (path: string, e: MouseEvent) => void,
  worstMissPath?:     string,
  foldedVariations?:  Set<string>,
  onToggleFold?:      (path: string) => void,
  bookmarkedPaths?:   Set<string>,
  onToggleBookmark?:  (path: string) => void,
  options?:           MoveListRenderOptions,
  evalCacheRevision = 0,
): VNode {
  // div.tview2.tview2-column: flex-wrap grid, index | white | black per row.
  // Adapted from lichess-org/lila: ui/analyse/src/treeView/columnView.ts renderColumnView
  const rootComments = renderCommentNodes(root, options);
  const nodes: VNode[] = rootComments.length > 0 ? [h('interrupt', rootComments)] : [];
  renderColumnNodes(root.children, '', root, nodes, currentPath, getEval, navigate, userColor, userOnly, deleteVariation, contextMenuPath, onContextMenu, worstMissPath, foldedVariations, onToggleFold, bookmarkedPaths, onToggleBookmark, options, evalCacheRevision);
  return h('div.move-list-inner', [h('div.tview2.tview2-column', nodes)]);
}
