












import { h, type VNode } from 'snabbdom';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { TreeComment } from '../tree/types';
import { nagToGlyph } from '../tree/pgn';
import type { OpeningTreeNode } from './tree';
import { openingTree, sessionPath, navigateToPath } from './ctrl';
import {
  ExplorerBookAuthError,
  isExplorerBookAuthError,
  type OpeningMoveStats,
  type ExplorerDb,
  type TablebaseData,
  type TablebaseMoveStats,
  type TablebaseCategory,
} from './explorer';
import { explorerCtrl, MAX_EXPLORER_DEPTH } from './explorerCtrl';
import { ALL_SPEEDS, ALL_RATINGS, ALL_MODES } from './explorerConfig';
import { clearLichessApiLoginData, requestBookLogin } from '../auth/lichessBookAuth';
import {
  repertoireSources,
  repertoireSourcesLoaded,
  repertoireSourcesError,
  loadRepertoireSources,
  setRepertoireSourceEnabled,
  ensureRepertoireAccountSourceBuilds,
} from '../study/studyCtrl';
import {
  buildRepertoireExplorerModel,
  repertoireSourceSideBadge,
  type RepertoireExplorerLinePosition,
  type RepertoireExplorerPositionAnnotation,
  type RepertoireExplorerPriorMatch,
  type RepertoireExplorerSourceGroup,
} from '../repertoire/explorerViewModel';
import { isAccountRepertoireSource, repertoireAccountFilterSummary } from '../repertoire';
import { syncArrowForced } from '../engine/ctrl';
import { controlExplainerAttrs, iconControlExplainerAttrs } from '../ui/controlExplainer';

let _bookAuthNotice = '';
let _repertoireExplorerNotice = '';
let _expandedRepertoireAnnotationKey: string | null = null;

export interface OpeningTreeExplorerHost {
  board: () => CgApi | undefined;
  getCurrentFen: () => string | null | undefined;
  restoreAutoShapes: () => void;
  clearAutoShapesHash: () => void;
  playMove: (uci: string, redraw: () => void) => void;
  syncBoard: (redraw: () => void) => void;
}

type ExplorerMoveInteractionHost = Pick<
  OpeningTreeExplorerHost,
  'board' | 'getCurrentFen' | 'restoreAutoShapes' | 'clearAutoShapesHash'
>;

type ExplorerDbTabsHost = Pick<OpeningTreeExplorerHost, 'restoreAutoShapes'>;

type ExplorerMoveRowInteractionOptions = {
  fen: string;
  rowSelector: string;
  board: () => CgApi | undefined;
  getCurrentFen: () => string | null | undefined;
  restoreAutoShapes: () => void;
  onMoveClick?: ((uci: string) => void) | undefined;
  ignoreClickSelector?: string | undefined;
  onDirectAutoShapesSet?: (() => void) | undefined;
};

type ExplorerMoveRowsElement = HTMLElement & {
  _explorerMoveRowInteractionOptions?: ExplorerMoveRowInteractionOptions;
  _explorerMoveRowInteractionsBound?: boolean;
};

function rowFromEventTarget(target: EventTarget | null, root: HTMLElement, selector: string): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  const row = target.closest(selector);
  return row instanceof HTMLElement && root.contains(row) ? row : null;
}

function eventStayedWithinRow(event: MouseEvent, row: HTMLElement): boolean {
  return event.relatedTarget instanceof Node && row.contains(event.relatedTarget);
}

function explorerHoverShape(uci: string): DrawShape | null {
  if (uci.length < 4) return null;
  return {
    orig: uci.slice(0, 2) as Key,
    dest: uci.slice(2, 4) as Key,
    brush: 'blue',
  };
}

function restoreAnalysisExplorerAutoShapes(): void {
  syncArrowForced();
}

function clearExplorerMoveHover(opts: ExplorerMoveRowInteractionOptions): void {
  explorerCtrl.setHovering(opts.fen, null);
  opts.board()?.setAutoShapes([]);
  opts.onDirectAutoShapesSet?.();
  opts.restoreAutoShapes();
}

function fenMatchesExplorerRow(opts: ExplorerMoveRowInteractionOptions): boolean {
  return opts.getCurrentFen() === opts.fen;
}

function showExplorerMoveHover(uci: string, opts: ExplorerMoveRowInteractionOptions): void {
  if (!fenMatchesExplorerRow(opts)) {
    clearExplorerMoveHover(opts);
    return;
  }
  const shape = explorerHoverShape(uci);
  if (!shape) return;
  explorerCtrl.setHovering(opts.fen, uci);
  opts.board()?.setAutoShapes([shape]);
  opts.onDirectAutoShapesSet?.();
}

function handleExplorerMoveClick(uci: string, opts: ExplorerMoveRowInteractionOptions): void {
  if (!fenMatchesExplorerRow(opts)) {
    clearExplorerMoveHover(opts);
    return;
  }
  opts.onMoveClick?.(uci);
}

function currentExplorerMoveRowOptions(root: ExplorerMoveRowsElement): ExplorerMoveRowInteractionOptions | null {
  return root._explorerMoveRowInteractionOptions ?? null;
}

