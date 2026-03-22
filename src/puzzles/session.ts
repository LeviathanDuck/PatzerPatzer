import type {
  PuzzleRoundResult,
  PuzzleRoundSnapshot,
  StoredPuzzleSession,
} from './types';

const RECENT_PUZZLES_MAX = 16;

export function emptyPuzzleSession(): StoredPuzzleSession {
  return {
    current: null,
    recent: [],
    updatedAt: Date.now(),
  };
}

export function applyPuzzleSnapshot(
  session: StoredPuzzleSession,
  snapshot: PuzzleRoundSnapshot,
): StoredPuzzleSession {
  const next: StoredPuzzleSession = {
    current: snapshot,
    recent: [...session.recent],
    updatedAt: snapshot.updatedAt,
  };
  if (snapshot.result !== 'active') {
    const result = snapshot.result as Exclude<PuzzleRoundResult, 'active'>;
    next.recent = [
      { key: snapshot.key, result, updatedAt: snapshot.updatedAt },
      ...next.recent.filter(entry => entry.key !== snapshot.key),
    ].slice(0, RECENT_PUZZLES_MAX);
  }
  return next;
}

export function currentPuzzleSnapshot(
  session: StoredPuzzleSession,
  key: string,
): PuzzleRoundSnapshot | null {
  return session.current?.key === key ? session.current : null;
}

export function currentPuzzleIsActive(session: StoredPuzzleSession, key: string): boolean {
  return session.current?.key === key && session.current.result === 'active';
}

export function recentPuzzleResult(
  session: StoredPuzzleSession,
  key: string,
): Exclude<PuzzleRoundResult, 'active'> | null {
  if (session.current?.key === key && session.current.result !== 'active') {
    return session.current.result as Exclude<PuzzleRoundResult, 'active'>;
  }
  return session.recent.find(entry => entry.key === key)?.result ?? null;
}
