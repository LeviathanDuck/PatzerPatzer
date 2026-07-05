












import type { Api as CgApi } from '@lichess-org/chessground/api';
import { Board } from 'chessops/board';
import { Castles } from 'chessops/chess';
import { EMPTY_FEN, INITIAL_FEN, makeFen, parseCastlingFen, parseFen } from 'chessops/fen';
import type { Setup } from 'chessops/setup';
import { defaultSetup } from 'chessops/setup';
import type { Color, Role, Square } from 'chessops/types';
import { parseSquare } from 'chessops/util';
import { defaultPosition, setupPosition } from 'chessops/variant';

export type Redraw = () => void;

export type CastlingToggle = 'K' | 'Q' | 'k' | 'q';
export type CastlingToggles<T> = Record<CastlingToggle, T>;
export const CASTLING_TOGGLES: CastlingToggle[] = ['K', 'Q', 'k', 'q'];



export type Selected = 'pointer' | 'trash' | [Color, Role];

export interface EditorState {
  fen: string;
  legalFen: string | undefined;
  playable: boolean;
  enPassantOptions: string[];
}

export interface EditorConfig {
  fen?: string;
  orientation?: Color;
  onChange?: (fen: string) => void;



  onAnalysisBoard?: (pgn: string) => void;
}







export function buildFromPositionPgn(fen: string): string {
  return [
    '[Event "Board Editor"]',
    '[Site "?"]',
    '[Date "????.??.??"]',
    '[Round "?"]',
    '[White "?"]',
    '[Black "?"]',
    '[Result "*"]',
    `[FEN "${fen}"]`,
    '[SetUp "1"]',
    '',
    '*',
  ].join('\n');
}

// Standard-chess castling squares (no Chess960 support in this editor).
const CASTLING_SQUARES = {
  white: { king: 'e1', rookK: 'h1', rookQ: 'a1' },
  black: { king: 'e8', rookK: 'h8', rookQ: 'a8' },
} as const;

export default class EditorCtrl {
  chessground: CgApi | undefined;

  selected: Selected = 'pointer';
  orientation: Color;

  initialFen: string;
  turn: Color = 'white';
  castlingToggles: CastlingToggles<boolean> = { K: false, Q: false, k: false, q: false };
  enabledCastlingToggles: CastlingToggles<boolean> = { K: false, Q: false, k: false, q: false };
  epSquare: Square | undefined;
  halfmoves = 0;
  fullmoves = 1;
  guessCastlingToggles = false;

  constructor(
    readonly cfg: EditorConfig,
    readonly redraw: Redraw,
  ) {
    this.orientation = cfg.orientation ?? 'white';
    this.initialFen = (cfg.fen || INITIAL_FEN).replace(/_/g, ' ');
    parseFen(this.initialFen).unwrap(
      setup => this.setSetup(setup),
      () => {
        this.initialFen = INITIAL_FEN;
        this.setSetup(defaultSetup());
      },
    );
  }

  private readonly indexOfNthOccurrence = (haystack: string, needle: string, n: number): number => {
    let index = haystack.indexOf(needle);
    for (; n > 1 && index !== -1; n--) index = haystack.indexOf(needle, index + needle.length);
    return index;
  };



  private fenFixedEp(fen: string): string {
    let enPassant = fen.split(' ')[3] ?? '-';
    if (enPassant !== '-' && !this.getEnPassantOptions(fen).includes(enPassant)) {
      this.epSquare = undefined;
      enPassant = '-';
    }
    const epIndex = this.indexOfNthOccurrence(fen, ' ', 3) + 1;
    const epEndIndex = fen.indexOf(' ', epIndex);
    return `${fen.substring(0, epIndex)}${enPassant}${fen.substring(epEndIndex)}`;
  }

  onChange = (): void => {
    this.enabledCastlingToggles = this.computeCastlingToggles();
    if (this.guessCastlingToggles) {
      this.castlingToggles = { ...this.enabledCastlingToggles };
    }
    const fen = this.fenFixedEp(this.getFen());
    this.cfg.onChange?.(fen);
    this.redraw();
  };

  private castlingToggleFen(): string {
    const isCastlingToggleEnabled = (toggle: CastlingToggle) =>
      this.enabledCastlingToggles[toggle] && this.castlingToggles[toggle];
    return CASTLING_TOGGLES.filter(isCastlingToggleEnabled).join('');
  }

  private computeCastlingToggles(): CastlingToggles<boolean> {
    const board = this.getBoard();
    const whiteKingHome = board.king.intersect(board.white).has(parseSquare(CASTLING_SQUARES.white.king)!);
    const blackKingHome = board.king.intersect(board.black).has(parseSquare(CASTLING_SQUARES.black.king)!);
    const whiteRooks = board.rook.intersect(board.white);
    const blackRooks = board.rook.intersect(board.black);
    return {
      K: whiteKingHome && whiteRooks.has(parseSquare(CASTLING_SQUARES.white.rookK)!),
      Q: whiteKingHome && whiteRooks.has(parseSquare(CASTLING_SQUARES.white.rookQ)!),
      k: blackKingHome && blackRooks.has(parseSquare(CASTLING_SQUARES.black.rookK)!),
      q: blackKingHome && blackRooks.has(parseSquare(CASTLING_SQUARES.black.rookQ)!),
    };
  }

