import { getRemoteSyncToken } from '../sync/remoteSync';
import { clearClientAuth } from './lichessClient';
import { record, Severity } from '../diagnostics';

const LICHESS_AUTH_URL = 'https://lichess.org/oauth';
const LICHESS_TOKEN_URL = 'https://lichess.org/api/token';
const LICHESS_ACCOUNT_URL = 'https://lichess.org/api/account';
const CLIENT_ID = 'patzer-pro';
const BOOK_AUTH_ENDPOINT = '/api/patzer-sync/book-auth.php';
const SERVER_LICHESS_STATUS_ENDPOINT = '/api/lichess/status';
const SERVER_LICHESS_CONNECT_ENDPOINT = '/api/lichess/connect';
const CALLBACK_PATH = '/book-oauth-callback.html';
const CALLBACK_MESSAGE_TYPE = 'patzer:book-oauth-callback';
const PENDING_STORAGE_KEY = 'patzer.lichess.bookOAuthPending';
const CALLBACK_STORAGE_KEY = 'patzer.lichess.bookOAuthCallback';
const POPUP_NAME = 'patzer-lichess-book-login';
const POPUP_CALLBACK_TIMEOUT_MS = 5 * 60 * 1000;

export interface BookAccessStatus {
  connected: boolean;
  username?: string;
}

export interface LichessApiLoginClearResult {
  localAuthCleared: boolean;
  bookAccessDisconnected: boolean;
  warnings: string[];
}

interface PendingBookOAuth {
  state: string;
  verifier: string;
  createdAt: number;
}

interface BookCallbackMessage {
  type?: string;
  code?: string | null;
  state?: string | null;
  error?: string | null;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
}

interface AccountResponse {
  username?: string;
  id?: string;
}

interface BookAuthResponse {
  ok?: boolean;
  connected?: boolean;
  username?: string;
  error?: string;
}

interface ServerLichessStatusResponse {
  connected?: boolean;
  username?: string | null;
}

interface CompletedBookLogin {
  username: string;
  token: string;
  expiresAt: number | null;
}

type BookCallbackChannel = 'message' | 'storage' | 'initial-storage' | 'poll-storage' | 'close-storage';
type BookAuthPhaseMetadata = Record<string, string | number | boolean | null>;

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomBase64Url(bytes: number): string {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return base64Url(values);
}

async function sha256Base64Url(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64Url(new Uint8Array(digest));
}

function redirectUri(): string {
  return `${window.location.origin}${CALLBACK_PATH}`;
}

