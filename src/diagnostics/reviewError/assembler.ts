import { getDiagnosticEvents, loadAnalysisFromIdb } from '../../idb';
import type { StoredAnalysis, StoredNodeEntry } from '../../idb';
import type { ImportedGame } from '../../import/types';
import { nodeAtPath, nodeListAt, pathInit } from '../../tree/ops';
import type { TreeNode, TreePath } from '../../tree/types';
import { getSessionId as defaultGetSessionId } from '../id';
import { record as defaultRecord, snapshotBreadcrumbs as defaultSnapshotBreadcrumbs } from '../record';
import { currentAppRoute, currentSafeRouteQueryParams, sanitizeAppRoute } from '../route';
import { Severity, type Breadcrumb, type DiagnosticEvent } from '../types';
import { getCompileTimeReleaseIdentity } from '../../releaseIdentity';
import {
  REVIEW_ERROR_PACKAGE_FORMAT_VERSION,
  REVIEW_ERROR_FULL_CONTEXT_CATEGORIES,
  REVIEW_ERROR_PROHIBITED_DATA_CLASSES,
  type ReviewErrorAppIdentity,
  type ReviewErrorBoundedContext,
  type ReviewErrorBrowserContext,
  type ReviewErrorCurrentEngineSettings,
  type ReviewErrorGameMetadata,
  type ReviewErrorPackage,
  type ReviewErrorRemoteUploadConsent,
  type ReviewErrorScreenshotAttachmentPreview,
} from './types';

export interface ReviewErrorPackageAssemblyInput {
  game: ImportedGame;
  root: TreeNode;
  path: TreePath;
  memo: string;
  currentEngineSettings: ReviewErrorCurrentEngineSettings;
  screenshotAttachments?: ReviewErrorScreenshotAttachmentPreview[];
  remoteUploadConsent?: ReviewErrorRemoteUploadConsent;
}

export interface ReviewErrorPackageAssemblyDependencies {
  loadAnalysis?: (gameId: string) => Promise<StoredAnalysis | undefined>;
  getRecentEvents?: () => Promise<DiagnosticEvent[]>;
  recordEvent?: (event: Partial<DiagnosticEvent>) => void;
  createPackageId?: () => string;
  getSessionId?: () => string;
  getBrowserContext?: () => Promise<ReviewErrorBrowserContext> | ReviewErrorBrowserContext;
  getBreadcrumbs?: (maxCount: number) => Breadcrumb[];
  getSafeRouteQueryParams?: () => Record<string, string>;
  now?: () => number;
}

type NavigatorWithDeviceMemory = Navigator & {
  deviceMemory?: number;
  connection?: {
    type?: string;
    effectiveType?: string;
  };
};

function requireTrimmed(value: string, errorCode: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(errorCode);
  return trimmed;
}

function createReviewErrorPackageId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return `review-error-${uuid}`;
  const rand = Math.random().toString(36).slice(2);
  return `review-error-${Date.now().toString(36)}-${rand}`;
}

function releaseIdentity(): ReviewErrorAppIdentity {
  const identity = getCompileTimeReleaseIdentity();
  return {
    release: identity.release,
    version: identity.version,
    buildId: identity.buildId,
  };
}

