

























import { h, type VNode } from 'snabbdom';
import {
  buildCanonicalReviewAuditSnapshot,
  type AuditSnapshot,
} from './auditSnapshot';
import {
  compareSnapshotToLichess,
  normalizeLichessJsonExport,
  normalizeLichessPgnExport,
  renderComparisonReportMarkdown,
  type ComparisonReport,
  type LichessNormalizedGame,
} from './lichessCompare';
import { loadAnalysisFromIdb } from '../idb';
import { getRemoteSyncToken } from '../sync/remoteSync';

// ─────────────────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────────────────

interface ClosedState { phase: 'closed' }
interface FetchingState { phase: 'fetching'; gameId: string; pgn: string }
interface ComparingState { phase: 'comparing'; gameId: string; pgn: string }
interface PasteState {
  phase: 'paste';
  gameId: string;
  pgn: string;
  text: string;
  note?: string;
  error?: string;
}
interface ImportingState { phase: 'importing'; gameId: string; pgn: string }
interface ImportedState {
  phase: 'imported';
  gameId: string;
  pgn: string;
  lichessId: string;
  lichessUrl: string;
}
interface ReportState {
  phase: 'report';
  gameId: string;
  pgn: string;
  lichessId?: string;
  report: ComparisonReport;
  markdown: string;
}
interface ErrorState {
  phase: 'error';
  gameId: string;
  pgn: string;
  title: string;
  message: string;
  canPaste: boolean;
}

type LichessCompareState =
  | ClosedState
  | FetchingState
  | ComparingState
  | PasteState
  | ImportingState
  | ImportedState
  | ReportState
  | ErrorState;

// Session-only map from Patzer gameId to the game imported on Lichess for it, so re-opening the
// panel (or the "no analysis yet" retry) goes straight to fetch instead of re-importing. Never
// persisted (no IDB/sync writes in this panel's v1 scope).
const _importedGames = new Map<string, { id: string; url: string }>();

let _state: LichessCompareState = { phase: 'closed' };
let _redraw: (() => void) | null = null;





let _requestToken = 0;

function setState(next: LichessCompareState): void {
  _state = next;
  _redraw?.();
}

function guardedSetState(token: number, next: LichessCompareState): void {
  if (token !== _requestToken) return; // superseded -- stale-drop, do not resurrect a closed/replaced session.
  setState(next);
}

export function isLichessComparePanelOpen(): boolean {
  return _state.phase !== 'closed';
}

export function closeLichessCompareFlow(): void {
  _requestToken++;
  setState({ phase: 'closed' });
  _redraw = null;
}

export function openLichessCompareFlow(input: { gameId: string; pgn: string; redraw: () => void }): void {
  _redraw = input.redraw;
  const token = ++_requestToken;
  const { gameId, pgn } = input;
  if (gameId.startsWith('lichess:')) {
    setState({ phase: 'fetching', gameId, pgn });
    void runLichessFetchFlow(gameId, pgn, gameId.slice('lichess:'.length), token);
    return;
  }
  const imported = _importedGames.get(gameId);
  if (imported) {
    setState({ phase: 'imported', gameId, pgn, lichessId: imported.id, lichessUrl: imported.url });
  } else {
    setState({ phase: 'paste', gameId, pgn, text: '' });
  }
}

function openPasteFallback(gameId: string, pgn: string, note: string | undefined, token: number): void {
  guardedSetState(token, { phase: 'paste', gameId, pgn, text: '', ...(note !== undefined ? { note } : {}) });
}






