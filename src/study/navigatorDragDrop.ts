








































































import * as studyCtrl from './studyCtrl';
import { deriveHomeFolderId } from './studyDb';

// ---------------------------------------------------------------------------------------------
// Drag state
// ---------------------------------------------------------------------------------------------

export type DragSourceKind = 'game' | 'folder';

interface DragState {
  kind: DragSourceKind;
  ids: readonly string[]; // game: 1+ StudyItem ids (whole D09 selection, or just the dragged row); folder: exactly 1 StudyFolder id






  sourceFolderId: string | null;
}

let _drag: DragState | null = null;

export function isDragging(): boolean {
  return _drag !== null;
}

export function draggingKind(): DragSourceKind | null {
  return _drag?.kind ?? null;
}

export function draggingIds(): readonly string[] {
  return _drag?.ids ?? [];
}

function startDrag(
  kind: DragSourceKind,
  ids: readonly string[],
  label: string,
  event: DragEvent,
  sourceFolderId: string | null = null,
): void {
  _drag = { kind, ids, sourceFolderId };
  _hoverKey = null;
  _springLoadFireCount = 0;
  clearSpringLoadTimer();
  if (event.dataTransfer) {
    event.dataTransfer.setData('text/plain', ids.join(','));
    event.dataTransfer.effectAllowed = 'move';
  }
  hideNativeDragImage(event);
  showDragCue(event, kind, label, ids.length);
  document.addEventListener('dragover', updateDragCuePosition, true);
}













export function beginGameDrag(
  rowId: string,
  title: string,
  event: DragEvent,
  sourceFolderId: string | null = null,
): void {
  const selected = studyCtrl.selectedIds();
  const ids = selected.size > 0 && selected.has(rowId) ? Array.from(selected) : [rowId];
  const label = ids.length > 1 ? `${ids.length} games` : title || 'Untitled';
  startDrag('game', ids, label, event, sourceFolderId);
}

/**
 * Begin a drag from a nav-pane folder row. Folders are not part of the D09 selection model and
 * are always dragged singly (OD-7 REVISED: "Folders are single-location" -- no multi-folder drag).
 * Folder drags have no browsed-folder SOURCE concept (that is a game-row/alias thing), so
 * `sourceFolderId` is always null here.
 */
export function beginFolderDrag(folderId: string, name: string, event: DragEvent): void {
  startDrag('folder', [folderId], name, event, null);
}

/** Suppress-click-after-drop window (NN's own `suppressClickUntilRef` precedent): a completed
 * drop over a folder/section row must not ALSO register as a click that toggles its
 * collapse/expand state. Row click handlers check this before acting. */
const SUPPRESS_CLICK_MS = 150;
let _suppressClickUntil = 0;

export function shouldSuppressClick(): boolean {
  return Date.now() < _suppressClickUntil;
}

export function endDrag(): void {
  _drag = null;
  _hoverKey = null;
  clearSpringLoadTimer();
  _springLoadFireCount = 0;
  hideDragCue();
  document.removeEventListener('dragover', updateDragCuePosition, true);
}

// ---------------------------------------------------------------------------------------------
// Drag cue -- a small element that follows the cursor showing what is being moved, adapted from
// notebook-navigator: src/utils/dragGhost.ts (custom drag preview positioned via CSS custom
// properties updated on `dragover`, native browser drag image hidden via an empty drag-image
// element). Unlike NN's own icon/badge ghost, this cue is plain text ("Move: <label>") -- this
// slice is MOVE-only, so there is no Add/Move cue split to render.
// ---------------------------------------------------------------------------------------------

let _cueEl: HTMLDivElement | null = null;

function showDragCue(event: DragEvent, kind: DragSourceKind, label: string, count: number): void {
  hideDragCue();
  const el = document.createElement('div');
  el.className = 'nav-drag-cue';
  el.setAttribute('data-drag-cue-kind', kind);
  const text = count > 1 ? `Move ${count} games` : `Move: ${label}`;
  el.textContent = text;
  document.body.appendChild(el);
  _cueEl = el;
  positionDragCue(event.clientX, event.clientY);
}

