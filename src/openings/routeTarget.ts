import { getAccount, type ChessAccount } from '../accounts';
import { loadGamesByAccountFromIdb, type StoredGameRecord } from '../idb';
import { loadCollections } from './db';
import type { ResearchCollection, ResearchGame } from './types';
import type { OpponentsTreeUrlState, OpponentsUrlTarget } from './urlState';

export type OpponentsRouteTargetStatus =
  | 'saved-collection'
  | 'account-games'
  | 'missing-account'
  | 'missing-collection'
  | 'account-no-games'
  | 'malformed-target';

export interface OpponentsRouteTargetResolverDeps {
  loadCollections: () => Promise<ResearchCollection[]>;
  getAccount: (id: string) => Promise<ChessAccount | undefined>;
  loadAccountGames: (accountId: string) => Promise<StoredGameRecord[]>;
  now?: () => number;
}

export interface SavedCollectionRouteTargetResult {
  status: 'saved-collection';
  target: OpponentsUrlTarget;
  collection: ResearchCollection;
}

export interface AccountGamesRouteTargetResult {
  status: 'account-games';
  target: OpponentsUrlTarget;
  account: ChessAccount;
  collection: ResearchCollection;
}

export interface MissingAccountRouteTargetResult {
  status: 'missing-account';
  target: OpponentsUrlTarget;
}

export interface MissingCollectionRouteTargetResult {
  status: 'missing-collection';
  target: OpponentsUrlTarget;
}

export interface AccountNoGamesRouteTargetResult {
  status: 'account-no-games';
  target: OpponentsUrlTarget;
  account: ChessAccount;
}

export interface MalformedRouteTargetResult {
  status: 'malformed-target';
  reason: 'missing-target' | 'unsupported-target-kind' | 'empty-target-id';
  target?: Partial<OpponentsUrlTarget>;
}

export type OpponentsRouteTargetResult =
  | SavedCollectionRouteTargetResult
  | AccountGamesRouteTargetResult
  | MissingAccountRouteTargetResult
  | MissingCollectionRouteTargetResult
  | AccountNoGamesRouteTargetResult
  | MalformedRouteTargetResult;

const defaultDeps: OpponentsRouteTargetResolverDeps = {
  loadCollections,
  getAccount,
  loadAccountGames: loadGamesByAccountFromIdb,
};

export function researchGameFromStoredRecord(record: StoredGameRecord): ResearchGame {
  return {
    id: record.id,
    pgn: record.pgn,
    ...(record.white       !== null ? { white: record.white }             : {}),
    ...(record.black       !== null ? { black: record.black }             : {}),
    ...(record.result      !== null ? { result: record.result }           : {}),
    ...(record.date        !== null ? { date: record.date }               : {}),
    ...(record.timeClass   !== null ? { timeClass: record.timeClass }     : {}),
    ...(record.opening     !== null ? { opening: record.opening }         : {}),
    ...(record.eco         !== null ? { eco: record.eco }                 : {}),
    ...(record.source      !== null ? { source: record.source }           : {}),
    ...(record.whiteRating !== null ? { whiteRating: record.whiteRating } : {}),
    ...(record.blackRating !== null ? { blackRating: record.blackRating } : {}),
  };
}

export function createAccountResearchCollection(
  account: ChessAccount,
  records: readonly StoredGameRecord[],
  now: () => number = Date.now,
): ResearchCollection {
  return {
    id: `account:${account.id}`,
    name: account.displayName,
    source: account.platform,
    target: account.username,
    perspective: 'both',
    games: records.map(researchGameFromStoredRecord),
    createdAt: account.addedAt,
    updatedAt: now(),
  };
}

function validateTarget(target: Partial<OpponentsUrlTarget> | undefined): OpponentsRouteTargetResult | null {
  if (!target) return { status: 'malformed-target', reason: 'missing-target' };
  if (target.kind !== 'account' && target.kind !== 'collection') {
    return { status: 'malformed-target', reason: 'unsupported-target-kind', target };
  }
  if (typeof target.id !== 'string' || target.id.length === 0) {
    return { status: 'malformed-target', reason: 'empty-target-id', target };
  }
  return null;
}

export async function resolveOpponentsRouteTarget(
  state: Pick<OpponentsTreeUrlState, 'target'>,
  deps: OpponentsRouteTargetResolverDeps = defaultDeps,
): Promise<OpponentsRouteTargetResult> {
  const malformed = validateTarget(state.target);
  if (malformed) return malformed;

  const target = state.target as OpponentsUrlTarget;
  if (target.kind === 'collection') {
    const collections = await deps.loadCollections();
    const collection = collections.find(c => c.id === target.id);
    return collection
      ? { status: 'saved-collection', target, collection }
      : { status: 'missing-collection', target };
  }

  const account = await deps.getAccount(target.id);
  if (!account) return { status: 'missing-account', target };

  const records = await deps.loadAccountGames(account.id);
  if (records.length === 0) return { status: 'account-no-games', target, account };

  return {
    status: 'account-games',
    target,
    account,
    collection: createAccountResearchCollection(account, records, deps.now),
  };
}
