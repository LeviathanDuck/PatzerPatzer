









import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { AnalyseCtrl } from '../analyse/ctrl';
import { annotationShapes as buildBoardGlyphShapes } from '../analyse/boardGlyphs';
import { formatScore } from '../analyse/evalView';
import {
  arrowAllLines,
  arrowLabelSize,
  currentEval,
  currentEvalMatchesFen,
  engineEnabled,
  evalCache,
  isSilentEvalActive,
  isUciLegalInFen,
  recordVisibleGuidanceDrop,
  showArrowLabels,
  showBoardReviewGlyphs,
  showEngineArrows,
  showPlayedArrow,
  threatEval,
  threatMode,
  visibleEvalForFen,
  type EvalLine,
  type PositionEval,
} from '../engine/ctrl';
import { evalWinChances, classifyLoss, type MoveLabel } from '../engine/winchances';
import { pathInit, pathIsMainline } from '../tree/ops';
import type { Glyph } from '../tree/types';

// --- Injected deps + singleton sink state ---
//
// Grouped into one object (rather than scattered module-level `let`s) so a future per-instance
// keying pass (T5-D17/D18 workspace-core slices, per the CCW-H01 row in the conformance audit's
// hardening-plan table) can convert this into a Map<instanceId, ShapeSinkState> without
// reshaping any of the exported provider-registration or sync functions below. For now there is
// exactly one instance (Analysis) — this preserves today's singleton behavior exactly; no
// per-instance plumbing is built here.
interface ShapeSinkState {
  getCtrl:                      () => AnalyseCtrl;
  getCgInstance:                () => CgApi | undefined;
  repertoireArrowShapeProvider: () => DrawShape[];
  extraArrowSuppressProvider:   (() => boolean) | null;
  extraAutoShapesProvider:      (() => DrawShape[]) | null;
  arrowDebounceTimer:           ReturnType<typeof setTimeout> | null;
  arrowSuppressUntil:           number;
  lastAutoShapesHash:           string | null;
  lastAutoShapesCg:             CgApi | undefined;
}

const sink: ShapeSinkState = {
  getCtrl:                      () => { throw new Error('shape sink not initialised'); },
  getCgInstance:                () => undefined,
  repertoireArrowShapeProvider: () => [],
  extraArrowSuppressProvider:   null,
  extraAutoShapesProvider:      null,
  arrowDebounceTimer:           null,
  arrowSuppressUntil:           0,
  lastAutoShapesHash:           null,
  lastAutoShapesCg:             undefined,
};

/** Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts — Lichess uses 500 ms delay. */
const ARROW_SETTLE_MS = 500;

/** Called from engine/ctrl.ts's initEngine() with the same getCtrl/getCgInstance closures. */
export function initShapeSink(deps: {
  getCtrl:       () => AnalyseCtrl;
  getCgInstance: () => CgApi | undefined;
}): void {
  sink.getCtrl       = deps.getCtrl;
  sink.getCgInstance = deps.getCgInstance;
}

export function setRepertoireArrowShapeProvider(provider: (() => DrawShape[]) | null): void {
  sink.repertoireArrowShapeProvider = provider ?? (() => []);
}

// --- Arrow rendering ---
// Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts makeShapesFromUci + compute

