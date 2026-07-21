
































































import { h, type VNode, type VNodeData } from 'snabbdom';
import {
  STUDY_SECTIONS,
  type StudyNavigationFolderGroup,
  type StudyNavigationSectionNode,
  type StudyNavigationTree,
  type StudySectionId,
} from './navigationIndexProvider';
import { navIcon } from './navIcons';
import {
  beginFolderDrag,
  draggingIds,
  draggingKind,
  dropTargetHandlers,
  endDrag,
  isDropTargetHovered,
  moveGamesToFolder,
  reparentFolderTo,
  shouldSuppressClick,
  unfileGames,
  unparentFolder,
  wouldCreateFolderCycle,
} from './navigatorDragDrop';
import { shortcuts, type ShortcutEntry } from './shortcuts';
import { isHidden, showHiddenItems } from './hiddenItems';
import {
  openFolderContextMenu,
  openTagContextMenu,
  renderFolderContextMenu,
  renderTagContextMenu,
} from './navigatorContextMenu';









import { allStudies, bumpSelectionSurface, studyLibraryRouteSnapshot } from './studyCtrl';
import type { StudyItem } from './types';
import { serializeStudyRouteState } from './routeState';
import { listSmartTags, saveSmartTag, deleteSmartTag, type UserSmartTag } from './smartTags';
import { writeHashRoute } from '../router';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';

// ---------------------------------------------------------------------------------------------
// System lenses (P2-LIB-2) — fixed structural label list, not computed lens content (T5-D13 owns
// that). Mirrors how navigationIndexProvider.ts declares STUDY_SECTIONS as a fixed constant.
// ---------------------------------------------------------------------------------------------

export type StudyLensId = 'recent' | 'unsorted' | 'favorites' | 'tags' | 'studied' | 'saved-puzzles';

export interface NavigationPaneLensDef {
  id: StudyLensId;
  label: string;
  /** Populated by a future lens-membership layer (T5-D13). Undefined renders no count badge. */
  count?: number;
}

// Plain glyph characters, taken directly from the approved lookbook's own §02 markup (no icon-font
// dependency added — see the file header's Out-of-scope note on why this slice stays structural).
const LENS_ICONS: Record<StudyLensId, string> = {
  recent: '◷',
  unsorted: '▢',
  favorites: '★',
  tags: '#',
  studied: '☑',
  'saved-puzzles': '?!',
};









export const SYSTEM_LENSES: readonly NavigationPaneLensDef[] = [
  { id: 'unsorted', label: 'Unsorted' },
];

















export const SYSTEM_SMART_TAGS: readonly NavigationPaneLensDef[] = [
  { id: 'favorites', label: 'Favorites' },
  { id: 'studied', label: 'Reviewed' },
  { id: 'saved-puzzles', label: 'Saved Puzzles' },
];










const _collapsedIds = new Set<string>();

function isCollapsed(id: string): boolean {
  return _collapsedIds.has(id);
}

function toggleCollapsed(id: string, redraw: () => void): void {




  if (shouldSuppressClick()) return;
  if (_collapsedIds.has(id)) _collapsedIds.delete(id);
  else _collapsedIds.add(id);
  redraw();
}

// Namespaced per section: the same underlying folder id can legitimately appear under more than
// one section's subtree (a folder can hold items classified into different sections — nothing in
// the P1 model restricts a folder to one section), so a bare folder id is not always unique among
// the sibling rows this module flattens into one list. Namespacing also means collapsing a folder
// under one section never silently affects its (independent) row under another section.
function folderCollapseKey(sectionId: StudySectionId, folderId: string): string {
  return `folder:${sectionId}:${folderId}`;
}









/** Every id this pane can independently collapse for the CURRENT tree: every section header
 * (always collapsible, per `renderSectionBlock` below) plus every folder that has children
 * (leaf folders have no chevron and are never "collapsed" — see `renderFolderRow`). */
function collectCollapsibleIds(tree: StudyNavigationTree): string[] {
  const ids: string[] = [];
  const walkFolders = (sectionId: StudySectionId, groups: readonly StudyNavigationFolderGroup[]): void => {
    for (const group of groups) {
      if (group.children.length > 0) ids.push(folderCollapseKey(sectionId, group.id));
      walkFolders(sectionId, group.children);
    }
  };
  for (const section of tree.sections) {
    ids.push(section.id);
    walkFolders(section.id, section.folders);
  }
  return ids;
}

/** True when at least one collapsible node in the CURRENT tree is not in `_collapsedIds` — i.e.
 * currently rendering expanded. Scoped to this tree's own ids (not whatever `_collapsedIds`
 * happens to contain) so a stale id left over from a folder that no longer exists can never make
 * this report "something is expanded" when nothing currently on screen actually is. */
export function hasAnyExpanded(tree: StudyNavigationTree): boolean {
  return collectCollapsibleIds(tree).some(id => !_collapsedIds.has(id));
}

/** Expands every section/folder. Clearing the WHOLE `_collapsedIds` set (not just this tree's own
 * ids) is intentional and safe — every id ever stored in it is either a section id or a
 * `folderCollapseKey(...)` string, both scoped exclusively to this pane, so there is no other
 * consumer whose state this could disturb. */
export function expandAllSections(): void {
  _collapsedIds.clear();
}











export function revealFolderRow(sectionId: StudySectionId, ancestorFolderIds: readonly string[]): void {
  _collapsedIds.delete(sectionId);
  for (const ancestorId of ancestorFolderIds) _collapsedIds.delete(folderCollapseKey(sectionId, ancestorId));
}

/** Collapses every section/folder in the CURRENT tree. */
export function collapseAllSections(tree: StudyNavigationTree): void {
  for (const id of collectCollapsibleIds(tree)) _collapsedIds.add(id);
}

// ---------------------------------------------------------------------------------------------
// Row-count helpers — summing what the P1 tree already handed us, not a classification decision.
// ---------------------------------------------------------------------------------------------

