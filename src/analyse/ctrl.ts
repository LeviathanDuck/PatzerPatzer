// Analysis controller shell
// Adapted from lichess-org/lila: ui/analyse/src/ctrl.ts

import type { TreeNode, TreePath } from '../tree/types';
import type { RetroChoiceState } from './retroChoice';
import type { RetroCtrl } from './retroCtrl';
import { WorkspaceSession } from './workspaceSession';

export class AnalyseCtrl {




  private readonly session: WorkspaceSession;

  /**
   * Active retrospection session, or undefined when not in retro mode.
   * Set by the retro entry point; cleared on game load (ctrl is replaced).
   * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts retro field.
   */
  retro?: RetroCtrl;

  /**
   * Pre-session Learn From Your Mistakes choice page state.
   * Exists after the entry is clicked and before Begin creates RetroCtrl.
   * This is not a board mode yet; board-mode behavior starts only when `retro`
   * is set.
   */
  retroChoice?: RetroChoiceState;

  /**
   * Choice filters used to start the active LFYM session.
   * Reapplied if candidate-selection settings rebuild the session mid-flow.
   */
  retroActiveSelection?: RetroChoiceState['selection'];

  constructor(root: TreeNode) {
    this.session = new WorkspaceSession(root, 'analysis');
  }

  get root(): TreeNode { return this.session.root; }
  get path(): TreePath { return this.session.path; }
  get node(): TreeNode { return this.session.node; }
  get nodeList(): TreeNode[] { return this.session.nodeList; }
  get mainline(): TreeNode[] { return this.session.mainline; }

  /**
   * Jump to the node at path.
   * If the path is invalid, the current position is unchanged.
   * Mirrors lichess-org/lila: ui/analyse/src/ctrl.ts setPath (delegates to the WorkspaceSession's
   * setPath transition — see src/analyse/workspaceSession.ts).
   */
  setPath(path: TreePath): void {
    this.session.setPath(path);
  }
}
