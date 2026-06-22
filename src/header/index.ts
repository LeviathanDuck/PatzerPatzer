


import { h, type VNode } from 'snabbdom';
import { renderToggleRow } from '../ui';
import { chesscom, importChesscom } from '../import/chesscom';
import { lichess, importLichess } from '../import/lichess';
import { pgnState, importPgn } from '../import/pgn';
import {
  importFilters, SPEED_OPTIONS, DATE_RANGE_OPTIONS,
  currentImportDateRangeConfig,
  importSyncFilterKey,
  type ImportDateRange,
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
  queueNextReviewRunBatch, dismissReviewRunNotice,
  isReviewEngineFailed, isReviewEngineInitializing,
  getCurrentFailedReviewStatus, skipCurrentFailedReviewGame,
  isLeaderTab, isReviewOwnerUnavailableForTakeover, takeOverUnavailableReviewOwner,
} from '../engine/reviewQueue';
import { reviewDepth, setReviewDepth, reviewMovetime, setReviewMovetime } from '../engine/batch';
import { missedMomentConfig, setMissedMomentConfig } from '../engine/tactics';
import { retroConfig, setRetroConfig, RETRO_CONFIG_DEFAULTS, type RetroConfig } from '../analyse/retroConfig';
import {
  RETRO_CHOICE_SEVERITY_PRESETS,
  type RetroChoiceCountSummary,
} from '../analyse/retroChoice';
import type { FeedbackTone } from '../feedback/severity';
import { checkAuth, LOGIN_MODAL_EVENT, login, logout } from '../sync/client';
import { startAccountSettingsSync, stopAccountSettingsSync } from '../sync/settings';
import {
  REMOTE_SYNC_ACTIVITY_EVENT,
  clearRemoteSyncToken,
  getRemoteSyncToken,
  hasRemoteSyncToken,
  isRemoteSyncActive,
  logoutRemoteSync as stopAndClearRemoteSync,
  setRemoteSyncToken,
  startRemoteSyncAutoSync,
  testRemoteSyncConnection,
} from '../sync/remoteSync';
import { syncRatedLadder } from '../puzzles/puzzleDb';
import type { Route } from '../router';
import type { ImportedGame, ImportCallbacks } from '../import/types';
import { accountId, getAccount, listAccounts, type AccountCategory, type ChessAccount } from '../accounts';
import { syncAccountGames, type AccountSyncResult } from '../import/accountSync';

const HEADER_LOGO_SRC = '/images/patzer-pro-review-lens-logo-package/png/app-icons/patzerpro-app-icon-152.png';
const PLATFORM_DISCLAIMER = 'Patzer Pro is not affiliated with or endorsed by Chess.com or Lichess.';

// --- Module-level header state ---
type ImportPlatform = 'chesscom' | 'lichess';
let importPlatform: ImportPlatform = 'chesscom';
let showImportPanel  = false;
let showGlobalMenu   = false;
let showBoardSettings     = false;
let showDetectionModal    = false;
let showRetroModal        = false;
let showLoginModal        = false;
let showReviewMenu        = false;
let showMobileNav    = false;
let headerAccountMode: 'account' | 'new' = 'account';
let selectedMineAccountId: string | null = null;
let headerSyncRunning = false;
let headerSyncMessage: string | null = null;
let headerSyncError: string | null = null;

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
const REMOTE_SYNC_LOADING_SRC = '/images/loading-icons/loading.gif';
const REVIEW_PROGRESS_LOADING_SRC = '/images/loading-icons/loading.gif';
const REVIEW_PROGRESS_STILL_SRC = '/images/loading-icons/loading-still.png';

let headerAuthUser: string | null = null;
let headerAuthIsAdmin = false;
let headerAuthProvider: 'patzer' | 'lichess' | 'client-lichess' | null = null;
let headerAuthChecked = false;
let loginModalListenerAttached = false;
let loginModalError = '';
let remoteSyncActive = false;
let remoteSyncChecked = false;
let remoteSyncChecking = false;
let remoteSyncBusy = isRemoteSyncActive();
let remoteSyncTokenListenerAttached = false;
let remoteSyncActivityListenerAttached = false;
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

