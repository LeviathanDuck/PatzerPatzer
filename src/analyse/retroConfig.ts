// Persisted configuration for Learn From Your Mistakes candidate selection.
// Mirrors the pattern of src/engine/tactics.ts missedMomentConfig but adds
// localStorage persistence so settings survive page reloads.
//
// CCP-136: retroConfig is read by buildRetroCandidates() in retro.ts for both
// candidate gates (minClassification loss floor and missedMateDistance).
// main.ts wires onRetroConfigChange(rebuildRetroSession) so any change to
// retroConfig immediately rebuilds the active session with the new parameters.

export interface RetroConfig {
  /**
   * Minimum move classification to include as a candidate.
   * Controls the win-chance loss floor for candidate selection.
   *   'inaccuracy' — loss >= 0.05  (Lichess parity: |povDiff| > 0.1 un-halved)
   *   'mistake'    — loss >= 0.10  (default; current Patzer behavior)
   *   'blunder'    — loss >= 0.15  (strictest; only large blunders)
   *
   * Thresholds mirror src/engine/winchances.ts LOSS_THRESHOLDS and
   * lichess-org/lila: ui/analyse/src/nodeFinder.ts evalSwings.
   */
  minClassification: 'inaccuracy' | 'mistake' | 'blunder';

  /**
   * Maximum forced-mate distance for the missed-mate special case.
   * A position where mate in ≤ N was available but not played qualifies
   * regardless of minClassification.  Set to 0 to disable.
   * Lichess default: 3.  Mirrors nodeFinder.ts: |prev.eval.mate| <= 3.
   */
  missedMateDistance: number;

  // ── Collapse (blown win) family ─────────────────────────────────────────
  // Patzer extension: surfaces positions where the user was clearly winning
  // but squandered the advantage in one move.  Default: OFF.

  /** Master toggle for the collapse family. */
  collapseEnabled: boolean;
  /** Minimum mover win-chances before the move for collapse to trigger. Range [0, 1]. */
  collapseWcFloor: number;
  /** Minimum win-chance loss to trigger a collapse flag. */
  collapseDropMin: number;

  // ── Defensive resource family ───────────────────────────────────────────
  // Patzer extension: surfaces positions where the user was worse but missed
  // a saving move or significantly better defense.  Default: OFF.

  /** Master toggle for the defensive-resource family. */
  defensiveEnabled: boolean;
  /** Maximum mover win-chances before the move (must be losing/worse). Range [0, 1]. */
  defensiveWcCeiling: number;
  /** Minimum gap between best move and played move to qualify as a salvage. */
  defensiveSalvageMin: number;

  // ── Punish-the-blunder family ───────────────────────────────────────────
  // Patzer extension: surfaces positions where the opponent blundered and
  // the user failed to exploit it.  Default: OFF.

  /** Master toggle for the punish-the-blunder family. */
  punishEnabled: boolean;
  /** Minimum win-chance swing created by the opponent's blunder (scaled 0–0.5). */
  punishOpponentSwingMin: number;
  /** Minimum win-chance loss in the user's reply (failure to exploit). */
  punishExploitDropMin: number;
}

// ── Defaults ─────────────────────────────────────────────────────────────────
// Values that reproduce today's buildRetroCandidates behavior exactly.
export const RETRO_CONFIG_DEFAULTS: Readonly<RetroConfig> = {
  minClassification:      'mistake',
  missedMateDistance:      3,
  collapseEnabled:        false,
  collapseWcFloor:        0.65,
  collapseDropMin:        0.15,
  defensiveEnabled:       false,
  defensiveWcCeiling:     0.35,
  defensiveSalvageMin:    0.15,
  punishEnabled:          false,
  punishOpponentSwingMin: 0.15,
  punishExploitDropMin:   0.10,
};

// ── Persistence ───────────────────────────────────────────────────────────────
const RETRO_CONFIG_LS_KEY = 'retroConfig';

const VALID_CLASSIFICATIONS = new Set<string>(['inaccuracy', 'mistake', 'blunder']);

