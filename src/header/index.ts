


import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
import {
  controlExplainerAttrs,
  iconControlExplainerAttrs,
  renderDisabledControlExplainer,
} from '../ui/controlExplainer';
import { chesscom, importChesscom } from '../import/chesscom';
import { lichess, importLichess } from '../import/lichess';
import { pgnState, importPgn } from '../import/pgn';
import {
  importFilters, SPEED_OPTIONS, DATE_RANGE_OPTIONS,
  currentImportDateRangeConfig,
  importRangeStartMsFor,
  importSyncFilterKey,
  type ImportDateRange,
  type ImportSpeed,
} from '../import/filters';
import {
  boardWheelNavEnabled,
  renderBoardSettings,
  setBoardWheelNavEnabled,
} from '../board/cosmetics';
import { boardSoundEnabled, setBoardSoundEnabled, soundVolume, setSoundVolume } from '../board/sound';
import {
  isBulkRunning, isBulkPaused,
  pauseBulkReview, resumeBulkReview, cancelBulkReview,
  getQueueSummary, formatReviewDuration,
  getReviewQueueItems, moveReviewQueueGame, removeReviewQueueGame,
  dismissReviewRunNotice,
  getReviewRunSummary, retryReviewRunFailedGames,
  isReviewEngineFailed, isReviewEngineInitializing,
  getCurrentFailedReviewStatus, skipCurrentFailedReviewGame,
  isLeaderTab, isReviewOwnerUnavailableForTakeover, takeOverUnavailableReviewOwner,
  setReviewAutoRetryEnabled,
  isReviewUnattendedRunEnabled, setReviewUnattendedRunEnabled,
} from '../engine/reviewQueue';
import {
  reviewDepth, setReviewDepth,
  bulkReviewDepth, setBulkReviewDepth, bulkReviewMovetime, setBulkReviewMovetime,
} from '../engine/reviewProfiles';
import { missedMomentConfig, setMissedMomentConfig } from '../engine/tactics';
import { retroConfig, setRetroConfig, RETRO_CONFIG_DEFAULTS, type RetroConfig } from '../analyse/retroConfig';
import {
  RETRO_CHOICE_SEVERITY_PRESETS,
  formatRetroChoiceLossPercent,
  type RetroChoiceCountSummary,
  type RetroChoiceSeverityPresetId,
  type RetroConfigFamilyPreview,
  type RetroConfigPreviewFamilyId,
  type RetroConfigPreviewSummary,
} from '../analyse/retroChoice';
import { classifySeverity, getTierMeta, type FeedbackTone } from '../feedback/severity';
import { checkAuth, LOGIN_MODAL_EVENT, login, logout } from '../sync/client';
import { startAccountSettingsSync, stopAccountSettingsSync } from '../sync/settings';
import {
  REMOTE_SYNC_PROGRESS_EVENT,
  clearRemoteSyncToken,
  dismissServerWinsConflicts,
  getRemoteSyncOutboxCount,
  getRemoteSyncIdentitySnapshot,
  getRemoteSyncProgressSnapshot,
  getRemoteSyncToken,
  hasRemoteSyncToken,
  flushRemoteSyncOutbox,
  logoutRemoteSync as stopAndClearRemoteSync,
  queueLocalLibraryForRemoteSync,
  refreshRemoteSyncProgressSnapshot,
  setRemoteSyncToken,
  startRemoteSyncAutoSync,
  testRemoteSyncConnection,
  type RemoteSyncBackoffState,
  type RemoteSyncOperationKind,
  type RemoteSyncOperationSummary,
  type RemoteSyncProgressSnapshot,
} from '../sync/remoteSync';
import type { RemoteSyncIssue } from '../sync/progress';
import { clearLocalDataForTokenLogout } from '../sync/dataManagement';
import { syncRatedLadder } from '../puzzles/puzzleDb';
import { writeHashRoute, type Route } from '../router';
import type { ImportedGame, ImportCallbacks } from '../import/types';
import { serializeAnalysisSelectedGameRoute } from '../analyse/routeState';
import { renderEvalGraphSettings } from '../analyse/graphSettings';
import { accountId, getAccount, listAccounts, type AccountCategory, type ChessAccount } from '../accounts';
import {
  peekAccountSync,
  syncAccountGamesOlder,
  syncAccountGamesWithBackfill,
  type AccountPeekResult,
  type AccountSyncWithBackfillResult,
} from '../import/accountSync';
import { enqueueAccountRescan } from '../import/enrichment';
import { reportIssue } from '../diagnostics/reporting/reportAction';
import {
  getVisibleReleaseIdentity,
  loadLiveReleaseIdentity,
  releaseCommitTimestampLabel,
  releaseDeployLabel,
  releaseProductLabel,
  releaseTooltip,
} from '../releaseIdentity';

function activateOnKeyboard(event: KeyboardEvent, action: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  action();
}

function renderDisabledControlWhen(
  reason: string | null,
  label: string,
  control: VNode,
): VNode {
  return reason
    ? renderDisabledControlExplainer({ label, description: reason }, control)
    : control;
}

const HEADER_LOGO_SRC = '/images/patzer-pro-review-lens-logo-package/png/app-icons/patzerpro-app-icon-152.png';
const PLATFORM_DISCLAIMER = 'Patzer Pro is not affiliated with or endorsed by Chess.com or Lichess.';

// --- Module-level header state ---
type ImportPlatform = 'chesscom' | 'lichess';
let importPlatform: ImportPlatform = 'chesscom';
let showImportPanel  = false;
let showGlobalMenu   = false;
let showBoardSettings     = false;
let showEvalGraphSettings = false;
let showDetectionModal    = false;
let showRetroModal        = false;


let retroSensitivityCustomOpen = false;
let showReleaseDetails    = false;
let releaseCopyMessage    = '';
let showLoginModal        = false;
let showReviewMenu        = false;
let showMobileNav    = false;
let headerAccountMode: 'account' | 'new' = 'account';
let selectedMineAccountId: string | null = null;
let headerSyncRunning = false;

let headerSyncAbort: AbortController | null = null;
let headerSyncMessage: string | null = null;
let headerSyncError: string | null = null;
let headerOlderSyncRunning = false;
let headerOlderSyncMessage: string | null = null;
let headerOlderSyncError: string | null = null;
let headerOlderSyncTargetDate = '';

let headerRescanRunning = false;
let headerRescanMessage: string | null = null;
let headerRescanError: string | null = null;

let headerPeek: AccountPeekResult | null = null;
let headerPeekLoading = false;
let headerPeekKey = '';
let headerPeekGen = 0;

const CATEGORY_OPTIONS: readonly { value: AccountCategory; label: string }[] = [
  { value: 'mine',     label: 'Mine'     },
  { value: 'opponent', label: 'Opponent' },
  { value: 'study',    label: 'Study'    },
];

// Registry key (`platform:username`) the current importCategory selection
// belongs to. Used to re-sync the selection only when the username or
// platform actually changes, so manual pill clicks are never overridden.
let categorySyncKey: string | null = null;
let categoryManualKey: string | null = null;

function currentImportAccountKey(): string {
  const name = (importPlatform === 'chesscom' ? chesscom.username : lichess.username).trim();
  return name ? accountId(importPlatform, name) : '';
}

/**
 * Pre-select the saved category when the typed username is registered.
 * For new usernames, default the first personal account to Mine and later
 * accounts to Opponent.
 */


let categorySyncTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSyncImportCategory(redraw: () => void): void {
  if (categorySyncTimer !== null) clearTimeout(categorySyncTimer);
  categorySyncTimer = setTimeout(() => {
    categorySyncTimer = null;
    syncImportCategory(redraw);
  }, 400);
}

function syncImportCategory(redraw: () => void): void {
  const key = currentImportAccountKey();
  if (key === categorySyncKey) return;
  categorySyncKey = key;
  categoryManualKey = null;
  if (importFilters.importCategory !== null) {
    importFilters.importCategory = null;
    redraw();
  }
  if (!key) return;
  void Promise.all([getAccount(key), listAccounts()]).then(([account, accounts]) => {
    // Drop stale lookups (username changed while resolving) and never clobber
    // a manual pill click for the same username/platform.
    if (key !== categorySyncKey || categoryManualKey === key) return;
    importFilters.importCategory = account?.category ??
      (accounts.some(a => a.category === 'mine') ? 'opponent' : 'mine');
    redraw();
  }).catch(e => console.warn('[header] category lookup failed', e));
}

// One-time boot sync for the pre-filled default username. Subsequent syncs run
// from the input and platform-toggle handlers, never from the render path.
let categorySyncInit = false;

const FEEDBACK_TONE_OPTIONS: readonly { value: FeedbackTone; label: string; description: string }[] = [
  { value: 'standard', label: 'Standard', description: 'Professional and encouraging' },
  { value: 'harsh', label: 'Harsh', description: 'Direct and blunt' },
  { value: 'brutal', label: 'Brutal', description: 'Genuinely mean' },
  { value: 'unhinged', label: 'Unhinged', description: 'Absolutely savage' },
];

export function openRetroModal(redraw: () => void): void {
  showRetroModal = true;
  redraw();
}

// --- Auth state ---
const REMOTE_SYNC_TOKEN_KEY = 'chesspatzer.remoteSync.adminSyncToken';
const REMOTE_SYNC_TOKEN_EVENT = 'chesspatzer:remoteSync-token-changed';
const REMOTE_SYNC_WARNING_ICON = '⚠';

let headerAuthUser: string | null = null;
let headerAuthIsAdmin = false;
let headerAuthProvider: 'patzer' | 'lichess' | 'client-lichess' | null = null;
let headerAuthChecked = false;
let loginModalListenerAttached = false;
let loginModalError = '';
let remoteSyncActive = false;
let remoteSyncChecked = false;
let remoteSyncChecking = false;
let remoteSyncTokenListenerAttached = false;
let remoteSyncLoginInput = '';
let remoteSyncLoginBusy = false;
let remoteSyncLoginError = '';

function readPersistedRemoteSyncToken(): string {
  return localStorage.getItem(REMOTE_SYNC_TOKEN_KEY) ?? '';
}

function hydrateRemoteSyncToken(): boolean {
  const current = getRemoteSyncToken().trim();
  if (current) return true;

  const persisted = readPersistedRemoteSyncToken().trim();
  if (!persisted) return false;

  setRemoteSyncToken(persisted);
  return true;
}

function rememberRemoteSyncToken(token: string): void {
  const value = token.trim();
  if (!value) {
    clearRememberedRemoteSyncToken();
    return;
  }
  setRemoteSyncToken(value);
  localStorage.setItem(REMOTE_SYNC_TOKEN_KEY, value);
  startRemoteSyncAutoSync();
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_TOKEN_EVENT));
}

function clearRememberedRemoteSyncToken(): void {
  stopAndClearRemoteSync();
  localStorage.removeItem(REMOTE_SYNC_TOKEN_KEY);
  window.dispatchEvent(new CustomEvent(REMOTE_SYNC_TOKEN_EVENT));
}

function ensureRemoteSyncTokenListener(redraw: () => void): void {
  if (remoteSyncTokenListenerAttached) return;
  remoteSyncTokenListenerAttached = true;

  const resetFromStorage = () => {
    remoteSyncChecked = false;
    remoteSyncChecking = false;
    remoteSyncActive = hydrateRemoteSyncToken();
    remoteSyncLoginInput = '';
    ensureRemoteSyncAuth(redraw);
    redraw();
  };

  window.addEventListener(REMOTE_SYNC_TOKEN_EVENT, resetFromStorage);
  window.addEventListener('storage', event => {
    if (event.key === REMOTE_SYNC_TOKEN_KEY) resetFromStorage();
  });
}

function ensureRemoteSyncAuth(redraw: () => void): void {
  if (remoteSyncChecked || remoteSyncChecking) return;
  remoteSyncChecked = true;

  if (!hydrateRemoteSyncToken()) {
    remoteSyncActive = false;
    return;
  }

  remoteSyncChecking = true;
  remoteSyncActive = true;
  startRemoteSyncAutoSync();
  testRemoteSyncConnection().then(result => {
    remoteSyncChecking = false;
    remoteSyncActive = result.success;
    if (!result.success) clearRememberedRemoteSyncToken();
    redraw();
  });
}

function restoreRemoteSyncToken(sessionToken: string, persistedToken: string | null): void {
  const tokenToRestore = sessionToken.trim() || persistedToken?.trim() || '';
  if (tokenToRestore) setRemoteSyncToken(tokenToRestore);
  else clearRemoteSyncToken();

  if (persistedToken !== null) localStorage.setItem(REMOTE_SYNC_TOKEN_KEY, persistedToken);
  else localStorage.removeItem(REMOTE_SYNC_TOKEN_KEY);
}

function submitRemoteSyncLogin(redraw: () => void): void {
  const token = remoteSyncLoginInput.trim();
  if (!token || remoteSyncLoginBusy) return;

  const previousSessionToken = getRemoteSyncToken();
  const previousPersistedToken = localStorage.getItem(REMOTE_SYNC_TOKEN_KEY);
  remoteSyncLoginBusy = true;
  remoteSyncLoginError = '';
  setRemoteSyncToken(token);
  redraw();

  testRemoteSyncConnection().then(result => {
    remoteSyncLoginBusy = false;
    if (result.success) {
      rememberRemoteSyncToken(token);
      remoteSyncActive = true;
      remoteSyncChecked = true;
      remoteSyncChecking = false;
      showLoginModal = false;
      remoteSyncLoginInput = '';
      loginModalError = '';
    } else {
      restoreRemoteSyncToken(previousSessionToken, previousPersistedToken);
      remoteSyncActive = hasRemoteSyncToken();
      remoteSyncChecked = true;
      remoteSyncLoginError = result.error || 'Invalid sync token.';
    }
    redraw();
  });
}

let remoteSyncLogoutInProgress = false;

function logoutRemoteSync(redraw: () => void): void {
  if (remoteSyncLogoutInProgress) return;
  if (!confirm('Log out and remove this account’s local data from this browser? Data already synced stays in the cloud account.')) return;
  remoteSyncLogoutInProgress = true;
  void (async () => {



    try {
      // Flush while the token is still present so pending unsynced changes are pushed,
      // not destroyed by the wipe below. Best-effort: offline/failed flush cannot block logout.
      try {
        await flushRemoteSyncOutbox();
      } catch {
        // ignore
      }
      clearRememberedRemoteSyncToken();
      remoteSyncActive = false;
      remoteSyncChecked = true;
      remoteSyncChecking = false;
      remoteSyncLoginInput = '';
      remoteSyncLoginError = '';
      redraw();
      await clearLocalDataForTokenLogout();
    } finally {
      window.location.reload();
    }
  })();
}

function ensureLoginModalListener(redraw: () => void): void {
  if (loginModalListenerAttached) return;
  loginModalListenerAttached = true;
  window.addEventListener(LOGIN_MODAL_EVENT, () => {
    loginModalError = '';
    showLoginModal = true;
    redraw();
  });
}

function ensureHeaderAuth(redraw: () => void): void {
  if (headerAuthChecked) return;
  headerAuthChecked = true;
  checkAuth().then((auth) => {
    const { username, displayName, email, isAdmin, source, provider } = auth;
    headerAuthUser = displayName || email || username;
    headerAuthIsAdmin = isAdmin;
    headerAuthProvider = provider ?? (source === 'client' ? 'client-lichess' : null);
    redraw();
    if (provider === 'patzer') startAccountSettingsSync(auth).then(redraw).catch(() => {});
    else stopAccountSettingsSync();
    if (username && source === 'server' && provider === 'lichess') syncRatedLadder().catch(() => {});
  });
}

function renderRemoteSyncWarningIcon(className: string, title: string): VNode {
  return h(`span.${className}`, {
    attrs: {
      title,
      role: 'img',
      'aria-label': title,
    },
  }, REMOTE_SYNC_WARNING_ICON);
}

function renderUserArea(redraw: () => void): VNode | null {
  if (remoteSyncActive || (remoteSyncChecking && hasRemoteSyncToken())) {
    return h('div.header__user', {
      attrs: controlExplainerAttrs({
        label: remoteSyncChecking ? 'Checking sync' : 'Sync active',
        description: remoteSyncChecking
          ? 'Patzer is checking the saved sync token.'
          : 'This browser is connected to Remote sync.',
      }),
    }, [
      h('button.header__logout.header__logout--text', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Log out',
          description: 'Disconnect sync and remove this account’s local data from this browser.',
        }) },
        on: { click: () => logoutRemoteSync(redraw) },
      }, 'Logout'),
    ]);
  }
  return h('div.header__user.header__user--login', [
    h('button.header__login', {
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: 'Log in',
        description: 'Connect this browser to Remote sync.',
      }) },
      on: { click: () => {
        remoteSyncLoginInput = '';
        remoteSyncLoginError = '';
        loginModalError = '';
        showLoginModal = true;
        redraw();
      } },
    }, 'Login'),
  ]);
}

