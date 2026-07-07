































































import { h, type VNode } from 'snabbdom';
import { navIcon, type NavIconNameOrAlias } from './navIcons';
import type { StudyItem } from './types';
import {
  addAliasToFolder,
  bulkAddToFolder,
  bulkDeleteStudies,
  deleteStudy,
  folders,
  moveGameToFolder,
  removeAliasFromFolder,
  setActiveFolderId,
  updateStudy,
} from './studyCtrl';
import { addShortcut, isShortcut, removeShortcut } from './shortcuts';
import { hideItem, isHidden, unhideItem } from './hiddenItems';
import { deriveHomeFolderId } from './studyDb';
import { writeHashRoute } from '../router';

// ---------------------------------------------------------------------------------------------
// Entry model
// ---------------------------------------------------------------------------------------------

interface ContextMenuItemEntry {
  kind: 'item';
  key: string;
  label: string;
  icon: NavIconNameOrAlias;
  onClick: () => void;
  disabled: boolean;
  warning: boolean;
  submenu: ContextMenuEntry[]; // empty = no submenu
}

interface ContextMenuSeparatorEntry {
  kind: 'separator';
  key: string;
}

type ContextMenuEntry = ContextMenuItemEntry | ContextMenuSeparatorEntry;

function menuItem(opts: {
  key: string;
  label: string;
  icon: NavIconNameOrAlias;
  onClick: () => void;
  disabled?: boolean;
  warning?: boolean;
  submenu?: ContextMenuEntry[];
}): ContextMenuItemEntry {
  return {
    kind: 'item',
    key: opts.key,
    label: opts.label,
    icon: opts.icon,
    onClick: opts.onClick,
    disabled: opts.disabled ?? false,
    warning: opts.warning ?? false,
    submenu: opts.submenu ?? [],
  };
}

function menuSeparator(key: string): ContextMenuSeparatorEntry {
  return { kind: 'separator', key };
}

// ---------------------------------------------------------------------------------------------
// Public build context — what itemListView.ts supplies at open time
// ---------------------------------------------------------------------------------------------

export interface GameMenuContext {
  /** The id of the item that was actually right-clicked / long-pressed. */
  clickedId: string;
  /** The current selection snapshot (studyCtrl.ts's `selectedIds()`), read once at open time. */
  selectedIds: ReadonlySet<string>;
  /** Every item the menu might need to look up (title/tags) for the clicked id and/or selection. */
  itemsById: ReadonlyMap<string, StudyItem>;








  currentFolderId: string | null;
  /** Item-list-owned pin state (per-device localStorage set — see itemListView.ts). */
  isPinned: (id: string) => boolean;
  /** Item-list-owned pin toggle over a set of ids (single [id] or the whole multi-selection). */
  onTogglePin: (ids: readonly string[]) => void;
}

interface ResolvedTargets {
  ids: string[];
  isMulti: boolean;
}

/**
 * Inventory §3's binding rule, quoted in this file's header comment: a multi-selection's own menu
 * only applies when the RIGHT-CLICKED item is itself part of that selection — right-clicking an
 * unselected item while a multi-selection exists elsewhere is always single-item.
 */
function resolveTargets(ctx: GameMenuContext): ResolvedTargets {
  const isMultipleSelected = ctx.selectedIds.size > 1;
  const isClickedSelected = ctx.selectedIds.has(ctx.clickedId);
  const shouldShowMultiOptions = isMultipleSelected && isClickedSelected;
  if (shouldShowMultiOptions) return { ids: Array.from(ctx.selectedIds), isMulti: true };
  return { ids: [ctx.clickedId], isMulti: false };
}

/** Union of tags across every target item — mirrors NN's own `getTagsFromFiles` (tag ops in a
 * multi-selection operate over the combined tag set of every selected file, not just the
 * right-clicked one). */
function unionTags(ids: readonly string[], itemsById: ReadonlyMap<string, StudyItem>): string[] {
  const set = new Set<string>();
  for (const id of ids) {
    const item = itemsById.get(id);
    if (item) for (const tag of item.tags) set.add(tag);
  }
  return Array.from(set);
}

// ---------------------------------------------------------------------------------------------
// Game (file) menu builder — inventory §3 order, Patzer analogs (see header comment for omissions)
// ---------------------------------------------------------------------------------------------

