export interface Route {
  name: string;
  params: Record<string, string>;
  query?: string;
}

export type HashRouteWriteMode = 'push' | 'replace';

export interface HashRouteWriteOptions {
  mode?: HashRouteWriteMode;
}

export interface HashRouteWriteResult {
  changed: boolean;
  route: Route;
  url: string;
}

// Order matters — more specific patterns first
const routes: { pattern: string[]; name: string; params?: Record<string, string> }[] = [
  { pattern: ['analysis', ':id'], name: 'analysis-game' },
  { pattern: ['analysis'], name: 'analysis' },
  { pattern: ['opponents', 'tree'], name: 'opponents', params: { view: 'tree' } },
  { pattern: ['opponents'], name: 'opponents' },
  { pattern: ['openings'], name: 'opponents' },
  { pattern: ['stats'], name: 'stats' },
  { pattern: ['games'], name: 'games' },
  { pattern: ['puzzles', ':id'], name: 'puzzle-round' },
  { pattern: ['puzzles'], name: 'puzzles' },
  { pattern: ['study', ':id'], name: 'study-detail' },
  { pattern: ['study'], name: 'study' },
  { pattern: ['editor'], name: 'editor' },
  { pattern: ['sync'], name: 'sync' },
  { pattern: ['admin'], name: 'admin' },
  { pattern: [], name: 'analysis' },
];

export function splitHashPathAndQuery(hash: string): { path: string; query: string } {
  const withoutHash = hash.replace(/^#\/?/, '');
  const queryStart = withoutHash.indexOf('?');
  if (queryStart === -1) return { path: withoutHash, query: '' };
  return {
    path:  withoutHash.slice(0, queryStart),
    query: withoutHash.slice(queryStart + 1),
  };
}

export function parse(hash: string): Route {
  const { path, query } = splitHashPathAndQuery(hash);
  const parts = path ? path.split('/') : [];

  for (const { pattern, name, params: fixedParams } of routes) {
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = { ...(fixedParams ?? {}) };
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      const seg = pattern[i];
      if (!seg) {
        matched = false;
        break;
      }
      if (seg.startsWith(':')) {
        params[seg.slice(1)] = parts[i]!;
      } else if (seg !== parts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { name, params, query };
  }

  return { name: 'analysis', params: {}, query };
}

export function normalizeHashRoute(hashRoute: string): string {
  if (hashRoute === '' || hashRoute === '#') return '#/';
  if (hashRoute.startsWith('#/')) return hashRoute;
  if (hashRoute.startsWith('#')) return `#/${hashRoute.slice(1)}`;
  if (hashRoute.startsWith('/')) return `#${hashRoute}`;
  return `#/${hashRoute}`;
}

export function hashRouteUrl(hashRoute: string, pathname: string, search: string): string {
  return `${pathname}${search}${normalizeHashRoute(hashRoute)}`;
}

export function writeHashRoute(hashRoute: string, options: HashRouteWriteOptions = {}): HashRouteWriteResult {
  const normalizedHashRoute = normalizeHashRoute(hashRoute);
  const url = hashRouteUrl(normalizedHashRoute, window.location.pathname, window.location.search);
  if (window.location.hash === normalizedHashRoute) {
    return { changed: false, route: current(), url };
  }

  if (options.mode === 'replace') {
    window.history.replaceState(null, '', url);
  } else {
    window.location.hash = normalizedHashRoute;
  }

  return { changed: true, route: current(), url };
}

export function replaceHashRoute(hashRoute: string): HashRouteWriteResult {
  return writeHashRoute(hashRoute, { mode: 'replace' });
}

export function current(): Route {
  return parse(window.location.hash);
}

export function onChange(fn: (route: Route) => void): void {
  window.addEventListener('hashchange', () => fn(current()));
}