function bindExplorerMoveRowInteractions(root: ExplorerMoveRowsElement, opts: ExplorerMoveRowInteractionOptions): void {
  root._explorerMoveRowInteractionOptions = opts;
  if (root._explorerMoveRowInteractionsBound) return;
  root._explorerMoveRowInteractionsBound = true;

  root.addEventListener('mouseover', (event: MouseEvent) => {
    const opts = currentExplorerMoveRowOptions(root);
    if (!opts) return;
    const row = rowFromEventTarget(event.target, root, opts.rowSelector);
    if (!row || eventStayedWithinRow(event, row)) return;
    const uci = row.getAttribute('data-uci');
    if (uci) showExplorerMoveHover(uci, opts);
  });

  root.addEventListener('mouseout', (event: MouseEvent) => {
    const opts = currentExplorerMoveRowOptions(root);
    if (!opts) return;
    const row = rowFromEventTarget(event.target, root, opts.rowSelector);
    if (!row || eventStayedWithinRow(event, row)) return;
    clearExplorerMoveHover(opts);
  });

  root.addEventListener('mouseleave', () => {
    const opts = currentExplorerMoveRowOptions(root);
    if (opts) clearExplorerMoveHover(opts);
  });

  root.addEventListener('click', (event: MouseEvent) => {
    const opts = currentExplorerMoveRowOptions(root);
    if (!opts) return;
    const target = event.target as HTMLElement | null;
    if (target && opts.ignoreClickSelector && target.closest(opts.ignoreClickSelector)) return;
    const row = rowFromEventTarget(event.target, root, opts.rowSelector);
    const uci = row?.getAttribute('data-uci');
    if (uci) handleExplorerMoveClick(uci, opts);
  });
  root.addEventListener('keydown', (event: KeyboardEvent) => {
    if ((event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
    const opts = currentExplorerMoveRowOptions(root);
    if (!opts) return;
    const target = event.target as HTMLElement | null;
    if (target && opts.ignoreClickSelector && target.closest(opts.ignoreClickSelector)) return;
    const row = rowFromEventTarget(event.target, root, opts.rowSelector);
    if (!row || event.target !== row) return;
    const uci = row.getAttribute('data-uci');
    if (!uci) return;
    event.preventDefault();
    handleExplorerMoveClick(uci, opts);
  });
}

function repertoireLineForOpenings(path: readonly string[]): RepertoireExplorerLinePosition<readonly string[]>[] {
  const tree = openingTree();
  if (!tree) return [];
  const line: RepertoireExplorerLinePosition<readonly string[]>[] = [
    { fen: tree.fen, path: [], ply: 0 },
  ];
  let current: OpeningTreeNode | undefined = tree;
  const currentPath: string[] = [];
  for (const uci of path) {
    const child: OpeningTreeNode | undefined = current?.children.find(candidate => candidate.uci === uci);
    if (!child) break;
    currentPath.push(uci);
    line.push({
      fen: child.fen,
      path: [...currentPath],
      uci: child.uci,
      san: child.san,
      ply: currentPath.length,
    });
    current = child;
  }
  return line;
}

function nagSymbols(nags: readonly number[]): string {
  return nags.map(nag => nagToGlyph(nag)?.symbol ?? `$${nag}`).join(' ');
}

function annotationCommentTexts(comments: readonly TreeComment[]): string[] {
  return comments.map(comment => comment.text.trim()).filter(text => text.length > 0);
}

function firstCommentLine(comments: readonly TreeComment[]): string {
  for (const comment of comments) {
    const line = comment.text.split(/\r?\n/).map(part => part.trim()).find(Boolean);
    if (line) return line;
  }
  return '';
}

function repertoireAnnotationKey(
  fen: string,
  group: RepertoireExplorerSourceGroup,
  entry: RepertoireExplorerSourceGroup['entries'][number],
  entryIndex: number,
): string {
  return `${group.source.id}:${fen}:${entry.uci}:${entryIndex}`;
}

function renderRepertoireAnnotationBlock(
  nags: readonly number[],
  comments: readonly TreeComment[],
  modifier: string,
): VNode | null {
  const nagText = nagSymbols(nags);
  const texts = annotationCommentTexts(comments);
  if (!nagText && texts.length === 0) return null;
  return h(`div.repertoire__annotation.${modifier}`, [
    nagText ? h('div.repertoire__annotation-nags', nagText) : null,
    ...texts.map((text, index) => h('div.repertoire__annotation-text', { key: String(index) }, text)),
  ]);
}

function renderRepertoireChip(source: RepertoireExplorerSourceGroup['source'], accentIndex: number): VNode {
  return h(`span.repertoire__chip.repertoire__accent--${accentIndex % 8}`, [
    h('span.repertoire__chip-dot'),
    h('span.repertoire__chip-name', source.name),
    h('span.repertoire__side-badge', repertoireSourceSideBadge(source.side)),
  ]);
}

function renderAccountResultBar(stats: NonNullable<RepertoireExplorerSourceGroup['entries'][number]['accountStats']>): VNode {
  const total = stats.games || 1;
  const winPct = (stats.wins * 100) / total;
  const drawPct = (stats.draws * 100) / total;
  const lossPct = (stats.losses * 100) / total;
  const label = `${stats.wins}W ${stats.draws}D ${stats.losses}L`;
  return h('span.repertoire__account-result', {
    attrs: {
      title: label,
      'aria-label': label,
    },
  }, [
    h('span.repertoire__account-result-bar', [
      h('span.wdl-w.repertoire__account-result-segment', { attrs: { style: `width:${winPct.toFixed(1)}%` } }),
      h('span.wdl-d.repertoire__account-result-segment', { attrs: { style: `width:${drawPct.toFixed(1)}%` } }),
      h('span.wdl-l.repertoire__account-result-segment', { attrs: { style: `width:${lossPct.toFixed(1)}%` } }),
    ]),
    h('span.repertoire__account-result-counts', label),
  ]);
}

function renderAccountMoveStats(entry: RepertoireExplorerSourceGroup['entries'][number]): VNode | null {
  const stats = entry.accountStats;
  if (!stats) return null;
  return h('span.repertoire__account-stats', [
    h('span', `${stats.games.toLocaleString()} game${stats.games === 1 ? '' : 's'}`),
    h('span.repertoire__source-sep', '·'),
    h('span', `${stats.winPercent}% wins`),
    renderAccountResultBar(stats),
  ]);
}

function toggleRepertoireSourceFromExplorer(
  source: RepertoireExplorerSourceGroup['source'],
  redraw: () => void,
  restoreAutoShapes?: () => void,
): void {
  _repertoireExplorerNotice = '';
  void setRepertoireSourceEnabled(source.id, !source.enabled)
    .then(() => {
      restoreAutoShapes?.();
      redraw();
    })
    .catch(() => {
      _repertoireExplorerNotice = `Could not update ${source.name}.`;
      redraw();
    });
}

function repertoireMoveListHook(
  fen: string,
  host: ExplorerMoveInteractionHost,
  onMoveClick?: (uci: string) => void,
) {
  const bind = (vnode: import('snabbdom').VNode) => {
    const el = vnode.elm as ExplorerMoveRowsElement;
    bindExplorerMoveRowInteractions(el, {
      fen,
      rowSelector: '.repertoire__move-row',
      board: host.board,
      getCurrentFen: host.getCurrentFen,
      restoreAutoShapes: host.restoreAutoShapes,
      onMoveClick,
      ignoreClickSelector: '.repertoire__annotation-toggle',
      onDirectAutoShapesSet: host.clearAutoShapesHash,
    });
  };
  return {
    insert: bind,
    postpatch: (_old: import('snabbdom').VNode, vnode: import('snabbdom').VNode) => bind(vnode),
  };
}

function renderRepertoireMoveRows(
  group: RepertoireExplorerSourceGroup,
  fen: string,
  redraw: () => void,
  host: ExplorerMoveInteractionHost,
  onMoveClick?: (uci: string) => void,
): VNode | null {
  if (group.error) return h('div.repertoire__source-error.repertoire__source-error--inline', group.error);
  if (!group.entries.length) return null;
  return h('div.repertoire__move-list', {
    hook: repertoireMoveListHook(fen, host, onMoveClick),
  }, group.entries.map((entry, entryIndex) => {
    const nags = nagSymbols(entry.nags);
    const preview = firstCommentLine(entry.comments);
    const annotationKey = repertoireAnnotationKey(fen, group, entry, entryIndex);
    const expanded = _expandedRepertoireAnnotationKey === annotationKey;
    const expandedLabel = expanded ? `Collapse annotation for ${entry.san}` : `Expand annotation for ${entry.san}`;
    return h('div.repertoire__move-row', {
      key: annotationKey,
      class: { 'repertoire__move-row--expanded': expanded },
      attrs: {
        'data-uci': entry.uci,
        role: 'button', tabindex: '0',
        ...controlExplainerAttrs({
          label: `Play repertoire move ${entry.san}`,
          description: 'Play this move from the current position.',
        }),
      },
    }, [
      h('div.repertoire__move-main', [
        h('span.repertoire__move-san', entry.san),
        entry.accountStats ? null : entry.isMain ? h('span.repertoire__main-tag', 'main') : null,
        nags ? h('span.repertoire__nags', nags) : null,
        group.expectedReply ? h('span.repertoire__reply-tag', 'expected reply') : null,
        renderAccountMoveStats(entry),
      ]),
      preview ? h('button.repertoire__comment-preview.repertoire__annotation-toggle', {
        attrs: {
          type: 'button',
          ...controlExplainerAttrs({ label: expandedLabel, description: 'Show or hide this move annotation.' }),
          'aria-expanded': String(expanded),
        },
        on: {
          click: (e: MouseEvent) => {
            e.stopPropagation();
            _expandedRepertoireAnnotationKey = expanded ? null : annotationKey;
            redraw();
          },
        },
      }, preview) : null,
      expanded ? renderRepertoireAnnotationBlock(entry.nags, entry.comments, 'repertoire__annotation--expanded') : null,
    ]);
  }));
}

function renderRepertoirePositionAnnotations(annotations: readonly RepertoireExplorerPositionAnnotation[]): VNode | null {
  const visible = annotations.filter(annotation =>
    annotation.nags.length > 0 || annotationCommentTexts(annotation.comments).length > 0,
  );
  if (!visible.length) return null;

  return h('div.annotation-panel.repertoire__position-annotations', [
    h('h3.annotation-panel__title', 'Position comments'),
    ...visible.map((annotation, annotationIndex) => h('div.repertoire__position-annotation', {
      key: `${annotation.source.id}:${annotation.sourceGameIndex}:${annotation.chapterIndex}:${annotationIndex}`,
    }, [
      renderRepertoireChip(annotation.source, annotation.accentIndex),
      renderRepertoireAnnotationBlock(annotation.nags, annotation.comments, 'repertoire__annotation--position'),
    ])),
  ]);
}

function renderRepertoireSourceGroup(
  group: RepertoireExplorerSourceGroup,
  fen: string,
  redraw: () => void,
  host: ExplorerMoveInteractionHost,
  onMoveClick?: (uci: string) => void,
): VNode {
  const accountSource = isAccountRepertoireSource(group.source);
  const accountState = group.accountBuildState;
  const accountMessage = accountSource && accountState
    ? accountState.state === 'loading'
      ? 'Loading account games...'
      : accountState.state === 'building' || accountState.state === 'publishing'
        ? `Building account model ${accountState.processedGameCount.toLocaleString()}/${accountState.filteredGameCount.toLocaleString()} games...`
        : accountState.state === 'empty'
          ? accountState.filteredGameCount === 0
            ? 'No account games match these filters.'
            : 'No account moves found after filters.'
          : accountState.state === 'error'
            ? accountState.message ?? 'Could not build this account source.'
            : group.entries.length === 0
              ? 'No account move at this position.'
              : null
    : null;
  return h(`section.repertoire__explorer-group.repertoire__accent--${group.accentIndex}`, { key: group.source.id }, [
    h('div.repertoire__explorer-group-header', [
      h('span.repertoire__source-summary', [
        renderRepertoireChip(group.source, group.accentIndex),
        accountSource ? h('span.repertoire__filter-summary', repertoireAccountFilterSummary(group.source)) : null,
      ]),
      h('button.repertoire__source-toggle', {
        attrs: {
          ...controlExplainerAttrs({
            label: group.source.enabled ? `Disable ${group.source.name}` : `Enable ${group.source.name}`,
            description: 'Toggle this repertoire source in explorer results.',
          }),
        },
        class: { active: group.source.enabled },
        on: { click: () => toggleRepertoireSourceFromExplorer(group.source, redraw, host.restoreAutoShapes) },
      }, group.source.enabled ? 'On' : 'Off'),
    ]),
    group.expectedReply
      ? h('div.repertoire__expected-reply', 'Expected replies from the opponent line')
      : null,
    renderRepertoireMoveRows(group, fen, redraw, host, onMoveClick),
    accountMessage ? h('div.repertoire__account-empty', accountMessage) : null,
  ]);
}

function moveNumberLabel(position: RepertoireExplorerLinePosition<unknown> | null): string {
  if (!position?.ply) return '';
  return `move ${Math.max(1, Math.ceil(position.ply / 2))}`;
}

function renderRepertoireOutOfLine<Path>(
  match: RepertoireExplorerPriorMatch<Path> | null,
  onJumpToPrior?: (path: Path) => void,
): VNode {
  const leftBy = match?.leftBy ?? null;
  const moveLabel = leftBy?.san
    ? ` since ${leftBy.san}${moveNumberLabel(leftBy) ? ` (${moveNumberLabel(leftBy)})` : ''}`
    : '';
  const canJump = match?.matched.path !== undefined && onJumpToPrior;
  return h('div.repertoire__out-of-line', [
    h('span', match ? `Out of repertoire${moveLabel}.` : 'No repertoire match for this line.'),
    canJump
      ? h('button.repertoire__jump', {
          attrs: controlExplainerAttrs({
            label: 'Jump to deepest repertoire match', description: 'Return to the last position matching the active repertoire.',
          }),
          on: { click: () => onJumpToPrior(match.matched.path as Path) },
        }, 'Jump')
      : null,
  ]);
}

function renderRepertoireExplorerPanel<Path = unknown>(
  fen: string | null,
  redraw: () => void,
  opts: {
    line?: RepertoireExplorerLinePosition<Path>[];
    onMoveClick?: (uci: string) => void;
    onJumpToPrior?: (path: Path) => void;
    interactionHost?: ExplorerMoveInteractionHost;
  } = {},
): VNode {
  if (!fen) return h('div.openings__explorer-empty', 'No position selected.');
  if (!repertoireSourcesLoaded()) {
    loadRepertoireSources(redraw);
    return h('div.openings__explorer-box', { class: { loading: true } }, [
      h('div.overlay'),
      h('div.openings__explorer-message', h('p', 'Loading repertoire sources...')),
    ]);
  }
  if (repertoireSourcesError()) {
    return h('div.openings__explorer-box', [
      h('div.openings__explorer-message', [
        h('strong', 'Could not load repertoire sources'),
        h('p.openings__explorer-explanation', 'Open Study Library and try again.'),
      ]),
    ]);
  }

  ensureRepertoireAccountSourceBuilds(redraw);
  const model = buildRepertoireExplorerModel(repertoireSources(), fen, opts.line);
  const interactionHost: ExplorerMoveInteractionHost = opts.interactionHost ?? {
    board: () => undefined,
    getCurrentFen: () => fen,
    restoreAutoShapes: () => {},
    clearAutoShapesHash: () => {},
  };
  if (model.sources.length === 0) {
    return h('div.openings__explorer-box', [
      h('div.openings__explorer-message', [
        h('strong', 'No repertoire sources'),
        h('p.openings__explorer-explanation', [
          'Upload a repertoire PGN in ',
          h('a.repertoire__empty-link', {
            attrs: {
              href: '#/study',
              ...controlExplainerAttrs({
                label: 'Open Study Library', description: 'Upload or manage repertoire PGNs in Study Library.',
              }),
            },
          }, 'Study Library'),
          '.',
        ]),
      ]),
    ]);
  }
  if (model.enabledSources.length === 0) {
    return h('div.openings__explorer-box', [
      h('div.openings__explorer-message', [
        h('strong', 'No sources enabled'),
        h('p.openings__explorer-explanation', 'Enable a repertoire source in Study Library.'),
      ]),
    ]);
  }

  return h('div.openings__explorer-box.repertoire__explorer-box', [
    h('div.repertoire__explorer-list',
      model.groups.map(group => renderRepertoireSourceGroup(
        group,
        fen,
        redraw,
        interactionHost,
        opts.onMoveClick,
      )),
    ),
    !model.hasCurrentMatch && !model.hasPendingAccountBuild
      ? renderRepertoireOutOfLine(model.deepestPriorMatch, opts.onJumpToPrior)
      : null,
    renderRepertoirePositionAnnotations(model.positionAnnotations),
    _repertoireExplorerNotice ? h('div.repertoire__source-status', _repertoireExplorerNotice) : null,
  ]);
}

// ========== Lichess Explorer comparison ==========

/**
 * Tablebase view — renders per-move outcome badges and DTZ/DTM data.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/tablebaseView.ts
 */

/** Which result class to apply based on category and side to move.
 *  In Lichess's naming: 'loss' means the side to move WINS (opponent loses).
 *  'win' means the side to move LOSES (opponent wins).
 *  Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerUtil.ts winnerOf()
 */
function tablebaseCategoryClass(fen: string, category: TablebaseCategory): string {
  const turnWhite = (fen.split(' ')[1] ?? 'w') === 'w';
  if (category === 'loss' || category === 'blessed-loss' || category === 'syzygy-loss' || category === 'maybe-loss') {
    return turnWhite ? 'white' : 'black';
  }
  if (category === 'win' || category === 'cursed-win' || category === 'syzygy-win' || category === 'maybe-win') {
    return turnWhite ? 'black' : 'white';
  }
  return 'draws';
}

const CATEGORY_LABELS: Record<TablebaseCategory, string> = {
  'loss':         'Winning',
  'maybe-loss':   'Win or 50-move',
  'blessed-loss': 'Win (prevented by 50-move)',
  'syzygy-loss':  'Win (prior mistake)',
  'unknown':      'Unknown',
  'draw':         'Draw',
  'cursed-win':   'Loss (saved by 50-move)',
  'maybe-win':    'Loss or 50-move',
  'syzygy-win':   'Loss (prior mistake)',
  'win':          'Losing',
};

function renderTablebaseMoveRow(fen: string, move: TablebaseMoveStats, onMoveClick: (uci: string) => void): VNode {
  const cls = tablebaseCategoryClass(fen, move.category);
  const badge: VNode[] = [];
  if (move.checkmate)              badge.push(h(`result.${cls}`, 'Checkmate'));
  else if (move.stalemate)         badge.push(h('result.draws', 'Stalemate'));
  else if (move.insufficient_material) badge.push(h('result.draws', 'Insufficient'));
  else if (move.dtz === 0)         badge.push(h('result.draws', 'Draw'));
  else if (move.dtz !== undefined) badge.push(h(`result.${cls}`, { attrs: { 'aria-label': 'Distance To Zeroing' } }, `DTZ ${Math.abs(move.dtz)}`));
  else if (move.dtm !== undefined) badge.push(h(`result.${cls}`, { attrs: { 'aria-label': 'Distance To Mate' } }, `DTM ${Math.abs(move.dtm)}`));
  else                             badge.push(h(`result.${cls}`, CATEGORY_LABELS[move.category] ?? move.category));

  return h('tr.tablebase__row', {
    attrs: { 'data-uci': move.uci, role: 'button', tabindex: '0', ...controlExplainerAttrs({
      label: `Play tablebase move ${move.san}`, description: 'Play this tablebase move from the current position.',
    }) },
    on: { click: () => onMoveClick(move.uci) },
    hook: { insert: vnode => {
      (vnode.elm as HTMLElement).addEventListener('keydown', event => {
        if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
        event.preventDefault();
        onMoveClick(move.uci);
      });
    } },
  }, [
    h('td.tablebase__san', move.san),
    h('td.tablebase__result', badge),
  ]);
}

function renderTablebaseSection(
  fen: string,
  title: string,
  moves: TablebaseMoveStats[],
  onMoveClick: (uci: string) => void,
): VNode | null {
  if (!moves.length) return null;
  return h('div.tablebase__section', [
    h('div.tablebase__section-title', title),
    h('table.tablebase', [
      h('tbody', moves.map(m => renderTablebaseMoveRow(fen, m, onMoveClick))),
    ]),
  ]);
}

/**
 * Full tablebase panel — groups moves by outcome category.
 * Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts tablebase block.
 */
function renderTablebasePanel(data: TablebaseData, _redraw: () => void): VNode {
  const onMoveClick = (uci: string) => {
    explorerCtrl.hovering = { fen: data.fen, uci };
    _redraw();
  };

  if (data.checkmate) return h('div.openings__explorer-box', [h('div.openings__explorer-message', [h('strong', 'Checkmate')])]);
  if (data.stalemate) return h('div.openings__explorer-box', [h('div.openings__explorer-message', [h('strong', 'Stalemate')])]);

  const sections = [
    renderTablebaseSection(data.fen, 'Winning',                data.moves.filter(m => m.category === 'loss'),        onMoveClick),
    renderTablebaseSection(data.fen, 'Win or 50-move draw',    data.moves.filter(m => m.category === 'maybe-loss'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Win (50-move)',           data.moves.filter(m => m.category === 'blessed-loss'),onMoveClick),
    renderTablebaseSection(data.fen, 'Win (prior mistake)',     data.moves.filter(m => m.category === 'syzygy-loss'), onMoveClick),
    renderTablebaseSection(data.fen, 'Unknown',                 data.moves.filter(m => m.category === 'unknown'),     onMoveClick),
    renderTablebaseSection(data.fen, 'Drawing',                 data.moves.filter(m => m.category === 'draw'),        onMoveClick),
    renderTablebaseSection(data.fen, 'Loss (50-move)',          data.moves.filter(m => m.category === 'cursed-win'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Loss or 50-move draw',   data.moves.filter(m => m.category === 'maybe-win'),   onMoveClick),
    renderTablebaseSection(data.fen, 'Loss (prior mistake)',    data.moves.filter(m => m.category === 'syzygy-win'),  onMoveClick),
    renderTablebaseSection(data.fen, 'Losing',                  data.moves.filter(m => m.category === 'win'),         onMoveClick),
  ].filter(Boolean) as VNode[];

  return h('div.openings__explorer-box.tablebase-view', [
    h('div.tablebase__header', [
      h('span.tablebase__label', 'Tablebase'),
      h('span.tablebase__pieces', `${data.moves.length} move${data.moves.length !== 1 ? 's' : ''}`),
    ]),
    sections.length ? h('div.tablebase__body', sections) : h('div.openings__explorer-message', 'No tablebase data for this position.'),
  ]);
}

/**
 * Render the appropriate error box for a failed explorer request.
 * 401 errors get a "Connect to Lichess" prompt instead of the generic message.
 */
function renderPlayerNamePrompt(redraw: () => void): VNode {
  return h('div.openings__explorer-box', [
    h('div.openings__explorer-message', [
      h('strong', 'Enter a player name'),
      h('p.openings__explorer-explanation', 'Open the settings panel and enter a Lichess username to search player games.'),
      h('button.openings__explorer-retry', {
        attrs: controlExplainerAttrs({ label: 'Open explorer settings', description: 'Enter a Lichess username for Player explorer.' }),
        on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
      }, 'Open settings'),
    ]),
  ]);
}

function connectBookAccess(fen: string, redraw: () => void): void {
  _bookAuthNotice = '';
  void requestBookLogin(redraw).then(() => {
    explorerCtrl.reload(fen, redraw);
    redraw();
  }).catch(error => {
    explorerCtrl.loading = false;
    explorerCtrl.failing = error instanceof Error ? error : new Error('Lichess book login failed.');
    redraw();
  });
}

function resetBookConnection(redraw: () => void): void {
  _bookAuthNotice = 'Resetting Lichess book connection...';
  explorerCtrl.loading = true;
  explorerCtrl.failing = null;
  redraw();

  void clearLichessApiLoginData().then(result => {
    explorerCtrl.loading = false;
    explorerCtrl.failing = new ExplorerBookAuthError();
    _bookAuthNotice = result.warnings.length > 0
      ? `Browser Lichess login data cleared. ${result.warnings.join(' ')}`
      : 'Lichess book connection reset. Connect to Lichess again.';
    redraw();
  }).catch(error => {
    explorerCtrl.loading = false;
    explorerCtrl.failing = error instanceof Error ? error : new Error('Failed to reset Lichess book connection.');
    _bookAuthNotice = '';
    redraw();
  });
}

function renderExplorerErrorBox(err: Error, fen: string, redraw: () => void): VNode {
  const isAuthError = isExplorerBookAuthError(err)
    || err.message.includes('401')
    || err.message.includes('Unauthorized')
    || err.message.includes('Not connected');
  if (isAuthError) {
    return h('div.openings__explorer-box', { class: { reduced: true } }, [
      h('div.overlay'),
      h('div.openings__explorer-message', [
        h('strong', 'Lichess book access required'),
        h('p.openings__explorer-explanation', 'The opening book uses a separate Lichess connection.'),
        _bookAuthNotice
          ? h('p.openings__explorer-explanation.openings__explorer-explanation--notice', _bookAuthNotice)
          : null,
        h('div.openings__explorer-auth-actions', [
          h('button.openings__explorer-connect-btn', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Connect to Lichess', description: 'Authorize opening-book access through Lichess.',
            }) },
            on: { click: () => connectBookAccess(fen, redraw) },
          }, 'Connect to Lichess'),
          h('button.openings__explorer-retry.openings__explorer-reset-btn', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Reset Lichess connection', description: 'Clear saved book access and begin connection again.',
            }) },
            on: { click: () => resetBookConnection(redraw) },
          }, 'Reset connection'),
        ]),
      ]),
    ]);
  }
  return h('div.openings__explorer-box', { class: { reduced: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', [
      h('h3', 'Oops, sorry!'),
      h('p.openings__explorer-explanation', err.message),
      h('button.openings__explorer-retry', {
        attrs: controlExplainerAttrs({ label: 'Retry explorer', description: 'Request explorer data for this position again.' }),
        on: { click: () => { explorerCtrl.reload(fen, redraw); redraw(); } },
      }, 'Retry'),
    ]),
  ]);
}

