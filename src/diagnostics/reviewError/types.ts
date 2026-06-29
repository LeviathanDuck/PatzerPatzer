import type { StoredAnalysis, StoredNodeEntry, ReviewEngineMetadata } from '../../idb';
import type { ImportedGame } from '../../import/types';
import type { Breadcrumb, DiagnosticEvent } from '../types';
import type { ReviewErrorPackageStorageRecord } from './storage';

export const REVIEW_ERROR_PACKAGE_FORMAT_VERSION = 1;

export const REVIEW_ERROR_FULL_CONTEXT_CATEGORIES = [
  'raw PGN',
  'FENs',
  'stored analysis',
  'engine metadata',
  'browser/session context',
  'diagnostics',
  'screenshots',
] as const;

export const REVIEW_ERROR_PROHIBITED_DATA_CLASSES = [
  'tokens',
  'cookies',
  'passwords',
  'OAuth secrets',
  'admin token values',
  'raw localStorage dumps',
] as const;

export type ReviewErrorFullContextCategory = typeof REVIEW_ERROR_FULL_CONTEXT_CATEGORIES[number];
export type ReviewErrorProhibitedDataClass = typeof REVIEW_ERROR_PROHIBITED_DATA_CLASSES[number];

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
  devicePixelRatio?: number;
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: {
    type?: string;
    effectiveType?: string;
  };
  storageEstimate?: {
    quota?: number;
    usage?: number;
  };
  performance?: {
    domContentLoadedMs?: number;
    loadMs?: number;
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

export interface ReviewErrorScreenshotAttachmentPreview {
  fileName: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  sizeBytes: number;
  lastModified?: number;
}

export interface ReviewErrorRemoteUploadConsent {
  previewShownAt?: string;
  explicitConsent: boolean;
  consentedAt?: string;
  localSaveOnly: boolean;
}

export interface ReviewErrorPackagePreview {
  requiredBeforeRemoteUpload: true;
  fullContextCategories: ReviewErrorFullContextCategory[];
  prohibitedDataClasses: ReviewErrorProhibitedDataClass[];
  screenshotAttachments: ReviewErrorScreenshotAttachmentPreview[];
  remoteUploadConsent: ReviewErrorRemoteUploadConsent;
}

export interface ReviewErrorBoundedContext {
  scope: {
    gameId: string;
    selectedPath: string;
    includedAnalysisNodePaths: string[];
    includedDiagnosticEventIds: string[];
  };
  route: {
    currentRoute: string;
    safeQueryParams: Record<string, string>;
    recentTransitions: Array<{
      from: string;
      to: string;
      timestamp: number;
    }>;
  };
  breadcrumbs: Breadcrumb[];
  browserSummary: ReviewErrorBrowserContext;
  exclusions: ReviewErrorProhibitedDataClass[];
  notes: string[];
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
  boundedContext: ReviewErrorBoundedContext;
  preview: ReviewErrorPackagePreview;
}