function renderLoginModal(redraw: () => void): VNode {
  const close = () => {
    showLoginModal = false;
    loginModalError = '';
    redraw();
  };

  return h('div.auth-modal', [
    h('div.auth-modal__backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close sync login' }) },
      on: { click: close, keydown: (event: KeyboardEvent) => activateOnKeyboard(event, close) },
    }),
    h('div.auth-modal__card', [
      h('div.auth-modal__header', [
        h('h2', 'RemoteSync Sync Login'),
        h('button.auth-modal__close', {
          attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Close sync login' }) },
          on: { click: close },
        }, 'x'),
      ]),
      h('div.auth-modal__body', [
        h('p', 'Enter the sync token to activate database sync for this browser.'),
        h('div.auth-modal__form', [
          h('label.auth-modal__label', { attrs: { for: 'remote-sync-token' } }, 'Sync token'),
          renderDisabledControlWhen(
            remoteSyncLoginBusy ? 'Patzer is checking the sync token.' : null,
            'Sync token',
            h('input.auth-modal__input', {
            attrs: {
              id: 'remote-sync-token',
              type: 'password',
              autocomplete: 'off',
              disabled: remoteSyncLoginBusy,
              placeholder: 'Admin sync token',
              ...controlExplainerAttrs({
                label: 'Sync token',
                description: 'Enter the admin token used to connect this browser to Remote sync.',
              }),
            },
            props: { value: remoteSyncLoginInput },
            on: {
              input: (event: Event) => {
                remoteSyncLoginInput = (event.target as HTMLInputElement).value;
                redraw();
              },
              keydown: (event: KeyboardEvent) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                submitRemoteSyncLogin(redraw);
              },
            },
            }),
          ),
        ]),
        remoteSyncLoginError ? h('p.auth-modal__error', remoteSyncLoginError) : null,
        h('div.auth-modal__secondary-block', [
          h('h3', 'Chess identity'),
          headerAuthUser
            ? h('p', `Lichess connected as ${headerAuthUser}.`)
            : h('p', 'Lichess login is only used as a chess identity option.'),
          headerAuthUser
            ? renderDisabledControlWhen(
                remoteSyncLoginBusy ? 'Patzer is checking the sync token.' : null,
                'Disconnect Lichess',
                h('button.auth-modal__secondary', {
                attrs: { type: 'button', disabled: remoteSyncLoginBusy, ...controlExplainerAttrs({
                  label: 'Disconnect Lichess',
                  description: 'Remove the connected Lichess chess identity from this browser.',
                }) },
                on: { click: () => {
	                  logout().then(() => {
	                    stopAccountSettingsSync();
	                    headerAuthUser = null;
	                    headerAuthIsAdmin = false;
	                    headerAuthProvider = null;
                    redraw();
                  });
                } },
                }, 'Disconnect Lichess'),
              )
            : renderDisabledControlWhen(
                remoteSyncLoginBusy ? 'Patzer is checking the sync token.' : null,
                'Continue with Lichess',
                h('button.auth-modal__secondary', {
                attrs: { type: 'button', disabled: remoteSyncLoginBusy, ...controlExplainerAttrs({
                  label: 'Continue with Lichess',
                  description: 'Connect a Lichess account as your chess identity.',
                }) },
                on: { click: () => {
                  login().catch(error => {
                    loginModalError = error instanceof Error ? error.message : 'Could not start Lichess login.';
                    redraw();
                  });
                } },
                }, 'Continue with Lichess'),
              ),
        ]),
        loginModalError ? h('p.auth-modal__error', loginModalError) : null,
      ]),
      h('div.auth-modal__actions', [
        h('button.auth-modal__secondary', {
          attrs: { type: 'button', ...controlExplainerAttrs({ label: 'Cancel login' }) },
          on: { click: close },
        }, 'Cancel'),
        renderDisabledControlWhen(
          remoteSyncLoginBusy
            ? 'Patzer is checking the sync token.'
            : !remoteSyncLoginInput.trim()
              ? 'Enter a sync token before logging in.'
              : null,
          remoteSyncLoginBusy ? 'Checking login' : 'Log in',
          h('button.auth-modal__primary', {
          attrs: { type: 'button', disabled: remoteSyncLoginBusy || !remoteSyncLoginInput.trim(), ...controlExplainerAttrs({
            label: remoteSyncLoginBusy ? 'Checking login' : 'Log in',
            description: remoteSyncLoginBusy
              ? 'Patzer is checking the sync token.'
              : !remoteSyncLoginInput.trim()
                ? 'Enter a sync token before logging in.'
                : 'Connect this browser using the entered sync token.',
          }) },
          on: { click: () => submitRemoteSyncLogin(redraw) },
          }, remoteSyncLoginBusy ? 'Checking...' : 'Login'),
        ),
      ]),
    ]),
  ]);
}

export function setImportPlatform(p: ImportPlatform): void { importPlatform = p; }
export function getImportPlatform(): ImportPlatform         { return importPlatform; }

export interface HeaderDeps {
  route:               Route;
  importedGames:       ImportedGame[];
  accounts:            ChessAccount[];
  mobileSubmenus?:     readonly HeaderMobileSubmenu[];
  navHrefOverrides?:   Partial<Record<string, string>>;
  selectedGameId:      string | null;
  analyzedGameIds:     ReadonlySet<string>;
  missedTacticGameIds: ReadonlySet<string>;
  importCallbacks:     ImportCallbacks;
  onSyncGames:         (games: ImportedGame[]) => { addedCount: number };
  refreshAccounts:     () => void;
  onSelectGame:        (id: string, pgn: string) => void;
  renderGameRow:       (game: ImportedGame, isAnalyzed: boolean, hasMissedTactic: boolean) => (VNode | null)[];
  gameSourceUrl:       (game: ImportedGame) => string | undefined;
  downloadPgn:         (annotated: boolean) => void;
  resetAllData:        () => void;
  redraw:              () => void;
}

export interface HeaderMobileSubmenuItem {
  id: string;
  label: string;
  icon?: string;
  active?: boolean;
  onSelect: () => void;
}

export interface HeaderMobileSubmenu {
  section: string;
  label?: string;
  items: readonly HeaderMobileSubmenuItem[];
}

function platformLabel(platform: ImportPlatform): string {
  return platform === 'chesscom' ? 'Chess.com' : 'Lichess';
}

function mineAccounts(accounts: readonly ChessAccount[]): ChessAccount[] {
  return accounts
    .filter(account => account.category === 'mine')
    .sort((a, b) => {
      const bTime = b.lastSyncedAt ?? b.addedAt;
      const aTime = a.lastSyncedAt ?? a.addedAt;
      return bTime - aTime || a.displayName.localeCompare(b.displayName);
    });
}

function syncSelectedMineAccount(accounts: readonly ChessAccount[]): ChessAccount | null {
  const mines = mineAccounts(accounts);
  if (mines.length === 0) {
    selectedMineAccountId = null;
    return null;
  }
  if (headerAccountMode === 'new') return null;
  const selected = mines.find(account => account.id === selectedMineAccountId) ?? mines[0]!;
  selectedMineAccountId = selected.id;
  importPlatform = selected.platform;
  if (selected.platform === 'chesscom') chesscom.username = selected.displayName;
  else lichess.username = selected.displayName;
  return selected;
}

function formatSyncDate(timestamp: number | null): string {
  if (timestamp === null) return 'No sync cursor yet';
  return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayDateInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDateInputStartMs(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(timestamp) ? null : timestamp;
}

// --- Nav ---

function activeSection(route: Route): string {
  switch (route.name) {
    case 'analysis':
    case 'analysis-game':
      return 'analysis';
    case 'puzzles':
    case 'puzzle-round':
      return 'puzzles';
    case 'opponents': return 'opponents';
    case 'stats':    return 'stats';
    case 'games':    return 'games';
    case 'study':
    case 'study-detail': return 'study';
    default:         return '';
  }
}

const navLinks: { label: string; href: string; section: string }[] = [
  { label: 'Analysis', href: '#/analysis', section: 'analysis' },
  { label: 'Puzzles',  href: '#/puzzles',  section: 'puzzles'  },
  { label: 'Games',    href: '#/games',    section: 'games'    },
  { label: 'Opening Tree', href: '#/opponents', section: 'opponents' },
  { label: 'Stats',    href: '#/stats',    section: 'stats'    },
  { label: 'Study',   href: '#/study',    section: 'study'    },
];

function renderNav(route: Route, navHrefOverrides: Partial<Record<string, string>> = {}): VNode {
  const active = activeSection(route);
  return h('nav.header__nav', navLinks.map(({ label, href, section }) =>
    h('a', {
      attrs: { href: navHrefOverrides[section] ?? href, ...controlExplainerAttrs({ label }) },
      class: { active: active === section },
    }, label)
  ));
}

// --- Bulk Review menu ---

const REVIEW_DEPTHS = [12, 14, 16, 18, 20];






const REVIEW_MOVETIME_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: 'Off'    },
  { value: 200,  label: '0.2s'   },
  { value: 500,  label: '0.5s'   },
  { value: 1000, label: '1s'     },
  { value: 2000, label: '2s'     },
];

function formatReviewPositionProgress(positionsAnalyzed: number, totalPositions: number): string | null {
  if (totalPositions <= 0) return null;
  const analyzed = Math.min(Math.max(0, positionsAnalyzed), totalPositions);
  return `${analyzed}/${totalPositions} positions analyzed`;
}

function renderReviewProgressLabel(label: string): VNode {
  return h('span.review-progress-label', [
    h('span.review-progress-label__text', label),
  ]);
}







function reviewPillIcon(children: VNode[], opts: { spin?: boolean } = {}): VNode {
  const cls = opts.spin
    ? 'svg.review-menu__trigger-icon.review-menu__trigger-icon--spin'
    : 'svg.review-menu__trigger-icon';
  return h(cls, {
    attrs: { viewBox: '0 0 16 16', width: 11, height: 11, 'aria-hidden': 'true', focusable: 'false' },
  }, children);
}

function iconSpinnerArc(): VNode {
  return reviewPillIcon([
    h('circle', { attrs: {
      cx: 8, cy: 8, r: 6, fill: 'none', stroke: 'currentColor',
      'stroke-width': 2, 'stroke-dasharray': '18 20', 'stroke-linecap': 'round',
    } }),
  ], { spin: true });
}

function iconPause(): VNode {
  return reviewPillIcon([
    h('rect', { attrs: { x: 4, y: 3, width: 2.6, height: 10, rx: 1, fill: 'currentColor' } }),
    h('rect', { attrs: { x: 9.4, y: 3, width: 2.6, height: 10, rx: 1, fill: 'currentColor' } }),
  ]);
}

function iconExclamation(): VNode {
  return reviewPillIcon([
    h('rect', { attrs: { x: 7, y: 2.5, width: 2, height: 7, rx: 1, fill: 'currentColor' } }),
    h('circle', { attrs: { cx: 8, cy: 12.5, r: 1.1, fill: 'currentColor' } }),
  ]);
}

function iconPlay(): VNode {
  return reviewPillIcon([
    h('path', { attrs: { d: 'M4.5 2.5v11l9-5.5-9-5.5z', fill: 'currentColor' } }),
  ]);
}

function iconRetry(): VNode {
  return reviewPillIcon([
    h('path', { attrs: {
      d: 'M12.8 8A4.8 4.8 0 1 1 11 4.3',
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'stroke-linecap': 'round',
    } }),
    h('path', { attrs: { d: 'M11.4 1.8l0.4 2.9-2.9-0.4z', fill: 'currentColor' } }),
  ]);
}

function iconPauseBang(): VNode {
  return reviewPillIcon([
    h('rect', { attrs: { x: 2.5, y: 3.5, width: 2.2, height: 9, rx: 1, fill: 'currentColor' } }),
    h('rect', { attrs: { x: 6.5, y: 3.5, width: 2.2, height: 9, rx: 1, fill: 'currentColor' } }),
    h('rect', { attrs: { x: 12, y: 3, width: 1.8, height: 5.5, rx: 0.9, fill: 'currentColor' } }),
    h('circle', { attrs: { cx: 12.9, cy: 11, r: 1, fill: 'currentColor' } }),
  ]);
}

function iconDatabase(): VNode {
  return reviewPillIcon([
    h('ellipse', { attrs: { cx: 8, cy: 4, rx: 5, ry: 2, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 } }),
    h('path', { attrs: { d: 'M3 4v8c0 1.1 2.24 2 5 2s5-.9 5-2V4', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 } }),
    h('path', { attrs: { d: 'M3 8c0 1.1 2.24 2 5 2s5-.9 5-2', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.3 } }),
  ]);
}

