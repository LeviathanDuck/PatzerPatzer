import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Fen, TreePath } from '../../tree/types';
import type { PremoveHostSnapshot } from './host';
import type { PremoveIntent, PremoveQueueState } from './model';

interface PremovePreviewContext {
  fen: Fen;
  path: TreePath;
}

interface PremovePreviewState extends PremovePreviewContext {
  intents: readonly PremoveIntent[];
}

const PREMOVE_PREVIEW_BRUSH = 'yellow';
const PREMOVE_PREVIEW_LABEL_FILL = '#6f5300';

let previewState: PremovePreviewState | null = null;

export function syncPremovePreviewState(queue: PremoveQueueState, snapshot: PremoveHostSnapshot): void {
  if (!snapshot.active || queue.intents.length === 0) {
    clearPremovePreviewState();
    return;
  }
  previewState = {
    fen: snapshot.fen,
    path: snapshot.path,
    intents: queue.intents.map(copyIntent),
  };
}

export function clearPremovePreviewState(): void {
  previewState = null;
}

export function getPremovePreviewState(): PremovePreviewState | null {
  if (!previewState) return null;
  return {
    fen: previewState.fen,
    path: previewState.path,
    intents: previewState.intents.map(copyIntent),
  };
}

export function buildPremovePreviewShapes(current: PremovePreviewContext): DrawShape[] {
  if (!previewState) return [];
  if (previewState.fen !== current.fen || previewState.path !== current.path) {
    clearPremovePreviewState();
    return [];
  }

  return previewState.intents.map((intent, index) => ({
    orig: intent.orig,
    dest: intent.dest,
    brush: PREMOVE_PREVIEW_BRUSH,
    modifiers: { lineWidth: Math.max(6, 10 - index) },
    label: {
      text: String(index + 1),
      fill: PREMOVE_PREVIEW_LABEL_FILL,
    },
  }));
}

function copyIntent(intent: PremoveIntent): PremoveIntent {
  return { ...intent };
}