function buildGameMenuEntries(ctx: GameMenuContext, redraw: () => void): ContextMenuEntry[] {
  const { ids, isMulti } = resolveTargets(ctx);
  const count = ids.length;
  const entries: ContextMenuEntry[] = [];

  // 1. Open block — single only. "Analyze" and NN's multi/new-window open rows are omitted and
  // disclosed (see header comment).
  if (!isMulti) {
    const targetId = ids[0]!;
    entries.push(menuItem({
      key: 'open',
      label: 'Open',
      icon: 'file-plus',
      onClick: () => { writeHashRoute(`study/${targetId}`); },
    }));
    entries.push(menuSeparator('sep-open'));
  }

  // 2. Style block: omitted entirely (no per-item icon/color/background fields on StudyItem).

  // 3. Tag ops — union of tags across every target item; unconditional "Add tag", conditional
  // "Remove tag" (submenu when >1 distinct tag, direct action when exactly 1) and "Remove all tags"
  // (only when the union has more than one distinct tag), mirroring fileMenuBuilder.ts's own
  // hasTags/hasMultipleTags gates.
  const existingTags = unionTags(ids, ctx.itemsById);
  entries.push(menuItem({
    key: 'add-tag',
    label: isMulti ? `Add tag to ${count} games` : 'Add tag',
    icon: 'tag',
    onClick: () => {
      const raw = prompt(isMulti ? `Add tag to ${count} games:` : 'Add tag:');
      const tag = raw?.trim();
      if (!tag) return;
      for (const id of ids) {
        const item = ctx.itemsById.get(id);
        if (item && !item.tags.includes(tag)) void updateStudy({ id, tags: [...item.tags, tag] }).then(redraw);
      }
    },
  }));
  if (existingTags.length === 1) {
    const onlyTag = existingTags[0]!;
    entries.push(menuItem({
      key: 'remove-tag',
      label: isMulti ? `Remove tag from ${count} games` : 'Remove tag',
      icon: 'minus',
      onClick: () => {
        for (const id of ids) {
          const item = ctx.itemsById.get(id);
          if (item?.tags.includes(onlyTag)) void updateStudy({ id, tags: item.tags.filter(t => t !== onlyTag) }).then(redraw);
        }
      },
    }));
  } else if (existingTags.length > 1) {
    entries.push(menuItem({
      key: 'remove-tag',
      label: isMulti ? `Remove tag from ${count} games` : 'Remove tag',
      icon: 'minus',
      onClick: () => {},
      submenu: existingTags.map(tag => menuItem({
        key: `remove-tag-${tag}`,
        label: tag,
        icon: 'minus',
        onClick: () => {
          for (const id of ids) {
            const item = ctx.itemsById.get(id);
            if (item?.tags.includes(tag)) void updateStudy({ id, tags: item.tags.filter(t => t !== tag) }).then(redraw);
          }
        },
      })),
    }));
    entries.push(menuItem({
      key: 'remove-all-tags',
      label: isMulti ? `Remove all tags from ${count} games` : 'Remove all tags',
      icon: 'x',
      onClick: () => {
        for (const id of ids) void updateStudy({ id, tags: [] }).then(redraw);
      },
    }));
  }
  entries.push(menuSeparator('sep-tags'));









  if (!isMulti) {
    const shortcutTargetId = ids[0]!;
    const isShortcutted = isShortcut('game', shortcutTargetId);
    entries.push(menuItem({
      key: 'shortcut',
      label: isShortcutted ? 'Remove from shortcuts' : 'Add to shortcuts',
      icon: isShortcutted ? 'star-off' : 'star',
      onClick: () => {
        if (isShortcutted) removeShortcut('game', shortcutTargetId);
        else addShortcut('game', shortcutTargetId);
        redraw();
      },
    }));
    entries.push(menuSeparator('sep-shortcut'));
  }

  // Pin/unpin: icon is ALWAYS `pin` (inventory §4 — wording alone carries state), single toggles
  // the one clicked item, multi pins every unpinned target if any is unpinned, else unpins all
  // (inventory §3's own multi-pin rule).
  if (!isMulti) {
    const pinned = ctx.isPinned(ids[0]!);
    entries.push(menuItem({
      key: 'pin',
      label: pinned ? 'Unpin game' : 'Pin game',
      icon: 'pin',
      onClick: () => ctx.onTogglePin(ids),
    }));
  } else {
    const allPinned = ids.every(id => ctx.isPinned(id));
    entries.push(menuItem({
      key: 'pin',
      label: allPinned ? `Unpin ${count} games` : `Pin ${count} games`,
      icon: 'pin',
      onClick: () => ctx.onTogglePin(ids),
    }));
  }
  entries.push(menuSeparator('sep-pin'));

  // 5. SINGLE "Copy path"/"Reveal in folder": omitted (StudyItem has no filesystem path analog).










  const availableFolders = folders();
  entries.push(menuItem({
    key: 'move',
    label: isMulti ? `Move ${count} games to...` : 'Move game to...',
    icon: 'folder-input',
    onClick: () => {},
    disabled: availableFolders.length === 0,
    submenu: availableFolders.map(folder => menuItem({
      key: `move-${folder.id}`,
      label: folder.name,
      icon: 'folder-input',
      onClick: () => {
        if (isMulti) {
          void bulkAddToFolder(folder.id).then(redraw);
        } else {
          void moveGameToFolder(ids[0]!, folder.id, ctx.currentFolderId).then(redraw);
        }
      },
    })),
  }));






  if (!isMulti) {
    const targetId = ids[0]!;
    const item = ctx.itemsById.get(targetId);
    const homeId = item ? deriveHomeFolderId(item) : null;
    // "Remove alias from this folder" / "Go to home folder" only apply when THIS menu was opened
    // from a row that is actually an alias in the CURRENT folder view (current folder ≠ home AND
    // the game is a member here) — binding text quoted verbatim in this file's header-adjacent
    // GameMenuContext doc comment. `ctx.currentFolderId` is null for section/lens views, where
    // neither action applies (mirrors itemListView.ts's own isAliasHere gate).
    const isAliasHere = item !== undefined
      && ctx.currentFolderId !== null
      && homeId !== ctx.currentFolderId
      && item.folders.includes(ctx.currentFolderId);

    entries.push(menuItem({
      key: 'add-alias',
      label: 'Add alias to folder…',
      icon: 'link',
      onClick: () => {},
      disabled: availableFolders.length === 0,
      submenu: availableFolders.map(folder => menuItem({
        key: `add-alias-${folder.id}`,
        label: folder.name,
        icon: 'link',
        onClick: () => { void addAliasToFolder(targetId, folder.id).then(redraw); },
      })),
    }));

    if (isAliasHere) {
      entries.push(menuItem({
        key: 'remove-alias',
        label: 'Remove alias from this folder',
        icon: 'x',
        onClick: () => { void removeAliasFromFolder(targetId, ctx.currentFolderId!).then(redraw); },
      }));
      if (homeId !== null) {
        entries.push(menuItem({
          key: 'go-home',
          label: 'Go to home folder',
          icon: 'folder-open',
          onClick: () => { setActiveFolderId(homeId); redraw(); },
        }));
      }
    }
  }

  if (!isMulti) {
    const targetId = ids[0]!;
    const item = ctx.itemsById.get(targetId);
    entries.push(menuItem({
      key: 'rename',
      label: 'Rename game',
      icon: 'pencil',
      onClick: () => {
        const next = prompt('Rename game:', item?.title ?? '')?.trim();
        if (next) void updateStudy({ id: targetId, title: next }).then(redraw);
      },
    }));
  }

  entries.push(menuItem({
    key: 'delete',



    label: isMulti ? `Delete ${count} games` : 'Delete game everywhere…',
    icon: 'trash',
    warning: true,
    onClick: () => {
      if (isMulti) {
        if (confirm(`Delete ${count} selected games?`)) void bulkDeleteStudies().then(redraw);
      } else {
        const targetId = ids[0]!;
        const item = ctx.itemsById.get(targetId);
        if (confirm(`Delete "${item?.title ?? 'this game'}"?`)) void deleteStudy(targetId).then(redraw);
      }
    },
  }));

  return entries;
}

