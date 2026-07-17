import type { AppearancePreference } from './index';
import type { ControlHelpMode } from '../ui/controlHelpPreferences';

export const INTERFACE_MOTION_KEY = 'patzer.appearance.motion.v1';

export type AppearanceSection = 'interface' | 'help' | 'chessboards' | 'graphs-lists';
export type InterfaceMotion = 'full' | 'system' | 'reduced';

export interface InterfaceMotionState {
  readonly preference: InterfaceMotion;
  readonly reduced: boolean;
}

export interface InterfaceMotionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface InterfaceMotionMediaQuery {
  readonly matches: boolean;
  addChangeListener(listener: (matches: boolean) => void): void;
  removeChangeListener(listener: (matches: boolean) => void): void;
}

export interface InterfaceMotionController {
  getState(): InterfaceMotionState;
  setPreference(preference: InterfaceMotion): void;
  reloadPreference(): void;
  clearPreference(): void;
  subscribe(listener: (state: InterfaceMotionState) => void): () => void;
  destroy(): void;
}

export interface AppearanceSnapshot {
  readonly theme: AppearancePreference;
  readonly motion: InterfaceMotion;
  readonly helpMode: ControlHelpMode;
  readonly boardTheme: string;
  readonly pieceSet: string;
  readonly soundEnabled: boolean;
  readonly soundVolume: number;
  readonly wheelNavigation: boolean;
}

export function parseInterfaceMotion(value: unknown): InterfaceMotion {
  return value === 'full' || value === 'reduced' || value === 'system' ? value : 'system';
}

export function formatThemePreference(value: AppearancePreference): string {
  return value === 'dark' ? 'Dark' : value === 'light' ? 'Light' : 'System';
}

export function formatHelpMode(value: ControlHelpMode): string {
  if (value === 'off') return 'Off';
  if (value === 'more-help') return 'More Help';
  return value === 'teaching' ? 'Teaching' : 'Essential';
}

export function formatBoardAndPieces(boardTheme: string, pieceSet: string): string {
  const title = (value: string) => value.replace(/(^|[-_])([a-z])/g, (_match, space, char) => `${space ? ' ' : ''}${char.toUpperCase()}`);
  return `${title(boardTheme)} · ${title(pieceSet)}`;
}

export function formatBoardSounds(enabled: boolean, volume: number): string {
  return `${enabled ? 'On' : 'Off'} · ${Math.round(Math.max(0, Math.min(1, volume)) * 100)}%`;
}

function resolveReduced(preference: InterfaceMotion, mediaQuery: InterfaceMotionMediaQuery | null): boolean {
  return preference === 'reduced' || (preference === 'system' && Boolean(mediaQuery?.matches));
}

export function createInterfaceMotionController({
  storage,
  mediaQuery = null,
  apply = () => {},
}: {
  storage: InterfaceMotionStorage;
  mediaQuery?: InterfaceMotionMediaQuery | null;
  apply?: (state: InterfaceMotionState) => void;
}): InterfaceMotionController {
  let preference: InterfaceMotion;
  try { preference = parseInterfaceMotion(storage.getItem(INTERFACE_MOTION_KEY)); }
  catch { preference = 'system'; }
  let state: InterfaceMotionState = { preference, reduced: resolveReduced(preference, mediaQuery) };
  let listening = false;
  let destroyed = false;
  const subscribers = new Set<(state: InterfaceMotionState) => void>();
  const notify = () => { for (const listener of [...subscribers]) listener(state); };
  const onSystemChange = (matches: boolean): void => {
    if (destroyed || state.preference !== 'system' || state.reduced === matches) return;
    state = { ...state, reduced: matches };
    apply(state);
    notify();
  };
  const syncListener = (): void => {
    const shouldListen = !destroyed && state.preference === 'system' && mediaQuery !== null;
    if (shouldListen === listening) return;
    if (shouldListen) mediaQuery?.addChangeListener(onSystemChange);
    else mediaQuery?.removeChangeListener(onSystemChange);
    listening = shouldListen;
  };
  apply(state);
  syncListener();
  return {
    getState: () => state,
    setPreference(next): void {
      const normalized = parseInterfaceMotion(next);
      try { storage.setItem(INTERFACE_MOTION_KEY, normalized); } catch { /* Runtime remains usable. */ }
      const nextState = { preference: normalized, reduced: resolveReduced(normalized, mediaQuery) };
      if (nextState.preference === state.preference && nextState.reduced === state.reduced) return;
      state = nextState;
      syncListener();
      apply(state);
      notify();
    },
    reloadPreference(): void {
      let nextPreference: InterfaceMotion;
      try { nextPreference = parseInterfaceMotion(storage.getItem(INTERFACE_MOTION_KEY)); }
      catch { nextPreference = 'system'; }
      const nextState = { preference: nextPreference, reduced: resolveReduced(nextPreference, mediaQuery) };
      if (nextState.preference === state.preference && nextState.reduced === state.reduced) return;
      state = nextState;
      syncListener();
      apply(state);
      notify();
    },
    clearPreference(): void {
      try { storage.removeItem(INTERFACE_MOTION_KEY); } catch { /* Runtime remains usable. */ }
      const nextState = { preference: 'system' as const, reduced: resolveReduced('system', mediaQuery) };
      state = nextState;
      syncListener();
      apply(state);
      notify();
    },
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
    destroy(): void { destroyed = true; syncListener(); subscribers.clear(); },
  };
}
