










import { h, type VNode } from 'snabbdom';
import { type ImportedGame, parsePgnHeader } from '../import/types';
import { chesscom } from '../import/chesscom';
import { lichess } from '../import/lichess';
import { parsePgn } from 'chessops/pgn';
import { thumbnailFen } from './thumbPosition';

// ---------------------------------------------------------------------------
// Minimal local duplicates of view.ts's getUserColor / gameResult (see file header).
// ---------------------------------------------------------------------------

function getUserColor(game: ImportedGame): 'white' | 'black' | null {
  const knownNames = [game.importedUsername, chesscom.username, lichess.username]
    .map(n => n?.trim().toLowerCase())
    .filter((n): n is string => !!n);
  if (knownNames.length === 0) return null;
  if (game.white && knownNames.includes(game.white.toLowerCase())) return 'white';
  if (game.black && knownNames.includes(game.black.toLowerCase())) return 'black';
  return null;
}

function gameResult(game: ImportedGame): 'win' | 'loss' | 'draw' | null {
  const color = getUserColor(game);
  if (!game.result) return null;
  if (game.result.includes('1/2')) return 'draw';
  if (!color) return null;
  if (color === 'white') return game.result === '1-0' ? 'win' : 'loss';
  return game.result === '0-1' ? 'win' : 'loss';
}








const MEMO_CACHE_LIMIT = 2000;

function makeGameIdCache<T>(limit = MEMO_CACHE_LIMIT): { get: (id: string) => T | undefined; set: (id: string, value: T) => void } {
  const cache = new Map<string, T>();
  return {
    get: (id: string) => cache.get(id),
    set: (id: string, value: T) => {
      if (!cache.has(id) && cache.size >= limit) {
        const oldestKey = cache.keys().next().value;
        if (oldestKey !== undefined) cache.delete(oldestKey);
      }
      cache.set(id, value);
    },
  };
}

// ---------------------------------------------------------------------------
// Lazily-parsed, memoized opening move preview (first ~5 mainline SAN tokens + total move count).
// Mainline only, matching thumbPosition.ts's convention; unparseable PGN returns null.
// ---------------------------------------------------------------------------

const OPENING_PREVIEW_PLIES = 5;

export interface OpeningPreview {
  sanMoves: string[];
  totalPlies: number;
}

const openingPreviewCache = makeGameIdCache<OpeningPreview | null>();

function computeOpeningPreview(pgn: string): OpeningPreview | null {
  const parsed = parsePgn(pgn)[0];
  if (!parsed || parsed.moves.children.length === 0) return null;

  const sanMoves: string[] = [];
  let node = parsed.moves.children[0];
  let totalPlies = 0;
  while (node) {
    if (sanMoves.length < OPENING_PREVIEW_PLIES) sanMoves.push(node.data.san);
    totalPlies++;
    node = node.children[0];
  }
  return { sanMoves, totalPlies };
}





export function openingPreview(game: ImportedGame): OpeningPreview | null {
  const cached = openingPreviewCache.get(game.id);
  if (cached !== undefined) return cached;
  let preview: OpeningPreview | null;
  try {
    preview = computeOpeningPreview(game.pgn);
  } catch {
    preview = null;
  }
  openingPreviewCache.set(game.id, preview);
  return preview;
}





