import type {
  PuzzleFeedback,
  PuzzleMoveOutcome,
  PuzzleRound,
  PuzzleRoundResult,
  PuzzleRoundSnapshot,
} from './types';

const altCastles = {
  e1a1: 'e1c1',
  e1h1: 'e1g1',
  e8a8: 'e8c8',
  e8h8: 'e8g8',
} as const;

type AltCastle = keyof typeof altCastles;

function isAltCastle(uci: string): uci is AltCastle {
  return uci in altCastles;
}

function sameMove(played: string, expected: string): boolean {
  return played === expected || (isAltCastle(played) && altCastles[played] === expected);
}

export interface PuzzleCtrl {
  round(): PuzzleRound;
  feedback(): PuzzleFeedback;
  result(): PuzzleRoundResult;
  progress(): [number, number];
  progressPly(): number;
  currentPath(): string;
  currentExpectedMove(): string | null;
  setCurrentPath(path: string): void;
  submitUserMove(uci: string, path: string): PuzzleMoveOutcome;
  retry(): void;
  viewSolution(): string[];
  restore(snapshot: PuzzleRoundSnapshot): void;
  snapshot(): PuzzleRoundSnapshot;
}

export function makePuzzleCtrl(
  round: PuzzleRound,
  onChange: (snapshot: PuzzleRoundSnapshot) => void = () => {},
): PuzzleCtrl {
  let feedback: PuzzleFeedback = 'find';
  let result: PuzzleRoundResult = 'active';
  let progressPly = 0;
  let currentPath = round.parentPath;

  const totalUserMoves = Math.ceil(round.solution.length / 2);

  function emit(): void {
    onChange({
      key: round.key,
      progressPly,
      currentPath,
      feedback,
      result,
      updatedAt: Date.now(),
    });
  }

  return {
    round: () => round,
    feedback: () => feedback,
    result: () => result,
    progress: () => [Math.ceil(progressPly / 2), totalUserMoves],
    progressPly: () => progressPly,
    currentPath: () => currentPath,
    currentExpectedMove: () => round.solution[progressPly] ?? null,
    setCurrentPath(path: string): void {
      currentPath = path;
      emit();
    },
    submitUserMove(uci: string, path: string): PuzzleMoveOutcome {
      const expected = round.solution[progressPly];
      if (!expected || path !== currentPath || result !== 'active' || !sameMove(uci, expected)) {
        feedback = 'fail';
        result = 'failed';
        emit();
        return { accepted: false, replies: [] };
      }
      progressPly += 1;
      const replies: string[] = [];
      while (progressPly < round.solution.length && progressPly % 2 === 1) {
        replies.push(round.solution[progressPly]!);
        progressPly += 1;
      }
      if (progressPly >= round.solution.length) {
        feedback = 'win';
        result = 'solved';
      } else {
        feedback = 'good';
      }
      emit();
      return { accepted: true, replies };
    },
    retry(): void {
      progressPly = 0;
      feedback = 'find';
      result = 'active';
      currentPath = round.parentPath;
      emit();
    },
    viewSolution(): string[] {
      feedback = 'view';
      result = 'viewed';
      progressPly = round.solution.length;
      emit();
      return [...round.solution];
    },
    restore(snapshot: PuzzleRoundSnapshot): void {
      progressPly = Math.max(0, Math.min(snapshot.progressPly, round.solution.length));
      feedback = snapshot.feedback;
      result = snapshot.result;
      currentPath = snapshot.currentPath;
      emit();
    },
    snapshot(): PuzzleRoundSnapshot {
      return {
        key: round.key,
        progressPly,
        currentPath,
        feedback,
        result,
        updatedAt: Date.now(),
      };
    },
  };
}
