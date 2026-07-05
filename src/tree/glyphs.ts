// Move annotation glyph catalog — adapted from lichess-org/lila: public/glyphs.json and
// ui/analyse/src/study/studyGlyph.ts
//
// Glyph ids are standard PGN NAG numbers ($1, $2, ...). Glyphs are grouped into three
// categories; at most one glyph per category can be active on a node at a time
// (mirrors scalachess Glyphs.toggle semantics used by the study glyph form).

import type { Glyph, GlyphId } from './types';

export type GlyphCategory = 'move' | 'position' | 'observation';

export const MOVE_GLYPHS: readonly Glyph[] = [
  { id: 1, symbol: '!', name: 'Good move' },
  { id: 2, symbol: '?', name: 'Mistake' },
  { id: 3, symbol: '!!', name: 'Brilliant move' },
  { id: 4, symbol: '??', name: 'Blunder' },
  { id: 5, symbol: '!?', name: 'Interesting move' },
  { id: 6, symbol: '?!', name: 'Dubious move' },
  { id: 7, symbol: '□', name: 'Only move' },
  { id: 22, symbol: '⨀', name: 'Zugzwang' },
];

export const POSITION_GLYPHS: readonly Glyph[] = [
  { id: 10, symbol: '=', name: 'Equal position' },
  { id: 13, symbol: '∞', name: 'Unclear position' },
  { id: 14, symbol: '⩲', name: 'White is slightly better' },
  { id: 15, symbol: '⩱', name: 'Black is slightly better' },
  { id: 16, symbol: '±', name: 'White is better' },
  { id: 17, symbol: '∓', name: 'Black is better' },
  { id: 18, symbol: '+−', name: 'White is winning' },
  { id: 19, symbol: '−+', name: 'Black is winning' },
];

export const OBSERVATION_GLYPHS: readonly Glyph[] = [
  { id: 146, symbol: 'N', name: 'Novelty' },
  { id: 32, symbol: '↑↑', name: 'Development' },
  { id: 36, symbol: '↑', name: 'Initiative' },
  { id: 40, symbol: '→', name: 'Attack' },
  { id: 132, symbol: '⇆', name: 'Counterplay' },
  { id: 138, symbol: '⊕', name: 'Time trouble' },
  { id: 44, symbol: '=∞', name: 'With compensation' },
  { id: 140, symbol: '∆', name: 'With the idea' },
];

export const GLYPH_CATEGORIES: readonly { category: GlyphCategory; label: string; glyphs: readonly Glyph[] }[] = [
  { category: 'move', label: 'Move', glyphs: MOVE_GLYPHS },
  { category: 'position', label: 'Position', glyphs: POSITION_GLYPHS },
  { category: 'observation', label: 'Observation', glyphs: OBSERVATION_GLYPHS },
];

const categoryById = new Map<GlyphId, GlyphCategory>();
const glyphById = new Map<GlyphId, Glyph>();
for (const group of GLYPH_CATEGORIES) {
  for (const glyph of group.glyphs) {
    categoryById.set(glyph.id, group.category);
    glyphById.set(glyph.id, glyph);
  }
}

/** Category a glyph id belongs to, or undefined for ids outside the catalog. */
export function glyphCategory(id: GlyphId): GlyphCategory | undefined {
  return categoryById.get(id);
}

/** Catalog glyph for a NAG id, or undefined for ids outside the catalog. */
export function glyphFromId(id: GlyphId): Glyph | undefined {
  return glyphById.get(id);
}

/**
 * Toggle a glyph on a node's glyph list.
 * - toggling an id that is already present removes it
 * - toggling a new id replaces any existing glyph from the same category
 * - glyphs from other categories are preserved
 * - unknown ids are ignored
 */
export function toggleGlyph(current: readonly Glyph[] | undefined, id: GlyphId): Glyph[] {
  const glyph = glyphFromId(id);
  if (!glyph) return current ? [...current] : [];
  const category = glyphCategory(id);
  const existing = current ?? [];
  if (existing.some(g => g.id === id)) return existing.filter(g => g.id !== id);
  return [...existing.filter(g => glyphCategory(g.id) !== category), glyph];
}
