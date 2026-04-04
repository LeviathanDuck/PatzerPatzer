// Study Library browser view — renders the full library at #/study.
// Adapted from lichess-org/lila: ui/study/src/studyList.ts rendering patterns.
// Phase 2 Task 2.2 (CCP-529): replace Phase 0 placeholder with real list view.

import { h, type VNode } from 'snabbdom';
import {
  studies, allStudies, isLoaded,
  sortKey, sortDir, filterFav, filterTag, filterSrc, searchQuery,
  setSortKey, setSortDir, setFilterFav, setFilterTag, setFilterSrc, setSearch,
  studyTags, studyFolders, updateStudy, deleteStudy, importPgnToLibrary,
  practiceLoaded, dueCount, dueCountForStudy,
  reviewSequences, learnSequences, loadPracticeData,
  hasMore, isLoadingMore, loadNextPage,
  folders, foldersLoaded, activeFolderName, sidebarCollapsed,
  setActiveFolderName, toggleSidebar, loadFolders,
  createFolder, renameFolder, removeFolderEntity, moveStudyToFolder,
  selectedIds, isSelected, selectionCount, clearSelection,
  handleStudyClick, bulkDeleteStudies, bulkAddToFolder, bulkSetFavorite,
  viewMode, setViewMode,
  seedSampleStudies, isSeeding,
  type StudySortKey,
} from './studyCtrl';
import { isDrillActive, isDrillSummary, initDrillView, renderDrillView, endDrill } from './practice/drillView';
import { Chessground as makeChessground } from '@lichess-org/chessground';
import type { StudyItem } from './types';

// --- Source label helpers ---

const SOURCE_LABELS: Record<string, string> = {
  analysis: 'Analysis',
  openings: 'Openings',
  puzzles:  'Puzzles',
  manual:   'Manual',
  import:   'Import',
};

