






























































































import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs, renderDisabledControlExplainer } from '../ui/controlExplainer';
import { navIcon } from './navIcons';
import { clearSelection, selectAllDisplayed } from './studyCtrl';
import { getStudy, getPracticeLine } from './studyDb';
import { pgnToTree } from '../tree/pgn';
import { mainlineNodeList } from '../tree/ops';
import { saveOrpLineToLibrary, deriveOrpStudyItemId, deriveOrpSequenceId } from './saveAction';
import type { OrpSourceProvenance } from './types';

// The standard opening starting position, in chessops `makeFen` canonical form — identical to
// saveAction.ts's `START_FEN`, which `saveOrpLineToLibrary` replays every UCI from. `pgnToTree`
// stamps this exact string as the root node's `fen` for a standard-start game (src/tree/pgn.ts's
// `pgnGameToTree`), so a strict string compare reliably detects a non-standard root.
const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

// Same 3-move floor `saveOrpLineToLibrary` enforces (a line shorter than this is not drillable);
// checked here first so a too-short item is reported as such rather than as a generic write failure.
const MIN_ORP_MOVES = 3;

// Cooperative-yield cadence for a large select-all-in-scope run (CR-1/CR-5). One `getStudy` +
// parse + save per record is cheap, but an unbounded synchronous loop over 30k ids would still
// stall the frame; yielding to the event loop periodically keeps the UI responsive.
const YIELD_EVERY = 25;

type SkipReason = 'not-found' | 'non-standard-start' | 'malformed-headers' | 'too-short' | 'unreadable' | 'error';

interface BulkAddResult {
  /** Newly written ORP lines this run. */
  readonly added: number;
  /** Lines whose deterministic id already existed (in IDB or earlier this batch) — write skipped. */
  readonly alreadyPresent: number;
  /** Total skipped (sum of `skipByReason`). Distinct from `alreadyPresent`. */
  readonly skipped: number;
  readonly skipByReason: Readonly<Record<SkipReason, number>>;
  /** Source ids whose save threw — retained as the post-run selection for retry (finding 2). */
  readonly failedIds: readonly string[];
}

/** Injectable persistence seams (same pattern as saveAction.ts's `OrpSaveDeps`) so the orchestration
 *  is unit-testable without IndexedDB. Defaults are the real functions. */
export interface BulkAddToOrpDeps {
  readonly getStudy: typeof getStudy;
  readonly getPracticeLine: typeof getPracticeLine;
  readonly saveOrp: typeof saveOrpLineToLibrary;
}

const REAL_DEPS: BulkAddToOrpDeps = { getStudy, getPracticeLine, saveOrp: saveOrpLineToLibrary };

type DialogPhase =
  | { kind: 'confirm' }
  | { kind: 'running'; processed: number; token: number }
  | { kind: 'done'; result: BulkAddResult };

interface BulkAddToOrpDialogState {
  ids: readonly string[];
  trainAs: 'white' | 'black';
  phase: DialogPhase;
}

let _dialog: BulkAddToOrpDialogState | null = null;
let _escapeListener: ((e: KeyboardEvent) => void) | null = null;








let _dialogOpener: HTMLElement | null = null;
// Monotonic run identity (finding 3). Bumped on every open and every commit so a stale in-flight
// run's async callbacks can prove they still own the current dialog before mutating it.
let _runToken = 0;

/** True while a run is actively processing — every interactive handler reads THIS (live module
 *  state), never a phase captured at render time, so a stale confirm-phase vnode cannot dismiss a
 *  dialog whose real phase has since advanced to running (finding 3). */
function isRunning(): boolean {
  return _dialog?.phase.kind === 'running';
}

/** The single dismiss guard shared by Escape, the backdrop click, and Cancel (finding 3). Reads
 *  LIVE `isRunning()`, so a stale confirm-phase vnode whose captured handler fires after the run
 *  started is inert. Exported for the behavioral lifecycle test. */
export function attemptDismiss(redraw: () => void): void {
  if (isRunning()) return;
  closeBulkAddToOrpDialog();
  redraw();
}

/** Test-only inspector: the current dialog's phase kind, or `'closed'`. Lets the focused test assert
 *  lifecycle behavior (running vs done vs closed) without reaching into module-private state. */
export function __dialogPhaseForTest(): DialogPhase['kind'] | 'closed' {
  return _dialog?.phase.kind ?? 'closed';
}

function detachEscapeListener(): void {
  if (_escapeListener) {
    document.removeEventListener('keydown', _escapeListener, true);
    _escapeListener = null;
  }
}

