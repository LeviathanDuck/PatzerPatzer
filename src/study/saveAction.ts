// Save-to-Library action — captures current game context and persists a StudyItem.
// Adapted from the save pattern in lichess-org/lila: ui/study/src/study.ts persist()

import { parsePgn } from 'chessops/pgn';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSan } from 'chessops/san';
import { saveStudy, getStudy, savePracticeLine, getPracticeLine } from './studyDb';
import type { StudyItem, StudySource, TrainableSequence } from './types';
import { MASTER_GAMES } from '../showcase/masterGames';
import type { MasterGame } from '../showcase/masterGames';
import { deriveFens } from './practice/extractLine';
import type { ResearchCollection } from '../openings/types';

let _nextId = 0;
function generateStudyId(): string {
  return `study_${Date.now()}_${_nextId++}`;
}

/**
 * Extract a human-readable title from PGN headers.
 * Mirrors the Lichess study naming convention: "White vs Black" from PGN tags.
 */
function extractTitle(pgn: string): string {
  try {
    const game = parsePgn(pgn)[0];
    if (!game) return 'Untitled Study';
    const white   = game.headers.get('White');
    const black   = game.headers.get('Black');
    const opening = game.headers.get('Opening');
    if (white && black && white !== '?' && black !== '?') {
      return opening ? `${white} vs ${black} — ${opening}` : `${white} vs ${black}`;
    }
    if (opening) return opening;
  } catch {
    // ignore parse errors — fall through to default
  }
  return 'Untitled Study';
}

/**
 * Extract game metadata from PGN headers.
 */
function extractMetadata(pgn: string): Pick<StudyItem, 'white' | 'black' | 'result' | 'eco' | 'opening'> {
  try {
    const game = parsePgn(pgn)[0];
    if (!game) return {};
    const meta: Pick<StudyItem, 'white' | 'black' | 'result' | 'eco' | 'opening'> = {};
    const white   = game.headers.get('White');
    const black   = game.headers.get('Black');
    const result  = game.headers.get('Result');
    const eco     = game.headers.get('ECO');
    const opening = game.headers.get('Opening');
    if (white   && white   !== '?') meta.white   = white;
    if (black   && black   !== '?') meta.black   = black;
    if (result  && result  !== '*') meta.result  = result;
    if (eco)                        meta.eco     = eco;
    if (opening)                    meta.opening = opening;
    return meta;
  } catch {
    return {};
  }
}

/**
 * Save the current game to the Study Library.
 * @param pgn - Full PGN string of the game to save.
 * @param metadata - Optional overrides (source, sourceGameId, sourcePath, title, etc.).
 * @returns The newly created StudyItem.
 */
export async function saveCurrentToLibrary(
  pgn: string,
  metadata: Partial<Omit<StudyItem, 'id' | 'pgn' | 'createdAt' | 'updatedAt'>> = {},
): Promise<StudyItem> {
  const now  = Date.now();
  const auto = extractMetadata(pgn);

  const item: StudyItem = {
    // Auto-extracted fields first (lowest priority).
    ...auto,
    // Caller-provided overrides (medium priority).
    ...metadata,
    // Fixed fields that cannot be overridden (highest priority).
    id:        generateStudyId(),
    pgn,
    title:     metadata.title ?? extractTitle(pgn),
    source:    metadata.source ?? ('manual' as StudySource),
    tags:      metadata.tags     ?? [],
    folders:   metadata.folders  ?? [],
    favorite:  metadata.favorite ?? false,
    createdAt: now,
    updatedAt: now,
  };

  await saveStudy(item);
  return item;
}

/**
 * Build a minimal PGN string from a UCI move array starting from the initial position.
 * Adapted from chessops move-application pattern.
 */
function uciMovesToPgn(uciMoves: string[], title?: string): string {
  const setup = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const sans: string[] = [];
  for (const uci of uciMoves) {
    const move = parseUci(uci);
    if (!move) break;
    const san = makeSan(pos, move);
    pos.play(move);
    sans.push(san);
  }

  // Build minimal PGN text manually: headers + move text + result
  const headers: string[] = [
    '[Event "?"]',
    '[Site "?"]',
    '[Date "????.??.??"]',
    '[Round "?"]',
    `[White "${title ?? '?'}"]`,
    '[Black "?"]',
    '[Result "*"]',
  ];

  const moves: string[] = [];
  for (let i = 0; i < sans.length; i++) {
    if (i % 2 === 0) moves.push(`${Math.floor(i / 2) + 1}. ${sans[i]!}`);
    else moves.push(sans[i]!);
  }

  return `${headers.join('\n')}\n\n${moves.join(' ')} *`;
}