function sourceLabel(source: string): string {
  return SOURCE_LABELS[source] ?? source;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// --- Inline edit state (ephemeral — module-level since only one edit can be active) ---
let _editingTitleId: string | null = null;
let _editingTitleValue = '';
let _editingTagId: string | null = null;
let _editingTagValue = '';
let _editingFolderId: string | null = null;
let _editingFolderValue = '';
// Expanded rows (show notes + folder editor)
const _expandedRows = new Set<string>();
// Import modal state
let _showImportModal = false;
let _importPgnText   = '';
let _importStatus: string | null = null;

// --- Row rendering ---

function renderStudyRow(item: StudyItem, idx: number, redraw: () => void): VNode {
  const isEditingTitle = _editingTitleId === item.id;
  const isEditingTag   = _editingTagId === item.id;
  const selected       = isSelected(item.id);

  return h('div.study-row', {
    key: item.id,
    class: { 'study-row--selected': selected },
    attrs: { draggable: 'true' },
    on: {
      click: (e: MouseEvent) => {
        // Only trigger selection if clicking on row background (not on child buttons/inputs)
        const target = e.target as HTMLElement;
        if (target.closest('button, a, input, textarea')) return;
        handleStudyClick(item.id, idx, e);
        redraw();
      },
      dragstart: (e: DragEvent) => {
        _draggingStudyId = item.id;
        if (e.dataTransfer) {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', item.id);
        }
      },
      dragend: () => { _draggingStudyId = null; _dragOverFolderName = null; redraw(); },
    },
  }, [
    // Selection checkbox
    h('input.study-row__checkbox', {
      attrs: { type: 'checkbox', checked: selected },
      on: { click: (e: Event) => {
        e.stopPropagation();
        handleStudyClick(item.id, idx, e as unknown as MouseEvent);
        redraw();
      } },
    }),
    // Favorite star
    h('button.study-row__fav', {
      class: { active: item.favorite },
      attrs: { title: item.favorite ? 'Remove from favorites' : 'Add to favorites' },
      on: { click: (e: Event) => {
        e.stopPropagation();
        void updateStudy({ id: item.id, favorite: !item.favorite }).then(redraw);
      } },
    }, item.favorite ? '★' : '☆'),

    // Main content area
    h('div.study-row__main', {}, [
      // Title row: inline editable title + open-study link + expand toggle
      h('div.study-row__title-row', [
        isEditingTitle
          ? h('input.study-row__title-input', {
              attrs: { value: _editingTitleValue, placeholder: 'Study title' },
              hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
              on: {
                input:   (e: Event) => { _editingTitleValue = (e.target as HTMLInputElement).value; },
                blur:    () => {
                  void updateStudy({ id: item.id, title: _editingTitleValue.trim() || item.title }).then(redraw);
                  _editingTitleId    = null;
                  _editingTitleValue = '';
                },
                keydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { _editingTitleId = null; redraw(); }
                },
              },
            })
          : h('span.study-row__title', {
              attrs: { title: 'Click to rename' },
              on: { click: () => {
                _editingTitleId    = item.id;
                _editingTitleValue = item.title;
                redraw();
              } },
            }, item.title),
        h('a.study-row__open', {
          attrs: { href: `#/study/${item.id}`, title: 'Open study' },
          on: { click: (e: Event) => e.stopPropagation() },
        }, '→'),
        h('button.study-row__expand', {
          attrs: { title: _expandedRows.has(item.id) ? 'Collapse' : 'Expand details' },
          on: { click: () => {
            if (_expandedRows.has(item.id)) _expandedRows.delete(item.id);
            else _expandedRows.add(item.id);
            redraw();
          } },
        }, _expandedRows.has(item.id) ? '▲' : '▼'),
      ]),

      // Meta row: source · date · due indicator
      h('div.study-row__meta', [
        h('span.study-row__source', sourceLabel(item.source)),
        h('span.study-row__sep', '·'),
        h('span.study-row__date', formatDate(item.createdAt)),
        ...(practiceLoaded() && dueCountForStudy(item.id) > 0
          ? [h('span.study-row__sep', '·'), h('span.study-row__due', `${dueCountForStudy(item.id)} due`)]
          : []),
        item.white && item.black ? h('span.study-row__players', [
          h('span.study-row__sep', '·'),
          `${item.white} vs ${item.black}`,
        ]) : null,
      ]),

      // Tags
      h('div.study-row__tags', [
        ...item.tags.map(tag =>
          h('span.study-tag', { key: tag }, [
            tag,
            h('button.study-tag__remove', {
              attrs: { title: `Remove tag "${tag}"` },
              on: { click: (e: Event) => {
                e.stopPropagation();
                void updateStudy({ id: item.id, tags: item.tags.filter(t => t !== tag) }).then(redraw);
              } },
            }, '×'),
          ])
        ),
        // Tag input toggle
        isEditingTag
          ? h('input.study-tag__input', {
              attrs: { placeholder: 'Add tag…', value: _editingTagValue },
              hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
              on: {
                input:   (e: Event) => { _editingTagValue = (e.target as HTMLInputElement).value; },
                blur:    () => {
                  const tag = _editingTagValue.trim();
                  if (tag && !item.tags.includes(tag)) {
                    void updateStudy({ id: item.id, tags: [...item.tags, tag] }).then(redraw);
                  }
                  _editingTagId    = null;
                  _editingTagValue = '';
                },
                keydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') { _editingTagId = null; redraw(); }
                },
              },
            })
          : h('button.study-tag__add', {
              attrs: { title: 'Add tag' },
              on: { click: () => {
                _editingTagId    = item.id;
                _editingTagValue = '';
                redraw();
              } },
            }, '+'),
      ]),

      // Expanded section: notes + folder
      _expandedRows.has(item.id) ? h('div.study-row__expanded', [
        // Notes textarea
        h('label.study-row__notes-label', 'Notes'),
        h('textarea.study-row__notes', {
          attrs: { placeholder: 'Add notes…', rows: 3 },
          props: { value: item.notes ?? '' },
          on: { blur: (e: Event) => {
            void updateStudy({ id: item.id, notes: (e.target as HTMLTextAreaElement).value });
          } },
        }),

        // Folder
        h('div.study-row__folder-row', [
          h('label.study-row__folder-label', 'Folder'),
          item.folders.length > 0
            ? h('div.study-row__folder-list', item.folders.map(f =>
                h('span.study-folder', [
                  f,
                  h('button.study-folder__remove', {
                    attrs: { title: `Remove folder "${f}"` },
                    on: { click: () => {
                      void updateStudy({ id: item.id, folders: item.folders.filter(x => x !== f) }).then(redraw);
                    } },
                  }, '×'),
                ])
              ))
            : null,
          _editingFolderId === item.id
            ? h('input.study-folder__input', {
                attrs: { placeholder: 'Folder name…', value: _editingFolderValue },
                hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
                on: {
                  input: (e: Event) => { _editingFolderValue = (e.target as HTMLInputElement).value; },
                  blur: () => {
                    const f = _editingFolderValue.trim();
                    if (f && !item.folders.includes(f)) {
                      void updateStudy({ id: item.id, folders: [...item.folders, f] }).then(redraw);
                    }
                    _editingFolderId    = null;
                    _editingFolderValue = '';
                  },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { _editingFolderId = null; redraw(); }
                  },
                },
              })
            : h('button.study-tag__add', {
                attrs: { title: 'Add to folder' },
                on: { click: () => { _editingFolderId = item.id; _editingFolderValue = ''; redraw(); } },
              }, '+ folder'),
        ]),
      ]) : null,
    ]),

    // Delete button
    h('button.study-row__delete', {
      attrs: { title: 'Delete study' },
      on: { click: (e: Event) => {
        e.stopPropagation();
        if (confirm(`Delete "${item.title}"?`)) {
          void deleteStudy(item.id).then(redraw);
        }
      } },
    }, '×'),
  ]);
}