async function runLichessFetchFlow(gameId: string, pgn: string, lichessId: string, token: number): Promise<void> {
  let data: unknown;
  try {
    const response = await fetch(`https://lichess.org/game/export/${lichessId}?evals=true`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      openPasteFallback(
        gameId, pgn,
        `Could not fetch Lichess analysis (HTTP ${response.status}). Paste a Lichess PGN export with evals instead.`,
        token,
      );
      return;
    }
    data = await response.json();
  } catch (error) {
    openPasteFallback(
      gameId, pgn,
      `Network error fetching Lichess analysis (${errorMessage(error)}). Paste a Lichess PGN export with evals instead.`,
      token,
    );
    return;
  }

  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  if (!Array.isArray(record.analysis)) {
    guardedSetState(token, {
      phase: 'error',
      gameId,
      pgn,
      title: 'No Lichess analysis',
      message:
        'This game has no Lichess server analysis. Request Computer Analysis for it on lichess.org, ' +
        'then re-run this check -- or paste a Lichess PGN export with evals below.',
      canPaste: true,
    });
    return;
  }

  let normalized: LichessNormalizedGame;
  try {
    normalized = normalizeLichessJsonExport(data);
  } catch (error) {
    openPasteFallback(
      gameId, pgn,
      `Could not parse the Lichess export (${errorMessage(error)}). Paste a Lichess PGN export with evals instead.`,
      token,
    );
    return;
  }

  await runComparePipeline(gameId, pgn, normalized, lichessId, token);
}








const BOOK_IMPORT_RELAY_ENDPOINT = '/api/patzer-sync/book-import.php';
const LICHESS_IMPORT_URL = 'https://lichess.org/api/import';

function parseImportResponse(data: unknown): { id: string; url: string } {
  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id.trim() : '';
  if (!id) throw new Error('Lichess import response did not include a game id.');
  const url = typeof record.url === 'string' && record.url.trim() ? record.url : `https://lichess.org/${id}`;
  return { id, url };
}

async function importViaRelay(pgn: string, syncToken: string): Promise<{ id: string; url: string } | null> {
  let response: Response;
  try {
    response = await fetch(BOOK_IMPORT_RELAY_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${syncToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ pgn }),
    });
  } catch {
    return null; // relay unreachable — fall back to anonymous import.
  }
  if (!response.ok) return null; // not connected / expired / upstream failure — fall back.
  try {
    return parseImportResponse(await response.json());
  } catch {
    return null;
  }
}

async function importAnonymously(pgn: string): Promise<{ id: string; url: string }> {
  const response = await fetch(LICHESS_IMPORT_URL, {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({ pgn }),
  });
  if (!response.ok) throw new Error(`Lichess import failed (HTTP ${response.status}).`);
  return parseImportResponse(await response.json());
}

export function startSendToLichess(): void {
  const state = _state;
  if (state.phase !== 'paste' && state.phase !== 'error') return;
  const { gameId, pgn } = state;
  const token = _requestToken;
  guardedSetState(token, { phase: 'importing', gameId, pgn });
  void runImportFlow(gameId, pgn, token);
}

async function runImportFlow(gameId: string, pgn: string, token: number): Promise<void> {
  const syncToken = getRemoteSyncToken().trim();
  const localDevHost = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.hostname === '[::1]'
    || window.location.hostname === '::1';

  let imported: { id: string; url: string };
  try {
    const viaRelay = syncToken && !localDevHost ? await importViaRelay(pgn, syncToken) : null;
    imported = viaRelay ?? await importAnonymously(pgn);
  } catch (error) {
    openPasteFallback(
      gameId, pgn,
      `Could not send the game to Lichess (${errorMessage(error)}). Paste a Lichess PGN export with evals instead.`,
      token,
    );
    return;
  }

  _importedGames.set(gameId, imported);
  if (token === _requestToken) window.open(imported.url, '_blank', 'noopener');
  guardedSetState(token, {
    phase: 'imported',
    gameId,
    pgn,
    lichessId: imported.id,
    lichessUrl: imported.url,
  });
}

export function fetchImportedAnalysis(): void {
  const state = _state;
  if (state.phase !== 'imported' && state.phase !== 'error' && state.phase !== 'paste') return;
  const imported = _importedGames.get(state.gameId);
  if (!imported) return;
  const token = _requestToken;
  guardedSetState(token, { phase: 'fetching', gameId: state.gameId, pgn: state.pgn });
  void runLichessFetchFlow(state.gameId, state.pgn, imported.id, token);
}

