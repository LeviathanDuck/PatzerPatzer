// Move tree operations — adapted from lichess-org/lila: ui/lib/src/tree/tree.ts and ops.ts
//
// Path format: a TreePath is a concatenation of 2-char node IDs.
// e.g. "a1b2c3" means: child "a1" → child "b2" → child "c3"
// head(path) = first 2 chars, tail(path) = everything after first 2 chars

import type { TreeNode, TreePath } from './types';

// --- Path helpers (mirrored from lichess-org/lila: ui/lib/src/tree/path.ts) ---

export const pathHead = (path: TreePath): string => path.slice(0, 2);
export const pathTail = (path: TreePath): string => path.slice(2);
export const pathInit = (path: TreePath): TreePath => path.slice(0, -2);
export const pathLast = (path: TreePath): string => path.slice(-2);

// --- Node lookup ---

/** Find the child of node whose id matches the given 2-char id. */
export function childById(node: TreeNode, id: string): TreeNode | undefined {
  return node.children.find(c => c.id === id);
}

/**
 * Returns the node at the given path, or undefined if the path is invalid.
 * An empty path returns root.
 */
export function nodeAtPath(root: TreeNode, path: TreePath): TreeNode | undefined {
  if (path === '') return root;
  const child = childById(root, pathHead(path));
  return child ? nodeAtPath(child, pathTail(path)) : undefined;
}

/**
 * Returns the parent node of the node at path, or undefined if path is empty or invalid.
 */
export function parentAtPath(root: TreeNode, path: TreePath): TreeNode | undefined {
  if (path === '') return undefined;
  return nodeAtPath(root, pathInit(path));
}

/**
 * Collect all nodes along path from root, inclusive of root.
 * Stops at the first missing step.
 */
export function nodeListAt(root: TreeNode, path: TreePath): TreeNode[] {
  const nodes: TreeNode[] = [root];
  let node = root;
  let p = path;
  while (p !== '') {
    const child = childById(node, pathHead(p));
    if (!child) break;
    nodes.push(child);
    node = child;
    p = pathTail(p);
  }
  return nodes;
}

// --- Mainline ---

/**
 * Returns true if the path follows only first-children (mainline) from root.
 * Mirrors lichess-org/lila: ui/lib/src/tree/tree.ts pathIsMainlineFrom.
 */
export function pathIsMainline(root: TreeNode, path: TreePath): boolean {
  if (path === '') return true;
  const firstChild = root.children[0];
  return (
    firstChild?.id === pathHead(path) &&
    pathIsMainline(firstChild, pathTail(path))
  );
}

/**
 * Walk first-children from root, collecting nodes.
 * Mirrors lichess-org/lila: ui/lib/src/tree/ops.ts mainlineNodeList.
 */
export function mainlineNodeList(root: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  let node: TreeNode | undefined = root;
  while (node) {
    nodes.push(node);
    node = node.children[0];
  }
  return nodes;
}

// --- Mutation ---

/**
 * Add node as a child at path. If a child with the same id already exists, does nothing.
 * Mirrors lichess-org/lila: ui/lib/src/tree/tree.ts addNode.
 */
export function addNode(root: TreeNode, path: TreePath, node: TreeNode): void {
  const parent = nodeAtPath(root, path);
  if (!parent) return;
  if (!childById(parent, node.id)) {
    parent.children.push(node);
  }
}

/**
 * Remove the node at path from its parent's children.
 * Mirrors lichess-org/lila: ui/lib/src/tree/tree.ts deleteNodeAt.
 */
export function deleteNodeAt(root: TreeNode, path: TreePath): void {
  if (path === '') return; // cannot delete root
  const parent = parentAtPath(root, path);
  if (!parent) return;
  const id = pathLast(path);
  parent.children = parent.children.filter(c => c.id !== id);
}

/**
 * Remove all side-variation children from every node, keeping only the first
 * child (mainline continuation) at each position. Walks the mainline only so
 * already-removed branches are not visited twice.
 * Mirrors lichess-org/lila: ui/lib/src/tree/ops.ts updateAll walking pattern.
 */
export function pruneVariations(node: TreeNode): void {
  if (node.children.length > 1) node.children = [node.children[0]!];
  if (node.children[0]) pruneVariations(node.children[0]);
}

/**
 * Promote the node at path toward the mainline.
 * - toMainline=false: promote one level (swap with parent's first child)
 * - toMainline=true:  promote all the way to mainline (first child at every ancestor)
 *
 * Mirrors lichess-org/lila: ui/lib/src/tree/tree.ts promoteAt.
 */
export function promoteAt(root: TreeNode, path: TreePath, toMainline: boolean): void {
  const nodes = nodeListAt(root, path);
  // Walk from second-to-last up toward root
  for (let i = nodes.length - 2; i >= 0; i--) {
    const node = nodes[i + 1]!;
    const parent = nodes[i]!;
    if (parent.children[0]?.id !== node.id) {
      // node is not already the first child — move it there
      parent.children = [node, ...parent.children.filter(c => c.id !== node.id)];
      if (!toMainline) break;
    } else if (node.forceVariation) {
      node.forceVariation = false;
      if (!toMainline) break;
    }
  }
}