function adminSyncToken(): string {
  return getRemoteSyncToken().trim();
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function errorClass(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function authFailureClass(status: number | undefined, error?: unknown): string {
  if (error !== undefined && status === undefined) return 'network-error';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'auth-rejected';
  if (status !== undefined && status >= 500) return 'server-error';
  if (status !== undefined && status >= 400) return 'auth-rejected';
  return 'unknown';
}

function recordBookAuthPhase(
  phase: string,
  severity: Severity = Severity.Info,
  metadata: BookAuthPhaseMetadata = {},
): void {
  record({
    kind: 'api',
    severity,
    source: 'auth/lichessBookAuth',
    sourceTag: 'auth',
    message: `Lichess book auth ${phase}`,
    metadata: {
      provider: 'lichess-book',
      phase,
      ...metadata,
    },
    redactionClass: 'safe',
  });
}

function recordBookAuthFailure(
  endpointClass: string,
  startedAt: number,
  status: number | undefined,
  error?: unknown,
): void {
  record({
    kind: 'api',
    severity: Severity.Error,
    source: 'auth/lichessBookAuth',
    sourceTag: 'auth',
    message: `${endpointClass} failed`,
    metadata: {
      provider: 'lichess-book',
      endpointClass,
      httpStatus: status ?? null,
      latencyMs: Date.now() - startedAt,
      failureClass: authFailureClass(status, error),
      ...(error !== undefined ? { errorClass: errorClass(error) } : {}),
    },
    redactionClass: 'safe',
  });
}

function clearBookOAuthState(): void {
  sessionStorage.removeItem(PENDING_STORAGE_KEY);
  localStorage.removeItem(CALLBACK_STORAGE_KEY);
}

function requireAdminHeaders(initHeaders?: HeadersInit): Headers {
  const token = adminSyncToken();
  if (!token) {
    throw new Error('Enter the sync token first so Patzer can save Lichess book access to the current user.');
  }
  const headers = new Headers(initHeaders);
  headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

async function readJsonResponse<T extends BookAuthResponse>(res: Response): Promise<T> {
  const text = await res.text();
  let body: BookAuthResponse = {};
  if (text.trim()) {
    try {
      body = JSON.parse(text) as BookAuthResponse;
    } catch {
      throw new Error(`Lichess book auth API returned ${res.headers.get('content-type') || 'non-JSON'} instead of JSON.`);
    }
  }
  if (!res.ok) throw new Error(body.error || `Lichess book auth API failed: ${res.status}`);
  return body as T;
}

async function bookAuthFetch<T extends BookAuthResponse>(init: RequestInit = {}): Promise<T> {
  const headers = requireAdminHeaders(init.headers);
  const startedAt = Date.now();
  let res: Response;
  try {
    res = await fetch(BOOK_AUTH_ENDPOINT, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    recordBookAuthFailure('book-auth', startedAt, undefined, error);
    throw error;
  }
  if (!res.ok) recordBookAuthFailure('book-auth', startedAt, res.status);
  return readJsonResponse<T>(res);
}

async function getServerLichessStatus(): Promise<BookAccessStatus | null> {
  try {
    const startedAt = Date.now();
    let res: Response;
    try {
      res = await fetch(SERVER_LICHESS_STATUS_ENDPOINT, {
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
    } catch (error) {
      recordBookAuthFailure('server-lichess-status', startedAt, undefined, error);
      throw error;
    }
    if (!res.ok) {
      recordBookAuthFailure('server-lichess-status', startedAt, res.status);
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) return null;
    const body = await res.json() as ServerLichessStatusResponse;
    if (!body.connected) return { connected: false };
    const username = typeof body.username === 'string' && body.username.trim() ? body.username : undefined;
    return username ? { connected: true, username } : { connected: true };
  } catch {
    return null;
  }
}

function popupFeatures(): string {
  const width = 520;
  const height = 680;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));
  return `popup=yes,width=${width},height=${height},left=${left},top=${top}`;
}

function openBookLoginPopup(): Window | null {
  const popup = window.open('about:blank', POPUP_NAME, popupFeatures());
  recordBookAuthPhase(popup ? 'popup-opened' : 'popup-blocked', popup ? Severity.Info : Severity.Error, {
    popupOpened: !!popup,
  });
  popup?.focus();
  return popup;
}

function closeBookLoginPopup(popup: Window | null): void {
  if (!popup) return;
  try {
    if (!popup.closed) popup.close();
  } catch {
    // COOP isolation can sever the opener reference; cleanup should stay best-effort.
  }
}

function popupLooksClosed(popup: Window): boolean {
  try {
    return popup.closed;
  } catch {
    return true;
  }
}

function navigateBookLoginPopup(popup: Window | null, url: string): Window {
  if (!popup || popup.closed) {
    recordBookAuthPhase('popup-unavailable-before-navigation', Severity.Error, {
      popupOpened: !!popup,
      popupClosed: popup?.closed ?? null,
    });
    throw new Error('Popup blocked. Allow popups for this site to connect Lichess book access.');
  }
  try {
    popup.location.href = url;
    popup.focus();
    recordBookAuthPhase('popup-navigated', Severity.Info, {
      popupOpened: true,
      popupClosed: popup.closed,
    });
  } catch (error) {
    recordBookAuthPhase('popup-navigation-failed', Severity.Error, {
      popupOpened: true,
      popupClosed: popup.closed,
      errorClass: errorClass(error),
    });
    throw error;
  }
  return popup;
}

function isCallbackMessage(value: unknown): value is BookCallbackMessage {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function readStoredCallback(): BookCallbackMessage | null {
  const raw = localStorage.getItem(CALLBACK_STORAGE_KEY);
  if (!raw) return null;
  const message = JSON.parse(raw) as unknown;
  return isCallbackMessage(message) ? message : null;
}

function waitForPopupCallback(popup: Window, state: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let closeObserved = false;
    const startedAt = Date.now();
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('storage', onStorage);
      window.clearInterval(closedTimer);
      window.clearTimeout(timeoutTimer);
    };
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };
    const elapsedMs = () => Date.now() - startedAt;
    const handleCallbackMessage = (message: BookCallbackMessage, callbackChannel: BookCallbackChannel): boolean => {
      if (message.type !== CALLBACK_MESSAGE_TYPE) return false;
      recordBookAuthPhase('callback-received', Severity.Info, {
        callbackChannel,
        elapsedMs: elapsedMs(),
      });
      if (message.state !== state) {
        recordBookAuthPhase('callback-state-mismatch', Severity.Error, {
          callbackChannel,
          elapsedMs: elapsedMs(),
          failureClass: 'state-mismatch',
        });
        finish(() => reject(new Error('Invalid Lichess book login state.')));
        return true;
      }
      if (message.error) {
        recordBookAuthPhase('callback-error', Severity.Error, {
          callbackChannel,
          elapsedMs: elapsedMs(),
          failureClass: 'provider-error',
        });
        finish(() => reject(new Error(`Lichess book login failed: ${message.error}`)));
        return true;
      }
      const code = typeof message.code === 'string' ? message.code : '';
      if (!code) {
        recordBookAuthPhase('callback-missing-code', Severity.Error, {
          callbackChannel,
          elapsedMs: elapsedMs(),
          failureClass: 'missing-code',
        });
        finish(() => reject(new Error('Lichess book login did not return an authorization code.')));
        return true;
      }
      localStorage.removeItem(CALLBACK_STORAGE_KEY);
      recordBookAuthPhase('callback-accepted', Severity.Info, {
        callbackChannel,
        elapsedMs: elapsedMs(),
      });
      finish(() => resolve(code));
      return true;
    };
    const handleStoredCallback = (callbackChannel: BookCallbackChannel): boolean => {
      try {
        const message = readStoredCallback();
        return message ? handleCallbackMessage(message, callbackChannel) : false;
      } catch {
        recordBookAuthPhase('callback-storage-invalid', Severity.Error, {
          callbackChannel,
          elapsedMs: elapsedMs(),
          failureClass: 'invalid-callback-json',
        });
        finish(() => reject(new Error('Invalid Lichess book login callback.')));
        return true;
      }
    };
    const onMessage = (event: MessageEvent<unknown>) => {
      if (event.origin !== window.location.origin || !isCallbackMessage(event.data)) return;
      handleCallbackMessage(event.data, 'message');
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CALLBACK_STORAGE_KEY || !event.newValue) return;
      handleStoredCallback('storage');
    };
    const closedTimer = window.setInterval(() => {
      if (settled) return;
      if (handleStoredCallback(closeObserved ? 'close-storage' : 'poll-storage')) return;
      if (!popupLooksClosed(popup) || closeObserved) return;
      // Under COOP, a cross-origin OAuth popup can look closed/severed to the opener
      // even while the user is still completing the provider flow.
      closeObserved = true;
      recordBookAuthPhase('popup-closed-or-isolated-before-callback', Severity.Warn, {
        popupClosed: true,
        elapsedMs: elapsedMs(),
        timeoutMs: POPUP_CALLBACK_TIMEOUT_MS,
        failureClass: 'popup-closed-or-coop-isolated',
      });
    }, 500);
    const timeoutTimer = window.setTimeout(() => {
      recordBookAuthPhase('callback-timeout', Severity.Error, {
        elapsedMs: elapsedMs(),
        failureClass: 'timeout',
      });
      finish(() => reject(new Error('Lichess book login timed out.')));
    }, POPUP_CALLBACK_TIMEOUT_MS);
    window.addEventListener('message', onMessage);
    window.addEventListener('storage', onStorage);
    handleStoredCallback('initial-storage');
  });
}