function closeBulkAddToOrpDialog(): void {
  _dialog = null;
  // Invalidate any in-flight run so its completion callback cannot resurrect a closed dialog.
  _runToken++;
  detachEscapeListener();
}

function attachEscapeListener(redraw: () => void): void {
  detachEscapeListener();
  _escapeListener = (e: KeyboardEvent) => {
    // Escape routes through the shared dismiss guard: inert mid-run (live check), so a
    // partially-applied bulk add is never abandoned with an inconsistent summary.
    if (e.key !== 'Escape') return;















    e.stopPropagation();
    attemptDismiss(redraw);
  };
  document.addEventListener('keydown', _escapeListener, true);
}

/**
 * Opens the bulk Add-to-ORP dialog for `ids` (the current selection, caller-supplied so this module
 * never reads selection state itself — the id-set already includes any select-all-in-scope merge,
 * so `ids.length` is the TRUE scope count shown as the confirm number). No-op on an empty selection,
 * mirroring `openBulkTagDialog` / `openMoveAliasDialog`.
 */
export function openBulkAddToOrpDialog(ids: readonly string[], redraw: () => void): void {
  if (ids.length === 0) return;
  // `typeof HTMLElement` is load-bearing, not belt-and-braces: under bare node (the focused test
  // harnesses import this module directly) `HTMLElement` is UNDECLARED, so a bare `instanceof`
  // throws ReferenceError rather than evaluating false.
  _dialogOpener = typeof document !== 'undefined' && typeof HTMLElement !== 'undefined'
    && document.activeElement instanceof HTMLElement
    ? document.activeElement
    : null;
  _runToken++; // a fresh dialog supersedes any prior run's pending callbacks
  _dialog = { ids: [...ids], trainAs: 'white', phase: { kind: 'confirm' } };
  attachEscapeListener(redraw);
  redraw();
}

function setTrainAs(trainAs: 'white' | 'black', redraw: () => void): void {
  // Live phase read: only mutable while the (current) dialog is in confirm phase.
  if (!_dialog || _dialog.phase.kind !== 'confirm' || _dialog.trainAs === trainAs) return;
  _dialog = { ..._dialog, trainAs };
  redraw();
}

type ExtractResult =
  | { ok: true; ucis: string[]; sans: string[] }
  | { ok: false; reason: 'unreadable' | 'non-standard-start' | 'malformed-headers' | 'too-short' };










function inspectHeaders(pgn: string): 'ok' | 'non-standard-start' | 'malformed-headers' {
  const fen = pgn.match(/\[FEN\s+"([^"]*)"\]/i)?.[1]?.trim();
  const setup = pgn.match(/\[SetUp\s+"([^"]*)"\]/i)?.[1]?.trim();
  if (fen !== undefined && fen !== '' && fen !== STANDARD_START_FEN) return 'non-standard-start';
  if (setup === '1' && (fen === undefined || fen === '')) return 'malformed-headers';
  return 'ok';
}

/**
 * Extract the drillable mainline UCIs/SANs from a StudyItem's PGN, or a skip reason. Inspects the
 * raw headers (finding 2), parses the PGN into the canonical tree, REJECTS a non-standard root
 * position (finding 1 — a FEN/SetUp position whose UCIs would be mis-replayed from the standard
 * start by `saveOrpLineToLibrary`), then reads the first-child chain. `too-short` is only returned
 * for a genuinely short STANDARD-start line. Mirrors studyDetailView.ts's `buildMainlineOption`.
 */
