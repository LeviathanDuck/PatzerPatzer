// Annotation controller — state for the annotation workspace (comments, active glyph).
// Phase 3 Task 3.2 (CCP-534).
// Mirrors lichess-org/lila: ui/study/src/studyComments.ts state model.

import type { Glyph } from '../tree/types';

// --- Module-level state ---

let _editingComment = false;
let _commentDraft   = '';
let _activeGlyph:   Glyph | null = null;

// --- Comment editing ---

export function isEditingComment(): boolean { return _editingComment; }
export function commentDraft():     string  { return _commentDraft; }
export function activeGlyph():      Glyph | null { return _activeGlyph; }

export function startCommentEdit(currentText: string): void {
  _editingComment = true;
  _commentDraft   = currentText;
}

export function setCommentDraft(text: string): void {
  _commentDraft = text;
}

export function cancelCommentEdit(): void {
  _editingComment = false;
  _commentDraft   = '';
}

// Called when edit should be committed — returns the text to save.
export function commitCommentEdit(): string {
  const text      = _commentDraft.trim();
  _editingComment = false;
  _commentDraft   = '';
  return text;
}

// --- Glyph selection ---

export function setActiveGlyph(glyph: Glyph | null): void {
  _activeGlyph = glyph;
}
