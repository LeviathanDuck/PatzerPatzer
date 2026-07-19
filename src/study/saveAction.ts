// Save-to-Library action — captures current game context and persists a StudyItem.
// Adapted from the save pattern in lichess-org/lila: ui/study/src/study.ts persist()

import { parsePgn } from 'chessops/pgn';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSan } from 'chessops/san';
import { saveStudy, saveStudyStrict, getStudy, savePracticeLine, getPracticeLine } from './studyDb';
import type {
  OrpSourceProvenance,
  SourceImportedProvenance,
  StudyItem,
  StudySource,
  TrainableSequence,
} from './types';
import { stampLinkedSourceProvenance } from './practice/linkedSource';
import { MASTER_GAMES } from '../showcase/masterGames';
import type { MasterGame } from '../showcase/masterGames';
import { deriveFens } from './practice/extractLine';
import type { ResearchCollection } from '../openings/types';
import { record, Severity } from '../diagnostics';
import type { SaveFlowPuzzleCategory } from '../save/saveFlowCtrl';
import type { PuzzleSaveProvenance } from '../puzzles/types';

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

  await saveStudyStrict(item);
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

function classifyOrpError(error: unknown): string {
  if (typeof error === 'string') return error;
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function orpRouteLabel(): string {
  if (typeof window === 'undefined') return 'unknown';
  const hash = window.location.hash;
  if (hash.startsWith('#/openings')) return 'openings';
  if (hash.startsWith('#/study')) return 'study';
  return 'other';
}

function recordOrpLoadFail(error: unknown): void {
  record({
    kind: 'render',
    severity: Severity.Error,
    source: 'study/saveAction',
    sourceTag: 'orp-load-fail',
    message: 'orp-load-fail',
    metadata: {
      errorClass: classifyOrpError(error),
      route: orpRouteLabel(),
    },
    redactionClass: 'safe',
  });
}

function recordOrpSaveFail(errorClass: string): void {
  record({
    kind: 'idb',
    severity: Severity.Error,
    source: 'study/saveAction',
    sourceTag: 'orp-save-fail',
    message: 'orp-save-fail',
    metadata: {
      errorClass,
      route: orpRouteLabel(),
    },
    redactionClass: 'safe',
  });
}

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
function buildOrpTags(
  trainAs: 'white' | 'black',
  collection: ResearchCollection | null,
  extraTags: readonly string[] = [],
): string[] {
  const tags: string[] = [
    trainAs === 'white' ? 'as-white' : 'as-black',
    'orp',
  ];
  if (collection && isHumanReadableName(collection.name)) {
    tags.push('collection:' + collection.name);
  }
  for (const tag of extraTags) {
    const trimmed = tag.trim();
    if (trimmed && !tags.includes(trimmed)) tags.push(trimmed);
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

export interface RepertoireOrpSaveResult extends OrpSaveResult {
  alreadyExisted: boolean;
}

export interface RepertoireOrpLineSaveInput {
  ucis: string[];
  sans: string[];
  trainAs: 'white' | 'black';
  sourceName: string;
  title?: string;
}

interface OrpSaveOptions {
  title?: string;
  extraTags?: readonly string[];
  mergeExistingTags?: boolean;
  sourceProvenance?: OrpSourceProvenance;
}











export interface OrpSaveDeps {
  readonly getStudy: typeof getStudy;
  readonly getPracticeLine: typeof getPracticeLine;
  readonly saveStudyStrict: typeof saveStudyStrict;
  readonly savePracticeLine: typeof savePracticeLine;
}

const REAL_ORP_SAVE_DEPS: OrpSaveDeps = { getStudy, getPracticeLine, saveStudyStrict, savePracticeLine };

function mergeUniqueTags(existing: readonly string[], next: readonly string[]): string[] {
  const merged: string[] = [];
  for (const tag of [...existing, ...next]) {
    const trimmed = tag.trim();
    if (trimmed && !merged.includes(trimmed)) merged.push(trimmed);
  }
  return merged;
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
  options: OrpSaveOptions = {},
  deps: OrpSaveDeps = REAL_ORP_SAVE_DEPS,
): Promise<OrpSaveResult | null> {
  // Guard: line too short to drill.
  if (ucis.length < 3) {
    recordOrpSaveFail('validation-error');
    return null;
  }

  // Derive FENs — abort entire save if UCI is invalid.
  const fens = deriveFens(START_FEN, ucis);
  if (!fens) {
    recordOrpSaveFail('validation-error');
    return null;
  }

  const studyItemId = deriveOrpStudyItemId(trainAs, ucis);
  const sequenceId  = deriveOrpSequenceId(trainAs, ucis);
  const now = Date.now();

  // Derive display title per contract §2c priority order.
  const sanMoves = sans.slice(0, 4).join(' ');
  let title: string;
  if (options.title) {
    title = options.title;
  } else if (openingName) {
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
  let existingStudy: StudyItem | null = null;






  try {
    const existing = await deps.getStudy(studyItemId);
    if (existing) {
      existingStudy = existing;
      studyCreatedAt = existing.createdAt;
    }
  } catch (e) {
    recordOrpLoadFail(e);
    recordOrpSaveFail('idb-read-error');
    throw new Error('orp-upsert-preservation-read-failed: getStudy');
  }
  try {
    const existingSeq = await deps.getPracticeLine(sequenceId);
    if (existingSeq) {
      seqCreatedAt = existingSeq.createdAt;
      seqStatus    = existingSeq.status;
    }
  } catch (e) {
    recordOrpLoadFail(e);
    recordOrpSaveFail('idb-read-error');
    throw new Error('orp-upsert-preservation-read-failed: getPracticeLine');
  }

  // Build the PGN from the UCI moves for the StudyItem.pgn field.
  const pgn = uciMovesToPgn(ucis, title);
  const tags = buildOrpTags(trainAs, collection, options.extraTags);
  const sourceProvenance = options.sourceProvenance;







  const studyItem: StudyItem = {
    ...(existingStudy ?? { folders: [] as string[], favorite: false }),
    id:        studyItemId,
    pgn,
    title,
    source:    'openings',
    tags:      options.mergeExistingTags && existingStudy ? mergeUniqueTags(existingStudy.tags, tags) : tags,
    createdAt: studyCreatedAt,
    updatedAt: now,
  };
  if (sourceProvenance) {
    studyItem.sourceGameId = sourceProvenance.originalStudyItemId;
    studyItem.orpSourceProvenance = sourceProvenance;
    if (sourceProvenance.sourcePath !== undefined) studyItem.sourcePath = sourceProvenance.sourcePath;
  }
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
  if (sourceProvenance) sequence.orpSourceProvenance = sourceProvenance;



  try {
    await deps.saveStudyStrict(studyItem);
    await deps.savePracticeLine(sequence);
  } catch (e) {
    recordOrpSaveFail(classifyOrpError(e));
    throw e;
  }

  const [persistedStudy, persistedSequence] = await Promise.all([
    deps.getStudy(studyItemId),
    deps.getPracticeLine(sequenceId),
  ]);
  if (!persistedStudy || !persistedSequence) {
    recordOrpSaveFail('idb-write-error');
    throw new Error('idb-write-error');
  }

  return { studyItem, sequence };
}


export interface LinkedStudyImportInput {
  /** Deterministic or caller-generated StudyItem id (repeat imports upsert the same item). */
  readonly studyItemId: string;
  readonly pgn: string;
  readonly title: string;
  readonly tags?: readonly string[];
  /** External linked/snapshot-source provenance to stamp (stampLinkedSourceProvenance semantics). */
  readonly linkedSourceProvenance: SourceImportedProvenance;
  /** StudyItem source classification; defaults to 'import'. */
  readonly source?: StudySource;
  readonly eco?: string;
  readonly opening?: string;
}














export async function saveLinkedStudyImport(
  input: LinkedStudyImportInput,
  deps: OrpSaveDeps = REAL_ORP_SAVE_DEPS,
): Promise<StudyItem> {
  const now = Date.now();

  let existing: StudyItem | undefined;
  try {
    existing = await deps.getStudy(input.studyItemId);
  } catch (e) {
    recordOrpLoadFail(e);
    recordOrpSaveFail('idb-read-error');
    throw new Error('linked-import-preservation-read-failed: getStudy');
  }

  const stamp = stampLinkedSourceProvenance({
    incoming: input.linkedSourceProvenance,
    ...(existing?.localProvenanceLayers !== undefined
      ? { existingLocalLayers: existing.localProvenanceLayers }
      : {}),
    ...(existing?.notes !== undefined ? { existingNotes: existing.notes } : {}),
  });

  const studyItem: StudyItem = {
    id:        input.studyItemId,
    pgn:       input.pgn,
    title:     input.title,
    source:    input.source ?? 'import',
    tags:      existing ? mergeUniqueTags(existing.tags, input.tags ?? []) : [...(input.tags ?? [])],
    folders:   existing ? [...existing.folders] : [],
    favorite:  existing?.favorite ?? false,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  studyItem.linkedSourceProvenance = stamp.linkedSourceProvenance;
  if (stamp.localProvenanceLayers !== undefined) studyItem.localProvenanceLayers = stamp.localProvenanceLayers;
  if (stamp.notes !== undefined) studyItem.notes = stamp.notes;
  if (input.eco !== undefined) studyItem.eco = input.eco;
  if (input.opening !== undefined) studyItem.opening = input.opening;

  try {
    await deps.saveStudyStrict(studyItem);
  } catch (e) {
    recordOrpSaveFail(classifyOrpError(e));
    throw e;
  }
  return studyItem;
}

export async function saveRepertoireLineToOrpLibrary(
  input: RepertoireOrpLineSaveInput,
): Promise<RepertoireOrpSaveResult | null> {
  const sequenceId = deriveOrpSequenceId(input.trainAs, input.ucis);
  const alreadyExisted = Boolean(await getPracticeLine(sequenceId));
  const result = await saveOrpLineToLibrary(
    input.ucis,
    input.sans,
    input.trainAs,
    null,
    input.title ?? input.sourceName,
    undefined,
    {
      title: input.title ?? input.sourceName,
      extraTags: ['repertoire', `source:${input.sourceName}`],
      mergeExistingTags: true,
    },
  );
  if (!result) return null;
  return { ...result, alreadyExisted };
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

/** Return the position where the solver actually takes control. */
export function puzzleSolverStartFen(fen: string, triggerMove?: string): string {
  if (!triggerMove) return fen;
  const setup = parseFen(fen);
  if (!setup.isOk) throw new Error('Cannot apply puzzle trigger to an invalid FEN');
  const position = Chess.fromSetup(setup.value);
  if (!position.isOk) throw new Error('Cannot apply puzzle trigger to an invalid position');
  const move = parseUci(triggerMove);
  if (!move || !position.value.isLegal(move)) {
    throw new Error(`Illegal puzzle trigger move: ${triggerMove}`);
  }
  position.value.play(move);
  return makeFen(position.value.toSetup());
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
export interface PuzzleLibrarySaveMetadata {
  sourcePuzzleId: string;
  savedFrom: PuzzleSaveProvenance;
  sourceGameId?: string;
  primaryCategory?: SaveFlowPuzzleCategory;
  saveNotes?: string;
  uncategorized?: boolean;
  tags?: string[];
}

export async function savePuzzleToLibrary(
  fen: string,
  solutionMoves: string[],
  metadata: PuzzleLibrarySaveMetadata,
  triggerMove?: string,
  title?: string,
): Promise<StudyItem> {
  const puzzleTitle = title ?? 'Puzzle';
  const moves = triggerMove ? [triggerMove, ...solutionMoves] : solutionMoves;
  const pgn = puzzleToPgn(fen, moves, puzzleTitle);
  const completeMetadata: Partial<Omit<StudyItem, 'id' | 'pgn' | 'createdAt' | 'updatedAt'>> & PuzzleLibrarySaveMetadata = {
    source: 'puzzles',
    title:  puzzleTitle,
    ...metadata,
    tags: Array.from(new Set(['puzzle', ...(metadata.tags ?? [])])),
  };
  return saveCurrentToLibrary(pgn, completeMetadata);
}