export function buildArrowShapes(): DrawShape[] {
  const shapes: DrawShape[] = [];
  const ctrl = sink.getCtrl();
  if (isSilentEvalActive()) return shapes;

  // Suppress engine-guidance arrows whenever retrospection is active and the user has not
  // manually revealed guidance for the current candidate.
  // Covers all retro states (find, fail, win, view, offTrack) — not just isSolving() —
  // so the answer is never accidentally visible at any point during a session.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts showBestMoveArrows() returning false
  // when retro.hideComputerLine(node) is true for unsolved candidate plies.
  const retroHidden = ctrl.retro !== undefined && !ctrl.retro.guidanceRevealed();
  // Additional external suppression (e.g. analysis practice hides the engine display by
  // default while its own verdict/reply evals keep running internally — mirrors
  // lichess-org/lila practiceCtrl hiding ceval UI during practice). Combined with retroHidden
  // below for every gate except the retro-only candidate-arrow branch, which requires
  // ctrl.retro itself and stays keyed on retroHidden alone.
  const externallyHidden = sink.extraArrowSuppressProvider?.() ?? false;
  const engineGuidanceHidden = retroHidden || externallyHidden;

  if (ctrl.retro === undefined) {
    shapes.push(...sink.repertoireArrowShapeProvider());
  }

  shapes.push(...buildEngineArrowShapes({ suppress: engineGuidanceHidden, includeThreat: false }));

  if (engineEnabled && threatMode && threatEval.best && !engineGuidanceHidden) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as any, dest: uci.slice(2, 4) as any, brush: 'red' });
  }

  // Board review glyphs: suppress during retro/practice so the opponent's previous move
  // (ctrl.node.uci) does not draw a confusing ?/??  arrow on the exercise/practice position.
  if (showBoardReviewGlyphs && !engineGuidanceHidden) {
    shapes.push(...buildCurrentNodeReviewGlyphShapes(ctrl));
  }

  // During retro solving, show the user's game mistake as a red arrow so they
  // know which move they need to improve upon.  This replaces the generic
  // played-move arrow (which showed children[0] — the opponent's next move from
  // the perspective of the parent position) with the specific candidate move.
  if (retroHidden && ctrl.retro!.isSolving()) {
    const c = ctrl.retro!.current();
    if (c && ctrl.path === c.parentPath) {
      shapes.push(buildArrowShape(c.playedMove, 'red'));
    }
  }

  // Only show the generic played-move arrow (children[0]) when NOT in retro mode,
  // on the original game mainline.  Suppressed during retro to avoid showing the
  // opponent's reply as if it were the candidate mistake.
  // Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts onMainline gate.
  if (showPlayedArrow && pathIsMainline(ctrl.root, ctrl.path) && !engineGuidanceHidden) {
    const nextNode = ctrl.node.children[0];
    if (nextNode?.uci) {
      const uci = nextNode.uci;
      const nextEval = evalCache.get(ctrl.path + nextNode.id);
      const visibleEval = visibleEvalForFen(ctrl.node.fen);
      // Use plain red without lineWidth modifier so the arrowhead uses the well-known
      // 'r' brush key (marker arrowhead-r is guaranteed in defs).
      // Mirrors lichess-org/lila: ui/analyse/src/autoShape.ts compute() played-move brush.
      const playedEval = visibleEval.best !== uci ? nextEval : undefined;
      shapes.push(buildArrowShape(uci, 'red'));
      const labelShape = buildArrowLabelShape(uci, playedEval);
      if (labelShape) shapes.push(labelShape);
    }
  }

  const koOverlay = buildKoOverlayShape(ctrl.node.fen);
  if (koOverlay) shapes.push(koOverlay);


  shapes.push(...(sink.extraAutoShapesProvider?.() ?? []));

  return shapes;
}








export function setExtraArrowSuppressProvider(fn: (() => boolean) | null): void {
  sink.extraArrowSuppressProvider = fn;
}

// Extra auto-shape provider seam — lets a feature module (e.g. analysis practice) merge
// its own shapes into the shared auto-shape pipeline without owning cg.setAutoShapes.
// Mirrors lichess-org/lila: ui/analyse/src/autoShape.ts practice hint/hover shape merge.
export function setExtraAutoShapesProvider(fn: (() => DrawShape[]) | null): void {
  sink.extraAutoShapesProvider = fn;
}

export function buildEngineArrowShapes(opts?: { suppress?: boolean; includeThreat?: boolean; fen?: string }): DrawShape[] {
  const shapes: DrawShape[] = [];
  const suppress = opts?.suppress === true;
  const includeThreat = opts?.includeThreat !== false;
  const visibleFen = opts?.fen ?? sink.getCtrl().node.fen;

  if (engineEnabled && showEngineArrows && !suppress && currentEvalMatchesFen(visibleFen)) {
    if (currentEval.best) {
      const uci = currentEval.best;
      if (isUciLegalInFen(visibleFen, uci)) {
        shapes.push(buildArrowShape(uci, 'paleBlue'));
        const labelShape = buildArrowLabelShape(uci, currentEval);
        if (labelShape) shapes.push(labelShape);
      } else {
        recordVisibleGuidanceDrop('illegal-visible-best-arrow', visibleFen, uci);
      }
    }
    // Secondary PV lines — paleGrey with lineWidth scaled by win% diff
    // Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts compute()
    if (arrowAllLines) {
      const topWc = evalWinChances(currentEval) ?? 0;
      for (const line of currentEval.lines ?? []) {
        if (!line.best) continue;
        const lineWc = evalWinChances(line) ?? 0;
        const shift = Math.abs(topWc - lineWc) / 2;
        if (shift >= 0.2) continue;
        const lineWidth = Math.max(2, Math.round(12 - shift * 50));
        const uci = line.best;
        if (isUciLegalInFen(visibleFen, uci)) {
          shapes.push(buildArrowShape(uci, 'paleGrey', { lineWidth }));
          const labelShape = buildArrowLabelShape(uci, line);
          if (labelShape) shapes.push(labelShape);
        } else {
          recordVisibleGuidanceDrop('illegal-visible-line-arrow', visibleFen, uci);
        }
      }
    }
  }

  if (includeThreat && engineEnabled && threatMode && threatEval.best && !suppress) {
    const uci = threatEval.best;
    shapes.push({ orig: uci.slice(0, 2) as any, dest: uci.slice(2, 4) as any, brush: 'red' });
  }

  return shapes;
}

