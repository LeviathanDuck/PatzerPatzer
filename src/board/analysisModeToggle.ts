















import { h, type VNode } from 'snabbdom';
import { INITIAL_FEN } from 'chessops/fen';
import type { OpponentsTreeUrlState } from '../openings/urlState';

/** Surfaces that can hand off into an ad-hoc Analysis-mode board. */
export type AnalysisModeSurfaceId = 'opening-tree' | 'puzzle-round' | 'orp-drill';

/**
 * Session-only, single-slot snapshot of the surface a toggle-ON navigated away from. Never
 * persisted (design doc §6.4 — none of these surfaces persist mid-session state today, so the
 * toggle doesn't invent a new persistence tier). `resumeState` is opaque per surface — never
 * inspected generically outside the surface that produced it (design doc §6.2).
 */
export interface AnalysisModeSnapshot<TResumeState = unknown> {
  surfaceId: AnalysisModeSurfaceId;
  /** Hash route to restore on exit, captured verbatim before navigating away. */
  priorRoute: string;
  resumeState: TResumeState;
  capturedAt: number;
}

/**
 * Opening Tree's resume payload is its own existing OpponentsTreeUrlState shape — reused, not
 * reinvented (design doc §6.2: "this already exists — reuse it, don't reinvent it").
 */
export type OpeningTreeAnalysisModeSnapshot = AnalysisModeSnapshot<OpponentsTreeUrlState>;

let _snapshot: AnalysisModeSnapshot | null = null;

/**
 * True while the currently-open Analysis board originated from a surface toggle. Drives the
 * active-toggle rendering on the analysis-side nav bar (main.ts wiring).
 */
export function analysisModeSnapshotActive(): boolean {
  return _snapshot !== null;
}

/** Which surface the active snapshot (if any) came from — null when no toggle is active. */
export function activeAnalysisModeSurfaceId(): AnalysisModeSurfaceId | null {
  return _snapshot?.surfaceId ?? null;
}

/**
 * Toggle-OFF: consumes (clears) the snapshot and returns its prior route, or null if there is
 * nothing to restore (never toggled in, or already invalidated — design doc §6.5). One-shot: a
 * snapshot is used exactly once, matching the "session-only, in-memory" storage decision (§6.4).
 */
export function consumeAnalysisModePriorRoute(): string | null {
  const snapshot = _snapshot;
  _snapshot = null;
  return snapshot?.priorRoute ?? null;
}

/**
 * Discards the snapshot without restoring — the staleness rules in design doc §6.5: a hash edit
 * or browser back/forward that leaves the ad-hoc Analysis board other than through the toggle-off
 * control invalidates the "return anchor," since it no longer applies. Safe to call when no
 * snapshot is active (no-op).
 */
export function invalidateAnalysisModeSnapshot(): void {
  _snapshot = null;
}

export interface AnalysisModeEntryInput<TResumeState = unknown> {
  surfaceId: AnalysisModeSurfaceId;
  /** Hash route to restore on exit, captured verbatim by the calling surface before this call. */
  priorRoute: string;
  resumeState: TResumeState;
  /** Root FEN the PGN-from-path movetext is built from (design doc §7). */
  rootFen: string;
  /** SAN moves from rootFen to the surface's current position. */
  sans: readonly string[];
}

/**
 * Toggle-ON, shared across surfaces: captures the return snapshot and builds the PGN to seed
 * Analysis with. Does not navigate — the calling surface already owns its own navigate/redraw
 * wiring (e.g. src/openings/view.ts invoking the injected seed-analysis handoff) and its own
 * background-work pause (e.g. the tree's cancelTreeEval()/markNav() calls, design doc §7); this
 * function only owns the parts every surface would otherwise reimplement identically.
 */
export function enterAnalysisMode(input: AnalysisModeEntryInput): { pgn: string } {
  _snapshot = {
    surfaceId: input.surfaceId,
    priorRoute: input.priorRoute,
    resumeState: input.resumeState,
    capturedAt: Date.now(),
  };
  return { pgn: buildAnalysisModePgnFromPath(input.rootFen, input.sans) };
}

