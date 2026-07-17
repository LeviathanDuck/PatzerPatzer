import {
  createAppearanceController,
  type AppearanceController,
  type AppearanceMediaQuery,
  type AppearanceStorage,
  type ResolvedAppearanceTheme,
} from './index';
import {
  createInterfaceMotionController,
  type InterfaceMotionController,
  type InterfaceMotionMediaQuery,
} from './model';

const LIGHT_QUERY = '(prefers-color-scheme: light)';
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
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

function createLazyMediaQuery(win: BrowserWindow, queryText = LIGHT_QUERY): AppearanceMediaQuery & InterfaceMotionMediaQuery {
  let initialized = false;
  let mediaQuery: BrowserMediaQueryList | null = null;
  const listenerAdapters = new Map<(matches: boolean) => void, (event: { matches: boolean }) => void>();

  const getMediaQuery = (): BrowserMediaQueryList | null => {
    if (initialized) return mediaQuery;
    initialized = true;
    try {
      if (typeof win.matchMedia === 'function') mediaQuery = win.matchMedia(queryText);
    } catch {
      mediaQuery = null;
    }
    return mediaQuery;
  };

  return {
    get matches(): boolean { return getMediaQuery()?.matches ?? false; },
    addChangeListener(listener): void {
      if (listenerAdapters.has(listener)) return;
      const query = getMediaQuery();
      if (!query) return;
      const adapter = (event: { matches: boolean }) => listener(event.matches);
      if (typeof query.addEventListener === 'function') query.addEventListener('change', adapter);
      else if (typeof query.addListener === 'function') query.addListener(adapter);
      else return;
      listenerAdapters.set(listener, adapter);
    },
    removeChangeListener(listener): void {
      const adapter = listenerAdapters.get(listener);
      if (!adapter) return;
      const query = getMediaQuery();
      if (typeof query?.removeEventListener === 'function') query.removeEventListener('change', adapter);
      else query?.removeListener?.(adapter);
      listenerAdapters.delete(listener);
    },
  };
}

export function createBrowserInterfaceMotionController(
  environment: BrowserAppearanceEnvironment = {},
): InterfaceMotionController {
  const win = environment.window ?? (window as unknown as BrowserWindow);
  const doc = environment.document ?? (document as unknown as BrowserDocument);
  return createInterfaceMotionController({
    storage: {
      getItem: key => win.localStorage.getItem(key),
      setItem: (key, value) => win.localStorage.setItem(key, value),
      removeItem: key => win.localStorage.removeItem?.(key),
    },
    mediaQuery: createLazyMediaQuery(win, REDUCED_MOTION_QUERY),
    apply: state => { doc.documentElement.dataset.motion = state.reduced ? 'reduced' : 'full'; },
  });
}

export function createBrowserAppearanceController(
  environment: BrowserAppearanceEnvironment = {},
): AppearanceController {
  const win = environment.window ?? (window as unknown as BrowserWindow);
  const doc = environment.document ?? (document as unknown as BrowserDocument);
  const storage: AppearanceStorage = {
    getItem: key => win.localStorage.getItem(key),
    setItem: (key, value) => win.localStorage.setItem(key, value),
    removeItem: key => win.localStorage.removeItem?.(key),
  };

  return createAppearanceController({
    storage,
    mediaQuery: createLazyMediaQuery(win),
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