async function completePopupLogin(code: string, pending: PendingBookOAuth): Promise<CompletedBookLogin> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri(),
    client_id: CLIENT_ID,
    code_verifier: pending.verifier,
  });

  const tokenStart = Date.now();
  recordBookAuthPhase('token-exchange-started', Severity.Info, {
    endpointClass: 'book-oauth-token',
  });
  let tokenRes: Response;
  try {
    tokenRes = await fetch(LICHESS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
  } catch (error) {
    recordBookAuthFailure('book-oauth-token', tokenStart, undefined, error);
    recordBookAuthPhase('token-exchange-failed', Severity.Error, {
      endpointClass: 'book-oauth-token',
      latencyMs: Date.now() - tokenStart,
      failureClass: authFailureClass(undefined, error),
      errorClass: errorClass(error),
    });
    throw error;
  }
  if (!tokenRes.ok) {
    recordBookAuthFailure('book-oauth-token', tokenStart, tokenRes.status);
    recordBookAuthPhase('token-exchange-failed', Severity.Error, {
      endpointClass: 'book-oauth-token',
      httpStatus: tokenRes.status,
      latencyMs: Date.now() - tokenStart,
      failureClass: authFailureClass(tokenRes.status),
    });
    throw new Error(`Lichess token request failed: ${tokenRes.status}`);
  }
  const tokenJson = await tokenRes.json() as TokenResponse;
  if (!tokenJson.access_token) {
    recordBookAuthPhase('token-exchange-failed', Severity.Error, {
      endpointClass: 'book-oauth-token',
      latencyMs: Date.now() - tokenStart,
      failureClass: 'missing-token',
    });
    throw new Error('Lichess token response did not include an access token.');
  }
  recordBookAuthPhase('token-exchange-succeeded', Severity.Info, {
    endpointClass: 'book-oauth-token',
    latencyMs: Date.now() - tokenStart,
  });

  const accountStart = Date.now();
  recordBookAuthPhase('account-fetch-started', Severity.Info, {
    endpointClass: 'book-oauth-account',
  });
  let accountRes: Response;
  try {
    accountRes = await fetch(LICHESS_ACCOUNT_URL, {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });
  } catch (error) {
    recordBookAuthFailure('book-oauth-account', accountStart, undefined, error);
    recordBookAuthPhase('account-fetch-failed', Severity.Error, {
      endpointClass: 'book-oauth-account',
      latencyMs: Date.now() - accountStart,
      failureClass: authFailureClass(undefined, error),
      errorClass: errorClass(error),
    });
    throw error;
  }
  if (!accountRes.ok) {
    recordBookAuthFailure('book-oauth-account', accountStart, accountRes.status);
    recordBookAuthPhase('account-fetch-failed', Severity.Error, {
      endpointClass: 'book-oauth-account',
      httpStatus: accountRes.status,
      latencyMs: Date.now() - accountStart,
      failureClass: authFailureClass(accountRes.status),
    });
    throw new Error(`Lichess account request failed: ${accountRes.status}`);
  }
  const account = await accountRes.json() as AccountResponse;
  const username = account.username ?? account.id;
  if (!username) {
    recordBookAuthPhase('account-fetch-failed', Severity.Error, {
      endpointClass: 'book-oauth-account',
      latencyMs: Date.now() - accountStart,
      failureClass: 'missing-username',
    });
    throw new Error('Lichess account response did not include a username.');
  }
  recordBookAuthPhase('account-fetch-succeeded', Severity.Info, {
    endpointClass: 'book-oauth-account',
    latencyMs: Date.now() - accountStart,
  });

  return {
    username,
    token: tokenJson.access_token,
    expiresAt: tokenJson.expires_in ? Date.now() + tokenJson.expires_in * 1000 : null,
  };
}

