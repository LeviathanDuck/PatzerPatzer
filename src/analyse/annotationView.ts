// Analysis annotation panels — comment form and glyph picker rendered in the tools column.
// Adapted from lichess-org/lila: ui/analyse/src/study/commentForm.ts (textarea, auto-save on
// input, current-comment prefill) and studyGlyph.ts (three category groups of toggle buttons).

import { h, type VNode } from 'snabbdom';
import type { TreeNode, TreePath } from '../tree/types';
import { nodeAtPath } from '../tree/ops';
import { GLYPH_CATEGORIES } from '../tree/glyphs';
import { GLYPH_COLORS } from './moveList';
import { controlExplainerAttrs, iconControlExplainerAttrs } from '../ui/controlExplainer';
import {
  LOCAL_COMMENT_ID,
  annotationPanel,
  closeAnnotationPanel,
  discardLocalComment,
  flushCommentSave,
  localCommentText,
  scheduleCommentSave,
  toggleGlyphAt,
} from './annotationCtrl';

export interface AnnotationViewDeps {
  root: TreeNode;
  path: TreePath;
  redraw: () => void;
}

/** Render the open annotation panel for the current node, or null when closed. */
export function renderAnnotationPanel(deps: AnnotationViewDeps): VNode | null {
  const panel = annotationPanel();
  if (!panel) return null;
  const node = nodeAtPath(deps.root, deps.path);
  if (!node) return null;
  return panel === 'comments' ? renderCommentForm(deps, node) : renderGlyphPicker(deps, node);
}

function panelHeader(title: string, redraw: () => void): VNode {
  return h('div.annotation-form__header', [
    h('h3.annotation-form__title', title),
    h('button.annotation-form__close', {
      attrs: { type: 'button', ...iconControlExplainerAttrs({ label: `Close ${title}` }) },
      on: { click: () => { closeAnnotationPanel(); redraw(); } },
    }, '×'),
  ]);
}

// --- Comment form ---
// Mirrors lichess commentForm: textarea prefilled with the local author's comment,
// auto-saves as you type, empty text deletes; other comments shown read-only above.

function renderCommentForm(deps: AnnotationViewDeps, node: TreeNode): VNode {
  const { root, path, redraw } = deps;
  const others = (node.comments ?? []).filter(c => c.id !== LOCAL_COMMENT_ID && c.text.trim());
  return h('div.annotation-form.annotation-form--comment', [
    panelHeader(`Comment on ${node.san ?? 'this position'}`, redraw),
    ...others.map(c =>
      h('div.annotation-form__other-comment', [
        h('span.annotation-form__other-by', typeof c.by === 'string' ? c.by : c.by.name),
        h('span.annotation-form__other-text', c.text),
      ]),
    ),
    h('textarea.annotation-form__textarea', {
      attrs: { placeholder: 'Comment on this move…', rows: 3, ...controlExplainerAttrs({
        label: 'Move comment',
        description: 'Write a comment for this position; changes save automatically.',
      }) },
      props: { value: localCommentText(root, path) },
      hook: { insert: vnode => (vnode.elm as HTMLTextAreaElement).focus() },
      on: {
        input: (e: Event) => {
          const text = (e.target as HTMLTextAreaElement).value;
          scheduleCommentSave(root, path, text, redraw);
        },
        blur: () => flushCommentSave(),
        keydown: (e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            closeAnnotationPanel();
            redraw();
          }
        },
      },
    }),
    // Save dismisses the panel — the textarea already auto-saves on input (lila
    // commentForm parity); Discard deletes the comment outright and dismisses.
    h('div.annotation-form__footer', [
      h('button.annotation-form__discard-btn', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Discard comment',
          description: 'Delete your comment for this position and close the editor.',
        }) },
        on: {
          click: () => {
            discardLocalComment(root, path);
            closeAnnotationPanel();
            redraw();
          },
        },
      }, [
        h('span.annotation-form__discard-icon', { attrs: { 'aria-hidden': 'true' } }, '🗑'),
        'Discard',
      ]),
      h('button.annotation-form__save-btn', {
        attrs: { type: 'button', ...iconControlExplainerAttrs({
          label: 'Save comment',
          description: 'Finish editing; the comment has already been saved automatically.',
        }) },
        on: {
          click: () => {
            closeAnnotationPanel();
            redraw();
          },
        },
      }, [
        h('span.annotation-form__save-icon', { attrs: { 'aria-hidden': 'true' } }, '✓'),
      ]),
    ]),
  ]);
}

// --- Glyph picker ---
// Mirrors lichess studyGlyph view: Move / Position / Observation groups of toggle buttons,
// active state from the current node's glyphs, one glyph per category.

function renderGlyphPicker(deps: AnnotationViewDeps, node: TreeNode): VNode {
  const { root, path, redraw } = deps;
  const active = new Set((node.glyphs ?? []).map(g => g.id));
  return h('div.annotation-form.annotation-form--glyphs', {
    hook: { insert: vnode => (vnode.elm as HTMLElement).focus() },
    attrs: { tabindex: -1 },
    on: {
      keydown: (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          closeAnnotationPanel();
          redraw();
        }
      },
    },
  }, [
    panelHeader(`Annotate ${node.san ?? 'this position'} with glyphs`, redraw),
    ...GLYPH_CATEGORIES.map(group =>
      h(`div.annotation-form__glyph-group.annotation-form__glyph-group--${group.category}`, [
        h('h4.annotation-form__glyph-group-label', group.label),
        h('div.annotation-form__glyph-buttons',
          group.glyphs.map(glyph => {




            const color = GLYPH_COLORS[glyph.symbol];
            return h('button.annotation-form__glyph-btn', {
              class: { active: active.has(glyph.id) },
              attrs: { type: 'button', 'data-symbol': glyph.symbol, ...controlExplainerAttrs({
                label: glyph.name,
                description: `${active.has(glyph.id) ? 'Remove' : 'Add'} the ${glyph.symbol} annotation on this move.`,
              }) },
              on: {
                click: () => {
                  toggleGlyphAt(root, path, glyph.id);
                  redraw();
                },
              },
            }, [
              h('span.annotation-form__glyph-symbol', {
                attrs: color ? { style: `color:${color}` } : {},
              }, glyph.symbol),
              h('span.annotation-form__glyph-name', glyph.name),
            ]);
          }),
        ),
      ]),
    ),
  ]);
}
