import type { Config } from '@lichess-org/chessground/config';

export type BoardAnimationSpeed = 'none' | 'fast' | 'normal' | 'slow';
export type BoardAnimationScope = 'chess' | 'puzzle';

export interface BoardAnimationChoice {
  key: BoardAnimationSpeed;
  label: string;
  durationMs: number;
}

export type BoardAnimationConfig = NonNullable<Config['animation']>;

export const CHESS_BOARD_ANIMATION_KEY = 'chessBoardAnimationSpeed';
export const PUZZLE_BOARD_ANIMATION_KEY = 'puzzleBoardAnimationSpeed';
export const BOARD_ANIMATION_CHANGE_EVENT = 'patzer:board-animation-change';

export const BOARD_ANIMATION_CHOICES: readonly BoardAnimationChoice[] = [
  { key: 'none',   label: 'None',   durationMs: 0 },
  { key: 'fast',   label: 'Fast',   durationMs: 120 },
  { key: 'normal', label: 'Normal', durationMs: 250 },
  { key: 'slow',   label: 'Slow',   durationMs: 500 },
] as const;

const DEFAULT_ANIMATION_SPEED: BoardAnimationSpeed = 'normal';
const BOARD_ANIMATION_SPEEDS = new Set<BoardAnimationSpeed>(BOARD_ANIMATION_CHOICES.map(choice => choice.key));

function readAnimationSpeed(key: string): BoardAnimationSpeed {
  const stored = localStorage.getItem(key);
  return BOARD_ANIMATION_SPEEDS.has(stored as BoardAnimationSpeed)
    ? stored as BoardAnimationSpeed
    : DEFAULT_ANIMATION_SPEED;
}

export let chessBoardAnimationSpeed: BoardAnimationSpeed = readAnimationSpeed(CHESS_BOARD_ANIMATION_KEY);
export let puzzleBoardAnimationSpeed: BoardAnimationSpeed = readAnimationSpeed(PUZZLE_BOARD_ANIMATION_KEY);

function notifyBoardAnimationChange(scope: BoardAnimationScope): void {
  window.dispatchEvent(new CustomEvent(BOARD_ANIMATION_CHANGE_EVENT, { detail: { scope } }));
}

export function onBoardAnimationChange(scope: BoardAnimationScope, cb: () => void): () => void {
  const handler = (event: Event): void => {
    const detail = (event as CustomEvent<{ scope?: BoardAnimationScope }>).detail;
    if (detail?.scope === scope) cb();
  };
  window.addEventListener(BOARD_ANIMATION_CHANGE_EVENT, handler);
  return () => window.removeEventListener(BOARD_ANIMATION_CHANGE_EVENT, handler);
}

export function boardAnimationConfigForSpeed(speed: BoardAnimationSpeed): BoardAnimationConfig {
  const duration = BOARD_ANIMATION_CHOICES.find(choice => choice.key === speed)?.durationMs ?? 250;
  return duration === 0
    ? { enabled: false, duration: 0 }
    : { enabled: true, duration };
}

export function chessBoardAnimationConfig(): BoardAnimationConfig {
  return boardAnimationConfigForSpeed(chessBoardAnimationSpeed);
}

export function puzzleBoardAnimationConfig(): BoardAnimationConfig {
  return boardAnimationConfigForSpeed(puzzleBoardAnimationSpeed);
}

export function setChessBoardAnimationSpeed(speed: BoardAnimationSpeed): void {
  chessBoardAnimationSpeed = BOARD_ANIMATION_SPEEDS.has(speed) ? speed : DEFAULT_ANIMATION_SPEED;
  localStorage.setItem(CHESS_BOARD_ANIMATION_KEY, chessBoardAnimationSpeed);
  notifyBoardAnimationChange('chess');
}

export function setPuzzleBoardAnimationSpeed(speed: BoardAnimationSpeed): void {
  puzzleBoardAnimationSpeed = BOARD_ANIMATION_SPEEDS.has(speed) ? speed : DEFAULT_ANIMATION_SPEED;
  localStorage.setItem(PUZZLE_BOARD_ANIMATION_KEY, puzzleBoardAnimationSpeed);
  notifyBoardAnimationChange('puzzle');
}

export function clearBoardAnimationLocalData(): void {
  localStorage.removeItem(CHESS_BOARD_ANIMATION_KEY);
  localStorage.removeItem(PUZZLE_BOARD_ANIMATION_KEY);
  chessBoardAnimationSpeed = DEFAULT_ANIMATION_SPEED;
  puzzleBoardAnimationSpeed = DEFAULT_ANIMATION_SPEED;
}

export function reloadBoardAnimationPreferences(): void {
  chessBoardAnimationSpeed = readAnimationSpeed(CHESS_BOARD_ANIMATION_KEY);
  puzzleBoardAnimationSpeed = readAnimationSpeed(PUZZLE_BOARD_ANIMATION_KEY);
  notifyBoardAnimationChange('chess');
  notifyBoardAnimationChange('puzzle');
}