function iconCross(): VNode {
  return reviewPillIcon([
    h('path', { attrs: { d: 'M4 4l8 8M12 4l-8 8', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round' } }),
  ]);
}

function iconCheck(): VNode {
  return reviewPillIcon([
    h('path', { attrs: {
      d: 'M3 8.5l3.3 3.3L13 4.3',
      fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    } }),
  ]);
}







function reviewTriggerActiveGamePercent(summary: ReturnType<typeof getQueueSummary>): number {
  const activeItem = getReviewQueueItems().find(item => item.isActive);
  if (activeItem && activeItem.total > 0) {
    const done = Math.min(Math.max(0, activeItem.done), activeItem.total);
    return Math.round((done / activeItem.total) * 100);
  }
  if (summary.totalPositions > 0) {
    const analyzed = Math.min(Math.max(0, summary.positionsAnalyzed), summary.totalPositions);
    return Math.round((analyzed / summary.totalPositions) * 100);
  }
  return 0;
}

// Split-view number text: "41% · 12/25", or just "41%" for a single-game run.
function reviewTriggerNumberText(summary: ReturnType<typeof getQueueSummary>, percent: number): string {
  return summary.total === 1 ? `${percent}%` : `${percent}% · ${summary.done}/${summary.total}`;
}

type ReviewPillState =
  | 'breaker' | 'failed' | 'storage' | 'resume' | 'stalled'
  | 'paused-auto' | 'paused' | 'complete' | 'running';












function reviewTriggerPillState(
  breakerPaused: boolean,
  failedStatus: unknown,
  storageFailure: boolean,
  interruptedAfterReload: boolean,
  staleNotice: boolean,
  activePauseNotice: { reason: string } | null,
  paused: boolean,
  completionNotice: boolean,
): ReviewPillState {
  if (breakerPaused) return 'breaker';
  if (failedStatus) return 'failed';
  if (storageFailure) return 'storage';
  if (interruptedAfterReload) return 'resume';
  if (staleNotice) return 'stalled';
  const autopaused = activePauseNotice !== null
    && (activePauseNotice.reason === 'hidden-suspended' || activePauseNotice.reason === 'browser-stalled');
  if (autopaused) return 'paused-auto';
  if (paused) return 'paused';
  if (completionNotice) return 'complete';
  return 'running';
}

interface ReviewPillSpec {
  icon: VNode | null;
  /** Breathing engine bolt (running state only) — takes the icon slot in place of `icon`. */
  bolt: boolean;
  numberText: string | null;
  /** Bottom-edge underline meter color (approved redesign 2026-07-05, round 4 — mirrors
   * `.grr__review-fill` in `src/games/richRow.ts`); `shimmer` keeps the pre-existing full-height
   * loading wash unchanged. `null` = no meter (complete/engine-error). */
  meterVariant: 'green' | 'amber' | 'red' | 'shimmer' | null;
  meterPercent: number;
}

// Meter color families per the round-4 header-pill spec: running = green ("engine" hue),
// paused/attention (paused, paused-auto, stalled, resume) = amber, failed/breaker/storage = red.
// The meter is frozen at whatever percent the queue last reported — no separate "frozen" state is
// needed since `reviewTriggerActiveGamePercent` itself stops advancing while paused/stalled.
function reviewTriggerPillSpec(
  state: ReviewPillState, percent: number, numberText: string, completeNumberText: string,
): ReviewPillSpec {
  switch (state) {
    case 'running':
      return { icon: null, bolt: true, numberText, meterVariant: 'green', meterPercent: percent };
    case 'paused':
    case 'paused-auto':
      return { icon: iconPause(), bolt: false, numberText, meterVariant: 'amber', meterPercent: percent };
    case 'stalled':
      return { icon: iconExclamation(), bolt: false, numberText, meterVariant: 'amber', meterPercent: percent };
    case 'resume':
      return { icon: iconPlay(), bolt: false, numberText, meterVariant: 'amber', meterPercent: percent };
    case 'failed':
      return { icon: iconRetry(), bolt: false, numberText, meterVariant: 'red', meterPercent: percent };
    case 'breaker':
      return { icon: iconPauseBang(), bolt: false, numberText, meterVariant: 'red', meterPercent: percent };
    case 'storage':
      return { icon: iconDatabase(), bolt: false, numberText, meterVariant: 'red', meterPercent: percent };
    case 'complete':
      // Batch complete flips to the solid navy "done" capsule (same language as the Review
      // button): check + games done/total, no meter.
      return { icon: iconCheck(), bolt: false, numberText: completeNumberText, meterVariant: null, meterPercent: 0 };
  }
}

function renderReviewTriggerPillContent(spec: ReviewPillSpec): VNode[] {
  const children: VNode[] = [];
  if (spec.meterVariant) {
    const width = spec.meterVariant === 'shimmer' ? 100 : Math.max(0, Math.min(100, spec.meterPercent));
    children.push(h(`div.review-menu__trigger-fill.review-menu__trigger-fill--${spec.meterVariant}`, {
      style: { width: `${width}%` },
    }));
  }
  const inner: VNode[] = [];
  if (spec.bolt) inner.push(h('span.review-menu__trigger-bolt.--breathing', '⚡'));
  else if (spec.icon) inner.push(spec.icon);
  if (spec.numberText !== null) inner.push(h('span.review-menu__trigger-number', spec.numberText));
  children.push(h('span.review-menu__trigger-content', inner));
  return children;
}

function renderReviewMenuPanelHeader(redraw: () => void): VNode {
  return h('div.review-menu__panel-header', [
    h('div.review-menu__panel-title', 'Analysis Queue'),
    h('button.review-menu__panel-close', {
      attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Close analysis queue' }) },
      on: { click: () => { showReviewMenu = false; redraw(); } },
    }, 'x'),
  ]);
}

function formatReviewQueueStatus(status: 'pending' | 'analyzing' | 'complete' | 'error', isActive: boolean): string {
  if (isActive || status === 'analyzing') return 'Active';
  if (status === 'error') return 'Failed';
  if (status === 'complete') return 'Done';
  return 'Waiting';
}

const REVIEW_RUN_WAVE_CLASS_COUNT = 6;

function reviewRunWaveClasses(waveIndex: number): Record<string, boolean> {
  return {
    'review-run-member': true,
    [`review-run-wave--${waveIndex % REVIEW_RUN_WAVE_CLASS_COUNT}`]: true,
  };
}

function formatReviewQueueProgress(done: number, total: number): string {
  if (total <= 0) return '0%';
  const clampedDone = Math.min(Math.max(0, done), total);
  const percent = Math.round((clampedDone / total) * 100);
  return `${percent}% · ${clampedDone}/${total} positions`;
}

function renderReviewQueueSection(redraw: () => void): VNode {
  const items = getReviewQueueItems();
  return h('div.review-menu__section.review-menu__section--queue', [
    h('div.review-menu__section-title', 'Queue'),
    items.length === 0
      ? h('div.review-menu__queue-empty', 'No queued games')
      : h('div.review-menu__queue-list', items.map(item => {
          const progress = formatReviewQueueProgress(item.done, item.total);
          const statusLabel = formatReviewQueueStatus(item.status, item.isActive);
          return h('div.review-menu__queue-item', {
            key: item.gameId,
            class: {
              ...reviewRunWaveClasses(item.waveIndex),
              'review-menu__queue-item--future': item.isFuture,
            },
          }, [
            h('div.review-menu__queue-main', [
              h('span.review-menu__queue-status', {
                class: {
                  'review-menu__queue-status--active': item.isActive,
                  'review-menu__queue-status--error': item.status === 'error',
                },
              }, statusLabel),
              h('span.review-menu__queue-title', {
                attrs: { title: item.label },
              }, item.label),
              h('span.review-menu__queue-meta', [
                progress,
                `Depth ${item.depth}`,
              ].filter(Boolean).join(' · ')),
            ]),
            h('div.review-menu__queue-actions', [
              renderDisabledControlWhen(
                item.canMoveUp ? null : 'This game is already first in the analysis queue.',
                `Move ${item.label} up`,
                h('button.review-menu__queue-action', {
                attrs: {
                  type: 'button',
                  disabled: !item.canMoveUp,
                  ...iconControlExplainerAttrs({
                    label: `Move ${item.label} up`,
                    description: item.canMoveUp
                      ? 'Move this game earlier in the analysis queue.'
                      : 'This game is already first in the analysis queue.',
                  }),
                },
                on: { click: () => { moveReviewQueueGame(item.gameId, 'up'); redraw(); } },
                }, '↑'),
              ),
              renderDisabledControlWhen(
                item.canMoveDown ? null : 'This game is already last in the analysis queue.',
                `Move ${item.label} down`,
                h('button.review-menu__queue-action', {
                attrs: {
                  type: 'button',
                  disabled: !item.canMoveDown,
                  ...iconControlExplainerAttrs({
                    label: `Move ${item.label} down`,
                    description: item.canMoveDown
                      ? 'Move this game later in the analysis queue.'
                      : 'This game is already last in the analysis queue.',
                  }),
                },
                on: { click: () => { moveReviewQueueGame(item.gameId, 'down'); redraw(); } },
                }, '↓'),
              ),
              renderDisabledControlWhen(
                item.canRemove ? null : 'The active game cannot be removed while it is being analyzed.',
                `Remove ${item.label}`,
                h('button.review-menu__queue-action.review-menu__queue-action--remove', {
                attrs: {
                  type: 'button',
                  disabled: !item.canRemove,
                  ...iconControlExplainerAttrs({
                    label: `Remove ${item.label}`,
                    description: item.canRemove
                      ? 'Remove this game from the current analysis run.'
                      : 'The active game cannot be removed while it is being analyzed.',
                  }),
                },
                on: { click: () => { removeReviewQueueGame(item.gameId); redraw(); } },
                }, '×'),
              ),
            ]),
          ]);
        })),
  ]);
}

function formatReviewPauseReasonLabel(reason: string): string {
  switch (reason) {
    case 'user-paused': return 'User paused';
    case 'hidden-suspended': return 'Hidden tab';
    case 'browser-stalled': return 'Browser stalled';
    case 'circuit-breaker': return 'Circuit breaker';
    case 'engine-init-failure': return 'Engine init failed';
    case 'interrupted-after-reload': return 'Reload interrupted';
    default: return 'Paused';
  }
}

function renderReviewMenu(redraw: () => void): VNode | null {
  const engineFailed       = isReviewEngineFailed();
  const engineInitializing = isReviewEngineInitializing();
  const running = isBulkRunning();
  const paused  = isBulkPaused();
  const summary = getQueueSummary();
  const lifecycleState = summary.lifecycleState;
  const completionNotice = lifecycleState === 'batch-complete' || lifecycleState === 'no-more-eligible-games';
  const breakerPaused = lifecycleState === 'breaker-paused';
  const staleNotice = summary.stale || lifecycleState === 'stale';
  const storageFailureNotice = summary.storageHealth !== 'ok';
  const active  = running || paused || storageFailureNotice || breakerPaused;

  // Surface engine init failure as an explicit error state even when no game
  // is actively running (so the queue never shows a perpetual spinner).
  if (engineFailed) {
    const engineErrorTitle = 'Engine error: engine unavailable — review queue halted';
    return h('div.review-menu', [
      h('button.review-menu__trigger.review-menu__trigger--engine-error', {
        class: { active: showReviewMenu },
        attrs: iconControlExplainerAttrs({
          label: showReviewMenu ? 'Close analysis queue error' : 'Open analysis queue error',
          description: engineErrorTitle,
        }),
        on: { click: () => { showReviewMenu = !showReviewMenu; redraw(); } },
      }, renderReviewTriggerPillContent({ icon: iconCross(), bolt: false, numberText: null, meterVariant: null, meterPercent: 0 })),
      showReviewMenu ? h('div.review-menu__backdrop', {
        attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close analysis queue' }) },
        on: {
          click: () => { showReviewMenu = false; redraw(); },
          keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showReviewMenu = false; redraw(); }),
        },
      }) : null,
      showReviewMenu ? h('div.review-menu__dropdown', [
        renderReviewMenuPanelHeader(redraw),
        h('div.review-menu__section', [
          h('div.review-menu__label.review-menu__label--error',
            'Review engine failed to initialise. SharedArrayBuffer or WASM may be unavailable in this browser context (requires COOP/COEP headers). Reload to retry.'),
          h('div.review-menu__row', [
            h('button.review-menu__btn.--cancel', {
              attrs: controlExplainerAttrs({
                label: 'Dismiss analysis queue',
                description: 'Stop and clear the failed analysis queue.',
              }),
              on: { click: () => { cancelBulkReview(); showReviewMenu = false; redraw(); } },
            }, 'Dismiss queue'),
          ]),
        ]),
      ]) : null,
    ]);
  }

  // Surface the "initializing" state so callers can distinguish it from
  // "active" (which requires at least one pending/analyzing entry).
  if (engineInitializing && !active) {
    const loadingTitle = 'Engine loading: review engine loading…';
    return h('div.review-menu', [
      renderDisabledControlExplainer({
        label: 'Analysis engine loading',
        description: loadingTitle,
      }, h('button.review-menu__trigger.review-menu__trigger--loading', {
        class: { active: false },
        attrs: { disabled: true, ...iconControlExplainerAttrs({
          label: 'Analysis engine loading',
          description: loadingTitle,
        }) },
      }, renderReviewTriggerPillContent({
        icon: iconSpinnerArc(), bolt: false, numberText: null, meterVariant: 'shimmer', meterPercent: 100,
      }))),
    ]);
  }

  if (!active) return null;
  const lastProgress = summary ? formatReviewDuration(summary.lastProgressSeconds) : null;
  const failedStatus = getCurrentFailedReviewStatus();
  const runSummary = getReviewRunSummary();
  const interruptedAfterReload = summary?.pauseReason === 'reload';
  const isQueueOwner = isLeaderTab();
  const ownerUnavailable = isReviewOwnerUnavailableForTakeover();
  const storageFailure = summary.storageHealth !== 'ok';
  const pauseNotice = summary.pauseNotice;
  const activePauseNotice = pauseNotice?.active === true ? pauseNotice : null;
  const lastPauseNotice = summary.lastPauseNotice;
  const canControlQueue = isQueueOwner && (running || paused);
  const timeControlLabel = summary.timeControlContext?.speeds.length
    ? summary.timeControlContext.speeds.join(', ')
    : 'All time controls';
  const currentBatchLabel = summary.currentBatchIndex !== null && summary.currentBatchTotal !== null
    ? `Game ${summary.currentBatchIndex}/${summary.currentBatchTotal}`
    : null;
  const positionProgress = formatReviewPositionProgress(summary.positionsAnalyzed, summary.totalPositions);
  const activeProgressLabel = positionProgress ?? `${summary.done}/${summary.total} games`;
  const positionProgressRemaining = Math.max(0, summary.totalPositions - summary.positionsAnalyzed);





  const pillState = reviewTriggerPillState(
    breakerPaused, failedStatus, storageFailure, interruptedAfterReload,
    staleNotice, activePauseNotice, paused, completionNotice,
  );
  const pillPercent = reviewTriggerActiveGamePercent(summary);
  const pillNumberText = reviewTriggerNumberText(summary, pillPercent);
  const pillCompleteNumberText = `${summary.done}/${summary.total}`;
  const pillSpec = reviewTriggerPillSpec(pillState, pillPercent, pillNumberText, pillCompleteNumberText);
  const pillStateSentence = (() => {
    switch (pillState) {
      case 'breaker':
        return `${runSummary?.breakerTrippedReason === 'engine-init-failure'
          ? 'Analysis paused: the background engine failed to initialize.'
          : 'Analysis paused: 3 consecutive game failures.'} Analysis paused · ${runSummary?.failed.length ?? 0} failed in a row.`;
      case 'failed':
        return `Current analysis failed and is retrying. ${positionProgress
          ? `Failed (${failedStatus?.attempts}) · ${positionProgress}.`
          : `Failed (${failedStatus?.attempts}).`}`;
      case 'storage':
        return 'Storage error: review storage write failed - resume may be unavailable.';
      case 'resume':
        return `Review interrupted after reload - resume manually. Resume analysis ${activeProgressLabel}.`;
      case 'stalled':
        return `No recent analysis progress detected. Analysis stalled · ${activeProgressLabel}.`;
      case 'paused-auto':
      case 'paused':
        return activePauseNotice
          ? `${formatReviewPauseReasonLabel(activePauseNotice.reason)}: ${activePauseNotice.message}`
          : `Analysis paused · ${activeProgressLabel}.`;
      case 'complete':
        return 'Batch complete. Dismiss this notice, or Cancel to stop the run.';
      case 'running':
      default:
        return summary ? `Analyzing ${activeProgressLabel}.` : 'Analyzing…';
    }
  })();
  const pillNumbersSuffix = [
    summary.totalPositions > 0
      ? `${Math.min(Math.max(0, summary.positionsAnalyzed), summary.totalPositions)}/${summary.totalPositions} positions analyzed`
      : null,
    currentBatchLabel,
    summary.reviewDepth !== null ? `Depth ${summary.reviewDepth}` : null,
  ].filter(Boolean).join(' · ');
  const reviewTriggerTitle = pillNumbersSuffix
    ? `${pillStateSentence} (${pillNumbersSuffix})`
    : pillStateSentence;

  return h('div.review-menu', [
    h('button.review-menu__trigger', {
      class: {
        active: showReviewMenu || active,
        [`review-menu__trigger--${pillState}`]: true,
      },
      attrs: iconControlExplainerAttrs({
        label: showReviewMenu ? 'Close analysis queue' : 'Open analysis queue',
        description: reviewTriggerTitle,
      }),
      on: { click: () => {
        if (ownerUnavailable) takeOverUnavailableReviewOwner();
        showReviewMenu = !showReviewMenu;
        redraw();
      } },
    }, renderReviewTriggerPillContent(pillSpec)),

    showReviewMenu ? h('div.review-menu__backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close analysis queue' }) },
      on: {
        click: () => { showReviewMenu = false; redraw(); },
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showReviewMenu = false; redraw(); }),
      },
    }) : null,

    showReviewMenu ? h('div.review-menu__dropdown', [
      renderReviewMenuPanelHeader(redraw),

      // Queue status + controls
      h('div.review-menu__section', [
        h('div.review-menu__label', summary
          ? `${summary.done} of ${summary.total} game${summary.total === 1 ? '' : 's'} analyzed`
          : 'Analyzing…'),
        summary.failed > 0 || summary.skipped > 0
          ? h('div.review-menu__label',
              [
                summary.failed > 0 ? `${summary.failed} failed` : null,
                summary.skipped > 0 ? `${summary.skipped} skipped` : null,
                summary.remainingGames > 0 ? `${summary.remainingGames} remaining` : null,
              ].filter(Boolean).join(' · '))
          : null,
        interruptedAfterReload
          ? h('div.review-menu__label', 'Review interrupted after reload. Resume to continue.')
          : null,
        activePauseNotice
          ? h('div.review-menu__label.review-menu__label--error',
              `${formatReviewPauseReasonLabel(activePauseNotice.reason)}: ${activePauseNotice.message}`)
          : null,
        !activePauseNotice && lastPauseNotice
          ? h('div.review-menu__label',
              `Last pause: ${formatReviewPauseReasonLabel(lastPauseNotice.reason)} · ${lastPauseNotice.message}`)
          : null,
        staleNotice
          ? h('div.review-menu__label.review-menu__label--warning',
              `No analysis progress for ${lastProgress ?? 'a while'}. You can pause, cancel, or take over if the owner is unavailable.`)
          : null,
        lifecycleState === 'batch-complete'
          ? h('div.review-menu__label', 'Batch complete. Dismiss this notice, or Cancel to stop the run.')
          : null,
        lifecycleState === 'no-more-eligible-games'
          ? h('div.review-menu__label', 'No more matching games are available for this review run.')
          : null,
        breakerPaused
          ? h('div.review-menu__label.review-menu__label--error',
              runSummary?.breakerTrippedReason === 'engine-init-failure'
                ? 'Analysis paused: the background engine failed to initialize. Reload to retry.'
                : 'Analysis paused: 3 consecutive game failures. Investigate before retrying — this usually means a systemic problem, not one bad game.')
          : null,
        failedStatus
          ? h('div.review-menu__label.review-menu__label--error',
              failedStatus.retrying
                ? `Failed (${failedStatus.attempts}) - retrying`
                : `Failed (${failedStatus.attempts})`)
          : null,
        (breakerPaused || completionNotice) && runSummary && (runSummary.failed.length > 0 || runSummary.skipped.length > 0)
          ? h('div.review-menu__section-title', 'Run summary')
          : null,
        (breakerPaused || completionNotice) && runSummary && runSummary.failed.length > 0
          ? h('div.review-menu__label',
              `Failed: ${runSummary.failed.map(item => item.label).join(', ')}`)
          : null,
        (breakerPaused || completionNotice) && runSummary && runSummary.skipped.length > 0
          ? h('div.review-menu__label',
              `Skipped: ${runSummary.skipped.map(item => item.label).join(', ')}`)
          : null,
        storageFailure
          ? h('div.review-menu__label.review-menu__label--error',
              summary?.storageHealth === 'checkpoint-write-failed'
                ? 'Checkpoint save failed. Resume may not include the latest progress.'
                : summary?.storageHealth === 'run-manifest-write-failed'
                  ? 'Run manifest save failed. Resume may be unavailable.'
                : 'Review manifest save failed. Resume may be unavailable.')
          : null,
        positionProgress
          ? h('div.review-menu__label.review-menu__label--progress', [
              renderReviewProgressLabel(
                positionProgressRemaining > 0
                  ? `${positionProgress} · ${positionProgressRemaining} position${positionProgressRemaining === 1 ? '' : 's'} remaining`
                  : positionProgress,
              ),
            ])
          : null,
        summary.currentGameLabel
          ? h('div.review-menu__label',
              `${currentBatchLabel ? `${currentBatchLabel} · ` : ''}${summary.currentGameLabel}`)
          : null,
        summary.reviewDepth !== null || summary.timeControlContext !== null
          ? h('div.review-menu__label',
              [
                summary.reviewDepth !== null ? `Depth ${summary.reviewDepth}` : null,
                timeControlLabel,
                lastProgress ? `Last progress ${lastProgress} ago` : null,
              ].filter(Boolean).join(' · '))
          : null,
        h('div.review-menu__row', [
          (breakerPaused || completionNotice) && runSummary && runSummary.failed.length > 0
            ? h('button.review-menu__btn', {
                attrs: { type: 'button', ...controlExplainerAttrs({
                  label: 'Retry failed games',
                  description: 'Re-queue only the failed games and resume the analysis run.',
                }) },
                on: { click: () => { retryReviewRunFailedGames(); redraw(); } },
              }, 'Retry failed')
            : null,
          completionNotice
            ? h('button.review-menu__btn', {
                attrs: { type: 'button', ...controlExplainerAttrs({
                  label: 'Dismiss analysis notice',
                  description: 'Hide this completed analysis-run notice.',
                }) },
                on: { click: () => { dismissReviewRunNotice(); showReviewMenu = false; redraw(); } },
              }, 'Dismiss')
            : null,
          failedStatus
            ? h('button.review-menu__btn.--cancel', {
                attrs: { type: 'button', ...controlExplainerAttrs({
                  label: 'Skip failed game',
                  description: 'Skip this game and continue the analysis queue.',
                }) },
                on: { click: () => { skipCurrentFailedReviewGame(); showReviewMenu = false; redraw(); } },
              }, 'Skip failed game')
            : null,
          ownerUnavailable
            ? h('button.review-menu__btn', {
                attrs: { type: 'button', ...controlExplainerAttrs({
                  label: 'Take over analysis queue',
                  description: 'The queue owner is unavailable; resume this run in the current tab.',
                }) },
                on: { click: () => { takeOverUnavailableReviewOwner(); redraw(); } },
              }, 'Take over')
            : canControlQueue && paused
            ? h('button.review-menu__btn', {
                attrs: controlExplainerAttrs({
                  label: 'Resume analysis',
                  description: 'Continue the paused analysis queue.',
                }),
                on: { click: () => { resumeBulkReview(); redraw(); } },
              }, 'Resume')
            : canControlQueue
            ? h('button.review-menu__btn', {
                attrs: controlExplainerAttrs({
                  label: 'Pause analysis',
                  description: 'Pause the analysis queue after the current safe stopping point.',
                }),
                on: { click: () => { pauseBulkReview(); redraw(); } },
              }, 'Pause')
            : null,
          canControlQueue
            ? h('button.review-menu__btn.--cancel', {
                attrs: controlExplainerAttrs({
                  label: 'Cancel analysis',
                  description: 'Stop the current analysis queue.',
                }),
                on: { click: () => { cancelBulkReview(); redraw(); } },
              }, 'Cancel')
            : null,
        ]),
        h('label.review-menu__toggle.review-menu__toggle--inline', {
          attrs: controlExplainerAttrs({
            label: 'Unattended run',
            description: 'Keep background analysis running while the tab is hidden; browser throttling may still pause it.',
          }),
        }, [
          h('span', 'Unattended run'),
          h('input', {
            attrs: { type: 'checkbox', ...controlExplainerAttrs({
              label: 'Unattended run',
              description: 'Keep background analysis running while the tab is hidden; browser throttling may still pause it.',
            }) },
            props: { checked: isReviewUnattendedRunEnabled() },
            on: {
              change: (event: Event) => {
                const input = event.currentTarget as HTMLInputElement;
                setReviewUnattendedRunEnabled(input.checked);
                redraw();
              },
            },
          }),
        ]),
        h('div.review-menu__label.review-menu__label--warning',
          isReviewUnattendedRunEnabled()
            ? 'Unattended is on. Visible tab is reliable; hidden-tab progress is best-effort and browser-dependent.'
            : 'Unattended is off. Background review suspends while this tab is hidden.'),
        h('label.review-menu__toggle.review-menu__toggle--inline', {
          attrs: controlExplainerAttrs({
            label: 'Auto retry',
            description: 'Retry and resume the active game automatically, then continue through the selection.',
          }),
        }, [
          h('span', 'Auto retry'),
          h('input', {
            attrs: { type: 'checkbox', ...controlExplainerAttrs({
              label: 'Auto retry',
              description: 'Retry and resume the active game automatically, then continue through the selection.',
            }) },
            props: { checked: summary.autoRetryEnabled },
            on: {
              change: (event: Event) => {
                const input = event.currentTarget as HTMLInputElement;
                setReviewAutoRetryEnabled(input.checked);
                redraw();
              },
            },
          }),
        ]),
        summary.autoRetryEnabled
          ? h('div.review-menu__label.review-menu__label--warning',
              'Auto retry is on. Background progress depends on browser throttling.')
          : null,
      ]),

      renderReviewQueueSection(redraw),





      h('div.review-menu__section', [
        h('div.review-menu__label', {
          attrs: { title: 'Depth used by the background bulk review queue.' },
        }, `Bulk depth: ${bulkReviewDepth}`),
        h('div.review-menu__row', REVIEW_DEPTHS.map(d =>
          h('button.review-menu__pill', {
            class: { active: bulkReviewDepth === d },
            attrs: controlExplainerAttrs({
              label: `Bulk depth ${d}`,
              description: 'Set the search depth for games analyzed in the background queue.',
            }),
            on: { click: () => { setBulkReviewDepth(d); redraw(); } },
          }, String(d)),
        )),
      ]),

      h('div.review-menu__section', [
        h('div.review-menu__label', {
          attrs: { title: 'Caps search time per position alongside depth, trading some accuracy for faster bulk review.' },
        }, `Bulk time budget: ${bulkReviewMovetime === null ? 'Off (depth only)' : `${bulkReviewMovetime}ms`}`),
        h('div.review-menu__row', REVIEW_MOVETIME_OPTIONS.map(({ value, label }) =>
          h('button.review-menu__pill', {
            class: { active: bulkReviewMovetime === value },
            attrs: controlExplainerAttrs({
              label: `Bulk time budget ${label}`,
              description: 'Cap search time per position alongside the selected depth.',
            }),
            on: { click: () => { setBulkReviewMovetime(value); redraw(); } },
          }, label),
        )),
      ]),

      h('div.review-menu__section', [
        h('div.review-menu__label', {
          attrs: { title: 'Depth used by the analysis-board Review button. Always searches depth-only (no time cap).' },
        }, `One-off depth: ${reviewDepth}`),
        h('div.review-menu__row', REVIEW_DEPTHS.map(d =>
          h('button.review-menu__pill', {
            class: { active: reviewDepth === d },
            attrs: controlExplainerAttrs({
              label: `One-off depth ${d}`,
              description: 'Set the depth used when analyzing one game from the Analysis Board.',
            }),
            on: { click: () => { setReviewDepth(d); redraw(); } },
          }, String(d)),
        )),
      ]),

    ]) : null,
  ]);
}