export function renderExplorerDbTabs(
  node: OpeningTreeNode | null,
  redraw: () => void,
  host: ExplorerDbTabsHost,
): VNode {
  const db = explorerCtrl.config.db;
  const setDb = (d: ExplorerDb) => {
    explorerCtrl.setDb(d);
    if (node && d !== 'repertoire') explorerCtrl.setNode(node.fen, redraw);
    host.restoreAutoShapes();
    redraw();
  };
  return h('div.openings__explorer-tabs', [
    h(`button.openings__explorer-tab${db === 'masters' ? '.active' : ''}`, {
      attrs: controlExplainerAttrs({ label: 'Show Masters explorer', description: 'Use master-game opening statistics.' }),
      on: { click: () => setDb('masters') },
    }, 'Masters'),
    h(`button.openings__explorer-tab${db === 'lichess' ? '.active' : ''}`, {
      attrs: controlExplainerAttrs({ label: 'Show Lichess explorer', description: 'Use Lichess game opening statistics.' }),
      on: { click: () => setDb('lichess') },
    }, 'Lichess'),
    h(`button.openings__explorer-tab${db === 'player' ? '.active' : ''}`, {
      attrs: controlExplainerAttrs({ label: 'Show Player explorer', description: 'Use opening statistics for one Lichess player.' }),
      on: { click: () => setDb('player') },
    }, 'Player'),
    h(`button.openings__explorer-tab${db === 'repertoire' ? '.active' : ''}`, {
      attrs: controlExplainerAttrs({ label: 'Show Repertoire explorer', description: 'Compare the current line with enabled repertoire sources.' }),
      on: { click: () => setDb('repertoire') },
    }, 'Repertoire'),
    // Config gear shares the right end of the tabs row; swaps to a close glyph
    // while the config panel is open.
    // Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts button.fbt.toconf
    h('button.openings__explorer-gear', {
      class: { active: explorerCtrl.configOpen },
      attrs: {
        ...iconControlExplainerAttrs({
          label: explorerCtrl.configOpen ? 'Close explorer settings' : 'Configure explorer',
          description: 'Show or hide database-specific explorer filters.',
        }),
      },
      on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
    }, explorerCtrl.configOpen ? '✕' : '⚙'),
  ]);
}