function buildArrowShape(
  uci: string,
  brush: string,
  modifiers?: DrawShape['modifiers'],
): DrawShape {
  const shape: DrawShape = {
    orig: uci.slice(0, 2) as any,
    dest: uci.slice(2, 4) as any,
    brush,
  };
  if (modifiers) shape.modifiers = modifiers;
  return shape;
}

function buildArrowLabelShape(
  uci: string,
  ev?: Pick<PositionEval, 'cp' | 'mate'> | Pick<EvalLine, 'cp' | 'mate'>,
): DrawShape | null {
  const labelSvg = buildArrowLabelSvg(ev);
  if (!labelSvg) return null;
  return {
    orig: uci.slice(0, 2) as any,
    dest: uci.slice(2, 4) as any,
    customSvg: { html: labelSvg, center: 'label' },
  };
}

function buildArrowLabelSvg(ev?: Pick<PositionEval, 'cp' | 'mate'> | Pick<EvalLine, 'cp' | 'mate'>): string | null {
  if (!showArrowLabels || !ev) return null;
  if (ev.cp === undefined && ev.mate === undefined) return null;
  const text = formatScore(ev);
  return `<text x="50" y="54" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="${arrowLabelSize}" font-weight="400" fill="#fff" stroke="rgba(0,0,0,0.72)" stroke-width="2" paint-order="stroke">${escapeArrowLabelText(text)}</text>`;
}

function escapeArrowLabelText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function buildCurrentNodeReviewGlyphShapes(ctrl: AnalyseCtrl): DrawShape[] {
  const glyphNode = currentNodeBoardGlyphNode(ctrl);
  return glyphNode ? buildBoardGlyphShapes(glyphNode) : [];
}

function currentNodeBoardGlyphNode(ctrl: AnalyseCtrl): { uci: string; san: string; glyphs: Glyph[] } | null {
  const { node, path } = ctrl;
  if (!node.uci || !node.san) return null;
  if (node.glyphs?.length) return { uci: node.uci, san: node.san, glyphs: node.glyphs };

  const cached = evalCache.get(path);
  if (!cached) return null;

  const parentCached = evalCache.get(pathInit(path));
  const playedBest = node.uci === parentCached?.best;
  if (playedBest) return null;

  const label = cached.label ?? (cached.loss !== undefined ? classifyLoss(cached.loss) : null);
  const symbol = labelToBoardReviewSymbol(label);
  if (!symbol) return null;

  return {
    uci: node.uci,
    san: node.san,
    glyphs: [{ id: 0, name: symbol, symbol }],
  };
}

function labelToBoardReviewSymbol(label: MoveLabel | null | undefined): string | null {
  if (label === 'blunder') return '??';
  if (label === 'mistake') return '?';
  if (label === 'inaccuracy') return '?!';
  return null;
}

