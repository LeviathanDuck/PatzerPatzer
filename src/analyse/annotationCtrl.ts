// Analysis annotation controller — open-panel state and node mutation entry points for
// comment/glyph authoring on the analysis board.
// Adapted from lichess-org/lila: ui/analyse/src/study/commentForm.ts and studyGlyph.ts,
// writing directly to the local tree instead of a study server round-trip.

import type { GlyphId, TreeNode, TreePath } from '../tree/types';
import { setCommentAt, deleteCommentAt, setGlyphsAt, nodeAtPath } from '../tree/ops';
import { toggleGlyph } from '../tree/glyphs';

export type AnnotationPanel = 'comments' | 'glyphs';

// Comment identity for locally authored comments. The board is single-author, so one
// stable id per node keeps setCommentAt in upsert mode (matches the Study convention).
export const LOCAL_COMMENT_ID = 'user';
export const LOCAL_COMMENT_BY = 'user';

let _openPanel: AnnotationPanel | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | undefined;

export function annotationPanel(): AnnotationPanel | null { return _openPanel; }

export function openAnnotationPanel(panel: AnnotationPanel): void {
  _openPanel = panel;
}

export function closeAnnotationPanel(): void {
  flushCommentSave();
  _openPanel = null;
}

/** The current node's locally authored comment text, or ''. */
export function localCommentText(root: TreeNode, path: TreePath): string {
  const node = nodeAtPath(root, path);
  return node?.comments?.find(c => c.id === LOCAL_COMMENT_ID)?.text ?? '';
}

let _pendingSave: (() => void) | undefined;

/**
 * Debounced comment auto-save — mirrors lichess commentForm's deferred submit-on-input.
 * Empty text deletes the comment (setCommentAt semantics).
 */
export function scheduleCommentSave(
  root: TreeNode,
  path: TreePath,
  text: string,
  onSaved: () => void,
): void {
  if (_saveTimer !== undefined) clearTimeout(_saveTimer);
  _pendingSave = () => {
    setCommentAt(root, { id: LOCAL_COMMENT_ID, by: LOCAL_COMMENT_BY, text: text.trim() }, path);
    _pendingSave = undefined;
    onSaved();
  };
  _saveTimer = setTimeout(() => {
    _saveTimer = undefined;
    _pendingSave?.();
  }, 150);
}

/** Apply any pending debounced comment save immediately (used on blur/close). */
export function flushCommentSave(): void {
  if (_saveTimer !== undefined) {
    clearTimeout(_saveTimer);
    _saveTimer = undefined;
  }
  _pendingSave?.();
}

/**
 * Discard button entry point: cancel any pending debounced save (so a stale keystroke
 * doesn't resurrect the comment on close) and delete the node's local comment outright.
 */
export function discardLocalComment(root: TreeNode, path: TreePath): void {
  if (_saveTimer !== undefined) {
    clearTimeout(_saveTimer);
    _saveTimer = undefined;
  }
  _pendingSave = undefined;
  deleteCommentAt(root, LOCAL_COMMENT_ID, path);
}

/** Toggle a catalog glyph on the node at path (one glyph per category). */
export function toggleGlyphAt(root: TreeNode, path: TreePath, id: GlyphId): void {
  const node = nodeAtPath(root, path);
  if (!node) return;
  setGlyphsAt(root, toggleGlyph(node.glyphs, id), path);
  // Keep raw imported NAGs in sync for the toggled id: once authored, its state is fully
  // expressed by node.glyphs, so a stale nag must not resurrect it on PGN export.
  if (node.nags) {
    const remaining = node.nags.filter(n => n !== id);
    if (remaining.length) node.nags = remaining;
    else delete node.nags;
  }
}
