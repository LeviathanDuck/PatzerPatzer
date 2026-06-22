import { h, type VNode } from 'snabbdom';
import type { ReviewEngineMetadata } from '../../idb';
import type { ImportedGame } from '../../import/types';
import { nodeAtPath } from '../../tree/ops';
import type { TreeNode } from '../../tree/types';
import { advancedReproductionToolsEnabled } from '../devTools/faultInjection';
import { assembleReviewErrorPackage } from './assembler';
import {
  clearReviewErrorSubmitRequest,
  getReviewErrorSubmitRequest,
  type ReviewErrorSubmitRequest,
} from './submitFlow';
import { putReviewErrorPackage } from './storage';
import type { ReviewErrorCurrentEngineSettings } from './types';

export interface ReviewErrorSubmitModalDeps {
  game?: ImportedGame;
  root: TreeNode;
  currentEngineSettings: ReviewErrorCurrentEngineSettings;
  reviewDepth: number;
  analysisComplete: boolean;
  reviewEngine?: ReviewEngineMetadata;
  redraw: () => void;
}

let activeRequestKey: string | null = null;
let memoText = '';
let submitBusy = false;
let submitError: string | null = null;
let submitSuccess: string | null = null;

function requestKey(request: ReviewErrorSubmitRequest): string {
  return `${request.gameId}:${request.path}:${request.openedAt}`;
}

function syncRequestState(request: ReviewErrorSubmitRequest): void {
  const key = requestKey(request);
  if (activeRequestKey === key) return;
  activeRequestKey = key;
  memoText = '';
  submitBusy = false;
  submitError = null;
  submitSuccess = null;
}

function close(redraw: () => void): void {
  clearReviewErrorSubmitRequest();
  activeRequestKey = null;
  memoText = '';
  submitBusy = false;
  submitError = null;
  submitSuccess = null;
  redraw();
}

function movePrefix(ply: number): string {
  const moveNumber = Math.max(1, Math.ceil(ply / 2));
  return ply % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
}

function gameLabel(game: ImportedGame | undefined): string {
  if (!game) return 'Game unavailable';
  const names = game.white && game.black ? `${game.white} vs ${game.black}` : game.id;
  return game.result ? `${names}, ${game.result}` : names;
}

function reviewLabel(deps: ReviewErrorSubmitModalDeps): string {
  if (deps.reviewEngine) {
    return `${deps.reviewEngine.engineName}, depth ${deps.reviewEngine.reviewDepth}`;
  }
  return deps.analysisComplete ? `Stored review complete, depth ${deps.reviewDepth}` : 'Stored review is not complete';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function submitDisabled(deps: ReviewErrorSubmitModalDeps, request: ReviewErrorSubmitRequest): boolean {
  return (
    submitBusy ||
    submitSuccess !== null ||
    !advancedReproductionToolsEnabled() ||
    !deps.game ||
    deps.game.id !== request.gameId ||
    !deps.analysisComplete ||
    !memoText.trim()
  );
}

function submitPackage(deps: ReviewErrorSubmitModalDeps, request: ReviewErrorSubmitRequest): void {
  if (submitDisabled(deps, request)) {
    if (!memoText.trim()) submitError = 'Enter a memo before saving the package.';
    else if (!advancedReproductionToolsEnabled()) submitError = 'Admin diagnostics controls are not enabled.';
    else if (!deps.game || deps.game.id !== request.gameId) submitError = 'The selected game changed. Reopen Review Error Bug from the move list.';
    else if (!deps.analysisComplete) submitError = 'The selected game does not have completed review analysis loaded.';
    deps.redraw();
    return;
  }

  const game = deps.game;
  if (!game) {
    submitError = 'The selected game changed. Reopen Review Error Bug from the move list.';
    deps.redraw();
    return;
  }
  submitBusy = true;
  submitError = null;
  deps.redraw();

  void assembleReviewErrorPackage({
    game,
    root: deps.root,
    path: request.path,
    memo: memoText,
    currentEngineSettings: deps.currentEngineSettings,
  }).then(pkg => putReviewErrorPackage(pkg).then(() => pkg))
    .then(pkg => {
      submitSuccess = `Saved package ${pkg.packageId}`;
      memoText = '';
    })
    .catch(error => {
      submitError = `Review error package save failed: ${errorText(error)}`;
    })
    .finally(() => {
      submitBusy = false;
      deps.redraw();
    });
}

export function renderReviewErrorPackageSubmitModal(deps: ReviewErrorSubmitModalDeps): VNode | null {
  const request = getReviewErrorSubmitRequest();
  if (!request) return null;
  syncRequestState(request);

  const node = nodeAtPath(deps.root, request.path);
  const moveLabel = node
    ? `${movePrefix(node.ply)} ${node.san ?? node.uci ?? request.path}`
    : request.path;
  const disabled = submitDisabled(deps, request);

  return h('div.review-error-modal', [
    h('div.review-error-modal__backdrop', {
      on: { click: () => close(deps.redraw) },
    }),
    h('div.review-error-modal__card', {
      on: { click: (event: Event) => event.stopPropagation() },
    }, [
      h('div.review-error-modal__header', [
        h('div', [
          h('h2', 'Review Error Bug'),
          h('p.review-error-modal__subtitle', 'Admin-only local diagnostic package'),
        ]),
        h('button.review-error-modal__close', {
          attrs: { type: 'button', disabled: submitBusy, title: 'Close' },
          on: { click: () => close(deps.redraw) },
        }, 'Close'),
      ]),
      h('div.review-error-modal__body', [
        h('div.review-error-modal__summary', [
          h('div', [h('span', 'Game'), h('strong', gameLabel(deps.game))]),
          h('div', [h('span', 'Move'), h('strong', moveLabel)]),
          h('div', [h('span', 'Path'), h('code', request.path)]),
          h('div', [h('span', 'Review'), h('strong', reviewLabel(deps))]),
        ]),
        h('p.review-error-modal__warning',
          'This saves the full raw PGN and full stored Stockfish review analysis locally for diagnosis. It does not upload or sync the package.'),
        h('label.review-error-modal__label', { attrs: { for: 'review-error-memo' } }, 'Admin memo'),
        h('textarea.review-error-modal__memo', {
          attrs: {
            id: 'review-error-memo',
            rows: 5,
            placeholder: 'Describe what looked wrong about this move eval.',
            disabled: submitBusy || submitSuccess !== null,
          },
          props: { value: memoText },
          on: {
            input: (event: Event) => {
              memoText = (event.target as HTMLTextAreaElement).value;
              submitError = null;
              deps.redraw();
            },
          },
        }),
        submitError ? h('p.review-error-modal__error', submitError) : null,
        submitSuccess ? h('p.review-error-modal__success', submitSuccess) : null,
      ]),
      h('div.review-error-modal__actions', [
        h('button.review-error-modal__secondary', {
          attrs: { type: 'button', disabled: submitBusy },
          on: { click: () => close(deps.redraw) },
        }, submitSuccess ? 'Close' : 'Cancel'),
        h('button.review-error-modal__primary', {
          attrs: {
            type: 'button',
            disabled,
          },
          on: { click: () => submitPackage(deps, request) },
        }, submitBusy ? 'Saving...' : 'Save package'),
      ]),
    ]),
  ]);
}
