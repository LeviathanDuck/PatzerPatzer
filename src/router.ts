export interface Route {
  name: string;
  params: Record<string, string>;
}

// Order matters — more specific patterns first
const routes: { pattern: string[]; name: string }[] = [
  { pattern: ['analysis', ':id'], name: 'analysis-game' },
  { pattern: ['analysis'], name: 'analysis' },
  { pattern: ['opponents'], name: 'opponents' },
  { pattern: ['openings'], name: 'opponents' },
  { pattern: ['stats'], name: 'stats' },
  { pattern: ['games'], name: 'games' },
  { pattern: ['puzzles', ':id'], name: 'puzzle-round' },
  { pattern: ['puzzles'], name: 'puzzles' },
  { pattern: ['study', ':id'], name: 'study-detail' },
  { pattern: ['study'], name: 'study' },
  { pattern: ['admin'], name: 'admin' },
  { pattern: [], name: 'analysis' },
];

function parse(hash: string): Route {
  const path = hash.replace(/^#\/?/, '');
  const parts = path ? path.split('/') : [];

  for (const { pattern, name } of routes) {
    if (pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
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
    if (matched) return { name, params };
  }

  return { name: 'analysis', params: {} };
}

export function current(): Route {
  return parse(window.location.hash);
}

export function onChange(fn: (route: Route) => void): void {
  window.addEventListener('hashchange', () => fn(current()));
}
