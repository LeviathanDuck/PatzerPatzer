// PGN → move tree (mainline + variations)
// Adapted from lichess-org/lila: ui/analyse/src/pgnImport.ts

import { makeSquare, makeUci } from 'chessops';
import type { Position } from 'chessops/chess';
import { scalachessCharPair } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import type { ChildNode, CommentShape, Game, PgnNodeData } from 'chessops/pgn';
import { makePgn, parseComment, parsePgn, startingPosition } from 'chessops/pgn';
import { makeSanAndPlay, parseSan } from 'chessops/san';

import type { Glyph, ImportedEval, Shape, TimeControl, TreeComment, TreeNode } from './types';
import {
  decodeLocalPgnComment,
  LOCAL_COMMENT_BY,
  LOCAL_COMMENT_ID,
} from './commentIdentity';

// Standard NAG (Numeric Annotation Glyph) → Glyph mapping.
// Adapted from lichess-org/lila: modules/tree/src/main/TreeBuilder.scala glyphs()
const NAG_GLYPHS: Record<number, Glyph> = {
  1:   { id: 1,   name: 'Good move',                         symbol: '!'   },
  2:   { id: 2,   name: 'Mistake',                           symbol: '?'   },
  3:   { id: 3,   name: 'Brilliant move',                    symbol: '!!'  },
  4:   { id: 4,   name: 'Blunder',                           symbol: '??'  },
  5:   { id: 5,   name: 'Speculative move',                  symbol: '!?'  },
  6:   { id: 6,   name: 'Dubious move',                      symbol: '?!'  },
  7:   { id: 7,   name: 'Only move',                         symbol: '□'   },
  8:   { id: 8,   name: 'Singular move',                     symbol: '□'   },
  9:   { id: 9,   name: 'Worst move',                        symbol: '???' },
  10:  { id: 10,  name: 'Equal position',                    symbol: '='   },
  11:  { id: 11,  name: 'Equal chances, quiet position',     symbol: '='   },
  12:  { id: 12,  name: 'Equal chances, active position',    symbol: '⇄'   },
  13:  { id: 13,  name: 'Unclear position',                  symbol: '∞'   },
  14:  { id: 14,  name: 'White is slightly better',          symbol: '⩲'   },
  15:  { id: 15,  name: 'Black is slightly better',          symbol: '⩱'   },
  16:  { id: 16,  name: 'White is better',                   symbol: '±'   },
  17:  { id: 17,  name: 'Black is better',                   symbol: '∓'   },
  18:  { id: 18,  name: 'White is winning',                  symbol: '+−'  },
  19:  { id: 19,  name: 'Black is winning',                  symbol: '−+'  },
  22:  { id: 22,  name: 'White is in zugzwang',              symbol: '⨀'   },
  23:  { id: 23,  name: 'Black is in zugzwang',              symbol: '⨀'   },
  36:  { id: 36,  name: 'White has the initiative',          symbol: '↑'   },
  37:  { id: 37,  name: 'Black has the initiative',          symbol: '↑'   },
  40:  { id: 40,  name: 'White has the attack',              symbol: '→'   },
  41:  { id: 41,  name: 'Black has the attack',              symbol: '→'   },
  44:  { id: 44,  name: 'White has compensation',            symbol: '=∞'  },
  45:  { id: 45,  name: 'Black has compensation',            symbol: '=∞'  },
  132: { id: 132, name: 'White has counterplay',             symbol: '⇆'   },
  133: { id: 133, name: 'Black has counterplay',             symbol: '⇆'   },
  138: { id: 138, name: 'White is in time trouble',          symbol: '⊕'   },
  139: { id: 139, name: 'Black is in time trouble',          symbol: '⊕'   },
  146: { id: 146, name: 'Novelty',                           symbol: 'N'   },
};

const LEGACY_RENDERED_NAG_IDS = new Set([1, 2, 3, 4, 5, 6]);

export function nagToGlyph(nag: number): Glyph | undefined {
  return NAG_GLYPHS[nag];
}

function parseTimeControl(value: string | undefined): TimeControl | undefined {
  if (!value || value === '-' || value.includes(':')) return undefined;
  const match = value.match(/^(\d+)(?:\+(\d+))?$/);
  if (!match) return undefined;
  const initialSeconds = Number(match[1]);
  const incrementSeconds = match[2] !== undefined ? Number(match[2]) : 0;
  if (!Number.isFinite(initialSeconds) || !Number.isFinite(incrementSeconds)) return undefined;
  return {
    initial: Math.round(initialSeconds * 100),
    increment: Math.round(incrementSeconds * 100),
  };
}

