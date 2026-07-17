




import { h, type VNode } from 'snabbdom';
import { controlExplainerAttrs, iconControlExplainerAttrs } from '../ui/controlExplainer';
import {
  isEditingComment, commentDraft, startCommentEdit,
  setCommentDraft, commitCommentEdit, cancelCommentEdit,
  setActiveGlyph, activeGlyph,
} from './annotationCtrl';
import {
  detailNode, detailPath, studyDetail, studyPersistenceError,
  updateCommentAtTarget, updateCurrentNodeGlyphs,
} from './studyDetailCtrl';
import type { Glyph } from '../tree/types';



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
        attrs: { placeholder: 'Add a comment…', rows: 3, 'aria-label': 'Move comment', ...controlExplainerAttrs({ label: 'Move comment', description: 'Adds study notes to the current move.' }) },
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
        h('button.study-btn', { attrs: controlExplainerAttrs({ label: 'Save comment' }), on: { click: () => saveComment(redraw) } }, 'Save'),
        h('button.study-btn', { attrs: controlExplainerAttrs({ label: 'Cancel comment editing' }), on: { mousedown: (e: MouseEvent) => { e.preventDefault(); cancelCommentEdit(); redraw(); } } }, 'Cancel'),
      ]),
      renderPersistenceStatus(),
    ]);
  }

  return h('div.annotation-panel', [
    h('h3.annotation-panel__title', 'Comment'),
    currentComment
      ? h('div.annotation-panel__text', {
          attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({ label: 'Edit move comment', description: 'Opens the current move comment for editing.' }) },
          on:    {
            click: () => { beginCommentEdit(currentComment); redraw(); },
            keydown: (e: KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              beginCommentEdit(currentComment);
              redraw();
            },
          },
        }, currentComment)
      : h('button.annotation-panel__add', {
          attrs: controlExplainerAttrs({ label: 'Add move comment' }),
          on: { click: () => { beginCommentEdit(''); redraw(); } },
        }, '+ Add comment'),
    renderPersistenceStatus(),
  ]);
}

function renderPersistenceStatus(): VNode | null {
  return studyPersistenceError()
    ? h('p.annotation-panel__save-error', { attrs: { role: 'status' } }, 'Couldn’t save this comment. Your edit is still here; try again before leaving the study.')
    : null;
}

function beginCommentEdit(currentText: string): void {
  const study = studyDetail();
  if (!study) return;
  startCommentEdit(currentText, { studyId: study.id, path: detailPath() });
}

function saveComment(redraw: () => void): void {
  // Clicking Save blurs the textarea before the button's click handler runs. The blur commits and
  // clears the draft, so the following click must be an idempotent no-op instead of treating the
  // cleared draft as an intentional deletion.
  if (!isEditingComment()) return;
  const committed = commitCommentEdit();
  if (!committed || !updateCommentAtTarget(committed.target, committed.text, redraw)) redraw();
}



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
        attrs:  { 'aria-pressed': String(isActive), ...iconControlExplainerAttrs({ label: glyph.name, description: 'Toggles this annotation on the current move.' }) },
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