async function defaultBrowserContext(): Promise<ReviewErrorBrowserContext> {
  const nav = typeof navigator === 'undefined' ? undefined : navigator as NavigatorWithDeviceMemory;
  const navigation = typeof performance !== 'undefined' && typeof performance.getEntriesByType === 'function'
    ? performance.getEntriesByType('navigation')[0]
    : undefined;
  const navTiming = typeof PerformanceNavigationTiming !== 'undefined' && navigation instanceof PerformanceNavigationTiming
    ? navigation
    : undefined;
  const storageEstimate = nav?.storage?.estimate
    ? await nav.storage.estimate().then(({ quota, usage }) => ({
        ...(quota !== undefined ? { quota } : {}),
        ...(usage !== undefined ? { usage } : {}),
      })).catch(() => undefined)
    : undefined;

  return {
    userAgent: nav?.userAgent ?? '',
    platform: nav?.platform ?? '',
    language: nav?.language ?? '',
    viewportWidth: typeof window === 'undefined' ? 0 : Math.max(0, Math.floor(window.innerWidth)),
    viewportHeight: typeof window === 'undefined' ? 0 : Math.max(0, Math.floor(window.innerHeight)),
    ...(typeof window !== 'undefined' && Number.isFinite(window.devicePixelRatio) ? { devicePixelRatio: window.devicePixelRatio } : {}),
    ...(nav?.hardwareConcurrency !== undefined ? { hardwareConcurrency: nav.hardwareConcurrency } : {}),
    ...(nav?.deviceMemory !== undefined ? { deviceMemory: nav.deviceMemory } : {}),
    ...(nav?.connection ? {
      connection: {
        ...(nav.connection.type !== undefined ? { type: nav.connection.type } : {}),
        ...(nav.connection.effectiveType !== undefined ? { effectiveType: nav.connection.effectiveType } : {}),
      },
    } : {}),
    ...(storageEstimate !== undefined ? { storageEstimate } : {}),
    ...(navTiming ? {
      performance: {
        ...(Number.isFinite(navTiming.domContentLoadedEventEnd) ? { domContentLoadedMs: Math.max(0, Math.round(navTiming.domContentLoadedEventEnd)) } : {}),
        ...(Number.isFinite(navTiming.loadEventEnd) ? { loadMs: Math.max(0, Math.round(navTiming.loadEventEnd)) } : {}),
      },
    } : {}),
  };
}

function gameMetadata(game: ImportedGame): ReviewErrorGameMetadata {
  return {
    gameId: game.id,
    ...(game.white !== undefined ? { white: game.white } : {}),
    ...(game.black !== undefined ? { black: game.black } : {}),
    ...(game.result !== undefined ? { result: game.result } : {}),
    ...(game.date !== undefined ? { date: game.date } : {}),
    ...(game.timeClass !== undefined ? { timeClass: game.timeClass } : {}),
    ...(game.opening !== undefined ? { opening: game.opening } : {}),
    ...(game.eco !== undefined ? { eco: game.eco } : {}),
    ...(game.source !== undefined ? { source: game.source } : {}),
    ...(game.whiteRating !== undefined ? { whiteRating: game.whiteRating } : {}),
    ...(game.blackRating !== undefined ? { blackRating: game.blackRating } : {}),
    ...(game.importedAt !== undefined ? { importedAt: game.importedAt } : {}),
  };
}

function pathPrefixes(path: TreePath): TreePath[] {
  const paths: TreePath[] = [];
  for (let i = 2; i <= path.length; i += 2) paths.push(path.slice(0, i));
  return paths;
}

function firstChildContinuationPaths(node: TreeNode, path: TreePath, maxCount: number): TreePath[] {
  const paths: TreePath[] = [];
  let currentNode: TreeNode | undefined = node;
  let currentPath = path;
  while (paths.length < maxCount && currentNode?.children[0]) {
    currentNode = currentNode.children[0];
    currentPath += currentNode.id;
    paths.push(currentPath);
  }
  return paths;
}

function relatedStoredNodes(
  root: TreeNode,
  selectedNode: TreeNode,
  path: TreePath,
  nodes: Record<string, StoredNodeEntry>,
): StoredNodeEntry[] {
  const previous = pathPrefixes(path).slice(-3);
  const next = firstChildContinuationPaths(selectedNode, path, 2);
  const selected = new Set<TreePath>([path]);
  const paths = [...previous, ...next];
  const unique = new Set<TreePath>();
  const related: StoredNodeEntry[] = [];

  for (const candidatePath of paths) {
    if (selected.has(candidatePath) || unique.has(candidatePath)) continue;
    if (candidatePath && !nodeAtPath(root, candidatePath)) continue;
    const entry = nodes[candidatePath];
    if (!entry) continue;
    unique.add(candidatePath);
    related.push(entry);
  }

  return related;
}

function filterReviewRelatedSafeEvents(events: DiagnosticEvent[]): DiagnosticEvent[] {
  const related = /review|analysis|engine|stockfish|ceval|idb/i;
  return events
    .filter(event => event.redactionClass === 'safe')
    .filter(event => (
      event.kind === 'engine' ||
      event.kind === 'idb' ||
      event.sourceTag === 'review-queue' ||
      event.sourceTag === 'engine' ||
      event.sourceTag === 'diagnostics.reviewError' ||
      related.test(event.message)
    ))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 50);
}