/**
 * Converts a chessops CommentShape (numeric squares, to===from encodes a %csl
 * circle) into Patzer's Shape model (square-name strings, dest omitted for a
 * highlight) — the same field/shape the Study authoring path already
 * populates via updateCurrentNodeShapes (src/study/studyDetailCtrl.ts).
 */
function chessopsShapeToTreeShape(shape: CommentShape): Shape {
  const orig = makeSquare(shape.from);
  return shape.to === shape.from
    ? { orig, brush: shape.color }
    : { orig, dest: makeSquare(shape.to), brush: shape.color };
}

function parseTreeComments(rawComments: readonly string[] | undefined): {
  comments: TreeComment[];
  clockCentis?: number;
  moveTimeCentis?: number;
  evaluation?: ImportedEval;
  shapes?: Shape[];
} {
  let clockCentis: number | undefined;
  let moveTimeCentis: number | undefined;
  let evaluation: ImportedEval | undefined;
  let foundLocalComment = false;
  const shapes: Shape[] = [];
  const comments = (rawComments ?? []).map((raw, i) => {
    const localText = foundLocalComment ? null : decodeLocalPgnComment(raw);
    if (localText !== null) foundLocalComment = true;
    const parsed = parseComment(localText ?? raw);
    if (parsed.clock !== undefined && clockCentis === undefined) {
      // chessops returns seconds; store as centiseconds to match Lichess Clock type
      clockCentis = Math.round(parsed.clock * 100);
    }
    if (parsed.emt !== undefined && moveTimeCentis === undefined) {
      moveTimeCentis = Math.round(parsed.emt * 100);
    }
    // [%eval] — first one wins (mirrors clock/emt above); kept verbatim (pawns or
    // mate, as chessops parsed it) so annotated-mode export can re-emit it
    // unchanged. Phase 2 T1 contract §4 / BUG-2026-07-05-018.
    if (parsed.evaluation !== undefined && evaluation === undefined) {
      evaluation = parsed.evaluation;
    }
    // [%csl]/[%cal] — user content (arrows/circles), not engine synthesis;
    // accumulate across every comment segment on this node.
    for (const shape of parsed.shapes) {
      shapes.push(chessopsShapeToTreeShape(shape));
    }
    return localText !== null
      ? { id: LOCAL_COMMENT_ID, by: LOCAL_COMMENT_BY, text: parsed.text }
      : { id: String(i), by: 'pgn' as const, text: parsed.text };
  }).filter(c => c.text.trim().length > 0);

  return {
    comments,
    ...(clockCentis !== undefined ? { clockCentis } : {}),
    ...(moveTimeCentis !== undefined ? { moveTimeCentis } : {}),
    ...(evaluation !== undefined ? { evaluation } : {}),
    ...(shapes.length > 0 ? { shapes } : {}),
  };
}

/**
 * Recursively build a TreeNode from a PGN child node.
 * pos is mutated in-place (caller must clone if reusing).
 * Returns undefined if the SAN cannot be parsed.
 *
 * Adapted from lichess-org/lila: ui/analyse/src/pgnImport.ts readNode
 */
function buildNode(pgnNode: ChildNode<PgnNodeData>, pos: Position, ply: number): TreeNode | undefined {
  const move = parseSan(pos, pgnNode.data.san);
  if (!move) return undefined;

  // makeSanAndPlay mutates pos in-place and returns canonical SAN
  const san = makeSanAndPlay(pos, move);

  // Build all children from the post-move position.
  // Clone pos for each child so variations don't interfere with each other.
  // First child = mainline, rest = variations — order preserved from PGN.
  const children = pgnNode.children
    .map(child => buildNode(child, pos.clone(), ply + 1))
    .filter((n): n is TreeNode => n !== undefined);

  // Preserve every raw NAG for future opt-in repertoire/course surfaces, while keeping
  // current analysis rendering stable by exposing only the legacy move glyphs on `glyphs`.
  const nags = [...(pgnNode.data.nags ?? [])];
  const glyphs = nags
    .filter(n => LEGACY_RENDERED_NAG_IDS.has(n))
    .map(nagToGlyph)
    .filter((g): g is Glyph => g !== undefined);

  // Parse comments: extract %clk/%emt clock metadata and strip annotation tags from display text.
  // Adapted from lichess-org/lila: ui/analyse/src/pgnImport.ts readNode
  const rawComments = [
    ...(pgnNode.data.startingComments ?? []),
    ...(pgnNode.data.comments ?? []),
  ];
  const { comments, clockCentis, moveTimeCentis, evaluation, shapes } = parseTreeComments(rawComments);

  return {
    id: scalachessCharPair(move), // 2-char id, same scheme as Lichess
    ply,
    san,
    uci: makeUci(move),
    fen: makeFen(pos.toSetup()), // FEN after the move
    children,
    ...(glyphs.length              ? { glyphs }              : {}),
    ...(nags.length                ? { nags }                : {}),
    ...(comments.length            ? { comments }            : {}),
    ...(clockCentis !== undefined  ? { clock: clockCentis }  : {}),
    ...(moveTimeCentis !== undefined ? { moveTime: moveTimeCentis } : {}),
    ...(evaluation !== undefined   ? { importedEval: evaluation } : {}),
    ...(shapes !== undefined       ? { shapes }              : {}),
  };
}





























