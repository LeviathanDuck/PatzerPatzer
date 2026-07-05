










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

function formatMovePreview(sanMoves: string[]): string {
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
  iso:        string | null;
  sourceLabel: string | null;
}

export interface GameExtras {
  ratingDiff:      { white: number | null; black: number | null };
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
    return { display: `${timeLabel} · ${dateLabel}`, iso: parsed.iso, sourceLabel: sourcePlatformLabel(game) };
  }

  // No parseable game time: fall back to a readable date-only label (never a bare ISO string).
  const dateOnly = game.date ? game.date.slice(0, 10) : null;
  if (dateOnly) {
    const d = new Date(`${dateOnly}T00:00:00Z`);
    const dateLabel = Number.isNaN(d.getTime())
      ? dateOnly
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    return { display: dateLabel, iso: null, sourceLabel: sourcePlatformLabel(game) };
  }

  return { display: '–', iso: null, sourceLabel: null };
}

function computeGameExtras(game: ImportedGame): GameExtras {
  return {
    ratingDiff: {
      white: parseRatingDiff(game.pgn, 'WhiteRatingDiff'),
      black: parseRatingDiff(game.pgn, 'BlackRatingDiff'),
    },
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

// ---------------------------------------------------------------------------
// Board thumbnail — CSS grid of 64 squares using the current piece set's existing CSS custom
// properties (---white-pawn etc., set on <body> by applyPieceSet in board/cosmetics.ts), NOT a
// Chessground instance. Populated lazily: the Snabbdom vnode only renders an empty grid
// container; an IntersectionObserver installed in the insert hook calls thumbnailFen() and
// builds the squares via direct DOM writes only once the row actually scrolls into view, so
// offscreen rows never parse PGN (CR-2/CR-4).
// ---------------------------------------------------------------------------

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

// rows[0] = rank 8 ... rows[7] = rank 1 (standard FEN row order).
function populateThumbnailGrid(container: HTMLElement, fen: string, flipped: boolean): void {
  const rows = expandFenBoard(fen);
  const frag = document.createDocumentFragment();

  for (let displayRow = 0; displayRow < 8; displayRow++) {
    for (let displayCol = 0; displayCol < 8; displayCol++) {
      const rankIdx = flipped ? 7 - displayRow : displayRow;
      const fileIdx = flipped ? 7 - displayCol : displayCol;
      const rankNumber = 8 - rankIdx; // 1..8

      const square = document.createElement('div');
      const isDark = (fileIdx + rankNumber) % 2 === 0;
      square.className = `grr__thumb-sq ${isDark ? '--dark' : '--light'}`;

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
      return h('button.grr__review.--unreviewed', {
        attrs: { type: 'button', title: 'Queue for background review' },
        on:    { click: (e: Event) => stopAnd(e, opts.onReview) },
      }, 'Review');

    case 'queued':
      return h('span.grr__review.--queued', {
        attrs: { title: `Queued for Bulk Review — wave ${state.wave} of ${state.totalWaves}` },
      }, `⏲ Queued · wave ${state.wave} of ${state.totalWaves}`);

    case 'running':
      return h('div.grr__review.--running', { attrs: { title: 'Analyzing…' } }, [
        h('div.grr__review-fill', { style: { width: `${Math.max(0, Math.min(100, state.percent))}%` } }),
        h('span.grr__review-label', `Analyzing · ${Math.round(state.percent)}%`),
      ]);

    case 'failed':
      return h('div.grr__review.--failed', [
        h('span.grr__review-label', { attrs: { title: 'Review failed' } },
          state.attempts !== undefined ? `⚠ Review failed (${state.attempts})` : '⚠ Review failed'),
        h('button.grr__review-retry', {
          attrs: { type: 'button', title: 'Retry review' },
          on:    { click: (e: Event) => stopAnd(e, opts.onRetry) },
        }, 'Retry'),
        h('button.grr__review-skip', {
          attrs: { type: 'button', title: 'Skip this game' },
          on:    { click: (e: Event) => stopAnd(e, opts.onSkip) },
        }, 'Skip'),
      ]);

    case 'reviewed':



      return h('button.grr__review.--reviewed', {
        attrs: { type: 'button', title: 'Open stored review' },
        on:    { click: (e: Event) => stopAnd(e, opts.onOpenReview) },
      }, opts.compact ? ['✓', h('span.grr__review-collapse', ' Reviewed')] : '✓ Open review');

    case 'stalled':
      return h('button.grr__review.--stalled', {
        attrs: { type: 'button', title: 'Review appears stalled — click to resume' },
        on:    { click: (e: Event) => stopAnd(e, opts.onResume) },
      }, '⚠ Stalled — resume?');

    case 'incomplete':
      return h('button.grr__review.--incomplete', {
        attrs: { type: 'button', title: 'Review incomplete — click to resume' },
        on:    { click: (e: Event) => stopAnd(e, opts.onResume) },
      }, '◐ Resume review');

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
    icons.push({ cls: '--failed', glyph: '⚠', title: 'Review failed' });
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

// ---------------------------------------------------------------------------
// Player blocks — opponent always first, imported account always second. No color tint on the
// account's username; a color chip next to each name shows the color that player had.
// ---------------------------------------------------------------------------

interface PlayerBlockOpts {
  variant:  'opponent' | 'account';
  name:     string;
  rating:   number | undefined;
  color:    'white' | 'black' | null;
  delta:    number | null;
  accuracy: number | null | undefined;
}

function renderPlayerBlock(opts: PlayerBlockOpts): VNode {
  const deltaNode = opts.delta !== null
    ? h('span.grr__delta', { class: { '--gain': opts.delta > 0, '--loss': opts.delta < 0 } }, formatDelta(opts.delta))
    : null;

  return h('div.grr__player.--' + opts.variant, [
    h('div.grr__player-line', [
      h('span.grr__player-name', opts.name),
      opts.rating !== undefined ? h('span.grr__player-rating', String(opts.rating)) : null,
      deltaNode,
      opts.color ? h('span.color-chip.--' + opts.color) : null,
    ]),
    opts.accuracy !== null && opts.accuracy !== undefined
      ? h('div.grr__accuracy', `accuracy ${Math.round(opts.accuracy)}%`)
      : null,
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
// Opening line — opening name (semibold) + first ~5 mainline SAN moves + total move count.
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

function renderMetaRow(game: ImportedGame, extras: GameExtras): VNode {
  const icon = (game.timeClass ? TIME_CLASS_ICON[game.timeClass] : undefined) ?? NO_CLOCK_ICON;
  const label = game.timeClass
    ? game.timeClass.charAt(0).toUpperCase() + game.timeClass.slice(1)
    : 'Study import · No clock';
  const ratedLabel = extras.rated === true ? 'Rated' : extras.rated === false ? 'Casual' : null;
  const tooltip = [extras.timestamp.iso, extras.timestamp.sourceLabel].filter(Boolean).join(' · ');

  return h('div.grr__meta', [
    h('span.grr__tc-icon.' + icon.cls, { attrs: { 'data-icon': icon.glyph, title: label } }),
    h('span.grr__tc-label', label),
    extras.timeControlLabel ? h('span.grr__tc-control', extras.timeControlLabel) : null,
    ratedLabel ? h('span.grr__rated.' + (ratedLabel === 'Rated' ? '--rated' : '--casual'), ratedLabel) : null,
    h('span.grr__timestamp', { attrs: { title: tooltip || extras.timestamp.display } }, extras.timestamp.display),
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
  const oppDelta = userColor === 'white' ? extras.ratingDiff.black : userColor === 'black' ? extras.ratingDiff.white : null;
  const acctDelta = userColor === 'white' ? extras.ratingDiff.white : userColor === 'black' ? extras.ratingDiff.black : null;
  const oppColorChip = userColor === 'white' ? 'black' : userColor === 'black' ? 'white' : null;

  const icons = computeIcons(deps.reviewState, deps.icons ?? {});

  return h('div.grr', {
    class: { selected: deps.selected },
    on:    { click: (e: MouseEvent) => deps.onSelectRow?.(game, e) },
  }, [
    renderThumbnail(game, resultCls, userColor === 'black'),
    h('div.grr__body', [
      h('div.grr__players', [
        renderPlayerBlock({
          variant: 'opponent', name: opponentLabel(game, userColor), rating: oppRating,
          color: oppColorChip, delta: oppDelta, accuracy: deps.accuracy?.opp,
        }),
        renderPlayerBlock({
          variant: 'account', name: accountLabel(game, userColor) ?? '–', rating: acctRating,
          color: userColor, delta: acctDelta, accuracy: deps.accuracy?.user,
        }),
      ]),
      renderOpeningLine(game),
      h('div.grr__footer', [
        renderTagArea(deps.reviewState, deps.tags ?? {}, deps.addLibrary),
        renderMetaRow(game, extras),
      ]),
    ]),
    h('div.grr__side', [
      icons.length > 0
        ? h('div.grr__icons', icons.map(icon => h('span.grr__icon.' + icon.cls, { attrs: { title: icon.title } }, icon.glyph)))
        : null,
      h('div.grr__review-group', [
        renderReviewControl(deps.reviewState, deps.reviewOpts),
        renderSecondaryActions(deps.secondaryActions ?? []),
      ]),
    ]),
  ]);
}
