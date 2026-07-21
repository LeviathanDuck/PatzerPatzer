





























































import { h, type VNode } from 'snabbdom';
import {
  renderFolderContextMenu,
  renderGameContextMenu,
  renderTagContextMenu,
} from './navigatorContextMenu';
import { renderMoveAliasDialog } from './moveAliasDialog';
import { renderBulkTagDialog } from './bulkTagDialog';
import { renderBulkAddToOrpDialog } from './bulkAddToOrp';
import { controlExplainerOverlayHooks } from '../ui/controlExplainer';












const OVERLAY_SUPPRESSION_HOOKS = controlExplainerOverlayHooks('study-navigator-overlay');


















export function renderStudyNavigatorOverlayHost(redraw: () => void): VNode | null {
  const layers: Array<VNode | null> = [
    renderGameContextMenu(redraw),
    renderFolderContextMenu(redraw),
    renderTagContextMenu(redraw),
    renderMoveAliasDialog(redraw),
    renderBulkTagDialog(redraw),
    renderBulkAddToOrpDialog(redraw),
  ];
  if (layers.every(layer => layer === null)) return null;
  return h('div.nav-overlay-host', { hook: { ...OVERLAY_SUPPRESSION_HOOKS } }, layers);
}