let showSyncProgressMenu = false;
let syncProgressListenerAttached = false;
let syncProgressCheckBusy = false;
let syncProgressCheckMessage = '';
let syncProgressQueueBusy = false;
let syncProgressQueueMessage = '';
let syncDiagnosticsCopyMessage = '';

const SYNC_PROGRESS_OP_LABELS: Record<RemoteSyncOperationKind, string> = {
  checking: 'Checking',
  pulling: 'Pulling',
  pushing: 'Pushing',
  queueing: 'Queueing',
  reconciling: 'Reconciling',
};

function ensureSyncProgressListener(redraw: () => void): void {
  if (syncProgressListenerAttached) return;
  syncProgressListenerAttached = true;
  window.addEventListener(REMOTE_SYNC_PROGRESS_EVENT, () => redraw());
}

function formatSyncCount(value: number): string {
  return value.toLocaleString();
}

function formatSyncCountsInline(counts: Record<string, number>): string {
  return Object.entries(counts).map(([key, value]) => `${key} ${formatSyncCount(value)}`).join(' · ');
}

// --- Trigger hysteresis: the header shows a calm, coarse state, never per-event churn. ---
// Activity must be continuously present for SHOW_DELAY before the spinner appears (review-driven
// micro-syncs of a couple seconds never surface), and once shown it stays for MIN_VISIBLE so
// back-to-back operations do not flicker. Itemized per-operation detail lives only in the
// dropdown.
const SYNC_BUSY_SHOW_DELAY_MS = 2000;
const SYNC_BUSY_MIN_VISIBLE_MS = 2500;
let syncActivitySince: number | null = null;
let syncBusyVisibleUntil = 0;
let syncBusyRedrawTimer: number | null = null;

function scheduleSyncTriggerRedraw(redraw: () => void, delayMs: number): void {
  if (syncBusyRedrawTimer !== null) return;
  syncBusyRedrawTimer = window.setTimeout(() => {
    syncBusyRedrawTimer = null;
    redraw();
  }, Math.max(50, delayMs));
}

function syncBusyIndicatorVisible(snapshot: RemoteSyncProgressSnapshot, redraw: () => void): boolean {
  const now = Date.now();
  if (snapshot.severity === 'active') {
    if (syncActivitySince === null) syncActivitySince = now;
    const elapsed = now - syncActivitySince;
    if (elapsed >= SYNC_BUSY_SHOW_DELAY_MS) {
      syncBusyVisibleUntil = now + SYNC_BUSY_MIN_VISIBLE_MS;
      return true;
    }
    scheduleSyncTriggerRedraw(redraw, SYNC_BUSY_SHOW_DELAY_MS - elapsed);
    return now < syncBusyVisibleUntil;
  }
  syncActivitySince = null;
  if (now < syncBusyVisibleUntil) {
    scheduleSyncTriggerRedraw(redraw, syncBusyVisibleUntil - now);
    return true;
  }
  return false;
}

/** The one operation "driving" the busy indicator: whichever entry matches the snapshot's
 * current state with a real (>=100 item) determinate total, falling back to any large
 * determinate operation. Small/indeterminate operations (e.g. a quick "checking" probe)
 * intentionally do not count — same threshold the old text label used, reused (not
 * reinvented) as the "per-item transfer counts are available" signal for the sync pill's
 * meter/counter (approved redesign 2026-07-05, round 4). */
function findSyncDrivingOperation(snapshot: RemoteSyncProgressSnapshot): RemoteSyncOperationSummary | undefined {
  return snapshot.operations.find(op =>
    op.kind === snapshot.state && typeof op.total === 'number' && typeof op.done === 'number' && op.total >= 100,
  ) ?? snapshot.operations.find(op =>
    typeof op.total === 'number' && typeof op.done === 'number' && op.total >= 100,
  );
}








interface SyncPillSpec {
  /** Arrows breathe only while a transfer is actively visible. */
  breathing: boolean;
  glyph: '✓' | '✕' | null;
  /** "done/total" item counter — only shown when the driving operation exposes real counts. */
  countText: string | null;
  meter: boolean;
  /** null while `meter` is true means "indeterminate sweep" (no per-item counts available). */
  meterPercent: number | null;
}

function syncTriggerPillSpec(
  severity: 'ok' | 'active' | 'warning' | 'error',
  busyVisible: boolean,
  driving: RemoteSyncOperationSummary | undefined,
): SyncPillSpec {
  if (severity === 'error') {
    return { breathing: false, glyph: '✕', countText: null, meter: false, meterPercent: null };
  }
  if (severity === 'warning') {
    return { breathing: false, glyph: null, countText: null, meter: false, meterPercent: null };
  }
  if (busyVisible) {
    const hasCounts = driving && typeof driving.total === 'number' && typeof driving.done === 'number' && driving.total > 0;
    return {
      breathing: true,
      glyph: null,
      countText: hasCounts ? `${driving!.done}/${driving!.total}` : null,
      meter: true,
      meterPercent: hasCounts ? Math.round((driving!.done as number / (driving!.total as number)) * 100) : null,
    };
  }
  // Idle/synced — quiet ghost, no numbers.
  return { breathing: false, glyph: '✓', countText: null, meter: false, meterPercent: null };
}

function renderSyncTriggerContent(spec: SyncPillSpec): VNode[] {
  const children: VNode[] = [];
  if (spec.meter) {
    children.push(spec.meterPercent === null
      ? h('div.sync-menu__trigger-fill.sync-menu__trigger-fill--indeterminate')
      : h('div.sync-menu__trigger-fill.sync-menu__trigger-fill--teal', {
          style: { width: `${Math.max(0, Math.min(100, spec.meterPercent))}%` },
        }));
  }
  const inner: VNode[] = [
    h(`span.sync-menu__trigger-arrows${spec.breathing ? '.--breathing' : ''}`, '⇅'),
  ];
  if (spec.glyph) inner.push(h('span.sync-menu__trigger-glyph', spec.glyph));
  if (spec.countText) inner.push(h('span.sync-menu__trigger-count', spec.countText));
  children.push(h('span.sync-menu__trigger-content', inner));
  return children;
}

function renderSyncOperationRow(op: RemoteSyncOperationSummary): VNode {
  const progress = typeof op.total === 'number' && typeof op.done === 'number' && op.total > 0
    ? `${formatSyncCount(op.done)}/${formatSyncCount(op.total)}`
    : null;
  const countsText = formatSyncCountsInline(op.counts);
  return h('div.sync-menu__op', { key: op.opId }, [
    h('div.sync-menu__op-header', [
      h('span.sync-menu__op-label', SYNC_PROGRESS_OP_LABELS[op.kind]),
      progress ? h('span.sync-menu__op-progress', progress) : null,
    ]),
    op.phase ? h('div.sync-menu__label', op.phase) : null,
    countsText ? h('div.sync-menu__label', countsText) : null,
  ]);
}

function renderSyncIssueRow(issue: RemoteSyncIssue, redraw: () => void): VNode {


  const severity = issue.severity;
  const countsText = issue.counts ? formatSyncCountsInline(issue.counts) : '';
  const label = h('div.sync-menu__label', {
    class: {
      'sync-menu__label--warning': severity === 'warning',
      'sync-menu__label--error': severity === 'error',
    },
  }, countsText ? `${issue.message} (${countsText})` : issue.message);
  // P2c (audit G-1): server-wins-conflicts is the one issue with an explicit menu "Dismiss"
  // action — it clears the persistent visibility record, not any sync data (the server's version
  // already won when the conflict was resolved).
  if (issue.reason !== 'server-wins-conflicts') return label;
  return h('div.sync-menu__issue-row', { key: issue.reason }, [
    label,
    h('button.sync-menu__btn', {
      attrs: { type: 'button', ...controlExplainerAttrs({
        label: 'Dismiss sync conflict notice',
        description: 'Hide this notice; the server version has already won and no sync data is deleted.',
      }) },
      on: { click: () => { dismissServerWinsConflicts(); redraw(); } },
    }, 'Dismiss'),
  ]);
}

// P6b (audit F-8 gap 2): idle-queue backoff line, rendered only while nothing is actively
// pushing/pulling/etc. — snapshot.backoff is derived and cached at refresh time (never IDB on
// render), so this is a plain synchronous format of already-known numbers.
function formatSyncRetryEta(msUntil: number): string {
  const seconds = Math.max(1, Math.round(Math.max(0, msUntil) / 1000));
  if (seconds < 60) return `~${seconds}s`;
  return `~${Math.max(1, Math.round(seconds / 60))}m`;
}

function renderSyncBackoffRow(backoff: RemoteSyncBackoffState): VNode {
  const eta = formatSyncRetryEta(backoff.earliestNextAttemptAt - Date.now());
  return h('div.sync-menu__label', `${formatSyncCount(backoff.count)} queued, retrying in ${eta}`);
}

function buildSyncProgressDiagnosticsText(snapshot: RemoteSyncProgressSnapshot): string {
  const identity = snapshot.identity;
  const lines = [
    buildReleaseIdentityCopyText(),
    '',
    'Sync progress:',
    `State: ${snapshot.state} (${snapshot.severity})`,
    `Label: ${snapshot.label}`,
    snapshot.title ? `Detail: ${snapshot.title}` : null,
    `Session: ${identity.identityLabel ?? 'Logged out'} · ${identity.deviceTag} · session ${identity.sessionIdShort} · client ${identity.clientIdShort}`,
    identity.scopeNote,
    `Queued for sync (durable outbox): ${getRemoteSyncOutboxCount()}`,
    snapshot.backoff
      ? `Backoff: ${snapshot.backoff.count} queued, retrying in ${formatSyncRetryEta(snapshot.backoff.earliestNextAttemptAt - Date.now())} (earliest ${new Date(snapshot.backoff.earliestNextAttemptAt).toISOString()})`
      : null,
    ...snapshot.operations.map(op => {
      const progress = typeof op.total === 'number' ? ` ${op.done ?? 0}/${op.total}` : '';
      const counts = Object.entries(op.counts).map(([key, value]) => `${key}=${value}`).join(', ');
      return `Operation ${op.kind}${progress}${op.phase ? ` (${op.phase})` : ''}${counts ? ` [${counts}]` : ''}`;
    }),
    ...snapshot.issues.map(issue => {
      const counts = issue.counts
        ? Object.entries(issue.counts).map(([key, value]) => `${key}=${value}`).join(', ')
        : '';
      return `Issue ${issue.reason}: ${issue.message}${counts ? ` [${counts}]` : ''}`;
    }),
  ].filter((line): line is string => line !== null);
  return lines.join('\n');
}

function copySyncProgressDiagnostics(redraw: () => void): void {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    syncDiagnosticsCopyMessage = 'Copy failed.';
    redraw();
    return;
  }
  syncDiagnosticsCopyMessage = 'Copying...';
  redraw();
  const text = buildSyncProgressDiagnosticsText(getRemoteSyncProgressSnapshot());
  navigator.clipboard.writeText(text).then(() => {
    syncDiagnosticsCopyMessage = 'Copied.';
    redraw();
  }, () => {
    syncDiagnosticsCopyMessage = 'Copy failed.';
    redraw();
  });
}

function runSyncProgressCheck(redraw: () => void): void {
  if (syncProgressCheckBusy) return;
  syncProgressCheckBusy = true;
  syncProgressCheckMessage = 'Checking…';
  redraw();
  refreshRemoteSyncProgressSnapshot().then(snapshot => {
    syncProgressCheckBusy = false;
    syncProgressCheckMessage = snapshot.severity === 'error'
      ? `Sync check found an issue: ${snapshot.title}`
      : 'Sync check complete.';
    redraw();
  }).catch((error: unknown) => {
    syncProgressCheckBusy = false;
    syncProgressCheckMessage = error instanceof Error ? error.message : 'Sync check failed.';
    redraw();
  });
}

function runQueueLocalLibrary(redraw: () => void): void {
  if (syncProgressQueueBusy) return;
  syncProgressQueueBusy = true;
  syncProgressQueueMessage = 'Scanning local library…';
  redraw();
  queueLocalLibraryForRemoteSync().then(result => {
    syncProgressQueueBusy = false;
    syncProgressQueueMessage = result.success
      ? `Local library queued${result.counts ? ` (${formatSyncCountsInline(result.counts)})` : ''}.`
      : `Error: ${result.error}`;
    redraw();
  }).catch((error: unknown) => {
    syncProgressQueueBusy = false;
    syncProgressQueueMessage = error instanceof Error ? error.message : 'Could not queue the local library.';
    redraw();
  });
}

function renderSyncProgressMenu(redraw: () => void): VNode | null {
  const snapshot = getRemoteSyncProgressSnapshot();
  const busyVisible = snapshot.severity === 'active' && syncBusyIndicatorVisible(snapshot, redraw);

  // Header stays quiet unless something deserves attention: errors and warnings show
  // immediately; routine activity only surfaces as a spinner once it has run past the
  // hysteresis window; short review-driven micro-syncs never appear at all. The menu never
  // vanishes while the user has it open, even if everything completes underneath it.
  const showTrigger = snapshot.severity === 'error'
    || snapshot.severity === 'warning'
    || busyVisible
    || showSyncProgressMenu;
  if (!showTrigger) {
    if (snapshot.severity !== 'active') syncActivitySince = null;
    return null;
  }

  const canQueueLocalLibrary = snapshot.issues.some(issue => issue.reason === 'untracked-local-items');
  const syncPillSpec = syncTriggerPillSpec(snapshot.severity, busyVisible, findSyncDrivingOperation(snapshot));
  // Same error > warning > busy > idle precedence as syncTriggerPillSpec, restated here only to
  // pick the BEM state modifier class (no state-logic change).
  const syncPillState = snapshot.severity === 'error' ? 'error'
    : snapshot.severity === 'warning' ? 'warning'
    : busyVisible ? 'syncing'
    : 'idle';

  return h('div.sync-menu', [
    h('button.sync-menu__trigger', {
      class: {
        active: showSyncProgressMenu,
        [`sync-menu__trigger--${syncPillState}`]: true,
        'sync-menu__trigger--counted': syncPillSpec.countText !== null,
        'sync-severity--active': busyVisible,
        'sync-severity--warning': snapshot.severity === 'warning',
        'sync-severity--error': snapshot.severity === 'error',
      },
      attrs: { type: 'button', ...iconControlExplainerAttrs({
        label: showSyncProgressMenu ? 'Close sync status' : 'Open sync status',
        description: snapshot.title,
      }) },
      on: { click: () => {
        const opening = !showSyncProgressMenu;
        showSyncProgressMenu = opening;
        redraw();



        if (opening) refreshRemoteSyncProgressSnapshot().then(() => redraw()).catch(() => redraw());
      } },
    }, renderSyncTriggerContent(syncPillSpec)),

    showSyncProgressMenu ? h('div.sync-menu__backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close sync status' }) },
      on: {
        click: () => { showSyncProgressMenu = false; redraw(); },
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showSyncProgressMenu = false; redraw(); }),
      },
    }) : null,

    showSyncProgressMenu ? h('div.sync-menu__dropdown', [
      h('div.sync-menu__panel-header', [
        h('div.sync-menu__panel-title', 'Sync Status'),
        h('button.sync-menu__panel-close', {
          attrs: { type: 'button', ...iconControlExplainerAttrs({ label: 'Close sync status' }) },
          on: { click: () => { showSyncProgressMenu = false; redraw(); } },
        }, 'x'),
      ]),

      h('div.sync-menu__section', [
        h('div.sync-menu__identity-line',
          `${snapshot.identity.identityLabel ?? 'Logged out'} · ${snapshot.identity.deviceTag} · session ${snapshot.identity.sessionIdShort} · client ${snapshot.identity.clientIdShort}`),
        h('div.sync-menu__label', snapshot.identity.scopeNote),
      ]),

      snapshot.operations.length > 0 ? h('div.sync-menu__section', [
        h('div.sync-menu__section-title', 'Active'),
        ...snapshot.operations.map(renderSyncOperationRow),
      ]) : snapshot.severity === 'ok' ? h('div.sync-menu__section', [
        h('div.sync-menu__label.sync-menu__label--ok', 'All synced — no pending sync work in this tab.'),
      ]) : null,

      h('div.sync-menu__section', [
        h('div.sync-menu__label', `Queued for sync: ${formatSyncCount(getRemoteSyncOutboxCount())}`),
        // P6b (audit F-8 gap 2): only shown while idle (no active operation) — the driving
        // operation's own progress already covers a live push/drain.
        snapshot.operations.length === 0 && snapshot.backoff ? renderSyncBackoffRow(snapshot.backoff) : null,
      ]),

      snapshot.issues.length > 0 ? h('div.sync-menu__section', [
        h('div.sync-menu__section-title', 'Issues'),
        ...snapshot.issues.map(issue => renderSyncIssueRow(issue, redraw)),
      ]) : null,

      h('div.sync-menu__section', [
        h('div.sync-menu__row', [
          h('button.sync-menu__btn', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Open Sync Dashboard',
              description: 'Open detailed sync status, diagnostics, and recovery controls.',
            }) },
            on: { click: () => { showSyncProgressMenu = false; redraw(); writeHashRoute('#/sync'); } },
          }, 'Open Sync Dashboard'),
          renderDisabledControlWhen(
            syncProgressCheckBusy ? 'Patzer is checking sync readiness with the server.' : null,
            syncProgressCheckBusy ? 'Checking sync' : 'Run sync check',
            h('button.sync-menu__btn', {
              attrs: { type: 'button', disabled: syncProgressCheckBusy, ...controlExplainerAttrs({
                label: syncProgressCheckBusy ? 'Checking sync' : 'Run sync check',
                description: syncProgressCheckBusy
                  ? 'Patzer is checking sync readiness with the server.'
                  : 'Re-check sync readiness with the server.',
              }) },
              on: { click: () => runSyncProgressCheck(redraw) },
            }, syncProgressCheckBusy ? 'Checking…' : 'Run sync check'),
          ),
          h('button.sync-menu__btn', {
            attrs: { type: 'button', ...controlExplainerAttrs({
              label: 'Copy sync diagnostics',
              description: 'Copy counts and identifiers without including authentication tokens.',
            }) },
            on: { click: () => copySyncProgressDiagnostics(redraw) },
          }, 'Copy diagnostics'),
          canQueueLocalLibrary ? renderDisabledControlWhen(
            syncProgressQueueBusy ? 'Patzer is already queueing the local library for sync.' : null,
            syncProgressQueueBusy ? 'Queueing local library' : 'Queue local library',
            h('button.sync-menu__btn', {
              attrs: { type: 'button', disabled: syncProgressQueueBusy, ...controlExplainerAttrs({
                label: syncProgressQueueBusy ? 'Queueing local library' : 'Queue local library',
                description: syncProgressQueueBusy
                  ? 'Patzer is already queueing the local library for sync.'
                  : 'Queue local items for which the server has no recorded version.',
              }) },
              on: { click: () => runQueueLocalLibrary(redraw) },
            }, syncProgressQueueBusy ? 'Queueing…' : 'Queue local library for sync'),
          ) : null,
        ]),
        syncProgressCheckMessage ? h('div.sync-menu__label', syncProgressCheckMessage) : null,
        syncProgressQueueMessage ? h('div.sync-menu__label', syncProgressQueueMessage) : null,
        syncDiagnosticsCopyMessage ? h('div.sync-menu__label', syncDiagnosticsCopyMessage) : null,
      ]),
    ]) : null,
  ]);
}