// --- Folder sidebar state (ephemeral) ---
let _newFolderMode  = false;
let _newFolderValue = '';
let _renamingFolderId: string | null = null;
let _renamingFolderValue = '';

// --- Drag-and-drop state ---
let _draggingStudyId: string | null   = null;
let _dragOverFolderName: string | null = null;

// DnD drop handlers for a folder drop target identified by name.
function folderDropHandlers(folderName: string, redraw: () => void) {
  return {
    dragover: (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      if (_dragOverFolderName !== folderName) { _dragOverFolderName = folderName; redraw(); }
    },
    dragleave: () => {
      if (_dragOverFolderName === folderName) { _dragOverFolderName = null; redraw(); }
    },
    drop: (e: DragEvent) => {
      e.preventDefault();
      const studyId = e.dataTransfer?.getData('text/plain') ?? _draggingStudyId;
      _dragOverFolderName = null;
      if (studyId) void moveStudyToFolder(studyId, folderName).then(redraw);
    },
  };
}

// --- Folder sidebar ---

function renderFolderSidebar(redraw: () => void): VNode {
  // Merge IDB-persisted folders with inline folder names from studies (backward compat).
  const persistedNames = new Set(folders().map(f => f.name));
  const inlineNames    = studyFolders().filter(n => !persistedNames.has(n));
  // All known folder names in display order: persisted (sorted by name) + orphaned inline names
  const allNames: string[] = [
    ...folders().map(f => f.name).sort(),
    ...inlineNames.sort(),
  ];

  return h('div.study-sidebar', [
    h('div.study-sidebar__header', [
      h('span.study-sidebar__title', 'Folders'),
      h('button.study-sidebar__toggle', {
        attrs: { title: sidebarCollapsed() ? 'Expand sidebar' : 'Collapse sidebar' },
        on: { click: () => { toggleSidebar(); redraw(); } },
      }, sidebarCollapsed() ? '›' : '‹'),
    ]),
    sidebarCollapsed() ? null : h('div.study-sidebar__folders', [
      h('button.study-sidebar__folder', {
        class: { active: activeFolderName() === null },
        on: { click: () => { setActiveFolderName(null); redraw(); } },
      }, 'All Studies'),

      // Persisted folder entries (with rename + delete controls)
      ...folders().map(folder => {
        const isRenaming = _renamingFolderId === folder.id;
        return h('div.study-sidebar__folder-row', { key: folder.id }, [
          isRenaming
            ? h('input.study-sidebar__folder-rename', {
                attrs: { value: _renamingFolderValue },
                hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
                on: {
                  input: (e: Event) => { _renamingFolderValue = (e.target as HTMLInputElement).value; },
                  blur: () => {
                    if (_renamingFolderValue.trim()) {
                      void renameFolder(folder.id, _renamingFolderValue).then(redraw);
                    }
                    _renamingFolderId = null;
                    redraw();
                  },
                  keydown: (e: KeyboardEvent) => {
                    if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    if (e.key === 'Escape') { _renamingFolderId = null; redraw(); }
                  },
                },
              })
            : h('button.study-sidebar__folder', {
                class: {
                  active:       activeFolderName() === folder.name,
                  'drag-over':  _dragOverFolderName === folder.name,
                },
                on: {
                  click: () => { setActiveFolderName(activeFolderName() === folder.name ? null : folder.name); redraw(); },
                  ...folderDropHandlers(folder.name, redraw),
                },
              }, folder.name),
          h('div.study-sidebar__folder-actions', [
            h('button.study-sidebar__folder-action', {
              attrs: { title: 'Rename folder' },
              on: { click: (e: Event) => {
                e.stopPropagation();
                _renamingFolderId    = folder.id;
                _renamingFolderValue = folder.name;
                redraw();
              } },
            }, '✎'),
            h('button.study-sidebar__folder-action.study-sidebar__folder-action--danger', {
              attrs: { title: 'Delete folder' },
              on: { click: (e: Event) => {
                e.stopPropagation();
                if (confirm(`Delete folder "${folder.name}"? Studies will not be deleted.`)) {
                  void removeFolderEntity(folder.id).then(redraw);
                }
              } },
            }, '×'),
          ]),
        ]);
      }),

      // Orphaned inline folder names (in studies but no entity)
      ...inlineNames.map(name =>
        h('button.study-sidebar__folder', {
          key: `inline-${name}`,
          class: { active: activeFolderName() === name, 'drag-over': _dragOverFolderName === name },
          on: {
            click: () => { setActiveFolderName(activeFolderName() === name ? null : name); redraw(); },
            ...folderDropHandlers(name, redraw),
          },
        }, name)
      ),

      // New folder input or button
      _newFolderMode
        ? h('input.study-sidebar__new-folder', {
            attrs: { placeholder: 'Folder name…', value: _newFolderValue },
            hook: { insert: (vn) => (vn.elm as HTMLInputElement).focus() },
            on: {
              input:   (e: Event) => { _newFolderValue = (e.target as HTMLInputElement).value; },
              blur:    () => {
                if (_newFolderValue.trim()) {
                  void createFolder(_newFolderValue).then(redraw);
                }
                _newFolderMode  = false;
                _newFolderValue = '';
                redraw();
              },
              keydown: (e: KeyboardEvent) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') { _newFolderMode = false; redraw(); }
              },
            },
          })
        : h('button.study-sidebar__new-folder-btn', {
            on: { click: () => { _newFolderMode = true; _newFolderValue = ''; redraw(); } },
          }, '+ New Folder'),
    ]),
  ]);
}

