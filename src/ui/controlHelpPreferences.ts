export type ControlHelpMode = 'off' | 'essential' | 'teaching' | 'more-help';
export type TeachingCadence = 'gentle' | 'balanced' | 'frequent';

export const CONTROL_HELP_KEYS = Object.freeze({
  mode: 'patzer.controlHelp.mode',
  hoverDelayMs: 'patzer.controlHelp.hoverDelayMs',
  teachingCadence: 'patzer.controlHelp.teachingCadence',
  learningGeneration: 'patzer.controlHelp.learningGeneration',
});

export const CONTROL_HELP_LEARNED_PREFIX = 'patzer.controlHelp.learned.';
export const CONTROL_HELP_SNOOZED_PREFIX = 'patzer.controlHelp.snoozed.';
export const SETTINGS_LIVE_APPLY_EVENT = 'patzer:settings-live-apply';
export const CONTROL_HELP_DEFAULT_DELAY_MS = 650;
export const CONTROL_HELP_MIN_DELAY_MS = 250;
export const CONTROL_HELP_MAX_DELAY_MS = 1500;

const ESTABLISHED_PREFERENCE_KEYS = new Set([
  'boardWheelNavEnabled',
  'reviewDotsUserOnly',
  'boardZoom',
  'boardTheme',
  'pieceSet',
  'chessBoardAnimationSpeed',
  'puzzleBoardAnimationSpeed',
  'boardSoundEnabled',
  'boardSoundVolume',
  'missedMomentConfig',
  'retroConfig',
  'puzzleAutoNext',
]);

const RESTORABLE_IDENTITY_KEYS = new Set([
  'patzer.lichess.clientAuth',
  'chesspatzer.remoteSync.adminSyncToken',
  'patzer.account.activeIdentity',
]);

const ESTABLISHED_PREFERENCE_PREFIXES = [
  'patzer.',
  'analyse.',
  'explorer.',
  'boardFilter.',
];

const DOMAIN_STORES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'chess-patzer': ['accounts', 'games', 'studies', 'analysis-library'],
  'patzer-puzzle-v1': ['definitions', 'attempts', 'user-meta'],
});

export interface ControlHelpStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ControlHelpEventSource {
  addEventListener(type: string, listener: (event: { detail?: unknown }) => void): void;
  removeEventListener(type: string, listener: (event: { detail?: unknown }) => void): void;
}

export interface ControlHelpState {
  readonly ready: boolean;
  readonly establishedProfile: boolean;
  readonly mode: ControlHelpMode;
  readonly hoverDelayMs: number;
  readonly teachingCadence: TeachingCadence;
  readonly learningGeneration: number;
}

export interface ControlHelpController {
  getState(): ControlHelpState;
  initialize(): Promise<void>;
  setMode(mode: ControlHelpMode): void;
  setHoverDelayMs(delayMs: number): void;
  setTeachingCadence(cadence: TeachingCadence): void;
  resetTeachingTips(): void;
  markLearned(featureId: string, tipVersion: number, at?: number): void;
  isLearned(featureId: string, tipVersion: number): boolean;
  snooze(featureId: string, tipVersion: number, until: number): void;
  snoozedUntil(featureId: string, tipVersion: number): number;
  learnedCount(): number;
  subscribe(listener: (state: ControlHelpState) => void): () => void;
  destroy(): void;
}

export interface EstablishedControlHelpProfileInputs {
  storage: ControlHelpStorage;
  hasDomainData(): Promise<boolean>;
  hasRestorableIdentity(): boolean;
  hasHydratedAccountData(): boolean;
}

export interface CreateControlHelpControllerOptions {
  storage: ControlHelpStorage;
  events?: ControlHelpEventSource | null;
  classifyEstablishedProfile?: () => Promise<boolean>;
  now?: () => number;
}

interface LearnedRecord {
  generation: number;
  at: number;
}

interface SnoozedRecord {
  generation: number;
  until: number;
}

export function parseControlHelpMode(value: unknown): ControlHelpMode | null {
  return value === 'off' || value === 'essential' || value === 'teaching' || value === 'more-help'
    ? value
    : null;
}

export function parseTeachingCadence(value: unknown): TeachingCadence | null {
  return value === 'gentle' || value === 'balanced' || value === 'frequent' ? value : null;
}

export function normalizeControlHelpDelay(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return CONTROL_HELP_DEFAULT_DELAY_MS;
  return Math.min(CONTROL_HELP_MAX_DELAY_MS, Math.max(CONTROL_HELP_MIN_DELAY_MS, Math.round(parsed)));
}

function normalizeGeneration(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
}

function validatedTipIdentity(featureId: string, tipVersion: number): string {
  const normalizedId = featureId.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalizedId)) {
    throw new TypeError('Teaching feature IDs must be stable lowercase kebab-case identifiers.');
  }
  if (!Number.isInteger(tipVersion) || tipVersion < 1) {
    throw new TypeError('Teaching tip versions must be positive integers.');
  }
  return `${normalizedId}.${tipVersion}`;
}

