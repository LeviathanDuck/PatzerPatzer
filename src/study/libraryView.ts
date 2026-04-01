// Study Library browser view — renders the full library at #/study.
// Adapted from lichess-org/lila: ui/study/src/studyList.ts rendering patterns.
// Phase 2 Task 2.2 (CCP-529): replace Phase 0 placeholder with real list view.

import { h, type VNode } from 'snabbdom';
import {
  studies, isLoaded,
  sortKey, sortDir, filterFav, filterTag, filterSrc, searchQuery,
  setSortKey, setSortDir, setFilterFav, setFilterTag, setFilterSrc, setSearch,
  studyTags, updateStudy, deleteStudy, importPgnToLibrary,
  practiceLoaded, dueCount, dueCountForStudy,
  reviewSequences, learnSequences, loadPracticeData,
  type StudySortKey,
} from './studyCtrl';
import { isDrillActive, isDrillSummary, initDrillView, renderDrillView, endDrill } from './practice/drillView';
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

function renderStudyRow(item: StudyItem, redraw: () => void): VNode {
  const isEditingTitle = _editingTitleId === item.id;
  const isEditingTag   = _editingTagId === item.id;

  return h('div.study-row', { key: item.id }, [
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

  const items = studies();

  return h('div.study-page', [
    h('div.study-page__header', [
      h('h1', 'Study Library'),
      h('div.study-page__header-actions', [
        h('button.study-btn.study-btn--import', {
          on: { click: () => { _showImportModal = true; _importPgnText = ''; _importStatus = null; redraw(); } },
        }, 'Import PGN'),
      ]),
    ]),

    // Practice dashboard banner (CCP-555).
    practiceLoaded() ? renderPracticeDashboard(redraw) : null,

    renderFilterBar(redraw),
    renderSortControls(redraw),

    items.length === 0
      ? h('div.study-page__empty', [
          h('p', 'No studies yet.'),
          h('p', 'Right-click any move on the analysis board to save it here.'),
        ])
      : h('div.study-list', items.map(item => renderStudyRow(item, redraw))),

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