function extractMainlineMoves(pgn: string): ExtractResult {
  const headerCheck = inspectHeaders(pgn);
  if (headerCheck !== 'ok') return { ok: false, reason: headerCheck };
  let root;
  try {
    root = pgnToTree(pgn);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  // Finding 1 belt-and-suspenders: the parsed root must also be the standard start.
  if (root.fen !== STANDARD_START_FEN) return { ok: false, reason: 'non-standard-start' };
  const moveNodes = mainlineNodeList(root).slice(1).filter(node => node.uci && node.san);
  if (moveNodes.length < MIN_ORP_MOVES) return { ok: false, reason: 'too-short' };
  return {
    ok: true,
    ucis: moveNodes.map(node => node.uci!),
    sans: moveNodes.map(node => node.san!),
  };
}

/**
 * Process the selection one record at a time and return the honest added/already-present/skipped/
 * failed tally. Loads each StudyItem lazily via `deps.getStudy(id)` (never a bulk `getAll`), guards
 * the non-standard root (finding 1), guards deterministic-id collisions with a pre-save existence
 * read plus an intra-batch seen-set (finding 2, first-writer-wins — never overwrites), and converts
 * eligible items through the existing `deps.saveOrp` seam.
 */
export async function runBulkAddToOrp(
  ids: readonly string[],
  trainAs: 'white' | 'black',
  onProgress: (processed: number) => void,
  deps: BulkAddToOrpDeps = REAL_DEPS,
): Promise<BulkAddResult> {
  let added = 0;
  let alreadyPresent = 0;
  const skipByReason: Record<SkipReason, number> = {
    'not-found': 0,
    'non-standard-start': 0,
    'malformed-headers': 0,
    'too-short': 0,
    unreadable: 0,
    error: 0,
  };
  const failedIds: string[] = [];
  // Deterministic ids already written this batch — an identical (trainAs, mainline) later in the
  // batch reports already-present and skips the write (first writer wins; no overwrite).
  const seenDerivedIds = new Set<string>();

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    try {
      const item = await deps.getStudy(id);
      if (!item) {
        skipByReason['not-found']++;
      } else {
        const ext = extractMainlineMoves(item.pgn);
        if (!ext.ok) {
          skipByReason[ext.reason]++;
        } else {
          const derivedItemId = deriveOrpStudyItemId(trainAs, ext.ucis);
          const derivedSeqId = deriveOrpSequenceId(trainAs, ext.ucis);
          if (seenDerivedIds.has(derivedItemId)) {
            // Already written/handled earlier THIS batch (duplicate selection) — don't overwrite.
            alreadyPresent++;
          } else {
            // Finding 1: `already-present` requires the COMPLETE record — item AND its sequence.
            const [existingItem, existingSeq] = await Promise.all([
              deps.getStudy(derivedItemId),
              deps.getPracticeLine(derivedSeqId),
            ]);
            if (existingItem && existingSeq) {
              // Complete line already in ORP — report honestly, skip the overwriting write.
              alreadyPresent++;
              seenDerivedIds.add(derivedItemId);
            } else {
              // New line, OR an orphan (item present, sequence missing) needing repair. Either way
              // save via the writer's atomic `ifAbsent` mode (finding 3): a concurrent insert wins
              // and reports `existed` rather than being overwritten; an orphan is `repaired`.
              const provenance: OrpSourceProvenance = {
                source: 'study',
                originalStudyItemId: item.id,
                originalStudyTitle: item.title,
                scope: 'mainline',
                sourcePgn: item.pgn,
              };
              const result = await deps.saveOrp(
                ext.ucis,
                ext.sans,
                trainAs,
                null,
                item.opening,
                item.eco,
                {
                  title: `${item.title} — Mainline`,
                  extraTags: ['study', `source-study:${item.id}`, 'scope:mainline'],
                  mergeExistingTags: true,
                  sourceProvenance: provenance,
                  ifAbsent: true,
                },
              );
              if (!result) {
                // saveOrp's own guard rejected the line (short/illegal after replay) — report, don't crash.
                skipByReason['too-short']++;
              } else if (result.outcome === 'existed') {
                // A concurrent writer inserted the complete record first — no overwrite happened.
                alreadyPresent++;
                seenDerivedIds.add(derivedItemId);
              } else {
                // 'created' or 'repaired' (orphan sequence written) — the line is now complete.
                added++;
                seenDerivedIds.add(derivedItemId);
              }
            }
          }
        }
      }
    } catch {
      // A thrown save leaves the item's persisted state uncertain; report it as failed and retain
      // its source id so completion keeps it selected for a (deterministic, idempotent) retry.
      skipByReason.error++;
      failedIds.push(id);
    }

    if ((i + 1) % YIELD_EVERY === 0) {
      onProgress(i + 1);
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  const skipped =
    skipByReason['not-found'] +
    skipByReason['non-standard-start'] +
    skipByReason['malformed-headers'] +
    skipByReason['too-short'] +
    skipByReason.unreadable +
    skipByReason.error;
  return { added, alreadyPresent, skipped, skipByReason, failedIds };
}

/**
 * Whether an async run callback still owns the current dialog and may mutate it (finding 3). True
 * only when a dialog exists, is in the running phase, and that running phase carries the callback's
 * own `token`. A superseded run (newer token), a closed dialog, or a phase that has moved on all
 * return false. Exported for the focused unit test.
 */
export function runOwnsDialog(
  dialog: BulkAddToOrpDialogState | null,
  token: number,
): boolean {
  return !!dialog && dialog.phase.kind === 'running' && dialog.phase.token === token;
}

async function commitWith(redraw: () => void, deps: BulkAddToOrpDeps): Promise<void> {
  if (!_dialog || _dialog.phase.kind !== 'confirm') return;
  const token = ++_runToken;
  const { ids, trainAs } = _dialog;
  _dialog = { ..._dialog, phase: { kind: 'running', processed: 0, token } };
  redraw();

  const result = await runBulkAddToOrp(ids, trainAs, processed => {
    // Progress belongs to this run only.
    if (runOwnsDialog(_dialog, token)) {
      _dialog = { ..._dialog!, phase: { kind: 'running', processed, token } };
      redraw();
    }
  }, deps);

  // Completion touches ONLY its own run's dialog (finding 3). If the dialog was closed or a newer
  // run/dialog superseded this one, apply nothing — the selection and dialog belong to that context.
  if (!runOwnsDialog(_dialog, token)) return;

  // Post-run selection (finding 2): retain exactly the failed subset for retry; otherwise clear.
  clearSelection();
  if (result.failedIds.length > 0) selectAllDisplayed(result.failedIds);

  _dialog = { ..._dialog!, phase: { kind: 'done', result } };
  redraw();
}

function commit(redraw: () => void): Promise<void> {
  return commitWith(redraw, REAL_DEPS);
}

/** Test-only entry point: drive a commit with injected persistence deps so the focused test can
 *  control save timing/outcomes and assert dialog-lifecycle + post-run selection behavior. */
export function commitForTest(redraw: () => void, deps: BulkAddToOrpDeps): Promise<void> {
  return commitWith(redraw, deps);
}

/** Human-readable breakdown of skipped items by reason, for the completion summary. */
function skipDetail(skipByReason: Readonly<Record<SkipReason, number>>): string {
  const parts: string[] = [];
  if (skipByReason['non-standard-start'] > 0) parts.push(`${skipByReason['non-standard-start']} not from the standard start`);
  if (skipByReason['malformed-headers'] > 0) parts.push(`${skipByReason['malformed-headers']} with malformed setup headers`);
  if (skipByReason['too-short'] > 0) parts.push(`${skipByReason['too-short']} too short to drill`);
  if (skipByReason.unreadable > 0) parts.push(`${skipByReason.unreadable} unreadable`);
  if (skipByReason['not-found'] > 0) parts.push(`${skipByReason['not-found']} not found`);
  if (skipByReason.error > 0) parts.push(`${skipByReason.error} failed`);
  return parts.join(', ');
}

/** Reusable disabled explainer for a control that is unavailable during the running phase (finding
 *  4) — Essential unavailable-reason wrapper, matching the Add button's own disabled treatment. */
function disabledWhileRunning(label: string, reason: string, inner: VNode): VNode {
  return renderDisabledControlExplainer({ label, description: reason }, inner);
}

const RUNNING_REASON = 'Unavailable while the selected games are being added to ORP.';

function renderTrainAsButton(
  side: 'white' | 'black',
  trainAs: 'white' | 'black',
  running: boolean,
  redraw: () => void,
): VNode {
  const label = side === 'white' ? 'Train as White' : 'Train as Black';
  const description = side === 'white'
    ? 'Recall the White side of every added line.'
    : 'Recall the Black side of every added line.';
  const on = trainAs === side;
  if (running) {
    // Finding 4: canonical disabled pattern with an Essential reason (not a bare disabled attr).
    return disabledWhileRunning(label, RUNNING_REASON,
      h('button.sentry-move-dialog__seg-btn', {
        class: { 'sentry-move-dialog__seg-btn--on': on },
        attrs: { type: 'button', disabled: true, 'aria-pressed': String(on) },
      }, [h('span', label)]));
  }
  return h('button.sentry-move-dialog__seg-btn', {
    class: { 'sentry-move-dialog__seg-btn--on': on },
    attrs: { type: 'button', 'aria-pressed': String(on), ...controlExplainerAttrs({ label, description }) },
    on: { click: () => setTrainAs(side, redraw) },
  }, [h('span', label)]);
}

/**
 * Renders the currently-open dialog, or `null` when closed — itemListView.ts includes this once per
 * render pass (mirrors `renderBulkTagDialog`'s no-op-when-closed contract).
 */
export function renderBulkAddToOrpDialog(redraw: () => void): VNode | null {
  if (!_dialog) return null;
  const { ids, trainAs, phase } = _dialog;
  const count = ids.length;
  const running = phase.kind === 'running';

  const body: Array<VNode | null> = [];

  if (phase.kind === 'done') {
    const { result } = phase;
    const summaryLines: VNode[] = [
      h('p.sentry-bulk-add-orp__summary-line',
        `Added ${result.added} game${result.added === 1 ? '' : 's'} to Opening Repetition Practice.`),
    ];
    if (result.alreadyPresent > 0) {
      summaryLines.push(h('p.sentry-bulk-add-orp__summary-line',
        `${result.alreadyPresent} ${result.alreadyPresent === 1 ? 'was' : 'were'} already in ORP (kept as-is).`));
    }
    summaryLines.push(
      result.skipped > 0
        ? h('p.sentry-bulk-add-orp__summary-line.sentry-bulk-add-orp__summary-line--skip',
            `Skipped ${result.skipped} (${skipDetail(result.skipByReason)}).`)
        : h('p.sentry-bulk-add-orp__summary-line', 'No games were skipped.'),
    );
    if (result.failedIds.length > 0) {
      summaryLines.push(h('p.sentry-bulk-add-orp__summary-line.sentry-bulk-add-orp__summary-line--skip',
        `The ${result.failedIds.length} failed game${result.failedIds.length === 1 ? '' : 's'} ${result.failedIds.length === 1 ? 'is' : 'are'} still selected — try again to retry just those.`));
    }
    body.push(h('div.sentry-bulk-add-orp__summary', summaryLines));
  } else {
    body.push(
      h('p.sentry-move-dialog__desc',
        'Each selected game’s mainline is added to Opening Repetition Practice (ORP) as a drillable line. Games that don’t start from the standard position, or without a long-enough mainline, are skipped and reported.'),
      h('div.sentry-move-dialog__seg', { attrs: { role: 'group', 'aria-label': 'Side to train' } }, [
        renderTrainAsButton('white', trainAs, running, redraw),
        renderTrainAsButton('black', trainAs, running, redraw),
      ]),
      running
        ? h('p.sentry-move-dialog__desc', `Adding… ${phase.processed} of ${count} processed.`)
        : null,
    );
  }

  const footer: VNode =
    phase.kind === 'done'
      ? h('div.sentry-move-dialog__footer', [
          h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--primary', {
            attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Close', description: 'Closes the Add-to-ORP summary.' }) },
            on: { click: () => { closeBulkAddToOrpDialog(); redraw(); } },
          }, [h('span', 'Done')]),
        ])
      : h('div.sentry-move-dialog__footer', [
          running
            ? disabledWhileRunning('Cancel adding to ORP', RUNNING_REASON,
                h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--ghost', {
                  attrs: { type: 'button', disabled: true },
                }, 'Cancel'))
            : h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--ghost', {
                attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel adding to ORP' }) },
                // Shared dismiss guard: inert if a run started under a stale confirm-vnode.
                on: { click: () => attemptDismiss(redraw) },
              }, 'Cancel'),
          running
            ? disabledWhileRunning('Add to ORP', 'The bulk add is already running.',
                h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--primary', {
                  attrs: { type: 'button', disabled: true },
                }, [navIcon('git-branch', { size: 13 }), h('span', 'Adding…')]))
            : h('button.sentry-move-dialog__btn.sentry-move-dialog__btn--primary', {
                attrs: { type: 'button', ...controlExplainerAttrs({ label: `Add ${count} game${count === 1 ? '' : 's'} to ORP`, description: 'Adds each selected game’s mainline to Opening Repetition Practice.' }) },
                on: { click: () => { void commit(redraw); } },
              }, [navIcon('git-branch', { size: 13 }), h('span', `Add ${count} to ORP`)]),
        ]);

  return h('div.sentry-move-dialog-overlay', {
    attrs: { 'aria-label': 'Close Add-to-ORP dialog', ...controlExplainerAttrs({ label: 'Close Add-to-ORP dialog' }) },
    // Shared dismiss guard: backdrop dismiss is inert while running, even from a stale confirm-vnode.
    on: { click: () => attemptDismiss(redraw) },




    key: 'bulk-add-orp-dialog',







    hook: { destroy: () => { if (_dialog !== null) return; _dialogOpener?.focus(); _dialogOpener = null; } },
  }, [
    h('div.sentry-move-dialog', {
      attrs: { 'aria-label': 'Add to ORP dialog', ...controlExplainerAttrs({ label: 'Add to ORP dialog' }) },
      on: { click: (e: Event) => e.stopPropagation() },
    }, [
      h('div.sentry-move-dialog__header', [
        h('h3', phase.kind === 'done'
          ? 'Add to ORP — summary'
          : `Add ${count} game${count === 1 ? '' : 's'} to ORP`),
        h('p', phase.kind === 'done'
          ? 'Results of the bulk add.'
          : 'Opening Repetition Practice drills these games’ opening lines from memory.'),
      ]),
      ...body,
      footer,
    ]),
  ]);
}