const QUESTIONNAIRE_HEADER_KEY = 'PatzerStudied';
const QUESTIONNAIRE_SUMMARY_PREFIX = 'Patzer: ';

function hasQuestionnaireHeaders(headers: Map<string, string>): boolean {
  return !!headers.get(QUESTIONNAIRE_HEADER_KEY);
}

export function pgnGameToTree(game: Game<PgnNodeData>): TreeNode {
  const startPos = startingPosition(game.headers).unwrap();
  const startFen = makeFen(startPos.toSetup());
  const setup = startPos.toSetup();
  const initialPly = (setup.fullmoves - 1) * 2 + (startPos.turn === 'white' ? 0 : 1);
  const timeControl = parseTimeControl(game.headers.get('TimeControl'));





  const {
    comments: rootComments,
    clockCentis,
    moveTimeCentis,
    evaluation,
    shapes,
  } = parseTreeComments(game.comments);













  const comments = hasQuestionnaireHeaders(game.headers)
    ? rootComments.filter(c => c.id === LOCAL_COMMENT_ID || !c.text.startsWith(QUESTIONNAIRE_SUMMARY_PREFIX))
    : rootComments;

  // Each top-level child gets a fresh clone of the starting position
  const children = game.moves.children
    .map(child => buildNode(child, startPos.clone(), initialPly + 1))
    .filter((n): n is TreeNode => n !== undefined);

  return {
    id: '',
    ply: initialPly,
    fen: startFen,
    children,
    ...(comments.length ? { comments } : {}),
    ...(clockCentis !== undefined ? { clock: clockCentis } : {}),
    ...(moveTimeCentis !== undefined ? { moveTime: moveTimeCentis } : {}),
    ...(evaluation !== undefined ? { importedEval: evaluation } : {}),
    ...(shapes !== undefined ? { shapes } : {}),
    ...(timeControl ? { timeControl } : {}),
  };
}

/**
 * Parse a PGN string and return a root TreeNode with the full move tree.
 * Mainline is always children[0] at each node; variations are children[1+].
 * Throws if the PGN cannot be parsed or the starting position is invalid.
 */
export function pgnToTree(pgn: string): TreeNode {
  const game = parsePgn(pgn)[0];
  if (!game) throw new Error('No game found in PGN');
  return pgnGameToTree(game);
}






























export function stripPgnAnnotations(pgn: string): string | null {
  let games;
  try {
    games = parsePgn(pgn);
  } catch {
    return null;
  }
  if (games.length === 0) return null;
  const walk = (node: { children: { data: PgnNodeData; children: unknown[] }[] }): void => {
    for (const child of node.children) {
      delete (child.data as { comments?: unknown }).comments;
      delete (child.data as { startingComments?: unknown }).startingComments;
      delete (child.data as { nags?: unknown }).nags;
      walk(child as unknown as { children: { data: PgnNodeData; children: unknown[] }[] });
    }
  };


  const HEADER_WHITELIST = new Set([
    'Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result',
    'ECO', 'Opening', 'SetUp', 'FEN', 'Variant', 'TimeControl',
  ]);
  return games.map(game => {
    walk(game.moves as unknown as { children: { data: PgnNodeData; children: unknown[] }[] });








    game.comments = [];
    for (const key of [...game.headers.keys()]) {
      if (!HEADER_WHITELIST.has(key)) game.headers.delete(key);
    }
    return makePgn(game);
  }).join('\n');
}







export function countParseablePgnGames(pgn: string): number {
  let games;
  try {
    games = parsePgn(pgn);
  } catch {
    return 0;
  }
  let count = 0;
  for (const game of games) {
    const start = startingPosition(game.headers);
    if (start.isErr) continue;
    const pos = start.value;
    let legal = true;
    let node = game.moves.children[0];
    const replay = pos.clone();
    while (node !== undefined) {
      const move = parseSan(replay, node.data.san);
      if (move === undefined) { legal = false; break; }
      replay.play(move);
      node = node.children[0];
    }
    // A game must carry actual chess material: at least one legal mainline move, or an explicit
    // FEN start position. (A junk string the parser reduces to zero moves "replays" trivially
    // but is not extractable material.)
    if (legal && (game.moves.children.length > 0 || game.headers.has('FEN'))) count++;
  }
  return count;
}
