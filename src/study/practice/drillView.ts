// Study drill session view — renders the full-screen drill board and session UI.
// Module-level state (ctrl+view pattern): session, board, sequences.
// Phase 5 Task 5.2 (CCP-550). Extended in Task 5.3 (CCP-551).
// Adapted from lichess-org/lila: ui/puzzle/src/view/main.ts board + feedback rendering.

import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { Chess } from 'chessops/chess';
import { chessgroundDests } from 'chessops/compat';
import { parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import { createDrillBoardAdapter, type DrillBoardAdapter } from './boardAdapter';
import { createDrillSession, type DrillSession, type DrillMode } from './drillCtrl';
import { scheduleNext, positionKey, isDue } from './scheduler';
import { getPositionProgress, savePositionProgress, saveDrillAttempt } from '../studyDb';
import type { TrainableSequence, PositionProgress, DrillAttempt } from '../types';

// --- Module-level drill state ---

let _session:    DrillSession | null  = null;
let _sequences:  TrainableSequence[]  = [];
let _rootFen:    string               = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
let _trainAs:    'white' | 'black'    = 'white';
let _startedAt:  number               = 0;
let _cgRef:      CgApi | null         = null;
let _adapter:    DrillBoardAdapter | null = null;
let _redraw:     () => void           = () => {};

// Performance stats — tracked during session, preserved for summary on completion/early exit.
let _totalPositions   = 0;
let _correctFirst     = 0;
// Snapshot preserved when session ends (early-exit or natural completion).
let _summaryPositions = 0;
let _summaryCorrect   = 0;
let _summarySequences = 0;
let _summaryStartedAt = 0;
let _showSummary      = false;

// --- Public interface ---

export function isDrillActive(): boolean {
  return _session !== null;
}

/**
 * Initialise and start a new drill session.
 * Must be called before renderDrillView().
 */
export function initDrillView(
  sequences: TrainableSequence[],
  rootFen:   string,
  trainAs:   'white' | 'black',
  redraw:    () => void,
  mode:      DrillMode = 'quiz',
): void {
  _sequences     = sequences;
  _rootFen       = rootFen;
  _trainAs       = trainAs;
  _redraw        = redraw;
  _session        = createDrillSession(sequences, mode);
  _startedAt      = Date.now();
  _totalPositions  = 0;
  _correctFirst    = 0;
  _showSummary     = false;
  // Board will be created via Chessground insert hook on first render.
  // No sync needed yet — syncDrillBoard() is called from the insert hook.
}

/** Snapshot current stats and show summary without destroying session data. */
function captureSummary(): void {
  _summaryPositions = _totalPositions;
  _summaryCorrect   = _correctFirst;
  _summarySequences = _session?.sequenceIndex ?? _sequences.length;
  _summaryStartedAt = _startedAt;
  _showSummary      = true;
}

/** Tear down the drill and release board resources. */
export function endDrill(): void {
  if (!_showSummary) captureSummary();
  _cgRef?.destroy();
  _cgRef    = null;
  _adapter  = null;
  _session  = null;
}

export function isDrillSummary(): boolean {
  return _showSummary;
}

// --- Board helpers ---

function getFenBefore(positionIndex: number, seq: TrainableSequence | undefined): string {
  if (!seq) return _rootFen;
  if (positionIndex === 0) return _rootFen;
  return seq.fens[positionIndex - 1] ?? _rootFen;
}

function isUserTurn(positionIndex: number, seq: TrainableSequence | undefined): boolean {
  if (!seq) return true;
  const ply = seq.startPly + positionIndex;
  const moveColor = ply % 2 === 0 ? 'white' : 'black';
  return moveColor === _trainAs;
}

function computeDrillDests(fen: string): Map<Key, Key[]> {
  try {
    const setup = parseFen(fen).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    return chessgroundDests(pos) as Map<Key, Key[]>;
  } catch {
    return new Map();
  }
}

function uciToKeys(uci: string): [Key, Key] | null {
  if (uci.length < 4) return null;
  return [uci.slice(0, 2) as Key, uci.slice(2, 4) as Key];
}

/**
 * Sync the drill board to match the current session state.
 * Handles opponent auto-play with a short delay.
 */
function syncDrillBoard(): void {
  const adapter = _adapter;
  if (!adapter || !_session) return;

  const session = _session;
  const seq     = session.currentSequence;

  if (session.isDone || session.feedback === 'complete') {
    adapter.disableUserInput();
    return;
  }

  const idx = session.positionIndex;

  // Learn mode: auto-play every move at 700ms/move. When pass completes, session
  // automatically transitions to quiz mode (see drillCtrl advance()).
  if (session.mode === 'learn' && session.feedback === 'waiting') {
    adapter.disableUserInput();
    const uci  = seq?.moves[idx];
    const keys = uci ? uciToKeys(uci) : null;
    if (keys) {
      const afterFen = seq?.fens[idx] ?? _rootFen;
      setTimeout(() => {
        if (!_session || _session.mode !== 'learn') return; // session may have changed
        adapter.animateOpponentMove(keys[0], keys[1], afterFen);
        const prevMode = _session.mode;
        _session = _session.advance();
        // Detect learn→quiz transition and seed level-1 for all positions in these sequences.
        if (prevMode === 'learn' && _session.mode === 'quiz') {
          void seedLearnedPositions(_sequences);
        }
        _redraw();
        setTimeout(() => syncDrillBoard(), 300);
      }, 700);
    } else {
      _session = _session?.advance() ?? null;
      syncDrillBoard();
    }
    return;
  }

  if (session.feedback === 'waiting') {
    if (isUserTurn(idx, seq)) {
      // User must play the expected move.
      const fenBefore = getFenBefore(idx, seq);
      adapter.setPosition(fenBefore, _trainAs);
      const dests = computeDrillDests(fenBefore);
      adapter.enableUserInput(dests, (orig, dest) => {
        onUserMove(orig, dest);
      });
    } else {
      // Opponent's turn: auto-animate their move, then advance.
      adapter.disableUserInput();
      const uci  = seq?.moves[idx];
      const keys = uci ? uciToKeys(uci) : null;
      if (keys) {
        const afterFen = seq?.fens[idx] ?? _rootFen;
        setTimeout(() => {
          adapter.animateOpponentMove(keys[0], keys[1], afterFen);
          _session = _session?.advance() ?? null;
          _redraw();
          setTimeout(() => syncDrillBoard(), 350);
        }, 500);
      } else {
        // No move data — advance anyway.
        _session = _session?.advance() ?? null;
        syncDrillBoard();
      }
    }
  } else if (session.feedback === 'correct' || session.feedback === 'showAnswer') {
    adapter.disableUserInput();
  } else if (session.feedback === 'incorrect') {
    // Re-enable input at same position — user gets another attempt.
    const fenBefore = getFenBefore(idx, seq);
    adapter.setPosition(fenBefore, _trainAs);
    const dests = computeDrillDests(fenBefore);
    adapter.enableUserInput(dests, (orig, dest) => {
      onUserMove(orig, dest);
    });
  }
}

/**
 * Seed all positions in the given sequences to level 1 when learn phase completes.
 * Only seeds positions that have no existing progress (level 0 or missing).
 */
async function seedLearnedPositions(sequences: TrainableSequence[]): Promise<void> {
  const now = Date.now();
  const { INTERVALS_MS } = await import('./scheduler');
  for (const seq of sequences) {
    for (const fen of seq.fens) {
      const key      = positionKey(fen);
      const existing = await getPositionProgress(key);
      if (existing && existing.level > 0) continue; // already has progress
      const seeded: PositionProgress = {
        key,
        level:         1,
        nextDueAt:     now + INTERVALS_MS[1]!,
        attempts:      0,
        correct:       0,
        incorrect:     0,
        streak:        0,
        lastAttemptAt: 0,
        sequenceIds:   existing?.sequenceIds.includes(seq.id)
          ? existing.sequenceIds
          : [...(existing?.sequenceIds ?? []), seq.id],
      };
      await savePositionProgress(seeded).catch(() => {});
    }
  }
}

/**
 * Persist the graded position result to IDB (fire-and-forget).
 * Loads or creates PositionProgress, applies scheduleNext(), saves back.
 * Appends a DrillAttempt record.
 */
async function persistGrading(
  fenBefore:    string,
  seqId:        string,
  expectedSan:  string,
  userSan:      string,
  correct:      boolean,
  attemptsBeforeCorrect: number,
): Promise<void> {
  const key       = positionKey(fenBefore);
  const now       = Date.now();
  const existing  = await getPositionProgress(key);
  const prev: PositionProgress = existing ?? {
    key,
    level:           0,
    nextDueAt:       0,
    attempts:        0,
    correct:         0,
    incorrect:       0,
    streak:          0,
    lastAttemptAt:   0,
    sequenceIds:     [],
  };

  // Warmup check: if this position is not yet due, grade differently.
  // Due position: normal grading (advance or drop level).
  // Warmup correct: no-op (do not update progress — position is context, not scheduled review).
  // Warmup incorrect: reset to level 1 (creates a new review obligation).
  const due = isDue(prev, now);
  if (!due && correct) {
    // Warmup correct — record sequenceId link but do not change level or scheduling.
    if (existing && !existing.sequenceIds.includes(seqId)) {
      await savePositionProgress({
        ...existing,
        sequenceIds: [...existing.sequenceIds, seqId],
      }).catch(() => {});
    }
    return;
  }

  let newLevel: number;
  let nextDueAt: number;
  if (!due && !correct) {
    // Warmup incorrect — reset to level 1 and schedule for review tomorrow.
    newLevel  = 1;
    nextDueAt = now + (await import('./scheduler')).INTERVALS_MS[1]!;
  } else {
    // Normal grading (due position).
    ({ newLevel, nextDueAt } = scheduleNext(prev.level, correct, now));
  }

  const updated: PositionProgress = {
    ...prev,
    level:         newLevel,
    nextDueAt,
    attempts:      prev.attempts + 1,
    correct:       prev.correct  + (correct ? 1 : 0),
    incorrect:     prev.incorrect + (correct ? 0 : 1),
    streak:        correct ? prev.streak + 1 : 0,
    lastAttemptAt: now,
    sequenceIds:   prev.sequenceIds.includes(seqId)
      ? prev.sequenceIds
      : [...prev.sequenceIds, seqId],
  };

  await savePositionProgress(updated).catch(e =>
    console.warn('[drillView] savePositionProgress failed', e),
  );

  const attempt: DrillAttempt = {
    positionKey:          key,
    sequenceId:           seqId,
    timestamp:            now,
    result:               correct ? 'correct' : 'incorrect',
    expectedMove:         expectedSan,
    attemptsBeforeCorrect,
    ...(correct ? {} : { userMove: userSan }),
  };
  await saveDrillAttempt(attempt).catch(e =>
    console.warn('[drillView] saveDrillAttempt failed', e),
  );
}

function onUserMove(orig: Key, dest: Key): void {
  if (!_session || !_adapter) return;

  // Convert cg move to SAN via chessops.
  const seq      = _session.currentSequence;
  const idx      = _session.positionIndex;
  const fenBefore = getFenBefore(idx, seq);

  let san = '';
  try {
    const setup = parseFen(fenBefore).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    const move  = parseUci(`${orig}${dest}`);
    if (!move) { syncDrillBoard(); return; }
    san = makeSanAndPlay(pos, move);
  } catch {
    syncDrillBoard();
    return;
  }

  const prevFeedback = _session.feedback;
  _session = _session.submitMove(san);

  const expectedSan = seq?.sans[idx] ?? '';
  const seqId       = seq?.id ?? '';

  if (_session.feedback === 'correct') {
    _totalPositions++;
    if (prevFeedback === 'waiting') _correctFirst++;
    _adapter.flashFeedback('correct');
    _redraw();
    // Persist correct grading (fire-and-forget).
    void persistGrading(fenBefore, seqId, expectedSan, san, true, _session.attemptsAtPosition);
    // Advance after brief pause.
    setTimeout(() => {
      if (!_session) return;
      _session = _session.advance();
      _redraw();
      syncDrillBoard();
    }, 600);
  } else if (_session.feedback === 'incorrect') {
    _totalPositions++;
    // Persist incorrect attempt (fire-and-forget).
    void persistGrading(fenBefore, seqId, expectedSan, san, false, _session.attemptsAtPosition);
    _adapter.flashFeedback('incorrect');
    _redraw();
  } else if (_session.feedback === 'showAnswer') {
    // Show the correct move and wait for user to click Next.
    const uci  = seq?.moves[idx];
    const keys = uci ? uciToKeys(uci) : null;
    if (keys) _adapter.showCorrectMove(keys[0], keys[1]);
    _adapter.disableUserInput();
    _redraw();
  }
}

// --- VNode rendering ---

let _drillKeyHandler: ((e: KeyboardEvent) => void) | null = null;

export function renderDrillView(redraw: () => void): VNode {
  if (_showSummary || !_session || _session.isDone || _session.feedback === 'complete') {
    if (_session?.isDone || _session?.feedback === 'complete') captureSummary();
    return renderDrillSummary(redraw);
  }
  return h('div.drill-session', {
    hook: {
      insert: () => {
        _drillKeyHandler = (e: KeyboardEvent) => {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === 'INPUT' || tag === 'TEXTAREA') return;

          if (e.key === 'Enter' || e.key === ' ') {
            const fb = _session?.feedback;
            if (fb === 'correct' || fb === 'showAnswer' || fb === 'complete') {
              e.preventDefault();
              if (!_session) return;
              _session = _session.advance();
              redraw();
              syncDrillBoard();
            }
          } else if (e.key === 'Escape') {
            e.preventDefault();
            captureSummary();
            endDrill();
            redraw();
          } else if (
            e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
            e.key === 'ArrowUp'   || e.key === 'ArrowDown'
          ) {
            e.preventDefault();
          }
        };
        document.addEventListener('keydown', _drillKeyHandler);
      },
      destroy: () => {
        if (_drillKeyHandler) {
          document.removeEventListener('keydown', _drillKeyHandler);
          _drillKeyHandler = null;
        }
      },
    },
  }, [
    renderDrillBoard(),
    renderDrillSidebar(redraw),
  ]);
}

