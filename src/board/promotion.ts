// Board-neutral pawn-promotion chooser — controller + renderer.
//
// Extracted from the Analysis board's promotion-dialog PATTERN (src/board/index.ts
// renderPromotionDialog / completePromotion), decoupled from Analysis module globals
// (pendingPromotion, _getCtrl, orientation, completeMove, Analysis redraw) so ANY board
// surface (puzzles, and later Analysis itself) can own its own promotion state and wire
// its own ground/orientation/redraw/cancel/submit hooks.
//
// Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts (PromotionCtrl — the
// withGround-parameterised controller + renderPromotion). The consuming surface renders
// view() beside the board (lila ui/puzzle/src/view/main.ts:126 renders
// ctrl.promotion.view() as a sibling of the chessground element).
//
// Deliberate divergences from lila, all owner-locked by the sprint (Decision 2):
//   - The chooser is ALWAYS used — no auto-queen / AutoQueen preference path.
//   - No pre-move (premove) promotion path — the puzzle solve flow has none.
//   - The promoting color is derived from the destination rank (a pawn can only reach
//     rank 8 as white, rank 1 as black) rather than from chessground turnColor, so the
//     detection is correct regardless of when chessground toggles turnColor relative to
//     the events.move callback.

import type { Api as CgApi } from '@lichess-org/chessground/api';
import type { Key } from '@lichess-org/chessground/types';
import { key2pos } from '@lichess-org/chessground/util';
import type { Role } from 'chessops';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseSquare } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import { iconControlExplainerAttrs } from '../ui/controlExplainer';

/** Access the live Chessground instance for the owning surface, or undefined when unmounted. */
export type WithGround = <A>(f: (g: CgApi) => A) => A | undefined;

/** Hooks a board surface provides to instantiate a promotion controller. */
export interface PromotionHooks {
  /** Access the live Chessground instance for the surface. */
  withGround: WithGround;
  /** The surface's current board orientation. */
  orientation: () => 'white' | 'black';
  /** Trigger a re-render of the surface (so view() is re-evaluated). */
  redraw: () => void;
  /** Called when the chooser is dismissed without a selection (restore the board). */
  cancel: () => void;
  /** Called with orig/dest and the chosen role once the user picks a piece. */
  submit: (orig: Key, dest: Key, role: Role) => void;











  applyPromotedVisual?: (postPromotionFen: string) => void;
}

/** The four promotable roles, in the vertical stacking order used by the chooser. */
const PROMOTABLE_ROLES: Role[] = ['queen', 'knight', 'rook', 'bishop'];

interface Promoting {
  orig: Key;
  dest: Key;
  /** Color of the promoting pawn (white → rank 8, black → rank 1). */
  color: 'white' | 'black';






  preMoveFen: string | null;
}








function detectPromotingPawn(fen: string, orig: Key, dest: Key): 'white' | 'black' | null {
  const destRank = dest[1];
  if (destRank !== '8' && destRank !== '1') return null;
  try {
    const setup = parseFen(fen);
    if (setup.isErr) return null;
    const pos = Chess.fromSetup(setup.value);
    if (pos.isErr) return null;
    const sq = parseSquare(orig);
    if (sq === undefined) return null;
    const piece = pos.value.board.get(sq);
    if (piece?.role !== 'pawn') return null;
    return destRank === '8' ? 'white' : 'black';
  } catch {
    return null;
  }
}







function promotedPositionFen(preMoveFen: string, orig: Key, dest: Key, role: Role): string | null {
  try {
    const setup = parseFen(preMoveFen);
    if (setup.isErr) return null;
    const pos = Chess.fromSetup(setup.value);
    if (pos.isErr) return null;
    const from = parseSquare(orig);
    const to = parseSquare(dest);
    if (from === undefined || to === undefined) return null;
    const move = { from, to, promotion: role };
    if (!pos.value.isLegal(move)) return null;
    pos.value.play(move);
    return makeFen(pos.value.toSetup());
  } catch {
    return null;
  }
}

/**
 * Visually replace a pawn that has reached the back rank with the chosen piece.
 * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts promote().
 */
export function promote(g: CgApi, key: Key, role: Role): void {
  const piece = g.state.pieces.get(key);
  if (piece && piece.role === 'pawn') {
    g.setPieces(new Map([[key, { color: piece.color, role, promoted: true }]]));
  }
}

/**
 * Board-neutral promotion controller. One instance per mounted board surface.
 * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts PromotionCtrl.
 */
export class PromotionCtrl {
  private promoting: Promoting | null = null;

  constructor(private readonly hooks: PromotionHooks) {}

  /** Whether a promotion choice is currently pending. */
  isActive(): boolean {
    return this.promoting !== null;
  }