// --- Filter bar ---

function renderFilterBar(redraw: () => void): VNode {
  const tags = studyTags();
  const sources = ['analysis', 'openings', 'puzzles', 'manual', 'import'];

  return h('div.study-filter-bar', [
    // Search
    h('input.study-filter-bar__search', {
      attrs: { placeholder: 'Search studies…', value: searchQuery() },
      on: { input: (e: Event) => { setSearch((e.target as HTMLInputElement).value); redraw(); } },
    }),

    // Favorite filter
    h('button.study-filter-btn', {
      class: { active: filterFav() },
      on: { click: () => { setFilterFav(!filterFav()); redraw(); } },
    }, '★ Favorites'),

    // Source filter pills
    ...sources.map(src =>
      h('button.study-filter-btn', {
        class: { active: filterSrc() === src },
        on: { click: () => { setFilterSrc(filterSrc() === src ? null : src); redraw(); } },
      }, sourceLabel(src))
    ),

    // Tag filter pills
    ...tags.map(tag =>
      h('button.study-filter-btn', {
        class: { active: filterTag() === tag },
        on: { click: () => { setFilterTag(filterTag() === tag ? null : tag); redraw(); } },
      }, tag)
    ),
  ]);
}

// --- Grid view ---

const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function extractFenFromPgn(pgn: string): string {
  const m = pgn.match(/\[FEN\s+"([^"]+)"\]/i);
  return m ? m[1]! : STARTING_FEN;
}