// --- Board ---

function renderDrillBoard(): VNode {
  return h('div.drill-board-wrap', {
    key: 'drill-board',
    hook: {
      insert: (vnode) => {
        const el  = vnode.elm as HTMLElement;
        const cg  = makeChessground(el, {
          orientation: _trainAs,
          viewOnly:    false,
          animation:   { enabled: true, duration: 300 },
          movable: {
            free:      false,
            color:     _trainAs,
            dests:     new Map(),
            showDests: true,
          },
          drawable: { enabled: false },
        });
        _cgRef   = cg;
        _adapter = createDrillBoardAdapter(cg, el);
        syncDrillBoard();
      },
      destroy: () => {
        _cgRef?.destroy();
        _cgRef   = null;
        _adapter = null;
      },
    },
  });
}

// --- Sidebar ---

function renderDrillSidebar(redraw: () => void): VNode {
  const session = _session!;
  const seq     = session.currentSequence;

  return h('div.drill-sidebar', [
    renderDrillHeader(seq),
    renderDrillProgress(),
    renderDrillFeedbackStrip(session),
    renderDrillControls(session, redraw),
  ]);
}

function renderDrillHeader(seq: TrainableSequence | undefined): VNode {
  const label = seq?.label ?? '';
  const total = seq?.sans.length ?? 0;
  const idx   = _session?.positionIndex ?? 0;
  return h('div.drill-header', [
    h('div.drill-sequence-label', label),
    h('div.drill-move-counter', total > 0 ? `Position ${idx + 1} of ${total}` : ''),
  ]);
}

