
























export type Redraw = () => void;

export type SaveFlowItemType = 'puzzle' | 'game';

// P2-SAVE-4: the eight puzzle primary categories — verbatim and locked for v1. Do not relabel,
// reorder, or add to this list without an owner-approved taxonomy change (renames/additions ride
// later settings work per the owner ruling quoted in the lookbook).
export const SAVE_FLOW_PUZZLE_CATEGORIES = [
  'Opening Theory',
  'Missed Tactic',
  'Blunder Pattern',
  'Positional Concept',
  'Endgame Technique',
  'Calculation Practice',
  'Defensive Resource',
  'Time Management',
] as const;
export type SaveFlowPuzzleCategory = typeof SAVE_FLOW_PUZZLE_CATEGORIES[number];

// P2-LIB-2: the four Study destination sections used by game saves.
export const SAVE_FLOW_GAME_DESTINATIONS = [
  'My Played Games',
  'Masters Game Study',
  'Repertoire Library',
  'Opponent Prep',
] as const;
export type SaveFlowGameDestination = typeof SAVE_FLOW_GAME_DESTINATIONS[number];

// Save-source context shown at the top of the modal (lookbook's ctx-line / ctx-src). Callers
// supply real, dynamic text here (e.g. "From LFYM — game vs X · move N · missed Y"); this
// component never hardcodes entry-point copy.
export interface SaveFlowContext {
  /** Primary context line, e.g. "From LFYM — game vs NajdorfNick77 · move 24 · missed Nxf6+ fork". */
  line: string;
  /** Optional secondary line, e.g. "In-session force-save (P2-LFYM-3)". */
  source?: string;
}



export interface SaveFlowResult {
  mode: 'categorized' | 'quick';
  primaryCategory?: SaveFlowPuzzleCategory;
  tags: string[];
  notes?: string;
  destination?: SaveFlowGameDestination;
  purpose?: string;
}

export interface SaveFlowConfig {
  itemType: SaveFlowItemType;
  context: SaveFlowContext;
  onResolve: (result: SaveFlowResult) => void;
  /** Called when the user dismisses the modal without saving (e.g. backdrop click). Optional. */
  onCancel?: () => void;
}

// Static per-item-type copy (title + Quick save label), verbatim from the approved lookbook.
export interface SaveFlowCopy {
  title: string;
  quickSaveLabel: string;
}

export const SAVE_FLOW_COPY: Record<SaveFlowItemType, SaveFlowCopy> = {
  puzzle: {
    title: 'Save to your puzzle library',
    quickSaveLabel: 'Quick save — file into General, categorize later',
  },
  game: {
    title: 'Save game to Study',
    quickSaveLabel: 'Quick save — file into Unsorted, organize later',
  },
};

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

function trimmedOrUndefined(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export default class SaveFlowCtrl {
  // Puzzle-mode picks.
  primaryCategory: SaveFlowPuzzleCategory | null = null;
  tagsInput = '';

  // Game-mode picks.
  destination: SaveFlowGameDestination | null = null;
  purposeInput = '';

  // Shared by both modes.
  notesInput = '';

  constructor(
    readonly cfg: SaveFlowConfig,
    readonly redraw: Redraw,
  ) {}

  get itemType(): SaveFlowItemType {
    return this.cfg.itemType;
  }

  get context(): SaveFlowContext {
    return this.cfg.context;
  }

  pickPrimaryCategory(category: SaveFlowPuzzleCategory): void {
    if (this.cfg.itemType !== 'puzzle') return;
    this.primaryCategory = category;
    this.redraw();
  }

  pickDestination(destination: SaveFlowGameDestination): void {
    if (this.cfg.itemType !== 'game') return;
    this.destination = destination;
    this.redraw();
  }

  setTagsInput(value: string): void {
    this.tagsInput = value;
    this.redraw();
  }

  setPurposeInput(value: string): void {
    this.purposeInput = value;
    this.redraw();
  }

  setNotesInput(value: string): void {
    this.notesInput = value;
    this.redraw();
  }

  // Primary Save is gated on the one required pick per item type (P2-SAVE-4): puzzle saves need
  // a primary category; game saves need a Study destination. Quick save is NEVER gated — see
  // quickSave() below.
  canSave(): boolean {
    if (this.cfg.itemType === 'puzzle') return this.primaryCategory !== null;
    return this.destination !== null;
  }

  confirmSave(): void {
    if (!this.canSave()) return;
    const notes = trimmedOrUndefined(this.notesInput);

    if (this.cfg.itemType === 'puzzle') {
      const result: SaveFlowResult = {
        mode: 'categorized',
        primaryCategory: this.primaryCategory!,
        tags: parseTags(this.tagsInput),
      };
      if (notes !== undefined) result.notes = notes;
      this.cfg.onResolve(result);
      return;
    }

    const purpose = trimmedOrUndefined(this.purposeInput);
    const result: SaveFlowResult = {
      mode: 'categorized',
      destination: this.destination!,
      tags: [],
    };
    if (notes !== undefined) result.notes = notes;
    if (purpose !== undefined) result.purpose = purpose;
    this.cfg.onResolve(result);
  }

  // P2-SAVE-2: Quick save is ALWAYS enabled and files the item into the shared uncategorized
  // bucket ("General" for puzzles / "Unsorted" for games) — it deliberately never carries
  // primaryCategory/destination/purpose, since those fields together constitute "categorized"
  // (P2-SAVE-4's "Study destination + purpose" definition for games). This holds even if a tile
  // or destination is currently picked in the UI when Quick save is clicked. Free-text tags/notes
  // already entered are preserved — they are supplementary metadata, not the categorization gate.
  quickSave(): void {
    const notes = trimmedOrUndefined(this.notesInput);
    const result: SaveFlowResult = {
      mode: 'quick',
      tags: this.cfg.itemType === 'puzzle' ? parseTags(this.tagsInput) : [],
    };
    if (notes !== undefined) result.notes = notes;
    this.cfg.onResolve(result);
  }

  cancel(): void {
    this.cfg.onCancel?.();
  }
}