function countFolderItemsRecursive(group: StudyNavigationFolderGroup): number {
  let total = group.itemIds.length;
  for (const child of group.children) total += countFolderItemsRecursive(child);
  return total;
}

function countSectionItems(section: StudyNavigationSectionNode): number {
  let total = section.unfiledItemIds.length;
  for (const folder of section.folders) total += countFolderItemsRecursive(folder);
  return total;
}










function canAcceptDropOnFolder(targetFolderId: string): boolean {
  const kind = draggingKind();
  if (kind === 'game') return true;
  if (kind === 'folder') {
    const draggedId = draggingIds()[0];
    return draggedId !== undefined && !wouldCreateFolderCycle(draggedId, targetFolderId);
  }
  return false;
}

function canAcceptDropOnSection(): boolean {
  return draggingKind() !== null;
}

/** Commits a drop onto a folder row -- games re-home there; a dragged folder reparents under it.
 * Chains a `redraw()` after the mutation's async IDB write settles: the drop's OWN synchronous
 * redraw (dropTargetHandlers) only reflects the FIRST id's in-memory update for a multi-selection
 * drag (studyCtrl.updateStudy awaits per id, sequentially), so a second redraw once the whole
 * batch resolves is required for the rest of the dragged selection to visibly move. */
function commitDropOnFolder(targetFolderId: string, redraw: () => void): void {
  const kind = draggingKind();
  const ids = draggingIds();
  if (kind === 'game') {
    void moveGamesToFolder(ids, targetFolderId).then(redraw);
  } else if (kind === 'folder') {
    const draggedId = ids[0];
    if (draggedId) void reparentFolderTo(draggedId, targetFolderId).then(redraw);
  }
}

/** Commits a drop onto a section header -- games un-file (see navigatorDragDrop.ts's disclosed
 * simplification note); a dragged folder un-parents to root level. Same chained-redraw reasoning
 * as commitDropOnFolder above. */
function commitDropOnSection(redraw: () => void): void {
  const kind = draggingKind();
  const ids = draggingIds();
  if (kind === 'game') {
    void unfileGames(ids).then(redraw);
  } else if (kind === 'folder') {
    const draggedId = ids[0];
    if (draggedId) void unparentFolder(draggedId).then(redraw);
  }
}

// ---------------------------------------------------------------------------------------------
// Row renderers
// ---------------------------------------------------------------------------------------------

function activateCustomControlOnKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  event.stopPropagation();
  (event.currentTarget as HTMLElement).click();
}

function renderLensRow(lens: NavigationPaneLensDef): VNode {
  return h(
    'div.nav-row',
    {
      key: `lens-${lens.id}`,
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        ...controlExplainerAttrs({
          label: lens.label,
          description: `Shows Study items in the ${lens.label} lens.`,
        }),
      },
      on: { keydown: activateCustomControlOnKeydown },
    },
    [
      h('span.nav-row__icon', LENS_ICONS[lens.id]),
      h('span.nav-row__label', lens.label),
      lens.count !== undefined ? h('span.nav-row__count', String(lens.count)) : null,
    ],
  );
}

function renderFolderRow(
  sectionId: StudySectionId,
  group: StudyNavigationFolderGroup,
  depth: number,
  redraw: () => void,
): VNode[] {








  const hidden = isHidden('folder', group.id);
  if (hidden && !showHiddenItems()) return [];

  const hasChildren = group.children.length > 0;
  const collapseKey = folderCollapseKey(sectionId, group.id);
  const collapsed = hasChildren && isCollapsed(collapseKey);






  const indentStyle = `padding-left:calc(12px + var(--nav-indent, 16px) * ${depth + 1})${hidden ? ';opacity:0.5' : ''}`;

  const attrs: Record<string, string> = {
    role: 'treeitem',
    tabindex: '0',
    style: indentStyle,
    draggable: 'true',
    'data-drop-zone': 'folder',
    'data-drop-key': collapseKey,
    ...controlExplainerAttrs({
      label: group.name,
      description: 'Shows this folder\'s Study items and toggles its nested folders when available.',
    }),
  };
  if (hasChildren) attrs['aria-expanded'] = String(!collapsed);

  const dropHandlers = dropTargetHandlers(
    {
      key: collapseKey,
      canAccept: () => canAcceptDropOnFolder(group.id),
      onDrop: () => commitDropOnFolder(group.id, redraw),
      ...(hasChildren
        ? { springLoad: { isExpanded: () => !isCollapsed(collapseKey), expand: () => toggleCollapsed(collapseKey, redraw) } }
        : {}),
    },
    redraw,
  );

  const data: VNodeData = {
    key: `folder-${sectionId}-${group.id}`,
    attrs,
    on: {
      ...dropHandlers,
      keydown: activateCustomControlOnKeydown,
      ...(hasChildren ? { click: () => toggleCollapsed(collapseKey, redraw) } : {}),
      dragstart: (e: DragEvent) => { beginFolderDrag(group.id, group.name, e); redraw(); },
      dragend: () => { endDrag(); redraw(); },


      contextmenu: (e: MouseEvent) => {
        e.preventDefault();
        openFolderContextMenu({ folderId: group.id }, e.clientX, e.clientY, redraw);
      },
    },
  };

  const dragging = draggingKind() === 'folder' && draggingIds().includes(group.id);

  const row = h(
    'div.nav-row.--folder',
    {
      ...data,
      class: {
        'nav-row--drop-over': isDropTargetHovered(collapseKey),
        'nav-row--dragging': dragging,
        'nav-row--hidden': hidden,
      },
    },
    [








      hasChildren
        ? navIcon('chevron-right', { size: 16, className: 'nav-chevron', toggleClass: { '--open': !collapsed } })
        : null,




      navIcon(hasChildren && !collapsed ? 'folder-open' : 'folder', { size: 16, className: 'nav-row__icon' }),
      h('span.nav-row__label', group.name),
      h('span.nav-row__count', String(countFolderItemsRecursive(group))),
    ],
  );

  if (!hasChildren || collapsed) return [row];
  return [row, ...group.children.flatMap(child => renderFolderRow(sectionId, child, depth + 1, redraw))];
}




