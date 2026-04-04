# Study Library Navigation — Phase 9 Implementation Reference

**Created:** 2026-03-31
**Purpose:** Implementation-grade detail for Phase 9 of the Study Page sprint. This document provides the specific Snabbdom patterns, CSS layout specs, event handling sequences, state management patterns, and visual layout descriptions needed for Claude Code to execute Phase 9 cleanly.

**Prerequisite reading:**
- `docs/mini-sprints/STUDY_PAGE_SPRINT_2026-03-31.md` (Phase 9 section)
- `src/study/libraryView.ts` (current library view — 439 lines)
- `src/study/studyCtrl.ts` (current controller — 279 lines)
- `src/study/types.ts` (current types)
- Private UX research notes (kept outside this repo)

---

## 1. Current State of the Library View

The existing `libraryView.ts` renders:
- A header with "Study Library" title + "Import PGN" button
- A practice dashboard banner (due count + Start Review / Learn Now)
- A filter bar (search, favorites, source pills, tag pills)
- Sort controls (date saved, last modified, title)
- A flat list of study rows (favorite star, editable title, meta line, tags, expandable notes/folder section, delete button)
- An import PGN modal

**What it does NOT have:**
- Sidebar with folder navigation
- Folder hierarchy (only flat `folders: string[]` on StudyItem)
- Drag-and-drop organization
- Multi-select / bulk operations
- View mode switching (list vs grid vs headlines)
- Tag management (rename, merge, delete tags)
- Full-text search across annotations
- Responsive sidebar collapse

**The transformation:** Phase 9 converts this from a single-panel flat list into a two-panel sidebar + content layout with rich organization capabilities.

---

## 2. Layout Architecture

### 2.1 Two-Panel Layout

```
┌──────────────────────────────────────────────────────────┐
│  Header: "Study Library"  [Import PGN]  [Search...]       │
├─────────────┬────────────────────────────────────────────┤
│  SIDEBAR    │  CONTENT AREA                               │
│  (240px)    │  (flex-grow)                                │
│             │                                             │
│  All Studies│  [Sort] [View: ≡ ▦ ═]  [Filters...]        │
│  ★ Favorites│  ┌─────────────────────────────────────┐   │
│  ☐ Unsorted │  │  Study Row / Card / Headline        │   │
│  🗑 Trash   │  │  Study Row / Card / Headline        │   │
│  ───────────│  │  Study Row / Card / Headline        │   │
│  📁 My Rep  │  │  ...                                │   │
│    📁 White │  │                                     │   │
│    📁 Black │  │                                     │   │
│  📁 Endgames│  │                                     │   │
│  ───────────│  │                                     │   │
│  Tags       │  │                                     │   │
│    endgame  │  └─────────────────────────────────────┘   │
│    tactical │                                             │
│    opening  │  Practice Dashboard (if due items exist)    │
└─────────────┴────────────────────────────────────────────┘
```

### 2.2 CSS Specifications

