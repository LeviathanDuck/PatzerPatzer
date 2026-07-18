











import type { MouchEvent } from '@lichess-org/chessground/types';
import { eventPosition, opposite } from '@lichess-org/chessground/util';
import { parseFen } from 'chessops/fen';
import type { Color, Role } from 'chessops/types';
import { makeSquare, parseSquare } from 'chessops/util';
import { h, type VNode } from 'snabbdom';
import type EditorCtrl from './ctrl';
import type { CastlingToggle, EditorState, Selected } from './ctrl';
import { buildFromPositionPgn } from './ctrl';
import renderChessground from './chessground';
import { ENDGAME_POSITIONS, OPENING_POSITIONS } from './positions';
import { saveCurrentToLibrary } from '../study/saveAction';
import { writeHashRoute } from '../router';
import { showToast } from '../ui/toast';
import { requestPracticeStartOnNextBoard } from '../analyse/practice/practiceCtrl';
import SaveFlowCtrl, { type SaveFlowContext, type SaveFlowResult } from '../save/saveFlowCtrl';
import renderSaveFlowModal from '../save/saveFlowView';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
  type ControlExplainer,
} from '../ui/controlExplainer';

const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

// 'pointer' | 'trash' | [Color, Role] -> a stable class/key string, matching
// lila's selectedToClass so the active tool can be highlighted via a CSS class.
function selectedToClass(s: Selected): string {
  return s === 'pointer' || s === 'trash' ? s : s.join(' ');
}

function paletteToolLabel(selected: Selected): string {
  if (selected === 'pointer') return 'Move pieces';
  if (selected === 'trash') return 'Remove pieces';
  return `Place ${selected[0]} ${selected[1]}`;
}

function paletteToolDescription(selected: Selected, isSelected: boolean): string {
  if (selected === 'pointer') {
    return isSelected
      ? 'Move pieces without adding or removing them; this tool is selected.'
      : 'Select the pointer tool to move pieces without adding or removing them.';
  }
  if (selected === 'trash') {
    return isSelected
      ? 'Remove pieces from the board; this tool is selected.'
      : 'Select the trash tool to remove pieces from the board.';
  }
  const piece = `${selected[0]} ${selected[1]}`;
  return isSelected
    ? `Add a ${piece} to the board; this piece tool is selected.`
    : `Select the ${piece} to add it to the board.`;
}

function onPaletteKeydown(ctrl: EditorCtrl, selected: Selected): (e: KeyboardEvent) => void {
  return e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (e.repeat) return;
    // Keyboard selection chooses the tool directly. It must not manufacture the pointer event
    // required by Chessground's dragNewPiece path.
    ctrl.selected = selected;
    ctrl.redraw();
  };
}

// Tracks the last touch position during a spare-piece drag so the touchend
// handler (added below) can resolve whether the drop landed on the board.
let lastTouchMovePos: [number, number] | undefined;

function onSelectSparePiece(ctrl: EditorCtrl, s: Selected, upEvent: string): (e: MouchEvent) => void {
  return function (e: MouchEvent): void {
    e.preventDefault();
    if (s === 'pointer' || s === 'trash') {
      ctrl.selected = s;
      ctrl.redraw();
    } else {
      ctrl.selected = 'pointer';
      ctrl.chessground?.dragNewPiece({ color: s[0], role: s[1] }, e, true);

      document.addEventListener(
        upEvent,
        (upE: MouchEvent) => {
          const eventPos = eventPosition(upE) || lastTouchMovePos;
          if (eventPos && ctrl.chessground?.getKeyAtDomPos(eventPos)) ctrl.selected = 'pointer';
          else ctrl.selected = s;
          ctrl.redraw();
        },
        { once: true },
      );
    }
  };
}