/**
 * Config panel — DB-specific filter controls.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerConfig.ts view()
 */
export function renderExplorerConfigPanel(redraw: () => void): VNode {
  const cfg = explorerCtrl.config;
  const db = cfg.db;

  const toggleBtn = <T>(label: string, active: boolean, onClick: () => void) =>
    h('button.openings__explorer-filter-btn', {
      class: { active },
      attrs: controlExplainerAttrs({ label: `Toggle ${label}`, description: 'Include or exclude this explorer filter value.' }),
      on: { click: () => { onClick(); redraw(); } },
    }, label);

  const speedSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Time control'),
    h('div.openings__explorer-filter-row',
      ALL_SPEEDS.map(s => toggleBtn(s, cfg.speeds.includes(s), () => cfg.toggleSpeed(s))),
    ),
  ]);

  const ratingSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Avg rating'),
    h('div.openings__explorer-filter-row',
      ALL_RATINGS.map(r => toggleBtn(String(r), cfg.ratings.includes(r), () => cfg.toggleRating(r))),
    ),
  ]);

  const modeSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Mode'),
    h('div.openings__explorer-filter-row',
      ALL_MODES.map(m => toggleBtn(m, cfg.modes.includes(m), () => cfg.toggleMode(m))),
    ),
  ]);

  const dateInput = (label: string, value: string, onChange: (v: string) => void, type: 'number' | 'month') =>
    h('label.openings__explorer-date-label', [
      label,
      h('input', {
        attrs: { type, name: `explorer-${label.toLowerCase()}`, value, placeholder: type === 'number' ? 'YYYY' : 'YYYY-MM', min: type === 'number' ? '1952' : '1952-01', ...controlExplainerAttrs({
          label: `${label} date`, description: `${label === 'Since' ? 'Include games from' : 'Include games through'} this date.`,
        }) },
        on: { change: (e: Event) => { onChange((e.target as HTMLInputElement).value); redraw(); } },
      }),
    ]);

  const dateSection = (type: 'number' | 'month') =>
    h('div.openings__explorer-config-section', [
      dateInput('Since', cfg.since(), v => cfg.setSince(v), type),
      dateInput('Until', cfg.until(), v => cfg.setUntil(v), type),
    ]);

  const playerSection = () => h('div.openings__explorer-config-section', [
    h('label', 'Player'),
    h('input.openings__explorer-player-input', {
      attrs: { type: 'text', name: 'explorer-player', placeholder: 'Lichess username', value: cfg.playerName, ...controlExplainerAttrs({
        label: 'Explorer player', description: 'Set the Lichess username used by Player explorer.',
      }) },
      on: {
        change: (e: Event) => {
          cfg.setPlayerName((e.target as HTMLInputElement).value.trim());
          redraw();
        },
      },
    }),
    cfg.playerPrevious.length ? h('div.openings__explorer-player-prev',
      cfg.playerPrevious.slice(0, 10).map(name =>
        h('button.openings__explorer-prev-btn', {
          attrs: controlExplainerAttrs({ label: `Use player ${name}`, description: 'Restore this recently used Player explorer username.' }),
          on: { click: () => { cfg.setPlayerName(name); redraw(); } },
        }, name),
      ),
    ) : null,
    h('div.openings__explorer-color-row', [
      h('label', 'Color'),
      toggleBtn('White', cfg.color === 'white', () => { cfg.color = 'white'; }),
      toggleBtn('Black', cfg.color === 'black', () => { cfg.color = 'black'; }),
    ]),
  ]);

  const sections: VNode[] = [];
  if (db === 'masters') sections.push(dateSection('number'));
  if (db === 'lichess') { sections.push(speedSection(), ratingSection(), dateSection('month')); }
  if (db === 'player') { sections.push(playerSection(), speedSection(), modeSection(), dateSection('month')); }

  return h('div.openings__explorer-config', [
    ...sections,
    h('button.openings__explorer-config-close', {
      attrs: controlExplainerAttrs({ label: 'Close explorer settings', description: 'Return to explorer results.' }),
      on: { click: () => { explorerCtrl.toggleConfig(); redraw(); } },
    }, 'Done'),
  ]);
}