function renderDrillProgress(): VNode {
  const total    = _sequences.length;
  const done     = _session?.sequenceIndex ?? 0;
  const fraction = total > 0 ? done / total : 0;
  return h('div.drill-progress', [
    h('div.drill-progress-bar', [
      h('div.drill-progress-fill', { style: { width: `${Math.round(fraction * 100)}%` } }),
    ]),
    h('div.drill-progress-label', `${done}/${total} lines`),
  ]);
}

function renderDrillFeedbackStrip(session: DrillSession): VNode {
  let text = '';
  let cls  = 'drill-feedback';

  switch (session.feedback) {
    case 'waiting':    text = 'Your turn';                                         break;
    case 'correct':    text = 'Correct!';       cls += ' drill-feedback--correct'; break;
    case 'incorrect':  {
      const left = 3 - session.attemptsAtPosition;
      text = `Try again (${left} left)`;
      cls += ' drill-feedback--incorrect';
      break;
    }
    case 'showAnswer': {
      const expected = session.currentExpectedSan ?? '';
      text = `The move was ${expected}`;
      cls += ' drill-feedback--answer';
      break;
    }
    case 'complete':   text = 'Sequence complete!'; break;
  }

  return h(`div.${cls.replace(/ /g, '.')}`, text);
}

function renderDrillControls(session: DrillSession, redraw: () => void): VNode {
  const showNext = session.feedback === 'correct' || session.feedback === 'showAnswer';
  return h('div.drill-controls', [
    showNext
      ? h('button.drill-btn.drill-btn--next', {
          on: { click: () => {
            if (!_session) return;
            _session = _session.advance();
            redraw();
            syncDrillBoard();
          }},
        }, 'Next')
      : null,
    h('button.drill-btn.drill-btn--end', {
      on: { click: () => { captureSummary(); endDrill(); redraw(); } },
    }, 'End Session'),
  ]);
}