// SVG content (injected into Chessground's 100×100 viewBox wrapper) for the KO
// overlay placed on the losing king's square at checkmate.
// Inlined from public/images/ko_purple.svg — avoids async <image> load issues.
// IDs prefixed with "ko-" to avoid conflicts with other inline SVG defs on the page.
const KO_PATH = 'M 398 142 L 368 128 L 344 127 L 340 131 L 327 133 L 320 130 L 316 135 L 302 137 L 285 144 L 281 140 L 278 147 L 266 144 L 267 149 L 257 162 L 309 159 L 311 162 L 307 165 L 294 166 L 289 171 L 282 172 L 267 184 L 258 187 L 249 204 L 243 209 L 243 217 L 240 220 L 238 219 L 230 234 L 230 245 L 226 248 L 220 246 L 215 269 L 219 277 L 217 282 L 222 294 L 233 304 L 232 306 L 236 311 L 247 318 L 264 322 L 296 322 L 322 313 L 327 308 L 343 301 L 378 273 L 401 242 L 416 212 L 420 196 L 419 175 L 415 162 Z M 251 128 L 160 170 L 171 125 L 168 117 L 145 112 L 131 126 L 109 164 L 89 213 L 45 238 L 55 242 L 48 250 L 50 255 L 38 264 L 42 267 L 59 260 L 62 273 L 59 288 L 42 322 L 41 331 L 47 325 L 43 349 L 53 329 L 56 332 L 52 342 L 65 327 L 71 330 L 68 341 L 78 326 L 84 328 L 83 333 L 87 331 L 116 257 L 121 259 L 146 296 L 200 340 L 226 349 L 237 344 L 220 330 L 230 327 L 189 285 L 164 240 L 153 236 L 151 228 L 162 217 L 166 205 L 181 201 L 185 195 L 247 164 L 249 151 L 238 151 L 236 146 L 253 136 L 244 136 Z M 371 169 L 376 177 L 376 183 L 375 184 L 376 190 L 368 203 L 368 206 L 365 209 L 362 216 L 358 221 L 356 225 L 355 232 L 349 239 L 348 246 L 340 251 L 341 252 L 340 255 L 342 257 L 332 263 L 329 268 L 327 268 L 316 274 L 311 272 L 303 277 L 304 278 L 303 283 L 296 288 L 294 288 L 293 285 L 284 285 L 278 282 L 276 280 L 277 278 L 273 277 L 270 274 L 270 271 L 267 266 L 267 257 L 269 254 L 269 249 L 271 243 L 276 237 L 278 232 L 282 228 L 283 225 L 301 206 L 316 193 L 327 186 L 331 182 L 337 179 L 336 176 L 337 174 L 342 170 L 354 163 Z M 234 304 L 236 302 L 237 302 L 238 301 L 240 303 L 242 300 L 246 300 L 247 301 L 247 303 L 251 303 L 252 302 L 254 302 L 255 303 L 257 303 L 258 302 L 260 304 L 260 305 L 262 307 L 265 307 L 265 306 L 266 305 L 267 305 L 268 306 L 271 306 L 272 307 L 272 308 L 271 309 L 271 310 L 273 310 L 274 311 L 274 310 L 275 309 L 279 309 L 280 310 L 284 310 L 285 311 L 285 313 L 284 314 L 282 314 L 281 313 L 279 313 L 279 314 L 280 313 L 281 314 L 281 315 L 283 315 L 284 316 L 284 317 L 283 318 L 283 320 L 282 321 L 281 320 L 281 321 L 280 322 L 279 321 L 275 321 L 274 322 L 273 322 L 272 321 L 270 321 L 269 320 L 267 320 L 266 321 L 265 320 L 261 320 L 260 319 L 257 319 L 256 318 L 253 318 L 252 317 L 249 317 L 248 316 L 246 316 L 243 313 L 242 313 L 239 310 L 238 310 L 237 309 L 237 308 L 234 305 Z';
const KO_SVG_HTML = [
  '<defs>',
  '<linearGradient id="ko-grad" x1="0%" y1="20%" x2="100%" y2="80%">',
  '<stop offset="0%" stop-color="#f3b7ff"/>',
  '<stop offset="18%" stop-color="#c86bff"/>',
  '<stop offset="48%" stop-color="#8a35ff"/>',
  '<stop offset="100%" stop-color="#3d0b73"/>',
  '</linearGradient>',
  '<filter id="ko-glow" x="-20%" y="-20%" width="140%" height="140%">',
  '<feGaussianBlur stdDeviation="1.4" result="blur"/>',
  '<feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>',
  '</filter>',
  '<filter id="ko-ds" x="-25%" y="-25%" width="150%" height="150%">',
  '<feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="rgba(0,0,0,0.9)"/>',
  '</filter>',
  '</defs>',
  '<g filter="url(#ko-ds)">',
  '<svg viewBox="0 0 433 405" width="100" height="100">',
  '<g filter="url(#ko-glow)">',
  `<path d="${KO_PATH}" fill="url(#ko-grad)" fill-rule="evenodd" stroke="#f8dcff" stroke-width="1.6" stroke-linejoin="round"/>`,
  '</g>',
  '</svg>',
  '</g>',
].join('');