// ---------------------------------------------------------------------------------------------
// Menu widget — one reusable, self-contained overlay (position, outside-click/Escape dismiss, one
// level of submenu). Module-level state, mirroring this repo's existing floating-menu precedents
// (src/main.ts's move-list `#move-ctx-menu`; src/study/studyDetailView.ts's `.study-ctx-menu`).
// ---------------------------------------------------------------------------------------------

interface OpenMenuState {
  entries: ContextMenuEntry[];
  x: number;
  y: number;
}

let _menu: OpenMenuState | null = null;
let _openSubmenuKey: string | null = null;
// Shared across BOTH the game menu and (T5 Wave A6d) the folder menu below -- safe because only
// one of these floating menus can ever be open at once: each renders its own full-viewport
// `.nav-ctx-overlay`, so opening one is the topmost hit-test target for any subsequent right-click,
// making simultaneous game+folder menus unreachable in practice. `openGameContextMenu`/
// `openFolderContextMenu` additionally close the OTHER menu explicitly as belt-and-suspenders.
let _escapeListener: ((e: KeyboardEvent) => void) | null = null;

function detachEscapeListener(): void {
  if (_escapeListener) {
    document.removeEventListener('keydown', _escapeListener, true);
    _escapeListener = null;
  }
}

function closeGameContextMenu(): void {
  _menu = null;
  _openSubmenuKey = null;
  detachEscapeListener();
}