```scss
// Two-panel layout
.study-page {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.study-page__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.study-page__body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

// Sidebar
.study-sidebar {
  width: 240px;
  min-width: 240px;
  border-right: 1px solid var(--c-border);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--c-bg-sidebar, var(--c-bg-page));
  flex-shrink: 0;

  &__section {
    padding: 8px 0;
    border-bottom: 1px solid var(--c-border);
  }

  &__section-title {
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--c-text-muted);
  }
}

// Sidebar nav items (fixed sections + folders)
.study-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  border-radius: 4px;
  margin: 1px 8px;
  font-size: 13px;
  color: var(--c-text);
  user-select: none;

  &:hover {
    background: var(--c-bg-hover);
  }

  &--active {
    background: var(--c-bg-active);
    font-weight: 500;
  }

  // CSS indentation for nested folders
  // Set --folder-level via inline style in Snabbdom
  padding-left: calc(12px + var(--folder-level, 0) * 16px);

  &__icon {
    flex-shrink: 0;
    width: 16px;
    text-align: center;
  }

  &__name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__count {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--c-text-muted);
    min-width: 20px;
    text-align: right;
  }

  &__expand {
    flex-shrink: 0;
    width: 16px;
    font-size: 10px;
    cursor: pointer;
    opacity: 0.5;
    &:hover { opacity: 1; }
  }
}

// Content area
.study-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.study-content__toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--c-border);
  flex-shrink: 0;
}

.study-content__list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

// Responsive breakpoints
@media (max-width: 1024px) {
  .study-sidebar {
    width: 48px;
    min-width: 48px;
    // Icon-only mode: show only icons, hide names and counts
    .study-sidebar-item__name,
    .study-sidebar-item__count,
    .study-sidebar__section-title { display: none; }
    .study-sidebar-item { padding: 8px 0; justify-content: center; }
  }
}

@media (max-width: 768px) {
  .study-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: 280px;
    z-index: 100;
    transform: translateX(-100%);
    transition: transform 200ms ease;
    box-shadow: 2px 0 8px rgba(0,0,0,0.15);

    &--open {
      transform: translateX(0);
    }

    // Restore full rendering in overlay mode
    .study-sidebar-item__name,
    .study-sidebar-item__count,
    .study-sidebar__section-title { display: initial; }
    .study-sidebar-item { padding: 6px 12px; justify-content: flex-start; }
  }

  .study-sidebar-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.3);
    z-index: 99;
  }
}
```

---

## 3. Snabbdom Patterns

### 3.1 Sidebar Rendering (Flat List with CSS Indentation)

The folder tree is rendered as a flat array — NOT recursively nested DOM elements. Each folder knows its depth level and uses CSS `--folder-level` for indentation.

```typescript
function renderSidebar(redraw: () => void): VNode {
  const folders = sortedFolderTree(); // returns FolderTreeEntry[]
  
  return h('div.study-sidebar', { class: { 'study-sidebar--open': _sidebarOpen } }, [
    // Fixed nav sections
    h('div.study-sidebar__section', [
      renderSidebarItem('all', '📚', 'All Studies', allStudies().length, redraw),
      renderSidebarItem('favorites', '★', 'Favorites', favoriteCount(), redraw),
      renderSidebarItem('unsorted', '☐', 'Unsorted', unsortedCount(), redraw),
      renderSidebarItem('trash', '🗑', 'Trash', trashCount(), redraw),
    ]),
    
    // Folder tree
    h('div.study-sidebar__section', [
      h('div.study-sidebar__section-title', [
        'Folders',
        h('button.study-sidebar__add-folder', {
          attrs: { title: 'New folder' },
          on: { click: () => { startNewFolder(); redraw(); } },
        }, '+'),
      ]),
      ...folders.map(entry => renderFolderItem(entry, redraw)),
      // Inline new-folder input (if creating)
      _creatingFolder ? renderNewFolderInput(redraw) : null,
    ]),
    
    // Tag section
    h('div.study-sidebar__section', [
      h('div.study-sidebar__section-title', 'Tags'),
      ...allTags().map(tag => renderTagItem(tag, redraw)),
    ]),
  ]);
}

interface FolderTreeEntry {
  folder: StudyFolder;
  level: number;        // 0 = root, 1 = child, 2 = grandchild...
  hasChildren: boolean;
  expanded: boolean;
  studyCount: number;
}

function renderFolderItem(entry: FolderTreeEntry, redraw: () => void): VNode {
  const { folder, level, hasChildren, expanded, studyCount } = entry;
  
  return h('div.study-sidebar-item', {
    key: folder.id,
    class: { 'study-sidebar-item--active': _activeFolder === folder.id },
    style: { '--folder-level': String(level) },
    attrs: { draggable: 'true' },
    on: {
      click: () => { setActiveFolder(folder.id); redraw(); },
      dragstart: (e: DragEvent) => handleFolderDragStart(e, folder.id),
      dragover: (e: DragEvent) => handleFolderDragOver(e, folder.id),
      dragleave: (e: DragEvent) => handleFolderDragLeave(e),
      drop: (e: DragEvent) => handleFolderDrop(e, folder.id, redraw),
      contextmenu: (e: MouseEvent) => { e.preventDefault(); showFolderContextMenu(e, folder, redraw); },
    },
  }, [
    // Expand/collapse (only if has children)
    hasChildren
      ? h('span.study-sidebar-item__expand', {
          on: { click: (e: Event) => {
            e.stopPropagation();
            toggleFolderExpanded(folder.id);
            redraw();
          }},
        }, expanded ? '▼' : '▶')
      : h('span.study-sidebar-item__expand'), // spacer for alignment
    
    h('span.study-sidebar-item__icon', folder.icon ?? '📁'),
    h('span.study-sidebar-item__name', folder.name),
    h('span.study-sidebar-item__count', String(studyCount)),
  ]);
}
```

