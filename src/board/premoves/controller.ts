import type { SquareName } from 'chessops/types';
import {
  cancelLastPremove,
  clearPremoves,
  createPremoveQueue,
  enqueuePremove,
  isPremovePromotionMove,
  playNextPremove,
  setPremovePromotion,
  PREMOVE_CLOCK_COST_SECONDS,
  type PremoveIntent,
  type PremovePromotionRole,
  type PremoveQueueState,
} from './model';
import type { PlayVsComputerPremoveHost, PremoveHostSnapshot, PremoveQueueClearReason } from './host';
import { clearPremovePreviewState, syncPremovePreviewState } from './preview';

let activeHost: PlayVsComputerPremoveHost | null = null;
let queue = createPremoveQueue();
let lastStatus: PremoveQueueStatus | null = null;

export interface QueuedPremovePromotionChoice {
  index: number;
  intent: PremoveIntent;
}

export interface PremoveQueueStatus {
  reason: PremoveQueueClearReason;
  droppedCount: number;
  message: string;
  createdAt: number;
}

export function setPlayVsComputerPremoveHost(host: PlayVsComputerPremoveHost | null): void {
  if (host === activeHost) return;
  if (activeHost) activeHost.teardown('route-teardown');
  activeHost = host;
  queue = createPremoveQueue();
  clearPremovePreviewState();
  lastStatus = null;
}

export function getPlayVsComputerPremoveHost(): PlayVsComputerPremoveHost | null {
  return activeHost;
}

export function getPremoveQueueState(): PremoveQueueState {
  return queue;
}

export function getPremoveQueueStatus(): PremoveQueueStatus | null {
  return lastStatus ? { ...lastStatus } : null;
}

export function getPremovePendingClockCostSeconds(): number | null {
  if (!activeHost || queue.intents.length === 0) return null;
  return activeHost.pendingClockCostSeconds();
}

export function getQueuedPremovePromotionChoice(): QueuedPremovePromotionChoice | null {
  const host = activeHost;
  if (!host) return null;
  const snapshot = host.snapshot();
  const index = queue.intents.findIndex(intent => (
    isPremovePromotionMove(snapshot.fen, intent, snapshot.humanColor)
  ));
  const intent = index >= 0 ? queue.intents[index] : undefined;
  return intent ? { index, intent: { ...intent } } : null;
}

export function currentPremoveCaptureSnapshot(): PremoveHostSnapshot | null {
  if (!activeHost || !activeHost.canCapturePremoves()) return null;
  return activeHost.snapshot();
}

export function capturePremoveInput(orig: SquareName, dest: SquareName): boolean {
  const host = activeHost;
  const snapshot = currentPremoveCaptureSnapshot();
  if (!host || !snapshot) return false;

  const intent: PremoveIntent = {
    orig,
    dest,
    originFen: snapshot.fen,
    originPath: snapshot.path,
    createdAt: Date.now(),
  };
  lastStatus = null;
  queue = enqueuePremove(queue, intent);
  syncPremovePreviewState(queue, snapshot);
  host.onQueueChanged({ queue, reason: 'enqueue' });
  host.syncPreview(queue);
  host.syncShapes();
  host.redraw();
  return true;
}

export function executeNextQueuedPremoveAfterComputerReply(expected: Pick<PremoveHostSnapshot, 'fen' | 'path'>): boolean {
  const host = activeHost;
  if (!host || queue.intents.length === 0) return false;

  const snapshot = host.snapshot();
  if (!snapshot.active || snapshot.fen !== expected.fen || snapshot.path !== expected.path) return false;

  const result = playNextPremove(expected.fen, queue);
  if (result.status !== 'played') {
    queue = result.queue;
    clearPremovePreviewState();
    if (result.status !== 'empty') {
      setInvalidationStatus(result.status, result.droppedIntents.length);
      activeHost?.onQueueCleared(result.status);
      activeHost?.onQueueChanged({ queue, reason: 'trimmed' });
      activeHost?.clearPreview();
      activeHost?.syncShapes();
      activeHost?.redraw();
    }
    return false;
  }

  queue = result.queue;
  lastStatus = null;
  host.applyLegalUserMove(result.move);
  host.chargePremoveClockCost(result.move, PREMOVE_CLOCK_COST_SECONDS);
  syncPreviewFromActiveHost();
  host.onQueueChanged({ queue, reason: 'executed' });
  host.syncPreview(queue);
  host.syncShapes();
  host.redraw();
  return true;
}

export function cancelLastQueuedPremove(): PremoveQueueState {
  queue = cancelLastPremove(queue);
  lastStatus = null;
  syncPreviewFromActiveHost();
  activeHost?.onQueueChanged({ queue, reason: 'cancel-last' });
  activeHost?.syncPreview(queue);
  activeHost?.syncShapes();
  activeHost?.redraw();
  return queue;
}

export function setQueuedPremovePromotion(index: number, promotion: PremovePromotionRole): PremoveQueueState {
  queue = setPremovePromotion(queue, index, promotion);
  lastStatus = null;
  syncPreviewFromActiveHost();
  activeHost?.onQueueChanged({ queue, reason: 'promotion' });
  activeHost?.syncPreview(queue);
  activeHost?.syncShapes();
  activeHost?.redraw();
  return queue;
}

export function clearPremoveQueue(reason: PremoveQueueClearReason = 'manual-clear'): PremoveQueueState {
  const droppedCount = queue.intents.length;
  queue = clearPremoves();
  if (reason === 'manual-clear') lastStatus = null;
  else setInvalidationStatus(reason, droppedCount);
  clearPremovePreviewState();
  activeHost?.onQueueCleared(reason);
  activeHost?.onQueueChanged({ queue, reason: 'clear' });
  activeHost?.clearPreview();
  activeHost?.syncShapes();
  activeHost?.redraw();
  return queue;
}

export function dismissPremoveQueueStatus(): void {
  lastStatus = null;
}

function syncPreviewFromActiveHost(): void {
  const host = activeHost;
  if (!host || queue.intents.length === 0) {
    clearPremovePreviewState();
    return;
  }
  syncPremovePreviewState(queue, host.snapshot());
}

function setInvalidationStatus(reason: PremoveQueueClearReason, droppedCount: number): void {
  if (droppedCount <= 0) return;
  const message = invalidationMessage(reason, droppedCount);
  lastStatus = message
    ? { reason, droppedCount, message, createdAt: Date.now() }
    : null;
}

function invalidationMessage(reason: PremoveQueueClearReason, droppedCount: number): string | null {
  const suffix = droppedCount === 1 ? '1 premove' : `${droppedCount} premoves`;
  switch (reason) {
    case 'navigation':
      return `Cleared after browsing away (${suffix}).`;
    case 'route-teardown':
      return `Cleared after leaving Analysis (${suffix}).`;
    case 'game-switch':
      return `Cleared after switching games (${suffix}).`;
    case 'practice-reset':
      return `Cleared after resetting practice (${suffix}).`;
    case 'engine-cancel':
      return `Cleared after cancelled engine reply (${suffix}).`;
    case 'engine-error':
      return `Cleared after engine reply failed (${suffix}).`;
    case 'terminal':
      return `Cleared because the game ended (${suffix}).`;
    case 'illegal':
      return `Illegal premove dropped; queue cleared (${suffix}).`;
    case 'invalid-fen':
      return `Cleared because the position was invalid (${suffix}).`;
    default:
      return null;
  }
}
