import type { PuzzleCtrl } from './ctrl';

let activePuzzleCtrl: PuzzleCtrl | undefined;

export function getActivePuzzleCtrl(): PuzzleCtrl | undefined {
  return activePuzzleCtrl;
}

export function setActivePuzzleCtrl(ctrl: PuzzleCtrl | undefined): void {
  activePuzzleCtrl = ctrl;
}

export function puzzleHidesAnalysis(): boolean {
  return activePuzzleCtrl !== undefined;
}
