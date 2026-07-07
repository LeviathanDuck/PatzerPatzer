



















































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

/**
 * The six P2-LIB-2 system lenses, in the register's own listed order. "Unsorted" is the register's
 * own parenthetical: "Unsorted (the quick-save General area)" — the bucket StudyItem.uncategorized
 * quick-saves land in (src/study/types.ts). This is a label list only; every lens renders with no
 * count and no subtree until T5-D13 hands this module real computed data.
 */
export const SYSTEM_LENSES: readonly NavigationPaneLensDef[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'unsorted', label: 'Unsorted' },
  { id: 'favorites', label: 'Favorites' },
  { id: 'tags', label: 'Tags' },
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

function renderLensRow(lens: NavigationPaneLensDef): VNode {
  return h(
    'div.nav-row',
    { key: `lens-${lens.id}`, attrs: { role: 'treeitem', title: lens.label } },
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
  const hasChildren = group.children.length > 0;
  const collapseKey = folderCollapseKey(sectionId, group.id);
  const collapsed = hasChildren && isCollapsed(collapseKey);
  // --nav-indent is a T5-D08 appearance-setting hook (falls back to NN's own default of 16px,
  // Study §3.3's `navIndent`); this view only consumes it, never defines the slider. The literal
  // 12px base mirrors the base row's own horizontal padding set in main.scss's `.nav-row` rule.
  const indentStyle = `padding-left:calc(12px + var(--nav-indent, 16px) * ${depth + 1})`;

  const attrs: Record<string, string> = {
    role: 'treeitem',
    title: group.name,
    style: indentStyle,
    draggable: 'true',
    'data-drop-zone': 'folder',
    'data-drop-key': collapseKey,
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
      ...(hasChildren ? { click: () => toggleCollapsed(collapseKey, redraw) } : {}),
      dragstart: (e: DragEvent) => { beginFolderDrag(group.id, group.name, e); redraw(); },
      dragend: () => { endDrag(); redraw(); },
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
      },
    },
    [
      hasChildren ? h('span.nav-chevron', { class: { '--open': !collapsed } }, '▸') : null,
      h('span.nav-row__icon', '▤'),
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
        'aria-expanded': String(!collapsed),
        title: section.label,
        'data-drop-zone': 'section',
        'data-drop-key': sectionDropKey,
      },
      class: { 'nav-row--drop-over': isDropTargetHovered(sectionDropKey) },
      on: { ...dropHandlers, click: () => toggleCollapsed(section.id, redraw) },
    },
    [
      h('span.nav-chevron', { class: { '--open': !collapsed } }, '▸'),
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
  return h(
    'div.nav-reorder-row',
    { key: `reorder-section-${sectionId}`, attrs: { role: 'listitem' } },
    [
      h('span.nav-reorder-handle', {
        // Pointer-only affordance (mirrors NN's own model: its dnd-kit sensors are
        // Mouse/TouchSensor only, no KeyboardSensor — the up/down buttons below are NN's own
        // real keyboard-operable path, not this handle). `aria-hidden` + no tabindex/role is
        // deliberate: a focusable "button" with no keydown handler would be a real, silently
        // broken affordance for keyboard/screen-reader users. `title` is kept for a sighted
        // mouse-user tooltip only.
        attrs: { title: `Drag to reorder ${label}`, 'aria-hidden': 'true' },
        on: { pointerdown: (e: Event) => startSectionReorderDrag(e as PointerEvent, sectionId, redraw) },
      }),
      h('span.nav-row__label', label),
      h('div.nav-reorder-row__controls', [
        h(
          'button.nav-reorder-move',
          {
            attrs: {
              type: 'button',
              title: `Move ${label} up`,
              'aria-label': `Move ${label} up`,
              ...(canMoveUp ? {} : { 'aria-disabled': 'true' }),
            },
            on: canMoveUp ? { click: () => moveSectionOrderStep(sectionId, -1, redraw) } : {},
          },
          [navIcon('chevron-down', { size: 14, className: 'nav-reorder-move__icon --up' })],
        ),
        h(
          'button.nav-reorder-move',
          {
            attrs: {
              type: 'button',
              title: `Move ${label} down`,
              'aria-label': `Move ${label} down`,
              ...(canMoveDown ? {} : { 'aria-disabled': 'true' }),
            },
            on: canMoveDown ? { click: () => moveSectionOrderStep(sectionId, 1, redraw) } : {},
          },
          [navIcon('chevron-down', { size: 14, className: 'nav-reorder-move__icon' })],
        ),
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

// ---------------------------------------------------------------------------------------------
// Pane chrome / scroller / content assembly (NN §1.2 anatomy)
// ---------------------------------------------------------------------------------------------

function renderPinnedLensesBlock(lenses: readonly NavigationPaneLensDef[]): VNode {


  return h('div.lib-nav__pinned', { attrs: { role: 'tree', 'aria-label': 'Lenses' } }, [
    h('div.lib-nav__label', 'Lenses'),
    ...lenses.map(lens => renderLensRow(lens)),
  ]);
}

function renderSectionsBlock(tree: StudyNavigationTree, redraw: () => void): VNode {
  return h('div.lib-nav__sections', { attrs: { role: 'tree', 'aria-label': 'Sections' } }, [
    h('div.lib-nav__label', 'Sections'),



    ...orderedTreeSections(tree).flatMap(section => renderSectionBlock(section, redraw)),
  ]);
}




















export function renderNavigationPane(
  tree: StudyNavigationTree,
  redraw: () => void,
  lenses: readonly NavigationPaneLensDef[] = SYSTEM_LENSES,
  reorderMode = false,
): VNode {
  if (reorderMode) {
    return h('div.lib-nav', [renderReorderPanel(tree, redraw)]);
  }
  return h('div.lib-nav', [
    // Chrome: fixed, outside the scroller (NN §1.2) — the pinned lens block.
    h('div.lib-nav__chrome', [renderPinnedLensesBlock(lenses)]),
    // Scroller + content: the four fixed sections and their nested folders scroll independently of
    // the chrome above.
    h('div.lib-nav__scroller', { attrs: { 'data-pane': 'navigation' } }, [
      h('div.lib-nav__content', [renderSectionsBlock(tree, redraw)]),
    ]),
  ]);
}
