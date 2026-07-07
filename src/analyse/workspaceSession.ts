

















import { mainlineNodeList, nodeAtPath, nodeListAt } from '../tree/ops';
import type { TreeNode, TreePath } from '../tree/types';

export class WorkspaceSession {
  readonly root: TreeNode;
  readonly instanceId: string;

  // Current tree cursor — updated together as a unit (mirrors Lichess setPath)
  path: TreePath;
  node: TreeNode;
  nodeList: TreeNode[];
  mainline: TreeNode[];

  constructor(root: TreeNode, instanceId: string) {
    this.root = root;
    this.instanceId = instanceId;
    this.path = '';
    this.nodeList = [root];
    this.node = root;
    this.mainline = mainlineNodeList(root);
  }

  /**
   * Jump to the node at path.
   * If the path is invalid, the current position is unchanged.
   * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts setPath (moved verbatim from the former
   * AnalyseCtrl.setPath body — see src/analyse/ctrl.ts).
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
