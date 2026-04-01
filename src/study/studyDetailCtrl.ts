// Study Detail controller — module-level state for the annotation workspace.
// Owns the current tree, path, navigation, and dirty tracking.
// Does NOT depend on AnalyseCtrl or src/board/index.ts.
// Mirrors the state model in lichess-org/lila: ui/study/src/ctrl.ts (simplified).

import type { Api as CgApi } from '@lichess-org/chessground/api';
import { pgnToTree } from '../tree/pgn';
import { nodeAtPath, addNode, pathInit, pathLast } from '../tree/ops';
import { getStudy, saveStudy } from './studyDb';
import type { StudyItem } from './types';
import type { TreeNode } from '../tree/types';

// --- Module-level state ---

let _study:       StudyItem | null = null;
let _root:        TreeNode  | null = null;
let _path:        string          = '';
let _orientation: 'white' | 'black' = 'white';
let _dirty        = false;
let _loaded       = false;
let _cgRef:       CgApi | undefined;
let _autoSaveTimer: ReturnType<typeof setTimeout> | undefined;

// --- Accessors ---

export function studyDetail(): StudyItem | null { return _study; }
export function detailRoot():  TreeNode  | null { return _root; }
export function detailPath():  string          { return _path; }
export function detailNode():  TreeNode  | null {
  if (!_root) return null;
  return nodeAtPath(_root, _path) ?? _root;
}
export function detailOrientation(): 'white' | 'black' { return _orientation; }
export function detailLoaded(): boolean { return _loaded; }
export function setCgRef(cg: CgApi): void { _cgRef = cg; }
export function getCgRef(): CgApi | undefined { return _cgRef; }

// --- Load ---

export function loadStudyDetail(id: string, redraw: () => void): void {
  _loaded = false;
  _study  = null;
  _root   = null;
  _path   = '';
  _dirty  = false;
  clearTimeout(_autoSaveTimer);
  getStudy(id).then(item => {
    if (!item) { _loaded = true; redraw(); return; }
    _study = item;
    try {
      _root = pgnToTree(item.pgn);
    } catch {
      _root = pgnToTree(''); // empty tree on parse failure
    }
    _path = '';
    _loaded = true;
    redraw();
  });
}

// --- Navigation ---

export function navigateTo(path: string, redraw: () => void): void {
  if (!_root) return;
  const node = nodeAtPath(_root, path);
  if (node !== undefined || path === '') { _path = path; redraw(); }
}

export function navigateFirst(redraw: () => void): void {
  _path = '';
  redraw();
}

/** Walk the mainline to the end and navigate there. */
export function navigateLast(redraw: () => void): void {
  if (!_root) return;
  let node = _root;
  let path = '';
  while (node.children.length > 0) {
    const child = node.children[0]!;
    path += child.id;
    node  = child;
  }
  _path = path;
  redraw();
}

export function navigatePrev(redraw: () => void): void {
  if (_path === '') return;
  _path = pathInit(_path);
  redraw();
}

export function navigateNext(redraw: () => void): void {
  if (!_root) return;
  const node = nodeAtPath(_root, _path) ?? _root;
  if (node.children.length > 0) {
    _path = _path + node.children[0]!.id;
    redraw();
  }
}

// --- Move handling (study mode — always creates variations) ---

export function handleStudyMove(uci: string, san: string, fen: string, redraw: () => void): void {
  if (!_root) return;
  const parentNode = nodeAtPath(_root, _path) ?? _root;
  const ply  = parentNode.ply + 1;
  // ID generation mirrors lichess-org/lila: ui/lib/src/tree/tree.ts
  const id   = (san[0]?.toLowerCase() ?? 'a') + (ply % 10).toString();
  const newNode: TreeNode = {
    id,
    ply,
    uci,
    san,
    fen,
    glyphs:   [],
    children: [],
    comments: [],
  };

  // Check if node already exists (same id = same move), navigate to existing.
  const existing = parentNode.children.find(c => c.id === id);
  if (existing) {
    _path = _path + existing.id;
  } else {
    addNode(_root, _path, newNode);
    _path  = _path + id;
    _dirty = true;
    scheduleAutoSave();
  }
  redraw();
}

// --- Orientation ---

export function flipStudyBoard(redraw: () => void): void {
  _orientation = _orientation === 'white' ? 'black' : 'white';
  _cgRef?.set({ orientation: _orientation });
  redraw();
}

// --- Dirty / auto-save ---

function scheduleAutoSave(): void {
  clearTimeout(_autoSaveTimer);
  _autoSaveTimer = setTimeout(() => { void persistStudy(); }, 500);
}

export function markDirty(): void {
  _dirty = true;
  scheduleAutoSave();
}