function renderSectionEmptyHint(sectionId: StudySectionId): VNode {
  return h('div.nav-row.--empty', { key: `section-${sectionId}-empty` }, 'No items yet');
}

function renderSectionBlock(section: StudyNavigationSectionNode, redraw: () => void): VNode[] {
  const collapsed = isCollapsed(section.id);
  const sectionDropKey = `section:${section.id}`;

  const dropHandlers = dropTargetHandlers(
    {
      key: sectionDropKey,
      canAccept: canAcceptDropOnSection,
      onDrop: () => commitDropOnSection(redraw),
      springLoad: { isExpanded: () => !collapsed, expand: () => toggleCollapsed(section.id, redraw) },
    },
    redraw,
  );

  const header = h(
    'div.nav-row.--section',
    {
      key: `section-${section.id}`,
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        'aria-expanded': String(!collapsed),
        'data-drop-zone': 'section',
        'data-drop-key': sectionDropKey,
        ...controlExplainerAttrs({
          label: section.label,
          description: 'Shows this Study section and toggles its folders.',
        }),
      },
      class: { 'nav-row--drop-over': isDropTargetHovered(sectionDropKey) },
      on: {
        ...dropHandlers,
        click: () => toggleCollapsed(section.id, redraw),
        keydown: activateCustomControlOnKeydown,
      },
    },
    [



      navIcon('chevron-right', { size: 16, className: 'nav-chevron', toggleClass: { '--open': !collapsed } }),

      navIcon(collapsed ? 'folder' : 'folder-open', { size: 16, className: 'nav-row__icon' }),
      h('span.nav-row__label', section.label),
      h('span.nav-row__count', String(countSectionItems(section))),
    ],
  );

  if (collapsed) return [header];

  if (section.folders.length === 0 && section.unfiledItemIds.length === 0) {
    return [header, renderSectionEmptyHint(section.id)];
  }

  return [header, ...section.folders.flatMap(folder => renderFolderRow(section.id, folder, 0, redraw))];
}































const SECTION_ORDER_STORAGE_KEY = 'patzer.studyNavSectionOrder';

function defaultSectionOrder(): StudySectionId[] {
  return STUDY_SECTIONS.map(section => section.id);
}

function normalizeSectionOrder(candidate: readonly string[]): StudySectionId[] {
  const known = new Set<string>(defaultSectionOrder());
  const seen = new Set<string>();
  const order: StudySectionId[] = [];
  for (const id of candidate) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id as StudySectionId);
    }
  }




  for (const id of defaultSectionOrder()) {
    if (!seen.has(id)) order.push(id);
  }
  return order;
}

function loadSectionOrder(): StudySectionId[] {
  try {
    const raw = localStorage.getItem(SECTION_ORDER_STORAGE_KEY);
    if (!raw) return defaultSectionOrder();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaultSectionOrder();
    return normalizeSectionOrder(parsed.filter((id): id is string => typeof id === 'string'));
  } catch {
    return defaultSectionOrder(); // corrupt/unavailable localStorage — fall back to defaults.
  }
}

function persistSectionOrder(order: readonly StudySectionId[]): void {
  try {
    localStorage.setItem(SECTION_ORDER_STORAGE_KEY, JSON.stringify(order));
  } catch {
    // Best-effort only: a failed write just means the order resets to default next mount.
  }
}

// Read-once-then-cache module state (navigatorSettings.ts §2.4 precedent) — per-device only, no
// synced-vs-local toggle (matches the appearance-settings model's own [DEFAULT]).
let _sectionOrder: StudySectionId[] = loadSectionOrder();

export function getSectionOrder(): readonly StudySectionId[] {
  return _sectionOrder;
}

export function setSectionOrder(order: readonly StudySectionId[]): void {
  _sectionOrder = normalizeSectionOrder(order);
  persistSectionOrder(_sectionOrder);
}

/** Applies the persisted section order to a tree's own `sections` array. Consumed by BOTH the
 * normal tree render (`renderSectionsBlock` below — so a completed reorder is actually visible in
 * the real nav tree, not just persisted invisibly) and the reorder panel itself. A section id
 * present in the tree but not yet in the persisted order (should not normally happen — the tree
 * always carries all four STUDY_SECTIONS — but handled defensively) appends in the tree's own
 * already-P2-LIB-2-ordered order. */
function orderedTreeSections(tree: StudyNavigationTree): StudyNavigationSectionNode[] {
  const bySectionId = new Map(tree.sections.map(section => [section.id, section] as const));
  const ordered: StudyNavigationSectionNode[] = [];
  for (const id of _sectionOrder) {
    const section = bySectionId.get(id);
    if (section) {
      ordered.push(section);
      bySectionId.delete(id);
    }
  }
  for (const section of tree.sections) {
    if (bySectionId.has(section.id)) ordered.push(section);
  }
  return ordered;
}

function moveSectionOrderStep(sectionId: StudySectionId, delta: number, redraw: () => void): void {
  const order = _sectionOrder.slice();
  const idx = order.indexOf(sectionId);
  const target = idx + delta;
  if (idx === -1 || target < 0 || target >= order.length) return;
  order.splice(idx, 1);
  order.splice(target, 0, sectionId);
  setSectionOrder(order);
  redraw();
}

/**
 * Pointerdown handler for a reorder row's drag handle. Mirrors `PaneResizeController.startDrag`'s
 * own shape (primary-button-only, pointer capture, direct DOM writes during the active drag, a
 * single redraw() at drag-end) adapted from a 1-D size drag to a list-position drag: every OTHER
 * row previews the reorder live via a `translateY` shift (the classic "make room" list-reorder
 * technique), the dragged row itself tracks the pointer 1:1, and the final index is committed to
 * `_sectionOrder` (via `setSectionOrder`) only on pointerup.
 */
