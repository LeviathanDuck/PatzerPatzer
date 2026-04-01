// Annotation view — comment panel and glyph toolbar for the study detail workspace.
// Phase 3 Task 3.2 (CCP-534): comment panel.
// Phase 3 Task 3.3 (CCP-535): glyph toolbar added below.
// Adapted from lichess-org/lila: ui/study/src/studyComments.ts + actionMenu.ts.

import { h, type VNode } from 'snabbdom';
import {
  isEditingComment, commentDraft, startCommentEdit,
  setCommentDraft, commitCommentEdit, cancelCommentEdit,
  setActiveGlyph, activeGlyph,
} from './annotationCtrl';
import { detailNode, updateCurrentNodeComments, updateCurrentNodeGlyphs } from './studyDetailCtrl';
import type { Glyph, TreeComment } from '../tree/types';

// --- Comment panel (CCP-534) ---

/**
 * Render the comment panel below the move list.
 * Shows current node's comment and provides an editable textarea.
 * Mirrors lichess-org/lila: ui/study/src/studyComments.ts rendering.
 */
export function renderCommentPanel(redraw: () => void): VNode {
  const node = detailNode();
  const currentComment = node?.comments?.find(c => c.id === 'user')?.text ?? '';

  if (isEditingComment()) {
    return h('div.annotation-panel', [
      h('h3.annotation-panel__title', 'Comment'),
      h('textarea.annotation-panel__textarea', {
        attrs: { placeholder: 'Add a comment…', rows: 3 },
        props: { value: commentDraft() },
        hook:  { insert: (vn) => (vn.elm as HTMLTextAreaElement).focus() },
        on: {
          input:   (e: Event) => setCommentDraft((e.target as HTMLTextAreaElement).value),
          keydown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveComment(redraw); }
            if (e.key === 'Escape') { cancelCommentEdit(); redraw(); }
          },
          blur: () => saveComment(redraw),
        },
      }),
      h('div.annotation-panel__actions', [
        h('button.study-btn', { on: { click: () => saveComment(redraw) } }, 'Save'),
        h('button.study-btn', { on: { mousedown: (e: MouseEvent) => { e.preventDefault(); cancelCommentEdit(); redraw(); } } }, 'Cancel'),
      ]),
    ]);
  }

  return h('div.annotation-panel', [
    h('h3.annotation-panel__title', 'Comment'),
    currentComment
      ? h('div.annotation-panel__text', {
          attrs: { title: 'Click to edit' },
          on:    { click: () => { startCommentEdit(currentComment); redraw(); } },
        }, currentComment)
      : h('button.annotation-panel__add', {
          on: { click: () => { startCommentEdit(''); redraw(); } },
        }, '+ Add comment'),
  ]);
}

function saveComment(redraw: () => void): void {
  const node = detailNode();
  if (!node) { cancelCommentEdit(); redraw(); return; }
  const text = commitCommentEdit();
  const existing = node.comments ?? [];
  let updated: TreeComment[];
  if (text === '') {
    // Remove comment
    updated = existing.filter(c => c.id !== 'user');
  } else if (existing.some(c => c.id === 'user')) {
    updated = existing.map(c => c.id === 'user' ? { ...c, text } : c);
  } else {
    updated = [...existing, { id: 'user', by: 'user', text }];
  }
  updateCurrentNodeComments(updated, redraw);
}

// --- Glyph toolbar (CCP-535) ---

const GLYPHS: Glyph[] = [
  { id: 1,  name: 'Good move',          symbol: '!'  },
  { id: 2,  name: 'Mistake',            symbol: '?'  },
  { id: 3,  name: 'Brilliant move',     symbol: '!!' },
  { id: 4,  name: 'Blunder',            symbol: '??' },
  { id: 5,  name: 'Speculative move',   symbol: '!?' },
  { id: 6,  name: 'Dubious move',       symbol: '?!' },
  { id: 10, name: 'Equal position',     symbol: '='  },
  { id: 14, name: 'Slight advantage W', symbol: '+=' },
  { id: 16, name: 'Moderate adv W',     symbol: '+/−'},
  { id: 18, name: 'Decisive adv W',     symbol: '+-' },
];

export function renderGlyphToolbar(redraw: () => void): VNode {
  const node    = detailNode();
  const current = node?.glyphs ?? [];

  return h('div.glyph-toolbar', [
    h('span.glyph-toolbar__label', 'Annotate:'),
    ...GLYPHS.map(glyph => {
      const isActive = current.some(g => g.id === glyph.id);
      return h('button.glyph-btn', {
        class:  { active: isActive },
        attrs:  { title: glyph.name },
        on:     { click: () => toggleGlyph(glyph, redraw) },
      }, glyph.symbol);
    }),
  ]);
}

function toggleGlyph(glyph: Glyph, redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  const current = node.glyphs ?? [];
  const hasIt   = current.some(g => g.id === glyph.id);
  const updated = hasIt
    ? current.filter(g => g.id !== glyph.id)
    : [...current, glyph];
  setActiveGlyph(hasIt ? null : glyph);
  updateCurrentNodeGlyphs(updated, redraw);
}

export { activeGlyph, GLYPHS };