/**
 * Save a UCI move sequence (from the openings tool) to the Study Library.
 * Reconstructs a minimal PGN from the UCI moves using chessops.
 *
 * @param uciMoves - List of UCI move strings (e.g. ["e2e4", "e7e5"]).
 * @param color - The side being trained ('white' | 'black').
 * @param title - Optional title override; defaults to "Opening line".
 * @returns The newly created StudyItem.
 */
export async function saveUciLinesToLibrary(
  uciMoves: string[],
  color: 'white' | 'black',
  title?: string,
): Promise<StudyItem> {
  const lineTitle = title ?? 'Opening line';
  const pgn = uciMovesToPgn(uciMoves, lineTitle);
  return saveCurrentToLibrary(pgn, {
    source: 'openings',
    title:  lineTitle,
    tags:   [color === 'white' ? 'as-white' : 'as-black'],
  });
}

// ─── ORP (Opening Repetition Practice) helpers ────────────────────────────────
// Phase 2 implementation of ORP_SAVE_DATAFLOW_CONTRACT_2026-06-16.md
// IDs are deterministic: same moves + same color → same ID → IDB put() is upsert.

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/**
 * Derive a stable, deterministic StudyItem id for an ORP line.
 * Encoding: 'orp-' + base64(trainAs + ':' + ucis.join(' ')) with URL-safe chars.
 * Same moves + same color → same id; different color → different id.
 */
export function deriveOrpStudyItemId(trainAs: 'white' | 'black', ucis: string[]): string {
  return 'orp-' + btoa(trainAs + ':' + ucis.join(' ')).replace(/[+/=]/g, '_');
}

/**
 * Derive a stable, deterministic TrainableSequence id for an ORP line.
 * Mirrors the StudyItem id derivation with a different prefix.
 */
export function deriveOrpSequenceId(trainAs: 'white' | 'black', ucis: string[]): string {
  return 'orp-seq-' + btoa(trainAs + ':' + ucis.join(' ')).replace(/[+/=]/g, '_');
}

/**
 * Return true if a collection name is human-readable (not a UUID or blank).
 * Used to decide whether to add a 'collection:<name>' tag.
 */
function isHumanReadableName(name: string): boolean {
  if (!name || name.trim() === '') return false;
  if (/^[0-9a-f-]{36}$/i.test(name.trim())) return false; // UUID
  return true;
}

/**
 * Build the tags array for an ORP StudyItem per the contract.
 * Always includes 'orp' and 'as-white'/'as-black'.
 * Adds 'collection:<name>' when the collection has a human-readable name.
 */
function buildOrpTags(trainAs: 'white' | 'black', collection: ResearchCollection | null): string[] {
  const tags: string[] = [
    trainAs === 'white' ? 'as-white' : 'as-black',
    'orp',
  ];
  if (collection && isHumanReadableName(collection.name)) {
    tags.push('collection:' + collection.name);
  }
  return tags;
}

/**
 * Result returned by saveOrpLineToLibrary on success.
 */
export interface OrpSaveResult {
  studyItem: StudyItem;
  sequence: TrainableSequence;
}

/**
 * Save an opening line as a StudyItem (source 'openings') with a linked TrainableSequence.
 *
 * Implements the full ORP save contract from ORP_SAVE_DATAFLOW_CONTRACT_2026-06-16.md §5.
 * IDs are derived deterministically so repeated saves of the same line+color are idempotent
 * (IDB put() upserts the existing record; createdAt from the first save is preserved).
 *
 * Returns null if:
 * - path.length < 3 (line too short to drill — same guard as legacy handleSaveLine)
 * - deriveFens() returns null (unparseable/illegal UCI)
 *
 * @param ucis       - UCI move strings from the current session path (e.g. ['e2e4', 'c7c5']).
 * @param sans       - SAN strings for each move (same length as ucis).
 * @param trainAs    - Board orientation / side being trained.
 * @param collection - Active research collection; null if not in a collection session.
 * @param openingName - Opening name if available from an ECO lookup; absent otherwise.
 * @param openingEco  - ECO code if available; absent otherwise.
 */