### 3.2 Folder Tree Computation (Flat Sorted Array)

```typescript
function sortedFolderTree(): FolderTreeEntry[] {
  const entries: FolderTreeEntry[] = [];
  const folders = allFolders(); // from studyCtrl
  
  // Build parent → children map
  const childMap = new Map<string | null, StudyFolder[]>();
  for (const f of folders) {
    const key = f.parentId;
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key)!.push(f);
  }
  
  // Sort children by order field
  for (const children of childMap.values()) {
    children.sort((a, b) => a.order - b.order);
  }
  
  // DFS walk to produce flat array with levels
  function walk(parentId: string | null, level: number): void {
    const children = childMap.get(parentId) ?? [];
    for (const folder of children) {
      const hasChildren = (childMap.get(folder.id)?.length ?? 0) > 0;
      entries.push({
        folder,
        level,
        hasChildren,
        expanded: folder.expanded,
        studyCount: countStudiesInFolder(folder.id),
      });
      // Only recurse if expanded
      if (hasChildren && folder.expanded) {
        walk(folder.id, level + 1);
      }
    }
  }
  
  walk(null, 0);
  return entries;
}
```

### 3.3 Inline Editing Pattern

Snabbdom doesn't have React's controlled inputs. Use the `hook.insert` to auto-focus, and `props.value` for initial value only.

```typescript
// State
let _editingFolderName: { folderId: string; value: string } | null = null;

function renderFolderNameEdit(folderId: string, currentName: string, redraw: () => void): VNode {
  return h('input.study-sidebar-item__name-input', {
    props: { value: _editingFolderName?.value ?? currentName },
    hook: {
      insert: (vn) => {
        const el = vn.elm as HTMLInputElement;
        el.focus();
        el.select();
      },
    },
    on: {
      input: (e: Event) => {
        if (_editingFolderName) {
          _editingFolderName.value = (e.target as HTMLInputElement).value;
        }
      },
      blur: () => {
        const newName = _editingFolderName?.value.trim();
        if (newName && newName !== currentName) {
          renameFolder(folderId, newName);
        }
        _editingFolderName = null;
        redraw();
      },
      keydown: (e: KeyboardEvent) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          _editingFolderName = null;
          redraw();
        }
      },
    },
  });
}
```

**Important Snabbdom note:** Never re-assign `props.value` on every render for a text input the user is actively typing in — Snabbdom will move the cursor to the end. Only use `props.value` on initial render (via `hook.insert`). After that, let the DOM own the value and read it via event handlers.

### 3.4 Toolbar Transformation on Selection

```typescript
function renderContentToolbar(redraw: () => void): VNode {
  const selected = selectedIds();
  
  if (selected.size > 0) {
    // SELECTION MODE toolbar
    return h('div.study-content__toolbar.study-content__toolbar--selection', [
      h('label.study-toolbar__select-all', [
        h('input', {
          attrs: { type: 'checkbox', checked: selected.size === filteredStudies().length },
          on: { change: () => { toggleSelectAll(); redraw(); } },
        }),
      ]),
      h('span.study-toolbar__count', `${selected.size} selected`),
      h('button.study-toolbar__action', {
        on: { click: () => showMoveToFolderPicker(redraw) },
      }, 'Move to Folder'),
      h('button.study-toolbar__action', {
        on: { click: () => showBulkTagInput(redraw) },
      }, 'Add Tag'),
      h('button.study-toolbar__action.study-toolbar__action--danger', {
        on: { click: () => bulkDelete(redraw) },
      }, 'Delete'),
      h('button.study-toolbar__action', {
        on: { click: () => bulkExportPgn() },
      }, 'Export PGN'),
      h('button.study-toolbar__cancel', {
        on: { click: () => { clearSelection(); redraw(); } },
      }, '✕'),
    ]);
  }
  
  // NORMAL toolbar
  return h('div.study-content__toolbar', [
    renderSortControls(redraw),
    h('div.study-toolbar__spacer'),
    renderViewModeToggle(redraw),
  ]);
}
```