// Renders one spare-piece row: pointer tool, the six piece roles for `color`,
// then the trash tool. `position` is 'top' or 'bottom' for the functional
// layout class; the active `ctrl.selected` tool is highlighted.
function sparePieces(ctrl: EditorCtrl, color: Color, position: 'top' | 'bottom'): VNode {
  const selectedClass = selectedToClass(ctrl.selected);
  const pieces: Selected[] = ROLES.map(role => [color, role]);

  return h(
    'div',
    { attrs: { class: `spare spare-${position} spare-${color}` } },
    (['pointer', ...pieces, 'trash'] as Selected[]).map(s => {
      const className = selectedToClass(s);
      // Snabbdom tag selectors take one class per `.` segment, so a piece tuple's
      // "color role" class string (space-separated) needs its own selector form.
      const pieceSelector = s === 'pointer' || s === 'trash' ? `piece.${s}` : `piece.${s[0]}.${s[1]}`;
      const pieceAttrs =
        s !== 'pointer' && s !== 'trash' ? { 'data-color': s[0], 'data-role': s[1] } : {};
      const isDraggingNewPiece = !!ctrl.chessground?.state.draggable.current?.newPiece;
      const selectedSquare = selectedClass === className && !isDraggingNewPiece;
      const explainer = {
        label: paletteToolLabel(s),
        description: paletteToolDescription(s, selectedSquare),
      };
      return h(
        'div',
        {
          class: {
            'no-square': true,
            pointer: s === 'pointer',
            trash: s === 'trash',
            'selected-square': selectedSquare,
          },
          attrs: {
            role: 'button',
            tabindex: '0',
            'aria-pressed': String(selectedSquare),
            ...iconControlExplainerAttrs(explainer),
          },
          on: {
            mousedown: onSelectSparePiece(ctrl, s, 'mouseup'),
            touchstart: onSelectSparePiece(ctrl, s, 'touchend'),
            touchmove: (e: MouchEvent) => {
              lastTouchMovePos = eventPosition(e);
            },
            keydown: onPaletteKeydown(ctrl, s),
          },
        },
        [h('div', [h(pieceSelector, { attrs: pieceAttrs })])],
      );
    }),
  );
}

// --- Controls: side to move, castling, en passant, presets, start/clear/flip ---
// Mirrors lichess-org/lila ui/editor/src/view.ts `controls()`, minus the variant
// select and Chess960 position-ID input (standard chess only, locked decision).

const CASTLING_EXPLAINERS: Record<CastlingToggle, ControlExplainer & {
  color: Color;
  kingSquare: string;
  rookSquare: string;
}> = {
  K: {
    label: 'White kingside castling',
    description: 'Place the white king on e1 and a white rook on h1 to enable this castling right.',
    color: 'white', kingSquare: 'e1', rookSquare: 'h1',
  },
  Q: {
    label: 'White queenside castling',
    description: 'Place the white king on e1 and a white rook on a1 to enable this castling right.',
    color: 'white', kingSquare: 'e1', rookSquare: 'a1',
  },
  k: {
    label: 'Black kingside castling',
    description: 'Place the black king on e8 and a black rook on h8 to enable this castling right.',
    color: 'black', kingSquare: 'e8', rookSquare: 'h8',
  },
  q: {
    label: 'Black queenside castling',
    description: 'Place the black king on e8 and a black rook on a8 to enable this castling right.',
    color: 'black', kingSquare: 'e8', rookSquare: 'a8',
  },
};

function disabledCastlingDescription(ctrl: EditorCtrl, id: CastlingToggle): string {
  const config = CASTLING_EXPLAINERS[id];
  const board = parseFen(ctrl.chessground?.getFen() || ctrl.initialFen).unwrap(
    setup => setup.board,
    () => undefined,
  );
  const hasPiece = (square: string, role: Role): boolean => {
    const piece = board?.get(parseSquare(square)!);
    return piece?.color === config.color && piece.role === role;
  };
  const missing: string[] = [];
  if (!hasPiece(config.kingSquare, 'king')) missing.push(`${config.color} king on ${config.kingSquare}`);
  if (!hasPiece(config.rookSquare, 'rook')) missing.push(`${config.color} rook on ${config.rookSquare}`);
  return `Place the ${missing.join(' and a ')} to enable this castling right.`;
}