// ─────────────────────────────────────────────────────────────────────────────
// Paste fallback (L2)
// ─────────────────────────────────────────────────────────────────────────────

export function updatePasteText(text: string): void {
  if (_state.phase !== 'paste') return;
  _state.text = text;
}

export function submitPaste(): void {
  const state = _state;
  if (state.phase !== 'paste') return;
  const { gameId, pgn, text } = state;
  if (!text.trim()) {
    setState({ ...state, error: 'Paste a Lichess PGN export with [%eval] comments first.' });
    return;
  }
  let normalized: LichessNormalizedGame;
  try {
    normalized = normalizeLichessPgnExport(text);
  } catch (error) {
    setState({ ...state, error: errorMessage(error) });
    return;
  }
  void runComparePipeline(gameId, pgn, normalized, undefined, _requestToken);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared comparison pipeline (both L1 and L2 converge here)
// ─────────────────────────────────────────────────────────────────────────────

async function runComparePipeline(
  gameId: string,
  pgn: string,
  lichessNormalized: LichessNormalizedGame,
  lichessId: string | undefined,
  token: number,
): Promise<void> {
  guardedSetState(token, { phase: 'comparing', gameId, pgn });
  try {
    const storedAnalysis = (await loadAnalysisFromIdb(gameId)) ?? null;
    const snapshot: AuditSnapshot = await buildCanonicalReviewAuditSnapshot({ gameId, pgn, storedAnalysis });
    const report = await compareSnapshotToLichess(snapshot, lichessNormalized);

    if (report.verdict === 'identity-mismatch') {
      guardedSetState(token, {
        phase: 'error',
        gameId,
        pgn,
        title: 'Movelist mismatch',
        message:
          'The Lichess game does not match this game\'s move sequence' +
          (report.identity.firstDivergentPly !== undefined
            ? ` (first divergent ply: ${report.identity.firstDivergentPly}).`
            : '.'),
        canPaste: true,
      });
      return;
    }

    guardedSetState(token, {
      phase: 'report',
      gameId,
      pgn,
      ...(lichessId !== undefined ? { lichessId } : {}),
      report,
      markdown: renderComparisonReportMarkdown(report),
    });
  } catch (error) {
    guardedSetState(token, {
      phase: 'error',
      gameId,
      pgn,
      title: 'Comparison failed',
      message: errorMessage(error),
      canPaste: true,
    });
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ─────────────────────────────────────────────────────────────────────────────
// Report actions (Copy / Download) -- the two allowed non-h() DOM touches
// ─────────────────────────────────────────────────────────────────────────────

function copyReportMarkdown(markdown: string): void {
  navigator.clipboard.writeText(markdown).catch(() => {});
}

function downloadReportJson(report: ComparisonReport): void {
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.gameId.replace(/[^a-zA-Z0-9_-]/g, '_')}_lichess-compare.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// View
// ─────────────────────────────────────────────────────────────────────────────

export function renderLichessComparePanel(): VNode | null {
  switch (_state.phase) {
    case 'closed':
      return null;
    case 'fetching':
      return renderBusyPanel('Fetching Lichess analysis…');
    case 'comparing':
      return renderBusyPanel('Comparing…');
    case 'importing':
      return renderBusyPanel('Sending game to Lichess…');
    case 'imported':
      return renderImportedPanel(_state);
    case 'paste':
      return renderPastePanel(_state);
    case 'error':
      return renderErrorPanel(_state);
    case 'report':
      return renderReportPanel(_state);
  }
}

function renderBusyPanel(label: string): VNode {
  return h('div.lichess-compare__busy', [
    h('div.lichess-compare__spinner'),
    h('p.lichess-compare__busy-label', label),
  ]);
}

function renderPastePanel(state: PasteState): VNode {
  const imported = _importedGames.get(state.gameId);
  return h('div.lichess-compare__paste', [
    state.note ? h('p.lichess-compare__note', state.note) : null,
    h('p.lichess-compare__desc',
      'Send this game to Lichess to request its computer analysis there, or paste a Lichess PGN export with evals (Lichess game page → Download → PGN, with evaluations) below.'),
    h('textarea.lichess-compare__textarea', {
      attrs: { rows: 10, placeholder: '[Event "?"]\n\n1. e4 { [%eval 0.2] } e5 ...' },
      on: { input: (e: Event) => updatePasteText((e.target as HTMLTextAreaElement).value) },
    }),
    state.error ? h('p.lichess-compare__error', state.error) : null,
    h('div.lichess-compare__actions', [
      imported
        ? h('button.lichess-compare__btn', { on: { click: () => fetchImportedAnalysis() } }, 'Fetch analysis & compare')
        : h('button.lichess-compare__btn', { on: { click: () => startSendToLichess() } }, 'Send to Lichess'),
      h('button.lichess-compare__btn', { on: { click: () => submitPaste() } }, 'Compare'),
      h('button.lichess-compare__btn.lichess-compare__btn--ghost', { on: { click: () => closeLichessCompareFlow() } }, 'Cancel'),
    ]),
  ].filter((n): n is VNode => n !== null));
}

function renderImportedPanel(state: ImportedState): VNode {
  return h('div.lichess-compare__paste', [
    h('p.lichess-compare__desc',
      'Game sent to Lichess. On the Lichess game page, click "Request computer analysis" (you must be signed in on lichess.org), wait for the analysis to finish, then fetch it here. Note: Lichess imported games are public.'),
    h('p.lichess-compare__note', [
      h('a.lichess-compare__open-link', {
        attrs: { href: state.lichessUrl, target: '_blank', rel: 'noopener' },
      }, 'Open on Lichess ↗'),
    ]),
    h('div.lichess-compare__actions', [
      h('button.lichess-compare__btn', { on: { click: () => fetchImportedAnalysis() } }, 'Fetch analysis & compare'),
      h('button.lichess-compare__btn.lichess-compare__btn--ghost', {
        on: { click: () => openPasteFallback(state.gameId, state.pgn, undefined, _requestToken) },
      }, 'Paste export instead'),
      h('button.lichess-compare__btn.lichess-compare__btn--ghost', { on: { click: () => closeLichessCompareFlow() } }, 'Cancel'),
    ]),
  ]);
}

function renderErrorPanel(state: ErrorState): VNode {
  const isLichessGame = state.gameId.startsWith('lichess:');
  const imported = _importedGames.get(state.gameId);
  return h('div.lichess-compare__error-panel', [
    h('h3', state.title),
    h('p', state.message),
    imported
      ? h('p.lichess-compare__note', [
          h('a.lichess-compare__open-link', {
            attrs: { href: imported.url, target: '_blank', rel: 'noopener' },
          }, 'Open on Lichess ↗'),
        ])
      : null,
    h('div.lichess-compare__actions', [
      imported
        ? h('button.lichess-compare__btn', { on: { click: () => fetchImportedAnalysis() } }, 'Fetch again')
        : null,
      !imported && !isLichessGame && state.canPaste
        ? h('button.lichess-compare__btn', { on: { click: () => startSendToLichess() } }, 'Send to Lichess')
        : null,
      state.canPaste
        ? h('button.lichess-compare__btn', {
            on: { click: () => openPasteFallback(state.gameId, state.pgn, undefined, _requestToken) },
          }, 'Paste export instead')
        : null,
      h('button.lichess-compare__btn.lichess-compare__btn--ghost', { on: { click: () => closeLichessCompareFlow() } }, 'Close'),
    ].filter((n): n is VNode => n !== null)),
  ].filter((n): n is VNode => n !== null));
}

// Judged-ply vocabulary shared by both sides for the Mistake moments comparison below.
const PATZER_JUDGED_LABELS: ReadonlySet<string> = new Set(['inaccuracy', 'mistake', 'blunder']);
const LICHESS_JUDGED_TERMS: ReadonlySet<string> = new Set(['inaccuracy', 'mistake', 'blunder']);

function isJudgedMomentRow(row: ComparisonReport['topDivergentRows'][number]): boolean {
  const patzerJudged = row.patzerLabel !== undefined && PATZER_JUDGED_LABELS.has(row.patzerLabel);
  const lichessJudged = row.lichessJudgment !== undefined && LICHESS_JUDGED_TERMS.has(row.lichessJudgment.toLowerCase());
  return patzerJudged || lichessJudged;
}

function renderReportPanel(state: ReportState): VNode {
  const { report, markdown } = state;

  return h('div.lichess-compare__report', [
    h('div.lichess-compare__header', [
      h('div.lichess-compare__verdict', `Verdict: ${report.verdict}`),
      h('div.lichess-compare__stats', [
        h('span.lichess-compare__stat', `Coverage: ${(report.coverage.coverageRatio * 100).toFixed(0)}%`),
        h('span.lichess-compare__stat',
          `Median |Δcp|: ${report.evalAgreement.medianAbsDeltaCp !== undefined ? report.evalAgreement.medianAbsDeltaCp : 'n/a'}`),
        h('span.lichess-compare__stat',
          `Median |Δwin%|: ${report.evalAgreement.medianAbsDeltaWinPct !== undefined ? report.evalAgreement.medianAbsDeltaWinPct.toFixed(1) : 'n/a'}`),
        h('span.lichess-compare__stat',
          `Best-move match: ${report.bestMoveAgreement.exactRate !== undefined ? `${(report.bestMoveAgreement.exactRate * 100).toFixed(0)}%` : 'n/a'}`),
      ]),
      state.lichessId !== undefined
        ? h('a.lichess-compare__open-link', {
            attrs: { href: `https://lichess.org/${state.lichessId}`, target: '_blank', rel: 'noopener' },
          }, 'Open on Lichess ↗')
        : null,
    ].filter((n): n is VNode => n !== null)),

    renderMistakeMoments(report),

    h('h3', 'Full report'),
    h('pre.lichess-compare__markdown', markdown),

    h('div.lichess-compare__actions', [
      h('button.lichess-compare__btn', { on: { click: () => copyReportMarkdown(markdown) } }, 'Copy report'),
      h('button.lichess-compare__btn', { on: { click: () => downloadReportJson(report) } }, 'Download JSON'),
      h('button.lichess-compare__btn.lichess-compare__btn--ghost', { on: { click: () => closeLichessCompareFlow() } }, 'Close'),
    ]),
  ]);
}








function renderMistakeMoments(report: ComparisonReport): VNode {
  const rows = report.topDivergentRows.filter(isJudgedMomentRow);

  return h('div.lichess-compare__mistake-moments', [
    h('h3', 'Mistake moments'),
    rows.length === 0
      ? h('p.lichess-compare__empty',
          'No judged plies among the top divergent rows captured in this report (a full per-ply diff is not part of the v1 comparator output).')
      : h('ul.lichess-compare__mistake-list', rows.map(row => {
          const fullMoveNumber = Math.ceil(row.ply / 2);
          const side = row.ply % 2 === 1 ? 'white' : 'black';
          const patzerLabel = row.patzerLabel ?? 'none';
          const lichessJudgment = row.lichessJudgment ?? 'none';
          const agree = patzerLabel.toLowerCase() === lichessJudgment.toLowerCase();
          return h('li.lichess-compare__mistake-row', {
            class: {
              'lichess-compare__mistake-row--agree': agree,
              'lichess-compare__mistake-row--disagree': !agree,
            },
          }, [
            h('span.lichess-compare__mistake-move', `${fullMoveNumber}${side === 'white' ? '.' : '…'} ${row.san}`),
            h('span.lichess-compare__mistake-patzer', `Patzer: ${patzerLabel}`),
            h('span.lichess-compare__mistake-lichess', `Lichess: ${lichessJudgment}`),
          ]);
        })),
  ]);
}