/** Generic escape-to-close wiring, parameterized by WHICH menu's close function to invoke --
 * shared by the game menu and (A6d) the folder menu, rather than duplicating this listener
 * plumbing per menu. */
function attachEscapeListener(redraw: () => void, close: () => void): void {
  detachEscapeListener();
  _escapeListener = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      redraw();
    }
  };
  document.addEventListener('keydown', _escapeListener, true);
}

/** Opens the game context menu at (x, y) with items computed ONCE from the current selection
 * state — later selection changes do not retroactively alter an already-open menu. */
export function openGameContextMenu(ctx: GameMenuContext, x: number, y: number, redraw: () => void): void {
  closeFolderContextMenu();
  _menu = { entries: buildGameMenuEntries(ctx, redraw), x, y };
  _openSubmenuKey = null;
  attachEscapeListener(redraw, closeGameContextMenu);
  redraw();
}

export function isGameContextMenuOpen(): boolean {
  return _menu !== null;
}

/** Generic "run an entry's action, then close whichever menu it belongs to" -- parameterized by
 * `close` (A6d addition) so this one implementation serves both the game and folder menus. */
function runEntryAction(entry: ContextMenuItemEntry, redraw: () => void, close: () => void): void {
  close();
  entry.onClick();
  redraw();
}

/** Renders one menu's entry list -- parameterized by `close` (A6d addition) so the SAME rendering/
 * submenu-toggle logic serves both the game menu and the folder menu below, rather than a second
 * copy of this widget. */
function renderEntries(entries: readonly ContextMenuEntry[], redraw: () => void, close: () => void): VNode[] {
  return entries.map(entry => {
    if (entry.kind === 'separator') return h('div.nav-ctx-menu__sep', { key: entry.key });

    const hasSubmenu = entry.submenu.length > 0;
    const submenuOpen = hasSubmenu && _openSubmenuKey === entry.key;

    return h('div.nav-ctx-menu__item-wrap', { key: entry.key }, [
      h('button.nav-ctx-menu__item', {
        class: {
          'nav-ctx-menu__item--warning': entry.warning,
          'nav-ctx-menu__item--disabled': entry.disabled,
        },
        attrs: { type: 'button', role: 'menuitem', 'aria-haspopup': hasSubmenu ? 'true' : 'false' },
        on: {
          click: (e: Event) => {
            e.stopPropagation();
            if (entry.disabled) return;
            if (hasSubmenu) {
              _openSubmenuKey = submenuOpen ? null : entry.key;
              redraw();
              return;
            }
            runEntryAction(entry, redraw, close);
          },
        },
      }, [
        navIcon(entry.icon, { size: 15, className: 'nav-ctx-menu__icon' }),
        h('span.nav-ctx-menu__label', entry.label),
        hasSubmenu ? navIcon('chevron-right', { size: 13, className: 'nav-ctx-menu__caret' }) : null,
      ]),
      submenuOpen
        ? h('div.nav-ctx-menu__submenu', { attrs: { role: 'menu' } }, renderEntries(entry.submenu, redraw, close))
        : null,
    ]);
  });
}