---

## 4. Drag-and-Drop Event Handling

### 4.1 Study Row → Sidebar Folder (Content → Sidebar)

```typescript
// On study row dragstart
function handleStudyDragStart(e: DragEvent, studyId: string): void {
  const selected = selectedIds();
  // If the dragged item is part of a multi-selection, drag all selected
  const ids = selected.has(studyId) ? Array.from(selected) : [studyId];
  e.dataTransfer!.setData('application/x-study-ids', JSON.stringify(ids));
  e.dataTransfer!.effectAllowed = 'move';
  
  // Ghost image: show count badge for multi-drag
  if (ids.length > 1) {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost-badge';
    ghost.textContent = `${ids.length} studies`;
    document.body.appendChild(ghost);
    e.dataTransfer!.setDragImage(ghost, 0, 0);
    // Clean up ghost after drag ends
    requestAnimationFrame(() => document.body.removeChild(ghost));
  }
}

// On sidebar folder dragover
function handleFolderDragOver(e: DragEvent, folderId: string): void {
  e.preventDefault(); // Allow drop
  e.dataTransfer!.dropEffect = 'move';
  
  const target = e.currentTarget as HTMLElement;
  target.classList.add('study-sidebar-item--drop-target');
}

// On sidebar folder dragleave
function handleFolderDragLeave(e: DragEvent): void {
  const target = e.currentTarget as HTMLElement;
  target.classList.remove('study-sidebar-item--drop-target');
}

// On sidebar folder drop
function handleFolderDrop(e: DragEvent, folderId: string, redraw: () => void): void {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  target.classList.remove('study-sidebar-item--drop-target');
  
  const json = e.dataTransfer!.getData('application/x-study-ids');
  if (!json) return;
  
  try {
    const ids: string[] = JSON.parse(json);
    for (const id of ids) {
      addStudyToFolder(id, folderId);
    }
    clearSelection();
    redraw();
  } catch { /* ignore */ }
}
```

### 4.2 Folder Reorder / Nest (Sidebar → Sidebar)

The key UX detail: cursor position within the drop target determines whether it's a **reorder** (insert above/below) or **nest** (make it a child):

```typescript
function handleFolderDragOver(e: DragEvent, folderId: string): void {
  e.preventDefault();
  const target = e.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  const y = e.clientY - rect.top;
  const height = rect.height;
  
  // Top 25% = insert before, bottom 25% = insert after, middle 50% = nest into
  target.classList.remove(
    'study-sidebar-item--drop-before',
    'study-sidebar-item--drop-after',
    'study-sidebar-item--drop-into'
  );
  
  if (y < height * 0.25) {
    target.classList.add('study-sidebar-item--drop-before');
    _dropIntent = 'before';
  } else if (y > height * 0.75) {
    target.classList.add('study-sidebar-item--drop-after');
    _dropIntent = 'after';
  } else {
    target.classList.add('study-sidebar-item--drop-into');
    _dropIntent = 'into';
  }
}
```

CSS for the drop indicators:

```scss
.study-sidebar-item {
  position: relative;
  
  &--drop-before::before {
    content: '';
    position: absolute;
    top: -1px;
    left: 8px;
    right: 8px;
    height: 2px;
    background: var(--c-accent);
    border-radius: 1px;
  }
  
  &--drop-after::after {
    content: '';
    position: absolute;
    bottom: -1px;
    left: 8px;
    right: 8px;
    height: 2px;
    background: var(--c-accent);
    border-radius: 1px;
  }
  
  &--drop-into {
    background: var(--c-accent-bg);
    outline: 2px solid var(--c-accent);
    outline-offset: -2px;
    border-radius: 4px;
  }
  
  &--drop-target {
    background: var(--c-accent-bg);
  }
}
```