export function controlHelpLearnedKey(featureId: string, tipVersion: number): string {
  return `${CONTROL_HELP_LEARNED_PREFIX}${validatedTipIdentity(featureId, tipVersion)}`;
}

export function controlHelpSnoozedKey(featureId: string, tipVersion: number): string {
  return `${CONTROL_HELP_SNOOZED_PREFIX}${validatedTipIdentity(featureId, tipVersion)}`;
}

export function isControlHelpSettingKey(key: string): boolean {
  return Object.values(CONTROL_HELP_KEYS).includes(key as never)
    || key.startsWith(CONTROL_HELP_LEARNED_PREFIX)
    || key.startsWith(CONTROL_HELP_SNOOZED_PREFIX);
}

function storedKeys(storage: ControlHelpStorage): string[] {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key) keys.push(key);
    }
  } catch {
    // Storage denial means no local evidence; other profile probes still run.
  }
  return keys;
}

function hasExistingPatzerPreference(storage: ControlHelpStorage): boolean {
  return storedKeys(storage).some(key => {
    if (isControlHelpSettingKey(key) || RESTORABLE_IDENTITY_KEYS.has(key)) return false;
    return ESTABLISHED_PREFERENCE_KEYS.has(key)
      || ESTABLISHED_PREFERENCE_PREFIXES.some(prefix => key.startsWith(prefix));
  });
}

export async function classifyEstablishedControlHelpProfile({
  storage,
  hasDomainData,
  hasRestorableIdentity,
  hasHydratedAccountData,
}: EstablishedControlHelpProfileInputs): Promise<boolean> {
  if (hasExistingPatzerPreference(storage)) return true;
  if (hasRestorableIdentity() || hasHydratedAccountData()) return true;
  try {
    return await hasDomainData();
  } catch {
    // Fail safe: storage uncertainty must not produce unsolicited Teaching UI.
    return true;
  }
}

function parseRecord<T extends LearnedRecord | SnoozedRecord>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as Partial<T>;
    if (!record || typeof record !== 'object') return null;
    if (!Number.isInteger(record.generation) || Number(record.generation) < 0) return null;
    return record as T;
  } catch {
    return null;
  }
}

function detailChangedKeys(event: { detail?: unknown }): string[] {
  if (!event.detail || typeof event.detail !== 'object') return [];
  const keys = (event.detail as { changedKeys?: unknown }).changedKeys;
  return Array.isArray(keys) ? keys.filter((key): key is string => typeof key === 'string') : [];
}

