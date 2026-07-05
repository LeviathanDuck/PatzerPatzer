









import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { Config as CgConfig } from '@lichess-org/chessground/config';
import type { Key, MouchEvent } from '@lichess-org/chessground/types';
import { eventPosition, opposite } from '@lichess-org/chessground/util';
import { h, type VNode } from 'snabbdom';
import type EditorCtrl from './ctrl';

// Mirrors lila's editor board config exactly: free movement for both colors, no
// premoves, no click-to-select highlight, no last-move highlight, drag ghost with
// delete-on-drop-off, low animation duration.
export function makeConfig(ctrl: EditorCtrl): CgConfig {
  return {
    fen: ctrl.getFen(),
    orientation: ctrl.orientation,
    coordinates: true,
    autoCastle: false,
    movable: {
      free: true,
      color: 'both',
    },
    animation: {
      duration: 200,
    },
    premovable: {
      enabled: false,
    },
    draggable: {
      showGhost: true,
      deleteOnDropOff: true,
    },
    selectable: {
      enabled: false,
    },
    highlight: {
      lastMove: false,
    },
    events: {
      change: ctrl.onChange,
    },
  };
}

// Pushes the ctrl's current derived FEN into an already-mounted chessground
// instance. Used for programmatic state changes (start position / clear board /
// pasted FEN) that originate outside a chessground drag/drop event.
export function syncBoard(ctrl: EditorCtrl): void {
  ctrl.chessground?.set({ fen: ctrl.getFen() });
}

const isLeftButton = (e: MouchEvent): boolean => e.buttons === 1 || e.button === 1;
const isLeftClick = (e: MouchEvent): boolean => isLeftButton(e) && !e.ctrlKey;
const isRightClick = (e: MouchEvent): boolean => e.button === 2 || (!!e.ctrlKey && isLeftButton(e));

// Module-scoped placement bookkeeping — mirrors lila's onMouseEvent locals.
// Safe as module state because only one editor board is ever mounted at a time.
let downKey: Key | undefined;
let lastKey: Key | undefined;
let placeDelete = false;

function deletePiece(ctrl: EditorCtrl, key: Key): void {
  ctrl.chessground!.setPieces(new Map([[key, undefined]]));
  ctrl.onChange();
}

function deleteOrHidePiece(ctrl: EditorCtrl, key: Key, e: MouchEvent): void {
  if (e.type === 'touchstart') {
    if (ctrl.chessground!.state.pieces.has(key)) {
      const current = ctrl.chessground!.state.draggable.current;
      const element = current && typeof current.element !== 'function' ? current.element : undefined;
      if (element) element.style.display = 'none';
      ctrl.chessground!.cancelMove();
    }
    document.addEventListener('touchend', () => deletePiece(ctrl, key), { once: true });
  } else if (e.type === 'mousedown' || key !== downKey) {
    deletePiece(ctrl, key);
  }
}

// Ported from lila's ui/editor/src/chessground.ts onMouseEvent. Handles the full
// placement interaction: click/drag places the selected spare piece, clicking a
// square already holding that exact piece toggles it off, the trash tool deletes
// on click, and right-click (or ctrl-click) with a piece tool selected flips the
// tool's color instead of opening the browser context menu.
function onMouseEvent(ctrl: EditorCtrl): (e: MouchEvent) => void {
  return function (e: MouchEvent): void {
    const sel = ctrl.selected;
    const isMouseOrTouchStart = e.type === 'mousedown' || e.type === 'touchstart';

    // Do not let a touchstart also fire a synthetic mousedown for the same tap.
    if (sel !== 'pointer' && e.cancelable && (e.type === 'touchstart' || e.type === 'touchmove')) {
      e.preventDefault();
    }

    if (isLeftClick(e) || e.type === 'touchstart' || e.type === 'touchmove') {
      if (sel === 'pointer' || ctrl.chessground?.state.draggable.current?.newPiece) return;
      const pos = eventPosition(e);
      if (!pos) return;
      const key = ctrl.chessground!.getKeyAtDomPos(pos);
      if (!key) return;
      if (isMouseOrTouchStart) downKey = key;
      if (sel === 'trash') {
        deleteOrHidePiece(ctrl, key, e);
      } else {
        const existingPiece = ctrl.chessground!.state.pieces.get(key);
        const piece = { color: sel[0], role: sel[1] };
        const samePiece =
          existingPiece && piece.color === existingPiece.color && piece.role === existingPiece.role;

        if (isMouseOrTouchStart && samePiece) {
          deleteOrHidePiece(ctrl, key, e);
          placeDelete = true;
          const endEvents: Record<string, string> = { mousedown: 'mouseup', touchstart: 'touchend' };
          document.addEventListener(endEvents[e.type]!, () => (placeDelete = false), { once: true });
        } else if (!placeDelete && (isMouseOrTouchStart || key !== lastKey)) {
          ctrl.chessground!.setPieces(new Map([[key, piece]]));
          ctrl.onChange();
          ctrl.chessground!.cancelMove();
        }
      }
      lastKey = key;
    } else if (isRightClick(e)) {
      if (sel !== 'pointer' && e.type === 'contextmenu') {
        e.preventDefault();
        if (sel !== 'trash') {
          ctrl.chessground!.cancelMove();
          ctrl.selected = [opposite(sel[0]), sel[1]];
          ctrl.redraw();
        }
      }
    }
  };
}

function bindEvents(el: HTMLElement, ctrl: EditorCtrl): void {
  const handler = onMouseEvent(ctrl);
  (['touchstart', 'touchmove', 'mousedown', 'mousemove', 'contextmenu'] as const).forEach(ev =>
    el.addEventListener(ev, handler as EventListener),
  );
}






function bindFlipKey(ctrl: EditorCtrl): () => void {
  const handler = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'f' || e.key === 'F') ctrl.setOrientation(opposite(ctrl.bottomColor()));
  };
  document.addEventListener('keydown', handler);
  return () => document.removeEventListener('keydown', handler);
}

export default function renderChessground(ctrl: EditorCtrl): VNode {
  let unbindFlipKey: (() => void) | undefined;
  return h('div.cg-wrap', {
    hook: {
      insert: vnode => {
        const el = vnode.elm as HTMLElement;
        ctrl.chessground = makeChessground(el, makeConfig(ctrl));
        bindEvents(el, ctrl);
        unbindFlipKey = bindFlipKey(ctrl);
      },
      destroy: () => {
        ctrl.chessground?.destroy();
        ctrl.chessground = undefined;
        unbindFlipKey?.();
      },
    },
  });
}