function positionDragCue(x: number, y: number): void {
  if (!_cueEl) return;
  _cueEl.style.setProperty('--nav-drag-cue-x', `${x + 14}px`);
  _cueEl.style.setProperty('--nav-drag-cue-y', `${y + 14}px`);
}

function updateDragCuePosition(e: DragEvent): void {
  positionDragCue(e.clientX, e.clientY);
}

function hideDragCue(): void {
  _cueEl?.remove();
  _cueEl = null;
}

/** Adapted from notebook-navigator: src/utils/dragGhost.ts (`hideNativePreview`) -- an empty,
 * off-screen element as the native drag image so only this module's own cue (above) is visible. */
function hideNativeDragImage(event: DragEvent): void {
  const empty = document.createElement('div');
  empty.className = 'nav-drag-empty-placeholder';
  document.body.appendChild(empty);
  try {
    event.dataTransfer?.setDragImage(empty, 0, 0);
  } catch {
    // Best-effort only -- some browsers/automation environments may reject a synthetic drag image.
  }
  window.setTimeout(() => empty.remove(), 0);
}

// ---------------------------------------------------------------------------------------------
// Drop targets + spring-load (NN's two-delay model, hard-coded to its own 500ms default -- see
// file header on why the settings sliders themselves are not ported here)
// ---------------------------------------------------------------------------------------------

const SPRING_LOAD_INITIAL_MS = 500;
const SPRING_LOAD_SUBSEQUENT_MS = 500;

let _hoverKey: string | null = null;
let _springLoadTimer: ReturnType<typeof setTimeout> | null = null;
let _springLoadFireCount = 0;

function clearSpringLoadTimer(): void {
  if (_springLoadTimer !== null) {
    clearTimeout(_springLoadTimer);
    _springLoadTimer = null;
  }
}

export function isDropTargetHovered(key: string): boolean {
  return _hoverKey === key;
}

export interface DropTargetSpringLoad {
  isExpanded: () => boolean;
  expand: () => void;
}

export interface DropTargetConfig {
  /** Unique key for this drop target (e.g. `folder:<sectionId>:<folderId>` / `section:<id>`) --
   * namespaced the same way navigationPaneView.ts's own `folderCollapseKey` already namespaces
   * per-section folder collapse state (the same folder id can render under more than one
   * section's subtree). Used only for hover/spring-load bookkeeping, never for the mutation
   * itself. */
  key: string;
  /** Whether a drop of the CURRENTLY dragging item(s) is legal here (e.g. a folder cannot be
   * dropped onto itself or one of its own descendants). Checked on both dragover (drives the
   * dropEffect + highlight) and drop (actually gates the commit). */
  canAccept: () => boolean;
  /** Commits the drop. Only invoked when canAccept() is still true at drop time. */
  onDrop: () => void;
  /** Spring-load target (folders with children, or sections) -- omitted for leaf folders, which
   * have nothing to expand (mirrors NN's own `resolveNode().hasChildren` gate). */
  springLoad?: DropTargetSpringLoad;
}

function scheduleSpringLoad(config: DropTargetConfig, redraw: () => void): void {
  clearSpringLoadTimer();
  if (!config.springLoad || config.springLoad.isExpanded()) return;
  const delay = _springLoadFireCount === 0 ? SPRING_LOAD_INITIAL_MS : SPRING_LOAD_SUBSEQUENT_MS;
  _springLoadTimer = setTimeout(() => {
    _springLoadTimer = null;
    if (config.springLoad && !config.springLoad.isExpanded()) {
      config.springLoad.expand();
      _springLoadFireCount += 1;
      redraw();
    }
  }, delay);
}

/** Build the `dragover`/`dragleave`/`drop` handlers for one drop-target row. Spread the result
 * into that row's Snabbdom `on: {}`. */