export function formatMovePreview(sanMoves: string[]): string {
  const parts: string[] = [];
  for (let i = 0; i < sanMoves.length; i++) {
    const san = sanMoves[i];
    if (san === undefined) continue;
    parts.push(i % 2 === 0 ? `${i / 2 + 1}.${san}` : san);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Lazily-parsed, memoized PGN-derived extras: rating deltas, rated flag, time control label,
// and the played timestamp. Bundled into one cache entry per game id to avoid re-scanning the
// same PGN string with multiple separate regexes.
// ---------------------------------------------------------------------------

export interface GameTimestamp {
  display:    string;

  dateLabel:  string | null;

  timeLabel:  string | null;
  iso:        string | null;
  sourceLabel: string | null;
}

export interface GameExtras {
  rated:           boolean | null;
  timeControlLabel: string | null;
  timestamp:       GameTimestamp;
}

const gameExtrasCache = makeGameIdCache<GameExtras>();

function parseRatingDiff(pgn: string, tag: string): number | null {
  const raw = parsePgnHeader(pgn, tag);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

// Best-effort only: Lichess PGN exports commonly phrase the Event header as "Rated Blitz game" /
// "Casual Blitz game"; Chess.com's Event header (typically "Live Chess" / "Chess.com") does not
// carry this distinction, so this returns null (omitted) for those games rather than guessing.
function parseRatedFlag(pgn: string): boolean | null {
  const event = parsePgnHeader(pgn, 'Event') ?? '';
  if (/\brated\b/i.test(event)) return true;
  if (/\bcasual\b/i.test(event)) return false;
  return null;
}

function parseTimeControlLabel(pgn: string): string | null {
  const tc = parsePgnHeader(pgn, 'TimeControl');
  return tc && tc !== '-' ? tc : null;
}

function parseHeaderTimestamp(pgn: string, dateTag: string, timeTag: string): { epochMs: number; iso: string } | null {
  const date = parsePgnHeader(pgn, dateTag);
  const time = parsePgnHeader(pgn, timeTag);
  if (!date || !time) return null;
  const iso = `${date.replace(/\./g, '-')}T${time}Z`;
  const epochMs = Date.parse(iso);
  return Number.isNaN(epochMs) ? null : { epochMs, iso };
}

function sourcePlatformLabel(game: ImportedGame): string | null {
  return game.source === 'chesscom' ? 'Chess.com' : game.source === 'lichess' ? 'Lichess' : null;
}

function computeTimestamp(game: ImportedGame): GameTimestamp {
  const parsed = game.source === 'chesscom'
    ? parseHeaderTimestamp(game.pgn, 'EndDate', 'EndTime') ?? parseHeaderTimestamp(game.pgn, 'UTCDate', 'UTCTime')
    : parseHeaderTimestamp(game.pgn, 'UTCDate', 'UTCTime') ?? parseHeaderTimestamp(game.pgn, 'EndDate', 'EndTime');

  if (parsed) {
    const d = new Date(parsed.epochMs);
    const timeLabel = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return {
      display: `${timeLabel} · ${dateLabel}`, dateLabel, timeLabel,
      iso: parsed.iso, sourceLabel: sourcePlatformLabel(game),
    };
  }

  // No parseable game time: fall back to a readable date-only label (never a bare ISO string).
  const dateOnly = game.date ? game.date.slice(0, 10) : null;
  if (dateOnly) {
    const d = new Date(`${dateOnly}T00:00:00Z`);
    const dateLabel = Number.isNaN(d.getTime())
      ? dateOnly
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return { display: dateLabel, dateLabel, timeLabel: null, iso: null, sourceLabel: sourcePlatformLabel(game) };
  }

  return { display: '–', dateLabel: null, timeLabel: null, iso: null, sourceLabel: null };
}

function computeGameExtras(game: ImportedGame): GameExtras {
  return {
    rated:            parseRatedFlag(game.pgn),
    timeControlLabel: parseTimeControlLabel(game.pgn),
    timestamp:        computeTimestamp(game),
  };
}






export function gameExtras(game: ImportedGame): GameExtras {
  const cached = gameExtrasCache.get(game.id);
  if (cached !== undefined) return cached;
  const extras = computeGameExtras(game);
  gameExtrasCache.set(game.id, extras);
  return extras;
}

export function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  if (delta < 0) return `−${Math.abs(delta)}`;
  return '±0';
}








export function estimateEloRatingDelta(playerRating: number, opponentRating: number, score: 0 | 0.5 | 1): number {
  const expected = 1 / (1 + 10 ** ((opponentRating - playerRating) / 400));
  return Math.round(16 * (score - expected));
}













function fillMissingDeltaByEstimate(
  game: ImportedGame,
  deltas: { white: number | null; black: number | null },
): { white: number | null; black: number | null } {
  const oneKnown = (deltas.white === null) !== (deltas.black === null);
  if (!oneKnown) return deltas;
  if (game.rated === false) return deltas;
  if (game.whiteRating === undefined || game.blackRating === undefined) return deltas;
  const whiteScore: 0 | 0.5 | 1 | null =
    game.result === '1-0' ? 1 : game.result === '0-1' ? 0 : game.result?.includes('1/2') ? 0.5 : null;
  if (whiteScore === null) return deltas;

  if (deltas.white === null) {
    const blackPreRating = game.blackRating - deltas.black!;
    return { ...deltas, white: estimateEloRatingDelta(game.whiteRating, blackPreRating, whiteScore) };
  }
  const whitePreRating = game.whiteRating - deltas.white;
  const blackScore = (1 - whiteScore) as 0 | 0.5 | 1;
  return { ...deltas, black: estimateEloRatingDelta(game.blackRating, whitePreRating, blackScore) };
}






















export function resolveRatingDeltas(
  game: ImportedGame,
  accountColor: 'white' | 'black' | null,
): { white: number | null; black: number | null } {
  const headerWhite = parseRatingDiff(game.pgn, 'WhiteRatingDiff');
  const headerBlack = parseRatingDiff(game.pgn, 'BlackRatingDiff');
  if (accountColor === 'white') {
    return fillMissingDeltaByEstimate(game, {
      white: game.ratingDelta ?? headerWhite,
      black: game.opponentRatingDelta ?? headerBlack,
    });
  }
  if (accountColor === 'black') {
    return fillMissingDeltaByEstimate(game, {
      white: game.opponentRatingDelta ?? headerWhite,
      black: game.ratingDelta ?? headerBlack,
    });
  }
  return fillMissingDeltaByEstimate(game, { white: headerWhite, black: headerBlack });
}






















const ROLE_BY_LETTER: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function expandFenBoard(fen: string): (string | null)[][] {
  const boardPart = fen.split(' ')[0] ?? '';
  return boardPart.split('/').map(rank => {
    const row: (string | null)[] = [];
    for (const ch of rank) {
      if (ch >= '1' && ch <= '8') {
        for (let i = 0; i < Number(ch); i++) row.push(null);
      } else {
        row.push(ch);
      }
    }
    return row;
  });
}

// rows[0] = rank 8 ... rows[7] = rank 1 (standard FEN row order). Square color/texture comes from
// the active board theme's background image on the grid container (main.scss), not from a
// per-square class here — see the file-header comment above.
function populateThumbnailGrid(container: HTMLElement, fen: string, flipped: boolean): void {
  const rows = expandFenBoard(fen);
  const frag = document.createDocumentFragment();

  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const rankIdx = flipped ? 7 - displayRow : displayRow;
      const fileIdx = flipped ? 7 - displayCol : displayCol;

      const square = document.createElement('div');
      square.className = 'grr__thumb-sq';

      const code = rows[rankIdx]?.[fileIdx];
      if (code) {
        const role = ROLE_BY_LETTER[code.toLowerCase()];
        if (role) {
          const piece = document.createElement('piece');
          piece.className = `${role} ${code === code.toUpperCase() ? 'white' : 'black'}`;
          square.appendChild(piece);
        }
      }
      frag.appendChild(square);
    }
  }

  container.replaceChildren(frag);
  // Reveals the themed board-image background (main.scss gates it on this class) now that there
  // are actual pieces to show it behind — see the file-header comment above.
  container.classList.add('--populated');
}

