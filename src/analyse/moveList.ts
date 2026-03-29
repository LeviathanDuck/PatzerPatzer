// Move list / tree view rendering.
// Adapted from lichess-org/lila: ui/analyse/src/treeView/columnView.ts

import { h, type VNode } from 'snabbdom';
import { classifyLoss, type MoveLabel } from '../engine/winchances';
import { showReviewLabels } from '../engine/ctrl';
import { missedMomentConfig } from '../engine/tactics';
import { pathInit } from '../tree/ops';
import type { TreeNode, TreePath } from '../tree/types';

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
): Record<string, (e: MouseEvent | PointerEvent) => void> {
  const handlers: Record<string, (e: MouseEvent | PointerEvent) => void> = {
    contextmenu: (e: MouseEvent) => { e.preventDefault(); onContextMenu(path, e); },
  };
  if (isTouchDevice()) {
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    handlers['dblclick'] = (e: MouseEvent) => { e.preventDefault(); onContextMenu(path, e); };
    handlers['pointerdown'] = (e: PointerEvent) => {
      holdTimer = setTimeout(() => { onContextMenu(path, e as unknown as MouseEvent); }, 400);
    };
    handlers['pointerup']    = () => clearTimeout(holdTimer);
    handlers['pointerleave'] = () => clearTimeout(holdTimer);
  }
  return handlers;
}

// Eval lookup: returns { loss, best, mate, label } for a given path, or undefined.
// Typed structurally so callers don't need to import PositionEval.
// label is present when analysis was saved and restored from IDB; absent during live analysis.
type EvalLookup = (path: string) => { loss?: number; best?: string; mate?: number; label?: MoveLabel } | undefined;

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
const GLYPH_COLORS: Record<string, string> = {
  '??':  'hsl(0,69%,60%)',    // blunder     — muted red
  '?':   'hsl(41,100%,45%)',  // mistake     — amber
  '?!':  'hsl(202,78%,62%)',  // inaccuracy  — steel blue
  '!!':  'hsl(129,71%,45%)',  // brilliant   — green
  '!':   'hsl(88,62%,37%)',   // good        — olive green
  '!?':  'hsl(307,80%,70%)',  // interesting — pink/purple
  'M?!': '#a855f7',           // missed forced mate — purple (matches games-list M?! badge)
};

function renderMoveSpan(
  node:            TreeNode,
  path:            TreePath,
  parent:          TreeNode,
  showIndex:       boolean,
  currentPath:     string,
  getEval:         EvalLookup,
  navigate:        (p: string) => void,
  userColor:       'white' | 'black' | null,
  userOnly:        boolean,
  contextMenuPath: string | null | undefined,
  onContextMenu:   ((path: string, e: MouseEvent) => void) | undefined,
  worstMissPath:   string | undefined,
): VNode {
  const cached       = getEval(path);
  const parentCached = getEval(pathInit(path));

  // PGN glyphs take priority; fall back to stored review annotation, then recompute from loss.
  // Prefer cached.label (hydrated from IDB) over classifyLoss(loss) recomputation so that
  // a saved-and-restored analysis session shows exactly the labels that were persisted.
  // Falls back to classifyLoss(loss) for live analysis sessions and older records without label.
  // Mirrors lichess-org/lila: ui/analyse/src/treeView/inlineView.ts moveNode glyph priority.
  const pgnGlyph   = node.glyphs?.[0];
  const playedBest = node.uci !== undefined && node.uci === parentCached?.best;

  // Missed forced mate: the parent position had a short forced mate for the mover,
  // but the played move does not maintain it. Always shown for both players regardless
  // of the userOnly filter, so the opponent's missed mates are never hidden.
  const isWhiteMove  = node.ply % 2 === 1;
  const parentMate   = parentCached?.mate;
  const moverHadMate = parentMate !== undefined
    && (isWhiteMove ? parentMate > 0 : parentMate < 0)
    && Math.abs(parentMate) <= missedMomentConfig.missedMateMaxN
    && parentCached?.best !== undefined;
  const mateWasLost  = cached?.mate === undefined
    || (isWhiteMove ? (cached.mate <= 0) : (cached.mate >= 0));
  const isMissedMate = showReviewLabels && !playedBest && moverHadMate && mateWasLost;

  const computedLabel: MoveLabel | null = (showReviewLabels && !playedBest && cached !== undefined && shouldShowReviewAnnotation(userColor, node.ply, userOnly))
    ? (cached.label ?? (cached.loss !== undefined ? classifyLoss(cached.loss) : null))
    : null;
  const computedSymbol = isMissedMate ? 'M?!'
    : computedLabel === 'blunder'    ? '??'
    : computedLabel === 'mistake'    ? '?'
    : computedLabel === 'inaccuracy' ? '?!'
    : null;

  const symbol = pgnGlyph?.symbol ?? computedSymbol;
  const color  = symbol ? (GLYPH_COLORS[symbol] ?? '#aaa') : undefined;
  const mate   = cached?.mate;

  // Build children matching Lichess tview2: index? + san + glyph? + eval?
  // Mirrors lichess-org/lila: ui/analyse/src/view/components.ts renderMoveNodes + renderIndex
  const inner: VNode[] = [];
  if (showIndex) {
    const n = Math.ceil(node.ply / 2);
    inner.push(h('index', node.ply % 2 === 1 ? `${n}.` : `${n}\u2026`));
  }
  inner.push(h('san', node.san ?? ''));
  if (symbol) inner.push(h('glyph', { attrs: { style: `color:${color}` } }, symbol));
  // mate === 0 = terminal checkmate position; use KO notation instead of +M0.
  if (mate !== undefined) inner.push(h('eval', mate === 0 ? '#KO!' : `+M${Math.abs(mate)}`));

  return h('move', {
    class: {
      active:           path === currentPath,
      'context-active': contextMenuPath === path,
      'worst-miss':     worstMissPath !== undefined && path === worstMissPath,
    },
    attrs: { p: path },
    on: {
      click: () => navigate(path),
      ...(onContextMenu ? buildContextHandlers(path, onContextMenu) : {}),
    },
  }, inner);
}