export function createControlHelpController({
  storage,
  events = null,
  classifyEstablishedProfile = async () => true,
  now = Date.now,
}: CreateControlHelpControllerOptions): ControlHelpController {
  let state: ControlHelpState = {
    ready: false,
    establishedProfile: true,
    mode: 'essential',
    hoverDelayMs: CONTROL_HELP_DEFAULT_DELAY_MS,
    teachingCadence: 'balanced',
    learningGeneration: 0,
  };
  let initializePromise: Promise<void> | null = null;
  let destroyed = false;
  const subscribers = new Set<(next: ControlHelpState) => void>();

  const read = (key: string): string | null => {
    try { return storage.getItem(key); } catch { return null; }
  };
  const write = (key: string, value: string): void => {
    try { storage.setItem(key, value); } catch { /* Keep the current-session state usable. */ }
  };
  const notify = (): void => {
    for (const listener of [...subscribers]) listener(state);
  };
  const replaceState = (next: ControlHelpState): void => {
    if (
      next.ready === state.ready
      && next.establishedProfile === state.establishedProfile
      && next.mode === state.mode
      && next.hoverDelayMs === state.hoverDelayMs
      && next.teachingCadence === state.teachingCadence
      && next.learningGeneration === state.learningGeneration
    ) return;
    state = next;
    notify();
  };
  const reloadStoredPreferences = (): void => {
    const mode = parseControlHelpMode(read(CONTROL_HELP_KEYS.mode)) ?? state.mode;
    const cadence = parseTeachingCadence(read(CONTROL_HELP_KEYS.teachingCadence)) ?? 'balanced';
    replaceState({
      ...state,
      mode,
      hoverDelayMs: normalizeControlHelpDelay(read(CONTROL_HELP_KEYS.hoverDelayMs)),
      teachingCadence: cadence,
      learningGeneration: normalizeGeneration(read(CONTROL_HELP_KEYS.learningGeneration)),
    });
  };
  const currentRecord = <T extends LearnedRecord | SnoozedRecord>(key: string): T | null => {
    const record = parseRecord<T>(read(key));
    return record?.generation === state.learningGeneration ? record : null;
  };

  const onLiveApply = (event: { detail?: unknown }): void => {
    if (destroyed || !detailChangedKeys(event).some(isControlHelpSettingKey)) return;
    reloadStoredPreferences();
  };
  events?.addEventListener(SETTINGS_LIVE_APPLY_EVENT, onLiveApply);

  return {
    getState: () => state,

    initialize(): Promise<void> {
      if (initializePromise) return initializePromise;
      initializePromise = (async () => {
        const savedMode = parseControlHelpMode(read(CONTROL_HELP_KEYS.mode));
        const establishedProfile = savedMode ? true : await classifyEstablishedProfile();
        if (destroyed) return;
        replaceState({
          ready: true,
          establishedProfile,
          mode: savedMode ?? (establishedProfile ? 'essential' : 'teaching'),
          hoverDelayMs: normalizeControlHelpDelay(read(CONTROL_HELP_KEYS.hoverDelayMs)),
          teachingCadence: parseTeachingCadence(read(CONTROL_HELP_KEYS.teachingCadence)) ?? 'balanced',
          learningGeneration: normalizeGeneration(read(CONTROL_HELP_KEYS.learningGeneration)),
        });
      })();
      return initializePromise;
    },

    setMode(mode): void {
      write(CONTROL_HELP_KEYS.mode, mode);
      replaceState({ ...state, mode });
    },

    setHoverDelayMs(delayMs): void {
      const normalized = normalizeControlHelpDelay(delayMs);
      write(CONTROL_HELP_KEYS.hoverDelayMs, String(normalized));
      replaceState({ ...state, hoverDelayMs: normalized });
    },

    setTeachingCadence(teachingCadence): void {
      write(CONTROL_HELP_KEYS.teachingCadence, teachingCadence);
      replaceState({ ...state, teachingCadence });
    },

    resetTeachingTips(): void {
      const learningGeneration = state.learningGeneration + 1;
      write(CONTROL_HELP_KEYS.learningGeneration, String(learningGeneration));
      replaceState({ ...state, learningGeneration });
    },

    markLearned(featureId, tipVersion, at = now()): void {
      write(controlHelpLearnedKey(featureId, tipVersion), JSON.stringify({
        generation: state.learningGeneration,
        at: Math.max(0, Math.floor(at)),
      } satisfies LearnedRecord));
      notify();
    },

    isLearned(featureId, tipVersion): boolean {
      const record = currentRecord<LearnedRecord>(controlHelpLearnedKey(featureId, tipVersion));
      return Boolean(record && Number.isFinite(record.at));
    },

    snooze(featureId, tipVersion, until): void {
      write(controlHelpSnoozedKey(featureId, tipVersion), JSON.stringify({
        generation: state.learningGeneration,
        until: Math.max(0, Math.floor(until)),
      } satisfies SnoozedRecord));
      notify();
    },

    snoozedUntil(featureId, tipVersion): number {
      const record = currentRecord<SnoozedRecord>(controlHelpSnoozedKey(featureId, tipVersion));
      return record && Number.isFinite(record.until) ? record.until : 0;
    },

    learnedCount(): number {
      return storedKeys(storage).filter(key => {
        if (!key.startsWith(CONTROL_HELP_LEARNED_PREFIX)) return false;
        const record = currentRecord<LearnedRecord>(key);
        return Boolean(record && Number.isFinite(record.at));
      }).length;
    },

    subscribe(listener): () => void {
      subscribers.add(listener);
      return () => subscribers.delete(listener);
    },

    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      events?.removeEventListener(SETTINGS_LIVE_APPLY_EVENT, onLiveApply);
      subscribers.clear();
    },
  };
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed.'));
  });
}

async function browserHasDomainData(factory: IDBFactory | undefined): Promise<boolean> {
  if (!factory || typeof factory.databases !== 'function') return false;
  const databases = await factory.databases();
  for (const [name, stores] of Object.entries(DOMAIN_STORES)) {
    if (!databases.some(database => database.name === name)) continue;
    const database = await idbRequest(factory.open(name));
    try {
      const availableStores = stores.filter(store => database.objectStoreNames.contains(store));
      if (!availableStores.length) continue;
      const transaction = database.transaction(availableStores, 'readonly');
      for (const store of availableStores) {
        if (await idbRequest(transaction.objectStore(store).count()) > 0) return true;
      }
    } finally {
      database.close();
    }
  }
  return false;
}

export function createBrowserControlHelpController(): ControlHelpController {
  const storage = window.localStorage;
  return createControlHelpController({
    storage,
    events: window as unknown as ControlHelpEventSource,
    classifyEstablishedProfile: () => classifyEstablishedControlHelpProfile({
      storage,
      hasDomainData: () => browserHasDomainData(window.indexedDB),
      hasRestorableIdentity: () => [...RESTORABLE_IDENTITY_KEYS].some(key => Boolean(storage.getItem(key))),
      hasHydratedAccountData: () => false,
    }),
  });
}