function renderStudyCard(item: StudyItem, idx: number, redraw: () => void): VNode {
  const selected = isSelected(item.id);
  const fen      = extractFenFromPgn(item.pgn);

  return h('div.study-card', {
    key: item.id,
    class: { 'study-card--selected': selected },
    on: {
      click: (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.closest('button, a')) return;
        handleStudyClick(item.id, idx, e);
        redraw();
      },
    },
  }, [
    // Mini board thumbnail via Chessground static mount
    h('div.study-card__board', {
      hook: {
        insert: (vn) => {
          const el = vn.elm as HTMLElement;
          makeChessground(el, {
            fen,
            viewOnly:    true,
            coordinates: false,
            animation:   { enabled: false },
            highlight:   { lastMove: false, check: false },
            movable:     { free: false },
            draggable:   { enabled: false },
            selectable:  { enabled: false },
          });
        },
      },
    }),
    h('div.study-card__body', [
      h('a.study-card__title', {
        attrs: { href: `#/study/${item.id}` },
        on:    { click: (e: Event) => e.stopPropagation() },
      }, item.title),
      h('div.study-card__meta', [
        h('span', sourceLabel(item.source)),
        h('span.study-card__sep', '·'),
        h('span', formatDate(item.createdAt)),
      ]),
      item.favorite ? h('span.study-card__fav', '★') : null,
    ]),
  ]);
}

// --- Bulk action bar ---

// State: bulk folder assignment dropdown
let _bulkFolderMenuOpen = false;

function renderBulkActionBar(redraw: () => void): VNode | null {
  const count = selectionCount();
  if (count === 0) return null;

  const allFolderNames = [
    ...folders().map(f => f.name),
    ...studyFolders().filter(n => !folders().some(f => f.name === n)),
  ].sort();

  return h('div.study-bulk-bar', [
    h('span.study-bulk-bar__count', `${count} selected`),
    h('button.study-bulk-bar__btn', {
      on: { click: () => {
        void bulkSetFavorite(true).then(redraw);
      } },
    }, '★ Favorite'),
    h('button.study-bulk-bar__btn', {
      on: { click: () => {
        void bulkSetFavorite(false).then(redraw);
      } },
    }, '☆ Unfavorite'),
    allFolderNames.length > 0
      ? h('div.study-bulk-bar__folder-wrap', [
          h('button.study-bulk-bar__btn', {
            on: { click: () => { _bulkFolderMenuOpen = !_bulkFolderMenuOpen; redraw(); } },
          }, 'Add to folder ▾'),
          _bulkFolderMenuOpen ? h('div.study-bulk-bar__folder-menu', allFolderNames.map(name =>
            h('button.study-bulk-bar__folder-item', {
              on: { click: () => {
                _bulkFolderMenuOpen = false;
                void bulkAddToFolder(name).then(redraw);
              } },
            }, name)
          )) : null,
        ])
      : null,
    h('button.study-bulk-bar__btn.study-bulk-bar__btn--danger', {
      on: { click: () => {
        if (confirm(`Delete ${count} selected stud${count === 1 ? 'y' : 'ies'}?`)) {
          void bulkDeleteStudies().then(redraw);
        }
      } },
    }, 'Delete'),
    h('button.study-bulk-bar__btn', {
      on: { click: () => { clearSelection(); redraw(); } },
    }, 'Clear'),
  ]);
}