function recentRouteTransitions(breadcrumbs: Breadcrumb[]): ReviewErrorBoundedContext['route']['recentTransitions'] {
  return breadcrumbs
    .filter((breadcrumb): breadcrumb is Breadcrumb & { type: 'route-transition' } => breadcrumb.type === 'route-transition')
    .slice(-5)
    .map(breadcrumb => ({
      from: sanitizeAppRoute(breadcrumb.from),
      to: sanitizeAppRoute(breadcrumb.to),
      timestamp: breadcrumb.timestamp,
    }));
}

function selectedNodePaths(
  path: TreePath,
  selectedNode: StoredNodeEntry | undefined,
  parentNode: StoredNodeEntry | undefined,
  neighborNodes: StoredNodeEntry[],
): string[] {
  return Array.from(new Set([
    path,
    ...(selectedNode?.path ? [selectedNode.path] : []),
    ...(parentNode?.path ? [parentNode.path] : []),
    ...neighborNodes.map(node => node.path),
  ].filter(Boolean)));
}

function buildBoundedContext(input: {
  gameId: string;
  path: TreePath;
  selectedNode: StoredNodeEntry | undefined;
  parentNode: StoredNodeEntry | undefined;
  neighborNodes: StoredNodeEntry[];
  recentEvents: DiagnosticEvent[];
  breadcrumbs: Breadcrumb[];
  safeQueryParams: Record<string, string>;
  browser: ReviewErrorBrowserContext;
}): ReviewErrorBoundedContext {
  return {
    scope: {
      gameId: input.gameId,
      selectedPath: input.path,
      includedAnalysisNodePaths: selectedNodePaths(input.path, input.selectedNode, input.parentNode, input.neighborNodes),
      includedDiagnosticEventIds: input.recentEvents.map(event => event.eventId),
    },
    route: {
      currentRoute: currentAppRoute(),
      safeQueryParams: input.safeQueryParams,
      recentTransitions: recentRouteTransitions(input.breadcrumbs),
    },
    breadcrumbs: input.breadcrumbs,
    browserSummary: input.browser,
    exclusions: [...REVIEW_ERROR_PROHIBITED_DATA_CLASSES],
    notes: [
      'Package context is bounded to the selected game, selected move path, related stored analysis nodes, and recent safe diagnostics.',
      'No unrelated full IndexedDB database dump or raw localStorage dump is captured.',
    ],
  };
}

async function defaultRecentSafeEvents(): Promise<DiagnosticEvent[]> {
  const events = await getDiagnosticEvents({ limit: 250 });
  return filterReviewRelatedSafeEvents(events);
}

function assertCompleteAnalysis(stored: StoredAnalysis | undefined, gameId: string): StoredAnalysis {
  if (!stored) throw new Error(`review-error-analysis-missing:${gameId}`);
  if (stored.status !== 'complete') throw new Error(`review-error-analysis-not-complete:${gameId}`);
  return stored;
}

