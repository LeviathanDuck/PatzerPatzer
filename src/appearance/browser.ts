import {
  createAppearanceController,
  type AppearanceController,
  type AppearanceMediaQuery,
  type AppearanceStorage,
  type ResolvedAppearanceTheme,
} from './index';

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const THEME_COLORS: Record<ResolvedAppearanceTheme, string> = {
  dark: '#101212',
  light: '#f3efe6',
};

interface BrowserMediaQueryList {
  readonly matches: boolean;
  addEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  removeEventListener?(type: 'change', listener: (event: { matches: boolean }) => void): void;
  addListener?(listener: (event: { matches: boolean }) => void): void;
  removeListener?(listener: (event: { matches: boolean }) => void): void;
}

interface BrowserWindow {
  readonly localStorage: AppearanceStorage;
  matchMedia?(query: string): BrowserMediaQueryList;
}

interface BrowserMetadataElement {
  setAttribute(name: string, value: string): void;
}

interface BrowserDocument {
  readonly documentElement: {
    readonly dataset: Record<string, string | undefined>;
    readonly style: { colorScheme: string };
  };
  querySelector(selector: string): BrowserMetadataElement | null;
}

export interface BrowserAppearanceEnvironment {
  window?: BrowserWindow;
  document?: BrowserDocument;
}

function createMediaQuery(win: BrowserWindow): AppearanceMediaQuery | null {
  let mediaQuery: BrowserMediaQueryList;
  try {
    if (typeof win.matchMedia !== 'function') return null;
    mediaQuery = win.matchMedia(LIGHT_QUERY);
  } catch {
    return null;
  }

  const listenerAdapters = new Map<(matches: boolean) => void, (event: { matches: boolean }) => void>();
  return {
    get matches(): boolean { return mediaQuery.matches; },
    addChangeListener(listener): void {
      if (listenerAdapters.has(listener)) return;
      const adapter = (event: { matches: boolean }) => listener(event.matches);
      listenerAdapters.set(listener, adapter);
      if (typeof mediaQuery.addEventListener === 'function') mediaQuery.addEventListener('change', adapter);
      else mediaQuery.addListener?.(adapter);
    },
    removeChangeListener(listener): void {
      const adapter = listenerAdapters.get(listener);
      if (!adapter) return;
      if (typeof mediaQuery.removeEventListener === 'function') mediaQuery.removeEventListener('change', adapter);
      else mediaQuery.removeListener?.(adapter);
      listenerAdapters.delete(listener);
    },
  };
}

export function createBrowserAppearanceController(
  environment: BrowserAppearanceEnvironment = {},
): AppearanceController {
  const win = environment.window ?? (window as unknown as BrowserWindow);
  const doc = environment.document ?? (document as unknown as BrowserDocument);
  const storage: AppearanceStorage = {
    getItem: key => win.localStorage.getItem(key),
    setItem: (key, value) => win.localStorage.setItem(key, value),
  };

  return createAppearanceController({
    storage,
    mediaQuery: createMediaQuery(win),
    dom: {
      setRootPreference: preference => { doc.documentElement.dataset.appearance = preference; },
      setRootTheme: theme => { doc.documentElement.dataset.theme = theme; },
      setColorScheme: theme => {
        doc.documentElement.style.colorScheme = theme;
        doc.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
      },
      setThemeColor: theme => {
        doc.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
      },
    },
  });
}
