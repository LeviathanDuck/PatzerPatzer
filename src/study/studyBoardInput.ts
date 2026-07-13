














import type { WorkspaceBoardInputModule } from '../analyse/workspaceCore';
import type { TreePath } from '../tree/types';

/**
 * Build Study's pass-through board-input module. `navigate` is Study's existing-child follow
 * callback (studyDetailView.ts's `studyBoardNavigate(path, redraw)`); it becomes the shared-tree
 * move-dispatch navigation hook. The shape matches the design's "Study reframed as first module"
 * section verbatim.
 */
export function createStudyBoardInputModule(
  navigate: (path: TreePath) => void,
): WorkspaceBoardInputModule {
  return {
    id: 'study-detail-board-input',
    mode: 'always-new-variation',
    allowResize: true,
    configPolicy: { kind: 'analysis-default' },
    moveDispatch: {
      kind: 'shared-tree',
      navigate,
    },
    keyboardPolicy: { kind: 'analysis-default' },
    attach: () => {},
    detach: () => {},
  };
}