// --- Global settings menu ---

function closeGlobalMenu(redraw: () => void): void {
  showGlobalMenu    = false;
  showBoardSettings = false;
  showEvalGraphSettings = false;
  showReleaseDetails = false;
  releaseCopyMessage = '';
  redraw();
}

function routePathFromCurrentHash(): string {
  try {
    if (typeof window === 'undefined') return '';
    const path = window.location.hash.replace(/^#\/?/, '').trim();
    return path ? `/${path}` : '/analysis';
  } catch {
    return '';
  }
}

function fallbackReportRoute(route: Route): string {
  switch (route.name) {
    case 'analysis-game':
      return route.params.id ? `/analysis/${route.params.id}` : '/analysis';
    case 'analysis':
      return '/analysis';
    case 'opponents':
      return '/openings';
    case 'stats':
      return '/stats';
    case 'games':
      return '/games';
    case 'puzzle-round':
      return route.params.id ? `/puzzles/${route.params.id}` : '/puzzles';
    case 'puzzles':
      return '/puzzles';
    case 'study-detail':
      return route.params.id ? `/study/${route.params.id}` : '/study';
    case 'study':
      return '/study';
    case 'sync':
      return '/sync';
    case 'admin-diagnostics':
      return '/admin/diagnostics';
    case 'admin':
      return '/admin';
    default:
      return route.name ? `/${route.name}` : '';
  }
}

function reportRoute(route: Route): string {
  return routePathFromCurrentHash() || fallbackReportRoute(route);
}

function reportGlobalMenuIssue(route: Route, redraw: () => void): void {
  const session = reportIssue({ triggeredBy: 'global-settings-menu', route: reportRoute(route) });
  console.info('[diagnostics] report issue session', session);
  closeGlobalMenu(redraw);
}

// --- Detection Settings modal ---

interface SliderDef {
  key:             keyof typeof missedMomentConfig;
  label:           string;
  description:     string;
  min:             number;
  max:             number;
  step:            number;
  format:          (v: number) => string;
  lichessDefault?: number;
}

const DETECTION_SLIDERS: SliderDef[] = [
  {
    key: 'swingThreshold',
    label: 'Swing Threshold',
    description: 'Minimum win-chance drop required to flag a tactical mistake. Lower = more sensitive; flags smaller errors. 0.05 is the Lichess inaccuracy floor — any real mistake will be caught.',
    min: 0.01, max: 0.30, step: 0.01,
    format: v => v.toFixed(2),
    lichessDefault: 0.05,
  },
  {
    key: 'missedMateMaxN',
    label: 'Missed Mate in N',
    description: 'Flag a move when a forced checkmate in N moves or fewer was on the board but not played. Lichess flags missed mates in 3 or fewer. Set to 0 to disable this category entirely.',
    min: 0, max: 10, step: 1,
    format: v => v === 0 ? 'off' : `in ${v}`,
    lichessDefault: 3,
  },
  {
    key: 'collapseWcFloor',
    label: 'Near-Win Floor',
    description: 'How dominant the mover must be (win chances %) before a near-win collapse can be flagged. 55% ≈ +50–100 centipawns advantage. Raise this to only flag collapses from clearly winning positions.',
    min: 0.50, max: 0.95, step: 0.05,
    format: v => `${Math.round(v * 100)}%`,
  },
  {
    key: 'collapseDropMin',
    label: 'Collapse Drop',
    description: 'Minimum win-chance loss to flag a near-win collapse. Intentionally lower than the swing threshold — throwing away a won game is significant even when the raw drop is modest.',
    min: 0.02, max: 0.20, step: 0.01,
    format: v => v.toFixed(2),
  },
  {
    key: 'maxPly',
    label: 'Max Ply',
    description: 'Stop flagging tactical mistakes after this many half-moves (plies). Ply 60 = move 30. Set to 0 to check the entire game including the endgame. Lichess analysis covers up to ply 60.',
    min: 0, max: 120, step: 10,
    format: v => v === 0 ? 'all' : `ply ${v} (move ${v / 2})`,
    lichessDefault: 60,
  },
];

function renderDetectionModal(redraw: () => void): VNode {
  const cfg = missedMomentConfig;

  const rows = DETECTION_SLIDERS.map(s => {
    const value = cfg[s.key] as number;
    const markerPct = s.lichessDefault !== undefined
      ? ((s.lichessDefault - s.min) / (s.max - s.min)) * 100
      : null;

    return h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', s.label),
        h('span.detection-modal__value', s.format(value)),
      ]),
      h('p.detection-modal__desc', s.description),
      h('div.detection-modal__slider-wrap', [
        h('input', {
          attrs: { type: 'range', min: s.min, max: s.max, step: s.step, value, ...controlExplainerAttrs({
            label: s.label,
            description: s.description,
          }) },
          on: {
            input: (e: Event) => {
              const raw = parseFloat((e.target as HTMLInputElement).value);
              setMissedMomentConfig({ [s.key]: s.step >= 1 ? Math.round(raw) : raw });
              redraw();
            },
          },
        }),
        markerPct !== null
          ? h('span.detection-modal__default-mark', {
              attrs: {
                style: `left: ${markerPct}%`,
              },
            })
          : null,
      ]),
    ]);
  });

  return h('div.detection-modal', [
    h('div.detection-modal__backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close detection settings' }) },
      on: {
        click: () => { showDetectionModal = false; redraw(); },
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showDetectionModal = false; redraw(); }),
      },
    }),
    h('div.detection-modal__card', [
      h('div.detection-modal__header', [
        h('h2', 'Detection Settings'),
        h('button.detection-modal__close', {
          attrs: iconControlExplainerAttrs({ label: 'Close detection settings' }),
          on: { click: () => { showDetectionModal = false; redraw(); } },
        }, '✕'),
      ]),
      h('div.detection-modal__body', rows),
    ]),
  ]);
}

// --- Mistake Detection modal ---
// Controls retroConfig (Learn From Your Mistakes candidate-selection parameters).
// Uses the same detection-modal card structure and CSS classes as renderDetectionModal.

export interface RetroConfigBodyOptions {
  countSummary?: RetroChoiceCountSummary | null;
  idPrefix?: string;
}





const RETRO_SENSITIVITY_PRESET_LABELS: Readonly<Record<RetroChoiceSeverityPresetId, string>> = {
  'all-mistake-moments': 'Inaccuracies & worse (5%)',
  'mistakes-or-worse':   'Mistakes & worse (10%)',
  'blunders-only':       'Blunders only (15%)',
};

const RETRO_PREVIEW_CHIP_CAP = 12;

// "12. Qe2" / "31… Rxd4" -- fullmove number + SAN, mover-side ellipsis convention.
// Matches the existing convention in src/analyse/lichessCompareUi.ts renderMistakeMoments.
function formatRetroPreviewMoveChip(move: { ply: number; san: string }): string {
  const moveNumber = Math.max(1, Math.ceil(move.ply / 2));
  const sideMark = move.ply % 2 === 1 ? '.' : '…';
  return `${moveNumber}${sideMark} ${move.san}`;
}

function findRetroPreviewFamily(
  preview: RetroConfigPreviewSummary | null,
  id: RetroConfigPreviewFamilyId,
): RetroConfigFamilyPreview | null {
  return preview?.families.find(f => f.id === id) ?? null;
}

// Renders the qualifying-move chips for one family, capped with a "+N more" tail.
// `family` is null when there is no live preview available for the current game
// (caller decides whether/where to show the single unreviewed-game guidance line
// instead of calling this at all).
function renderRetroPreviewChips(family: RetroConfigFamilyPreview | null, emptyLabel: string): VNode | null {
  if (!family) return null;
  if (family.moves.length === 0) return h('p.detection-modal__preview-empty', emptyLabel);
  const shown = family.moves.slice(0, RETRO_PREVIEW_CHIP_CAP);
  const extra = family.moves.length - shown.length;
  return h('div.detection-modal__chip-row', [
    ...shown.map((move, i) =>
      h('span.detection-modal__chip', { key: `${move.ply}-${move.san}-${i}` }, [
        formatRetroPreviewMoveChip(move),



        h('span.detection-modal__chip-loss', {
          attrs: { style: `color: ${getTierMeta(classifySeverity(move.loss, false)).color}` },
        }, `−${Math.round(move.loss * 100)}%`),
      ])),
    ...(extra > 0 ? [h('span.detection-modal__chip.detection-modal__chip--more', `+${extra} more`)] : []),
  ]);
}



function retroCollapseRuleText(cfg: RetroConfig): string {
  return `You were clearly winning (≥${formatRetroChoiceLossPercent(cfg.collapseWcFloor)}) and one move ` +
    `dropped your winning chances by ≥${formatRetroChoiceLossPercent(cfg.collapseDropMin)}.`;
}

function retroDefensiveRuleText(cfg: RetroConfig): string {
  return `You were worse off (≤${formatRetroChoiceLossPercent(cfg.defensiveWcCeiling)}) and missed a move ` +
    `at least ${formatRetroChoiceLossPercent(cfg.defensiveSalvageMin)} better than the one you played.`;
}

function retroPunishRuleText(cfg: RetroConfig): string {
  return `Your opponent blundered (≥${formatRetroChoiceLossPercent(cfg.punishOpponentSwingMin)} swing) and ` +
    `your reply gave ≥${formatRetroChoiceLossPercent(cfg.punishExploitDropMin)} back.`;
}

function retroMissedMateRuleText(cfg: RetroConfig): string {
  return cfg.missedMateDistance > 0
    ? `A forced mate in ≤${cfg.missedMateDistance} was available and not played — always included.`
    : 'Disabled — raise this above 0 to flag missed forced mates.';
}


