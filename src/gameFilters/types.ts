import type { ImportedGame } from '../import/types';
import type { StoredGameRecord } from '../idb/index';
import type { StudyItem } from '../study/types';

export type GameFilterRecordFamily = 'imported-game' | 'study-item';
export type GameFilterUserColor = 'white' | 'black';
export type GameFilterOwnerResult = 'win' | 'loss' | 'draw';
export type GameFilterMissedTacticSeverity = '!' | '!!' | '!!!' | 'M?!';
export type GameFilterReviewIssueState = 'none' | 'incomplete' | 'failed-skipped';




export type GameFilterAnalysisState = 'analyzed' | 'not-analyzed' | 'no-game';

export type GameFilterFacet =
  | 'recordFamily'
  | 'text'
  | 'result'
  | 'player'
  | 'opponent'
  | 'color'
  | 'source'
  | 'timeClass'
  | 'opening'
  | 'eco'
  | 'playedDate'
  | 'rating'
  | 'missedTactic'
  | 'reviewIssue'
  | 'analysisState'
  | 'recentlyAdded'
  | 'recentlyModified'
  | 'tags'
  | 'folders'
  | 'destination'
  | 'favorite'
  | 'hidden';

export type GameFilterHiddenMode = 'exclude' | 'include' | 'only';

export type GameFilterSortKey =
  | 'id'
  | 'title'
  | 'white'
  | 'black'
  | 'result'
  | 'ownerResult'
  | 'opponentName'
  | 'userColor'
  | 'source'
  | 'timeClass'
  | 'opening'
  | 'eco'
  | 'playedAt'
  | 'opponentRating'
  | 'addedAt'
  | 'modifiedAt';

export interface GameFilterDateRange {
  from?: number;
  to?: number;
}

export interface GameFilterSort {
  key: GameFilterSortKey;
  direction: 'asc' | 'desc';
}

export interface GameFilterQuery {
  text?: string;
  textAny?: string;
  recordFamilies?: GameFilterRecordFamily[];
  results?: string[];
  players?: string[];
  opponents?: string[];
  colors?: GameFilterUserColor[];
  sources?: string[];
  timeClasses?: string[];
  openings?: string[];
  ecos?: string[];
  playedDate?: GameFilterDateRange;
  opponentRating?: GameFilterDateRange;
  missedTactics?: GameFilterMissedTacticSeverity[];
  reviewIssues?: GameFilterReviewIssueState[];
  analysisStates?: GameFilterAnalysisState[];
  recentlyAdded?: GameFilterDateRange;
  recentlyModified?: GameFilterDateRange;
  tags?: string[];
  folders?: string[];
  destinations?: string[];
  favorite?: boolean;
  hiddenMode?: GameFilterHiddenMode;
  sort?: Partial<GameFilterSort>;
}

export interface GameFilterProjection {
  id: string;
  family: GameFilterRecordFamily;
  title?: string | undefined;
  pgn?: string | undefined;
  white?: string | undefined;
  black?: string | undefined;
  result?: string | undefined;
  ownerResult?: GameFilterOwnerResult | undefined;
  userColor?: GameFilterUserColor | undefined;
  playerNames?: string[] | undefined;
  opponentName?: string | undefined;
  opponentRating?: number | undefined;
  source?: string | undefined;
  accountId?: string | undefined;
  importedUsername?: string | undefined;
  timeClass?: string | undefined;
  opening?: string | undefined;
  eco?: string | undefined;
  playedAt?: number | undefined;
  missedTacticSeverities?: GameFilterMissedTacticSeverity[] | undefined;
  reviewIssueState?: GameFilterReviewIssueState | undefined;
  analysisState?: GameFilterAnalysisState | undefined;
  textAnyValues?: string[] | undefined;
  addedAt?: number | undefined;
  modifiedAt?: number | undefined;
  tags?: string[] | undefined;
  folderIds?: string[] | undefined;
  homeFolderId?: string | null | undefined;
  destination?: string | undefined;
  favorite?: boolean | undefined;
  pinned?: boolean | undefined;
  hidden?: boolean | undefined;
  sourceGameId?: string | undefined;
}

export interface UnsupportedGameFilterFacet {
  facet: GameFilterFacet;
  family: GameFilterRecordFamily;
}

export interface GameFilterResult {
  ids: string[];
  projections: GameFilterProjection[];
  totalVisible: number;
  totalMatchedIncludingHidden: number;
  unsupportedFacets: UnsupportedGameFilterFacet[];
  unknownFacetCounts: Partial<Record<GameFilterFacet, number>>;
  queryHash: string;
  sort: GameFilterSort;
  runner: 'memory';
}

export type ImportedGameLike = ImportedGame;
export type PersistedImportedGameLike = StoredGameRecord & { createdAt?: number };
export type StudyGameFilterItem = StudyItem;