/**
 * Explorer panel — handles all four UI states: loading, error, empty, and data.
 * Mirrors lichess-org/lila: ui/analyse/src/explorer/explorerView.ts main() function.
 *
 * - Preserves stale cached data under a loading overlay (`.loading` class)
 * - `.reduced` class when movesAway > 2 (position moved far from book)
 * - "Max depth reached" when at or beyond MAX_EXPLORER_DEPTH
 * - Queue position message when player DB is indexing
 * - Error state with retry button
 */
export function renderExplorerPanel(
  node: OpeningTreeNode | null,
  redraw: () => void,
  host: OpeningTreeExplorerHost,
): VNode {
  if (!node) return h('div.openings__explorer-empty', 'No position selected.');
  if (explorerCtrl.config.db === 'repertoire') {
    return renderRepertoireExplorerPanel(node.fen, redraw, {
      line: repertoireLineForOpenings(sessionPath()),
      onMoveClick: (uci: string) => {
        host.playMove(uci, redraw);
      },
      onJumpToPrior: (path: readonly string[]) => {
        navigateToPath([...path]);
        host.syncBoard(redraw);
        redraw();
      },
      interactionHost: host,
    });
  }

  const data = explorerCtrl.current(node.fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing && !explorerCtrl.needsPlayerName) {
    explorerCtrl.setNode(node.fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;
  const isMasters = explorerCtrl.config.db === 'masters';

  // Player DB needs a username before we can fetch
  if (explorerCtrl.needsPlayerName) return renderPlayerNamePrompt(redraw);

  // Tablebase mode — ≤7 pieces
  if (explorerCtrl.tablebaseData) return renderTablebasePanel(explorerCtrl.tablebaseData, redraw);

  // Error state — 401 shows a connect prompt; other errors show retry
  if (failing && !data) return renderExplorerErrorBox(failing, node.fen, redraw);

  // Empty state — no data and no longer loading
  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    const queuePos = (data as import('./explorer').OpeningData | undefined)?.queuePosition;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        queuePos
          ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
          : !tooDeep
            ? h('p.openings__explorer-explanation', 'Try adjusting the filters.')
            : null,
      ]),
    ]);
  }

  // Data available — show with loading overlay if refreshing
  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const queuePos = data.queuePosition;

    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening
            ? h('div.openings__explorer-opening', data.opening.name)
            : null,
          renderExplorerMovesTable(data, node.fen, redraw, host, uci => host.playMove(uci, redraw)),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
          queuePos
            ? h('p.openings__explorer-explanation', `Indexing ${queuePos} other players first\u2026`)
            : null,
        ]);

    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  // Still waiting on first response
  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}