---

## 5. Multi-Select State Management

```typescript
// Module-level state (in studyCtrl.ts or a dedicated selectionCtrl.ts)
let _selectedIds: Set<string> = new Set();
let _lastClickedId: string | null = null;  // anchor for Shift-click range

export function selectedIds(): Set<string> { return _selectedIds; }

export function handleStudyClick(studyId: string, e: MouseEvent, orderedIds: string[]): void {
  if (e.metaKey || e.ctrlKey) {
    // Cmd/Ctrl + click: toggle individual
    if (_selectedIds.has(studyId)) {
      _selectedIds.delete(studyId);
    } else {
      _selectedIds.add(studyId);
    }
    _lastClickedId = studyId;
  } else if (e.shiftKey && _lastClickedId) {
    // Shift + click: range select
    const lastIdx = orderedIds.indexOf(_lastClickedId);
    const thisIdx = orderedIds.indexOf(studyId);
    if (lastIdx >= 0 && thisIdx >= 0) {
      const start = Math.min(lastIdx, thisIdx);
      const end = Math.max(lastIdx, thisIdx);
      for (let i = start; i <= end; i++) {
        _selectedIds.add(orderedIds[i]!);
      }
    }
  } else {
    // Plain click: select only this one (or navigate if single-click behavior)
    _selectedIds = new Set([studyId]);
    _lastClickedId = studyId;
  }
}

export function clearSelection(): void {
  _selectedIds = new Set();
  _lastClickedId = null;
}

export function toggleSelectAll(orderedIds: string[]): void {
  if (_selectedIds.size === orderedIds.length) {
    clearSelection();
  } else {
    _selectedIds = new Set(orderedIds);
  }
}

export function isSelected(id: string): boolean {
  return _selectedIds.has(id);
}
```

**Deselect triggers:** clicking empty content area, pressing Escape, navigating to a different folder, or clicking Cancel in the selection toolbar. Add a global `keydown` listener:

```typescript
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && _selectedIds.size > 0) {
    clearSelection();
    redraw();
  }
});
```

---

## 6. View Modes

### 6.1 State

```typescript
type ViewMode = 'list' | 'grid' | 'headlines';

// Per-folder view mode stored on StudyFolder.viewMode
// Global default for "All Studies" / "Favorites" / "Unsorted": 'list'
let _globalViewMode: ViewMode = 'list';

function currentViewMode(): ViewMode {
  if (_activeFolder && _activeFolder !== 'all' && _activeFolder !== 'favorites' && _activeFolder !== 'unsorted') {
    const folder = getFolderById(_activeFolder);
    return folder?.viewMode ?? _globalViewMode;
  }
  return _globalViewMode;
}
```

### 6.2 View Mode Toggle

```typescript
function renderViewModeToggle(redraw: () => void): VNode {
  const mode = currentViewMode();
  return h('div.study-view-toggle', [
    h('button.study-view-toggle__btn', {
      class: { active: mode === 'list' },
      attrs: { title: 'List view' },
      on: { click: () => { setViewMode('list'); redraw(); } },
    }, '≡'),
    h('button.study-view-toggle__btn', {
      class: { active: mode === 'grid' },
      attrs: { title: 'Grid view' },
      on: { click: () => { setViewMode('grid'); redraw(); } },
    }, '▦'),
    h('button.study-view-toggle__btn', {
      class: { active: mode === 'headlines' },
      attrs: { title: 'Headlines view' },
      on: { click: () => { setViewMode('headlines'); redraw(); } },
    }, '═'),
  ]);
}
```

### 6.3 Grid View Rendering

