import type { Route } from '../router';
import type { OpponentsRouteTargetResult } from './routeTarget';
import type { OpponentsUrlStateInvalidParam, OpponentsTreeUrlState } from './urlState';
import { serializeOpponentsTreeUrlState } from './urlState';

export interface OpponentsUrlSnapshotSchedulerDeps {
  getCurrentRoute: () => Route;
  replaceHashRoute: (hashRoute: string) => { route: Route };
  setCurrentRoute: (route: Route) => void;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  debounceMs?: number;
}

export interface OpponentsUrlSnapshotScheduler {
  schedule: (snapshot: OpponentsTreeUrlState | null) => void;
  clear: () => void;
}

export function isOpponentsTreeRoute(route: Route): boolean {
  return route.name === 'opponents' && route.params['view'] === 'tree';
}

export function opponentsEntryHref(snapshot: OpponentsTreeUrlState | null): string {
  return snapshot ? serializeOpponentsTreeUrlState(snapshot) : '#/opponents';
}

function sameOpponentsTarget(a: OpponentsTreeUrlState, b: OpponentsTreeUrlState): boolean {
  return a.target?.kind === b.target?.kind && a.target?.id === b.target?.id;
}

function sameOpponentsSpeeds(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every(speed => bSet.has(speed));
}

export function opponentsTreeUrlScopesMatch(a: OpponentsTreeUrlState, b: OpponentsTreeUrlState): boolean {
  return sameOpponentsTarget(a, b)
    && a.color === b.color
    && a.range === b.range
    && sameOpponentsSpeeds(a.speeds, b.speeds);
}

export function describeOpponentsInvalidParams(params: readonly OpponentsUrlStateInvalidParam[]): string {
  return params.map(p => `${p.field}=${p.value}`).join(', ');
}

export function opponentsRouteTargetRecoveryMessage(result: OpponentsRouteTargetResult): string {
  switch (result.status) {
    case 'missing-account':
      return `Could not restore that opening tree because account "${result.target.id}" is not saved locally.`;
    case 'missing-collection':
      return `Could not restore that opening tree because collection "${result.target.id}" is not saved locally.`;
    case 'account-no-games':
      return `Could not restore that opening tree because account "${result.account.displayName}" has no local games.`;
    case 'malformed-target':
      return `Could not restore that opening tree because the URL target is invalid (${result.reason}).`;
    case 'saved-collection':
    case 'account-games':
      return '';
  }
}

export function createOpponentsUrlSnapshotScheduler(
  deps: OpponentsUrlSnapshotSchedulerDeps,
): OpponentsUrlSnapshotScheduler {
  const setTimer = deps.setTimeout ?? setTimeout;
  const clearTimer = deps.clearTimeout ?? clearTimeout;
  const debounceMs = deps.debounceMs ?? 50;
  let pendingSnapshot: OpponentsTreeUrlState | null | undefined;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;

  function clear(): void {
    if (pendingTimer) clearTimer(pendingTimer);
    pendingTimer = null;
    pendingSnapshot = undefined;
  }

  function flush(): void {
    pendingTimer = null;
    if (pendingSnapshot === undefined) return;
    if (!isOpponentsTreeRoute(deps.getCurrentRoute())) {
      pendingSnapshot = undefined;
      return;
    }

    const snapshot = pendingSnapshot;
    pendingSnapshot = undefined;
    const nextRoute = deps.replaceHashRoute(opponentsEntryHref(snapshot)).route;
    deps.setCurrentRoute(nextRoute);
  }

  function schedule(snapshot: OpponentsTreeUrlState | null): void {
    pendingSnapshot = snapshot;
    if (pendingTimer) clearTimer(pendingTimer);
    pendingTimer = setTimer(flush, debounceMs);
  }

  return { schedule, clear };
}