export async function assembleReviewErrorPackage(
  input: ReviewErrorPackageAssemblyInput,
  dependencies: ReviewErrorPackageAssemblyDependencies = {},
): Promise<ReviewErrorPackage> {
  const gameId = requireTrimmed(input.game.id, 'review-error-game-id-required');
  const memo = requireTrimmed(input.memo, 'review-error-memo-required');
  const rawPgn = requireTrimmed(input.game.pgn, 'review-error-raw-pgn-required');
  const path = requireTrimmed(input.path, 'review-error-move-path-required');
  const selectedTreeNode = nodeAtPath(input.root, path);
  if (!selectedTreeNode || path === '') throw new Error(`review-error-selected-move-missing:${path}`);
  const parentPath = pathInit(path);
  const pathNodes = nodeListAt(input.root, path);
  const parentTreeNode = pathNodes.length >= 2 ? pathNodes[pathNodes.length - 2] : undefined;

  const loadAnalysis = dependencies.loadAnalysis ?? loadAnalysisFromIdb;
  const storedAnalysis = assertCompleteAnalysis(await loadAnalysis(gameId), gameId);
  const selectedNode = storedAnalysis.nodes[path];
  const parentNode = parentPath ? storedAnalysis.nodes[parentPath] : undefined;
  const neighborNodes = relatedStoredNodes(input.root, selectedTreeNode, path, storedAnalysis.nodes);
  const now = dependencies.now?.() ?? Date.now();
  const createdAt = new Date(now).toISOString();
  const packageId = dependencies.createPackageId?.() ?? createReviewErrorPackageId();
  const browser = await (dependencies.getBrowserContext?.() ?? defaultBrowserContext());
  const recentEvents = dependencies.getRecentEvents
    ? filterReviewRelatedSafeEvents(await dependencies.getRecentEvents())
    : await defaultRecentSafeEvents();
  const breadcrumbs = (dependencies.getBreadcrumbs ?? defaultSnapshotBreadcrumbs)(30);
  const safeQueryParams = dependencies.getSafeRouteQueryParams?.() ?? currentSafeRouteQueryParams();
  const screenshotAttachments = input.screenshotAttachments ?? [];
  const remoteUploadConsent: ReviewErrorRemoteUploadConsent = input.remoteUploadConsent ?? {
    explicitConsent: false,
    localSaveOnly: true,
  };

  const pkg: ReviewErrorPackage = {
    packageId,
    packageKind: 'review-error',
    packageFormatVersion: REVIEW_ERROR_PACKAGE_FORMAT_VERSION,
    createdAt,
    gameId,
    status: 'new',
    adminMemo: {
      message: memo,
      submittedAt: createdAt,
    },
    app: releaseIdentity(),
    session: {
      sessionId: dependencies.getSessionId?.() ?? defaultGetSessionId(),
      route: currentAppRoute(),
      capturedAt: createdAt,
    },
    game: {
      gameId,
      rawPgn,
      metadata: gameMetadata(input.game),
    },
    selectedMove: {
      path,
      ply: selectedTreeNode.ply,
      ...(selectedTreeNode.san !== undefined ? { san: selectedTreeNode.san } : {}),
      ...(selectedTreeNode.uci !== undefined ? { uci: selectedTreeNode.uci } : {}),
      ...(parentTreeNode?.fen !== undefined ? { fenBefore: parentTreeNode.fen } : {}),
      fenAfter: selectedTreeNode.fen,
      moverColor: selectedTreeNode.ply % 2 === 1 ? 'white' : 'black',
    },
    analysis: {
      status: storedAnalysis.status,
      analysisVersion: storedAnalysis.analysisVersion,
      analysisDepth: storedAnalysis.analysisDepth,
      updatedAt: storedAnalysis.updatedAt,
      ...(storedAnalysis.reviewEngine !== undefined ? { reviewEngine: storedAnalysis.reviewEngine } : {}),
      storedAnalysis,
      ...(selectedNode !== undefined ? { selectedNode } : {}),
      ...(parentNode !== undefined ? { parentNode } : {}),
      neighborNodes,
    },
    currentEngineSettings: input.currentEngineSettings,
    browser,
    diagnostics: {
      recentEvents,
    },
    boundedContext: buildBoundedContext({
      gameId,
      path,
      selectedNode,
      parentNode,
      neighborNodes,
      recentEvents,
      breadcrumbs,
      safeQueryParams,
      browser,
    }),
    preview: {
      requiredBeforeRemoteUpload: true,
      fullContextCategories: [...REVIEW_ERROR_FULL_CONTEXT_CATEGORIES],
      prohibitedDataClasses: [...REVIEW_ERROR_PROHIBITED_DATA_CLASSES],
      screenshotAttachments,
      remoteUploadConsent,
    },
  };

  (dependencies.recordEvent ?? defaultRecord)({
    kind: 'user-report',
    severity: Severity.Info,
    source: 'diagnostics.reviewError',
    sourceTag: 'diagnostics.reviewError',
    message: 'review-error-package-created',
    metadata: {
      packageId,
      gameId,
      path,
      createdAt,
    },
    redactionClass: 'safe',
  });

  return pkg;
}
