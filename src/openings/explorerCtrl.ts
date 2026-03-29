/**
 * Opening Explorer — controller.
 *
 * State owner for the explorer panel: enabled/loading/failing/hovering/
 * movesAway/cache. Exposes setNode() as the entrypoint for board navigation
 * and provides a config sub-object for DB/filter persistence.
 *
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerCtrl.ts
 */

import { openingFetch, type OpeningData, type OpeningParams, tablebaseFetch, isTablebasePosition, type TablebaseData } from './explorer';
import { ExplorerConfig } from './explorerConfig';

const LS_ENABLED = 'analyse.explorer.enabled';

/** Max ply depth before we stop querying the explorer. */
export const MAX_EXPLORER_DEPTH = 50;

interface Hovering {
  fen: string;
  uci: string;
}

export class ExplorerCtrl {
  enabled: boolean;
  loading: boolean;
  failing: Error | null;
  hovering: Hovering | null;
  movesAway: number;
  gameMenu: string | null;
  /** Whether the config panel is open. */
  configOpen: boolean;
  readonly config: ExplorerConfig;
  /** Populated when the current position is tablebase territory (≤7 pieces). */
  tablebaseData: TablebaseData | null = null;

  private cache = new Map<string, OpeningData>();
  private tablebaseCache = new Map<string, TablebaseData>();
  private abortCtrl: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.enabled = localStorage.getItem(LS_ENABLED) === 'true';
    this.loading = false;
    this.failing = null;
    this.hovering = null;
    this.movesAway = 0;
    this.gameMenu = null;
    this.configOpen = false;
    this.config = new ExplorerConfig();
  }

  toggle(): void {
    this.enabled = !this.enabled;
    localStorage.setItem(LS_ENABLED, String(this.enabled));
    if (!this.enabled) {
      this.abortCtrl?.abort();
      this.loading = false;
      this.failing = null;
      this.movesAway = 0;
    }
  }

  toggleConfig(): void {
    this.configOpen = !this.configOpen;
  }

  setDb(db: import('./explorer').ExplorerDb): void {
    this.config.setDb(db);
    this.cache.clear();
    this.movesAway = 0;
  }

  setHovering(fen: string, uci: string | null): void {
    this.hovering = uci ? { fen, uci } : null;
  }

  current(fen: string): OpeningData | undefined {
    return this.cache.get(fen);
  }

  reload(fen: string, redraw: () => void): void {
    this.cache.clear();
    this.movesAway = 0;
    this.failing = null;
    this.setNode(fen, redraw);
  }

  /**
   * Called on every board navigation.
   * Serves from in-memory cache on hit; debounces fetch on miss.
   * Mirrors ExplorerCtrl.setNode() from lichess-org/lila.
   */
  setNode(fen: string, redraw: () => void): void {
    if (!this.enabled) return;

    this.gameMenu = null;
    const cached = this.cache.get(fen);
    if (cached) {
      this.movesAway = cached.moves.length ? 0 : this.movesAway + 1;
      this.loading = false;
      this.failing = null;
      redraw();
      return;
    }

    this.loading = true;
    this.failing = null;

    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this._fetch(fen, redraw);
    }, 250);
  }

  private _buildParams(fen: string): OpeningParams {
    const { db, speeds, ratings, modes, playerName, color } = this.config;
    const since = this.config.since() || undefined;
    const until = this.config.until() || undefined;

    // topGames and recentGames require a Lichess OAuth token — disabled until auth is supported.
    if (db === 'masters') {
      return {
        db: 'masters',
        fen,
        variant: 'standard',
        ...(since && { since }),
        ...(until && { until }),
        topGames: false,
        recentGames: false,
      };
    }
    if (db === 'lichess') {
      return {
        db: 'lichess',
        fen,
        variant: 'standard',
        speeds,
        ratings,
        ...(since && { since }),
        ...(until && { until }),
        topGames: false,
        recentGames: false,
      };
    }
    // player DB
    if (!playerName) throw new Error('No player name set for explorer player DB');
    return {
      db: 'player',
      fen,
      player: playerName,
      color,
      speeds,
      modes,
      ...(since && { since }),
      ...(until && { until }),
      topGames: false,
      recentGames: false,
    };
  }

  /** True when player DB is selected but no username has been entered yet. */
  get needsPlayerName(): boolean {
    return this.config.db === 'player' && !this.config.playerName;
  }

  private _fetch(fen: string, redraw: () => void): void {
    // Player DB requires a username — show prompt instead of fetching.
    if (this.needsPlayerName) {
      this.loading = false;
      this.failing = null;
      redraw();
      return;
    }

    this.abortCtrl?.abort();
    this.abortCtrl = new AbortController();

    // Tablebase mode: ≤7 pieces → query tablebase.lichess.ovh instead of opening explorer.
    // Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerCtrl.ts
    if (isTablebasePosition(fen)) {
      this.tablebaseData = null;
      const cached = this.tablebaseCache.get(fen);
      if (cached) {
        this.tablebaseData = cached;
        this.loading = false;
        this.failing = null;
        redraw();
        return;
      }
      tablebaseFetch(fen, this.abortCtrl.signal).then(data => {
        this.tablebaseCache.set(fen, data);
        this.tablebaseData = data;
        this.loading = false;
        this.failing = null;
        redraw();
      }).catch((err: Error) => {
        if (err.name === 'AbortError') return;
        this.loading = false;
        this.tablebaseData = null;
        // Tablebase failures are non-fatal — fall through to show opening data if any
        this.failing = null;
        redraw();
      });
      return;
    }

    this.tablebaseData = null;

    let params: OpeningParams;
    try {
      params = this._buildParams(fen);
    } catch (err) {
      this.loading = false;
      this.failing = err instanceof Error ? err : new Error('Config error');
      redraw();
      return;
    }

    const merged: Partial<OpeningData> = {};

    openingFetch(params, chunk => {
      Object.assign(merged, chunk);
      if ('moves' in merged) {
        const data = merged as OpeningData;
        this.cache.set(fen, data);
        this.movesAway = data.moves.length ? 0 : this.movesAway + 1;
        this.loading = false;
        this.failing = null;
        redraw();
      }
    }, this.abortCtrl.signal).catch((err: Error) => {
      if (err.name === 'AbortError') return;
      this.loading = false;
      this.failing = err;
      redraw();
    });
  }
}

/** Module-level singleton. Shared across openings page and analysis board. */
export const explorerCtrl = new ExplorerCtrl();