  private getBoard(): Board {
    const boardFen = this.chessground?.getFen() || this.initialFen;
    return parseFen(boardFen).unwrap(
      setup => setup.board,
      () => Board.empty(),
    );
  }

  private getSetup(): Setup {
    const board = this.getBoard();
    return {
      board,
      pockets: undefined,
      turn: this.turn,
      castlingRights: parseCastlingFen(board, this.castlingToggleFen()).unwrap(),
      epSquare: this.epSquare,
      remainingChecks: undefined,
      halfmoves: this.halfmoves,
      fullmoves: this.fullmoves,
    };
  }

  // Never throws: an arbitrary/illegal placement (e.g. missing kings) still
  // produces a FEN, it simply won't have a legalFen (see getPosition()).
  getFen(): string {
    return makeFen(this.getSetup());
  }

  getPosition(): ReturnType<typeof setupPosition> {
    return setupPosition('chess', this.getSetup());
  }

  private getLegalFen(): string | undefined {
    return this.getPosition().unwrap(
      pos => makeFen(pos.toSetup()),
      () => undefined,
    );
  }

  private isPlayable(): boolean {
    return this.getPosition().unwrap(
      pos => !pos.isEnd(),
      () => false,
    );
  }

  // hopefully moved to chessops soon: https://github.com/niklasf/chessops/issues/154
  private getEnPassantOptions(fen: string): string[] {
    const unpackRank = (packedRank: string) =>
      [...packedRank].reduce((accumulator, current) => {
        const parsedInt = parseInt(current, 10);
        return accumulator + (parsedInt >= 1 ? 'x'.repeat(parsedInt) : current);
      }, '');
    const checkRank = (rank: string, regex: RegExp, offset: number, filesEnPassant: Set<number>) => {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(rank)) !== null) {
        filesEnPassant.add(match.index + offset);
      }
    };
    const filesEnPassant: Set<number> = new Set();
    const [positions = '', turn = 'w'] = fen.split(' ');
    const ranks = positions.split('/');
    const unpackedRank = unpackRank(ranks[turn === 'w' ? 3 : 4]!);
    checkRank(unpackedRank, /pP/g, turn === 'w' ? 0 : 1, filesEnPassant);
    checkRank(unpackedRank, /Pp/g, turn === 'w' ? 1 : 0, filesEnPassant);
    const [rank1, rank2] =
      filesEnPassant.size >= 1
        ? [unpackRank(ranks[turn === 'w' ? 1 : 6]!), unpackRank(ranks[turn === 'w' ? 2 : 5]!)]
        : [null, null];
    return Array.from(filesEnPassant)
      .filter(e => rank1![e] === 'x' && rank2![e] === 'x')
      .map(e => String.fromCharCode('a'.charCodeAt(0) + e) + (turn === 'w' ? '6' : '3'));
  }

  getState(): EditorState {
    const legalFen = this.getLegalFen();
    return {
      fen: this.getFen(),
      legalFen,
      playable: this.isPlayable(),
      enPassantOptions: legalFen ? this.getEnPassantOptions(legalFen) : [],
    };
  }

  bottomColor = (): Color =>
    this.chessground ? this.chessground.state.orientation : this.orientation;

  setCastlingToggle(id: CastlingToggle, value: boolean): void {
    this.castlingToggles[id] = value;
    this.guessCastlingToggles = false;
    this.onChange();
  }

  setTurn(turn: Color): void {
    this.turn = turn;
    this.epSquare = undefined;
    this.onChange();
  }

  setEnPassant(epSquare: Square | undefined): void {
    this.epSquare = epSquare;
    this.onChange();
  }

  startPosition = (): boolean => this.setFen(makeFen(defaultPosition('chess').toSetup()));

  clearBoard = (): boolean => {
    this.guessCastlingToggles = true;
    const parts = EMPTY_FEN.split(' ');
    parts[1] = this.turn.charAt(0);
    return this.setFen(parts.join(' '));
  };

  private readonly setSetup = (setup: Setup): void => {
    this.turn = setup.turn;
    this.epSquare = setup.epSquare;
    this.halfmoves = setup.halfmoves;
    this.fullmoves = setup.fullmoves;

    const castles = Castles.fromSetup(setup);
    this.castlingToggles['Q'] = castles.rook.white.a !== undefined || setup.castlingRights.has(0);
    this.castlingToggles['K'] = castles.rook.white.h !== undefined || setup.castlingRights.has(7);
    this.castlingToggles['q'] = castles.rook.black.a !== undefined || setup.castlingRights.has(56);
    this.castlingToggles['k'] = castles.rook.black.h !== undefined || setup.castlingRights.has(63);

    this.enabledCastlingToggles = this.computeCastlingToggles();
  };

  setFen = (fen: string): boolean =>
    parseFen(fen).unwrap(
      setup => {
        if (this.chessground) this.chessground.set({ fen });
        this.setSetup(setup);
        this.onChange();
        return true;
      },
      () => false,
    );

  setOrientation(o: Color): void {
    this.orientation = o;
    if (this.chessground && this.chessground.state.orientation !== o) this.chessground.toggleOrientation();
    this.redraw();
  }
}