/**
 * Top/recent games table — adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showGameTable()
 * Columns: ratings (stacked), player names (stacked), result badge, month/year, speed icon (non-masters).
 * Row click opens the game on Lichess in a new tab.
 */
function renderExplorerGamesTable(
  title: string,
  games: import('./explorer').OpeningGame[],
  isMasters: boolean,
): VNode | null {
  if (!games.length) return null;
  const colSpan = isMasters ? 4 : 5;

  const resultBadge = (winner?: 'white' | 'black') =>
    winner === 'white'
      ? h('result.white', '1-0')
      : winner === 'black'
        ? h('result.black', '0-1')
        : h('result.draws', '\u00BD-\u00BD');

  const openGame = (gameId: string) => {
    const url = isMasters
      ? `https://lichess.org/import/master/${gameId}`
      : `https://lichess.org/${gameId}`;
    window.open(url, '_blank', 'noopener');
  };

  return h('table.explorer-games', [
    h('thead', h('tr', h('th', { attrs: { colspan: colSpan } }, title))),
    h('tbody',
      games.map(game =>
        h('tr', {
          key: game.id,
          attrs: { 'data-id': game.id, 'data-uci': game.uci ?? '', role: 'link', tabindex: '0', ...controlExplainerAttrs({
            label: `Open ${game.white.name} versus ${game.black.name}`,
            description: 'Open this explorer game on Lichess in a new tab.',
          }) },
          on: { click: () => openGame(game.id) },
          hook: { insert: vnode => {
            (vnode.elm as HTMLElement).addEventListener('keydown', event => {
              if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ') || event.repeat) return;
              event.preventDefault();
              openGame(game.id);
            });
          } },
        }, [
          h('td.ratings', [
            h('span', String(game.white.rating)),
            h('span', String(game.black.rating)),
          ]),
          h('td.players', [
            h('span', game.white.name),
            h('span', game.black.name),
          ]),
          h('td', resultBadge(game.winner)),
          h('td.date', game.month ?? game.year ?? ''),
          !isMasters
            ? h('td.speed', game.speed ? h('span', { attrs: { title: game.speed } }, speedGlyph(game.speed)) : '')
            : null,
        ]),
      ),
    ),
  ]);
}