  /**
   * If (orig, dest) is a pawn move to the back rank, open the chooser and return true;
   * otherwise do nothing and return false. The chooser is ALWAYS used — there is no
   * auto-queen shortcut (sprint Decision 2, locked).
   *
   * The piece is read from either orig or dest for robustness: chessground commits the
   * piece to dest before firing events.move (see @lichess-org/chessground board.baseMove),
   * so dest is the normal hit — the orig fallback covers callers that consult the
   * controller before a board mutation has applied (e.g. programmatic flows).
   *
   * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts PromotionCtrl.start.
   */
  start(orig: Key, dest: Key): boolean {
    return (
      this.hooks.withGround(g => {
        const piece = g.state.pieces.get(dest) ?? g.state.pieces.get(orig);
        const destRank = dest[1];
        if (piece?.role === 'pawn' && (destRank === '8' || destRank === '1')) {
          this.promoting = { orig, dest, color: destRank === '8' ? 'white' : 'black', preMoveFen: null };
          this.hooks.redraw();
          return true;
        }
        return false;
      }) || false
    );
  }











  startFromFen(preMoveFen: string, orig: Key, dest: Key): boolean {
    const color = detectPromotingPawn(preMoveFen, orig, dest);
    if (!color) return false;
    this.promoting = { orig, dest, color, preMoveFen };
    this.hooks.redraw();
    return true;
  }

  /**
   * User picked a role — visually promote the pawn, submit the suffixed move, and clear
   * the pending state. Adapted from lichess-org/lila: PromotionCtrl.finish / doPromote.
   */
  finish(role: Role): void {
    const promoting = this.promoting;
    if (!promoting) return;
    this.promoting = null;
    if (promoting.preMoveFen !== null) {



      const applyVisual = this.hooks.applyPromotedVisual;
      if (applyVisual) {
        const postFen = promotedPositionFen(promoting.preMoveFen, promoting.orig, promoting.dest, role);
        if (postFen) applyVisual(postFen);
      }
    } else {
      // Legacy raw-ground path (Analysis + current puzzle solve mount) — UNCHANGED.
      this.hooks.withGround(g => promote(g, promoting.dest, role));
    }
    this.hooks.submit(promoting.orig, promoting.dest, role);
    this.hooks.redraw();
  }

  /**
   * User dismissed the chooser without picking — clear the pending state and let the
   * surface restore the board. Adapted from lichess-org/lila: PromotionCtrl.cancel.
   */
  cancel(): void {
    if (!this.promoting) return;
    this.promoting = null;
    this.hooks.cancel();
    this.hooks.redraw();
  }

  /**
   * Programmatic teardown — clear any pending promotion WITHOUT board side effects.
   * Called on round change / board destroy so a pending chooser never survives into a
   * new round (sprint Decision 2 cancellation contract).
   */
  reset(): void {
    this.promoting = null;
  }

  /**
   * Render the chooser overlay, or null when no promotion is pending. The returned VNode
   * is a `.cg-wrap.promotion-wrap` so chessground's piece background-image rules cascade;
   * the surface renders it as a sibling of the board `.cg-wrap`.
   * Adapted from lichess-org/lila: ui/lib/src/game/promotion.ts renderPromotion.
   */
  view(): VNode | null {
    const promoting = this.promoting;
    if (!promoting) return null;
    return this.renderPromotion(promoting.dest, promoting.color, this.hooks.orientation());
  }

  private renderPromotion(dest: Key, color: 'white' | 'black', orientation: 'white' | 'black'): VNode {
    const [file] = key2pos(dest);
    // Column left% — same formula as the Analysis dialog pattern.
    const left = orientation === 'white' ? file * 12.5 : (7 - file) * 12.5;
    const vertical = color === orientation ? 'top' : 'bottom';

    return h(
      'div.cg-wrap.promotion-wrap',
      { hook: { insert: vnode => (vnode.elm as HTMLElement).addEventListener('click', () => this.cancel()) } },
      [
        h(
          'div#promotion-choice.' + vertical,
          {},
          PROMOTABLE_ROLES.map((role, i) => {
            const top = (color === orientation ? i : 7 - i) * 12.5;
            return h(
              'square',
              {
                attrs: { style: `top:${top}%;left:${left}%`, role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: `Promote to ${role}`, description: `Complete the move by promoting the pawn to a ${role}.` }) },
                on: {
                  click: (e: Event) => {
                    e.stopPropagation();
                    this.finish(role);
                  },
                  keydown: (e: KeyboardEvent) => {
                    if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
                    e.preventDefault();
                    e.stopPropagation();
                    this.finish(role);
                  },
                },
              },
              [h(`piece.${role}.${color}`)],
            );
          }),
        ),
      ],
    );
  }
}