type ThumbGridElement = HTMLElement & { __grrObserver: IntersectionObserver | undefined };

function mountLazyThumbnail(vnode: VNode, game: ImportedGame, flipped: boolean): void {
  const el = vnode.elm as ThumbGridElement | undefined;
  if (!el) return;
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.disconnect();
      el.__grrObserver = undefined;
      const fen = thumbnailFen(game);
      if (fen) populateThumbnailGrid(el, fen, flipped);
    }
  }, { rootMargin: '200px' });
  el.__grrObserver = observer;
  observer.observe(el);
}

function unmountLazyThumbnail(vnode: VNode): void {
  const el = vnode.elm as ThumbGridElement | undefined;
  el?.__grrObserver?.disconnect();
  if (el) el.__grrObserver = undefined;
}

function renderThumbnail(game: ImportedGame, resultCls: string, flipped: boolean): VNode {
  return h('div.grr__thumb.' + resultCls, [
    h('div.grr__thumb-grid', {
      hook: {
        insert:  vnode => mountLazyThumbnail(vnode, game, flipped),
        destroy: vnode => unmountLazyThumbnail(vnode),
      },
    }),
  ]);
}






export type ReviewControlState =
  | { kind: 'unreviewed' }
  | { kind: 'queued'; wave: number; totalWaves: number }
  | { kind: 'running'; percent: number }
  | { kind: 'failed'; attempts?: number }
  | { kind: 'reviewed' }
  | { kind: 'stalled' }
  | { kind: 'incomplete' };

export interface ReviewControlOpts {

  compact?:       boolean;
  onReview?:      () => void;
  onRetry?:       () => void;
  onSkip?:        () => void;
  onOpenReview?:  () => void;
  onResume?:      () => void;
}

function stopAnd(e: Event, fn: (() => void) | undefined): void {
  e.stopPropagation();
  fn?.();
}

