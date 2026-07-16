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
import { controlExplainerAttrs, iconControlExplainerAttrs } from '../../ui/controlExplainer';

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
              'aria-label': `Queued premove ${index + 1}: ${rawUci}`,
              ...controlExplainerAttrs({ label: `Queued premove ${index + 1}: ${rawUci}` }),
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
            attrs: {
              type: 'button',
              ...iconControlExplainerAttrs({
                label: 'Dismiss premove status',
                description: 'Hide this premove status message.',
              }),
            },
            on: { click: () => { dismissPremoveQueueStatus(); deps.redraw(); } },
          }, '×'),
        ])
      : null,
    pendingCost
      ? h('span.premove-queue-controls__cost', {
          attrs: {
            'aria-label': `Pending premove clock cost: ${pendingCost} seconds`,
            ...controlExplainerAttrs({
              label: 'Pending premove clock cost',
              description: `The queued premoves would cost ${pendingCost} seconds in total.`,
            }),
          },
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
            'aria-label': `Promote queued premove ${promotionChoice.index + 1} to ${choice.role}`,
            'aria-pressed': String(promotionChoice.intent.promotion === choice.role),
            ...controlExplainerAttrs({
              label: `Promote to ${choice.role}`,
              description: `Use a ${choice.role} for queued premove ${promotionChoice.index + 1}.`,
            }),
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
            attrs: {
              type: 'button',
              'aria-label': 'Cancel last queued premove',
              ...controlExplainerAttrs({
                label: 'Undo last premove',
                description: 'Remove only the most recently queued premove.',
              }),
            },
            on: { click: () => { cancelLastQueuedPremove(); deps.redraw(); } },
          }, 'Undo'),
          h('button.premove-queue-controls__btn.premove-queue-controls__btn--clear', {
            attrs: {
              type: 'button',
              'aria-label': 'Clear all queued premoves',
              ...controlExplainerAttrs({
                label: 'Clear premove queue',
                description: 'Remove every queued premove.',
              }),
            },
            on: { click: () => { clearPremoveQueue('manual-clear'); deps.redraw(); } },
          }, 'Clear'),
        ])
      : null,
  ]);
}

function formatSeconds(seconds: number): string {
  return Number.isInteger(seconds) ? String(seconds) : seconds.toFixed(1);
}