/** Clamps the menu's fixed position so it never renders off-screen — same measure-and-clamp
 * technique as src/main.ts's own `positionContextMenu` (re-derived here, not imported, since that
 * function is private to main.ts, a no-touch file for this slice). */
function clampMenuPosition(el: HTMLElement, x: number, y: number): void {
  const menuWidth = el.offsetWidth + 4;
  const menuHeight = el.offsetHeight + 4;
  const left = window.innerWidth - x < menuWidth ? Math.max(0, window.innerWidth - menuWidth) : x;
  const top = window.innerHeight - y < menuHeight ? Math.max(0, window.innerHeight - menuHeight) : y;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
}

/** Renders the currently-open game context menu, or null when closed. Callers (itemListView.ts)
 * include this in their own render tree once per render pass; it is a no-op when no menu is open. */
export function renderGameContextMenu(redraw: () => void): VNode | null {
  if (!_menu) return null;
  const { entries, x, y } = _menu;
  return h('div.nav-ctx-overlay', {
    on: {
      click: () => { closeGameContextMenu(); redraw(); },
      contextmenu: (e: Event) => e.preventDefault(),
    },
  }, [
    h('div.nav-ctx-menu', {
      attrs: { role: 'menu' },
      on: { click: (e: Event) => e.stopPropagation() },
      hook: {
        insert: vnode => clampMenuPosition(vnode.elm as HTMLElement, x, y),
        postpatch: (_old, vnode) => clampMenuPosition(vnode.elm as HTMLElement, x, y),
      },
    }, renderEntries(entries, redraw, closeGameContextMenu)),
  ]);
}















export interface FolderMenuContext {
  /** The id of the folder that was right-clicked. */
  folderId: string;
}

function buildFolderMenuEntries(ctx: FolderMenuContext, redraw: () => void): ContextMenuEntry[] {
  const hidden = isHidden('folder', ctx.folderId);
  return [
    menuItem({
      key: 'hide-folder',
      label: hidden ? 'Unhide folder' : 'Hide folder',
      icon: hidden ? 'eye' : 'eye-off',
      onClick: () => {
        if (hidden) unhideItem('folder', ctx.folderId);
        else hideItem('folder', ctx.folderId);
        redraw();
      },
    }),
  ];
}

let _folderMenu: OpenMenuState | null = null;

function closeFolderContextMenu(): void {
  _folderMenu = null;
  detachEscapeListener();
}

/** Opens the folder context menu at (x, y) with items computed ONCE at open time (mirrors
 * `openGameContextMenu`'s own "computed once, not retroactive" behavior). */
export function openFolderContextMenu(ctx: FolderMenuContext, x: number, y: number, redraw: () => void): void {
  closeGameContextMenu();
  _folderMenu = { entries: buildFolderMenuEntries(ctx, redraw), x, y };
  attachEscapeListener(redraw, closeFolderContextMenu);
  redraw();
}

export function isFolderContextMenuOpen(): boolean {
  return _folderMenu !== null;
}

/** Renders the currently-open folder context menu, or null when closed. Callers
 * (navigationPaneView.ts) include this in their own render tree once per render pass; it is a
 * no-op when no menu is open — mirrors `renderGameContextMenu`'s own shape exactly. */
export function renderFolderContextMenu(redraw: () => void): VNode | null {
  if (!_folderMenu) return null;
  const { entries, x, y } = _folderMenu;
  return h('div.nav-ctx-overlay', {
    on: {
      click: () => { closeFolderContextMenu(); redraw(); },
      contextmenu: (e: Event) => e.preventDefault(),
    },
  }, [
    h('div.nav-ctx-menu', {
      attrs: { role: 'menu' },
      on: { click: (e: Event) => e.stopPropagation() },
      hook: {
        insert: vnode => clampMenuPosition(vnode.elm as HTMLElement, x, y),
        postpatch: (_old, vnode) => clampMenuPosition(vnode.elm as HTMLElement, x, y),
      },
    }, renderEntries(entries, redraw, closeFolderContextMenu)),
  ]);
}