function startSectionReorderDrag(event: PointerEvent, sectionId: StudySectionId, redraw: () => void): void {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  const handle = event.currentTarget as HTMLElement | null;
  const row = handle?.closest('.nav-reorder-row') as HTMLElement | null;
  const list = handle?.closest('.nav-reorder-list') as HTMLElement | null;
  if (!handle || !row || !list) return;

  const rows = Array.from(list.querySelectorAll<HTMLElement>('.nav-reorder-row'));
  const startIndex = rows.indexOf(row);
  const rowHeight = row.getBoundingClientRect().height;
  if (startIndex === -1 || rows.length < 2 || !(rowHeight > 0)) return;
  event.preventDefault();

  const pointerId = event.pointerId;
  const startClientY = event.clientY;
  let targetIndex = startIndex;

  row.classList.add('--dragging');
  handle.setPointerCapture?.(pointerId);
  document.body.classList.add('study-nav-reordering');

  const applyShiftPreview = (newTargetIndex: number): void => {
    rows.forEach((r, i) => {
      if (i === startIndex) return;
      let shift = 0;
      if (newTargetIndex < startIndex && i >= newTargetIndex && i < startIndex) shift = 1;
      else if (newTargetIndex > startIndex && i <= newTargetIndex && i > startIndex) shift = -1;
      r.style.transform = shift === 0 ? '' : `translateY(${shift * rowHeight}px)`;
    });
  };

  const handleMove = (moveEvent: PointerEvent): void => {
    if (moveEvent.pointerId !== pointerId) return;
    const deltaY = moveEvent.clientY - startClientY;
    row.style.transform = `translateY(${deltaY}px)`;
    const rawIndex = startIndex + Math.round(deltaY / rowHeight);
    const nextTarget = Math.max(0, Math.min(rows.length - 1, rawIndex));
    if (nextTarget !== targetIndex) {
      targetIndex = nextTarget;
      applyShiftPreview(targetIndex);
    }
  };

  const endDrag = (endEvent: PointerEvent): void => {
    if (endEvent.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', handleMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    document.body.classList.remove('study-nav-reordering');
    rows.forEach(r => {
      r.style.transform = '';
      r.classList.remove('--dragging');
    });

    if (targetIndex !== startIndex) {
      const next = _sectionOrder.slice();
      const idx = next.indexOf(sectionId);
      if (idx !== -1) {
        next.splice(idx, 1);
        next.splice(targetIndex, 0, sectionId);
        setSectionOrder(next);
      }
    }
    redraw();
  };

  window.addEventListener('pointermove', handleMove);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
}

/** One draggable root-section row in reorder mode: a CSS-drawn grip handle (`.nav-reorder-handle`
 * — no new icon vendored for this, drawn purely in main.scss, consistent with this pane's own
 * existing plain-glyph convention for lens icons), the section's label, and up/down move buttons
 * (reusing the already-vendored `chevron-down` glyph, rotated 180deg for "up" — the same
 * single-glyph-rotated-by-CSS trick `.nav-chevron.--open` already uses elsewhere in this file's
 * own stylesheet) as a keyboard/pointer-optional alternative to the drag handle. */
function renderReorderRow(
  sectionId: StudySectionId,
  label: string,
  index: number,
  total: number,
  redraw: () => void,
): VNode {
  const canMoveUp = index > 0;
  const canMoveDown = index < total - 1;
  const renderMoveButton = (direction: 'up' | 'down', available: boolean): VNode => {
    const labelText = `Move ${label} ${direction}`;
    const control = h(
      'button.nav-reorder-move',
      {
        attrs: {
          type: 'button',
          ...iconControlExplainerAttrs({
            label: labelText,
            description: `Moves this Study section one position ${direction}.`,
          }),
        },
        on: available
          ? { click: () => moveSectionOrderStep(sectionId, direction === 'up' ? -1 : 1, redraw) }
          : {},
      },
      [navIcon('chevron-down', {
        size: 14,
        className: `nav-reorder-move__icon${direction === 'up' ? ' --up' : ''}`,
      })],
    );
    if (available) return control;
    return renderDisabledControlExplainer(
      {
        label: labelText,
        description: `${label} is already the ${direction === 'up' ? 'first' : 'last'} Study section.`,
      },
      control,
    );
  };
  return h(
    'div.nav-reorder-row',
    { key: `reorder-section-${sectionId}`, attrs: { role: 'listitem' } },
    [
      h('span.nav-reorder-handle', {
        // Pointer-only affordance (mirrors NN's own model: its dnd-kit sensors are
        // Mouse/TouchSensor only, no KeyboardSensor — the up/down buttons below are NN's own
        // real keyboard-operable path, not this handle). `aria-hidden` + no tabindex/role is
        // deliberate: a focusable "button" with no keydown handler would be a real, silently
        // broken affordance for keyboard/screen-reader users. The shared explainer provides the
        // sighted mouse-user tooltip while the handle remains hidden from the accessibility tree.
        attrs: {
          'aria-hidden': 'true',
          ...controlExplainerAttrs({
            label: `Drag to reorder ${label}`,
            description: 'Drags this Study section to a new position.',
          }),
        },
        on: { pointerdown: (e: Event) => startSectionReorderDrag(e as PointerEvent, sectionId, redraw) },
      }),
      h('span.nav-row__label', label),
      h('div.nav-reorder-row__controls', [
        renderMoveButton('up', canMoveUp),
        renderMoveButton('down', canMoveDown),
      ]),
    ],
  );
}

/** The reorder-mode panel — REPLACES `.lib-nav`'s normal chrome/scroller/content entirely (see
 * `renderNavigationPane` below) so that: (1) no lens/section/folder row keys this mode renders
 * ever match `navigatorShellView.ts`'s `section-<id>`/`folder-<sectionId>-<folderId>`/`lens-<id>`
 * selection-wiring keys, which is what suspends normal selection/navigation while this mode is
 * active without this file needing to know anything about that shell's selection model; and (2)
 * it reads as an obvious, deliberate mode switch (matching NN's own `NavigationRootReorderPanel`
 * taking over the same screen area) rather than an overlay bolted onto the normal tree. */
function renderReorderPanel(tree: StudyNavigationTree, redraw: () => void): VNode {
  const sections = orderedTreeSections(tree);
  return h(
    'div.lib-nav__reorder',
    { attrs: { role: 'region', 'aria-label': 'Reorder navigation sections' } },
    [
      h('div.nav-reorder-header', [
        h('div.nav-reorder-header__title', 'Reorder navigation'),
        h('div.nav-reorder-header__hint', 'Drag a section, or use the up/down buttons, to change its position.'),
      ]),
      h(
        'div.nav-reorder-list',
        { attrs: { role: 'list', 'aria-label': 'Sections' } },
        sections.map((section, index) => renderReorderRow(section.id, section.label, index, sections.length, redraw)),
      ),
    ],
  );
}








const SHORTCUTS_COLLAPSE_KEY = 'shortcuts-block'; // distinct namespace: never collides with a bare
// StudySectionId/StudyLensId (both plain ids with no prefix) or a `folder:<section>:<folder>` key.

/** Walks the tree's own folder groups (any section, any depth) to find the ONE this shortcut
 * targets, returning its owning section id (needed for the exact `folder-<sectionId>-<folderId>`
 * selection key below) plus its current display name. A folder that legitimately appears under more
 * than one section (P2-LIB-8 multi-membership) resolves to whichever section is found first --
 * the same disclosed ambiguity `navigatorShellView.ts`'s own folder-selection model already
 * accepts elsewhere, not a new one introduced here. */
function findFolderShortcutTarget(
  tree: StudyNavigationTree,
  folderId: string,
): { sectionId: StudySectionId; name: string } | null {
  const walk = (
    sectionId: StudySectionId,
    groups: readonly StudyNavigationFolderGroup[],
  ): { sectionId: StudySectionId; name: string } | null => {
    for (const group of groups) {
      if (group.id === folderId) return { sectionId, name: group.name };
      const found = walk(sectionId, group.children);
      if (found) return found;
    }
    return null;
  };
  for (const section of tree.sections) {
    const found = walk(section.id, section.folders);
    if (found) return found;
  }
  return null;
}

/**
 * Renders one Shortcuts row, or null when the shortcut's target no longer exists (a stale
 * localStorage entry -- the deleted game/folder is simply skipped, not surfaced as an error).
 *
 * Game rows navigate via `writeHashRoute('study/<id>')` -- byte-for-byte the SAME action the game
 * context menu's own "Open" row already uses (`navigatorContextMenu.ts`), the only existing
 * "navigate to a specific game" action in this subsystem.
 *
 * Folder rows carry the EXACT `folder-<sectionId>-<folderId>` Snabbdom key `renderFolderRow` above
 * assigns its own row. `navigatorShellView.ts`'s `wireSelectionHandlers` (no-touch this slice)
 * composes real selection/navigation wiring onto ANY row in the returned nav-pane vnode tree whose
 * key matches its own selection index -- by reusing that exact key here, this row is picked up by
 * that EXISTING mechanism for free (it attaches its own click handler and `--active` state), with
 * no change needed to the no-touch shell. Disclosed alternative considered and rejected: the
 * legacy `studyCtrl.ts` `setActiveFolderId`/`activeFolderId()` pair (used by this file's sibling
 * `navigatorContextMenu.ts`'s "Go to home folder" row) does NOT drive the current navigator shell's
 * item-list pane at all -- `navigatorShellView.ts` resolves its item list from its own private
 * `_selection` state, never from `studyCtrl.ts`'s `activeFolderId` (confirmed by reading both
 * files) -- so that path would not visibly navigate anything in the currently-mounted UI.
 */
function renderShortcutRow(
  entry: ShortcutEntry,
  tree: StudyNavigationTree,
  itemTitleById: ReadonlyMap<string, string>,
): VNode | null {
  if (entry.kind === 'game') {
    const title = itemTitleById.get(entry.id);
    if (title === undefined) return null;
    return h(
      'div.nav-row',
      {
        key: `shortcut-game-${entry.id}`,
        attrs: {
          role: 'treeitem',
          tabindex: '0',
          ...controlExplainerAttrs({
            label: title,
            description: 'Opens this shortcut game in the Study workspace.',
          }),
        },



        on: {
          click: () => { bumpSelectionSurface(); writeHashRoute(`study/${entry.id}`); },
          keydown: activateCustomControlOnKeydown,
        },
      },
      [
        h('span.nav-row__icon', '♟'),
        h('span.nav-row__label', title),
      ],
    );
  }

  const target = findFolderShortcutTarget(tree, entry.id);
  if (!target) return null;
  return h(
    'div.nav-row',
    {
      key: `folder-${target.sectionId}-${entry.id}`,
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        ...controlExplainerAttrs({
          label: target.name,
          description: 'Shows the Study items in this shortcut folder.',
        }),
      },
      on: { keydown: activateCustomControlOnKeydown },
    },
    [



      navIcon('folder', { size: 16, className: 'nav-row__icon' }),
      h('span.nav-row__label', target.name),
    ],
  );
}