export function renderReviewControl(state: ReviewControlState, opts: ReviewControlOpts = {}): VNode {
  switch (state.kind) {
    case 'unreviewed':
      // Ghost outline chip (approved redesign 2026-07-05): true green bolt/text, transparent
      // background, `#2e6b3c` outline. The label collapses via the shared `.grr__review-collapse`
      // container-query mechanism (same one the reviewed pill already used), leaving a bolt-only
      // ghost tile at the narrowest compact widths (spec §5).
      return h('button.grr__review.--unreviewed' + (opts.compact ? '.--compact' : ''), {
        attrs: { type: 'button', title: 'Analyze this game' },
        on:    { click: (e: Event) => stopAnd(e, opts.onReview) },
      }, [
        h('span.grr__review-bolt', '⚡'),
        h('span.grr__review-collapse', ' Analyze'),
      ]);

    case 'queued':



      return h('span.grr__review.--queued', {
        attrs: { title: `Queued for Bulk Review — wave ${state.wave} of ${state.totalWaves}` },
      }, [
        '⏲ Queued · wave ',
        h('span.grr__review-num', `${state.wave}`),
        ' of ',
        h('span.grr__review-num', `${state.totalWaves}`),
      ]);

    case 'running':







      return h('div.grr__review.--running', { attrs: { title: 'Analyzing…' } }, [
        h('span.grr__review-bolt.--breathing', '⚡'),
        h('span.grr__review-label', [
          'Analyzing · ',
          h('span.grr__review-pct', `${Math.round(state.percent)}%`),
        ]),
        h('div.grr__review-fill', { style: { width: `${Math.max(0, Math.min(100, state.percent))}%` } }),
      ]);

    case 'failed':
      return h('div.grr__review.--failed', [
        h('span.grr__review-label', { attrs: { title: 'Analysis failed' } },
          state.attempts !== undefined ? `⚠ Analysis failed (${state.attempts})` : '⚠ Analysis failed'),
        h('button.grr__review-retry', {
          attrs: { type: 'button', title: 'Retry analysis' },
          on:    { click: (e: Event) => stopAnd(e, opts.onRetry) },
        }, 'Retry'),
        h('button.grr__review-skip', {
          attrs: { type: 'button', title: 'Skip this game' },
          on:    { click: (e: Event) => stopAnd(e, opts.onSkip) },
        }, 'Skip'),
      ]);

    case 'reviewed': {
      // Navy split capsule (approved redesign 2026-07-05): one action (`opts.onOpenReview`) —
      // the 34px `↗` cell is a visual affordance of the same click, not a second control. Compact
      // rows get a simpler tinted navy pill instead of the split-cell treatment (no room for a
      // dedicated icon cell); it collapses to a near-square icon-only tile via the same
      // `.grr__review-collapse` container-query mechanism the previous "✓ Reviewed" pill used.
      const title = 'Open in the analysis board';
      if (opts.compact) {
        return h('button.grr__review.--reviewed.--compact', {
          attrs: { type: 'button', title, 'aria-label': title },
          on:    { click: (e: Event) => stopAnd(e, opts.onOpenReview) },
        }, [
          h('span.grr__review-check', '✓'),
          h('span.grr__review-collapse', ' Review'),
        ]);
      }
      return h('button.grr__review.--reviewed', {
        attrs: { type: 'button', title, 'aria-label': title },
        on:    { click: (e: Event) => stopAnd(e, opts.onOpenReview) },
      }, [
        h('span.grr__review-main', [
          h('span.grr__review-check', '✓'),
          ' Review',
        ]),
        h('span.grr__review-icon-cell', { attrs: { 'aria-hidden': 'true' } }, '↗'),
      ]);
    }

    case 'stalled':
      return h('button.grr__review.--stalled', {
        attrs: { type: 'button', title: 'Review appears stalled — click to resume' },
        on:    { click: (e: Event) => stopAnd(e, opts.onResume) },
      }, '⚠ Stalled — resume?');

    case 'incomplete':
      return h('button.grr__review.--incomplete', {
        attrs: { type: 'button', title: 'Analysis incomplete — click to resume' },
        on:    { click: (e: Event) => stopAnd(e, opts.onResume) },
      }, '◐ Resume analysis');

    default: {
      const exhaustive: never = state;
      throw new Error(`renderReviewControl: unhandled review state ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Reviewed-game icon slot — rendered only when backed by real data (never a placeholder icon).
// ---------------------------------------------------------------------------

export interface RichRowIconInputs {
  hasMissedMate?:        boolean;
  /** Swing/collapse severity, 1–3 (see LOSS_THRESHOLDS in engine/winchances.ts); 0/absent = none. */
  missedTacticSeverity?: 1 | 2 | 3;
  lfymAvailable?:        boolean;
}

interface RichRowIcon {
  cls:   string;
  glyph: string;
  title: string;
}

function computeIcons(reviewState: ReviewControlState, inputs: RichRowIconInputs): RichRowIcon[] {
  const icons: RichRowIcon[] = [];
  if (inputs.hasMissedMate) {
    icons.push({ cls: '--missed-mate', glyph: '#', title: 'Missed forced mate' });
  }
  if (inputs.missedTacticSeverity) {
    icons.push({ cls: '--missed-tactic', glyph: '!'.repeat(inputs.missedTacticSeverity), title: 'Missed tactic' });
  }
  if (reviewState.kind === 'reviewed') {
    icons.push({ cls: '--complete', glyph: '✓', title: 'Review complete' });
  }
  if (reviewState.kind === 'incomplete') {
    icons.push({ cls: '--incomplete', glyph: '◐', title: 'Review incomplete — never shown as complete' });
  }
  if (reviewState.kind === 'failed') {
    icons.push({ cls: '--failed', glyph: '⚠', title: 'Analysis failed' });
  }
  if (inputs.lfymAvailable) {
    icons.push({ cls: '--lfym', glyph: '●', title: 'Learn From Your Mistakes puzzles available' });
  }
  return icons;
}

// ---------------------------------------------------------------------------
// Bottom-left tag area — Add Library always first (grey, low visual weight), then only
// available/actionable tags in priority order, overflow behind +N.
// ---------------------------------------------------------------------------

export interface RichRowTagInputs {
  lfymCount?:            number;
  generatedPuzzleCount?: number;
  manualTags?:           string[];
  hasNotes?:             boolean;
}

interface RichRowTag {
  cls:   string;
  label: string;
}

const TAG_OVERFLOW_VISIBLE = 3;

function computeTags(reviewState: ReviewControlState, inputs: RichRowTagInputs): RichRowTag[] {
  const tags: RichRowTag[] = [];
  if (inputs.lfymCount) {
    tags.push({ cls: '--lfym', label: `${inputs.lfymCount} LFYM puzzle${inputs.lfymCount === 1 ? '' : 's'}` });
  }
  if (inputs.generatedPuzzleCount) {
    tags.push({ cls: '--puzzles', label: `${inputs.generatedPuzzleCount} puzzle${inputs.generatedPuzzleCount === 1 ? '' : 's'}` });
  }
  if (reviewState.kind === 'reviewed') {
    tags.push({ cls: '--reviewed', label: 'Reviewed' });
  }
  for (const label of inputs.manualTags ?? []) {
    tags.push({ cls: '--manual', label });
  }
  if (inputs.hasNotes) {
    tags.push({ cls: '--notes', label: 'Notes' });
  }
  return tags;
}






export function renderTagArea(
  reviewState: ReviewControlState,
  inputs: RichRowTagInputs,
  addLibrary: { onAdd: () => void } | null | undefined,
): VNode {
  const tags = computeTags(reviewState, inputs);
  const visible = tags.slice(0, TAG_OVERFLOW_VISIBLE);
  const overflowCount = tags.length - visible.length;

  return h('div.grr__tags', [
    h('button.grr__tag.--add-library', {
      attrs: {
        type:  'button',
        disabled: !addLibrary,
        title: addLibrary ? 'Add to Study Library' : 'Study Library add flow is not available yet',
      },
      on: { click: (e: Event) => { e.stopPropagation(); addLibrary?.onAdd(); } },
    }, '+ Add Library'),
    ...visible.map(tag => h('span.grr__tag.' + tag.cls, tag.label)),
    overflowCount > 0 ? h('span.grr__tag.--overflow', `+${overflowCount}`) : null,
  ]);
}






export function renderReviewedChip(reviewState: ReviewControlState): VNode | null {
  return reviewState.kind === 'reviewed' ? h('span.grr__chip.--reviewed', '✓ Reviewed') : null;
}






export function renderLibraryChip(addLibrary: { onAdd: () => void } | null | undefined): VNode {
  return h('button.grr__chip.--library', {
    attrs: {
      type:  'button',
      disabled: !addLibrary,
      title: addLibrary ? 'Add to Study Library' : 'Study Library add flow is not available yet',
    },
    on: { click: (e: Event) => { e.stopPropagation(); addLibrary?.onAdd(); } },
  }, '+ Library');
}

function renderRichChipsRow(
  reviewState: ReviewControlState,
  tacticIcons: RichRowIcon[],
  addLibrary: { onAdd: () => void } | null | undefined,
): VNode {
  const reviewed = reviewState.kind === 'reviewed';
  return h('div.grr__chips', [
    renderReviewedChip(reviewState),
    reviewed && tacticIcons.length > 0
      ? h('span.grr__chip-icons', tacticIcons.map(icon =>
          h('span.grr__icon.' + icon.cls, { attrs: { title: icon.title } }, icon.glyph)))
      : null,
    renderLibraryChip(addLibrary),
  ]);
}










export type PlayerDotClass = 'win' | 'loss' | 'draw' | 'unknown';








export function playerDotClass(
  role: 'opponent' | 'account',
  result: 'win' | 'loss' | 'draw' | null,
): PlayerDotClass {
  if (result === null) return 'unknown';
  if (result === 'draw') return 'draw';
  if (role === 'account') return result;
  return result === 'win' ? 'loss' : 'win';
}

interface PlayerBlockOpts {
  variant:  'opponent' | 'account';
  name:     string;
  rating:   number | undefined;
  color:    'white' | 'black' | null;
  delta:    number | null;
  accuracy: number | null | undefined;
}

function renderMatchupCell(opts: PlayerBlockOpts): VNode {
  const deltaNode = opts.delta !== null
    ? h('span.grr__delta', { class: { '--gain': opts.delta > 0, '--loss': opts.delta < 0 } }, formatDelta(opts.delta))
    : null;






  return h('div.grr__player.--' + opts.variant, [
    h('span.grr__player-name', opts.name),
    opts.rating !== undefined ? h('span.grr__player-rating', String(opts.rating)) : null,
    deltaNode,
    opts.color ? h('span.color-chip.--' + opts.color) : null,
  ]);
}

function renderAccuracyCell(variant: 'opponent' | 'account', accuracy: number | null | undefined): VNode | null {
  if (accuracy === null || accuracy === undefined) return null;
  return h('div.grr__accuracy.--' + variant, [
    h('span.grr__accuracy-value', `${Math.round(accuracy)}%`),
    h('span.grr__accuracy-label', ' accuracy'),
  ]);
}

function renderMatchupGrid(opp: PlayerBlockOpts, acct: PlayerBlockOpts): VNode {
  const hasAccuracy = (opp.accuracy !== null && opp.accuracy !== undefined)
    || (acct.accuracy !== null && acct.accuracy !== undefined);

  return h('div.grr__matchup', [
    renderMatchupCell(opp),
    h('span.grr__vs-pill', 'vs'),
    renderMatchupCell(acct),
    ...(hasAccuracy ? [
      renderAccuracyCell('opponent', opp.accuracy),
      h('span.grr__accuracy-divider'),
      renderAccuracyCell('account', acct.accuracy),
    ] : []),
  ]);
}

function opponentLabel(game: ImportedGame, userColor: 'white' | 'black' | null): string {
  if (userColor === 'white') return game.black ?? game.id;
  if (userColor === 'black') return game.white ?? game.id;
  return game.white && game.black ? `${game.white} vs ${game.black}` : game.id;
}

function accountLabel(game: ImportedGame, userColor: 'white' | 'black' | null): string | null {
  if (userColor === 'white') return game.white ?? game.importedUsername ?? null;
  if (userColor === 'black') return game.black ?? game.importedUsername ?? null;
  return game.importedUsername ?? null;
}

// ---------------------------------------------------------------------------
// Icon-font glyphs — real codepoints from the bundled lichess.woff2 (public/font/lichess.woff2,
// same private-use characters as lichess-org/lila's ui/lib/src/licon.ts), never emoji.
// ---------------------------------------------------------------------------

const BOOK_GLYPH          = ''; // licon.Book
const CLOCK_GLYPH         = ''; // licon.Clock
const EXTERNAL_LINK_GLYPH = ''; // licon.ExternalArrow

// ---------------------------------------------------------------------------
// Opening line — book icon + opening name (semibold) + first ~5 mainline SAN moves + total move
// count.
// ---------------------------------------------------------------------------

function renderOpeningLine(game: ImportedGame): VNode {
  const preview = openingPreview(game);
  const openingName = game.opening?.trim() || null;
  const movesText = preview && preview.sanMoves.length > 0 ? formatMovePreview(preview.sanMoves) : null;
  const totalMoves = preview ? Math.ceil(preview.totalPlies / 2) : null;

  const trailingParts: string[] = [];
  if (movesText) trailingParts.push(movesText);
  if (totalMoves) trailingParts.push(`${totalMoves} move${totalMoves === 1 ? '' : 's'}`);

  return h('div.grr__opening', { attrs: { title: [openingName, ...trailingParts].filter(Boolean).join(' — ') } }, [
    h('span.grr__opening-icon', { attrs: { 'data-icon': BOOK_GLYPH } }),
    openingName ? h('span.grr__opening-name', openingName) : null,
    trailingParts.length > 0 ? h('span.grr__opening-moves', trailingParts.join(' · ')) : null,
  ]);
}

// ---------------------------------------------------------------------------
// Bottom-right meta — colored time-class icon + control + rated flag + full local timestamp.
// ---------------------------------------------------------------------------

export const TIME_CLASS_ICON: Record<string, { glyph: string; cls: string }> = {
  ultrabullet: { glyph: '', cls: '--bullet' },
  bullet:      { glyph: '', cls: '--bullet' },
  blitz:       { glyph: '', cls: '--blitz' },
  rapid:       { glyph: '', cls: '--rapid' },
  classical:   { glyph: '', cls: '--classical' }, // licon.Turtle
};
// Study import / no time control — licon.Book, distinct glyph + color from every timed class.
export const NO_CLOCK_ICON = { glyph: '', cls: '--no-clock' };

/** Formats a base duration in seconds as minutes (`Nm`, non-integer minutes like 90s → `1.5m`) or,
 *  for sub-minute bases, seconds (`Ns`). Shared by the clock and daily/correspondence branches of
 *  formatTimeControlLabel below. */
function formatDurationUnit(totalSeconds: number, unitSeconds: number, suffix: string): string {
  const value = totalSeconds / unitSeconds;
  const rounded = Math.round(value * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label}${suffix}`;
}










export function formatTimeControlLabel(raw: string | null): string | null {
  if (!raw) return null;

  const dailyMatch = raw.match(/^\d+\/(\d+)$/);
  const dailySecondsGroup = dailyMatch?.[1];
  if (dailySecondsGroup !== undefined) {
    const seconds = parseInt(dailySecondsGroup, 10);
    return Number.isNaN(seconds) || seconds <= 0 ? null : formatDurationUnit(seconds, 86400, 'd');
  }

  const clockMatch = raw.match(/^(\d+)(?:\+(\d+))?$/);
  const baseSecondsGroup = clockMatch?.[1];
  if (baseSecondsGroup === undefined) return null;
  const baseSeconds = parseInt(baseSecondsGroup, 10);
  if (Number.isNaN(baseSeconds)) return null;
  const incrementGroup = clockMatch?.[2];
  const incrementSeconds = incrementGroup !== undefined ? parseInt(incrementGroup, 10) : 0;

  const baseLabel = baseSeconds < 60
    ? formatDurationUnit(baseSeconds, 1, 's')
    : formatDurationUnit(baseSeconds, 60, 'm');
  return incrementSeconds > 0 ? `${baseLabel} + ${incrementSeconds}` : baseLabel;
}

function metaRow(glyph: string | null, iconCls: string, text: string, tooltip?: string): VNode {
  return h('div.grr__rail-meta-row', tooltip ? { attrs: { title: tooltip } } : {}, [
    h('span.grr__rail-meta-icon' + (iconCls ? '.' + iconCls : ''), glyph ? { attrs: { 'data-icon': glyph } } : {}),
    h('span.grr__rail-meta-text', text),
  ]);
}












/** Top rail zone — colored time-class icon + "Blitz 3m + 2" label, anchored to the cell top. */
function renderRailTimeClass(game: ImportedGame, extras: GameExtras): VNode {
  const icon = (game.timeClass ? TIME_CLASS_ICON[game.timeClass] : undefined) ?? NO_CLOCK_ICON;
  const tcLabel = game.timeClass
    ? game.timeClass.charAt(0).toUpperCase() + game.timeClass.slice(1)
    : 'Study import';
  const formattedControl = formatTimeControlLabel(extras.timeControlLabel);
  const tcText = formattedControl !== null ? `${tcLabel} ${formattedControl}` : tcLabel;
  const ratedLabel = extras.rated === true ? 'Rated' : extras.rated === false ? 'Casual' : null;
  const tcTooltip = ratedLabel ? `${tcText} · ${ratedLabel}` : tcText;

  return h('div.grr__rail-meta.grr__rail-meta--top', [
    metaRow(icon.glyph, icon.cls, tcText, tcTooltip),
  ]);
}

/** Bottom rail zone — played date/time rows + external link, anchored to the cell bottom. */
function renderRailMeta(game: ImportedGame, extras: GameExtras, sourceUrl: string | null | undefined): VNode {
  const tsTooltip = [extras.timestamp.iso, extras.timestamp.sourceLabel].filter(Boolean).join(' · ');

  return h('div.grr__rail-meta.grr__rail-meta--bottom', [
    extras.timestamp.dateLabel ? metaRow(null, '', extras.timestamp.dateLabel, tsTooltip) : null,
    extras.timestamp.timeLabel ? metaRow(CLOCK_GLYPH, '', extras.timestamp.timeLabel, tsTooltip) : null,
    sourceUrl ? h('a.grr__rail-meta-row.grr__rail-ext-link', {
      attrs: { href: sourceUrl, target: '_blank', rel: 'noopener', title: 'View on source platform' },
      on:    { click: (e: Event) => e.stopPropagation() },
    }, [
      h('span.grr__rail-meta-icon', { attrs: { 'data-icon': EXTERNAL_LINK_GLYPH } }),
    ]) : null,
  ]);
}

// ---------------------------------------------------------------------------
// Row renderer
// ---------------------------------------------------------------------------






export interface RichRowSecondaryAction {
  glyph:   string;
  title:   string;
  onClick: () => void;
}

export interface RichGameRowDeps {
  selected:     boolean;
  /** True when this game is the one currently open in the analysis board. */
  open?:        boolean;
  accuracy?:    { user: number | null; opp: number | null };
  reviewState:  ReviewControlState;
  reviewOpts?:  ReviewControlOpts;
  icons?:       RichRowIconInputs;





  tags?:        RichRowTagInputs;
  /** Present + non-null when a Study Library add flow is wired up; omitted/null renders disabled. */
  addLibrary?:  { onAdd: () => void } | null;
  /**
   * Secondary queue-priority actions rendered next to the review control (empty/omitted renders
   * none). Does not alter the seven review-control states themselves.
   */
  secondaryActions?: RichRowSecondaryAction[];
  onSelectRow?: (game: ImportedGame, e: MouseEvent) => void;
  /** External source-platform link (Chess.com/Lichess), rendered as the rail meta stack's last row. */
  sourceUrl?:   string | null;
}

/** Exported so the compact-density feed (view.ts) can reuse the same markup/styling. */
export function renderSecondaryActions(actions: RichRowSecondaryAction[]): VNode | null {
  if (actions.length === 0) return null;
  return h('div.grr__secondary', actions.map(action => h('button.grr__secondary-btn', {
    attrs: { type: 'button', title: action.title, 'aria-label': action.title },
    on:    { click: (e: Event) => { e.stopPropagation(); action.onClick(); } },
  }, action.glyph)));
}

export function renderRichGameRow(game: ImportedGame, deps: RichGameRowDeps): VNode {
  const userColor = getUserColor(game);
  const result = gameResult(game);
  const resultCls = result === 'win' ? '--win' : result === 'loss' ? '--loss' : result === 'draw' ? '--draw' : '--unknown';
  const extras = gameExtras(game);

  const oppRating = userColor === 'white' ? game.blackRating : userColor === 'black' ? game.whiteRating : undefined;
  const acctRating = userColor === 'white' ? game.whiteRating : userColor === 'black' ? game.blackRating : undefined;
  const deltas = resolveRatingDeltas(game, userColor);
  const oppDelta = userColor === 'white' ? deltas.black : userColor === 'black' ? deltas.white : null;
  const acctDelta = userColor === 'white' ? deltas.white : userColor === 'black' ? deltas.black : null;
  const oppColorChip = userColor === 'white' ? 'black' : userColor === 'black' ? 'white' : null;

  const icons = computeIcons(deps.reviewState, deps.icons ?? {});
  const tacticIcons = icons.filter(icon => icon.cls === '--missed-tactic' || icon.cls === '--missed-mate');







  return h('div.grr', {
    class: { selected: deps.selected, open: deps.open === true },
    on:    { click: (e: MouseEvent) => deps.onSelectRow?.(game, e) },
  }, [





    renderThumbnail(game, resultCls, userColor === 'black'),
    h('div.grr__body', [
      renderMatchupGrid(
        { variant: 'opponent', name: opponentLabel(game, userColor), rating: oppRating,
          color: oppColorChip, delta: oppDelta, accuracy: deps.accuracy?.opp },
        { variant: 'account', name: accountLabel(game, userColor) ?? '–', rating: acctRating,
          color: userColor, delta: acctDelta, accuracy: deps.accuracy?.user },
      ),
      h('hr.grr__hairline'),
      renderOpeningLine(game),
      renderRichChipsRow(deps.reviewState, tacticIcons, deps.addLibrary),
    ]),
    // Rail zones (owner request 2026-07-05): time class anchored top, review control (all
    // states share this slot) vertically centered, played date/time anchored bottom.
    h('div.grr__rail', [
      renderRailTimeClass(game, extras),
      h('div.grr__review-group', [
        renderReviewControl(deps.reviewState, deps.reviewOpts),
        renderSecondaryActions(deps.secondaryActions ?? []),
      ]),
      renderRailMeta(game, extras, deps.sourceUrl),
    ]),
  ]);
}