// --- Sort controls ---

function renderSortControls(redraw: () => void): VNode {
  const sortOptions: { label: string; key: StudySortKey }[] = [
    { label: 'Date saved', key: 'createdAt' },
    { label: 'Last modified', key: 'updatedAt' },
    { label: 'Title', key: 'title' },
  ];
  return h('div.study-sort-bar', [
    h('span.study-sort-bar__label', 'Sort:'),
    ...sortOptions.map(({ label, key }) =>
      h('button.study-sort-btn', {
        class: { active: sortKey() === key },
        on: { click: () => {
          if (sortKey() === key) {
            setSortDir(sortDir() === 'desc' ? 'asc' : 'desc');
          } else {
            setSortKey(key);
            setSortDir('desc');
          }
          redraw();
        } },
      }, [
        label,
        sortKey() === key ? h('span.study-sort-btn__dir', sortDir() === 'desc' ? ' ↓' : ' ↑') : null,
      ])
    ),
  ]);
}

// --- Import PGN modal ---

function renderImportModal(redraw: () => void): VNode {
  const close = () => { _showImportModal = false; _importStatus = null; redraw(); };

  const doImport = () => {
    const text = _importPgnText.trim();
    if (!text) { _importStatus = 'Paste a PGN first.'; redraw(); return; }
    _importStatus = 'Importing…';
    redraw();
    void importPgnToLibrary(text).then(count => {
      _importStatus = count > 0 ? `Imported ${count} game${count !== 1 ? 's' : ''}.` : 'No games found in PGN.';
      if (count > 0) _importPgnText = '';
      redraw();
    });
  };

  return h('div.study-modal-backdrop', { on: { click: close } }, [
    h('div.study-modal', { on: { click: (e: Event) => e.stopPropagation() } }, [
      h('div.study-modal__header', [
        h('h2', 'Import PGN'),
        h('button.study-modal__close', { on: { click: close } }, '×'),
      ]),
      h('textarea.study-modal__pgn', {
        attrs: { placeholder: 'Paste PGN here (single or multi-game)…', rows: 10 },
        props: { value: _importPgnText },
        on: { input: (e: Event) => { _importPgnText = (e.target as HTMLTextAreaElement).value; } },
      }),
      h('div.study-modal__file-row', [
        h('label.study-modal__file-label', [
          'Or upload a .pgn file: ',
          h('input', {
            attrs: { type: 'file', accept: '.pgn,text/plain' },
            on: { change: (e: Event) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (!file) return;
              file.text().then(text => { _importPgnText = text; redraw(); });
            } },
          }),
        ]),
      ]),
      _importStatus ? h('div.study-modal__status', _importStatus) : null,
      h('div.study-modal__actions', [
        h('button.study-btn.study-btn--import', { on: { click: doImport } }, 'Import'),
        h('button.study-btn', { on: { click: close } }, 'Cancel'),
      ]),
    ]),
  ]);
}

// --- Main library view ---

