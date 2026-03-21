// Analysis controller shell
// Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts

import { mainlineNodeList, nodeAtPath, nodeListAt } from '../tree/ops';
import type { TreeNode, TreePath } from '../tree/types';
import type { RetroCtrl } from './retroCtrl';

export class AnalyseCtrl {
  readonly root: TreeNode;

  // Current tree cursor — updated together as a unit (mirrors Lichess setPath)
  path: TreePath;
  node: TreeNode;
  nodeList: TreeNode[];
  mainline: TreeNode[];

  /**
   * Active retrospection session, or undefined when not in retro mode.
   * Set by the retro entry point; cleared on game load (ctrl is replaced).
   * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts retro field.
   */
  retro?: RetroCtrl;

  constructor(root: TreeNode) {
    this.root = root;
    this.path = '';
    this.nodeList = [root];
    this.node = root;
    this.mainline = mainlineNodeList(root);
  }

  /**
   * Jump to the node at path.
   * If the path is invalid, the current position is unchanged.
   * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts setPath
   */
  setPath(path: TreePath): void {
    const target = nodeAtPath(this.root, path);
    if (!target) return;
    this.path = path;
    this.nodeList = nodeListAt(this.root, path);
    this.node = target;
    this.mainline = mainlineNodeList(this.root);
  }
}
