/**
 * Optional Lichess Explorer comparison surface.
 *
 * Fetches opening book data from the Lichess explorer API for a given FEN,
 * allowing the user to compare their opponent's moves against broader book moves.
 *
 * This does not replace the research tree — it is a supplementary comparison only.
 */

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  averageRating: number;
}

export interface ExplorerData {
  fen: string;
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  opening?: { eco: string; name: string };
}

const _cache = new Map<string, ExplorerData>();
let _loading = false;
let _error: string | null = null;
let _enabled = false;
let _data: ExplorerData | null = null;

export function explorerEnabled(): boolean { return _enabled; }
export function explorerLoading(): boolean { return _loading; }
export function explorerError(): string | null { return _error; }
export function explorerData(): ExplorerData | null { return _data; }

export function toggleExplorer(): void {
  _enabled = !_enabled;
  if (!_enabled) {
    _data = null;
    _loading = false;
    _error = null;
  }
}

/** Fetch Lichess explorer data for a FEN. Uses an in-memory cache. */
export async function fetchExplorer(fen: string, redraw: () => void): Promise<void> {
  if (!_enabled) return;

  const cached = _cache.get(fen);
  if (cached) {
    _data = cached;
    _loading = false;
    _error = null;
    redraw();
    return;
  }

  _loading = true;
  _error = null;
  redraw();

  try {
    const params = new URLSearchParams({
      fen,
      speeds: 'blitz,rapid,classical',
      ratings: '1600,1800,2000,2200,2500',
    });
    const url = `https://explorer.lichess.ovh/lichess?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Explorer API error ${res.status}`);
    const json = await res.json() as ExplorerData;
    json.fen = fen;
    _cache.set(fen, json);
    _data = json;
    _loading = false;
    _error = null;
  } catch (err) {
    _loading = false;
    _error = err instanceof Error ? err.message : 'Explorer fetch failed.';
    _data = null;
  }
  redraw();
}