/** Simple text glyph for speed — no icon font required. */
function speedGlyph(speed: string): string {
  const glyphs: Record<string, string> = {
    ultraBullet: '\u26a1\u26a1', bullet: '\u26a1', blitz: '\uD83D\uDD25',
    rapid: '\u23F1', classical: '\u231B', correspondence: '\u2709',
  };
  return glyphs[speed] ?? speed;
}

/** Compact number formatter: 12400 → "12.4k", 1200000 → "1.2M". */
function compactNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

/** Render a stacked W/D/B result bar — adapted from Lichess explorerView.ts resultBar(). */
function renderExplorerResultBar(move: OpeningMoveStats): VNode {
  const sum = move.white + move.draws + move.black || 1;
  const seg = (key: 'white' | 'draws' | 'black') => {
    const pct = (move[key] * 100) / sum;
    const width = Math.round((move[key] * 1000) / sum) / 10;
    return h(`span.${key}`, { attrs: { style: `width: ${width}%` } },
      pct > 12 ? `${Math.round(pct)}${pct > 20 ? '%' : ''}` : '');
  };
  return h('div.bar', [seg('white'), seg('draws'), seg('black')]);
}

/**
 * Lichess-style moves table with result bar, hover arrows, and click-to-play.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts showMoveTable()
 * and ui/analyse/src/explorer/explorerUtil.ts moveArrowAttributes().
 *
 * @param onMoveClick — optional; defaults to openings navigateToMove. Analysis board passes its own.
 * @param cgBoard     — optional; defaults to openings board. Analysis board passes its Chessground.
 */