/**
 * Inline helper: renders a variation line as a flat sequence of moves with
 * embedded move numbers. Used inside column-view interrupt blocks.
 * Mirrors lichess-org/lila: ui/analyse/src/treeView/inlineView.ts sidelineNodes
 */
function renderInlineNodes(
  nodes:           TreeNode[],
  parentPath:      TreePath,
  parent:          TreeNode,
  needsMoveNum:    boolean,
  currentPath:     string,
  getEval:         EvalLookup,
  navigate:        (p: string) => void,
  userColor:       'white' | 'black' | null,
  userOnly:        boolean,
  contextMenuPath: string | null | undefined,
  onContextMenu:   ((path: string, e: MouseEvent) => void) | undefined,
  worstMissPath:   string | undefined,
): VNode[] {
  if (nodes.length === 0) return [];
  const main       = nodes[0]!;
  const variations = nodes.slice(1);
  const mainPath = parentPath + main.id;
  const out: VNode[] = [];

  const showIndex = needsMoveNum || main.ply % 2 === 1;
  out.push(renderMoveSpan(main, mainPath, parent, showIndex, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath));

  for (const variant of variations) {
    out.push(h('inline', renderInlineNodes([variant], parentPath, parent, true, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath)));
  }

  const hasVariations = variations.length > 0;
  const firstCont = main.children[0];
  const contNeedsNum = hasVariations && firstCont !== undefined && firstCont.ply % 2 === 0;
  out.push(...renderInlineNodes(main.children, mainPath, main, contNeedsNum, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath));

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
  nodes:            TreeNode[],
  parentPath:       TreePath,
  parent:           TreeNode,
  out:              VNode[],
  currentPath:      string,
  getEval:          EvalLookup,
  navigate:         (p: string) => void,
  userColor:        'white' | 'black' | null,
  userOnly:         boolean,
  deleteVariation?: (path: string) => void,
  contextMenuPath?: string | null,
  onContextMenu?:   (path: string, e: MouseEvent) => void,
  worstMissPath?:   string,
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
  out.push(renderMoveSpan(main, mainPath, parent, false, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath));

  // Variations — emit as full-width interrupt block.
  // Mirrors lichess-org/lila: columnView.ts interrupt > lines > line structure
  if (variations.length > 0) {
    // Fill the unused black slot with an empty placeholder so the interrupt
    // starts on a new row. Mirrors columnView.ts isWhite && emptyMove().
    if (isWhite) out.push(h('move.empty', '\u2026'));

    const varLines = variations.map(v => {
      const varPath = parentPath + v.id;
      const lineNodes = renderInlineNodes([v], parentPath, parent, true, currentPath, getEval, navigate, userColor, userOnly, contextMenuPath, onContextMenu, worstMissPath);
      // Variation remove affordance: small × button at start of each non-mainline line.
      // Mirrors lichess-org/lila: ui/analyse/src/treeView/contextMenu.ts deleteNode action.
      if (deleteVariation) {
        return h('line', [
          h('button.variation-remove', {
            attrs: { title: 'Remove variation' },
            on: { click: () => deleteVariation(varPath) },
          }, '×'),
          ...lineNodes,
        ]);
      }
      return h('line', lineNodes);
    });
    out.push(h('interrupt', [h('lines', varLines)]));

    // After the interrupt re-anchor the next mainline move.
    // If white just varied, the next move is black's — emit index + empty white.
    // Mirrors columnView.ts isWhite && child.children.length > 0 re-anchor.
    if (isWhite && main.children.length > 0) {
      out.push(h('index', String(Math.ceil(main.ply / 2))));
      out.push(h('move.empty', '\u2026'));
    }
  }

  renderColumnNodes(main.children, mainPath, main, out, currentPath, getEval, navigate, userColor, userOnly, deleteVariation, contextMenuPath, onContextMenu, worstMissPath);
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
      attrs: { p: path },
      on: { click: () => navigate(path) },
    }, [h('san', node.san ?? '')]));
  }
  const cls = ['tview2', 'tview2-column', ...(extraClass ? [extraClass] : [])].join('.');
  return h(`div.${cls}`, out);
}

/**
 * Render the full move list for the current game.
 * @param root            - root node of the current game tree
 * @param currentPath     - currently active tree path (for active-move highlight)
 * @param getEval         - eval cache lookup: returns evaluation data for a path, or undefined
 * @param navigate        - called when user clicks a move to navigate to it
 * @param deleteVariation - removes a single variation branch by path
 */
export function renderMoveList(
  root:             TreeNode,
  currentPath:      string,
  getEval:          EvalLookup,
  navigate:         (p: string) => void,
  userColor:        'white' | 'black' | null,
  userOnly:         boolean,
  deleteVariation?: (path: string) => void,
  contextMenuPath?: string | null,
  onContextMenu?:   (path: string, e: MouseEvent) => void,
  worstMissPath?:   string,
): VNode {
  // div.tview2.tview2-column: flex-wrap grid, index | white | black per row.
  // Adapted from lichess-org/lila: ui/analyse/src/treeView/columnView.ts renderColumnView
  const nodes: VNode[] = [];
  renderColumnNodes(root.children, '', root, nodes, currentPath, getEval, navigate, userColor, userOnly, deleteVariation, contextMenuPath, onContextMenu, worstMissPath);
  return h('div.move-list-inner', [h('div.tview2.tview2-column', nodes)]);
}