/** The Shortcuts block itself -- collapsible (mirrors `renderSectionBlock`'s own header/chevron/
 * `_collapsedIds` mechanism, reusing it rather than inventing a second collapse model), hidden
 * entirely when there are no shortcuts (or every persisted one is stale). Reuses the EXISTING
 * `.lib-nav__pinned` wrapper class (the Lenses block's own chrome-block styling: padding + bottom
 * border) and the existing `.nav-row`/`.nav-row--section`/`.nav-row__icon`/`.nav-row__label`/
 * `.nav-chevron` row classes -- no new main.scss rule is added or needed (a concurrent A7 lane
 * owns main.scss this slice). */
function renderShortcutsBlock(tree: StudyNavigationTree, redraw: () => void): VNode | null {
  const entries = shortcuts();
  if (entries.length === 0) return null;

  const itemTitleById = new Map(allStudies().map(item => [item.id, item.title] as const));
  const rows = entries
    .map(entry => renderShortcutRow(entry, tree, itemTitleById))
    .filter((row): row is VNode => row !== null);
  if (rows.length === 0) return null;

  const collapsed = isCollapsed(SHORTCUTS_COLLAPSE_KEY);
  return h('div.lib-nav__pinned', {
    attrs: {
      role: 'tree',
      'aria-label': 'Shortcuts',
      ...controlExplainerAttrs({ label: 'Shortcuts' }),
    },
  }, [
    h(
      'div.nav-row.--section',
      {
        key: 'shortcuts-header',
        attrs: {
          role: 'treeitem',
          tabindex: '0',
          'aria-expanded': String(!collapsed),
          ...controlExplainerAttrs({
            label: 'Shortcuts',
            description: 'Expands or collapses your Study shortcuts.',
          }),
        },
        on: {
          click: () => toggleCollapsed(SHORTCUTS_COLLAPSE_KEY, redraw),
          keydown: activateCustomControlOnKeydown,
        },
      },
      [
        navIcon('chevron-right', { size: 16, className: 'nav-chevron', toggleClass: { '--open': !collapsed } }),
        navIcon('star', { size: 16, className: 'nav-row__icon' }),
        h('span.nav-row__label', 'Shortcuts'),
      ],
    ),
    ...(collapsed ? [] : rows),
  ]);
}




















