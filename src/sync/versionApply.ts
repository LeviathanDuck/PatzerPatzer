import type { RemoteSyncStoreName } from './remoteSyncMigrations';
import {
  recordRemoteSyncItemVersion,
  type RemoteSyncVersionStorage,
} from './versionMetadata';

export interface RemoteSyncVersionedPullItem {
  store: RemoteSyncStoreName;
  itemKey: string;
  version: number;
  updatedAt: number;
  operation: 'upsert' | 'delete';
  deleted?: boolean;
  payload?: unknown;
}

export interface RemoteSyncVersionedApplyScope {
  identity: string;
  syncGeneration: number;
  sourceId: string;
}

export interface RemoteSyncVersionedApplyAdapter {
  upsert(item: RemoteSyncVersionedPullItem): void | Promise<void>;
  delete(item: RemoteSyncVersionedPullItem): void | Promise<void>;
}

export interface ApplyRemoteSyncVersionedPullOptions {
  storage: RemoteSyncVersionStorage;
  scope: RemoteSyncVersionedApplyScope;
  getCurrentScope: () => RemoteSyncVersionedApplyScope;
  adapter: RemoteSyncVersionedApplyAdapter;
  items: readonly RemoteSyncVersionedPullItem[];
  chunkSize?: number;
  yieldToMain?: () => Promise<void>;
}

export type ApplyRemoteSyncVersionedPullResult =
  | {
      ok: true;
      applied: number;
      yielded: number;
      latestAppliedVersion: number;
    }
  | {
      ok: false;
      reason: 'stale-source' | 'apply-failed';
      applied: number;
      yielded: number;
      latestAppliedVersion: number;
      error?: unknown;
    };

function scopeMatches(expected: RemoteSyncVersionedApplyScope, actual: RemoteSyncVersionedApplyScope): boolean {
  return expected.identity === actual.identity
    && expected.syncGeneration === actual.syncGeneration
    && expected.sourceId === actual.sourceId;
}

function validChunkSize(value: number | undefined): number {
  if (value === undefined) return 50;
  return Number.isInteger(value) && value > 0 ? value : 50;
}

function versionOrderedItems(items: readonly RemoteSyncVersionedPullItem[]): RemoteSyncVersionedPullItem[] {
  return [...items].sort((left, right) => {
    if (left.version !== right.version) return left.version - right.version;
    if (left.store !== right.store) return left.store.localeCompare(right.store);
    return left.itemKey.localeCompare(right.itemKey);
  });
}

async function defaultYieldToMain(): Promise<void> {
  await new Promise<void>(resolve => setTimeout(resolve, 0));
}

function isDeleteItem(item: RemoteSyncVersionedPullItem): boolean {
  return item.operation === 'delete' || item.deleted === true;
}

export async function applyRemoteSyncVersionedPull(
  options: ApplyRemoteSyncVersionedPullOptions
): Promise<ApplyRemoteSyncVersionedPullResult> {
  const chunkSize = validChunkSize(options.chunkSize);
  const yieldToMain = options.yieldToMain ?? defaultYieldToMain;
  const orderedItems = versionOrderedItems(options.items);
  let applied = 0;
  let yielded = 0;
  let latestAppliedVersion = 0;

  if (!scopeMatches(options.scope, options.getCurrentScope())) {
    return { ok: false, reason: 'stale-source', applied, yielded, latestAppliedVersion };
  }

  for (const item of orderedItems) {
    if (!scopeMatches(options.scope, options.getCurrentScope())) {
      return { ok: false, reason: 'stale-source', applied, yielded, latestAppliedVersion };
    }

    try {
      if (isDeleteItem(item)) await options.adapter.delete(item);
      else await options.adapter.upsert(item);
    } catch (error) {
      return { ok: false, reason: 'apply-failed', applied, yielded, latestAppliedVersion, error };
    }

    recordRemoteSyncItemVersion(options.storage, options.scope.identity, item.store, item.itemKey, item.version);
    applied++;
    latestAppliedVersion = Math.max(latestAppliedVersion, item.version);

    if (applied < orderedItems.length && applied % chunkSize === 0) {
      yielded++;
      await yieldToMain();
      if (!scopeMatches(options.scope, options.getCurrentScope())) {
        return { ok: false, reason: 'stale-source', applied, yielded, latestAppliedVersion };
      }
    }
  }

  return { ok: true, applied, yielded, latestAppliedVersion };
}
