import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';

import {
  buildRepertoireIndex,
  lookupRepertoireEntriesByFen,
  parseRepertoirePgn,
  type ParsedRepertoireGame,
  type RepertoireLinePrefixMove,
  type RepertoirePositionIndex,
  type RepertoireSource,
} from './index';
import type { RepertoireComplianceReportGroup } from './report';
import type { San, TreeNode, Uci } from '../tree/types';

export type RepertoireOrpTrainAs = 'white' | 'black';

export interface RepertoireOrpLineRequest {
  source: RepertoireSource;
  trainAs: RepertoireOrpTrainAs;
  linePrefix: readonly RepertoireLinePrefixMove[];
  missedUci: Uci | null;
  missedSan?: San | null;
  lineLabel?: string;
}

export interface RepertoireOrpResolvedLine {
  ucis: Uci[];
  sans: San[];
  trainAs: RepertoireOrpTrainAs;
  sourceName: string;
  label: string;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

interface RepertoireOrpSourceCache {
  key: string;
  games: ParsedRepertoireGame[];
  index: RepertoirePositionIndex;
}

interface RepertoireOrpCandidate {
  node: TreeNode;
  exactPrefix: boolean;
  isMain: boolean;
  continuationLength: number;
  chapterIndex: number;
  sourceGameIndex: number;
  path: string;
}

const sourceCache = new Map<string, RepertoireOrpSourceCache>();

function sourceCacheKey(source: RepertoireSource): string {
  return `${source.id}:${source.contentVersion}`;
}

function sourceCacheFor(source: RepertoireSource): RepertoireOrpSourceCache | null {
  const key = sourceCacheKey(source);
  const cached = sourceCache.get(source.id);
  if (cached?.key === key) return cached;
  try {
    const games = parseRepertoirePgn(source.rawPgn);
    const cache = {
      key,
      games,
      index: buildRepertoireIndex(games),
    };
    sourceCache.set(source.id, cache);
    return cache;
  } catch {
    sourceCache.delete(source.id);
    return null;
  }
}

function fenAfterUcis(ucis: readonly Uci[]): string | null {
  const setup = parseFen(START_FEN);
  if (!setup.isOk) return null;
  const posResult = Chess.fromSetup(setup.value);
  if (!posResult.isOk) return null;
  const pos = posResult.value;

  for (const uci of ucis) {
    const move = parseUci(uci);
    if (!move || !pos.isLegal(move)) return null;
    pos.play(move);
  }
  return makeFen(pos.toSetup());
}

function childByPath(root: TreeNode, path: string): TreeNode | null {
  let node = root;
  for (let i = 0; i < path.length; i += 2) {
    const id = path.slice(i, i + 2);
    const child = node.children.find(candidate => candidate.id === id);
    if (!child) return null;
    node = child;
  }
  return node;
}

function childAfterExactPrefixCandidate(
  root: TreeNode,
  prefixUcis: readonly Uci[],
  missedUci: Uci,
  chapterIndex: number,
  sourceGameIndex: number,
): RepertoireOrpCandidate | null {
  let node = root;
  let path = '';
  let isMain = true;
  for (const uci of prefixUcis) {
    const childIndex = node.children.findIndex(candidate => candidate.uci === uci);
    if (childIndex < 0) return null;
    const child = node.children[childIndex]!;
    isMain = isMain && childIndex === 0;
    path += child.id;
    node = child;
  }
  const missedIndex = node.children.findIndex(candidate => candidate.uci === missedUci);
  if (missedIndex < 0) return null;
  const missedNode = node.children[missedIndex]!;
  return {
    node: missedNode,
    exactPrefix: true,
    isMain: isMain && missedIndex === 0,
    continuationLength: mainlineFromNode(missedNode).length,
    chapterIndex,
    sourceGameIndex,
    path: path + missedNode.id,
  };
}

function mainlineFromNode(node: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  let current: TreeNode | undefined = node;
  while (current) {
    nodes.push(current);
    current = current.children[0];
  }
  return nodes;
}

function compareCandidates(a: RepertoireOrpCandidate, b: RepertoireOrpCandidate): number {
  return Number(b.exactPrefix) - Number(a.exactPrefix)
    || Number(b.isMain) - Number(a.isMain)
    || b.continuationLength - a.continuationLength
    || a.chapterIndex - b.chapterIndex
    || a.sourceGameIndex - b.sourceGameIndex
    || a.path.localeCompare(b.path);
}

function lineLabel(sourceName: string, sans: readonly San[], fallback: string | undefined): string {
  const preview = sans.slice(0, 4).join(' ');
  if (preview) return `${sourceName} - ${preview}`;
  return fallback ?? `${sourceName} repertoire line`;
}

function bestMissedNodeByIndex(
  games: readonly ParsedRepertoireGame[],
  index: RepertoirePositionIndex,
  preDivergenceFen: string,
  missedUci: Uci,
): RepertoireOrpCandidate[] {
  return lookupRepertoireEntriesByFen(index, preDivergenceFen).flatMap(entry => {
    if (entry.uci !== missedUci) return [];
    const game = games[entry.chapterIndex];
    if (!game) return [];
    const node = childByPath(game.tree, entry.nodePathHint);
    if (node?.uci !== missedUci) return [];
    return [{
      node,
      exactPrefix: false,
      isMain: entry.isMain,
      continuationLength: mainlineFromNode(node).length,
      chapterIndex: entry.chapterIndex,
      sourceGameIndex: entry.sourceGameIndex,
      path: entry.nodePathHint,
    }];
  });
}

function bestMissedNodeByExactPrefix(
  games: readonly ParsedRepertoireGame[],
  prefixUcis: readonly Uci[],
  missedUci: Uci,
): RepertoireOrpCandidate[] {
  return games.flatMap((game, chapterIndex) => {
    const candidate = childAfterExactPrefixCandidate(
      game.tree,
      prefixUcis,
      missedUci,
      chapterIndex,
      game.sourceGameIndex,
    );
    return candidate ? [candidate] : [];
  });
}

export function resolveRepertoireOrpLine(request: RepertoireOrpLineRequest): RepertoireOrpResolvedLine | null {
  if (!request.missedUci) return null;

  const preDivergencePrefix = request.linePrefix.slice(0, -1);
  const prefixUcis = preDivergencePrefix.map(move => move.uci);
  const prefixSans = preDivergencePrefix.map(move => move.san);
  const preDivergenceFen = fenAfterUcis(prefixUcis);
  if (!preDivergenceFen) return null;

  const cache = sourceCacheFor(request.source);
  if (!cache) return null;

  const missedNode = [
    ...bestMissedNodeByExactPrefix(cache.games, prefixUcis, request.missedUci),
    ...bestMissedNodeByIndex(cache.games, cache.index, preDivergenceFen, request.missedUci),
  ].sort(compareCandidates)[0]?.node ?? null;
  if (!missedNode) return null;

  const continuation = mainlineFromNode(missedNode);
  const continuationUcis = continuation.map(node => node.uci).filter((uci): uci is Uci => Boolean(uci));
  const continuationSans = continuation.map(node => node.san).filter((san): san is San => Boolean(san));
  if (continuationUcis.length === 0 || continuationUcis.length !== continuationSans.length) return null;

  const ucis = [...prefixUcis, ...continuationUcis];
  const sans = [...prefixSans, ...continuationSans];
  return {
    ucis,
    sans,
    trainAs: request.trainAs,
    sourceName: request.source.name,
    label: lineLabel(request.source.name, sans, request.lineLabel),
  };
}

export function resolveRepertoireReportGroupOrpLine(
  group: RepertoireComplianceReportGroup,
  source: RepertoireSource,
): RepertoireOrpResolvedLine | null {
  if (group.ownerColor === 'mixed') return null;
  return resolveRepertoireOrpLine({
    source,
    trainAs: group.ownerColor,
    linePrefix: group.linePrefix,
    missedUci: group.missedUci,
    missedSan: group.missedSan,
    lineLabel: group.lineLabel,
  });
}
