



















































import { h, type VNode, type VNodeData } from 'snabbdom';
import type {
  StudyNavigationFolderGroup,
  StudyNavigationSectionNode,
  StudyNavigationTree,
  StudySectionId,
} from './navigationIndexProvider';

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

  const attrs: Record<string, string> = { role: 'treeitem', title: group.name, style: indentStyle };
  if (hasChildren) attrs['aria-expanded'] = String(!collapsed);

  // exactOptionalPropertyTypes forbids `on: undefined`, so a leaf folder (nothing to toggle) omits
  // the `on` key entirely rather than setting it to an empty/undefined handler.
  const data: VNodeData = { key: `folder-${sectionId}-${group.id}`, attrs };
  if (hasChildren) data.on = { click: () => toggleCollapsed(collapseKey, redraw) };

  const row = h(
    'div.nav-row.--folder',
    data,
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

  const header = h(
    'div.nav-row.--section',
    {
      key: `section-${section.id}`,
      attrs: { role: 'treeitem', 'aria-expanded': String(!collapsed), title: section.label },
      on: { click: () => toggleCollapsed(section.id, redraw) },
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
    ...tree.sections.flatMap(section => renderSectionBlock(section, redraw)),
  ]);
}

/**
 * Render the Study Navigator's navigation (LEFT) pane. Pure function of its inputs: given the same
 * tree/lenses and this module's current collapse-state Set, always produces the same VNode tree.
 *
 * `tree` comes from the P1 navigation-index layer (`StudyNavigationIndex.buildTree()` in
 * navigationIndexProvider.ts, already instantiated in studyCtrl.ts) — always all four P2-LIB-2
 * sections, in fixed order, per that module's own contract; folders nest via `parentId` at any
 * depth (T5-D01/D02). `lenses` defaults to the fixed six-lens structural list (SYSTEM_LENSES); pass
 * a richer list (with `count` populated) once a lens-membership layer exists (T5-D13) — this
 * function does not need to change to consume that.
 *
 * T5-D07's shell mounts this alongside the (not-yet-built) item-list pane; this function does not
 * mount itself anywhere and does not compose the pane divider.
 */
export function renderNavigationPane(
  tree: StudyNavigationTree,
  redraw: () => void,
  lenses: readonly NavigationPaneLensDef[] = SYSTEM_LENSES,
): VNode {
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