function castleCheckBox(ctrl: EditorCtrl, id: CastlingToggle, label: string, reversed: boolean): VNode {
  const enabled = ctrl.enabledCastlingToggles[id];
  const checked = ctrl.castlingToggles[id] && enabled;
  const explainer = enabled
    ? {
        label: CASTLING_EXPLAINERS[id].label,
        description: checked
          ? 'This castling right is currently enabled.'
          : 'Enable this castling right for the position.',
      }
    : { label: CASTLING_EXPLAINERS[id].label, description: disabledCastlingDescription(ctrl, id) };
  const input = h('input', {
    class: { 'not-allowed': !enabled },
    attrs: { type: 'checkbox', ...controlExplainerAttrs(explainer) },
    props: {
      checked,
      disabled: !enabled,
    },
    on: {
      change(e: Event) {
        ctrl.setCastlingToggle(id, (e.target as HTMLInputElement).checked);
      },
    },
  });
  const control = h('label', reversed ? [input, label] : [label, input]);
  return enabled ? control : renderDisabledControlExplainer(explainer, control);
}

function turnSelect(ctrl: EditorCtrl): VNode {
  return h('div.color', [
    h('label', { attrs: { for: 'editor-turn-select' } }, [h('strong', 'Side to move')]),
    h(
      'select#editor-turn-select',
      {
        attrs: controlExplainerAttrs({
          label: 'Side to move',
          description: `${ctrl.turn === 'white' ? 'White' : 'Black'} is currently selected to move.`,
        }),
        on: {
          change(e: Event) {
            ctrl.setTurn((e.target as HTMLSelectElement).value as Color);
          },
        },
        props: { value: ctrl.turn },
      },
      [
        h('option', { attrs: { value: 'white' } }, 'White to play'),
        h('option', { attrs: { value: 'black' } }, 'Black to play'),
      ],
    ),
  ]);
}

// En-passant target squares are always rank 6 (white to play, black just played the
// double-step) or rank 3 (black to play); `state.enPassantOptions` narrows the list
// to the files where a double-step could actually have just happened. Options for
// ineligible files stay in the DOM (hidden + disabled) rather than being omitted, to
// match lila's `hidden`/`disabled` pairing (the latter is a Safari `hidden` bug
// workaround for `<select>`).
function enPassantSelect(ctrl: EditorCtrl, state: EditorState): VNode {
  const rank = ctrl.turn === 'black' ? 3 : 6;
  const squares = 'abcdefgh'.split('').map(file => `${file}${rank}`);
  return h('div.enpassant', [
    h('label', { attrs: { for: 'enpassant-select' } }, 'En passant'),
    h(
      'select#enpassant-select',
      {
        attrs: controlExplainerAttrs({
          label: 'En passant square',
          description: ctrl.epSquare === undefined
            ? 'No en passant target square is currently set.'
            : `The en passant target square is currently ${makeSquare(ctrl.epSquare)}.`,
        }),
        on: {
          change(e: Event) {
            ctrl.setEnPassant(parseSquare((e.target as HTMLSelectElement).value));
          },
        },
        props: { value: ctrl.epSquare !== undefined ? makeSquare(ctrl.epSquare) : '' },
      },
      ['', ...squares].map(key =>
        h(
          'option',
          {
            attrs: {
              value: key,
              selected: (key ? parseSquare(key) : undefined) === ctrl.epSquare,
              hidden: Boolean(key && !state.enPassantOptions.includes(key)),
              disabled: Boolean(key && !state.enPassantOptions.includes(key)),
            },
          },
          key,
        ),
      ),
    ),
  ]);
}

// Truncates a FEN to its board/turn/castling/ep fields (the "EPD" prefix), so a
// preset's FEN (which may carry different halfmove/fullmove counters than the live
// board's derived FEN) can still be matched for the select's current value.
function fenToEpd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

function presetOption(fen: string, label: string): VNode {
  return h('option', { attrs: { value: fen } }, label);
}