// --- Summary (Phase 5 Task 5.3 — CCP-551) ---

export function renderDrillSummary(redraw: () => void): VNode {
  const totalSequences = _sequences.length;
  const completed  = Math.min(_summarySequences, totalSequences);
  const accuracy   = _summaryPositions > 0
    ? Math.round((_summaryCorrect / _summaryPositions) * 100)
    : 0;
  const now        = Date.now();
  const elapsedMs  = _summaryStartedAt > 0 ? now - _summaryStartedAt : 0;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
  const durationStr = `${elapsedMin}:${String(elapsedSec).padStart(2, '0')}`;

  return h('div.drill-summary', [
    h('h2.drill-summary__title', 'Session Complete'),
    h('div.drill-summary__stats', [
      h('div.drill-summary__stat', [h('span.drill-summary__val', String(_summaryPositions)), h('span.drill-summary__key', 'Positions quizzed')]),
      h('div.drill-summary__stat', [h('span.drill-summary__val', `${accuracy}%`),           h('span.drill-summary__key', 'Accuracy')]),
      h('div.drill-summary__stat', [h('span.drill-summary__val', `${completed}/${totalSequences}`), h('span.drill-summary__key', 'Lines completed')]),
      h('div.drill-summary__stat', [h('span.drill-summary__val', durationStr),             h('span.drill-summary__key', 'Duration')]),
    ]),
    h('div.drill-summary__actions', [
      h('button.drill-btn.drill-btn--again', {
        on: { click: () => {
          if (_sequences.length > 0) {
            initDrillView(_sequences, _rootFen, _trainAs, _redraw);
            redraw();
          }
        }},
      }, 'Practice Again'),
      h('button.drill-btn.drill-btn--back', {
        on: { click: () => { endDrill(); redraw(); } },
      }, 'Back to Library'),
    ]),
  ]);
}