```typescript
function renderGridView(items: StudyItem[], redraw: () => void): VNode {
  return h('div.study-grid', items.map(item =>
    h('div.study-grid__card', {
      key: item.id,
      class: { 'study-grid__card--selected': isSelected(item.id) },
      attrs: { draggable: 'true' },
      on: {
        click: (e: MouseEvent) => handleStudyClick(item.id, e, items.map(i => i.id)),
        dragstart: (e: DragEvent) => handleStudyDragStart(e, item.id),
      },
    }, [
      // Board thumbnail — static Chessground with viewOnly
      h('div.study-grid__board', {
        hook: {
          insert: (vn) => {
            // Render a tiny static Chessground board
            const el = vn.elm as HTMLElement;
            const startFen = extractStartFen(item.pgn);
            // Use Chessground in viewOnly mode
            import('@lichess-org/chessground').then(({ Chessground }) => {
              Chessground(el, {
                fen: startFen,
                viewOnly: true,
                coordinates: false,
                drawable: { enabled: false },
                animation: { enabled: false },
              });
            });
          },
        },
      }),
      h('div.study-grid__info', [
        h('div.study-grid__title', item.title),
        item.opening ? h('div.study-grid__opening', item.opening) : null,
        h('div.study-grid__date', formatDate(item.createdAt)),
      ]),
    ])
  ));
}
```

Grid CSS:
```scss
.study-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  padding: 12px;

  &__card {
    border: 1px solid var(--c-border);
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: box-shadow 150ms ease, transform 100ms ease;

    &:hover {
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transform: translateY(-1px);
    }

    &--selected {
      outline: 2px solid var(--c-accent);
      outline-offset: -2px;
    }
  }

  &__board {
    width: 100%;
    aspect-ratio: 1;
    // Chessground will fill this container
    cg-wrap { width: 100%; height: 100%; }
  }

  &__info {
    padding: 8px 10px;
  }

  &__title {
    font-weight: 500;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__opening {
    font-size: 11px;
    color: var(--c-text-muted);
    margin-top: 2px;
  }

  &__date {
    font-size: 11px;
    color: var(--c-text-muted);
    margin-top: 2px;
  }
}
```

### 6.4 Headlines View Rendering

```typescript
function renderHeadlinesView(items: StudyItem[], redraw: () => void): VNode {
  return h('div.study-headlines', items.map(item =>
    h('div.study-headline', {
      key: item.id,
      class: { 'study-headline--selected': isSelected(item.id) },
      on: {
        click: (e: MouseEvent) => handleStudyClick(item.id, e, items.map(i => i.id)),
      },
    }, [
      item.favorite ? h('span.study-headline__fav', '★') : null,
      h('a.study-headline__title', {
        attrs: { href: `#/study/${item.id}` },
      }, item.title),
      practiceLoaded() && dueCountForStudy(item.id) > 0
        ? h('span.study-headline__due', `${dueCountForStudy(item.id)}`)
        : null,
      item.tags.length > 0
        ? h('span.study-headline__tag-count', `${item.tags.length} tags`)
        : null,
    ])
  ));
}
```

Headlines CSS:
```scss
.study-headlines {
  padding: 4px 8px;
}

.study-headline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  font-size: 13px;
  border-radius: 3px;
  cursor: pointer;
  line-height: 1.4;

  &:hover { background: var(--c-bg-hover); }
  &--selected { background: var(--c-bg-active); }

  &__fav { color: var(--c-gold); font-size: 11px; }
  &__title { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  &__due { font-size: 11px; color: var(--c-accent); font-weight: 500; }
  &__tag-count { font-size: 11px; color: var(--c-text-muted); }
}
```

---

## 7. Tag System

### 7.1 Tag Autocomplete Input

```typescript
let _tagAutocomplete: { studyId: string; value: string; suggestions: string[] } | null = null;