function presetSelect(ctrl: EditorCtrl, state: EditorState): VNode {
  const epd = fenToEpd(state.fen);
  const openingMatch = OPENING_POSITIONS.find(p => fenToEpd(p.fen) === epd);
  const endgameMatch = ENDGAME_POSITIONS.find(p => fenToEpd(p.fen) === epd);
  const value = openingMatch?.fen ?? endgameMatch?.fen ?? '';
  const selectedName = openingMatch
    ? `${openingMatch.eco} ${openingMatch.name}`
    : endgameMatch?.name;
  return h('div.board-editor__preset', [
    h('label', { attrs: { for: 'editor-preset-select' } }, [h('strong', 'Board preset')]),
    h(
      'select#editor-preset-select.positions',
      {
        attrs: controlExplainerAttrs({
          label: 'Board preset',
          description: selectedName
            ? `Currently selected: ${selectedName}.`
            : 'Choose an opening or endgame position for the board.',
        }),
        props: { value },
        on: {
          change(e: Event) {
            const el = e.target as HTMLSelectElement;
            if (!el.value || !ctrl.setFen(el.value)) el.value = '';
          },
        },
      },
      [
        h('option', { attrs: { value: '' } }, 'Set the board'),
        h(
          'optgroup',
          { attrs: { label: 'Popular openings' } },
          OPENING_POSITIONS.map(p => presetOption(p.fen, `${p.eco} ${p.name}`)),
        ),
        h(
          'optgroup',
          { attrs: { label: 'Endgame positions' } },
          ENDGAME_POSITIONS.map(p => presetOption(p.fen, p.name)),
        ),
      ],
    ),
  ]);
}













let _activeEditorSaveFlow: SaveFlowCtrl | null = null;
let _editorSaveFlowGeneration = 0;
let _editorSaveFlowPending = false;

function discardEditorSaveFlow(): void {
  _editorSaveFlowGeneration++;
  _editorSaveFlowPending = false;
  _activeEditorSaveFlow = null;
}

function editorSaveFlowContext(): SaveFlowContext {
  return {
    line: 'From Board Editor — save this position',
    source: 'Board Editor — "to Study" action',
  };
}

/**
 * Persists a resolved save-flow result. Keeps building the from-position PGN and the base
 * source/title/tags exactly as before this task, then layers the categorization fields
 * (destination/purpose/notes/uncategorized) from the modal onto the same single
 * saveCurrentToLibrary() write before navigating to the created item.
 */
function persistEditorSaveFlowResult(
  legalFen: string,
  result: SaveFlowResult,
  owner: SaveFlowCtrl,
  generation: number,
  redraw: () => void,
): void {
  if (
    _editorSaveFlowPending
    || _activeEditorSaveFlow !== owner
    || _editorSaveFlowGeneration !== generation
  ) return;

  const baseTags = ['editor'];
  const metadata: Parameters<typeof saveCurrentToLibrary>[1] = {
    source: 'manual',
    title: 'Board Editor position',
    tags: baseTags,
  };
  if (result.mode === 'quick') {
    metadata.uncategorized = true;
  } else if (result.destination !== undefined) {
    metadata.destination = result.destination;
  }
  if (result.purpose !== undefined) metadata.purpose = result.purpose;
  if (result.notes !== undefined) metadata.notes = result.notes;
  if (result.tags.length > 0) metadata.tags = [...baseTags, ...result.tags];

  _editorSaveFlowPending = true;
  saveCurrentToLibrary(buildFromPositionPgn(legalFen), metadata)
    .then(item => {
      if (_activeEditorSaveFlow !== owner || _editorSaveFlowGeneration !== generation) return;
      discardEditorSaveFlow();
      writeHashRoute(`#/study/${item.id}`);
    })
    .catch(error => {
      if (_activeEditorSaveFlow !== owner || _editorSaveFlowGeneration !== generation) return;
      _editorSaveFlowPending = false;
      console.warn('[editor] save to Study Library failed', error);
      showToast('Could not save to Study Library. Check storage and try again.');
      redraw();
    });
}

/** Opens the universal save-flow modal for the "to Study" action (P2-SAVE-1). */
function openEditorSaveFlow(legalFen: string, redraw: () => void): void {
  discardEditorSaveFlow();
  const generation = _editorSaveFlowGeneration;
  const flow = new SaveFlowCtrl({
    itemType: 'game',
    context: editorSaveFlowContext(),
    onResolve: result => {
      persistEditorSaveFlowResult(legalFen, result, flow, generation, redraw);
    },
    onCancel: () => {
      if (_activeEditorSaveFlow !== flow || _editorSaveFlowGeneration !== generation) return;
      discardEditorSaveFlow();
      redraw();
    },
  }, redraw);
  _activeEditorSaveFlow = flow;
  redraw();
}










export function resetEditorSaveFlow(): void {
  discardEditorSaveFlow();
}

