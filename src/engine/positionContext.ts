import type { TreeNode, TreePath } from '../tree/types';

export type EnginePositionContextSource = 'history' | 'fen-only';

export interface EnginePositionContext {
  initialFen: string;
  moves: string[];
  currentFen: string;
  source: EnginePositionContextSource;
  surface: string;
  path?: string;
  reason?: string;
}

export function historyPositionContext(args: {
  initialFen: string;
  moves: readonly string[];
  currentFen: string;
  surface: string;
  path?: string;
}): EnginePositionContext {
  return {
    initialFen: args.initialFen,
    moves: [...args.moves],
    currentFen: args.currentFen,
    source: 'history',
    surface: args.surface,
    ...(args.path !== undefined ? { path: args.path } : {}),
  };
}

export function fenOnlyPositionContext(
  currentFen: string,
  surface: string,
  reason: string,
): EnginePositionContext {
  return {
    initialFen: currentFen,
    moves: [],
    currentFen,
    source: 'fen-only',
    surface,
    reason,
  };
}

export function contextFromNodeList(
  nodes: readonly TreeNode[],
  surface: string,
  path?: TreePath | string,
): EnginePositionContext {
  const root = nodes[0];
  const current = nodes[nodes.length - 1];
  if (!root || !current) {
    return fenOnlyPositionContext('', surface, 'missing-node-list');
  }

  const moves: string[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const uci = nodes[i]?.uci;
    if (!uci) {
      return fenOnlyPositionContext(current.fen, surface, `missing-uci-at-ply-index-${i}`);
    }
    moves.push(uci);
  }

  return historyPositionContext({
    initialFen: root.fen,
    moves,
    currentFen: current.fen,
    surface,
    ...(path !== undefined ? { path } : {}),
  });
}

export function contextFromRootAndMoves(args: {
  initialFen: string;
  moves: readonly string[];
  currentFen: string;
  surface: string;
  path?: string;
}): EnginePositionContext {
  if (!args.initialFen || !args.currentFen) {
    return fenOnlyPositionContext(
      args.currentFen || args.initialFen,
      args.surface,
      'missing-root-or-current-fen',
    );
  }

  return historyPositionContext(args);
}

export function uciPositionCommand(context: EnginePositionContext): string {
  const prefix = `position fen ${context.initialFen}`;
  return context.moves.length > 0
    ? `${prefix} moves ${context.moves.join(' ')}`
    : prefix;
}