function ensureRemoteSyncActivityListener(redraw: () => void): void {
  if (remoteSyncActivityListenerAttached) return;
  remoteSyncActivityListenerAttached = true;
  window.addEventListener(REMOTE_SYNC_ACTIVITY_EVENT, () => {
    remoteSyncBusy = isRemoteSyncActive();
    redraw();
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

function logoutRemoteSync(redraw: () => void): void {
  clearRememberedRemoteSyncToken();
  remoteSyncActive = false;
  remoteSyncChecked = true;
  remoteSyncChecking = false;
  remoteSyncLoginInput = '';
  remoteSyncLoginError = '';
  redraw();
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

function renderRemoteSyncIndicator(): VNode | null {
  if (!remoteSyncBusy) return null;
  return h('img.header__sync-loading', {
    attrs: {
      src: REMOTE_SYNC_LOADING_SRC,
      alt: '',
      'aria-hidden': 'true',
      title: 'Sync in progress',
    },
  });
}

function renderUserArea(redraw: () => void): VNode | null {
  if (remoteSyncActive || (remoteSyncChecking && hasRemoteSyncToken())) {
    return h('div.header__user', {
      attrs: { title: remoteSyncChecking ? 'Checking sync token' : 'Sync active' },
    }, [
      h('button.header__logout.header__logout--text', {
        attrs: { type: 'button', title: 'Logout' },
        on: { click: () => logoutRemoteSync(redraw) },
      }, 'Logout'),
      renderRemoteSyncIndicator(),
    ]);
  }
  return h('div.header__user.header__user--login', [
    h('button.header__login', {
      attrs: { type: 'button', title: 'Login' },
      on: { click: () => {
        remoteSyncLoginInput = '';
        remoteSyncLoginError = '';
        loginModalError = '';
        showLoginModal = true;
        redraw();
      } },
    }, 'Login'),
    renderRemoteSyncIndicator(),
  ]);
}

function renderLoginModal(redraw: () => void): VNode {
  const close = () => {
    showLoginModal = false;
    loginModalError = '';
    redraw();
  };

  return h('div.auth-modal', [
    h('div.auth-modal__backdrop', { on: { click: close } }),
    h('div.auth-modal__card', [
      h('div.auth-modal__header', [
        h('h2', 'RemoteSync Sync Login'),
        h('button.auth-modal__close', {
          attrs: { type: 'button', title: 'Close' },
          on: { click: close },
        }, 'x'),
      ]),
      h('div.auth-modal__body', [
        h('p', 'Enter the sync token to activate database sync for this browser.'),
        h('div.auth-modal__form', [
          h('label.auth-modal__label', { attrs: { for: 'remote-sync-token' } }, 'Sync token'),
          h('input.auth-modal__input', {
            attrs: {
              id: 'remote-sync-token',
              type: 'password',
              autocomplete: 'off',
              disabled: remoteSyncLoginBusy,
              placeholder: 'Admin sync token',
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
        ]),
        remoteSyncLoginError ? h('p.auth-modal__error', remoteSyncLoginError) : null,
        h('div.auth-modal__secondary-block', [
          h('h3', 'Chess identity'),
          headerAuthUser
            ? h('p', `Lichess connected as ${headerAuthUser}.`)
            : h('p', 'Lichess login is only used as a chess identity option.'),
          headerAuthUser
            ? h('button.auth-modal__secondary', {
                attrs: { type: 'button', disabled: remoteSyncLoginBusy },
                on: { click: () => {
	                  logout().then(() => {
	                    stopAccountSettingsSync();
	                    headerAuthUser = null;
	                    headerAuthIsAdmin = false;
	                    headerAuthProvider = null;
                    redraw();
                  });
                } },
              }, 'Disconnect Lichess')
            : h('button.auth-modal__secondary', {
                attrs: { type: 'button', disabled: remoteSyncLoginBusy },
                on: { click: () => {
                  login().catch(error => {
                    loginModalError = error instanceof Error ? error.message : 'Could not start Lichess login.';
                    redraw();
                  });
                } },
              }, 'Continue with Lichess'),
        ]),
        loginModalError ? h('p.auth-modal__error', loginModalError) : null,
      ]),
      h('div.auth-modal__actions', [
        h('button.auth-modal__secondary', {
          attrs: { type: 'button' },
          on: { click: close },
        }, 'Cancel'),
        h('button.auth-modal__primary', {
          attrs: { type: 'button', disabled: remoteSyncLoginBusy || !remoteSyncLoginInput.trim() },
          on: { click: () => submitRemoteSyncLogin(redraw) },
        }, remoteSyncLoginBusy ? 'Checking...' : 'Login'),
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
  { label: 'Opponents', href: '#/opponents', section: 'opponents' },
  { label: 'Stats',    href: '#/stats',    section: 'stats'    },
  { label: 'Study',   href: '#/study',    section: 'study'    },
];

function renderNav(route: Route): VNode {
  const active = activeSection(route);
  return h('nav.header__nav', navLinks.map(({ label, href, section }) =>
    h('a', { attrs: { href }, class: { active: active === section } }, label)
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

function renderReviewProgressIcon(state: 'active' | 'still'): VNode {
  return h('img.review-progress-icon', {
    class: { 'review-progress-icon--still': state === 'still' },
    attrs: {
      src: state === 'active' ? REVIEW_PROGRESS_LOADING_SRC : REVIEW_PROGRESS_STILL_SRC,
      alt: '',
      'aria-hidden': 'true',
    },
  });
}

function renderReviewProgressLabel(label: string, state: 'active' | 'still'): VNode {
  return h('span.review-progress-label', [
    renderReviewProgressIcon(state),
    h('span.review-progress-label__text', label),
  ]);
}

function renderReviewMenu(redraw: () => void): VNode | null {
  const engineFailed       = isReviewEngineFailed();
  const engineInitializing = isReviewEngineInitializing();
  const running = isBulkRunning();
  const paused  = isBulkPaused();
  const summary = getQueueSummary();
  const lifecycleState = summary.lifecycleState;
  const completionNotice = lifecycleState === 'batch-complete' || lifecycleState === 'no-more-eligible-games';
  const staleNotice = summary.stale || lifecycleState === 'stale';
  const storageFailureNotice = summary.storageHealth !== 'ok';
  const active  = running || paused || completionNotice || storageFailureNotice;

  // Surface engine init failure as an explicit error state even when no game
  // is actively running (so the queue never shows a perpetual spinner).
  if (engineFailed) {
    return h('div.review-menu', [
      h('button.review-menu__trigger.review-menu__trigger--error', {
        class: { active: showReviewMenu },
        attrs: { title: 'Engine unavailable — review queue halted' },
        on: { click: () => { showReviewMenu = !showReviewMenu; redraw(); } },
      }, [renderReviewProgressLabel('Engine error', 'still')]),
      showReviewMenu ? h('div.review-menu__backdrop', {
        on: { click: () => { showReviewMenu = false; redraw(); } },
      }) : null,
      showReviewMenu ? h('div.review-menu__dropdown', [
        h('div.review-menu__section', [
          h('div.review-menu__label.review-menu__label--error',
            'Review engine failed to initialise. SharedArrayBuffer or WASM may be unavailable in this browser context (requires COOP/COEP headers). Reload to retry.'),
          h('div.review-menu__row', [
            h('button.review-menu__btn.--cancel', {
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
    return h('div.review-menu', [
      h('button.review-menu__trigger', {
        class: { active: false },
        attrs: { title: 'Review engine loading…', disabled: true },
      }, [renderReviewProgressLabel('Engine loading…', 'active')]),
    ]);
  }

  if (!active) return null;
  const lastProgress = summary ? formatReviewDuration(summary.lastProgressSeconds) : null;
  const failedStatus = getCurrentFailedReviewStatus();
  const interruptedAfterReload = summary?.pauseReason === 'reload';
  const isQueueOwner = isLeaderTab();
  const ownerUnavailable = isReviewOwnerUnavailableForTakeover();
  const storageFailure = summary.storageHealth !== 'ok';
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
  const reviewTriggerLabel = failedStatus
    ? positionProgress
      ? `Failed (${failedStatus.attempts}) · ${positionProgress}`
      : `Failed (${failedStatus.attempts})`
    : storageFailure
      ? 'Storage error'
    : interruptedAfterReload
      ? `Resume review ${activeProgressLabel}`
    : staleNotice
      ? `Review stalled · ${activeProgressLabel}`
    : paused
      ? `Review paused · ${activeProgressLabel}`
    : lifecycleState === 'batch-complete'
      ? `Batch complete ${summary.done}/${summary.total}`
    : lifecycleState === 'no-more-eligible-games'
      ? 'Review complete'
    : summary
        ? `Reviewing ${activeProgressLabel}`
        : 'Reviewing…';
  const reviewTriggerTitle = failedStatus
    ? 'Current review failed and is retrying'
    : storageFailure
      ? 'Review storage write failed - resume may be unavailable'
    : interruptedAfterReload
      ? 'Review interrupted after reload - resume manually'
    : staleNotice
      ? 'No recent review progress detected'
    : lifecycleState === 'batch-complete'
      ? 'Review batch complete'
    : lifecycleState === 'no-more-eligible-games'
      ? 'No matching games left to review'
    : 'Bulk Review settings';
  const progressIconState: 'active' | 'still' =
    running && !paused && !staleNotice && !failedStatus && !storageFailure ? 'active' : 'still';

  return h('div.review-menu', [
    h('button.review-menu__trigger', {
      class: { active: showReviewMenu || active, 'review-menu__trigger--warning': staleNotice },
      attrs: { title: reviewTriggerTitle },
      on: { click: () => { showReviewMenu = !showReviewMenu; redraw(); } },
    }, [renderReviewProgressLabel(reviewTriggerLabel, progressIconState)]),

    showReviewMenu ? h('div.review-menu__backdrop', {
      on: { click: () => { showReviewMenu = false; redraw(); } },
    }) : null,

    showReviewMenu ? h('div.review-menu__dropdown', [

      // Queue status + controls
      h('div.review-menu__section', [
        h('div.review-menu__label', summary
          ? `${summary.done} of ${summary.total} game${summary.total === 1 ? '' : 's'} analyzed`
          : 'Reviewing…'),
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
        staleNotice
          ? h('div.review-menu__label.review-menu__label--warning',
              `No review progress for ${lastProgress ?? 'a while'}. You can pause, cancel, or take over if the owner is unavailable.`)
          : null,
        lifecycleState === 'batch-complete'
          ? h('div.review-menu__label', 'Batch complete. Queue the next matching games when you are ready.')
          : null,
        lifecycleState === 'no-more-eligible-games'
          ? h('div.review-menu__label', 'No more matching games are available for this review run.')
          : null,
        failedStatus
          ? h('div.review-menu__label.review-menu__label--error',
              failedStatus.retrying
                ? `Failed (${failedStatus.attempts}) - retrying`
                : `Failed (${failedStatus.attempts})`)
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
                progressIconState,
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
          lifecycleState === 'batch-complete'
            ? h('button.review-menu__btn', {
                attrs: { type: 'button', title: 'Queue the next matching batch from this run' },
                on: { click: () => { void queueNextReviewRunBatch().finally(redraw); } },
              }, 'Queue next batch')
            : null,
          completionNotice
            ? h('button.review-menu__btn', {
                attrs: { type: 'button', title: 'Dismiss this review notice' },
                on: { click: () => { dismissReviewRunNotice(); showReviewMenu = false; redraw(); } },
              }, 'Dismiss')
            : null,
          failedStatus
            ? h('button.review-menu__btn.--cancel', {
                attrs: { type: 'button', title: 'Skip this failed game and continue the review queue' },
                on: { click: () => { skipCurrentFailedReviewGame(); showReviewMenu = false; redraw(); } },
              }, 'Skip failed game')
            : null,
          ownerUnavailable
            ? h('button.review-menu__btn', {
                attrs: { type: 'button', title: 'Review owner is unavailable. Take over and resume in this tab.' },
                on: { click: () => { takeOverUnavailableReviewOwner(); redraw(); } },
              }, 'Take over')
            : canControlQueue && paused
            ? h('button.review-menu__btn', {
                on: { click: () => { resumeBulkReview(); redraw(); } },
              }, 'Resume')
            : canControlQueue
            ? h('button.review-menu__btn', {
                on: { click: () => { pauseBulkReview(); redraw(); } },
              }, 'Pause')
            : null,
          canControlQueue
            ? h('button.review-menu__btn.--cancel', {
                on: { click: () => { cancelBulkReview(); redraw(); } },
              }, 'Cancel')
            : null,
        ]),
      ]),

      h('div.review-menu__section', [
        h('div.review-menu__label', `Depth: ${reviewDepth}`),
        h('div.review-menu__row', REVIEW_DEPTHS.map(d =>
          h('button.review-menu__pill', {
            class: { active: reviewDepth === d },
            on: { click: () => { setReviewDepth(d); redraw(); } },
          }, String(d)),
        )),
      ]),

      h('div.review-menu__section', [
        h('div.review-menu__label', {
          attrs: { title: 'Caps search time per position alongside depth, trading some accuracy for faster bulk review. Off (default) searches to depth only.' },
        }, `Time budget: ${reviewMovetime === null ? 'Off (depth only)' : `${reviewMovetime}ms`}`),
        h('div.review-menu__row', REVIEW_MOVETIME_OPTIONS.map(({ value, label }) =>
          h('button.review-menu__pill', {
            class: { active: reviewMovetime === value },
            on: { click: () => { setReviewMovetime(value); redraw(); } },
          }, label),
        )),
      ]),

    ]) : null,
  ]);
}

// --- Global settings menu ---

function closeGlobalMenu(redraw: () => void): void {
  showGlobalMenu    = false;
  showBoardSettings = false;
  redraw();
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
          attrs: { type: 'range', min: s.min, max: s.max, step: s.step, value },
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
                title: `Lichess default: ${s.format(s.lichessDefault!)}`,
              },
            })
          : null,
      ]),
    ]);
  });

  return h('div.detection-modal', [
    h('div.detection-modal__backdrop', {
      on: { click: () => { showDetectionModal = false; redraw(); } },
    }),
    h('div.detection-modal__card', [
      h('div.detection-modal__header', [
        h('h2', 'Detection Settings'),
        h('button.detection-modal__close', {
          attrs: { title: 'Close' },
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


export function renderRetroConfigBody(redraw: () => void, options: RetroConfigBodyOptions = {}): VNode[] {
  const cfg = retroConfig;
  const selectedTone = FEEDBACK_TONE_OPTIONS.find(o => o.value === cfg.feedbackTone) ?? FEEDBACK_TONE_OPTIONS[0]!;
  const countSummary = options.countSummary ?? null;
  const idPrefix = options.idPrefix ?? 'retro-config';
  const feedbackToneLabelId = `${idPrefix}-feedback-tone-label`;
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
            title: option.description,
            'aria-checked': cfg.feedbackTone === option.value ? 'true' : 'false',
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
        h('span.detection-modal__label', 'Severity Presets'),
        countSummary
          ? h('span.detection-modal__value', `${countSummary.total} selected`)
          : null,
      ].filter(Boolean) as VNode[]),
      h('p.detection-modal__desc',
        'Use the same severity labels as the Learn From Your Mistakes choice page. Counts update for the current game as settings change.'),
      h('div.detection-modal__preset-grid', RETRO_CHOICE_SEVERITY_PRESETS.map(preset => {
        const active = cfg.minLossThreshold === preset.generationLossThreshold;
        const count = countSummary?.presets.find(p => p.id === preset.id)?.count;
        return h('button.detection-modal__preset-option', {
          class: { 'is-active': active },
          attrs: {
            type: 'button',
            title: `${preset.label}: ${preset.helper}`,
          },
          on: { click: () => {
            setRetroConfig({ minLossThreshold: preset.generationLossThreshold });
            redraw();
          }},
        }, [
          h('span.detection-modal__preset-label', preset.label),
          h('span.detection-modal__preset-helper', preset.helper),
          count !== undefined
            ? h('span.detection-modal__preset-count', `${count}`)
            : null,
        ].filter(Boolean) as VNode[]);
      })),
    ]),

    // minLossThreshold — continuous 1–25% slider
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Minimum Severity'),
        h('span.detection-modal__value', `loss ≥ ${Math.round(cfg.minLossThreshold * 100)}%`),
      ]),
      h('p.detection-modal__desc',
        'Minimum win-chance loss to include a move as a candidate. ' +
        'Drag left for more candidates, right for fewer. Lichess parity: 5%. Patzer default: 10%.'),
      h('div.detection-modal__severity-slider', [
        h('input.severity-range', {
          attrs: { type: 'range', min: 1, max: 25, step: 1,
                   value: Math.round(cfg.minLossThreshold * 100) },
          on: {
            input: (e: Event) => {
              const pct = parseInt((e.target as HTMLInputElement).value, 10);
              setRetroConfig({ minLossThreshold: pct / 100 });
              redraw();
            },
          },
        }),
        h('span.severity-divider--inaccuracy', { attrs: { title: 'Inaccuracy: loss ≥ 5%' } }),
        h('span.severity-divider--mistake',    { attrs: { title: 'Lichess default / Mistake: loss ≥ 10%' } }),
        h('span.severity-divider--blunder',    { attrs: { title: 'Blunder: loss ≥ 15%' } }),
        h('span.detection-modal__default-mark', {
          attrs: { style: 'left: 37.5%', title: 'Lichess default: loss ≥ 10%' },
        }),
        h('div.detection-modal__severity-ticks', [
          h('span', '1%'),
          h('span', 'Inaccuracy'),
          h('span', 'Mistake'),
          h('span', 'Blunder'),
          h('span', '25%'),
        ]),
      ]),
    ]),

    // missedMateDistance — slider
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Missed Mate in N'),
        h('span.detection-modal__value',
          cfg.missedMateDistance === 0 ? 'off' : `in ${cfg.missedMateDistance}`),
      ]),
      h('p.detection-modal__desc',
        'Flag a move when a forced mate of this distance (or shorter) was available but not played. ' +
        'Lichess default: mate in 3. Set to 0 to disable this category entirely.'),
      h('div.detection-modal__slider-wrap', [
        h('input', {
          attrs: { type: 'range', min: 0, max: 10, step: 1, value: cfg.missedMateDistance },
          on: {
            input: (e: Event) => {
              setRetroConfig({ missedMateDistance: parseInt((e.target as HTMLInputElement).value, 10) });
              redraw();
            },
          },
        }),
        // Lichess default marker at position 3 (30% of 0–10 range)
        h('span.detection-modal__default-mark', {
          attrs: { style: 'left: 30%', title: 'Lichess default: in 3' },
        }),
      ]),
    ]),

    // ── Collapse (blown win) family ──────────────────────────────────
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Blown Wins'),
      ]),
      h('p.detection-modal__desc',
        'Flag positions where you were clearly winning but squandered the advantage. ' +
        'Reuses the same thresholds as the engine\'s collapse detection.'),
      renderToggleRow('detection-collapse', 'Enabled', cfg.collapseEnabled, (v) => { setRetroConfig({ collapseEnabled: v }); redraw(); }),
      ...(cfg.collapseEnabled ? [
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Win Chance Floor'),
          h('span.detection-modal__value', cfg.collapseWcFloor.toFixed(2)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.50, max: 0.95, step: 0.05, value: cfg.collapseWcFloor },
            on: { input: (e: Event) => { setRetroConfig({ collapseWcFloor: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Minimum Drop'),
          h('span.detection-modal__value', cfg.collapseDropMin.toFixed(2)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.02, max: 0.30, step: 0.01, value: cfg.collapseDropMin },
            on: { input: (e: Event) => { setRetroConfig({ collapseDropMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
      ] : []),
    ]),

    // ── Defensive resource family ────────────────────────────────────
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Missed Defenses'),
      ]),
      h('p.detection-modal__desc',
        'Flag positions where you were losing but had a significantly better defensive move available.'),
      renderToggleRow('detection-defensive', 'Enabled', cfg.defensiveEnabled, (v) => { setRetroConfig({ defensiveEnabled: v }); redraw(); }),
      ...(cfg.defensiveEnabled ? [
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Position Ceiling'),
          h('span.detection-modal__value', cfg.defensiveWcCeiling.toFixed(2)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.10, max: 0.50, step: 0.05, value: cfg.defensiveWcCeiling },
            on: { input: (e: Event) => { setRetroConfig({ defensiveWcCeiling: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Salvage Gap'),
          h('span.detection-modal__value', cfg.defensiveSalvageMin.toFixed(2)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.05, max: 0.30, step: 0.01, value: cfg.defensiveSalvageMin },
            on: { input: (e: Event) => { setRetroConfig({ defensiveSalvageMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
      ] : []),
    ]),

    // ── Punish-the-blunder family ────────────────────────────────────
    h('div.detection-modal__row', [
      h('div.detection-modal__row-header', [
        h('span.detection-modal__label', 'Missed Punishments'),
      ]),
      h('p.detection-modal__desc',
        'Flag positions where the opponent blundered but you failed to exploit the mistake.'),
      renderToggleRow('detection-punish', 'Enabled', cfg.punishEnabled, (v) => { setRetroConfig({ punishEnabled: v }); redraw(); }),
      ...(cfg.punishEnabled ? [
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Opponent Swing'),
          h('span.detection-modal__value', cfg.punishOpponentSwingMin.toFixed(2)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.05, max: 0.30, step: 0.01, value: cfg.punishOpponentSwingMin },
            on: { input: (e: Event) => { setRetroConfig({ punishOpponentSwingMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
        h('div.detection-modal__row-header', [
          h('span.detection-modal__label', 'Exploit Drop'),
          h('span.detection-modal__value', cfg.punishExploitDropMin.toFixed(2)),
        ]),
        h('div.detection-modal__slider-wrap', [
          h('input', {
            attrs: { type: 'range', min: 0.02, max: 0.20, step: 0.01, value: cfg.punishExploitDropMin },
            on: { input: (e: Event) => { setRetroConfig({ punishExploitDropMin: parseFloat((e.target as HTMLInputElement).value) }); redraw(); } },
          }),
        ]),
      ] : []),
    ]),

    // Reset row
    !isDefault ? h('div.detection-modal__row', [
      h('button', {
        class: { 'detection-modal__close': true },
        on: { click: () => { setRetroConfig({ ...RETRO_CONFIG_DEFAULTS }); redraw(); } },
      }, 'Reset to defaults'),
    ]) : null,
  ].filter((n): n is VNode => n !== null);
}

function renderRetroModal(redraw: () => void): VNode {
  return h('div.detection-modal', [
    h('div.detection-modal__backdrop', {
      on: { click: () => { showRetroModal = false; redraw(); } },
    }),
    h('div.detection-modal__card', [
      h('div.detection-modal__header', [
        h('h2', 'Mistake Detection'),
        h('button.detection-modal__close', {
          attrs: { title: 'Close' },
          on: { click: () => { showRetroModal = false; redraw(); } },
        }, '✕'),
      ]),
      h('div.detection-modal__body', renderRetroConfigBody(redraw, { idPrefix: 'global-retro-config' })),
    ]),
  ]);
}

function renderGlobalMenu(deps: HeaderDeps): VNode {
  const { downloadPgn, resetAllData, selectedGameId, redraw } = deps;
  const hasGame = selectedGameId !== null;
  const hasVerifiedSyncSession = remoteSyncActive || (remoteSyncChecking && hasRemoteSyncToken());
  return h('div.global-menu', [
    h('button.global-menu__trigger', {
      class: { active: showGlobalMenu },
      attrs: { title: 'Settings' },
      on: { click: () => {
        showGlobalMenu    = !showGlobalMenu;
        showBoardSettings = false;
        redraw();
      }},
    }, '⚙'),

    showGlobalMenu ? h('div.global-menu__backdrop', {
      on: { click: () => closeGlobalMenu(redraw) },
    }) : null,

    showGlobalMenu ? h('div.global-menu__dropdown', {
      class: { 'board-open': showBoardSettings },
    }, [
      h('button.global-menu__item', {
        on: { click: () => {
          closeGlobalMenu(redraw);
          void resetAllData();
        } },
      }, 'Clear Local Data'),

      // Navigate to the analysis board to review the currently loaded game.
      // Disabled when no game is selected — nothing to review.
      h('button.global-menu__item', {
        attrs: { disabled: !hasGame, title: hasGame ? 'Review current game on analysis board' : 'Select a game first' },
        on: { click: () => {
          if (!hasGame) return;
          closeGlobalMenu(redraw);
          window.location.hash = '#/analysis';
        }},
      }, 'Game Review'),




      h('button.global-menu__item', {
        on: { click: () => { closeGlobalMenu(redraw); downloadPgn(true); } },
      }, 'Export PGN (Annotated)'),

      h('button.global-menu__item', {
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
          attrs: { type: 'range', min: 0, max: 1, step: 0.05, value: soundVolume },
          on: {
            input: (e: Event) => {
              setSoundVolume(parseFloat((e.target as HTMLInputElement).value));
              redraw();
            },
          },
        }),
      ]),

      h('button.global-menu__item', {
        on: { click: () => { showDetectionModal = true; showGlobalMenu = false; redraw(); } },
      }, 'Detection Settings…'),

      h('button.global-menu__item', {
        on: { click: () => { showRetroModal = true; showGlobalMenu = false; redraw(); } },
      }, 'Mistake Detection…'),

      hasVerifiedSyncSession ? h('button.global-menu__item', {
        on: { click: () => {
          closeGlobalMenu(redraw);
          window.location.hash = '#/sync';
        } },
      }, 'Sync Dashboard') : null,

      headerAuthUser ? h('button.global-menu__item.global-menu__item--logout', {
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

      h('div.global-menu__item.global-menu__item--has-sub', {
        on: { click: () => { showBoardSettings = !showBoardSettings; redraw(); } },
      }, [
        h('span', 'Board Settings'),
        h('span.global-menu__arrow', showBoardSettings ? '▾' : '›'),
      ]),

      showBoardSettings ? renderBoardSettings(redraw) : null,
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
        attrs: { type: 'button' },
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

function renderMobileNavLinks(active: string, mobileSubmenus: readonly HeaderMobileSubmenu[], redraw: () => void): VNode[] {
  const nodes: VNode[] = [];
  navLinks.forEach(({ label, href, section }) => {
    nodes.push(h('a.header__mobile-link', {
      attrs: { href },
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

function renderMobileNav(route: Route, redraw: () => void, mobileSubmenus: readonly HeaderMobileSubmenu[] = []): VNode {
  const active = activeSection(route);
  return h('div.header__mobile-nav', [
    h('button.header__hamburger', {
      class: { active: showMobileNav },
      attrs: { title: 'Menu', 'aria-label': 'Menu' },
      on: { click: () => { showMobileNav = !showMobileNav; redraw(); } },
    }, '☰'),
    showMobileNav ? h('div.header__mobile-backdrop', {
      on: { click: () => { showMobileNav = false; redraw(); } },
    }) : null,
    showMobileNav ? h('div.header__mobile-dropdown', renderMobileNavLinks(active, mobileSubmenus, redraw)) : null,
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
    const input = h('input.header__input', {
      key: `input-${importPlatform}`,
      attrs: {
        type: 'search',
        placeholder: importPlatform === 'chesscom' ? 'Chess.com username' : 'Lichess username',
        disabled: loading,
        autocomplete: 'off',
        spellcheck: false,
      },
      props: { value: username },
      on: {
        input: (e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          if (importPlatform === 'chesscom') chesscom.username = v;
          else lichess.username = v;
          syncImportCategory(redraw);
        },
        keydown: (e: KeyboardEvent) => {
          const currentUsername = importPlatform === 'chesscom' ? chesscom.username : lichess.username;
          if (e.key !== 'Enter' || !currentUsername.trim() || loading) return;
          if (importFilters.importCategory === null) {
            showImportPanel = true;
            redraw();
          } else {
            submitImport();
          }
        },
      },
    });

    if (mines.length === 0) return input;
    return h('div.header__account-entry', [
      input,
      h('button.header__account-back', {
        attrs: { type: 'button', title: 'Choose an imported account', disabled: loading },
        on: { click: () => {
          headerAccountMode = 'account';
          showImportPanel = false;
          redraw();
        }},
      }, 'Accounts'),
    ]);
  }

  return h('select.header__account-select', {
    attrs: { title: 'Choose my account to sync', disabled: loading },
    on: {
      change: (event: Event) => {
        const value = (event.target as HTMLSelectElement).value;
        headerSyncMessage = null;
        headerSyncError = null;
        if (value === 'new') {
          headerAccountMode = 'new';
          showImportPanel = false;
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
  ]);
}

function renderSyncMenu(
  account: ChessAccount,
  deps: HeaderDeps,
): VNode {
  const { redraw } = deps;
  const filterKey = importSyncFilterKey(importFilters.rated, importFilters.speeds);
  const filterMismatch = account.newestGameTimestamp !== null && account.syncFilterKey !== filterKey;
  const needsFallback = account.newestGameTimestamp === null || filterMismatch;
  const runSync = async (): Promise<void> => {
    if (headerSyncRunning) return;
    headerSyncRunning = true;
    headerSyncMessage = null;
    headerSyncError = null;
    redraw();
    try {
      const result: AccountSyncResult = await syncAccountGames(account, {
        rated: importFilters.rated,
        speeds: importFilters.speeds,
        onProgress: count => {
          headerSyncMessage = `Fetched ${count} game${count === 1 ? '' : 's'}...`;
          redraw();
        },
        ...(needsFallback ? { fallbackDateRange: currentImportDateRangeConfig() } : {}),
      });
      const syncOutcome = deps.onSyncGames(result.newGames);
      deps.refreshAccounts();
      if (result.addedCount === 0) {
        headerSyncMessage = 'No new games to import';
      } else {
        headerSyncMessage = `Imported ${syncOutcome.addedCount} new game${syncOutcome.addedCount === 1 ? '' : 's'}`;
      }
    } catch (err) {
      headerSyncError = err instanceof Error ? err.message : 'Sync failed.';
    } finally {
      headerSyncRunning = false;
      redraw();
    }
  };

  return h('div.header__panel', [
    h('div.header__panel-section', [
      h('div.header__panel-label', `Sync ${account.displayName}`),
      h('p.header__panel-hint', account.newestGameTimestamp === null
        ? 'No sync cursor yet'
        : `Sync from newest imported game: ${formatSyncDate(account.newestGameTimestamp)}`),
      filterMismatch ? h('p.header__panel-hint.header__panel-warn',
        'Filter changed; Patzer will run a wider safety fetch and dedupe existing games.') : null,
    ]),
    h('div.header__panel-divider'),
    h('div.header__panel-section', [
      h('div.header__panel-label', 'Time control'),
      h('div.header__panel-row', [
        h('button.header__pill', {
          class: { active: importFilters.speeds.size === 0 },
          on: { click: () => { importFilters.speeds = new Set(); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.header__pill', {
            class: { active: importFilters.speeds.has(value) },
            attrs: { 'data-icon': icon },
            on: { click: () => {
              const s = new Set(importFilters.speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              importFilters.speeds = s;
              redraw();
            }},
          }, label)
        ),
      ]),
      ...(needsFallback ? [
        h('div.header__panel-label.--mt', 'Period'),
        h('div.header__panel-row', DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.header__pill', {
            class: { active: importFilters.dateRange === value },
            on: { click: () => { importFilters.dateRange = value as ImportDateRange; redraw(); } },
          }, label),
        )),
      ] : []),
      h('div.header__panel-row.--mt', [
        h('label.header__panel-check', [
          h('input', {
            attrs: { type: 'checkbox', checked: importFilters.rated },
            on: { change: (e: Event) => { importFilters.rated = (e.target as HTMLInputElement).checked; redraw(); } },
          }),
          'Rated only',
        ]),
      ]),
    ]),
    h('div.header__panel-section', [
      headerSyncError ? h('div.header__panel-error', headerSyncError) : null,
      headerSyncMessage ? h('p.header__panel-hint', headerSyncMessage) : null,
      h('button.header__panel-btn', {
        attrs: { disabled: headerSyncRunning },
        on: { click: () => { void runSync(); } },
      }, headerSyncRunning ? 'Syncing...' : 'Sync games'),
    ]),
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
  ensureRemoteSyncActivityListener(redraw);
  ensureRemoteSyncAuth(redraw);
  if (!categorySyncInit) {
    categorySyncInit = true;
    syncImportCategory(redraw);
  }

  const loading  = importPlatform === 'chesscom' ? chesscom.loading  : lichess.loading;
  const error    = importPlatform === 'chesscom' ? chesscom.error    : lichess.error;
  const username = importPlatform === 'chesscom' ? chesscom.username : lichess.username;
  const selectedMineAccount = syncSelectedMineAccount(deps.accounts);
  const accountModeActive = selectedMineAccount !== null && headerAccountMode === 'account';

  const doImport = () => importPlatform === 'chesscom'
    ? void importChesscom(importCallbacks)
    : void importLichess(importCallbacks);

  const openSyncDashboard = (): void => {
    headerSyncMessage = null;
    headerSyncError = null;
    showImportPanel = true;
    redraw();
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
          on: { click: () => { importPlatform = 'chesscom'; syncImportCategory(redraw); redraw(); } },
        }, 'Chess.com'),
        h('button.header__pill', {
          class: { active: importPlatform === 'lichess' },
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
          on: { click: () => { importFilters.speeds = new Set(); redraw(); } },
        }, 'All'),
        ...SPEED_OPTIONS.map(({ value, label, icon }) =>
          h('button.header__pill', {
            class: { active: importFilters.speeds.has(value) },
            attrs: { 'data-icon': icon },
            on: { click: () => {
              const s = new Set(importFilters.speeds);
              s.has(value) ? s.delete(value) : s.add(value);
              importFilters.speeds = s;
              redraw();
            }},
          }, label)
        ),
      ]),

      h('div.header__panel-label.--mt', 'Period'),
      h('div.header__panel-row', [
        ...DATE_RANGE_OPTIONS.map(({ value, label }) =>
          h('button.header__pill', {
            class: { active: importFilters.dateRange === value },
            on: { click: () => { importFilters.dateRange = value as ImportDateRange; redraw(); } },
          }, label)
        ),
      ]),

      importFilters.dateRange === 'custom' ? h('div.header__panel-row.--mt', [
        h('span.header__panel-hint', 'From'),
        h('input.header__date-input', {
          attrs: { type: 'date', value: importFilters.customFrom },
          on: { change: (e: Event) => { importFilters.customFrom = (e.target as HTMLInputElement).value; redraw(); } },
        }),
        h('span.header__panel-hint', 'To'),
        h('input.header__date-input', {
          attrs: { type: 'date', value: importFilters.customTo },
          on: { change: (e: Event) => { importFilters.customTo = (e.target as HTMLInputElement).value; redraw(); } },
        }),
      ]) : null,

      h('div.header__panel-row.--mt', [
        h('label.header__panel-check', [
          h('input', {
            attrs: { type: 'checkbox', checked: importFilters.rated },
            on: { change: (e: Event) => { importFilters.rated = (e.target as HTMLInputElement).checked; redraw(); } },
          }),
          'Rated only',
        ]),
      ]),

    ]),

    h('div.header__panel-divider'),

    h('div.header__panel-section', [
      h('div.header__panel-label', 'Paste PGN'),
      h('textarea.header__pgn-input', {
        key: pgnState.key,
        attrs: { placeholder: 'Paste a PGN here…', rows: 3, spellcheck: false },
        on: { input: (e: Event) => { pgnState.input = (e.target as HTMLTextAreaElement).value; } },
      }),
      h('div.header__panel-row', [
        h('button.header__panel-btn', {
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
            on: { click: () => {
              onSelectGame(game.id, game.pgn);
              showImportPanel = false;
              redraw();
            }},
          }, renderGameRow(game, isAnalyzed, hasMissedTactic)),
          srcUrl ? h('a.game-ext-link', {
            attrs: { href: srcUrl, target: '_blank', rel: 'noopener', title: 'View on source platform' },
            on: { click: (e: Event) => e.stopPropagation() },
          }) : null,
        ]);
      })),
    ]) : null,

  ]) : null;

  const backdrop = showImportPanel ? h('div.header__backdrop', {
    on: { click: () => { showImportPanel = false; redraw(); } },
  }) : null;

  return h('header.header', [
    h('a.header__brand', { attrs: { href: '#/', 'aria-label': 'Patzer Pro home' } }, [
      h('img.header__brand-logo', {
        attrs: {
          src: HEADER_LOGO_SRC,
          alt: 'Patzer Pro',
          width: '30',
          height: '30',
        },
      }),
    ]),
    renderMobileNav(route, redraw, deps.mobileSubmenus ?? []),

    h('div.header__search', { key: 'header-search' }, [
      h('div.header__bar', [
        h('button.header__platform-toggle', {
          attrs: {
            title: accountModeActive ? platformLabel(importPlatform) : importPlatform === 'chesscom' ? 'Switch to Lichess' : 'Switch to Chess.com',
            disabled: accountModeActive,
          },
          on: { click: () => { importPlatform = importPlatform === 'chesscom' ? 'lichess' : 'chesscom'; syncImportCategory(redraw); redraw(); } },
        }, importPlatform === 'chesscom' ? 'Chess.com' : 'Lichess'),

        renderHeaderAccountControl(deps.accounts, selectedMineAccount, loading || headerSyncRunning, doImport, redraw),

        h('button.header__import', {
          attrs: {
            disabled: accountModeActive
              ? headerSyncRunning
              : loading || !username.trim() || importFilters.importCategory === null,
            ...(!accountModeActive && importFilters.importCategory === null && username.trim()
              ? { title: 'Choose an account category (Mine / Opponent / Study) in the filters panel (▾) first' }
              : {}),
          },
          on: { click: accountModeActive ? openSyncDashboard : doImport },
        }, accountModeActive
          ? (headerSyncRunning ? 'Syncing...' : 'Sync')
          : loading
          ? `Importing…${(importPlatform === 'chesscom' ? chesscom.gameCount : lichess.gameCount) > 0
              ? ` (${importPlatform === 'chesscom' ? chesscom.gameCount : lichess.gameCount})`
              : ''}`
          : 'Import'),

        importedGames.length > 0 && !error
          ? h('span.header__count', { on: { click: () => { showImportPanel = !showImportPanel; redraw(); } } },
              `${importedGames.length} games`)
          : null,
        error
          ? h('span.header__error', { attrs: { title: error } }, '⚠')
          : null,

        h('button.header__toggle', {
          class: { active: showImportPanel, 'header__toggle--filtered': hasActiveFilters && !showImportPanel },
          attrs: { title: 'Filters & games' },
          on: { click: () => { showImportPanel = !showImportPanel; redraw(); } },
        }, showImportPanel ? '▴' : '▾'),
      ]),

      panel,
      backdrop,
    ]),

    renderNav(route),
    renderReviewMenu(redraw),
    renderUserArea(redraw),
    renderGlobalMenu(deps),
    showLoginModal     ? renderLoginModal(redraw)     : null,
    showDetectionModal ? renderDetectionModal(redraw) : null,
    showRetroModal     ? renderRetroModal(redraw)     : null,
  ]);
}