const RECENT_BLOCK_LIMIT = 20;
const RECENT_COLLAPSE_KEY = 'recent-block'; // distinct namespace, same reasoning as
// SHORTCUTS_COLLAPSE_KEY above: never collides with a bare StudySectionId/StudyLensId or a
// `folder:<section>:<folder>`/`shortcuts-block` key.

/** Pure selection logic: the `limit` most-recently-updated studies, most-recent first. Exported so
 * `scripts/test-study-recent-block.mjs` can assert on it directly without needing to render a
 * VNode tree. */
export function selectRecentItems(items: readonly StudyItem[], limit: number = RECENT_BLOCK_LIMIT): StudyItem[] {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
}

/** One Recent-block row -- reuses the exact `.nav-row` shape and pawn glyph
 * `renderShortcutRow`'s game branch already uses, and the identical `writeHashRoute` navigation
 * action, so this is visually and behaviorally consistent with the Shortcuts block directly
 * above it. Keyed distinctly (`recent-<id>`) from a Shortcuts game row's `shortcut-game-<id>` key
 * so the SAME game can appear in both blocks at once without a Snabbdom key collision. */
function renderRecentRow(item: StudyItem): VNode {
  return h(
    'div.nav-row',
    {
      key: `recent-${item.id}`,
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        ...controlExplainerAttrs({
          label: item.title,
          description: 'Opens this recent game in the Study workspace.',
        }),
      },

      on: {
        click: () => { bumpSelectionSurface(); writeHashRoute(`study/${item.id}`); },
        keydown: activateCustomControlOnKeydown,
      },
    },
    [
      h('span.nav-row__icon', '♟'),
      h('span.nav-row__label', item.title),
    ],
  );
}

/** The Recent block itself -- collapsible (reuses `renderSectionBlock`'s own header/chevron/
 * `_collapsedIds` mechanism, same as the Shortcuts block above; no second collapse model). Reuses
 * the EXISTING `.lib-nav__pinned` wrapper class and `.nav-row`/`.nav-row--section`/
 * `.nav-row__icon`/`.nav-row__label`/`.nav-chevron` row classes -- no new main.scss rule is added
 * (this slice's own no-touch fence). */
function renderRecentBlock(redraw: () => void): VNode | null {
  const recent = selectRecentItems(allStudies());
  if (recent.length === 0) return null;

  const collapsed = isCollapsed(RECENT_COLLAPSE_KEY);
  return h('div.lib-nav__pinned', {
    attrs: {
      role: 'tree',
      'aria-label': 'Recent',
      ...controlExplainerAttrs({ label: 'Recent' }),
    },
  }, [
    h(
      'div.nav-row.--section',
      {
        key: 'recent-header',
        attrs: {
          role: 'treeitem',
          tabindex: '0',
          'aria-expanded': String(!collapsed),
          ...controlExplainerAttrs({
            label: 'Recent',
            description: 'Expands or collapses your recently updated Study games.',
          }),
        },
        on: {
          click: () => toggleCollapsed(RECENT_COLLAPSE_KEY, redraw),
          keydown: activateCustomControlOnKeydown,
        },
      },
      [
        navIcon('chevron-right', { size: 16, className: 'nav-chevron', toggleClass: { '--open': !collapsed } }),
        navIcon('history', { size: 16, className: 'nav-row__icon' }),
        h('span.nav-row__label', 'Recent'),
      ],
    ),
    ...(collapsed ? [] : recent.map(item => renderRecentRow(item))),
  ]);
}

// ---------------------------------------------------------------------------------------------
// Pane chrome / scroller / content assembly (NN §1.2 anatomy)
// ---------------------------------------------------------------------------------------------

function renderPinnedLensesBlock(lenses: readonly NavigationPaneLensDef[]): VNode {


  return h('div.lib-nav__pinned', {
    attrs: {
      role: 'tree',
      'aria-label': 'Lenses',
      ...controlExplainerAttrs({ label: 'Lenses' }),
    },
  }, [
    h('div.lib-nav__label', 'Lenses'),
    ...lenses.map(lens => renderLensRow(lens)),
  ]);
}