async function runPopupLogin(popup: Window | null): Promise<CompletedBookLogin> {
  if (!window.isSecureContext) {
    recordBookAuthPhase('insecure-context', Severity.Error, {
      failureClass: 'insecure-context',
    });
    closeBookLoginPopup(popup);
    throw new Error('Lichess book login requires HTTPS or localhost.');
  }

  clearBookOAuthState();
  const state = randomBase64Url(24);
  const verifier = randomBase64Url(32);
  const pending: PendingBookOAuth = { state, verifier, createdAt: Date.now() };

  let authPopup: Window | null = popup;
  try {
    sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));
    const challenge = await sha256Base64Url(verifier);
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
      scope: '',
    });
    authPopup = navigateBookLoginPopup(popup, `${LICHESS_AUTH_URL}?${params.toString()}`);
  } catch (error) {
    sessionStorage.removeItem(PENDING_STORAGE_KEY);
    closeBookLoginPopup(authPopup);
    throw error;
  }
  const activePopup = authPopup;
  if (!activePopup || activePopup.closed) {
    sessionStorage.removeItem(PENDING_STORAGE_KEY);
    closeBookLoginPopup(activePopup);
    throw new Error('Popup blocked. Allow popups for this site to connect Lichess book access.');
  }

  try {
    const code = await waitForPopupCallback(activePopup, state);
    return await completePopupLogin(code, pending);
  } finally {
    sessionStorage.removeItem(PENDING_STORAGE_KEY);
    closeBookLoginPopup(activePopup);
  }
}