export function renderRetroConfigBody(redraw: () => void, options: RetroConfigBodyOptions = {}): VNode[] {
  const cfg = retroConfig;
  const selectedTone = FEEDBACK_TONE_OPTIONS.find(o => o.value === cfg.feedbackTone) ?? FEEDBACK_TONE_OPTIONS[0]!;
  const countSummary = options.countSummary ?? null;
  const configPreview = countSummary?.configPreview ?? null;
  const idPrefix = options.idPrefix ?? 'retro-config';
  const feedbackToneLabelId = `${idPrefix}-feedback-tone-label`;
  const matchesSensitivityPreset = RETRO_CHOICE_SEVERITY_PRESETS.some(
    p => p.generationLossThreshold === cfg.minLossThreshold,
  );
  const isSensitivityCustom = retroSensitivityCustomOpen || !matchesSensitivityPreset;
  const isDefault =
    cfg.minLossThreshold      === RETRO_CONFIG_DEFAULTS.minLossThreshold &&
    cfg.missedMateDistance    === RETRO_CONFIG_DEFAULTS.missedMateDistance &&
    cfg.collapseEnabled      === RETRO_CONFIG_DEFAULTS.collapseEnabled &&
    cfg.collapseWcFloor      === RETRO_CONFIG_DEFAULTS.collapseWcFloor &&
    cfg.collapseDropMin      === RETRO_CONFIG_DEFAULTS.collapseDropMin &&
    cfg.defensiveEnabled     === RETRO_CONFIG_DEFAULTS.defensiveEnabled &&
    cfg.defensiveWcCeiling   === RETRO_CONFIG_DEFAULTS.defensiveWcCeiling &&
    cfg.defensiveSalvageMin  === RETRO_CONFIG_DEFAULTS.defensiveSalvageMin &&
    cfg.punishEnabled        === RETRO_CONFIG_DEFAULTS.punishEnabled &&
    cfg.punishOpponentSwingMin === RETRO_CONFIG_DEFAULTS.punishOpponentSwingMin &&
    cfg.punishExploitDropMin === RETRO_CONFIG_DEFAULTS.punishExploitDropMin &&
    cfg.feedbackTone         === RETRO_CONFIG_DEFAULTS.feedbackTone;

  return [
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', { attrs: { id: feedbackToneLabelId } }, 'Feedback Tone'),
        h('span.detection-modal__value', selectedTone.label),
      ]),
      h('p.detection-modal__desc', `Switches all Learn From Your Mistakes feedback text. ${selectedTone.description}.`),
      h('div.detection-modal__tone-segment', {
        attrs: {
          role: 'radiogroup',
          'aria-labelledby': feedbackToneLabelId,
        },
      }, FEEDBACK_TONE_OPTIONS.map(option =>
        h(`button.detection-modal__tone-option.detection-modal__tone-option--${option.value}`, {
          class: { 'is-active': cfg.feedbackTone === option.value },
          attrs: {
            type: 'button',
            role: 'radio',
            'aria-checked': cfg.feedbackTone === option.value ? 'true' : 'false',
            ...controlExplainerAttrs({
              label: `${option.label} feedback tone`,
              description: option.description,
            }),
          },
          on: { click: () => {
            setRetroConfig({ feedbackTone: option.value });
            redraw();
          }},
        }, [
          h('span.detection-modal__tone-label', option.label),
          h('span.detection-modal__tone-desc', option.description),
        ]),
      )),
    ]),



    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Sensitivity'),
        countSummary
          ? h('span.detection-modal__value', `${countSummary.total} selected`)
          : null,
      ].filter(Boolean) as VNode[]),
      h('p.detection-modal__desc',
        'How small a mistake counts as a learning moment. Uses the same severity labels as the ' +
        'Learn From Your Mistakes choice page. Counts update for the current game as settings change.'),
      h('div.detection-modal__preset-grid.detection-modal__preset-grid--sensitivity', [
        ...RETRO_CHOICE_SEVERITY_PRESETS.map(preset => {
          const active = !isSensitivityCustom && cfg.minLossThreshold === preset.generationLossThreshold;
          const count = countSummary?.presets.find(p => p.id === preset.id)?.count;
          const label = RETRO_SENSITIVITY_PRESET_LABELS[preset.id];
          return h('button.detection-modal__preset-option', {
            class: { 'is-active': active },
            attrs: { type: 'button', ...controlExplainerAttrs({
              label,
              description: `Select mistakes with a win-chance loss of at least ${formatRetroChoiceLossPercent(preset.generationLossThreshold)}.`,
            }) },
            on: { click: () => {
              retroSensitivityCustomOpen = false;
              setRetroConfig({ minLossThreshold: preset.generationLossThreshold });
              redraw();
            }},
          }, [
            h('span.detection-modal__preset-label', label),
            count !== undefined
              ? h('span.detection-modal__preset-count', `${count}`)
              : null,
          ].filter(Boolean) as VNode[]);
        }),
        h('button.detection-modal__preset-option', {
          class: { 'is-active': isSensitivityCustom },
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Custom sensitivity',
            description: 'Set a custom win-chance loss percentage for learning moments.',
          }) },
          on: { click: () => { retroSensitivityCustomOpen = true; redraw(); } },
        }, [
          h('span.detection-modal__preset-label', 'Custom…'),
        ]),
      ]),
      ...(isSensitivityCustom ? [
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Custom Threshold'),
          h('span.detection-modal__value', `loss ≥ ${formatRetroChoiceLossPercent(cfg.minLossThreshold)}`),
        ]),
        h('div.detection-modal__severity-slider', [
          h('input.severity-range', {
            attrs: { type: 'range', min: 1, max: 25, step: 1,
                     value: Math.round(cfg.minLossThreshold * 100),
                     ...controlExplainerAttrs({
                       label: 'Custom sensitivity threshold',
                       description: 'Set the minimum win-chance loss that counts as a learning moment.',
                     }) },
            on: {
              input: (e: Event) => {
                const pctValue = parseInt((e.target as HTMLInputElement).value, 10);
                setRetroConfig({ minLossThreshold: pctValue / 100 });
                redraw();
              },
            },
          }),
          h('span.severity-divider--inaccuracy'),
          h('span.severity-divider--mistake'),
          h('span.severity-divider--blunder'),
          h('span.detection-modal__default-mark', {
            attrs: { style: 'left: 37.5%' },
          }),
          h('div.detection-modal__severity-ticks', [
            h('span', '1%'),
            h('span', 'Inaccuracy'),
            h('span', 'Mistake'),
            h('span', 'Blunder'),
            h('span', '25%'),
          ]),
        ]),
      ] : []),
      countSummary
        ? h('p.detection-modal__preview-total', `This game: ${countSummary.total} moments`)
        : null,
      configPreview
        ? renderRetroPreviewChips(
            findRetroPreviewFamily(configPreview, 'sensitivity'),
            'No qualifying moves at the current sensitivity.',
          )
        : h('p.detection-modal__preview-empty', 'Run a Game Review to preview which moves qualify.'),
    ].filter((n): n is VNode => n !== null)),

    // missedMateDistance — slider
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Missed Mate in N'),
        h('span.detection-modal__value',
          cfg.missedMateDistance === 0 ? 'off' : `in ${cfg.missedMateDistance}`),
      ]),
      h('p.detection-modal__desc', retroMissedMateRuleText(cfg)),
      h('div.detection-modal__slider-wrap', [
        h('input', {
          attrs: { type: 'range', min: 0, max: 10, step: 1, value: cfg.missedMateDistance, ...controlExplainerAttrs({
            label: 'Missed mate distance',
            description: 'Set the longest forced mate that should always count as a learning moment.',
          }) },
          on: {
            input: (e: Event) => {
              setRetroConfig({ missedMateDistance: parseInt((e.target as HTMLInputElement).value, 10) });
              redraw();
            },
          },
        }),
        // Lichess default marker at position 3 (30% of 0–10 range)
        h('span.detection-modal__default-mark', {
          attrs: { style: 'left: 30%' },
        }),
      ]),
      cfg.missedMateDistance > 0
        ? renderRetroPreviewChips(
            findRetroPreviewFamily(configPreview, 'missed-mate'),
            'No missed forced mates in this game.',
          )
        : null,
    ].filter((n): n is VNode => n !== null)),

    // ── Collapse (blown win) family ──────────────────────────────────
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Blown Wins'),
      ]),
      h('p.detection-modal__desc', retroCollapseRuleText(cfg)),
      renderToggleRow('detection-collapse', 'Enabled', cfg.collapseEnabled, (v) => { setRetroConfig({ collapseEnabled: v }); redraw(); }),
      ...(cfg.collapseEnabled ? [
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Win Chance Floor'),
          h('span.detection-modal__value', formatRetroChoiceLossPercent(cfg.collapseWcFloor)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.50, max: 0.95, step: 0.05, value: cfg.collapseWcFloor, ...controlExplainerAttrs({
              label: 'Blown-win chance floor',
              description: 'Set how winning the position must be before a collapse can be flagged.',
            }) },
            on: { input: (e: Event) => { setRetroConfig({ collapseWcFloor: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Minimum Drop'),
          h('span.detection-modal__value', formatRetroChoiceLossPercent(cfg.collapseDropMin)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.02, max: 0.30, step: 0.01, value: cfg.collapseDropMin, ...controlExplainerAttrs({
              label: 'Blown-win minimum drop',
              description: 'Set the minimum win-chance loss that counts as throwing away a winning position.',
            }) },
            on: { input: (e: Event) => { setRetroConfig({ collapseDropMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        renderRetroPreviewChips(
          findRetroPreviewFamily(configPreview, 'collapse'),
          'No qualifying moves at the current settings.',
        ),
      ] : []),
    ].filter((n): n is VNode => n !== null)),

    // ── Defensive resource family ────────────────────────────────────
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Missed Defenses'),
      ]),
      h('p.detection-modal__desc', retroDefensiveRuleText(cfg)),
      renderToggleRow('detection-defensive', 'Enabled', cfg.defensiveEnabled, (v) => { setRetroConfig({ defensiveEnabled: v }); redraw(); }),
      ...(cfg.defensiveEnabled ? [
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Position Ceiling'),
          h('span.detection-modal__value', formatRetroChoiceLossPercent(cfg.defensiveWcCeiling)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.10, max: 0.50, step: 0.05, value: cfg.defensiveWcCeiling, ...controlExplainerAttrs({
              label: 'Defensive position ceiling',
              description: 'Set how poorly you must be doing before a missed defensive resource can be flagged.',
            }) },
            on: { input: (e: Event) => { setRetroConfig({ defensiveWcCeiling: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Salvage Gap'),
          h('span.detection-modal__value', formatRetroChoiceLossPercent(cfg.defensiveSalvageMin)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.05, max: 0.30, step: 0.01, value: cfg.defensiveSalvageMin, ...controlExplainerAttrs({
              label: 'Defensive salvage minimum',
              description: 'Set how much better a missed defensive move must be than the move played.',
            }) },
            on: { input: (e: Event) => { setRetroConfig({ defensiveSalvageMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        renderRetroPreviewChips(
          findRetroPreviewFamily(configPreview, 'defensive'),
          'No qualifying moves at the current settings.',
        ),
      ] : []),
    ].filter((n): n is VNode => n !== null)),

    // ── Punish-the-blunder family ────────────────────────────────────
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Missed Punishments'),
      ]),
      h('p.detection-modal__desc', retroPunishRuleText(cfg)),
      renderToggleRow('detection-punish', 'Enabled', cfg.punishEnabled, (v) => { setRetroConfig({ punishEnabled: v }); redraw(); }),
      ...(cfg.punishEnabled ? [
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Opponent Swing'),
          h('span.detection-modal__value', formatRetroChoiceLossPercent(cfg.punishOpponentSwingMin)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.05, max: 0.30, step: 0.01, value: cfg.punishOpponentSwingMin, ...controlExplainerAttrs({
              label: 'Opponent blunder swing',
              description: 'Set how large an opponent mistake must be before a missed punishment can be flagged.',
            }) },
            on: { input: (e: Event) => { setRetroConfig({ punishOpponentSwingMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Exploit Drop'),
          h('span.detection-modal__value', formatRetroChoiceLossPercent(cfg.punishExploitDropMin)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.02, max: 0.20, step: 0.01, value: cfg.punishExploitDropMin, ...controlExplainerAttrs({
              label: 'Missed-punishment drop',
              description: 'Set how much winning chance must be given back to flag a missed punishment.',
            }) },
            on: { input: (e: Event) => { setRetroConfig({ punishExploitDropMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        renderRetroPreviewChips(
          findRetroPreviewFamily(configPreview, 'punish'),
          'No qualifying moves at the current settings.',
        ),
      ] : []),
    ].filter((n): n is VNode => n !== null)),

    // Reset row
    !isDefault ? h('div.detection-modal__row', [
      h('button', {
        class: { 'detection-modal__close': true },
        attrs: controlExplainerAttrs({
          label: 'Reset mistake detection',
          description: 'Restore every mistake-detection setting to its default value.',
        }),
        on: { click: () => { setRetroConfig({ ...RETRO_CONFIG_DEFAULTS }); redraw(); } },
      }, 'Reset to defaults'),
    ]) : null,
  ].filter((n): n is VNode => n !== null);
}

function renderRetroModal(redraw: () => void): VNode {
  return h('div.detection-modal', [
    h('div.detection-modal__backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close mistake detection' }) },
      on: {
        click: () => { showRetroModal = false; redraw(); },
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showRetroModal = false; redraw(); }),
      },
    }),
    h('div.detection-modal__card', [
      h('div.detection-modal__header', [
        h('h2', 'Mistake Detection'),
        h('button.detection-modal__close', {
          attrs: iconControlExplainerAttrs({ label: 'Close mistake detection' }),
          on: { click: () => { showRetroModal = false; redraw(); } },
        }, '✕'),
      ]),
      h('div.detection-modal__body', renderRetroConfigBody(redraw, { idPrefix: 'global-retro-config' })),
    ]),
  ]);
}

function formatMenuTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function syncIdentityDisplayLabel(): string {
  const snapshot = getRemoteSyncIdentitySnapshot();
  if (!snapshot.hasToken) return 'Logged out';
  return snapshot.identityLabel ?? 'Token active, identity pending';
}

function syncLastSuccessLabel(snapshot = getRemoteSyncIdentitySnapshot()): string {
  const timestamp = formatMenuTimestamp(snapshot.lastSyncedAt);
  return timestamp ? `Last successful sync: ${timestamp}` : 'No successful sync recorded';
}

function renderSyncFreshnessValue(): VNode {
  const snapshot = getRemoteSyncIdentitySnapshot();
  return h('span.global-menu__sync-value', {
    class: { 'global-menu__sync-value--warning': snapshot.freshnessWarning },
    attrs: { title: snapshot.freshnessTitle },
  }, [
    snapshot.freshnessWarning
      ? renderRemoteSyncWarningIcon('global-menu__sync-warning-icon', snapshot.freshnessTitle)
      : null,
    h('span', snapshot.freshnessLabel),
  ]);
}

function renderSyncIdentityFooter(): VNode {
  const snapshot = getRemoteSyncIdentitySnapshot();
  return h('div.global-menu__sync-identity', [
    h('span.global-menu__sync-row', [
      h('span.global-menu__sync-label', 'Sync identity'),
      h('span.global-menu__sync-value', syncIdentityDisplayLabel()),
    ]),
    h('span.global-menu__sync-row', [
      h('span.global-menu__sync-label', 'Sync status'),
      renderSyncFreshnessValue(),
    ]),
    h('span.global-menu__sync-row', [
      h('span.global-menu__sync-label', 'Last sync'),
      h('span.global-menu__sync-value', syncLastSuccessLabel(snapshot)),
    ]),
  ]);
}

function buildReleaseIdentityCopyText(): string {
  const identity = getVisibleReleaseIdentity();
  const syncSnapshot = getRemoteSyncIdentitySnapshot();
  const lines = [
    `Product: ${releaseProductLabel(identity)}`,
    `Deploy: ${releaseDeployLabel(identity)}`,
    `Release: ${identity.release}`,
    identity.commit ? `Commit: ${identity.commit}` : null,
    identity.commitTimestamp ? `Commit timestamp: ${identity.commitTimestamp}` : null,
    identity.branch ? `Branch: ${identity.branch}` : null,
    identity.deployedAt ? `Deployed: ${identity.deployedAt}` : null,
    identity.builtAt ? `Built: ${identity.builtAt}` : null,
    `Sync identity: ${syncIdentityDisplayLabel()}`,
    `Sync freshness: ${syncSnapshot.freshnessLabel} (${syncSnapshot.freshnessState})`,
    syncSnapshot.localVersion !== null ? `Local sync version: ${syncSnapshot.localVersion}` : null,
    syncSnapshot.serverVersion !== null ? `Server sync version: ${syncSnapshot.serverVersion}` : null,
    syncSnapshot.lastSyncedAt
      ? `Last successful sync: ${formatMenuTimestamp(syncSnapshot.lastSyncedAt)}`
      : 'Last successful sync: No successful sync recorded',
    syncSnapshot.lastCheckedAt
      ? `Last database check: ${formatMenuTimestamp(syncSnapshot.lastCheckedAt)}`
      : 'Last database check: No database check recorded',
  ].filter((line): line is string => line !== null);

  if (identity.commitMessage) {
    lines.push('', 'Commit message:', identity.commitMessage);
  }

  return lines.join('\n');
}

function copyReleaseIdentityDetails(redraw: () => void): void {
  if (typeof navigator === 'undefined' || !navigator.clipboard) {
    releaseCopyMessage = 'Copy failed.';
    redraw();
    return;
  }

  releaseCopyMessage = 'Copying...';
  redraw();
  void navigator.clipboard.writeText(buildReleaseIdentityCopyText()).then(() => {
    releaseCopyMessage = 'Copied.';
    redraw();
  }, () => {
    releaseCopyMessage = 'Copy failed.';
    redraw();
  });
}

function renderReleaseIdentityFooter(redraw: () => void): VNode {
  const identity = getVisibleReleaseIdentity();
  const timestampLabel = releaseCommitTimestampLabel(identity);
  const detailRows = [
    identity.commit ? { label: 'Commit', value: identity.commit } : null,
    identity.commitTimestamp ? { label: 'Time', value: identity.commitTimestamp } : null,
    identity.branch ? { label: 'Branch', value: identity.branch } : null,
    identity.deployedAt ? { label: 'Deployed', value: identity.deployedAt } : null,
    identity.builtAt && !identity.deployedAt ? { label: 'Built', value: identity.builtAt } : null,
  ].filter((row): row is { label: string; value: string } => row !== null);
  loadLiveReleaseIdentity(redraw);

  return h('div.global-menu__release', {
    class: { 'global-menu__release--expanded': showReleaseDetails },
  }, [
    h('button.global-menu__release-toggle', {
      attrs: {
        type: 'button',
        'aria-expanded': showReleaseDetails ? 'true' : 'false',
        ...controlExplainerAttrs({
          label: `${releaseProductLabel(identity)}, ${releaseDeployLabel(identity)}`,
          description: releaseTooltip(identity),
        }),
      },
      on: {
        click: () => {
          showReleaseDetails = !showReleaseDetails;
          releaseCopyMessage = '';
          redraw();
        },
      },
    }, [
      h('span.global-menu__release-primary', [
        h('span.global-menu__release-product', releaseProductLabel(identity)),
        h('span.global-menu__release-chevron', showReleaseDetails ? '▾' : '›'),
      ]),
      h('span.global-menu__release-deploy', releaseDeployLabel(identity)),
      timestampLabel ? h('span.global-menu__release-timestamp', timestampLabel) : null,
    ]),
    showReleaseDetails ? h('span.global-menu__release-details', [
      h('span.global-menu__release-actions', [
        h('button.global-menu__release-copy', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Copy release details',
            description: 'Copy the current build and deployment identity.',
          }) },
          on: { click: () => copyReleaseIdentityDetails(redraw) },
        }, 'Copy'),
        releaseCopyMessage ? h('span.global-menu__release-copy-status', releaseCopyMessage) : null,
      ]),
      ...detailRows.map(row => h('span.global-menu__release-detail', [
        h('span.global-menu__release-detail-label', row.label),
        h('span.global-menu__release-detail-value', row.value),
      ])),
      identity.commitMessage ? h('span.global-menu__release-message-wrap', [
        h('span.global-menu__release-detail-label', 'Message'),
        h('span.global-menu__release-message', identity.commitMessage),
      ]) : null,
    ]) : null,
  ]);
}

function renderGlobalMenu(deps: HeaderDeps): VNode {
  const { downloadPgn, resetAllData, selectedGameId, redraw } = deps;
  const hasGame = selectedGameId !== null;
  const hasVerifiedSyncSession = remoteSyncActive || (remoteSyncChecking && hasRemoteSyncToken());
  return h('div.global-menu', [
    h('button.global-menu__trigger', {
      class: { active: showGlobalMenu },
      attrs: iconControlExplainerAttrs({ label: showGlobalMenu ? 'Close settings' : 'Open settings' }),
      on: { click: () => {
        showGlobalMenu    = !showGlobalMenu;
        showBoardSettings = false;
        showEvalGraphSettings = false;
        if (!showGlobalMenu) {
          showReleaseDetails = false;
          releaseCopyMessage = '';
        }
        redraw();
      }},
    }, '⚙'),

    showGlobalMenu ? h('div.global-menu__backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close settings' }) },
      on: {
        click: () => closeGlobalMenu(redraw),
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => closeGlobalMenu(redraw)),
      },
    }) : null,

    showGlobalMenu ? h('div.global-menu__dropdown', {
      class: { 'board-open': showBoardSettings || showEvalGraphSettings },
    }, [
      h('button.global-menu__item', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Report issue',
          description: 'Create a diagnostics report for the current page.',
        }) },
        on: { click: () => reportGlobalMenuIssue(deps.route, redraw) },
      }, 'Report issue'),

      h('button.global-menu__item', {
        attrs: controlExplainerAttrs({
          label: 'Clear local data',
          description: 'Delete Patzer data stored locally in this browser.',
        }),
        on: { click: () => {
          closeGlobalMenu(redraw);
          void resetAllData();
        } },
      }, 'Clear Local Data'),

      // Navigate to the analysis board to review the currently loaded game.
      // Disabled when no game is selected — nothing to review.
      renderDisabledControlWhen(
        hasGame ? null : 'Select a game before opening the Analysis Board.',
        'Analysis',
        h('button.global-menu__item', {
          attrs: { disabled: !hasGame, ...controlExplainerAttrs({
            label: 'Analysis',
            description: hasGame
              ? 'Open the selected game on the Analysis Board.'
              : 'Select a game before opening the Analysis Board.',
          }) },
          on: { click: () => {
            if (!hasGame) return;
            closeGlobalMenu(redraw);
            writeHashRoute(serializeAnalysisSelectedGameRoute(selectedGameId));
          }},
        }, 'Analysis'),
      ),




      h('button.global-menu__item', {
        attrs: controlExplainerAttrs({
          label: 'Export annotated PGN',
          description: 'Download the selected game with Patzer analysis annotations.',
        }),
        on: { click: () => { closeGlobalMenu(redraw); downloadPgn(true); } },
      }, 'Export PGN (Annotated)'),

      h('button.global-menu__item', {
        attrs: controlExplainerAttrs({
          label: 'Export plain PGN',
          description: 'Download the selected game without Patzer analysis annotations.',
        }),
        on: { click: () => { closeGlobalMenu(redraw); downloadPgn(false); } },
      }, 'Export PGN (Plain)'),

      h('div.global-menu__item.global-menu__item--toggle',
        renderToggleRow('board-wheel-nav', 'Board Wheel Navigation', boardWheelNavEnabled, (v) => { setBoardWheelNavEnabled(v); redraw(); }),
      ),




      h('div.global-menu__item.global-menu__item--toggle',
        renderToggleRow('board-sounds', 'Board Sounds', boardSoundEnabled, (v) => { setBoardSoundEnabled(v); redraw(); }),
      ),

      h('div.global-menu__item.global-menu__item--slider', [
        h('span', `Volume: ${Math.round(soundVolume * 100)}%`),
        h('input', {
          attrs: { type: 'range', min: 0, max: 1, step: 0.05, value: soundVolume, ...controlExplainerAttrs({
            label: 'Board sound volume',
            description: 'Set the volume of board move sounds.',
          }) },
          on: {
            input: (e: Event) => {
              setSoundVolume(parseFloat((e.target as HTMLInputElement).value));
              redraw();
            },
          },
        }),
      ]),

      h('button.global-menu__item', {
        attrs: controlExplainerAttrs({
          label: 'Detection Settings',
          description: 'Configure how analyzed moves are classified as missed tactical moments.',
        }),
        on: { click: () => { showDetectionModal = true; showGlobalMenu = false; redraw(); } },
      }, 'Detection Settings…'),

      h('button.global-menu__item', {
        attrs: controlExplainerAttrs({
          label: 'Mistake Detection',
          description: 'Configure which mistakes become Learn From Your Mistakes moments.',
        }),
        on: { click: () => { showRetroModal = true; showGlobalMenu = false; redraw(); } },
      }, 'Mistake Detection…'),

      hasVerifiedSyncSession ? h('button.global-menu__item', {
        attrs: controlExplainerAttrs({
          label: 'Sync Dashboard',
          description: 'Open detailed sync status, diagnostics, and recovery controls.',
        }),
        on: { click: () => {
          closeGlobalMenu(redraw);
          writeHashRoute('#/sync');
        } },
      }, 'Sync Dashboard') : null,

      headerAuthUser ? h('button.global-menu__item.global-menu__item--logout', {
        attrs: controlExplainerAttrs({
          label: 'Disconnect Lichess',
          description: 'Remove the connected Lichess chess identity from this browser.',
        }),
        on: { click: () => {
	          logout().then(() => {
	            stopAccountSettingsSync();
	            headerAuthUser = null;
	            headerAuthIsAdmin = false;
	            headerAuthProvider = null;
            closeGlobalMenu(redraw);
          });
        }},
      }, 'Disconnect Lichess') : null,

      h('button.global-menu__item.global-menu__item--has-sub', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Board Settings',
          description: `${showBoardSettings ? 'Close' : 'Open'} board appearance settings.`,
        }) },
        on: { click: () => { showBoardSettings = !showBoardSettings; redraw(); } },
      }, [
        h('span', 'Board Settings'),
        h('span.global-menu__arrow', showBoardSettings ? '▾' : '›'),
      ]),

      showBoardSettings ? renderBoardSettings(redraw) : null,

      h('button.global-menu__item.global-menu__item--has-sub', {
        attrs: { type: 'button', ...controlExplainerAttrs({
          label: 'Evaluation Graph',
          description: `${showEvalGraphSettings ? 'Close' : 'Open'} evaluation graph settings.`,
        }) },
        on: { click: () => { showEvalGraphSettings = !showEvalGraphSettings; redraw(); } },
      }, [
        h('span', 'Eval Graph'),
        h('span.global-menu__arrow', showEvalGraphSettings ? '▾' : '›'),
      ]),

      showEvalGraphSettings ? renderEvalGraphSettings(redraw) : null,

      renderSyncIdentityFooter(),
      renderReleaseIdentityFooter(redraw),
    ]) : null,
  ]);
}