/**
 * Renders the active "to Study" save-flow modal, or null when none is open. Mounted inside
 * renderEditor()'s own returned tree rather than a main.ts overlay slot (see comment above).
 */
function renderActiveEditorSaveFlowModal(): VNode | null {
  return _activeEditorSaveFlow ? renderSaveFlowModal(_activeEditorSaveFlow) : null;
}













function actionsRow(ctrl: EditorCtrl, state: EditorState): VNode {
  const legalFen = state.legalFen;
  const playable = state.playable;
  const analysisExplainer = legalFen
    ? {
        label: 'Open Analysis Board',
        description: 'Open a new Analysis Board from this position.',
      }
    : {
        label: 'Open Analysis Board',
        description: 'Set up a legal position before opening it in Analysis.',
      };
  const continueExplainer = playable
    ? {
        label: 'Continue against computer',
        description: 'Open this position in Analysis and continue against the computer.',
      }
    : {
        label: 'Continue against computer',
        description: legalFen
          ? 'This position is already finished, so there is no move to continue from.'
          : 'Set up a legal position before continuing against the computer.',
      };
  const studyExplainer = legalFen
    ? {
        label: 'Save position to Study',
        description: 'Open the save flow for this position in the Study Library.',
      }
    : {
        label: 'Save position to Study',
        description: 'Set up a legal position before saving it to Study.',
      };
  const analysisControl = h(
    'button.button.button-empty',
    {
      class: { disabled: !legalFen },
      attrs: { type: 'button', disabled: !legalFen, ...controlExplainerAttrs(analysisExplainer) },
      on: {
        click: () => {
          if (!legalFen) return;
          ctrl.cfg.onAnalysisBoard?.(buildFromPositionPgn(legalFen));
        },
      },
    },
    'Analysis board',
  );
  const continueControl = h(
    'button.button.button-empty',
    {
      class: { disabled: !playable },
      attrs: { type: 'button', disabled: !playable, ...controlExplainerAttrs(continueExplainer) },
      on: {
        click: () => {
          if (!playable || !legalFen) return;
          requestPracticeStartOnNextBoard(legalFen, ctrl.bottomColor());
          ctrl.cfg.onAnalysisBoard?.(buildFromPositionPgn(legalFen));
        },
      },
    },
    'Continue from here',
  );
  const studyControl = h(
    'button.button.button-empty',
    {
      class: { disabled: !legalFen },
      attrs: { type: 'button', disabled: !legalFen, ...controlExplainerAttrs(studyExplainer) },
      on: {
        click: () => {
          if (!legalFen) return;
          openEditorSaveFlow(legalFen, ctrl.redraw);
        },
      },
    },
    'to Study',
  );
  return h('div.actions', [
    h(
      'button.button.button-empty',
      {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Start position',
          description: 'Replace the board with the standard starting position.',
        }) },
        on: { click: () => ctrl.startPosition() },
      },
      'Start position',
    ),
    h(
      'button.button.button-empty',
      {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Clear board',
          description: 'Remove every piece from the board.',
        }) },
        on: { click: () => ctrl.clearBoard() },
      },
      'Clear board',
    ),
    h(
      'button.button.button-empty',
      {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Flip board',
          description: `Show ${ctrl.bottomColor() === 'white' ? 'Black' : 'White'} at the bottom of the board.`,
        }) },
        // Mirrors lila's flip-board action button: toggle chessground directly and
        // run onChange explicitly, rather than ctrl.setOrientation (used by the `f`
        // hotkey in ./chessground.ts), so the URL's `color=` param stays in sync.
        on: {
          click: () => {
            ctrl.chessground?.toggleOrientation();
            ctrl.onChange();
          },
        },
      },
      'Flip board',
    ),
    legalFen ? analysisControl : renderDisabledControlExplainer(analysisExplainer, analysisControl),
    playable ? continueControl : renderDisabledControlExplainer(continueExplainer, continueControl),
    legalFen ? studyControl : renderDisabledControlExplainer(studyExplainer, studyControl),
  ]);
}

