import type { PlayVsComputerPremoveHost } from '../../board/premoves/host';

export interface PracticeReplyScheduler<TRequest> {
  immediate(req: TRequest): void;
  delayed(req: TRequest, delayMs: number): void;
}

export type PracticeReplyScheduleMode = 'immediate' | 'delayed';

export function explicitComputerMoveDelayMs(host: PlayVsComputerPremoveHost | null): number | null {
  const config = host?.computerMoveDelay() ?? null;
  if (!config?.enabled || !Number.isFinite(config.delayMs) || config.delayMs <= 0) return null;
  return Math.round(config.delayMs);
}

export function schedulePracticeReply<TRequest>(
  req: TRequest,
  host: PlayVsComputerPremoveHost | null,
  scheduler: PracticeReplyScheduler<TRequest>,
): PracticeReplyScheduleMode {
  const delayMs = explicitComputerMoveDelayMs(host);
  if (delayMs === null) {
    scheduler.immediate(req);
    return 'immediate';
  }
  scheduler.delayed(req, delayMs);
  return 'delayed';
}