export async function saveOrpLineToLibrary(
  ucis: string[],
  sans: string[],
  trainAs: 'white' | 'black',
  collection: ResearchCollection | null,
  openingName?: string,
  openingEco?: string,
): Promise<OrpSaveResult | null> {
  // Guard: line too short to drill.
  if (ucis.length < 3) return null;

  // Derive FENs — abort entire save if UCI is invalid.
  const fens = deriveFens(START_FEN, ucis);
  if (!fens) return null;

  const studyItemId = deriveOrpStudyItemId(trainAs, ucis);
  const sequenceId  = deriveOrpSequenceId(trainAs, ucis);
  const now = Date.now();

  // Derive display title per contract §2c priority order.
  const sanMoves = sans.slice(0, 4).join(' ');
  let title: string;
  if (openingName) {
    title = openingName;
  } else if (collection && isHumanReadableName(collection.name)) {
    title = `${collection.name} — ${sanMoves}`;
  } else {
    title = `Opening line — ${sanMoves}`;
  }

  // Preserve createdAt (and status) from existing records (upsert semantics per contract §2d).
  // createdAt: always preserved from first save; never reset on re-save.
  // status: preserved so a user-paused sequence is not reset to 'active' on re-save.
  let studyCreatedAt = now;
  let seqCreatedAt   = now;
  let seqStatus: 'active' | 'paused' = 'active';
  try {
    const existing = await getStudy(studyItemId);
    if (existing) studyCreatedAt = existing.createdAt;
  } catch (e) {
    console.warn('[saveAction] ORP: getStudy lookup failed on upsert, using now for createdAt', e);
  }
  try {
    const existingSeq = await getPracticeLine(sequenceId);
    if (existingSeq) {
      seqCreatedAt = existingSeq.createdAt;
      seqStatus    = existingSeq.status;
    }
  } catch (e) {
    console.warn('[saveAction] ORP: getPracticeLine lookup failed on upsert, using now for createdAt', e);
  }

  // Build the PGN from the UCI moves for the StudyItem.pgn field.
  const pgn = uciMovesToPgn(ucis, title);

  // Build StudyItem (source: 'openings').
  const studyItem: StudyItem = {
    id:        studyItemId,
    pgn,
    title,
    source:    'openings',
    tags:      buildOrpTags(trainAs, collection),
    folders:   [],
    favorite:  false,
    createdAt: studyCreatedAt,
    updatedAt: now,
  };
  if (openingEco)  studyItem.eco     = openingEco;
  if (openingName) studyItem.opening = openingName;

  // Build TrainableSequence linked to the StudyItem.
  const sequence: TrainableSequence = {
    id:          sequenceId,
    studyItemId: studyItemId,
    label:       title,
    moves:       [...ucis],
    sans:        [...sans],
    fens,
    trainAs,
    startPly:    0,
    status:      seqStatus,
    createdAt:   seqCreatedAt,
    updatedAt:   now,
  };

  // Persist both records. saveStudy / savePracticeLine use IDB put() (upsert).
  await saveStudy(studyItem);
  await savePracticeLine(sequence);

  return { studyItem, sequence };
}

/**
 * Build a minimal PGN string from a starting FEN + solution moves.
 * Uses [FEN "..."] and [SetUp "1"] headers so the study item retains the puzzle position.
 */