function controls(ctrl: EditorCtrl, state: EditorState): VNode {
  return h('div.board-editor__controls', [
    h('div.metadata', [
      turnSelect(ctrl),
      h('div.castling', [
        h('strong', 'Castling'),
        h('div', [castleCheckBox(ctrl, 'K', 'White O-O', false), castleCheckBox(ctrl, 'Q', 'O-O-O', true)]),
        h('div', [castleCheckBox(ctrl, 'k', 'Black O-O', false), castleCheckBox(ctrl, 'q', 'O-O-O', true)]),
      ]),
      enPassantSelect(ctrl, state),
    ]),
    presetSelect(ctrl, state),
    actionsRow(ctrl, state),
  ]);
}

// --- Inputs: FEN field (live validation, blur snap-back) and shareable URL ---
// Mirrors lichess-org/lila ui/editor/src/view.ts `inputs()`, minus the
// screenshot/GIF export link (no export service; documented deviation) and the
// Chess960-position-id keypress hook (no Chess960 support).

// The FEN input must not be clobbered by an unrelated redraw while the user is
// mid-edit (e.g. a spare-piece placement elsewhere triggers ctrl.onChange ->
// redraw). Only push the ctrl's canonical FEN into the DOM when this input is not
// the focused element; the live-typed value in the DOM is otherwise left alone
// until change/blur/Enter resolves it.
function fenInput(ctrl: EditorCtrl, fen: string): VNode {
  return h('input#editor-fen-input.board-editor__fen-input', {
    attrs: {
      spellcheck: 'false',
      enterkeyhint: 'done',
      ...controlExplainerAttrs({
        label: 'FEN',
        description: 'Edit the position notation; invalid FEN is rejected.',
      }),
    },
    hook: {
      insert: vnode => {
        (vnode.elm as HTMLInputElement).value = fen;
      },
      update: (_oldVnode, vnode) => {
        const el = vnode.elm as HTMLInputElement;
        if (document.activeElement !== el) el.value = fen;
      },
    },
    on: {
      change(e: Event) {
        const el = e.target as HTMLInputElement;
        ctrl.setFen(el.value.trim());
        el.reportValidity();
      },
      input(e: Event) {
        const el = e.target as HTMLInputElement;
        const valid = parseFen(el.value.trim()).isOk;
        el.setCustomValidity(valid ? '' : 'Invalid FEN');
      },
      blur(e: Event) {
        const el = e.target as HTMLInputElement;
        el.value = ctrl.getFen();
        el.setCustomValidity('');
      },
      keydown(e: KeyboardEvent) {
        // Enter applies the typed FEN: blurring fires `change` (apply) then our
        // `blur` handler (snap-back if the change left anything invalid/stale).
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      },
    },
  });
}

// Read-only shareable URL field. Always reflects `window.location.href`, which
// `EditorCtrl.onChange` keeps current via `history.replaceState` (src/main.ts
// `serializeEditorRoute`) before this view re-renders.
function urlField(): VNode {
  return h('input#editor-url-input.board-editor__url-input', {
    attrs: {
      readonly: true,
      spellcheck: 'false',
      ...controlExplainerAttrs({
        label: 'URL',
        description: 'Share this URL to open the current editor position.',
      }),
    },
    hook: {
      insert: vnode => {
        (vnode.elm as HTMLInputElement).value = window.location.href;
      },
      update: (_oldVnode, vnode) => {
        (vnode.elm as HTMLInputElement).value = window.location.href;
      },
    },
  });
}

function inputs(ctrl: EditorCtrl, fen: string): VNode {
  return h('div.board-editor__inputs', [
    h('p', [h('label', { attrs: { for: 'editor-fen-input' } }, [h('strong', 'FEN')]), fenInput(ctrl, fen)]),
    h('p', [h('label', { attrs: { for: 'editor-url-input' } }, [h('strong', 'URL')]), urlField()]),
  ]);
}

export default function renderEditor(ctrl: EditorCtrl): VNode {
  const color = ctrl.bottomColor();
  const state = ctrl.getState();
  return h('div.board-editor', [
    sparePieces(ctrl, opposite(color), 'top'),
    h('div.main-board', [renderChessground(ctrl)]),
    sparePieces(ctrl, color, 'bottom'),
    h('div.board-editor__tools', [controls(ctrl, state), inputs(ctrl, state.fen)]),
    renderActiveEditorSaveFlowModal(),
  ]);
}
