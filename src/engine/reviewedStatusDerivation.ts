import {
  ANALYSIS_VERSION,
  listCompletedAnalysisMetadataFromIdb,
  type CompletedAnalysisMetadata,
  type ReviewEngineMetadata,
} from '../idb/index';

export interface ReviewedStatusGame {
  id: string;
}

export interface ReviewedGameStatus {
  gameId: string;
  reviewed: true;
  analysisUpdatedAt: number;
  reviewEngine?: ReviewEngineMetadata;
  accuracy?: { white: number | null; black: number | null };
  missedMomentCount?: number;
  source: 'analysis-library';
}

export interface ReviewedStatusDerivationInput {
  games: readonly ReviewedStatusGame[];
  completedAnalysis: readonly CompletedAnalysisMetadata[];
}

export interface ReviewedStatusDerivationResult {
  index: Map<string, ReviewedGameStatus>;
  matchedGames: number;
  completedAnalysisWithoutGame: number;
}

export type ReviewedStatusChunkedDerivationResult =
  | (ReviewedStatusDerivationResult & {
      ok: true;
      generation: number;
      yielded: number;
    })
  | (ReviewedStatusDerivationResult & {
      ok: false;
      cancelled: true;
      generation: number;
      yielded: number;
    });

export interface ReviewedStatusFromIdbOptions {
  games: readonly ReviewedStatusGame[];
  analysisVersion?: number;
  loadCompletedAnalysis?: (analysisVersion: number) => Promise<CompletedAnalysisMetadata[]>;
}

export interface ReviewedStatusChunkOptions {
  generation?: number;
  getCurrentGeneration?: () => number;
  chunkSize?: number;
  yieldToMain?: () => Promise<void>;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function validChunkSize(value: number | undefined): number {
  return Number.isInteger(value) && value !== undefined && value > 0 ? value : 250;
}

async function defaultYieldToMain(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function emptyCancelledResult(generation: number, yielded: number): ReviewedStatusChunkedDerivationResult {
  return {
    ok: false,
    cancelled: true,
    generation,
    yielded,
    index: new Map(),
    matchedGames: 0,
    completedAnalysisWithoutGame: 0,
  };
}

export function deriveReviewedStatusIndex(
  input: ReviewedStatusDerivationInput,
): ReviewedStatusDerivationResult {
  const gameIds = new Set(input.games.map(game => game.id).filter(nonEmptyString));
  const index = new Map<string, ReviewedGameStatus>();
  let completedAnalysisWithoutGame = 0;

  for (const record of input.completedAnalysis) {
    if (!nonEmptyString(record.gameId)) continue;
    if (!gameIds.has(record.gameId)) {
      completedAnalysisWithoutGame++;
      continue;
    }
    index.set(record.gameId, {
      gameId: record.gameId,
      reviewed: true,
      analysisUpdatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
      ...(record.reviewEngine !== undefined ? { reviewEngine: record.reviewEngine } : {}),
      source: 'analysis-library',
    });
  }

  return {
    index,
    matchedGames: index.size,
    completedAnalysisWithoutGame,
  };
}

export async function deriveReviewedStatusFromIdb(
  options: ReviewedStatusFromIdbOptions,
): Promise<ReviewedStatusDerivationResult> {
  const analysisVersion = options.analysisVersion ?? ANALYSIS_VERSION;
  const loadCompletedAnalysis = options.loadCompletedAnalysis ?? listCompletedAnalysisMetadataFromIdb;
  const completedAnalysis = await loadCompletedAnalysis(analysisVersion);
  return deriveReviewedStatusIndex({
    games: options.games,
    completedAnalysis,
  });
}

export async function deriveReviewedStatusIndexChunked(
  input: ReviewedStatusDerivationInput,
  options: ReviewedStatusChunkOptions = {},
): Promise<ReviewedStatusChunkedDerivationResult> {
  const generation = options.generation ?? 0;
  const getCurrentGeneration = options.getCurrentGeneration ?? (() => generation);
  const chunkSize = validChunkSize(options.chunkSize);
  const yieldToMain = options.yieldToMain ?? defaultYieldToMain;
  const gameIds = new Set(input.games.map(game => game.id).filter(nonEmptyString));
  const index = new Map<string, ReviewedGameStatus>();
  let completedAnalysisWithoutGame = 0;
  let yielded = 0;

  if (getCurrentGeneration() !== generation) return emptyCancelledResult(generation, yielded);

  for (let indexInRecords = 0; indexInRecords < input.completedAnalysis.length; indexInRecords++) {
    if (getCurrentGeneration() !== generation) {
      return {
        ok: false,
        cancelled: true,
        generation,
        yielded,
        index,
        matchedGames: index.size,
        completedAnalysisWithoutGame,
      };
    }

    const record = input.completedAnalysis[indexInRecords]!;
    if (nonEmptyString(record.gameId)) {
      if (gameIds.has(record.gameId)) {
        index.set(record.gameId, {
          gameId: record.gameId,
          reviewed: true,
          analysisUpdatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : 0,
          ...(record.reviewEngine !== undefined ? { reviewEngine: record.reviewEngine } : {}),
          source: 'analysis-library',
        });
      } else {
        completedAnalysisWithoutGame++;
      }
    }

    const processed = indexInRecords + 1;
    if (processed < input.completedAnalysis.length && processed % chunkSize === 0) {
      yielded++;
      await yieldToMain();
      if (getCurrentGeneration() !== generation) {
        return {
          ok: false,
          cancelled: true,
          generation,
          yielded,
          index,
          matchedGames: index.size,
          completedAnalysisWithoutGame,
        };
      }
    }
  }

  return {
    ok: true,
    generation,
    yielded,
    index,
    matchedGames: index.size,
    completedAnalysisWithoutGame,
  };
}