function puzzleToPgn(fen: string, uciMoves: string[], title: string): string {
  const setup = parseFen(fen);
  if (!setup.isOk) return `[FEN "${fen}"]\n[SetUp "1"]\n[Result "*"]\n\n*`;

  const pos = Chess.fromSetup(setup.value);
  if (!pos.isOk) return `[FEN "${fen}"]\n[SetUp "1"]\n[Result "*"]\n\n*`;

  const chess = pos.value;
  const startPly = chess.turn === 'white' ? (chess.fullmoves - 1) * 2 : (chess.fullmoves - 1) * 2 + 1;

  const sans: string[] = [];
  for (const uci of uciMoves) {
    const move = parseUci(uci);
    if (!move) break;
    const san = makeSan(chess, move);
    chess.play(move);
    sans.push(san);
  }

  const headers: string[] = [
    `[Event "Puzzle"]`,
    `[White "${title}"]`,
    `[Black "?"]`,
    `[Result "*"]`,
    `[FEN "${fen}"]`,
    `[SetUp "1"]`,
  ];

  const moves: string[] = [];
  for (let i = 0; i < sans.length; i++) {
    const ply = startPly + i;
    if (ply % 2 === 0) moves.push(`${Math.floor(ply / 2) + 1}. ${sans[i]!}`);
    else moves.push(sans[i]!);
  }

  // If first move is black's, prepend move number with ellipsis
  if (sans.length > 0 && startPly % 2 === 1) {
    moves[0] = `${Math.floor(startPly / 2) + 1}... ${sans[0]!}`;
  }

  return `${headers.join('\n')}\n\n${moves.join(' ')} *`;
}

/**
 * Build a PGN string from a MasterGame with proper headers.
 */
function masterGameToPgn(game: MasterGame): string {
  const setup = parseFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').unwrap();
  const pos = Chess.fromSetup(setup).unwrap();
  const sans: string[] = [];
  for (const uci of game.moves) {
    const move = parseUci(uci);
    if (!move) break;
    const san = makeSan(pos, move);
    pos.play(move);
    sans.push(san);
  }

  const headers: string[] = [
    `[Event "${game.event || '?'}"]`,
    `[Site "${game.site || '?'}"]`,
    `[Date "${game.year}.??.??"]`,
    `[Round "?"]`,
    `[White "${game.white}"]`,
    `[Black "${game.black}"]`,
    `[Result "${game.result}"]`,
    ...(game.eco     ? [`[ECO "${game.eco}"]`]         : []),
    ...(game.opening ? [`[Opening "${game.opening}"]`] : []),
  ];

  const moves: string[] = [];
  for (let i = 0; i < sans.length; i++) {
    if (i % 2 === 0) moves.push(`${Math.floor(i / 2) + 1}. ${sans[i]!}`);
    else             moves.push(sans[i]!);
  }

  return `${headers.join('\n')}\n\n${moves.join(' ')} ${game.result}`;
}

const SEED_CHUNK = 20;

/**
 * Seed all master games from MASTER_GAMES into the Study Library as sample studies.
 * Runs in batched async chunks to avoid blocking the UI.
 * @returns Number of studies saved.
 */
export async function seedMasterGamesToLibrary(): Promise<number> {
  const now = Date.now();
  let saved = 0;

  for (let i = 0; i < MASTER_GAMES.length; i += SEED_CHUNK) {
    const chunk = MASTER_GAMES.slice(i, i + SEED_CHUNK);
    const items: StudyItem[] = chunk.map((game, j) => {
      const pgn   = masterGameToPgn(game);
      const title = `${game.white} vs ${game.black} — ${game.event} ${game.year}`;
      const item: StudyItem = {
        id:        generateStudyId(),
        pgn,
        title,
        source:    'import',
        tags:      ['sample', 'master-game'],
        folders:   [],
        favorite:  false,
        white:     game.white,
        black:     game.black,
        result:    game.result,
        createdAt: now + i + j,
        updatedAt: now + i + j,
      };
      if (game.eco)     item.eco     = game.eco;
      if (game.opening) item.opening = game.opening;
      return item;
    });

    await Promise.all(items.map(item => saveStudy(item)));
    saved += items.length;

    // Yield to the UI between chunks.
    if (i + SEED_CHUNK < MASTER_GAMES.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  return saved;
}

/**
 * Save a puzzle position (starting FEN + solution moves) to the Study Library.
 *
 * @param fen - The puzzle starting FEN.
 * @param solutionMoves - UCI move list for the full solution.
 * @param title - Optional title override; defaults to "Puzzle".
 * @returns The newly created StudyItem.
 */
export async function savePuzzleToLibrary(
  fen: string,
  solutionMoves: string[],
  title?: string,
): Promise<StudyItem> {
  const puzzleTitle = title ?? 'Puzzle';
  const pgn = puzzleToPgn(fen, solutionMoves, puzzleTitle);
  return saveCurrentToLibrary(pgn, {
    source: 'puzzles',
    title:  puzzleTitle,
    tags:   ['puzzle'],
  });
}