// --- Mobile nav ---

function renderMobileSubmenu(submenu: HeaderMobileSubmenu, redraw: () => void): VNode | null {
  if (submenu.items.length === 0) return null;
  return h('div.header__mobile-submenu', [
    submenu.label ? h('div.header__mobile-submenu-label', submenu.label) : null,
    ...submenu.items.map(item =>
      h('button.header__mobile-submenu-item', {
        class: { active: !!item.active },
        attrs: { type: 'button', ...controlExplainerAttrs({ label: item.label }) },
        on: { click: () => {
          item.onSelect();
          showMobileNav = false;
          redraw();
        } },
      }, [
        item.icon ? h('span.header__mobile-submenu-icon', { attrs: { 'data-icon': item.icon } }) : null,
        h('span.header__mobile-submenu-text', item.label),
      ]),
    ),
  ]);
}

function renderMobileNavLinks(
  active: string,
  mobileSubmenus: readonly HeaderMobileSubmenu[],
  redraw: () => void,
  navHrefOverrides: Partial<Record<string, string>> = {},
): VNode[] {
  const nodes: VNode[] = [];
  navLinks.forEach(({ label, href, section }) => {
    nodes.push(h('a.header__mobile-link', {
      attrs: { href: navHrefOverrides[section] ?? href, ...controlExplainerAttrs({ label }) },
      class: { active: active === section },
      on: { click: () => { showMobileNav = false; redraw(); } },
    }, label));

    const submenu = mobileSubmenus.find(candidate => candidate.section === section);
    if (active === section && submenu) {
      const rendered = renderMobileSubmenu(submenu, redraw);
      if (rendered) nodes.push(rendered);
    }
  });
  return nodes;
}

function renderMobileNav(
  route: Route,
  redraw: () => void,
  mobileSubmenus: readonly HeaderMobileSubmenu[] = [],
  navHrefOverrides: Partial<Record<string, string>> = {},
): VNode {
  const active = activeSection(route);
  return h('div.header__mobile-nav', [
    h('button.header__hamburger', {
      class: { active: showMobileNav },
      attrs: iconControlExplainerAttrs({ label: showMobileNav ? 'Close navigation menu' : 'Open navigation menu' }),
      on: { click: () => { showMobileNav = !showMobileNav; redraw(); } },
    }, '☰'),
    showMobileNav ? h('div.header__mobile-backdrop', {
      attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close navigation menu' }) },
      on: {
        click: () => { showMobileNav = false; redraw(); },
        keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showMobileNav = false; redraw(); }),
      },
    }) : null,
    showMobileNav ? h('div.header__mobile-dropdown', renderMobileNavLinks(active, mobileSubmenus, redraw, navHrefOverrides)) : null,
  ]);
}

function renderHeaderAccountControl(
  accounts: readonly ChessAccount[],
  selectedAccount: ChessAccount | null,
  loading: boolean,
  submitImport: () => void,
  redraw: () => void,
): VNode {
  const mines = mineAccounts(accounts);
  if (mines.length === 0 || headerAccountMode === 'new') {
    const username = importPlatform === 'chesscom' ? chesscom.username : lichess.username;
    const inputLabel = `${platformLabel(importPlatform)} username`;
    const input = renderDisabledControlWhen(
      loading ? 'Wait for the current account import or sync to finish.' : null,
      inputLabel,
      h('input.header__input', {
      key: `input-${importPlatform}`,
      attrs: {
        type: 'search',
        placeholder: importPlatform === 'chesscom' ? 'Username Chess.com' : 'Username Lichess',
        disabled: loading,
        autocomplete: 'off',
        spellcheck: false,
        ...controlExplainerAttrs({
          label: inputLabel,
          description: loading
            ? 'Wait for the current account import or sync to finish.'
            : 'Enter the account whose games you want to import.',
        }),
      },
      props: { value: username },
      on: {
        input: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          if (importPlatform === 'chesscom') chesscom.username = v;
          else lichess.username = v;


          scheduleSyncImportCategory(redraw);
        },
        keydown: (e: KeyboardEvent) => {
          const currentUsername = importPlatform === 'chesscom' ? chesscom.username : lichess.username;
          if (e.key !== 'Enter' || !currentUsername.trim() || loading) return;


          showImportPanel = true;
          redraw();
        },
      },
      }),
    );

    if (mines.length === 0) return input;
    return h('div.header__account-entry', [
      input,
      renderDisabledControlWhen(
        loading ? 'Wait for the current account import or sync to finish.' : null,
        'Choose imported account',
        h('button.header__account-back', {
        attrs: { type: 'button', disabled: loading, ...controlExplainerAttrs({
          label: 'Choose imported account',
          description: loading
            ? 'Wait for the current account import or sync to finish.'
            : 'Return to a previously imported Mine account.',
        }) },
        on: { click: () => {
          headerAccountMode = 'account';
          showImportPanel = false;
          redraw();
        }},
        }, 'Accounts'),
      ),
    ]);
  }

  return renderDisabledControlWhen(
    loading ? 'Wait for the current account import or sync to finish.' : null,
    'Account to sync',
    h('select.header__account-select', {
    attrs: { disabled: loading, ...controlExplainerAttrs({
      label: 'Account to sync',
      description: loading
        ? 'Wait for the current account import or sync to finish.'
        : 'Choose a Mine account to sync or add another account.',
    }) },
    on: {
      change: (event: Event) => {
        const value = (event.target as HTMLSelectElement).value;
        headerSyncMessage = null;
        headerSyncError = null;
        if (value === 'new') {
          headerAccountMode = 'new';
          showImportPanel = false;
          if (importPlatform === 'chesscom') chesscom.username = '';
          else lichess.username = '';
          syncImportCategory(redraw);
          redraw();
          return;
        }
        selectedMineAccountId = value;
        const next = mines.find(account => account.id === value);
        if (next) {
          importPlatform = next.platform;
          if (next.platform === 'chesscom') chesscom.username = next.displayName;
          else lichess.username = next.displayName;
          syncImportCategory(redraw);
        }
        redraw();
      },
    },
    }, [
    ...mines.map(account => h('option', {
      attrs: { value: account.id, selected: selectedAccount?.id === account.id },
    }, `${account.displayName} - ${platformLabel(account.platform)}`)),
    h('option', { attrs: { value: 'new' } }, 'New user'),
    ]),
  );
}


const HEADER_PEEK_SPEEDS: readonly ImportSpeed[] = SPEED_OPTIONS.map(o => o.value);






function prefillAccountSyncFilters(account: ChessAccount): void {
  if (account.lastSyncSpeeds !== undefined) {
    importFilters.speeds = new Set(
      account.lastSyncSpeeds.filter((s): s is ImportSpeed => HEADER_PEEK_SPEEDS.some(v => v === s)),
    );
  }
  if (account.lastSyncRated !== undefined) importFilters.rated = account.lastSyncRated;
}







function ensureHeaderPeek(account: ChessAccount, redraw: () => void): void {
  if (account.newestGameTimestamp === null) { headerPeek = null; return; }
  const key = `${account.id}|${account.newestGameTimestamp}|${importFilters.rated}`;
  if (headerPeekKey === key) return;
  headerPeekKey = key;
  headerPeekLoading = true;
  headerPeek = null;
  const gen = ++headerPeekGen;
  void peekAccountSync(account, { rated: importFilters.rated, speeds: new Set(HEADER_PEEK_SPEEDS) })
    .then(res => {
      if (headerPeekGen !== gen) return;
      headerPeek = res;
      headerPeekLoading = false;
      redraw();
    })
    .catch(() => {
      if (headerPeekGen !== gen) return;
      headerPeekLoading = false;
      redraw();
    });
}


function resetHeaderPeek(): void {
  headerPeekKey = '';
  headerPeek = null;
  headerPeekLoading = false;
}






async function runHeaderAccountSync(account: ChessAccount, deps: HeaderDeps): Promise<void> {
  const { redraw } = deps;
  if (headerSyncRunning || headerOlderSyncRunning) return;
  const filterKey = importSyncFilterKey(importFilters.rated, importFilters.speeds);
  const filterMismatch = account.newestGameTimestamp !== null && account.syncFilterKey !== filterKey;
  const needsFallback = account.newestGameTimestamp === null || filterMismatch;
  headerSyncRunning = true;
  headerSyncAbort = new AbortController();
  headerSyncMessage = null;
  headerSyncError = null;
  redraw();
  try {
    const result: AccountSyncWithBackfillResult = await syncAccountGamesWithBackfill(account, {
      rated: importFilters.rated,
      speeds: importFilters.speeds,
      syncDateRange: currentImportDateRangeConfig(),
      backfillTargetStartMs: importRangeStartMsFor(currentImportDateRangeConfig()) ?? 0,
      signal: headerSyncAbort.signal,
      onProgress: count => {
        headerSyncMessage = `Fetched ${count} game${count === 1 ? '' : 's'}...`;
        redraw();
      },
      ...(needsFallback ? { fallbackDateRange: currentImportDateRangeConfig() } : {}),
    });
    const syncOutcome = deps.onSyncGames(result.newGames);
    deps.refreshAccounts();
    resetHeaderPeek();
    if (result.addedCount === 0) {
      headerSyncMessage = result.aborted ? 'Sync stopped — no new games imported' : 'No new games to import';
    } else {
      const olderAdded = result.older?.addedCount ?? 0;
      headerSyncMessage = `${result.aborted ? 'Sync stopped — imported' : 'Imported'} ${syncOutcome.addedCount} new game${syncOutcome.addedCount === 1 ? '' : 's'}${
        olderAdded > 0 ? ` (${olderAdded} older)` : ''}`;
    }
  } catch (err) {
    headerSyncError = err instanceof Error ? err.message : 'Sync failed.';
  } finally {
    headerSyncRunning = false;
    headerSyncAbort = null;
    redraw();
  }
}















function runHeaderAccountRescan(account: ChessAccount, deps: HeaderDeps): void {
  if (headerRescanRunning) return;
  headerRescanRunning = true;
  headerRescanMessage = null;
  headerRescanError = null;
  deps.redraw();
  try {
    const summary = enqueueAccountRescan(
      { platform: account.platform, username: account.username },
      deps.importedGames,
      // No display surface for merged fields yet (Track B: data-capture
      // only) — the caller has nothing to patch into view.
      { onGameUpdated: () => {} },
    );
    headerRescanMessage = summary.gamesConsidered === 0
      ? 'No previously-imported games to refresh.'
      : `Refreshing ${summary.gamesConsidered} game${summary.gamesConsidered === 1 ? '' : 's'} across ${
          summary.monthsQueued} month${summary.monthsQueued === 1 ? '' : 's'} in the background…`;
  } catch (err) {
    headerRescanError = err instanceof Error ? err.message : 'Refresh failed to start.';
  } finally {
    headerRescanRunning = false;
    deps.redraw();
  }
}

function renderSyncMenu(
  account: ChessAccount,
  deps: HeaderDeps,
): VNode {
  const { redraw } = deps;
  const filterKey = importSyncFilterKey(importFilters.rated, importFilters.speeds);
  const filterMismatch = account.newestGameTimestamp !== null && account.syncFilterKey !== filterKey;
  ensureHeaderPeek(account, redraw);
  const runSync = (): Promise<void> => runHeaderAccountSync(account, deps);

  const runOlderSync = async (): Promise<void> => {
    if (headerOlderSyncRunning || headerSyncRunning) return;
    const targetDateValue = headerOlderSyncTargetDate.trim();
    let targetDateStartMs: number | undefined;
    if (targetDateValue) {
      const parsedTarget = parseDateInputStartMs(targetDateValue);
      const todayStart = parseDateInputStartMs(todayDateInputValue());
      if (parsedTarget === null) {
        headerOlderSyncMessage = null;
        headerOlderSyncError = 'Choose a valid target date.';
        redraw();
        return;
      }
      if (todayStart !== null && parsedTarget > todayStart) {
        headerOlderSyncMessage = null;
        headerOlderSyncError = 'Target date cannot be in the future.';
        redraw();
        return;
      }
      if (account.oldestGameTimestamp !== null && parsedTarget >= account.oldestGameTimestamp) {
        headerOlderSyncMessage = null;
        headerOlderSyncError = 'Target date must be older than the oldest imported game.';
        redraw();
        return;
      }
      targetDateStartMs = parsedTarget;
    }
    headerOlderSyncRunning = true;
    headerOlderSyncMessage = null;
    headerOlderSyncError = null;
    redraw();
    try {
      const result = await syncAccountGamesOlder(account, {
        rated: importFilters.rated,
        speeds: importFilters.speeds,
        ...(targetDateStartMs !== undefined ? { targetDateStartMs } : {}),
        onProgress: count => {
          headerOlderSyncMessage = `Fetched ${count} game${count === 1 ? '' : 's'}...`;
          redraw();
        },
      });
      const syncOutcome = deps.onSyncGames(result.newGames);
      deps.refreshAccounts();
      if (!result.hadCursor) {
        headerOlderSyncMessage = 'No history cursor yet — run Sync first.';
      } else if (result.alreadyAtStart) {
        headerOlderSyncMessage = 'Full history already imported.';
      } else if (result.fetchedCount === 0) {
        headerOlderSyncMessage = targetDateStartMs === undefined
          ? 'No older games available.'
          : `No older games found back to ${targetDateValue}.`;
      } else if (result.addedCount === 0) {
        headerOlderSyncMessage = targetDateStartMs === undefined
          ? 'No new older games (all already imported).'
          : `Fetched older games back to ${targetDateValue}; all were already imported.`;
      } else {
        headerOlderSyncMessage = targetDateStartMs === undefined
          ? `Imported ${syncOutcome.addedCount} older game${syncOutcome.addedCount === 1 ? '' : 's'}`
          : `Imported ${syncOutcome.addedCount} older game${syncOutcome.addedCount === 1 ? '' : 's'} back to ${targetDateValue}`;
      }
    } catch (err) {
      headerOlderSyncError = err instanceof Error ? err.message : 'Load older games failed.';
    } finally {
      headerOlderSyncRunning = false;
      redraw();
    }
  };

  const hasOldestCursor = account.oldestGameTimestamp !== null;
  const oldestCursorAtStart = account.oldestGameTimestamp !== null && account.oldestGameTimestamp <= 0;
  const syncDisabledReason = headerSyncRunning
    ? 'The selected account is currently syncing.'
    : headerOlderSyncRunning
      ? 'Wait for older games to finish loading before starting a new sync.'
      : null;
  const olderInputDisabledReason = headerOlderSyncRunning
    ? 'Older games are currently loading.'
    : headerSyncRunning
      ? 'Wait for the current sync to finish before changing the older-games range.'
      : null;
  const oneBatchDisabledReason = olderInputDisabledReason
    ?? (!headerOlderSyncTargetDate ? 'Choose a target date before switching back to one batch.' : null);
  const loadOlderDisabledReason = headerOlderSyncRunning
    ? 'Older games are currently loading.'
    : headerSyncRunning
      ? 'Wait for the current sync to finish before loading older games.'
      : !hasOldestCursor
        ? 'Run Sync first to establish a history cursor.'
        : oldestCursorAtStart
          ? 'The full account history is already imported.'
          : null;

  return h('div.header__panel', [
    h('div.header__panel-section', [
      h('div.header__panel-label', `Sync ${account.displayName}`),
      h('p.header__panel-hint', account.newestGameTimestamp === null
        ? 'No sync cursor yet'
        : `Sync from newest imported game: ${formatSyncDate(account.newestGameTimestamp)}`),

      account.newestGameTimestamp !== null
        ? h('p.header__panel-hint', account.oldestGameTimestamp !== null && account.oldestGameTimestamp <= 0
            ? `Imported: full history — ${formatSyncDate(account.newestGameTimestamp)}`
            : account.oldestGameTimestamp !== null
            ? `Imported: ${formatSyncDate(account.oldestGameTimestamp)} — ${formatSyncDate(account.newestGameTimestamp)}`
            : '')
        : null,
      filterMismatch ? h('p.header__panel-hint.header__panel-warn',
        'Filter changed; Patzer will run a wider safety fetch and dedupe existing games.') : null,
    ]),
    h('div.header__panel-divider'),
    h('div.header__panel-section', [
      h('div.header__panel-label', 'Time control'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: importFilters.speeds.size === 0 },
          attrs: controlExplainerAttrs({
            label: 'All time controls',
            description: 'Include every time control in this sync.',
          }),
          on: { click: () => { importFilters.speeds = new Set(); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) => {
          const newCount = headerPeek?.newGameCountBySpeed[value] ?? 0;
          return h('button.header__pill', {
            class: { active: importFilters.speeds.has(value) },
            attrs: { 'data-icon': icon, ...controlExplainerAttrs({
              label: `${label} time control`,
              description: 'Include or exclude this time control from the sync.',
            }) },
            on: { click: () => {
              const s = new Set(importFilters.speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              importFilters.speeds = s;
              redraw();
            }},
          }, newCount > 0 ? `${label} · ${newCount}` : label);
        }),
      ]),
      h('div.header__panel-label.--mt', 'Period'),
      h('div.header__panel-row', DATE_RANGE_OPTIONS.map(({ value, label }) =>
        h('button.header__pill', {
          class: { active: importFilters.dateRange === value },
          attrs: controlExplainerAttrs({
            label: `${label} sync period`,
            description: 'Choose how far back the account sync should search.',
          }),
          on: { click: () => { importFilters.dateRange = value as ImportDateRange; redraw(); } },
        }, label),
      )),
      h('div.header__panel-row.--mt', [
        h('label.header__panel-check', [
          h('input', {
            attrs: { type: 'checkbox', checked: importFilters.rated, ...controlExplainerAttrs({
              label: 'Rated games only',
              description: 'Exclude casual games from this sync.',
            }) },
            on: { change: (e: Event) => { importFilters.rated = (e.target as HTMLInputElement).checked; redraw(); } },
          }),
          'Rated only',
        ]),
      ]),
    ]),
    h('div.header__panel-section', [
      headerPeekLoading ? h('p.header__panel-hint', 'Checking for new games…')
        : headerPeek?.supported
        ? h('p.header__panel-hint', headerPeek.newGameCount > 0
            ? `Sync in ${headerPeek.newGameCount} new game${headerPeek.newGameCount === 1 ? '' : 's'}`
            : 'Up to date')
        : null,
      headerSyncError ? h('div.header__panel-error', headerSyncError) : null,
      headerSyncMessage ? h('p.header__panel-hint', headerSyncMessage) : null,
      h('div.header__panel-row', [
        renderDisabledControlWhen(
          syncDisabledReason,
          headerSyncRunning ? 'Syncing games' : 'Sync games',
          h('button.header__panel-btn', {
          attrs: { disabled: headerSyncRunning || headerOlderSyncRunning, ...controlExplainerAttrs({
            label: headerSyncRunning ? 'Syncing games' : 'Sync games',
            description: syncDisabledReason ?? 'Fetch new games for this account using the selected filters.',
          }) },
          on: { click: () => { void runSync(); } },
          }, headerSyncRunning ? 'Syncing...' : 'Sync games'),
        ),
        headerSyncRunning ? h('button.header__panel-btn', {
          attrs: { type: 'button', ...controlExplainerAttrs({
            label: 'Cancel sync',
            description: 'Stop after the current batch; games fetched so far are kept.',
          }) },
          on: { click: () => { headerSyncAbort?.abort(); } },
        }, 'Cancel') : null,
      ]),
    ]),
    h('div.header__panel-divider'),
    h('div.header__panel-section', [
      h('div.header__panel-label', 'Older games'),
      hasOldestCursor
        ? h('p.header__panel-hint', oldestCursorAtStart
            ? 'Full history already imported.'
            : `Oldest imported: ${formatSyncDate(account.oldestGameTimestamp)}`)
        : h('p.header__panel-hint', 'Run Sync first to establish a history cursor.'),
      hasOldestCursor && !oldestCursorAtStart
        ? h('div.header__panel-row.--mt', [
            renderDisabledControlWhen(
              olderInputDisabledReason,
              'Older-games target date',
              h('input.header__date-input', {
              attrs: {
                type: 'date',
                value: headerOlderSyncTargetDate,
                max: todayDateInputValue(),
                disabled: headerOlderSyncRunning || headerSyncRunning,
                ...controlExplainerAttrs({
                  label: 'Older-games target date',
                  description: olderInputDisabledReason ?? 'Optionally fetch older games back to this date.',
                }),
              },
              on: {
                change: (event: Event) => {
                  headerOlderSyncTargetDate = (event.target as HTMLInputElement).value;
                  headerOlderSyncError = null;
                  redraw();
                },
              },
              }),
            ),
            renderDisabledControlWhen(
              oneBatchDisabledReason,
              'Use one older batch',
              h('button.header__pill', {
              attrs: {
                type: 'button',
                disabled: headerOlderSyncRunning || headerSyncRunning || !headerOlderSyncTargetDate,
                ...controlExplainerAttrs({
                  label: 'Use one older batch',
                  description: oneBatchDisabledReason ?? 'Clear the target date and fetch a single older batch.',
                }),
              },
              on: { click: () => { headerOlderSyncTargetDate = ''; headerOlderSyncError = null; redraw(); } },
              }, 'One batch'),
            ),
          ])
        : null,
      headerOlderSyncError ? h('div.header__panel-error', headerOlderSyncError) : null,
      headerOlderSyncMessage ? h('p.header__panel-hint', headerOlderSyncMessage) : null,
      renderDisabledControlWhen(
        loadOlderDisabledReason,
        headerOlderSyncRunning
          ? 'Loading older games'
          : headerOlderSyncTargetDate ? 'Load back to date' : 'Load older games',
        h('button.header__panel-btn', {
        attrs: {
          disabled: headerOlderSyncRunning || headerSyncRunning || !hasOldestCursor || oldestCursorAtStart,
          ...controlExplainerAttrs({
            label: headerOlderSyncRunning
              ? 'Loading older games'
              : headerOlderSyncTargetDate ? 'Load back to date' : 'Load older games',
            description: loadOlderDisabledReason
              ?? (headerOlderSyncTargetDate
                ? 'Load older games back to the selected date.'
                : 'Load games older than the earliest imported game.'),
          }),
        },
        on: { click: () => { void runOlderSync(); } },
        }, headerOlderSyncRunning
        ? 'Loading older...'
        : headerOlderSyncTargetDate
        ? 'Load back to date'
        : 'Load older games'),
      ),
    ]),


    account.platform === 'chesscom'
      ? h('div.header__panel-divider')
      : null,
    account.platform === 'chesscom'
      ? h('div.header__panel-section', [
          h('div.header__panel-label', 'Platform data'),
          h('p.header__panel-hint',
            'Chess.com sometimes finishes analyzing a game after it was imported. Refresh to pull in newly available data (like accuracies) for already-imported games.'),
          headerRescanError ? h('div.header__panel-error', headerRescanError) : null,
          headerRescanMessage ? h('p.header__panel-hint', headerRescanMessage) : null,
          renderDisabledControlWhen(
            headerRescanRunning ? 'Platform data is already being refreshed.' : null,
            headerRescanRunning ? 'Refreshing platform data' : 'Refresh platform data',
            h('button.header__panel-btn', {
            attrs: {
              disabled: headerRescanRunning,
              ...controlExplainerAttrs({
                label: headerRescanRunning ? 'Refreshing platform data' : 'Refresh platform data',
                description: headerRescanRunning
                  ? 'Platform data is already being refreshed.'
                  : 'Re-check imported games for newly available Chess.com data such as accuracies.',
              }),
            },
            on: { click: () => runHeaderAccountRescan(account, deps) },
            }, headerRescanRunning ? 'Refreshing...' : 'Refresh platform data'),
          ),
        ])
      : null,
  ]);
}

