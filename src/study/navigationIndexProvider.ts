












































import type { StudyFolder, StudyItem } from './types';
import type { SaveFlowGameDestination } from '../save/saveFlowCtrl';
import {
  BaseNavigationContentProvider,
  NavigationIndexProviderRegistry,
  NavigationIndexStorage,
  calculateNavigationIndexDiff,
  type NavigationContentProcessResult,
} from './navigationIndex';

// ---------------------------------------------------------------------------------------------
// Fixed top-level sections (P2-LIB-2)
// ---------------------------------------------------------------------------------------------

export type StudySectionId =
  | 'my-played-games'
  | 'masters-game-study'
  | 'repertoire-library'
  | 'opponent-prep';

export interface StudySectionDef {
  id: StudySectionId;
  label: string;
}

// "Fixed top-level sections, final names: My Played Games · Masters Game Study · Repertoire
// Library · Opponent Prep." (P2-LIB-2). System-owned and indestructible: unlike folders, this
// list is never computed from user data and its order/membership is not user-editable.
export const STUDY_SECTIONS: readonly StudySectionDef[] = [
  { id: 'my-played-games', label: 'My Played Games' },
  { id: 'masters-game-study', label: 'Masters Game Study' },
  { id: 'repertoire-library', label: 'Repertoire Library' },
  { id: 'opponent-prep', label: 'Opponent Prep' },
];

const MASTER_GAME_TAG = 'master-game';
const COLLECTION_TAG_PREFIX = 'collection:';







const DESTINATION_TO_SECTION: Record<SaveFlowGameDestination, StudySectionId> = {
  'My Played Games': 'my-played-games',
  'Masters Game Study': 'masters-game-study',
  'Repertoire Library': 'repertoire-library',
  'Opponent Prep': 'opponent-prep',
};


































export function classifyStudySection(item: Pick<StudyItem, 'source' | 'tags' | 'destination'>): StudySectionId {
  if (item.destination) {
    return DESTINATION_TO_SECTION[item.destination];
  }
  if (item.source === 'openings') {
    return item.tags.some(tag => tag.startsWith(COLLECTION_TAG_PREFIX)) ? 'opponent-prep' : 'repertoire-library';
  }
  if (item.source === 'import' && item.tags.includes(MASTER_GAME_TAG)) {
    return 'masters-game-study';
  }
  return 'my-played-games';
}

// ---------------------------------------------------------------------------------------------
// Persisted per-item derived record + content provider
// ---------------------------------------------------------------------------------------------

/** The one derived field this provider computes and caches per item: its classified section. */
export interface StudyNavigationSectionRecord {
  version: number; // StudyItem.updatedAt at classification time — the diff/staleness marker
  sectionId: StudySectionId;
}

// Classification depends only on the item's own source/tags, never on a user setting — kept as
// an empty settings shape purely to satisfy INavigationContentProvider's generic TSettings
// contract (getRelevantSettings()/shouldRegenerate() below are both trivially no-ops).
export type StudyNavigationProviderSettings = Record<string, never>;

const STUDY_SECTION_CONTENT_TYPE = 'study-section';

/**
 * Concrete content provider: classifies each queued StudyItem into its P2-LIB-2 section and
 * persists the result via the injected NavigationIndexStorage. Queue/dedup/retry/batch scheduling
 * all come from BaseNavigationContentProvider (T5-D03) unchanged; this class supplies only the
 * domain logic (classifyStudySection) and the staleness check (version === updatedAt).
 */
class StudySectionContentProvider extends BaseNavigationContentProvider<
  StudyItem,
  StudyNavigationProviderSettings,
  StudyNavigationSectionRecord