function loadFromStorage(): RetroConfig {
  try {
    const stored = localStorage.getItem(RETRO_CONFIG_LS_KEY);
    if (stored === null) return { ...RETRO_CONFIG_DEFAULTS };
    const p = JSON.parse(stored) as Partial<RetroConfig>;
    return {
      minClassification: VALID_CLASSIFICATIONS.has(p.minClassification as string)
        ? (p.minClassification as RetroConfig['minClassification'])
        : RETRO_CONFIG_DEFAULTS.minClassification,
      missedMateDistance:
        typeof p.missedMateDistance === 'number' && p.missedMateDistance >= 0
          ? Math.floor(p.missedMateDistance)
          : RETRO_CONFIG_DEFAULTS.missedMateDistance,
      collapseEnabled:
        typeof p.collapseEnabled === 'boolean' ? p.collapseEnabled : RETRO_CONFIG_DEFAULTS.collapseEnabled,
      collapseWcFloor:
        typeof p.collapseWcFloor === 'number' && p.collapseWcFloor >= 0 && p.collapseWcFloor <= 1
          ? p.collapseWcFloor : RETRO_CONFIG_DEFAULTS.collapseWcFloor,
      collapseDropMin:
        typeof p.collapseDropMin === 'number' && p.collapseDropMin >= 0
          ? p.collapseDropMin : RETRO_CONFIG_DEFAULTS.collapseDropMin,
      defensiveEnabled:
        typeof p.defensiveEnabled === 'boolean' ? p.defensiveEnabled : RETRO_CONFIG_DEFAULTS.defensiveEnabled,
      defensiveWcCeiling:
        typeof p.defensiveWcCeiling === 'number' && p.defensiveWcCeiling >= 0 && p.defensiveWcCeiling <= 1
          ? p.defensiveWcCeiling : RETRO_CONFIG_DEFAULTS.defensiveWcCeiling,
      defensiveSalvageMin:
        typeof p.defensiveSalvageMin === 'number' && p.defensiveSalvageMin >= 0
          ? p.defensiveSalvageMin : RETRO_CONFIG_DEFAULTS.defensiveSalvageMin,
      punishEnabled:
        typeof p.punishEnabled === 'boolean' ? p.punishEnabled : RETRO_CONFIG_DEFAULTS.punishEnabled,
      punishOpponentSwingMin:
        typeof p.punishOpponentSwingMin === 'number' && p.punishOpponentSwingMin >= 0
          ? p.punishOpponentSwingMin : RETRO_CONFIG_DEFAULTS.punishOpponentSwingMin,
      punishExploitDropMin:
        typeof p.punishExploitDropMin === 'number' && p.punishExploitDropMin >= 0
          ? p.punishExploitDropMin : RETRO_CONFIG_DEFAULTS.punishExploitDropMin,
    };
  } catch {
    return { ...RETRO_CONFIG_DEFAULTS };
  }
}

/** Live in-memory config.  Mutated by setRetroConfig(); read by buildRetroCandidates(). */
export const retroConfig: RetroConfig = loadFromStorage();

// ── Change callbacks ──────────────────────────────────────────────────────────
const _changeCallbacks: (() => void)[] = [];

/** Register a callback that fires whenever retroConfig is updated. */
export function onRetroConfigChange(cb: () => void): void {
  _changeCallbacks.push(cb);
}

/**
 * Apply a partial config update, persist to localStorage, and notify listeners.
 * Mirrors src/engine/tactics.ts setMissedMomentConfig pattern.
 */
export function setRetroConfig(patch: Partial<RetroConfig>): void {
  Object.assign(retroConfig, patch);
  localStorage.setItem(RETRO_CONFIG_LS_KEY, JSON.stringify(retroConfig));
  _changeCallbacks.forEach(cb => cb());
}

/** Reset to defaults, persist, and notify. */
export function resetRetroConfig(): void {
  setRetroConfig({ ...RETRO_CONFIG_DEFAULTS });
}