async function persistStudy(): Promise<void> {
  if (!_study || !_root || !_dirty) return;
  const updated: StudyItem = { ..._study, pgn: buildStudyPgn(), updatedAt: Date.now() };
  _study = updated;
  _dirty = false;
  await saveStudy(updated);
}

// --- Annotation helpers (used by CCP-534, CCP-535, CCP-538) ---

export function updateCurrentNodeGlyphs(glyphs: import('../tree/types').Glyph[], redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  node.glyphs = glyphs;
  markDirty();
  redraw();
}

export function updateCurrentNodeComments(comments: import('../tree/types').TreeComment[], redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  node.comments = comments;
  markDirty();
  redraw();
}

export function updateCurrentNodeShapes(shapes: import('../tree/types').Shape[], redraw: () => void): void {
  const node = detailNode();
  if (!node) return;
  node.shapes = shapes;
  markDirty();
  redraw();
}

// --- Bookmark helpers (used by CCP-540) ---

export function toggleBookmark(path: string, redraw: () => void): void {
  if (!_study) return;
  const bookmarks = _study.bookmarks ?? [];
  const updated = bookmarks.includes(path)
    ? bookmarks.filter(b => b !== path)
    : [...bookmarks, path];
  _study = { ..._study, bookmarks: updated, updatedAt: Date.now() };
  markDirty();
  redraw();
}

export function isBookmarked(path: string): boolean {
  return (_study?.bookmarks ?? []).includes(path);
}

// --- Tree-to-PGN serializer (CCP-541) ---
// Converts the annotation tree to a PGN string preserving:
//   comments, NAGs ($N), shapes ([%cal]/[%csl]).
// Adapted from lichess-org/lila: ui/analyse/src/pgnExport.ts + study pgn export.

// Brush name → PGN color code (first letter, uppercase)
const BRUSH_CODE: Record<string, string> = {
  green: 'G', blue: 'B', red: 'R', yellow: 'Y',
};

function brushCode(brush?: string): string {
  return (brush ? (BRUSH_CODE[brush] ?? 'G') : 'G');
}

function serializeStudyNode(node: TreeNode, needsMoveNum: boolean): string {
  const parts: string[] = [];

  if (node.san) {
    const isWhite = node.ply % 2 === 1;
    const moveNum = Math.ceil(node.ply / 2);
    if (isWhite || needsMoveNum) {
      parts.push(isWhite ? `${moveNum}.` : `${moveNum}...`);
    }
    parts.push(node.san);

    // NAGs from glyphs ($1 = !, $2 = ?, $3 = !!, $4 = ??, $5 = !?, $6 = ?!)
    for (const g of (node.glyphs ?? [])) {
      parts.push(`$${g.id}`);
    }

    // Comment block: shapes + user comments
    const commentParts: string[] = [];
    const arrows   = (node.shapes ?? []).filter(s => s.dest);
    const squares  = (node.shapes ?? []).filter(s => !s.dest);
    if (arrows.length > 0) {
      const cal = arrows.map(s => `${brushCode(s.brush)}${s.orig}${s.dest ?? ''}`).join(',');
      commentParts.push(`[%cal ${cal}]`);
    }
    if (squares.length > 0) {
      const csl = squares.map(s => `${brushCode(s.brush)}${s.orig}`).join(',');
      commentParts.push(`[%csl ${csl}]`);
    }
    for (const c of (node.comments ?? [])) {
      if (c.text.trim()) commentParts.push(c.text.trim());
    }
    if (commentParts.length > 0) {
      parts.push(`{ ${commentParts.join(' ')} }`);
    }
  }

  if (node.children.length > 0) {
    const [main, ...variations] = node.children;
    const hasAnnotation = (node.san && ((node.glyphs?.length ?? 0) > 0 || (node.comments?.length ?? 0) > 0 || (node.shapes?.length ?? 0) > 0));
    const contNeedsNum = (variations.length > 0) || hasAnnotation || (node.san && node.ply % 2 === 0);

    for (const v of variations) {
      const varPgn = serializeStudyNode(v, true);
      if (varPgn.trim()) parts.push(`( ${varPgn} )`);
    }

    if (main) {
      parts.push(serializeStudyNode(main, !!contNeedsNum));
    }
  }

  return parts.join(' ');
}

export function buildStudyPgn(): string {
  if (!_root || !_study) return '';
  const headers: [string, string][] = [
    ['Event', _study.title],
    ['Site',  'PatzerPro'],
    ['Date',  new Date(_study.createdAt).toISOString().slice(0, 10).replace(/-/g, '.')],
    ['Result', '*'],
  ];
  const headerStr = headers.map(([k, v]) => `[${k} "${v}"]`).join('\n');
  const movesStr  = serializeStudyNode(_root, false).trim();
  return `${headerStr}\n\n${movesStr} *\n`;
}

// Expose pathLast for use in detail view
export { pathLast };
