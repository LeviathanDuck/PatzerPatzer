import type { StoredAnalysis, StoredNodeEntry, ReviewEngineMetadata } from '../../idb';
import type { ImportedGame } from '../../import/types';
import type { DiagnosticEvent } from '../types';
import type { ReviewErrorPackageStorageRecord } from './storage';

export const REVIEW_ERROR_PACKAGE_FORMAT_VERSION = 1;

export interface ReviewErrorAdminMemo {
  message: string;
  submittedAt: string;
}

export interface ReviewErrorAppIdentity {
  release: string;
  version: string;
  buildId: string;
}

export interface ReviewErrorGameMetadata {
  gameId: string;
  white?: string;
  black?: string;
  result?: string;
  date?: string;
  timeClass?: string;
  opening?: string;
  eco?: string;
  source?: ImportedGame['source'];
  whiteRating?: number;
  blackRating?: number;
  importedAt?: number;
}

export interface ReviewErrorGameSnapshot {
  gameId: string;
  rawPgn: string;
  metadata: ReviewErrorGameMetadata;
}

export interface ReviewErrorSelectedMove {
  path: string;
  ply: number;
  san?: string;
  uci?: string;
  fenBefore?: string;
  fenAfter?: string;
  moverColor: 'white' | 'black';
}

export interface ReviewErrorAnalysisSnapshot {
  status: StoredAnalysis['status'];
  analysisVersion: number;
  analysisDepth: number;
  updatedAt: number;
  reviewEngine?: ReviewEngineMetadata;
  storedAnalysis: StoredAnalysis;
  selectedNode?: StoredNodeEntry;
  parentNode?: StoredNodeEntry;
  neighborNodes: StoredNodeEntry[];
}

export interface ReviewErrorCurrentEngineSettings {
  liveAnalysisDepth: number;
  multiPv: number;
  engineEnabled: boolean;
  searchUntilDepth: boolean;
  searchTimeMs?: number;
}

export interface ReviewErrorBrowserContext {
  userAgent: string;
  platform: string;
  language: string;
  viewportWidth: number;
  viewportHeight: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  storageEstimate?: {
    quota?: number;
    usage?: number;
  };
}

export interface ReviewErrorSessionContext {
  sessionId: string;
  route: string;
  capturedAt: string;
}

export interface ReviewErrorDiagnosticContext {
  recentEvents: DiagnosticEvent[];
}

/**
 * Local/admin-only diagnostic package for investigating incorrect or missing
 * Stockfish review evals. Raw PGN and full StoredAnalysis are intentionally
 * included. Do not add admin tokens, OAuth tokens, cookies, passwords, or raw
 * localStorage dumps to this package.
 */
export interface ReviewErrorPackage extends ReviewErrorPackageStorageRecord {
  packageKind: 'review-error';
  packageFormatVersion: typeof REVIEW_ERROR_PACKAGE_FORMAT_VERSION;
  adminMemo: ReviewErrorAdminMemo;
  app: ReviewErrorAppIdentity;
  session: ReviewErrorSessionContext;
  game: ReviewErrorGameSnapshot;
  selectedMove: ReviewErrorSelectedMove;
  analysis: ReviewErrorAnalysisSnapshot;
  currentEngineSettings: ReviewErrorCurrentEngineSettings;
  browser: ReviewErrorBrowserContext;
  diagnostics: ReviewErrorDiagnosticContext;
}
