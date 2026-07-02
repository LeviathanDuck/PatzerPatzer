import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import {
  REPERTOIRE_ALT_ARROW_BRUSH_NAME,
  REPERTOIRE_ARROW_BRUSH_NAME,
} from '../board/arrowBrushes';
import type { RepertoireSource } from './index';
import { buildRepertoireArrowMoves } from './explorerViewModel';

function repertoireArrowShape(uci: string, isMain: boolean): DrawShape | null {
  if (uci.length < 4) return null;
  return {
    orig: uci.slice(0, 2) as Key,
    dest: uci.slice(2, 4) as Key,
    brush: isMain ? REPERTOIRE_ARROW_BRUSH_NAME : REPERTOIRE_ALT_ARROW_BRUSH_NAME,
  };
}

export function buildRepertoireArrowShapes(sources: RepertoireSource[], fen: string | null | undefined): DrawShape[] {
  if (!fen) return [];
  return buildRepertoireArrowMoves(sources, fen)
    .map(move => repertoireArrowShape(move.uci, move.isMain))
    .filter((shape): shape is DrawShape => shape !== null);
}