function renderTagInput(studyId: string, redraw: () => void): VNode {
  const state = _tagAutocomplete;
  if (!state || state.studyId !== studyId) return h('span');
  
  const matching = allTags().filter(t =>
    t.toLowerCase().includes(state.value.toLowerCase()) && !getStudyById(studyId)?.tags.includes(t)
  );
  
  return h('div.study-tag-autocomplete', [
    h('input.study-tag-autocomplete__input', {
      props: { value: state.value },
      attrs: { placeholder: 'Add tag…' },
      hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
      on: {
        input: (e: Event) => {
          state.value = (e.target as HTMLInputElement).value;
          state.suggestions = matching;
          redraw();
        },
        keydown: (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            const tag = state.value.trim();
            if (tag) addTagToStudy(studyId, tag);
            _tagAutocomplete = null;
            redraw();
          }
          if (e.key === 'Escape') { _tagAutocomplete = null; redraw(); }
        },
        blur: () => { _tagAutocomplete = null; redraw(); },
      },
    }),
    matching.length > 0 ? h('div.study-tag-autocomplete__dropdown',
      matching.slice(0, 8).map(tag =>
        h('div.study-tag-autocomplete__option', {
          on: { mousedown: (e: Event) => {
            e.preventDefault(); // prevent blur before click registers
            addTagToStudy(studyId, tag);
            _tagAutocomplete = null;
            redraw();
          }},
        }, tag)
      )
    ) : null,
  ]);
}
```

**Important:** Use `mousedown` (not `click`) on dropdown options, with `e.preventDefault()`, so the input's `blur` doesn't fire before the selection registers. This is a common Snabbdom/VanillaJS autocomplete gotcha.

---

## 8. Search Implementation

### 8.1 Search Index

Build a lightweight search index on library load. The index is a `Map<studyId, searchableText>` where `searchableText` is a concatenation of all searchable fields, lowercased.

```typescript
let _searchIndex: Map<string, string> = new Map();

function buildSearchIndex(studies: StudyItem[]): void {
  _searchIndex = new Map();
  for (const s of studies) {
    const parts: string[] = [
      s.title,
      s.notes ?? '',
      s.tags.join(' '),
      s.white ?? '',
      s.black ?? '',
      s.opening ?? '',
      s.eco ?? '',
      extractPgnComments(s.pgn),  // extract all { } comment blocks from PGN
    ];
    _searchIndex.set(s.id, parts.join(' ').toLowerCase());
  }
}

function extractPgnComments(pgn: string): string {
  // Quick regex extraction of all curly-brace comments
  const matches = pgn.match(/\{[^}]*\}/g);
  if (!matches) return '';
  return matches.map(m => m.slice(1, -1).replace(/\[%[^\]]*\]/g, '').trim()).join(' ');
}

function searchStudies(query: string, studies: StudyItem[]): StudyItem[] {
  if (!query.trim()) return studies;
  const q = query.toLowerCase();
  return studies.filter(s => {
    const text = _searchIndex.get(s.id);
    return text ? text.includes(q) : false;
  });
}
```

### 8.2 Rebuild Index on Changes

Call `buildSearchIndex()` after:
- Initial library load (`initStudyLibrary`)
- Study save/update/delete
- PGN import

---

## 9. Folder Context Menu

Reuse the context menu pattern from `src/main.ts`:

```typescript
let _folderCtxMenu: { folderId: string; x: number; y: number } | null = null;

function showFolderContextMenu(e: MouseEvent, folder: StudyFolder, redraw: () => void): void {
  e.preventDefault();
  _folderCtxMenu = { folderId: folder.id, x: e.clientX, y: e.clientY };
  redraw();
}

