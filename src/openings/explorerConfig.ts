/**
 * Opening Explorer — config state and localStorage persistence.
 *
 * Owns DB selection, speed/rating/mode filters, player name history,
 * color toggle, and per-DB date ranges. All settings persist to
 * localStorage using the same key names as Lichess.
 *
 * Adapted from lichess-org/lila: ui/analyse/src/explorer/explorerConfig.ts
 */

import type { ExplorerDb, ExplorerSpeed, ExplorerMode } from './explorer';

// localStorage keys — matching Lichess key names for future compatibility
const LS_DB          = 'explorer.db2.standard';
const LS_SPEED       = 'explorer.speed';
const LS_RATING      = 'analyse.explorer.rating';
const LS_MODE        = 'explorer.mode';
const LS_PLAYER_NAME = 'analyse.explorer.player.name';
const LS_PLAYER_PREV = 'explorer.player.name.previous';
const LS_SINCE_PFX   = 'analyse.explorer.since-2.';
const LS_UNTIL_PFX   = 'analyse.explorer.until-2.';

export const ALL_SPEEDS: ExplorerSpeed[] = [
  'ultraBullet', 'bullet', 'blitz', 'rapid', 'classical', 'correspondence',
];
export const ALL_RATINGS = [400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
export const ALL_MODES: ExplorerMode[] = ['casual', 'rated'];

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch { /* ignore malformed stored values */ }
  return fallback;
}

export class ExplorerConfig {
  db: ExplorerDb;
  speeds: ExplorerSpeed[];
  ratings: number[];
  modes: ExplorerMode[];
  playerName: string;
  playerPrevious: string[];
  color: 'white' | 'black';
  sinceByDb: Record<ExplorerDb, string>;
  untilByDb: Record<ExplorerDb, string>;

  constructor() {
    this.db = (localStorage.getItem(LS_DB) as ExplorerDb | null) || 'lichess';
    this.speeds = loadJson<ExplorerSpeed[]>(LS_SPEED, ALL_SPEEDS.slice(1));
    this.ratings = loadJson<number[]>(LS_RATING, ALL_RATINGS.slice(1));
    this.modes = loadJson<ExplorerMode[]>(LS_MODE, ALL_MODES);
    this.playerName = localStorage.getItem(LS_PLAYER_NAME) || '';
    this.playerPrevious = loadJson<string[]>(LS_PLAYER_PREV, []);
    this.color = 'white';
    this.sinceByDb = {
      lichess: localStorage.getItem(LS_SINCE_PFX + 'lichess') || '',
      masters: localStorage.getItem(LS_SINCE_PFX + 'masters') || '',
      player:  localStorage.getItem(LS_SINCE_PFX + 'player')  || '',
    };
    this.untilByDb = {
      lichess: localStorage.getItem(LS_UNTIL_PFX + 'lichess') || '',
      masters: localStorage.getItem(LS_UNTIL_PFX + 'masters') || '',
      player:  localStorage.getItem(LS_UNTIL_PFX + 'player')  || '',
    };
  }

  setDb(db: ExplorerDb): void {
    this.db = db;
    localStorage.setItem(LS_DB, db);
  }

  toggleSpeed(speed: ExplorerSpeed): void {
    if (this.speeds.includes(speed)) {
      if (this.speeds.length > 1) this.speeds = this.speeds.filter(s => s !== speed);
    } else {
      this.speeds = [...this.speeds, speed];
    }
    localStorage.setItem(LS_SPEED, JSON.stringify(this.speeds));
  }

  toggleRating(rating: number): void {
    if (this.ratings.includes(rating)) {
      if (this.ratings.length > 1) this.ratings = this.ratings.filter(r => r !== rating);
    } else {
      this.ratings = [...this.ratings, rating];
    }
    localStorage.setItem(LS_RATING, JSON.stringify(this.ratings));
  }

  toggleMode(mode: ExplorerMode): void {
    if (this.modes.includes(mode)) {
      if (this.modes.length > 1) this.modes = this.modes.filter(m => m !== mode);
    } else {
      this.modes = [...this.modes, mode];
    }
    localStorage.setItem(LS_MODE, JSON.stringify(this.modes));
  }

  setPlayerName(name: string): void {
    this.playerName = name;
    localStorage.setItem(LS_PLAYER_NAME, name);
    if (name && !this.playerPrevious.includes(name)) {
      this.playerPrevious = [name, ...this.playerPrevious].slice(0, 20);
      localStorage.setItem(LS_PLAYER_PREV, JSON.stringify(this.playerPrevious));
    }
  }

  removePlayerFromHistory(name: string): void {
    this.playerPrevious = this.playerPrevious.filter(n => n !== name);
    localStorage.setItem(LS_PLAYER_PREV, JSON.stringify(this.playerPrevious));
  }

  toggleColor(): void {
    this.color = this.color === 'white' ? 'black' : 'white';
  }

  setSince(since: string): void {
    this.sinceByDb[this.db] = since;
    localStorage.setItem(LS_SINCE_PFX + this.db, since);
  }

  setUntil(until: string): void {
    this.untilByDb[this.db] = until;
    localStorage.setItem(LS_UNTIL_PFX + this.db, until);
  }

  since(): string { return this.sinceByDb[this.db] || ''; }
  until(): string { return this.untilByDb[this.db] || ''; }
}