async function runServerPopupLogin(popup: Window | null): Promise<void> {
  const authPopup = navigateBookLoginPopup(popup, SERVER_LICHESS_CONNECT_ENDPOINT);

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let closeObserved = false;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      void getServerLichessStatus().then(status => {
        if (settled) return;
        if (status?.connected) {
          settled = true;
          window.clearInterval(timer);
          recordBookAuthPhase('server-lichess-connected', Severity.Info, {
            endpointClass: 'server-lichess-status',
            latencyMs: Date.now() - startedAt,
          });
          closeBookLoginPopup(authPopup);
          resolve();
          return;
        }
        if (popupLooksClosed(authPopup) && !closeObserved) {
          closeObserved = true;
          recordBookAuthPhase('server-popup-closed-or-isolated-before-status', Severity.Warn, {
            endpointClass: 'server-lichess-status',
            popupClosed: true,
            latencyMs: Date.now() - startedAt,
            timeoutMs: POPUP_CALLBACK_TIMEOUT_MS,
            failureClass: 'popup-closed-or-coop-isolated',
          });
          return;
        }
        if (Date.now() - startedAt > POPUP_CALLBACK_TIMEOUT_MS) {
          settled = true;
          window.clearInterval(timer);
          closeBookLoginPopup(authPopup);
          recordBookAuthPhase('server-popup-timeout', Severity.Error, {
            endpointClass: 'server-lichess-status',
            latencyMs: Date.now() - startedAt,
            failureClass: 'timeout',
          });
          reject(new Error('Lichess book login timed out.'));
        }
      });
    }, 750);
  });
}

async function saveBookAccess(login: CompletedBookLogin): Promise<void> {
  const startedAt = Date.now();
  recordBookAuthPhase('book-token-save-started', Severity.Info, {
    endpointClass: 'book-auth',
  });
  try {
    await bookAuthFetch<BookAuthResponse>({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        username: login.username,
        token: login.token,
        expiresAt: login.expiresAt,
      }),
    });
    recordBookAuthPhase('book-token-save-succeeded', Severity.Info, {
      endpointClass: 'book-auth',
      latencyMs: Date.now() - startedAt,
    });
  } catch (error) {
    recordBookAuthPhase('book-token-save-failed', Severity.Error, {
      endpointClass: 'book-auth',
      latencyMs: Date.now() - startedAt,
      failureClass: authFailureClass(undefined, error),
      errorClass: errorClass(error),
    });
    throw error;
  }
}

export async function getBookAccessStatus(): Promise<BookAccessStatus> {
  if (!adminSyncToken()) return (await getServerLichessStatus()) ?? { connected: false };
  const body = await bookAuthFetch<BookAuthResponse>();
  if (body.connected) {
    const username = typeof body.username === 'string' && body.username.trim() ? body.username : undefined;
    return username ? { connected: true, username } : { connected: true };
  }
  return { connected: false };
}

export async function disconnectBookAccess(): Promise<void> {
  if (!adminSyncToken()) return;
  await bookAuthFetch<BookAuthResponse>({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'disconnect' }),
  });
}

export function clearLocalLichessApiLoginData(): void {
  clearClientAuth();
  clearBookOAuthState();
}

export async function clearLichessApiLoginData(): Promise<LichessApiLoginClearResult> {
  clearLocalLichessApiLoginData();
  const result: LichessApiLoginClearResult = {
    localAuthCleared: true,
    bookAccessDisconnected: false,
    warnings: [],
  };
  if (!adminSyncToken()) {
    result.warnings.push('No admin sync token is active, so only this browser was cleared.');
    return result;
  }
  try {
    await disconnectBookAccess();
    result.bookAccessDisconnected = true;
  } catch (error) {
    throw new Error(errorMessage(error, 'Failed to clear Lichess book access.'));
  }
  return result;
}

export async function requestBookLogin(redraw?: () => void): Promise<void> {
  const popup = openBookLoginPopup();
  if (!adminSyncToken()) {
    try {
      const serverStatus = await getServerLichessStatus();
      if (serverStatus?.connected) {
        closeBookLoginPopup(popup);
        redraw?.();
        return;
      }
      if (serverStatus) {
        await runServerPopupLogin(popup);
        redraw?.();
        return;
      }
      closeBookLoginPopup(popup);
      requireAdminHeaders();
    } catch (error) {
      closeBookLoginPopup(popup);
      throw error;
    }
  }
  try {
    const login = await runPopupLogin(popup);
    await saveBookAccess(login);
    await getBookAccessStatus();
    redraw?.();
  } catch (error) {
    closeBookLoginPopup(popup);
    throw error;
  }
}
