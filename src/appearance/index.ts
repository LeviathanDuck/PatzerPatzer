export const APPEARANCE_STORAGE_KEY = 'patzer.appearance.v1';

export type AppearancePreference = 'dark' | 'light' | 'system';
export type ResolvedAppearanceTheme = 'dark' | 'light';

export interface AppearanceState {
  readonly preference: AppearancePreference;
  readonly theme: ResolvedAppearanceTheme;
}

export interface AppearanceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface AppearanceMediaQuery {
  readonly matches: boolean;
  addChangeListener(listener: (matches: boolean) => void): void;
  removeChangeListener(listener: (matches: boolean) => void): void;
}

export interface AppearanceDom {
  setRootPreference?(preference: AppearancePreference): void;
  setRootTheme?(theme: ResolvedAppearanceTheme): void;
  setColorScheme?(theme: ResolvedAppearanceTheme): void;
  setThemeColor?(theme: ResolvedAppearanceTheme): void;
}

export interface AppearanceControllerDependencies {
  storage?: AppearanceStorage | null;
  mediaQuery?: AppearanceMediaQuery | null;
  dom?: AppearanceDom | null;
}

export interface AppearanceController {
  getState(): AppearanceState;
  setPreference(preference: AppearancePreference): void;
  clearPreference(): void;
  subscribe(subscriber: (state: AppearanceState) => void): () => void;
  destroy(): void;
}

export function parseAppearancePreference(value: unknown): AppearancePreference {
  return value === 'dark' || value === 'light' || value === 'system' ? value : 'dark';
}

function readPreference(storage: AppearanceStorage | null | undefined): AppearancePreference {
  try {
    return parseAppearancePreference(storage?.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    return 'dark';
  }
}

function resolveTheme(
  preference: AppearancePreference,
  mediaQuery: AppearanceMediaQuery | null | undefined,
): ResolvedAppearanceTheme {
  if (preference === 'light') return 'light';
  if (preference === 'system' && mediaQuery?.matches) return 'light';
  return 'dark';
}

export function createAppearanceController({
  storage = null,
  mediaQuery = null,
  dom = null,
}: AppearanceControllerDependencies = {}): AppearanceController {
  let state: AppearanceState = {
    preference: readPreference(storage),
    theme: 'dark',
  };
  state = { ...state, theme: resolveTheme(state.preference, mediaQuery) };

  const subscribers = new Set<(state: AppearanceState) => void>();
  let listeningToSystem = false;
  let destroyed = false;

  const apply = (): void => {
    dom?.setRootPreference?.(state.preference);
    dom?.setRootTheme?.(state.theme);
    dom?.setColorScheme?.(state.theme);
    dom?.setThemeColor?.(state.theme);
  };

  const notify = (): void => {
    for (const subscriber of [...subscribers]) subscriber(state);
  };

  const onSystemChange = (matches: boolean): void => {
    if (destroyed || state.preference !== 'system') return;
    const theme: ResolvedAppearanceTheme = matches ? 'light' : 'dark';
    if (theme === state.theme) return;
    state = { ...state, theme };
    apply();
    notify();
  };

  const syncSystemListener = (): void => {
    const shouldListen = !destroyed && state.preference === 'system' && mediaQuery !== null;
    if (shouldListen === listeningToSystem) return;
    if (shouldListen) mediaQuery?.addChangeListener(onSystemChange);
    else mediaQuery?.removeChangeListener(onSystemChange);
    listeningToSystem = shouldListen;
  };

  apply();
  syncSystemListener();

  return {
    getState: () => state,

    setPreference(preference): void {
      try {
        storage?.setItem(APPEARANCE_STORAGE_KEY, preference);
      } catch {
        // Appearance remains usable for this page even when persistence is unavailable.
      }

      const nextState: AppearanceState = {
        preference,
        theme: resolveTheme(preference, mediaQuery),
      };
      if (nextState.preference === state.preference && nextState.theme === state.theme) return;

      state = nextState;
      syncSystemListener();
      apply();
      notify();
    },

    clearPreference(): void {
      try {
        storage?.removeItem?.(APPEARANCE_STORAGE_KEY);
      } catch {
        // A denied localStorage mutation must not abort the remaining full-data wipe.
      }

      const nextState: AppearanceState = { preference: 'dark', theme: 'dark' };
      if (nextState.preference === state.preference && nextState.theme === state.theme) return;

      state = nextState;
      syncSystemListener();
      apply();
      notify();
    },

    subscribe(subscriber): () => void {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      syncSystemListener();
      subscribers.clear();
    },
  };
}