function renderFolderContextMenu(redraw: () => void): VNode | null {
  if (!_folderCtxMenu) return null;
  const { folderId, x, y } = _folderCtxMenu;
  const folder = getFolderById(folderId);
  if (!folder) return null;
  
  const close = () => { _folderCtxMenu = null; redraw(); };
  
  return h('div.context-menu', {
    style: { position: 'fixed', left: `${x}px`, top: `${y}px`, zIndex: '200' },
    hook: {
      insert: () => {
        // Close on click outside
        const handler = () => { close(); document.removeEventListener('click', handler); };
        setTimeout(() => document.addEventListener('click', handler), 0);
      },
    },
  }, [
    h('div.context-action', { on: { click: () => { startNewSubfolder(folderId); close(); } } }, 'New Subfolder'),
    h('div.context-action', { on: { click: () => { startRenameFolder(folderId); close(); } } }, 'Rename'),
    h('div.context-action', { on: { click: () => { showFolderIconPicker(folderId, redraw); close(); } } }, 'Change Icon'),
    h('div.context-action.context-action--danger', {
      on: { click: () => {
        if (confirm(`Delete "${folder.name}"? Studies will be moved to Unsorted.`)) {
          deleteFolder(folderId);
        }
        close();
      }},
    }, 'Delete Folder'),
  ]);
}
```

---

## 10. IDB Schema for Folders

Add to the `patzer-pro` IDB upgrade handler (next version bump):

```typescript
if (!db.objectStoreNames.contains('study-folders')) {
  const store = db.createObjectStore('study-folders', { keyPath: 'id' });
  store.createIndex('parentId', 'parentId', { unique: false });
  store.createIndex('order', 'order', { unique: false });
}
```

The `StudyFolder` type (from Phase 9 sprint doc):

```typescript
interface StudyFolder {
  id: string;
  name: string;
  parentId: string | null;
  order: number;
  icon?: string;
  color?: string;
  expanded: boolean;
  viewMode?: ViewMode;
  createdAt: number;
  updatedAt: number;
}
```

Add `folderIds: string[]` to `StudyItem` alongside the existing `folders: string[]`. Migration: on first load after upgrade, copy `folders` string values into new `StudyFolder` records and populate `folderIds` with the generated IDs.

---

## 11. Performance Considerations

### 11.1 Large Libraries (100+ studies)

- **Don't render all studies at once.** Use windowed rendering or "render first 50, load more on scroll" pattern.
- **Grid view with board thumbnails is expensive.** Each Chessground instance creates DOM. For 50+ cards, use lazy rendering: only create Chessground when the card scrolls into view (IntersectionObserver).
- **Search index rebuild** should only happen on mutations, not on every render.

### 11.2 Sidebar with Many Folders

- The flat-list rendering approach handles 100+ folders without performance issues.
- Collapse state ensures deeply nested trees don't render all children.

### 11.3 Drag-and-Drop Performance

- Don't update IDB during drag — only on drop.
- Batch multiple study moves into a single IDB transaction.

---

## 12. Edge Cases

1. **Drag a folder onto itself or its own descendant:** Detect and prevent (would create a cycle).
2. **Delete a folder containing the only copy of studies:** Studies become Unsorted (never deleted with the folder).
3. **Study in multiple folders, one folder deleted:** Study remains in other folders; only the deleted folder's reference is removed from `folderIds`.
4. **Empty search results:** Show "No studies matching '[query]'" with a clear-search link.
5. **Sidebar + drill mode:** When a drill session is active, the sidebar should remain accessible (user might want to end the drill and browse).
6. **Very long folder names:** Truncate with ellipsis in the sidebar. Full name on hover tooltip.
7. **Mobile sidebar + drag-and-drop:** Drag-and-drop is desktop-only in Phase 9. Mobile users use the "Move to Folder" action in the bulk toolbar or the study row's expand section.

---

## 13. Implementation Order

Recommended task sequence within Phase 9:

1. **9.1: Folder data model** — types + IDB store + CRUD (no UI)
2. **9.2: Sidebar shell** — two-panel layout + fixed nav sections + folder rendering
3. **9.3: Folder CRUD** — create/rename/delete with inline editing and context menu
4. **9.10: Responsive sidebar** — collapse/overlay behavior (do this early so all subsequent work respects breakpoints)
5. **9.9: Favorites quick access** — wire the sidebar Favorites section
6. **9.7: Tag system** — autocomplete, sidebar tag section, bulk tagging
7. **9.4: Drag-and-drop** — studies → folders, folder reorder/nest
8. **9.5: Multi-select** — selection state + toolbar transformation + bulk actions
9. **9.6: View modes** — list/grid/headlines with per-folder memory
10. **9.8: Search** — index, scoped search, result highlighting

This order builds from data model → layout → core interactions → advanced features, with each step standing on the previous.

---

*End of reference document*