function renderExplorerMovesTable(
  data: import('./explorer').OpeningData,
  fen: string,
  redraw: () => void,
  host: ExplorerMoveInteractionHost,
  onMoveClick?: (uci: string) => void,
): VNode {
  const sumTotal = (data.white ?? 0) + (data.draws ?? 0) + (data.black ?? 0) || 1;

  type SumRow = { uci: ''; san: string; white: number; black: number; draws: number };
  type AnyRow = OpeningMoveStats | SumRow;
  const rows: AnyRow[] = data.moves.length > 1
    ? [...data.moves, { uci: '' as '', san: '\u03A3', white: data.white ?? 0, black: data.black ?? 0, draws: data.draws ?? 0 }]
    : [...data.moves];

  const bind = (vnode: import('snabbdom').VNode) => {
    const el = vnode.elm as ExplorerMoveRowsElement;
    bindExplorerMoveRowInteractions(el, {
      fen,
      rowSelector: 'tr',
      board: host.board,
      getCurrentFen: host.getCurrentFen,
      restoreAutoShapes: host.restoreAutoShapes,
      onMoveClick,
      onDirectAutoShapesSet: host.clearAutoShapesHash,
    });
  };

  return h('table.explorer-moves', {
    hook: {
      insert: bind,
      postpatch: (_old: import('snabbdom').VNode, vnode: import('snabbdom').VNode) => bind(vnode),
    },
  }, [
    h('thead', h('tr', [
      h('th', 'Move'), h('th', '%'), h('th', 'Games'), h('th', 'W/D/B'),
    ])),
    h('tbody', rows.map(move => {
      const total = move.white + move.draws + move.black || 1;
      const isSum = move.uci === '';
      return h(isSum ? 'tr.sum' : 'tr', {
        key: move.uci || '\u03A3',
        attrs: move.uci ? {
          'data-uci': move.uci, role: 'button', tabindex: '0', ...controlExplainerAttrs({
            label: `Play explorer move ${move.san}`, description: 'Play this move from the current position.',
          }),
        } : {},
      }, [
        h('td', move.san),
        h('td', `${((total / sumTotal) * 100).toFixed(0)}%`),
        h('td', compactNum(total)),
        h('td', renderExplorerResultBar(move as OpeningMoveStats)),
      ]);
    })),
  ]);
}

// ========== Analysis board explorer integration ==========

/**
 * Explorer section for the analysis board tools column.
 * Uses the same ExplorerCtrl singleton as the openings page.
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerView.ts default export.
 *
 * @param fen         — current board FEN (from ctrl.node.fen)
 * @param cg          — analysis board Chessground instance (for hover arrows)
 * @param onMoveClick — called when a move row is clicked; should advance the analysis tree
 * @param redraw      — analysis board redraw function
 */
export function renderAnalysisExplorerSection(
  fen: string,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
  line?: RepertoireExplorerLinePosition<string>[],
  onJumpToPath?: (path: string) => void,
  getCurrentFen: () => string | null | undefined = () => fen,
): VNode | null {
  if (!explorerCtrl.enabled) return null;

  const isMasters = explorerCtrl.config.db === 'masters';

  return h('div.openings__explorer', [
    renderExplorerDbTabs(null, redraw, { restoreAutoShapes: restoreAnalysisExplorerAutoShapes }),
    explorerCtrl.configOpen
      ? renderExplorerConfigPanel(redraw)
      : renderAnalysisExplorerPanel(fen, isMasters, cg, onMoveClick, redraw, line, onJumpToPath, getCurrentFen),
  ]);
}

/**
 * FEN-based explorer panel for the analysis board (no OpeningTreeNode dependency).
 * Mirrors renderExplorerPanel() but uses a plain FEN and custom move/arrow callbacks.
 */
function renderAnalysisExplorerPanel(
  fen: string,
  isMasters: boolean,
  cg: CgApi | undefined,
  onMoveClick: (uci: string) => void,
  redraw: () => void,
  line?: RepertoireExplorerLinePosition<string>[],
  onJumpToPath?: (path: string) => void,
  getCurrentFen: () => string | null | undefined = () => fen,
): VNode {
  if (explorerCtrl.config.db === 'repertoire') {
    const opts: {
      line?: RepertoireExplorerLinePosition<string>[];
      onMoveClick: (uci: string) => void;
      onJumpToPrior?: (path: string) => void;
      interactionHost: ExplorerMoveInteractionHost;
    } = {
      onMoveClick,
      interactionHost: {
        board: () => cg,
        getCurrentFen,
        restoreAutoShapes: restoreAnalysisExplorerAutoShapes,
        clearAutoShapesHash: () => {},
      },
    };
    if (line) opts.line = line;
    if (onJumpToPath) opts.onJumpToPrior = onJumpToPath;
    return renderRepertoireExplorerPanel(fen, redraw, opts);
  }

  const data = explorerCtrl.current(fen);
  if (!data && !explorerCtrl.loading && !explorerCtrl.failing && !explorerCtrl.needsPlayerName) {
    explorerCtrl.setNode(fen, redraw);
  }

  const loading = explorerCtrl.loading;
  const failing = explorerCtrl.failing;
  const movesAway = explorerCtrl.movesAway;

  if (explorerCtrl.needsPlayerName) return renderPlayerNamePrompt(redraw);

  if (explorerCtrl.tablebaseData) return renderTablebasePanel(explorerCtrl.tablebaseData, redraw);

  if (failing && !data) return renderExplorerErrorBox(failing, fen, redraw);

  if (!loading && !data) {
    const tooDeep = movesAway >= MAX_EXPLORER_DEPTH;
    return h('div.openings__explorer-box', { class: { reduced: movesAway > 2 } }, [
      h('div.openings__explorer-message', [
        h('strong', tooDeep ? 'Max depth reached' : 'No game found'),
        !tooDeep ? h('p.openings__explorer-explanation', 'Try adjusting the filters.') : null,
      ]),
    ]);
  }

  if (data) {
    const hasContent = data.moves.length > 0 || (data.topGames?.length ?? 0) > 0 || (data.recentGames?.length ?? 0) > 0;
    const content = hasContent
      ? h('div.openings__explorer-data', [
          data.opening ? h('div.openings__explorer-opening', data.opening.name) : null,
          renderExplorerMovesTable(data, fen, redraw, {
            board: () => cg,
            getCurrentFen,
            restoreAutoShapes: restoreAnalysisExplorerAutoShapes,
            clearAutoShapesHash: () => {},
          }, onMoveClick),
          renderExplorerGamesTable('Top games', data.topGames ?? [], isMasters),
          renderExplorerGamesTable('Recent games', data.recentGames ?? [], isMasters),
        ])
      : h('div.openings__explorer-message', [
          h('strong', movesAway >= MAX_EXPLORER_DEPTH ? 'Max depth reached' : 'No game found'),
        ]);
    return h('div.openings__explorer-box', { class: { loading, reduced: movesAway > 2 && !hasContent } }, [
      h('div.overlay'),
      content,
    ]);
  }

  return h('div.openings__explorer-box', { class: { loading: true } }, [
    h('div.overlay'),
    h('div.openings__explorer-message', h('p', 'Loading\u2026')),
  ]);
}
