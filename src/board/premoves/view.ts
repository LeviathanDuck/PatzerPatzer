import { h, type VNode } from 'snabbdom';
import {
  cancelLastQueuedPremove,
  clearPremoveQueue,
  dismissPremoveQueueStatus,
  getPremovePendingClockCostSeconds,
  getPremoveQueueState,
  getPremoveQueueStatus,
  getQueuedPremovePromotionChoice,
  setQueuedPremovePromotion,
} from './controller';
import { intentToRawUci, type PremovePromotionRole } from './model';

export interface PremoveQueueControlsDeps {
  redraw(): void;
}

const PROMOTION_CHOICES: Array<{ role: PremovePromotionRole; label: string }> = [
  { role: 'queen', label: 'Q' },
  { role: 'knight', label: 'N' },
  { role: 'rook', label: 'R' },
  { role: 'bishop', label: 'B' },
];

export function renderPremoveQueueControls(deps: PremoveQueueControlsDeps): VNode | null {
  const queue = getPremoveQueueState();
  const status = getPremoveQueueStatus();
  if (queue.intents.length === 0 && !status) return null;

  const costSeconds = getPremovePendingClockCostSeconds();
  const pendingCost = costSeconds === null ? null : formatSeconds(costSeconds * queue.intents.length);
  const promotionChoice = getQueuedPremovePromotionChoice();

  return h('div.premove-queue-controls', {
    attrs: { 'aria-label': 'Premove queue', role: 'region' },
  }, [
    queue.intents.length > 0
      ? h('div.premove-queue-controls__moves', {
          attrs: { role: 'list', 'aria-label': `${queue.intents.length} queued premove${queue.intents.length === 1 ? '' : 's'}` },
        }, queue.intents.map((intent, index) => {
          const rawUci = intentToRawUci(intent);
          return h('span.premove-queue-controls__move', {
            attrs: {
              role: 'listitem',
              title: `Queued premove ${index + 1}: ${rawUci}`,
              'aria-label': `Queued premove ${index + 1}: ${rawUci}`,
            },
          }, [
            h('span.premove-queue-controls__index', String(index + 1)),
            h('span.premove-queue-controls__uci', rawUci),
          ]);
        }))
      : null,
    status
      ? h('div.premove-queue-controls__status', {
          attrs: { role: 'status', 'aria-live': 'polite' },
        }, [
          h('span', status.message),
          h('button.premove-queue-controls__status-close', {
            attrs: { type: 'button', title: 'Dismiss premove status', 'aria-label': 'Dismiss premove status' },
            on: { click: () => { dismissPremoveQueueStatus(); deps.redraw(); } },
          }, '×'),
        ])
      : null,
    pendingCost
      ? h('span.premove-queue-controls__cost', {
          attrs: { title: 'Pending premove clock cost' },
        }, `-${pendingCost}s`)
      : null,
    promotionChoice
      ? h('div.premove-queue-controls__promotion', {
          attrs: {
            role: 'group',
            'aria-label': `Choose promotion piece for queued premove ${promotionChoice.index + 1}`,
          },
        }, PROMOTION_CHOICES.map(choice => h('button.premove-queue-controls__promotion-btn', {
          class: { 'is-active': promotionChoice.intent.promotion === choice.role },
          attrs: {
            type: 'button',
            title: `Promote queued premove ${promotionChoice.index + 1} to ${choice.role}`,
            'aria-label': `Promote queued premove ${promotionChoice.index + 1} to ${choice.role}`,
            'aria-pressed': String(promotionChoice.intent.promotion === choice.role),
          },
          on: {
            click: () => {
              setQueuedPremovePromotion(promotionChoice.index, choice.role);
              deps.redraw();
            },
          },
        }, choice.label)))
      : null,
    queue.intents.length > 0
      ? h('div.premove-queue-controls__actions', [
          h('button.premove-queue-controls__btn', {
            attrs: { type: 'button', title: 'Cancel last queued premove', 'aria-label': 'Cancel last queued premove' },
            on: { click: () => { cancelLastQueuedPremove(); deps.redraw(); } },
          }, 'Undo'),
          h('button.premove-queue-controls__btn.premove-queue-controls__btn--clear', {
            attrs: { type: 'button', title: 'Clear all queued premoves', 'aria-label': 'Clear all queued premoves' },
            on: { click: () => { clearPremoveQueue('manual-clear'); deps.redraw(); } },
          }, 'Clear'),
        ])
      : null,
  ]);
}

function formatSeconds(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}