function renderSectionsBlock(tree: StudyNavigationTree, redraw: () => void): VNode {
  return h('div.lib-nav__sections', {
    attrs: {
      role: 'tree',
      'aria-label': 'Sections',
      ...controlExplainerAttrs({ label: 'Sections' }),
    },
  }, [
    h('div.lib-nav__label', 'Sections'),



    ...orderedTreeSections(tree).flatMap(section => renderSectionBlock(section, redraw)),
  ]);
}





























const INTERNAL_TAG_STUDIED = 'studied';
const INTERNAL_TAG_MASTER_GAME = 'master-game';
const INTERNAL_TAG_COLLECTION_PREFIX = 'collection:';

function isInternalTag(tag: string): boolean {
  return tag === INTERNAL_TAG_STUDIED
    || tag === INTERNAL_TAG_MASTER_GAME
    || tag.startsWith(INTERNAL_TAG_COLLECTION_PREFIX);
}

export interface TagCount {
  name: string;
  count: number;
}

/**
 * Non-internal tag names across `allItems`, each paired with its member count
 * (`allItems.filter(i => i.tags.includes(tag)).length` per tag, computed here as one pass over
 * `allItems` rather than N passes). Sorted alphabetically (matches `studyCtrl.ts`'s own
 * `studyTags()` `.sort()`). Exported so `navigatorShellView.ts`'s tag-selection index/resolution
 * and `scripts/test-study-tags-tree.mjs` both read the IDENTICAL list this block renders — one
 * source of truth for "what counts as a real tag," not two independently-maintained copies.
 */
export function nonInternalTagCounts(allItems: readonly StudyItem[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const item of allItems) {






    const seenOnItem = new Set<string>();
    for (const tag of item.tags) {
      if (isInternalTag(tag)) continue;
      if (seenOnItem.has(tag)) continue;
      seenOnItem.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const TAGS_COLLAPSE_KEY = 'tags-block'; // distinct namespace, same reasoning as
// SHORTCUTS_COLLAPSE_KEY/RECENT_COLLAPSE_KEY above: never collides with a bare
// StudySectionId/StudyLensId or a `folder:<section>:<folder>`/`shortcuts-block`/`recent-block` key.

/**
 * One real tag row — icon `tag` (inventory §5), label + `(count)`. Dimmed via the SAME
 * `nav-row--hidden` class + inline-opacity treatment `renderFolderRow` (A6d) already uses for
 * hidden folders (not a new main.scss rule — matching that slice's own "no new CSS for the
 * dim-reveal itself" precedent) when `isHidden('tag', name)` is true AND the eye toggle is on;
 * omitted entirely (returns null) when hidden and the eye toggle is off. Right-click opens the tag
 * context menu (A6c's own `openTagContextMenu`, mirroring `renderFolderRow`'s `contextmenu` wiring
 * for `openFolderContextMenu`). This row's Snabbdom `key` (`tag-<name>`) is the EXACT string
 * `navigatorShellView.ts`'s `selectionKey`/`buildSelectionIndex` use for a tag selection — that
 * shell composes a click handler onto this row by matching that key, the same mechanism every
 * lens/section/folder row already relies on (see that file's own `wireSelectionHandlers` comment).
 */
function renderTagRow(name: string, count: number, redraw: () => void): VNode | null {
  const hidden = isHidden('tag', name);
  if (hidden && !showHiddenItems()) return null;

  return h(
    'div.nav-row',
    {
      key: `tag-${name}`,
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        style: hidden ? 'opacity:0.5' : '',
        ...controlExplainerAttrs({
          label: name,
          description: 'Shows Study items carrying this tag.',
        }),
      },
      class: { 'nav-row--hidden': hidden },
      on: {
        keydown: activateCustomControlOnKeydown,
        contextmenu: (e: MouseEvent) => {
          e.preventDefault();
          openTagContextMenu({ tagName: name }, e.clientX, e.clientY, redraw);
        },
      },
    },
    [
      navIcon('tag', { size: 16, className: 'nav-row__icon' }),
      h('span.nav-row__label', name),
      h('span.nav-row__count', `(${count})`),
    ],
  );
}

/**
 * Count of items matching a given `SYSTEM_SMART_TAGS` predicate — the row's own count badge (A6e's
 * own "nice-to-have," `NavigationPaneLensDef.count`, "a one-line `.length` via the same predicate").
 * Only feeds the RENDERED row's label here; the actual item-list SELECTION for a smart-tag click is
 * resolved separately, at navigatorShellView.ts's own `rawItems` call site (mirroring how A6c
 * splits tag rendering here from tag selection-resolution there). `default: 0` is defensive only —
 * `SYSTEM_SMART_TAGS` above only ever supplies these three ids.
 */
function smartTagItemCount(id: StudyLensId, allItems: readonly StudyItem[]): number {
  if (id === 'favorites') return allItems.filter(item => item.favorite === true).length;
  if (id === 'studied') return allItems.filter(item => item.tags.includes('studied')).length;
  if (id === 'saved-puzzles') return allItems.filter(item => item.source === 'puzzles').length;
  return 0;
}





















function renderUserSmartTagRow(tag: UserSmartTag, redraw: () => void): VNode {
  return h(
    'div.nav-row',
    {
      key: `smarttag-${tag.id}`,
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        ...controlExplainerAttrs({
          label: tag.name,
          description: 'Applies this saved search to the Study list.',
        }),
      },
      on: {
        click: () => writeHashRoute(serializeStudyRouteState(tag.query)),
        keydown: activateCustomControlOnKeydown,
      },
    },
    [
      navIcon('tag', { size: 16, className: 'nav-row__icon' }),
      h('span.nav-row__label', tag.name),
      h(
        'span.nav-row__icon',
        {
          attrs: {
            role: 'button',
            tabindex: '0',
            ...iconControlExplainerAttrs({
              label: 'Delete smart tag',
              description: 'Removes this saved smart tag.',
            }),
          },
          on: {
            click: (e: MouseEvent) => {
              e.stopPropagation();
              if (window.confirm(`Delete smart tag "${tag.name}"?`)) {
                deleteSmartTag(tag.id);
                redraw();
              }
            },
            keydown: (e: KeyboardEvent) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.stopPropagation();
              (e.currentTarget as HTMLElement).click();
            },
          },
        },
        [navIcon('trash-2', { size: 14 })],
      ),
    ],
  );
}