> {
  getContentType(): string {
    return STUDY_SECTION_CONTENT_TYPE;
  }

  getRelevantSettings(): (keyof StudyNavigationProviderSettings)[] {
    return [];
  }

  shouldRegenerate(): boolean {
    return false; // no setting ever changes how an item classifies
  }

  async clearContent(): Promise<void> {
    // No per-setting state to clear; staleness is entirely driven by needsProcessing() below.
  }

  protected needsProcessing(record: StudyNavigationSectionRecord | null, item: StudyItem): boolean {
    return !record || record.version !== item.updatedAt;
  }

  protected async processItem(item: StudyItem): Promise<NavigationContentProcessResult<StudyNavigationSectionRecord>> {
    return {
      record: { version: item.updatedAt, sectionId: classifyStudySection(item) },
      processed: true,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// Sections -> nested folders -> items tree
// ---------------------------------------------------------------------------------------------

/** One folder's position in a single section's subtree, plus the items filed there for that
 * section specifically (the same underlying StudyFolder can carry different itemIds under two
 * different sections — see the file header note on derived per-section folder visibility). */
export interface StudyNavigationFolderGroup {
  id: string;
  name: string;
  parentId: string | null;
  itemIds: string[];
  children: StudyNavigationFolderGroup[];
}

export interface StudyNavigationSectionNode {
  id: StudySectionId;
  label: string;
  folders: StudyNavigationFolderGroup[]; // top-level (no-parent) folder groups for this section
  unfiledItemIds: string[]; // items classified into this section with no resolving folder membership
}

export interface StudyNavigationTree {
  builtAt: number; // Date.now() at build time — the tree is fully rebuildable, this is just a marker
  sections: StudyNavigationSectionNode[]; // always all four STUDY_SECTIONS, in P2-LIB-2 order
}

interface FolderGroupsForSection {
  roots: StudyNavigationFolderGroup[];
  byId: Map<string, StudyNavigationFolderGroup>;
}

/** Build one empty (no items yet) folder-group forest from the current StudyFolder records,
 * honoring parentId nesting (T5-D01/D02, any depth). A folder whose parentId does not resolve to
 * a known folder (already-deleted parent, or any other orphan case) is promoted to a top-level
 * root rather than dropped, so no folder ever silently disappears from the tree. */
function buildEmptyFolderGroups(folders: StudyFolder[]): FolderGroupsForSection {
  const byId = new Map<string, StudyNavigationFolderGroup>();
  for (const folder of folders) {
    byId.set(folder.id, {
      id: folder.id,
      name: folder.name,
      parentId: folder.parentId ?? null,
      itemIds: [],
      children: [],
    });
  }
  const roots: StudyNavigationFolderGroup[] = [];
  for (const folder of folders) {
    const group = byId.get(folder.id)!;
    const parent = group.parentId ? byId.get(group.parentId) : undefined;
    if (parent) parent.children.push(group);
    else roots.push(group);
  }
  return { roots, byId };
}

/**
 * Drop folder groups that carry no content anywhere in their own subtree for a section: P2-LIB-2
 * frames folders as living "inside" a section, so an (empty, for this section) folder is not part
 * of that section's tree until something classified into that section is filed there, directly or
 * via a nested child — a folder on the path to a populated descendant is kept even if it has no
 * directly-filed items of its own. This never mutates itemIds; it only decides which (otherwise
 * empty) structural nodes are retained per section. A brand-new, still-empty folder therefore does
 * not appear under any section until a first item is filed into it (documented tradeoff — see the
 * file header).
 */
function pruneEmptyFolderGroups(groups: StudyNavigationFolderGroup[]): StudyNavigationFolderGroup[] {
  const kept: StudyNavigationFolderGroup[] = [];
  for (const group of groups) {
    const prunedChildren = pruneEmptyFolderGroups(group.children);
    if (group.itemIds.length > 0 || prunedChildren.length > 0) {
      kept.push({ ...group, children: prunedChildren });
    }
  }
  return kept;
}

/**
 * A derived, versioned, rebuildable index over Study's `studies`/`folders` state: classifies each
 * item into its P2-LIB-2 section (cached + diff-synced via the T5-D03 foundation) and assembles
 * the sections -> nested folders -> items tree on demand.
 */
export class StudyNavigationIndex {
  private readonly storage: NavigationIndexStorage<StudyNavigationSectionRecord>;
  private readonly registry: NavigationIndexProviderRegistry<StudyItem, StudyNavigationProviderSettings>;
  private readonly provider: StudySectionContentProvider;
  private readonly itemsById = new Map<string, StudyItem>();

  constructor(dbName = 'patzer-study-navigation-index') {
    this.storage = new NavigationIndexStorage<StudyNavigationSectionRecord>(dbName);
    this.provider = new StudySectionContentProvider({
      getRecord: id => this.storage.getRecord(id),
      resolveItem: id => this.itemsById.get(id) ?? null,
      applyUpdates: updates => this.storage.setRecords(updates.map(u => ({ id: u.id, data: u.record }))),
    });
    this.registry = new NavigationIndexProviderRegistry<StudyItem, StudyNavigationProviderSettings>();
    this.registry.registerProvider(this.provider);
    // Fire-and-forget: hydration races with any early noteItemsLoaded()/buildTree() call, which is
    // an accepted, self-healing tradeoff already inherent to NavigationIndexStorage (T5-D03) — a
    // pre-hydration read just yields "not cached yet", so classification falls back to the live,
    // always-correct synchronous path (sectionForItem) rather than blocking on IDB.
    void this.storage.init();
    this.provider.startProcessing({});
  }

  /**
   * Queue new/changed items for section (re)classification. Safe to call with ANY partial batch
   * (a single paginated page, a single mutated item, a single new import) — only additions/
   * updates are ever acted on here (see the file header's pagination note); nothing is ever
   * pruned by this method.
   */
  noteItemsLoaded(items: StudyItem[]): void {
    if (items.length === 0) return;
    for (const item of items) this.itemsById.set(item.id, item);










    const cached = new Map<string, StudyNavigationSectionRecord>();
    for (const item of items) {
      const record = this.storage.getRecord(item.id);
      if (record) cached.set(item.id, record);
    }
    const diff = calculateNavigationIndexDiff(
      items.map(item => ({ id: item.id, version: item.updatedAt })),
      cached,
    );
    if (diff.toAdd.length === 0 && diff.toUpdate.length === 0) return;

    const changedIds = new Set<string>([...diff.toAdd.map(i => i.id), ...diff.toUpdate.map(i => i.id)]);
    const changedItems = items.filter(item => changedIds.has(item.id));
    this.provider.queueFiles(changedItems);
  }

  /**
   * Explicit single-item removal (deleteStudy). Returns a promise so a caller that needs
   * certainty (tests, diagnostics) can await the underlying delete completing; production callers
   * may treat this as fire-and-forget (`void`) since buildTree's correctness never depends on a
   * removed item's stale cached record having already been pruned — buildTree only ever reads
   * sections for the items it is explicitly given.
   */
  async noteItemRemoved(id: string): Promise<void> {
    this.itemsById.delete(id);
    await this.storage.deleteRecord(id);
  }

  /**
   * Full reconciliation against a genuinely EXHAUSTIVE current item list (e.g.
   * loadAllStudiesForRoute's listStudies() result) — the only case where "not present in this
   * list" legitimately means "removed", so this is the only path allowed to prune cached records.
   * Returns a promise (same fire-and-forget-or-await tradeoff as noteItemRemoved above).
   */
  async reconcileAll(items: StudyItem[]): Promise<void> {
    this.noteItemsLoaded(items);
    const currentIds = new Set(items.map(item => item.id));
    const staleIds = this.storage.getAllRecords().map(r => r.id).filter(id => !currentIds.has(id));
    if (staleIds.length === 0) return;
    for (const id of staleIds) this.itemsById.delete(id);
    await this.storage.deleteRecords(staleIds);
  }

  /** Section for one item: cache-first, falls back to live (and always correct) classification
   * when not yet cached — tree correctness never depends on the background queue having drained,
   * mirroring this codebase's P0-first rule that board/UI correctness never waits on background
   * enrichment. */
  sectionForItem(item: StudyItem): StudySectionId {
    return this.storage.getRecord(item.id)?.sectionId ?? classifyStudySection(item);
  }

  /** Whether a section classification is currently cached (persisted+mirrored) for this id —
   * a thin diagnostic passthrough over the underlying storage, used to verify the diff-based
   * cache/prune behavior (noteItemsLoaded/reconcileAll/noteItemRemoved) directly in tests. */
  hasCachedSection(id: string): boolean {
    return this.storage.getRecord(id) !== null;
  }

  /**
   * Assemble the full sections -> nested folders -> items tree from the given items/folders.
   * Pure and synchronous; rebuildable from scratch at any time (no accumulated state is required
   * to call this correctly). Honors P2-LIB-8 multi-membership: an item filed in more than one
   * folder appears under every one of those folder groups (within its single classified section).
   */
  buildTree(items: StudyItem[], folders: StudyFolder[]): StudyNavigationTree {
    const groupsBySection = new Map<StudySectionId, FolderGroupsForSection>();
    for (const section of STUDY_SECTIONS) {
      groupsBySection.set(section.id, buildEmptyFolderGroups(folders));
    }

    const unfiledBySection = new Map<StudySectionId, string[]>(STUDY_SECTIONS.map(section => [section.id, []]));

    for (const item of items) {
      const sectionId = this.sectionForItem(item);
      const { byId } = groupsBySection.get(sectionId)!;
      let filedSomewhere = false;
      for (const folderId of item.folders) {
        const group = byId.get(folderId);
        if (group) {
          group.itemIds.push(item.id);
          filedSomewhere = true;
        }
        // A folder id that does not resolve (already-deleted folder whose membership cleanup is
        // still in flight, or any other stale reference) is skipped for that grouping only; if
        // NONE of the item's folder ids resolve it still falls through to unfiled below, so it
        // never silently vanishes from the tree.
      }
      if (!filedSomewhere) unfiledBySection.get(sectionId)!.push(item.id);
    }

    return {
      builtAt: Date.now(),
      sections: STUDY_SECTIONS.map(section => ({
        id: section.id,
        label: section.label,
        folders: pruneEmptyFolderGroups(groupsBySection.get(section.id)!.roots),
        unfiledItemIds: unfiledBySection.get(section.id)!,
      })),
    };
  }

  /** Await the background classification queue draining — for tests/diagnostics only; no
   * production caller should need to await this (see sectionForItem/buildTree's live fallback). */
  async waitForIdle(): Promise<void> {
    await this.provider.waitForIdle();
  }

  /** Release the underlying IndexedDB connection (test cleanup / surface teardown). */
  close(): void {
    this.storage.close();
  }
}
