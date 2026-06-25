import { sanitizeRoute } from './redact';

export interface DiagnosticRouteSnapshot {
  appRoute: string;
  pathRoute: string;
  hashRoute: string;
}

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
