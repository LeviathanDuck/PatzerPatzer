import { sanitizeRoute } from './redact';

export interface DiagnosticRouteSnapshot {
  appRoute: string;
  pathRoute: string;
  hashRoute: string;
}








const SAFE_QUERY_PARAM_KEYS = new Set<string>([
  'kind', 'severity', 'start', 'end', 'mode', 'sessions', 'page', 'rpage', 'range', 'period',
]);

function hashRouteFromHash(hash: string): string {
  if (!hash.startsWith('#/')) return '';
  return sanitizeRoute(hash.slice(1));
}

export function routeSnapshotFromLocationParts(pathname: string, hash: string): DiagnosticRouteSnapshot {
  const pathRoute = sanitizeRoute(pathname || '');
  const hashRoute = hashRouteFromHash(hash || '');

  return {
    appRoute: hashRoute || pathRoute,
    pathRoute,
    hashRoute,
  };
}

export function sanitizeAppRoute(route: string): string {
  if (route.startsWith('#/')) return sanitizeRoute(route.slice(1));
  return sanitizeRoute(route);
}

export function safeRouteQueryParamsFromSearch(search: string): Record<string, string> {
  const params: Record<string, string> = {};

  try {
    const searchParams = new URLSearchParams(search);
    searchParams.forEach((value, key) => {
      if (!SAFE_QUERY_PARAM_KEYS.has(key)) return;
      params[key] = value;
    });
  } catch {
    return {};
  }

  return params;
}

export function currentSafeRouteQueryParams(): Record<string, string> {
  try {
    if (typeof window === 'undefined') return {};
    // For hash-routed apps, route-owned params live in the hash query
    // (e.g. #/admin/diagnostics?kind=error). Read hash query first; fall back
    // to window.location.search for non-hash query strings.
    const hash = window.location.hash ?? '';
    const hashQStart = hash.indexOf('?');
    const hashQuery = hashQStart >= 0 ? hash.slice(hashQStart) : '';
    const search = window.location.search || '';
    const queryString = hashQuery || search;
    return safeRouteQueryParamsFromSearch(queryString);
  } catch {
    return {};
  }
}

export function currentRouteSnapshot(): DiagnosticRouteSnapshot {
  try {
    if (typeof window === 'undefined') {
      return {
        appRoute: '',
        pathRoute: '',
        hashRoute: '',
      };
    }

    return routeSnapshotFromLocationParts(window.location.pathname || '', window.location.hash || '');
  } catch {
    return {
      appRoute: '',
      pathRoute: '',
      hashRoute: '',
    };
  }
}

export function currentAppRoute(fallback = ''): string {
  const route = currentRouteSnapshot().appRoute;
  return route || fallback;
}
