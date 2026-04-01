// Study line extractor — converts a tree path into a TrainableSequence.
// Pure function only: no IDB, no DOM, no side effects.
// Phase 4 Task 4.5 (CCP-547).
// Adapted from lichess-org/lila: modules/practice/src/main/PracticeStudyApi.scala chapter-to-line extraction.

import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci, makeUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import type { TreeNode } from '../../tree/types';
import type { TrainableSequence } from '../types';

/**
 * Extract the mainline from the root TreeNode into a TrainableSequence.
 *
 * Walks the first-child chain from root, collecting move/san/fen at each step.
 * Pre-computes FEN after each move using chessops so drill can restore positions.
 *
 * @param root          - root TreeNode (no move, starting FEN)
 * @param studyItemId   - ID of the parent StudyItem
 * @param label         - human-readable name for this sequence (e.g. chapter title)
 * @param trainAs       - which side the user is practicing as
 * @param sequenceId    - stable ID for the sequence (caller supplies or generates)
 */
export function extractMainline(
  root:        TreeNode,
  studyItemId: string,
  label:       string,
  trainAs:     'white' | 'black',
  sequenceId:  string,
): TrainableSequence | null {
  const moves: string[] = [];
  const sans:  string[] = [];
  const fens:  string[] = [];

  let node = root;
  while (node.children.length > 0) {
    const child = node.children[0]!;
    if (!child.uci || !child.san) break; // stop at gaps

    moves.push(child.uci);
    sans.push(child.san);
    fens.push(child.fen);

    node = child;
  }

  if (sans.length === 0) return null;

  const now = Date.now();
  return {
    id:         sequenceId,
    studyItemId,
    label,
    moves,
    sans,
    fens,
    trainAs,
    startPly:   0,
    status:     'active',
    createdAt:  now,
    updatedAt:  now,
  };
}

/**
 * Extract a specific variation path into a TrainableSequence.
 *
 * @param root      - root TreeNode
 * @param pathIds   - array of 2-char node IDs forming the path (e.g. ['a1', 'b2', ...])
 */
export function extractVariationLine(
  root:        TreeNode,
  pathIds:     string[],
  studyItemId: string,
  label:       string,
  trainAs:     'white' | 'black',
  sequenceId:  string,
): TrainableSequence | null {
  const moves: string[] = [];
  const sans:  string[] = [];
  const fens:  string[] = [];

  let node: TreeNode = root;
  for (const id of pathIds) {
    const child = node.children.find(c => c.id === id);
    if (!child) return null;
    if (child.uci && child.san) {
      moves.push(child.uci);
      sans.push(child.san);
      fens.push(child.fen);
    }
    node = child;
  }

  // Continue down mainline from the end of the variation
  while (node.children.length > 0) {
    const child = node.children[0]!;
    if (!child.uci || !child.san) break;
    moves.push(child.uci);
    sans.push(child.san);
    fens.push(child.fen);
    node = child;
  }

  if (sans.length === 0) return null;

  const now = Date.now();
  return {
    id:         sequenceId,
    studyItemId,
    label,
    moves,
    sans,
    fens,
    trainAs,
    startPly:   0,
    status:     'active',
    createdAt:  now,
    updatedAt:  now,
  };
}

/**
 * Re-derive FENs for a sequence using chessops starting from startFen.
 * Call this if node.fen values may be missing/stale.
 * Adapted from lichess-org/lila: ui/puzzle/src/puzzle.ts positionFromPly
 */
export function deriveFens(startFen: string, ucis: string[]): string[] | null {
  try {
    const setup = parseFen(startFen).unwrap();
    const pos   = Chess.fromSetup(setup).unwrap();
    const fens: string[] = [];
    for (const uci of ucis) {
      const move = parseUci(uci);
      if (!move) return null;
      makeSanAndPlay(pos, move);
      fens.push(pos.toString());
    }
    return fens;
  } catch {
    return null;
  }
}

/**
 * Extract a variation by path string (TreePath = concatenated 2-char node IDs).
 * Convenience wrapper around extractVariationLine for Task 7.3 (CCP-560).
 */
export function extractFromVariationPath(
  root:        TreeNode,
  path:        string,
  studyItemId: string,
  label:       string,
  trainAs:     'white' | 'black',
  sequenceId:  string,
): TrainableSequence | null {
  const pathIds = path.match(/.{2}/g) ?? [];
  if (pathIds.length === 0) return null;
  return extractVariationLine(root, pathIds, studyItemId, label, trainAs, sequenceId);
}

/**
 * Navigate from root to the node at the given tree path (2-char IDs concatenated).
 * Returns the node at that path, or null if the path doesn't exist.
 * Extended in Task 7.1 (CCP-558) to support "Practice from here".
 */
export function getNodeAtPath(root: TreeNode, path: string): TreeNode | null {
  let node: TreeNode = root;
  let remaining = path;
  while (remaining.length >= 2) {
    const id = remaining.slice(0, 2);
    remaining = remaining.slice(2);
    const child = node.children.find(c => c.id === id);
    if (!child) return null;
    node = child;
  }
  return node;
}

/**
 * Extract mainline forward from a specific tree path position.
 * Used for "Practice from here" — extracts from the node at `path` to the end of its mainline.
 */
export function extractFromPath(
  root:        TreeNode,
  path:        string,
  studyItemId: string,
  label:       string,
  trainAs:     'white' | 'black',
  sequenceId:  string,
): TrainableSequence | null {
  const startNode = getNodeAtPath(root, path);
  if (!startNode) return null;
  return extractMainline(startNode, studyItemId, label, trainAs, sequenceId);
}

// Re-export for convenience
export { makeUci };
