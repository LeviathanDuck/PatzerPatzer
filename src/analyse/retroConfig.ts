// Persisted configuration for Learn From Your Mistakes candidate selection.
// Mirrors the pattern of src/engine/tactics.ts missedMomentConfig but adds
// localStorage persistence so settings survive page reloads.
//
// CCP-134: config ownership and defaults only — no menu UI, no wiring into
// buildRetroCandidates yet (deferred to CCP-136).

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
}

// ── Defaults ─────────────────────────────────────────────────────────────────
// Values that reproduce today's buildRetroCandidates behavior exactly.
export const RETRO_CONFIG_DEFAULTS: Readonly<RetroConfig> = {
  minClassification:  'mistake',
  missedMateDistance: 3,
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