export function dropTargetHandlers(config: DropTargetConfig, redraw: () => void): {
  dragover: (e: DragEvent) => void;
  dragleave: (e: DragEvent) => void;
  drop: (e: DragEvent) => void;
} {
  return {
    dragover: (e: DragEvent) => {
      if (!_drag || !config.canAccept()) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (_hoverKey !== config.key) {
        _hoverKey = config.key;
        scheduleSpringLoad(config, redraw);
        redraw();
      }
    },
    dragleave: (e: DragEvent) => {
      if (_hoverKey !== config.key) return;
      const related = e.relatedTarget;
      const currentTarget = e.currentTarget;
      // Only clear when actually leaving this row, not just moving to a child element within it.
      if (related instanceof Node && currentTarget instanceof Node && currentTarget.contains(related)) return;
      _hoverKey = null;
      clearSpringLoadTimer();
      redraw();
    },
    drop: (e: DragEvent) => {
      e.preventDefault();
      const legal = _drag !== null && config.canAccept();
      _hoverKey = null;
      clearSpringLoadTimer();
      // onDrop must run BEFORE endDrag(): callers read draggingKind()/draggingIds() from inside
      // their onDrop callback to decide what to commit, and endDrag() clears that state.
      if (legal) config.onDrop();
      endDrag();
      _suppressClickUntil = Date.now() + SUPPRESS_CLICK_MS;
      redraw();
    },
  };
}



































export async function moveGamesToFolder(ids: readonly string[], folderId: string): Promise<void> {
  // Captured synchronously, before any `await` below and before `endDrag()` (called by the
  // `drop:` handler right after this async function is kicked off) can clear `_drag` -- see the
  // dropTargetHandlers' own drop-ordering comment.
  const browsedSourceFolderId = _drag?.kind === 'game' ? _drag.sourceFolderId : null;
  for (const id of ids) {
    let sourceFolderId: string | null;
    if (browsedSourceFolderId !== null) {
      sourceFolderId = browsedSourceFolderId;
    } else {
      const study = studyCtrl.allStudies().find(s => s.id === id);
      sourceFolderId = study ? deriveHomeFolderId(study) : null;
    }
    await studyCtrl.moveGameToFolder(id, folderId, sourceFolderId);
  }
}

/** Re-home every dragged game id to "no folder, directly under its own classified section" --
 * the section-header drop target. See the file header's disclosed-simplification note: sections
 * are derived from source/tags/destination, not stored membership, so there is no folder id to
 * move INTO; clearing `folders` is the closest honest analog to NN's drop-on-vault-root
 * un-parenting. The game stays visible -- it re-renders as unfiled under whichever section it is
 * actually classified into (classifyStudySection), which is not necessarily the section header it
 * was dropped on if that differs from its real classification. */
export async function unfileGames(ids: readonly string[]): Promise<void> {
  for (const id of ids) {
    await studyCtrl.updateStudy({ id, folders: [] });
  }
}

/** Reparent a folder (drag onto another folder row). Callers must gate this with
 * `wouldCreateFolderCycle` (below) via `canAccept` before wiring it as a DropTargetConfig.onDrop. */
export async function reparentFolderTo(folderId: string, newParentId: string): Promise<void> {
  await studyCtrl.reparentFolder(folderId, newParentId);
}

/** Un-parent a folder to root level (drag onto a section header). */
export async function unparentFolder(folderId: string): Promise<void> {
  await studyCtrl.reparentFolder(folderId, null);
}

/** True if reparenting `folderId` under `targetParentId` would create a cycle -- dropping a
 * folder onto itself, or onto one of its own descendants. Walks the current
 * `studyCtrl.folders()` list, which is always small (per-device folder count, not game count). */
export function wouldCreateFolderCycle(folderId: string, targetParentId: string): boolean {
  if (folderId === targetParentId) return true;
  const byId = new Map(studyCtrl.folders().map(f => [f.id, f] as const));
  let cursor: string | undefined = targetParentId;
  const guard = new Set<string>();
  while (cursor) {
    if (cursor === folderId) return true;
    if (guard.has(cursor)) return true; // defensive: a pre-existing corrupt cycle in stored data
    guard.add(cursor);
    cursor = byId.get(cursor)?.parentId;
  }
  return false;
}
