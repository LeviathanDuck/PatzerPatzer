



import type { Glyph } from '../tree/types';

// --- Module-level state ---

let _editingComment = false;
let _commentDraft   = '';
let _activeGlyph:   Glyph | null = null;
let _commentEditTarget: CommentEditTarget | null = null;

export interface CommentEditTarget {
  studyId: string;
  path: string;
}

// --- Comment editing ---

export function isEditingComment(): boolean { return _editingComment; }
export function commentDraft():     string  { return _commentDraft; }
export function activeGlyph():      Glyph | null { return _activeGlyph; }
export function commentEditTarget(): CommentEditTarget | null { return _commentEditTarget; }

export function startCommentEdit(currentText: string, target: CommentEditTarget): void {
  _editingComment = true;
  _commentDraft   = currentText;
  _commentEditTarget = { ...target };
}

export function setCommentDraft(text: string): void {
  _commentDraft = text;
}

export function cancelCommentEdit(): void {
  _editingComment = false;
  _commentDraft   = '';
  _commentEditTarget = null;
}

// Called when edit should be committed — returns the text with the frozen target.
export function commitCommentEdit(): { text: string; target: CommentEditTarget } | null {
  const text      = _commentDraft.trim();
  const target    = _commentEditTarget;
  _editingComment = false;
  _commentDraft   = '';
  _commentEditTarget = null;
  return target ? { text, target } : null;
}

// --- Glyph selection ---

export function setActiveGlyph(glyph: Glyph | null): void {
  _activeGlyph = glyph;
}