function renderSmartTagSaveRow(redraw: () => void): VNode {
  return h(
    'div.nav-row',
    {
      key: 'smarttag-save-action',
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        ...controlExplainerAttrs({
          label: 'Save current search as smart tag',
          description: 'Saves the current Study search as a reusable smart tag.',
        }),
      },
      on: {
        click: () => {
          const name = window.prompt('Name this smart tag');
          if (name && name.trim()) {
            saveSmartTag(name.trim(), studyLibraryRouteSnapshot());
            redraw();
          }
        },
        keydown: activateCustomControlOnKeydown,
      },
    },
    [
      navIcon('file-plus', { size: 16, className: 'nav-row__icon' }),
      h('span.nav-row__label', 'Save current search as smart tag…'),
    ],
  );
}

/**
 * The user-smart-tags group: one row per saved smart tag (below the real per-tag rows) followed by
 * the single "Save current search…" action row. When there are zero saved smart tags, only the Save
 * action row renders (no empty-state text — mirrors how a hidden folder disappears silently).
 */
function renderUserSmartTagsGroup(redraw: () => void): VNode[] {
  const saved = listSmartTags();
  return [
    ...saved.map(tag => renderUserSmartTagRow(tag, redraw)),
    renderSmartTagSaveRow(redraw),
  ];
}

















function renderTagsBlock(allItems: readonly StudyItem[], redraw: () => void): VNode {
  const collapsed = isCollapsed(TAGS_COLLAPSE_KEY);
  const header = h(
    'div.nav-row.--section',
    {
      key: 'tags-header',
      attrs: {
        role: 'treeitem',
        tabindex: '0',
        'aria-expanded': String(!collapsed),
        ...controlExplainerAttrs({
          label: 'Tags',
          description: 'Expands or collapses the Study tags tree.',
        }),
      },
      on: {
        click: () => toggleCollapsed(TAGS_COLLAPSE_KEY, redraw),
        keydown: activateCustomControlOnKeydown,
      },
    },
    [
      navIcon('chevron-right', { size: 16, className: 'nav-chevron', toggleClass: { '--open': !collapsed } }),
      navIcon('tags', { size: 16, className: 'nav-row__icon' }),
      h('span.nav-row__label', 'Tags'),
    ],
  );

  if (collapsed) {
    return h('div.lib-nav__tags', {
      attrs: {
        role: 'tree',
        'aria-label': 'Tags',
        ...controlExplainerAttrs({ label: 'Tags' }),
      },
    }, [header]);
  }

  const smartTagRows = SYSTEM_SMART_TAGS.map(lens =>
    renderLensRow({ ...lens, count: smartTagItemCount(lens.id, allItems) }),
  );

  const tags = nonInternalTagCounts(allItems);
  if (tags.length === 0) {
    // Real emptiness (no non-internal tags exist at all yet) — distinct from "every tag is
    // currently hidden and the eye toggle is off," which instead renders zero real-tag rows below
    // the smart tags with NO empty-state text (mirrors how a hidden folder disappears silently,
    // with no "N folders hidden" message either — see `renderFolderRow`'s own comment). The smart
    // tags above still render in this branch — see this function's own header comment.
    return h('div.lib-nav__tags', {
      attrs: {
        role: 'tree',
        'aria-label': 'Tags',
        ...controlExplainerAttrs({ label: 'Tags' }),
      },
    }, [
      header,
      ...smartTagRows,
      h('div.nav-row.--empty', { key: 'tags-empty' }, 'No tags yet'),



      ...renderUserSmartTagsGroup(redraw),
    ]);
  }

  const rows = tags
    .map(tag => renderTagRow(tag.name, tag.count, redraw))
    .filter((row): row is VNode => row !== null);

  return h('div.lib-nav__tags', {
    attrs: {
      role: 'tree',
      'aria-label': 'Tags',
      ...controlExplainerAttrs({ label: 'Tags' }),
    },


  }, [header, ...smartTagRows, ...rows, ...renderUserSmartTagsGroup(redraw)]);
}
























export function renderNavigationPane(
  tree: StudyNavigationTree,
  redraw: () => void,
  allItems: readonly StudyItem[],
  lenses: readonly NavigationPaneLensDef[] = SYSTEM_LENSES,
  reorderMode = false,
): VNode {
  if (reorderMode) {
    return h('div.lib-nav', [renderReorderPanel(tree, redraw)]);
  }
  return h('div.lib-nav', [
    // Chrome: fixed, outside the scroller (NN §1.2) — Shortcuts (OD-9, above everything else per
    // inventory §4), then Recent (OD-9, A6b — directly below Shortcuts, above the pinned lens
    // block), then the pinned lens block.
    h('div.lib-nav__chrome', [renderShortcutsBlock(tree, redraw), renderRecentBlock(redraw), renderPinnedLensesBlock(lenses)]),



    h('div.lib-nav__scroller', { attrs: { 'data-pane': 'navigation' } }, [
      h('div.lib-nav__content', [renderSectionsBlock(tree, redraw), renderTagsBlock(allItems, redraw)]),
    ]),







    renderFolderContextMenu(redraw),


    renderTagContextMenu(redraw),
  ]);
}