// --- PGN-from-path builder (design doc §7) ---

/**
 * Builds SAN movetext from rootFen, honoring a non-white-to-move / non-move-1 root (Puzzle/ORP
 * rows can start mid-game, design doc §7) with the standard "N..." Black-first token.
 */
function movetextFromPath(rootFen: string, sans: readonly string[]): string {
  if (sans.length === 0) return '';
  const fenParts = rootFen.split(' ');
  const blackToMove = fenParts[1] === 'b';
  let fullmove = parseInt(fenParts[5] ?? '1', 10);
  if (!Number.isFinite(fullmove) || fullmove < 1) fullmove = 1;
  const tokens: string[] = [];
  for (let i = 0; i < sans.length; i++) {
    const isWhiteMove = blackToMove ? i % 2 === 1 : i % 2 === 0;
    if (isWhiteMove) tokens.push(`${fullmove}.`);
    else if (i === 0) tokens.push(`${fullmove}...`);
    tokens.push(sans[i]!);
    if (!isWhiteMove) fullmove++;
  }
  return tokens.join(' ');
}

/**
 * Minimal PGN carrying full SAN movetext for a path from a root FEN, so a toggle-ON hands
 * Analysis a real line, not a bare position (design doc §7 — "not just FEN"). Header shape
 * mirrors src/editor/ctrl.ts buildFromPositionPgn (the Board Editor's from-position, no-movetext
 * handoff); this sibling builder always carries movetext, so it lives here rather than folding a
 * movetext branch into that unrelated module.
 */
export function buildAnalysisModePgnFromPath(rootFen: string, sans: readonly string[]): string {
  const headers = [
    '[Event "Analysis Mode"]',
    '[Site "?"]',
    '[Date "????.??.??"]',
    '[Round "?"]',
    '[White "?"]',
    '[Black "?"]',
    '[Result "*"]',
  ];
  if (rootFen !== INITIAL_FEN) headers.push(`[FEN "${rootFen}"]`, '[SetUp "1"]');
  const movetext = movetextFromPath(rootFen, sans);
  return [...headers, '', movetext.length > 0 ? `${movetext} *` : '*'].join('\n');
}

// --- Shared toggle button (design doc §9) ---






const ANALYSIS_MODE_MARK_SVG =
  '<svg viewBox="0 0 1024 1024" fill="none" stroke-linecap="round" stroke-linejoin="round">'
  + '<circle cx="438" cy="418" r="228" stroke="#F3F4EF" stroke-width="86"/>'
  + '<path d="M608 590 L780 762" stroke="#F3F4EF" stroke-width="86"/>'
  + '<path d="M344 438 L438 532 L594 356" stroke="#42BDA8" stroke-width="84"/>'
  + '</svg>';

/**
 * Cross-surface "Analysis mode" toggle button (design doc §9). Reuses the existing `.fbt` nav-
 * bar icon-button family (book/hamburger, src/styles/main.scss) and the `.grr__review-mark`
 * sizing rule that already scopes this SVG to 15x15 — no new SCSS this slice. One render helper
 * shared by every surface's mount point (tree now; puzzles/ORP, CCW-H09/H10, later) so the mark
 * markup lives in exactly one place.
 */
export function renderAnalysisModeToggleButton(active: boolean, onClick: () => void): VNode {
  const title = active ? 'Exit Analysis mode' : 'Enter Analysis mode';
  return h('button.fbt.analysis-mode-toggle', {
    class: { active },
    attrs: { type: 'button', title, 'aria-label': title, 'aria-pressed': String(active) },
    on: { click: onClick },
  }, [
    h('span.grr__review-mark', {
      attrs: { 'aria-hidden': 'true' },
      props: { innerHTML: ANALYSIS_MODE_MARK_SVG },
    }),
  ]);
}