function buildKoOverlayShape(fen: string): DrawShape | null {
  const visibleEval = visibleEvalForFen(fen);
  if (visibleEval.mate !== 0) return null;
  const losingColor = fen.split(' ')[1] === 'b' ? 'black' : 'white';
  const kingSquare = findKingSquare(fen, losingColor);
  if (!kingSquare) return null;
  return {
    orig: kingSquare as any,
    customSvg: { html: KO_SVG_HTML },
  };
}

function findKingSquare(fen: string, color: 'white' | 'black'): string | null {
  const board = fen.split(' ')[0] ?? '';
  const target = color === 'white' ? 'K' : 'k';
  let rank = 8;
  let file = 0;
  for (const ch of board) {
    if (ch === '/') {
      rank--;
      file = 0;
      continue;
    }
    const empty = Number.parseInt(ch, 10);
    if (!Number.isNaN(empty)) {
      file += empty;
      continue;
    }
    if (ch === target) return `${'abcdefgh'[file]}${rank}`;
    file++;
  }
  return null;
}

/**
 * Apply arrow shapes immediately (navigation, cache hits, engine off).
 * Called directly when we don't need the settling delay.
 */
export function syncArrow(): void {
  const cg = sink.getCgInstance();
  if (!cg) return;
  if (sink.arrowDebounceTimer !== null) { clearTimeout(sink.arrowDebounceTimer); sink.arrowDebounceTimer = null; }
  sink.arrowSuppressUntil = 0;
  applyAutoShapes(buildArrowShapes());
}

export function syncArrowForced(): void {
  sink.lastAutoShapesHash = null;
  syncArrow();
}

/**
 * Apply arrow shapes after a settling delay — used during live engine search
 * to avoid flickering as the engine changes its mind on each depth iteration.
 * Adapted from lichess-org/lila: ui/analyse/src/autoShape.ts (ARROW_SETTLE_MS).
 */
export function syncArrowDebounced(): void {
  const cg = sink.getCgInstance();
  if (!cg) return;
  const now = Date.now();
  if (now < sink.arrowSuppressUntil) {
    if (sink.arrowDebounceTimer === null) {
      sink.arrowDebounceTimer = setTimeout(() => {
        sink.arrowDebounceTimer = null;
        sink.arrowSuppressUntil = 0;
        applyAutoShapes(buildArrowShapes());
      }, sink.arrowSuppressUntil - now);
    }
    return;
  }
  if (sink.arrowDebounceTimer !== null) { clearTimeout(sink.arrowDebounceTimer); }
  sink.arrowDebounceTimer = setTimeout(() => {
    sink.arrowDebounceTimer = null;
    applyAutoShapes(buildArrowShapes());
  }, 150);
}

/**
 * Arms the post-search arrow settle window. Called by engine/ctrl.ts's evalCurrentPosition()
 * immediately after a fresh syncArrow() clears stale arrows for a new position, so the first
 * live-engine info line doesn't repaint arrows until the window elapses. Extracted verbatim from
 * the two `arrowSuppressUntil = Date.now() + ARROW_SETTLE_MS;` call sites that lived inline in
 * engine/ctrl.ts before CCW-H01 (arrowSuppressUntil is now private to this module).
 */
export function armArrowSuppressWindow(): void {
  sink.arrowSuppressUntil = Date.now() + ARROW_SETTLE_MS;
}

function applyAutoShapes(shapes: DrawShape[]): void {
  const cg = sink.getCgInstance();
  if (!cg) return;
  if (cg !== sink.lastAutoShapesCg) {
    sink.lastAutoShapesCg = cg;
    sink.lastAutoShapesHash = null;
  }
  const nextHash = autoShapesHash(shapes);
  if (nextHash === sink.lastAutoShapesHash) return;
  sink.lastAutoShapesHash = nextHash;
  cg.setAutoShapes(shapes);
}

function autoShapesHash(shapes: DrawShape[]): string {
  return shapes.map(shape => [
    shape.orig ?? '',
    shape.dest ?? '',
    shape.brush ?? '',
    shape.piece ? `${shape.piece.color}|${shape.piece.role}|${shape.piece.scale ?? ''}` : '',
    shape.modifiers ? `${shape.modifiers.lineWidth ?? ''}|${shape.modifiers.hilite ?? ''}` : '',
    shape.customSvg ? `${shape.customSvg.center ?? ''}|${shape.customSvg.html}` : '',
    shape.label ? `${shape.label.text}|${shape.label.fill ?? ''}` : '',
    shape.below ? '1' : '',
  ].join('~')).join(';');
}
