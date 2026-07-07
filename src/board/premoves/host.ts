import type { Color } from 'chessops/types';
import type { Fen, TreePath } from '../../tree/types';
import type { PlayedPremove, PremoveQueueState } from './model';
import { PREMOVE_CLOCK_COST_SECONDS } from './model';

export type PremoveHostSurface =
  | 'analysis-practice'
  | 'study-drill'
  | 'orp-drill'
  | (string & {});

export type PremoveQueueClearReason =
  | 'manual-clear'
  | 'cancel-last'
  | 'navigation'
  | 'route-teardown'
  | 'game-switch'
  | 'practice-reset'
  | 'engine-cancel'
  | 'engine-error'
  | 'invalid-fen'
  | 'terminal'
  | 'illegal';

export interface PremoveHostSnapshot {
  fen: Fen;
  path: TreePath;
  humanColor: Color;
  active: boolean;
  computerTurn: boolean;
}

export interface PremoveComputerMoveDelayConfig {
  enabled: boolean;
  delayMs: number;
  source: 'drill' | 'analysis-practice' | (string & {});
}

export interface PremoveQueueChange {
  queue: PremoveQueueState;
  reason:
    | 'enqueue'
    | 'cancel-last'
    | 'clear'
    | 'executed'
    | 'trimmed'
    | 'promotion'
    | 'teardown';
}

export interface PlayVsComputerPremoveHost {
  surface: PremoveHostSurface;
  snapshot(): PremoveHostSnapshot;
  canCapturePremoves(): boolean;
  applyLegalUserMove(move: PlayedPremove): void;
  onQueueChanged(change: PremoveQueueChange): void;
  onQueueCleared(reason: PremoveQueueClearReason): void;
  syncPreview(queue: PremoveQueueState): void;
  clearPreview(): void;
  syncShapes(): void;
  redraw(): void;
  computerMoveDelay(): PremoveComputerMoveDelayConfig | null;
  pendingClockCostSeconds(): number | null;
  chargePremoveClockCost(move: PlayedPremove, seconds: number): void;
  teardown(reason: PremoveQueueClearReason): void;
}

export interface PlayVsComputerPremoveHostAdapterDeps {
  surface: PremoveHostSurface;
  getFen(): Fen;
  getPath(): TreePath;
  getHumanColor(): Color;
  isActive(): boolean;
  isComputerTurn(): boolean;
  applyLegalUserMove(move: PlayedPremove): void;
  onQueueChanged?(change: PremoveQueueChange): void;
  onQueueCleared?(reason: PremoveQueueClearReason): void;
  syncPreview?(queue: PremoveQueueState): void;
  clearPreview?(): void;
  syncShapes(): void;
  redraw(): void;
  computerMoveDelay?(): PremoveComputerMoveDelayConfig | null;
  pendingClockCostSeconds?(): number | null;
  chargePremoveClockCost?(move: PlayedPremove, seconds: number): void;
  teardown?(reason: PremoveQueueClearReason): void;
}

export type AnalysisPracticePremoveHostDeps = Omit<PlayVsComputerPremoveHostAdapterDeps, 'surface'>;

export function createPlayVsComputerPremoveHost(deps: PlayVsComputerPremoveHostAdapterDeps): PlayVsComputerPremoveHost {
  return {
    surface: deps.surface,
    snapshot: () => ({
      fen: deps.getFen(),
      path: deps.getPath(),
      humanColor: deps.getHumanColor(),
      active: deps.isActive(),
      computerTurn: deps.isComputerTurn(),
    }),
    canCapturePremoves: () => deps.isActive() && deps.isComputerTurn(),
    applyLegalUserMove: move => deps.applyLegalUserMove(move),
    onQueueChanged: change => deps.onQueueChanged?.(change),
    onQueueCleared: reason => deps.onQueueCleared?.(reason),
    syncPreview: queue => deps.syncPreview?.(queue),
    clearPreview: () => deps.clearPreview?.(),
    syncShapes: () => deps.syncShapes(),
    redraw: () => deps.redraw(),
    computerMoveDelay: () => deps.computerMoveDelay?.() ?? null,
    pendingClockCostSeconds: () => deps.pendingClockCostSeconds?.() ?? null,
    chargePremoveClockCost: (move, seconds) => {
      deps.chargePremoveClockCost?.(move, seconds);
    },
    teardown: reason => {
      deps.clearPreview?.();
      deps.onQueueCleared?.(reason);
      deps.teardown?.(reason);
    },
  };
}

export function createAnalysisPracticePremoveHost(deps: AnalysisPracticePremoveHostDeps): PlayVsComputerPremoveHost {
  return createPlayVsComputerPremoveHost({ surface: 'analysis-practice', ...deps });
}

export function defaultPremoveClockCostSeconds(): number {
  return PREMOVE_CLOCK_COST_SECONDS;
}