export function renderStudyLibrary(redraw: () => void): VNode {
  if (!isLoaded()) {
    return h('div.study-page', h('div.study-page__loading', 'Loading…'));
  }

  // Lazy-load practice data if not yet loaded.
  if (!practiceLoaded()) loadPracticeData(redraw);

  // Drill mode active: render drill view over the library (CCP-555).
  if (isDrillActive() || isDrillSummary()) {
    return h('div.study-page', [
      h('div.study-page__header', [
        h('h1', 'Study Library'),
        h('button.study-btn', {
          on: { click: () => { endDrill(); redraw(); } },
        }, '← Back to Library'),
      ]),
      renderDrillView(redraw),
    ]);
  }

  // Lazy-load folder data if not yet loaded.
  if (!foldersLoaded()) loadFolders(redraw);

  const items = studies();

  return h('div.study-page', [
    h('div.study-page__header', [
      h('h1', 'Study Library'),
      h('div.study-page__header-actions', [
        // View mode toggle
        h('div.study-view-toggle', [
          h('button.study-view-toggle__btn', {
            class: { active: viewMode() === 'list' },
            attrs: { title: 'List view' },
            on: { click: () => { setViewMode('list'); redraw(); } },
          }, '☰'),
          h('button.study-view-toggle__btn', {
            class: { active: viewMode() === 'grid' },
            attrs: { title: 'Grid view' },
            on: { click: () => { setViewMode('grid'); redraw(); } },
          }, '⊞'),
        ]),
        h('button.study-btn.study-btn--import', {
          on: { click: () => { _showImportModal = true; _importPgnText = ''; _importStatus = null; redraw(); } },
        }, 'Import PGN'),
      ]),
    ]),

    // Practice dashboard banner (CCP-555).
    practiceLoaded() ? renderPracticeDashboard(redraw) : null,

    // Two-column layout: folder sidebar + main content area
    h('div.study-library-layout', [
      renderFolderSidebar(redraw),

      h('div.study-library-main', [
        renderFilterBar(redraw),
        renderSortControls(redraw),
        renderBulkActionBar(redraw),

        items.length === 0
          ? h('div.study-page__empty', [
              h('p', 'No studies yet.'),
              h('p', 'Right-click any move on the analysis board to save it here.'),
              allStudies().length === 0
                ? isSeeding()
                  ? h('p.study-page__seeding', 'Seeding sample studies…')
                  : h('button.study-btn.study-btn--seed', {
                      on: { click: () => { void seedSampleStudies(redraw); } },
                    }, 'Seed sample studies')
                : null,
            ])
          : viewMode() === 'grid'
            ? h('div.study-grid', items.map((item, idx) => renderStudyCard(item, idx, redraw)))
            : h('div.study-list', items.map((item, idx) => renderStudyRow(item, idx, redraw))),

        // Pagination: Load more button (hidden when no more pages available)
        hasMore()
          ? h('div.study-list__load-more', [
              isLoadingMore()
                ? h('span.study-list__loading', 'Loading…')
                : h('button.study-btn.study-btn--load-more', {
                    on: { click: () => { loadNextPage(redraw); } },
                  }, 'Load more'),
            ])
          : null,
      ]),
    ]),

    _showImportModal ? renderImportModal(redraw) : null,
  ]);
}

function renderPracticeDashboard(redraw: () => void): VNode | null {
  const due    = dueCount();
  const review = reviewSequences();
  const learn  = learnSequences();
  if (due === 0 && learn.length === 0) return null;

  return h('div.study-practice-dashboard', [
    due > 0
      ? h('div.study-practice-banner', [
          h('span.study-practice-banner__text', `${due} position${due === 1 ? '' : 's'} due for review`),
          h('button.study-btn.study-btn--review', {
            on: { click: () => {
              if (review.length === 0) return;
              initDrillView(review, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white', redraw);
              redraw();
            }},
          }, 'Start Review'),
        ])
      : null,
    learn.length > 0
      ? h('div.study-practice-learn', [
          h('span.study-practice-learn__label', `${learn.length} new line${learn.length === 1 ? '' : 's'} to learn`),
          h('button.study-btn', {
            on: { click: () => {
              initDrillView(learn, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'white', redraw);
              redraw();
            }},
          }, 'Learn Now'),
        ])
      : null,
  ]);
}