// --- Main header ---

/**
 * Global app header — unified search bar with nested import panel.
 * The search bar is the primary import control: platform toggle → username → Import.
 * Filters, PGN paste, and the game list live inside a dropdown panel below the bar.
 */
export function renderHeader(deps: HeaderDeps): VNode {
  const {
    route, importedGames, selectedGameId,
    analyzedGameIds, missedTacticGameIds,
    importCallbacks, onSelectGame, renderGameRow,
    gameSourceUrl, resetAllData, redraw,
  } = deps;

  ensureHeaderAuth(redraw);
  ensureLoginModalListener(redraw);
  ensureRemoteSyncTokenListener(redraw);
  ensureRemoteSyncAuth(redraw);
  ensureSyncProgressListener(redraw);
  if (!categorySyncInit) {
    categorySyncInit = true;
    syncImportCategory(redraw);
  }

  const loading  = importPlatform === 'chesscom' ? chesscom.loading  : lichess.loading;
  const error    = importPlatform === 'chesscom' ? chesscom.error    : lichess.error;
  const username = importPlatform === 'chesscom' ? chesscom.username : lichess.username;
  const selectedMineAccount = syncSelectedMineAccount(deps.accounts);

  // Count only games belonging to 'mine'-category accounts.
  // Games imported via PGN paste have no accountId and are excluded (not mine).
  const mineAccountIds = new Set(mineAccounts(deps.accounts).map(a => a.id));
  const mineGamesCount = importedGames.filter(
    g => g.accountId !== undefined && mineAccountIds.has(g.accountId),
  ).length;
  const accountModeActive = selectedMineAccount !== null && headerAccountMode === 'account';

  const doImport = () => importPlatform === 'chesscom'
    ? void importChesscom(importCallbacks)
    : void importLichess(importCallbacks);

  const openSyncDashboard = (): void => {
    headerSyncMessage = null;
    headerSyncError = null;
    headerOlderSyncMessage = null;
    headerOlderSyncError = null;
    showImportPanel = true;
    redraw();
  };




  const startSyncNow = (): void => {
    if (selectedMineAccount === null) return;
    prefillAccountSyncFilters(selectedMineAccount);
    openSyncDashboard();
    void runHeaderAccountSync(selectedMineAccount, deps);
  };

  const hasActiveFilters =
    importFilters.speeds.size > 0 ||
    importFilters.dateRange !== '1month' ||
    !importFilters.rated;

  const panel = showImportPanel && accountModeActive && selectedMineAccount !== null
    ? renderSyncMenu(selectedMineAccount, deps)
    : showImportPanel ? h('div.header__panel', [

    h('div.header__panel-section', [
      h('div.header__panel-label', 'Platform'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: importPlatform === 'chesscom' },
          attrs: controlExplainerAttrs({
            label: 'Chess.com platform',
            description: 'Import games from a Chess.com account.',
          }),
          on: { click: () => { importPlatform = 'chesscom'; syncImportCategory(redraw); redraw(); } },
        }, 'Chess.com'),
        h('button.header__pill', {
          class: { active: importPlatform === 'lichess' },
          attrs: controlExplainerAttrs({
            label: 'Lichess platform',
            description: 'Import games from a Lichess account.',
          }),
          on: { click: () => { importPlatform = 'lichess'; syncImportCategory(redraw); redraw(); } },
        }, 'Lichess'),
      ]),
      h('p.header__panel-disclaimer', PLATFORM_DISCLAIMER),
    ]),

    h('div.header__panel-divider'),

    h('div.header__panel-section', [
      h('div.header__panel-label', 'Account category'),
      h('div.header__panel-row', CATEGORY_OPTIONS.map(({ value, label }) =>
        h('button.header__pill', {
          class: { active: importFilters.importCategory === value },
          attrs: controlExplainerAttrs({
            label: `${label} account category`,
            description: value === 'mine'
              ? 'Classify this as one of your own accounts.'
              : value === 'opponent'
              ? 'Classify this as an opponent you prepare against.'
              : 'Classify this as a strong player you study.',
          }),
          on: { click: () => { importFilters.importCategory = value; categoryManualKey = currentImportAccountKey(); redraw(); } },
        }, label),
      )),
      importFilters.importCategory === null
        ? h('p.header__panel-hint',
            'Required before importing. Mine = my own accounts · Opponent = players I prep against · Study = strong players I learn from.')
        : null,
    ]),

    h('div.header__panel-divider'),

    h('div.header__panel-section', [
      h('div.header__panel-label', 'Time control'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: importFilters.speeds.size === 0 },
          attrs: controlExplainerAttrs({
            label: 'All time controls',
            description: 'Include every time control in this import.',
          }),
          on: { click: () => { importFilters.speeds = new Set(); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.header__pill', {
            class: { active: importFilters.speeds.has(value) },
            attrs: { 'data-icon': icon, ...controlExplainerAttrs({
              label: `${label} time control`,
              description: 'Include or exclude this time control from the import.',
            }) },
            on: { click: () => {
              const s = new Set(importFilters.speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              importFilters.speeds = s;
              redraw();
            }},
          }, label),
        ),
      ]),

      h('div.header__panel-label.--mt', 'Period'),
      h('div.header__panel-row', [
        ...DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.header__pill', {
            class: { active: importFilters.dateRange === value },
            attrs: controlExplainerAttrs({
              label: `${label} import period`,
              description: 'Choose how far back the import should search.',
            }),
            on: { click: () => { importFilters.dateRange = value as ImportDateRange; redraw(); } },
          }, label)
        ),
      ]),

      importFilters.dateRange === 'custom' ? h('div.header__panel-row.--mt', [
        h('span.header__panel-hint', 'From'),
        h('input.header__date-input', {
          attrs: { type: 'date', value: importFilters.customFrom, ...controlExplainerAttrs({
            label: 'Import start date',
            description: 'Include games played on or after this date.',
          }) },
          on: { change: (e: Event) => { importFilters.customFrom = (e.target as HTMLInputElement).value; redraw(); } },
        }),
        h('span.header__panel-hint', 'To'),
        h('input.header__date-input', {
          attrs: { type: 'date', value: importFilters.customTo, ...controlExplainerAttrs({
            label: 'Import end date',
            description: 'Include games played on or before this date.',
          }) },
          on: { change: (e: Event) => { importFilters.customTo = (e.target as HTMLInputElement).value; redraw(); } },
        }),
      ]) : null,

      h('div.header__panel-row.--mt', [
        h('label.header__panel-check', [
          h('input', {
            attrs: { type: 'checkbox', checked: importFilters.rated, ...controlExplainerAttrs({
              label: 'Rated games only',
              description: 'Exclude casual games from this import.',
            }) },
            on: { change: (e: Event) => { importFilters.rated = (e.target as HTMLInputElement).checked; redraw(); } },
          }),
          'Rated only',
        ]),
      ]),

    ]),

    h('div.header__panel-divider'),




    h('div.header__panel-section', [
      error ? h('div.header__panel-error', error) : null,
      renderDisabledControlWhen(
        loading
          ? 'Games are currently being imported.'
          : !username.trim()
            ? 'Enter an account username before importing.'
            : importFilters.importCategory === null
              ? 'Choose an account category before importing.'
              : null,
        loading ? 'Importing games' : 'Import games',
        h('button.header__panel-btn', {
        attrs: {
          disabled: loading || !username.trim() || importFilters.importCategory === null,
          ...controlExplainerAttrs({
            label: loading ? 'Importing games' : 'Import games',
            description: loading
              ? 'Games are currently being imported.'
              : !username.trim()
                ? 'Enter an account username before importing.'
                : importFilters.importCategory === null
                  ? 'Choose an account category before importing.'
                  : 'Import matching games using the selected platform, category, and filters.',
          }),
        },
        on: { click: doImport },
        }, loading
        ? `Importing…${(importPlatform === 'chesscom' ? chesscom.gameCount : lichess.gameCount) > 0
            ? ` (${importPlatform === 'chesscom' ? chesscom.gameCount : lichess.gameCount})`
            : ''}`
        : 'Import games'),
      ),
    ]),

    h('div.header__panel-divider'),

    h('div.header__panel-section', [
      h('div.header__panel-label', 'Paste PGN'),
      h('textarea.header__pgn-input', {
        key: pgnState.key,
        attrs: { placeholder: 'Paste a PGN here…', rows: 3, spellcheck: false, ...controlExplainerAttrs({
          label: 'PGN text',
          description: 'Paste one or more chess games in PGN format.',
        }) },
        on: { input: (e: Event) => { pgnState.input = (e.target as HTMLTextAreaElement).value; } },
      }),
      h('div.header__panel-row', [
        h('button.header__panel-btn', {
          attrs: controlExplainerAttrs({
            label: 'Import PGN',
            description: 'Import the pasted PGN into Patzer.',
          }),
          on: { click: () => {
            importPgn(importCallbacks);
            if (!pgnState.error) { showImportPanel = false; }
            redraw();
          }},
        }, 'Import PGN'),
        pgnState.error ? h('span.header__panel-error', pgnState.error) : null,
      ]),
    ]),

    importedGames.length > 0 ? h('div.header__panel-section', [
      h('div.header__panel-label', `${importedGames.length} game${importedGames.length === 1 ? '' : 's'} imported`),
      h('div.header__games-list', importedGames.map(game => {
        const isAnalyzed      = analyzedGameIds.has(game.id);
        const hasMissedTactic = missedTacticGameIds.has(game.id);
        const srcUrl = gameSourceUrl(game);
        return h('div.header__game-item', [
          h('button.header__game-row', {
            class: { active: game.id === selectedGameId },
            attrs: controlExplainerAttrs({
              label: 'Open imported game',
              description: 'Select this game and open it in the current game workflow.',
            }),
            on: { click: () => {
              onSelectGame(game.id, game.pgn);
              showImportPanel = false;
              redraw();
            }},
          }, renderGameRow(game, isAnalyzed, hasMissedTactic)),
          srcUrl ? h('a.game-ext-link', {
            attrs: { href: srcUrl, target: '_blank', rel: 'noopener', ...iconControlExplainerAttrs({
              label: 'View on source platform',
              description: 'Open this game on its original chess platform in a new tab.',
            }) },
            on: { click: (e: Event) => e.stopPropagation() },
          }) : null,
        ]);
      })),
    ]) : null,

  ]) : null;

  const backdrop = showImportPanel ? h('div.header__backdrop', {
    attrs: { role: 'button', tabindex: '0', ...iconControlExplainerAttrs({ label: 'Close import panel' }) },
    on: {
      click: () => { showImportPanel = false; redraw(); },
      keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showImportPanel = false; redraw(); }),
    },
  }) : null;

  return h('header.header', [
    h('a.header__brand', { attrs: { href: '#/', ...iconControlExplainerAttrs({ label: 'Patzer Pro home' }) } }, [
      h('img.header__brand-logo', {
        attrs: {
          src: HEADER_LOGO_SRC,
          alt: 'Patzer Pro',
          width: '30',
          height: '30',
        },
      }),
    ]),
    renderMobileNav(route, redraw, deps.mobileSubmenus ?? [], deps.navHrefOverrides ?? {}),

    h('div.header__search', { key: 'header-search' }, [
      h('div.header__bar', [
        renderHeaderAccountControl(deps.accounts, selectedMineAccount, loading || headerSyncRunning, doImport, redraw),

        renderDisabledControlWhen(
          accountModeActive && headerSyncRunning
            ? 'The selected account is currently syncing.'
            : !accountModeActive && loading
              ? 'Games are currently being imported.'
              : null,
          accountModeActive
            ? (headerSyncRunning ? 'Syncing games' : 'Sync games')
            : (loading ? 'Importing games' : 'Import games'),
          h('button.header__import', {
          attrs: {
            disabled: accountModeActive ? headerSyncRunning : loading,
            ...controlExplainerAttrs({
              label: accountModeActive
                ? (headerSyncRunning ? 'Syncing games' : 'Sync games')
                : (loading ? 'Importing games' : 'Import games'),
              description: accountModeActive
                ? (headerSyncRunning
                  ? 'The selected account is currently syncing.'
                  : 'Sync new games for the selected account.')
                : (loading
                  ? 'Games are currently being imported.'
                  : 'Choose a platform, account category, and filters before importing.'),
            }),
          },


          on: { click: accountModeActive ? startSyncNow : () => { showImportPanel = true; redraw(); } },
          }, accountModeActive
          ? (headerSyncRunning ? 'Syncing...' : 'Sync')
          : loading
          ? `Importing…${(importPlatform === 'chesscom' ? chesscom.gameCount : lichess.gameCount) > 0
              ? ` (${importPlatform === 'chesscom' ? chesscom.gameCount : lichess.gameCount})`
              : ''}`
          : 'Import'),
        ),

        mineGamesCount > 0 && !error
          ? h('span.header__count', {
              attrs: { role: 'button', tabindex: '0', ...controlExplainerAttrs({
                label: `${mineGamesCount} imported games`,
                description: `${showImportPanel ? 'Close' : 'Open'} the imported-games panel.`,
              }) },
              on: {
                click: () => { showImportPanel = !showImportPanel; redraw(); },
                keydown: (event: KeyboardEvent) => activateOnKeyboard(event, () => { showImportPanel = !showImportPanel; redraw(); }),
              },
            },
              `${mineGamesCount} games`)
          : null,
        error
          ? h('span.header__error', { attrs: { title: error } }, '⚠')
          : null,

        h('button.header__toggle', {
          class: { active: showImportPanel, 'header__toggle--filtered': hasActiveFilters && !showImportPanel },
          attrs: iconControlExplainerAttrs({
            label: showImportPanel ? 'Close filters and games' : 'Open filters and games',
            description: `${showImportPanel ? 'Close' : 'Open'} import filters and the imported-games list.`,
          }),
          on: { click: () => { showImportPanel = !showImportPanel; redraw(); } },
        }, showImportPanel ? '▴' : '▾'),
      ]),

      panel,
      backdrop,
    ]),

    renderNav(route, deps.navHrefOverrides ?? {}),
    renderReviewMenu(redraw),
    renderSyncProgressMenu(redraw),
    renderUserArea(redraw),
    renderGlobalMenu(deps),
    showLoginModal     ? renderLoginModal(redraw)     : null,
    showDetectionModal ? renderDetectionModal(redraw) : null,
    showRetroModal     ? renderRetroModal(redraw)     : null,
  ]);
}
