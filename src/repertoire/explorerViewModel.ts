import {
  buildRepertoireIndex,
  isAccountRepertoireSource,
  lookupRepertoireEntriesByFen,
  parseRepertoirePgn,
  type RepertoireEntry,
  type RepertoirePositionIndex,
  type RepertoireSide,
  type RepertoireSource,
} from './index';
import {
  getAccountRepertoireBuildState,
  lookupAccountRepertoireEntriesByFen,
  type AccountRepertoireBuildState,
} from './accountSource';
import { positionKeyFromFen, type PositionKey } from '../tree/fenKey';
import type { GlyphId, San, TreeComment, TreeNode, Uci } from '../tree/types';

export interface RepertoireExplorerLinePosition<Path = unknown> {
  fen: string;
  path?: Path;
  uci?: Uci | null;
  san?: San | null;
  ply?: number;
}

export interface RepertoireExplorerPriorMatch<Path = unknown> {
  matched: RepertoireExplorerLinePosition<Path>;
  leftBy: RepertoireExplorerLinePosition<Path> | null;
}

export interface RepertoireExplorerSourceGroup {
  source: RepertoireSource;
  sourceIndex: number;
  accentIndex: number;
  expectedReply: boolean;
  entries: RepertoireEntry[];
  error: string | null;
  accountBuildState: AccountRepertoireBuildState | null;
}

export interface RepertoireExplorerPositionAnnotation {
  source: RepertoireSource;
  sourceIndex: number;
  accentIndex: number;
  chapterIndex: number;
  chapterTitle: string;
  sourceGameIndex: number;
  comments: TreeComment[];
  nags: GlyphId[];
}

export interface RepertoireArrowMove {
  uci: Uci;
  isMain: boolean;
  sourceIds: string[];
}

export interface RepertoireExplorerModel<Path = unknown> {
  sources: RepertoireSource[];
  enabledSources: RepertoireSource[];
  groups: RepertoireExplorerSourceGroup[];
  positionAnnotations: RepertoireExplorerPositionAnnotation[];
  hasCurrentMatch: boolean;
  hasPendingAccountBuild: boolean;
  deepestPriorMatch: RepertoireExplorerPriorMatch<Path> | null;
}

interface CachedPositionAnnotation {
  chapterIndex: number;
  chapterTitle: string;
  sourceGameIndex: number;
  comments: TreeComment[];
  nags: GlyphId[];
}

interface CachedIndex {
  contentVersion: string;
  index: RepertoirePositionIndex;
  positionAnnotations: Map<PositionKey, CachedPositionAnnotation[]>;
}

const sourceIndexCache = new Map<string, CachedIndex>();

export function repertoireSourceSideBadge(side: RepertoireSide): string {
  if (side === 'white') return 'W';
  if (side === 'black') return 'B';
  return 'WB';
}

export function repertoireSideToMove(fen: string): 'white' | 'black' {
  return fen.trim().split(/\s+/)[1] === 'b' ? 'black' : 'white';
}

export function repertoireSourceIsExpectedReply(source: Pick<RepertoireSource, 'side'>, fen: string): boolean {
  const sideToMove = repertoireSideToMove(fen);
  return source.side !== 'both' && source.side !== sideToMove;
}

function cloneComments(comments: readonly TreeComment[] | undefined): TreeComment[] {
  return (comments ?? []).map(comment => ({
    ...comment,
    by: typeof comment.by === 'string' ? comment.by : { ...comment.by },
  }));
}

function addPositionAnnotations(
  annotations: Map<PositionKey, CachedPositionAnnotation[]>,
  node: TreeNode,
  chapterIndex: number,
  chapterTitle: string,
  sourceGameIndex: number,
): void {
  const comments = cloneComments(node.comments).filter(comment => comment.text.trim().length > 0);
  const nags = [...(node.nags ?? [])];
  if (comments.length > 0 || nags.length > 0) {
    const positionKey = positionKeyFromFen(node.fen);
    const existing = annotations.get(positionKey) ?? [];
    existing.push({
      chapterIndex,
      chapterTitle,
      sourceGameIndex,
      comments,
      nags,
    });
    annotations.set(positionKey, existing);
  }

  for (const child of node.children) {
    addPositionAnnotations(annotations, child, chapterIndex, chapterTitle, sourceGameIndex);
  }
}

function cachedForSource(source: RepertoireSource): CachedIndex {
  if (isAccountRepertoireSource(source)) throw new Error('Account-backed sources use the account model cache.');
  const cached = sourceIndexCache.get(source.id);
  if (cached?.contentVersion === source.contentVersion) return cached;
  const games = parseRepertoirePgn(source.rawPgn);
  const index = buildRepertoireIndex(games);
  if (source.gameCount > 0 && source.chapterCount > 0 && source.rawPgn.trim() && index.size === 0) {
    throw new Error('Repertoire source produced no position index.');
  }
  const positionAnnotations = new Map<PositionKey, CachedPositionAnnotation[]>();
  games.forEach((game, chapterIndex) => {
    addPositionAnnotations(positionAnnotations, game.tree, chapterIndex, game.title, game.sourceGameIndex);
  });
  const next = { contentVersion: source.contentVersion, index, positionAnnotations };
  sourceIndexCache.set(source.id, next);
  return next;
}

function indexForSource(source: RepertoireSource): RepertoirePositionIndex {
  return cachedForSource(source).index;
}

function dedupeEntries(entries: RepertoireEntry[]): RepertoireEntry[] {
  const byUci = new Map<Uci, RepertoireEntry>();
  for (const entry of entries) {
    const existing = byUci.get(entry.uci);
    if (!existing || (entry.isMain && !existing.isMain)) byUci.set(entry.uci, entry);
  }
  return [...byUci.values()].sort((a, b) => Number(b.isMain) - Number(a.isMain));
}

function entriesForSource(source: RepertoireSource, fen: string): { entries: RepertoireEntry[]; error: string | null } {
  if (isAccountRepertoireSource(source)) {
    try {
      return { entries: dedupeEntries(lookupAccountRepertoireEntriesByFen(source, fen)), error: null };
    } catch {
      return { entries: [], error: 'Could not build this account source.' };
    }
  }
  try {
    return { entries: dedupeEntries(lookupRepertoireEntriesByFen(indexForSource(source), fen)), error: null };
  } catch {
    return { entries: [], error: 'Could not parse this repertoire source.' };
  }
}

function positionAnnotationsForSource(
  source: RepertoireSource,
  fen: string,
  sourceIndex: number,
  accentIndex: number,
): RepertoireExplorerPositionAnnotation[] {
  if (isAccountRepertoireSource(source)) return [];
  try {
    return (cachedForSource(source).positionAnnotations.get(positionKeyFromFen(fen)) ?? []).map(annotation => ({
      source,
      sourceIndex,
      accentIndex,
      chapterIndex: annotation.chapterIndex,
      chapterTitle: annotation.chapterTitle,
      sourceGameIndex: annotation.sourceGameIndex,
      comments: cloneComments(annotation.comments),
      nags: [...annotation.nags],
    }));
  } catch {
    return [];
  }
}

function hasEntriesAtFen(sources: RepertoireSource[], fen: string): boolean {
  return sources.some(source => entriesForSource(source, fen).entries.length > 0);
}

export function buildRepertoireArrowMoves(sources: RepertoireSource[], fen: string): RepertoireArrowMove[] {
  const byUci = new Map<Uci, RepertoireArrowMove>();
  for (const source of sources) {
    if (!source.enabled) continue;
    const { entries, error } = entriesForSource(source, fen);
    if (error) continue;
    for (const entry of entries) {
      const existing = byUci.get(entry.uci);
      if (existing) {
        existing.isMain = existing.isMain || entry.isMain;
        existing.sourceIds.push(source.id);
      } else {
        byUci.set(entry.uci, {
          uci: entry.uci,
          isMain: entry.isMain,
          sourceIds: [source.id],
        });
      }
    }
  }
  return [...byUci.values()].sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.uci.localeCompare(b.uci));
}

function deepestPriorMatch<Path>(
  enabledSources: RepertoireSource[],
  line: RepertoireExplorerLinePosition<Path>[] | undefined,
): RepertoireExplorerPriorMatch<Path> | null {
  if (!line || line.length < 2) return null;
  for (let i = line.length - 2; i >= 0; i--) {
    const position = line[i];
    if (position && hasEntriesAtFen(enabledSources, position.fen)) {
      return {
        matched: position,
        leftBy: line[i + 1] ?? null,
      };
    }
  }
  return null;
}

export function buildRepertoireExplorerModel<Path = unknown>(
  sources: RepertoireSource[],
  fen: string,
  line?: RepertoireExplorerLinePosition<Path>[],
): RepertoireExplorerModel<Path> {
  const enabledSources = sources.filter(source => source.enabled);
  const groups = enabledSources.map((source, enabledIndex) => {
    const sourceIndex = sources.findIndex(candidate => candidate.id === source.id);
    const { entries, error } = entriesForSource(source, fen);
    const accountBuildState = isAccountRepertoireSource(source) ? getAccountRepertoireBuildState(source) : null;
    return {
      source,
      sourceIndex,
      accentIndex: (sourceIndex === -1 ? enabledIndex : sourceIndex) % 8,
      expectedReply: !isAccountRepertoireSource(source) && repertoireSourceIsExpectedReply(source, fen),
      entries,
      error,
      accountBuildState,
    };
  });
  const positionAnnotations = enabledSources.flatMap((source, enabledIndex) => {
    const sourceIndex = sources.findIndex(candidate => candidate.id === source.id);
    const effectiveSourceIndex = sourceIndex === -1 ? enabledIndex : sourceIndex;
    const accentIndex = effectiveSourceIndex % 8;
    return positionAnnotationsForSource(source, fen, effectiveSourceIndex, accentIndex);
  });
  const hasCurrentMatch = groups.some(group => group.entries.length > 0);
  const hasPendingAccountBuild = groups.some(group => {
    const state = group.accountBuildState?.state;
    return state === 'idle' || state === 'loading' || state === 'building' || state === 'publishing';
  });
  return {
    sources,
    enabledSources,
    groups,
    positionAnnotations,
    hasCurrentMatch,
    hasPendingAccountBuild,
    deepestPriorMatch: hasCurrentMatch || hasPendingAccountBuild ? null : deepestPriorMatch(enabledSources, line),
  };
}
