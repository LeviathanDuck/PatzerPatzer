import { record, Severity } from '../diagnostics';

const LICHESS_AUTH_URL = 'https://lichess.org/oauth';
const LICHESS_TOKEN_URL = 'https://lichess.org/api/token';
const LICHESS_ACCOUNT_URL = 'https://lichess.org/api/account';
const CLIENT_ID = 'patzer-pro';

const AUTH_STORAGE_KEY = 'patzer.lichess.clientAuth';
const PENDING_STORAGE_KEY = 'patzer.lichess.oauthPending';

export const LOGIN_MODAL_EVENT = 'patzer:open-login-modal';

export interface ClientAuthStatus {
  authenticated: boolean;
  username:      string | null;
  isAdmin:       boolean;
  source:        'client' | 'none';
}

interface StoredClientAuth {
  username:  string;
  token:     string;
  expiresAt: number | null;
}

interface PendingOAuth {
  state:      string;
  verifier:   string;
  returnHash: string;
  createdAt:  number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?:   number;
}

interface AccountResponse {
  username?: string;
  id?:       string;
}

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

function errorClass(error: unknown): string {
  if (error instanceof DOMException) return error.name || 'DOMException';
  if (error instanceof Error) return error.name || error.constructor.name || 'Error';
  return typeof error;
}

function authFailureClass(status: number | undefined, error?: unknown): string {
  if (error !== undefined && status === undefined) return 'network-error';
  if (status === 401) return 'auth-expired';
  if (status === 403) return 'auth-rejected';
  if (status !== undefined && status >= 500) return 'auth-server-error';
  if (status !== undefined && status >= 400) return 'auth-rejected';
  return 'unknown';
}

function recordClientAuthFailure(
  endpointClass: string,
  startedAt: number,
  status: number | undefined,
  error?: unknown,
): void {
  record({
    kind: 'api',
    severity: Severity.Error,
    source: 'auth/lichessClient',
    sourceTag: 'auth',
    message: `${endpointClass} failed`,
    metadata: {
      provider: 'lichess',
      endpointClass,
      ...(status !== undefined ? { httpStatus: status } : {}),
      latencyMs: Date.now() - startedAt,
      failureClass: authFailureClass(status, error),
      ...(error !== undefined ? { errorClass: errorClass(error) } : {}),
    },
    redactionClass: 'safe',
  });
}

async function sha256Base64Url(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64Url(new Uint8Array(digest));
}

function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function readStoredAuth(): StoredClientAuth | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const auth = JSON.parse(raw) as Partial<StoredClientAuth>;
    if (!auth.username || !auth.token) return null;
    if (auth.expiresAt && auth.expiresAt <= Date.now()) {
      clearClientAuth();
      return null;
    }
    return {
      username: auth.username,
      token: auth.token,
      expiresAt: typeof auth.expiresAt === 'number' ? auth.expiresAt : null,
    };
  } catch {
    clearClientAuth();
    return null;
  }
}

function writeStoredAuth(auth: StoredClientAuth): void {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
}

function readPendingOAuth(): PendingOAuth | null {
  try {
    const raw = sessionStorage.getItem(PENDING_STORAGE_KEY);
    if (!raw) return null;
    const pending = JSON.parse(raw) as Partial<PendingOAuth>;
    if (!pending.state || !pending.verifier) return null;
    return {
      state: pending.state,
      verifier: pending.verifier,
      returnHash: pending.returnHash ?? '',
      createdAt: typeof pending.createdAt === 'number' ? pending.createdAt : Date.now(),
    };
  } catch {
    sessionStorage.removeItem(PENDING_STORAGE_KEY);
    return null;
  }
}

function cleanupCallbackUrl(returnHash = ''): void {
  const clean = `${window.location.pathname}${returnHash || window.location.hash || ''}`;
  window.history.replaceState(null, '', clean);
}

export function requestLogin(): void {
  window.dispatchEvent(new CustomEvent(LOGIN_MODAL_EVENT));
}

export function getClientAuthStatus(): ClientAuthStatus {
  const auth = readStoredAuth();
  return auth
    ? { authenticated: true, username: auth.username, isAdmin: false, source: 'client' }
    : { authenticated: false, username: null, isAdmin: false, source: 'none' };
}

export function clearClientAuth(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  sessionStorage.removeItem(PENDING_STORAGE_KEY);
}

export async function startClientLogin(): Promise<void> {
  if (!window.isSecureContext) {
    throw new Error('Lichess login requires HTTPS or localhost.');
  }

  const state = randomBase64Url(24);
  const verifier = randomBase64Url(32);
  const challenge = await sha256Base64Url(verifier);

  const pending: PendingOAuth = {
    state,
    verifier,
    returnHash: window.location.hash,
    createdAt: Date.now(),
  };
  sessionStorage.setItem(PENDING_STORAGE_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: '',
  });

  window.location.href = `${LICHESS_AUTH_URL}?${params.toString()}`;
}

export async function completeClientLoginIfPresent(): Promise<ClientAuthStatus | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  if (!code || !state) return null;

  const pending = readPendingOAuth();
  sessionStorage.removeItem(PENDING_STORAGE_KEY);

  try {
    if (!pending || pending.state !== state) throw new Error('Invalid Lichess login state.');

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      client_id: CLIENT_ID,
      code_verifier: pending.verifier,
    });

    const tokenStart = Date.now();
    let tokenRes: Response;
    try {
      tokenRes = await fetch(LICHESS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (error) {
      recordClientAuthFailure('oauth-token', tokenStart, undefined, error);
      throw error;
    }
    if (!tokenRes.ok) {
      recordClientAuthFailure('oauth-token', tokenStart, tokenRes.status);
      throw new Error(`Lichess token request failed: ${tokenRes.status}`);
    }
    const tokenJson = await tokenRes.json() as TokenResponse;
    if (!tokenJson.access_token) throw new Error('Lichess token response did not include an access token.');

    const accountStart = Date.now();
    let accountRes: Response;
    try {
      accountRes = await fetch(LICHESS_ACCOUNT_URL, {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      });
    } catch (error) {
      recordClientAuthFailure('oauth-account', accountStart, undefined, error);
      throw error;
    }
    if (!accountRes.ok) {
      recordClientAuthFailure('oauth-account', accountStart, accountRes.status);
      throw new Error(`Lichess account request failed: ${accountRes.status}`);
    }
    const account = await accountRes.json() as AccountResponse;
    const username = account.username ?? account.id;
    if (!username) throw new Error('Lichess account response did not include a username.');

    writeStoredAuth({
      username,
      token: tokenJson.access_token,
      expiresAt: tokenJson.expires_in ? Date.now() + tokenJson.expires_in * 1000 : null,
    });
    cleanupCallbackUrl(pending.returnHash);
    return getClientAuthStatus();
  } catch (error) {
    console.warn('[auth] Lichess client login failed', error);
    cleanupCallbackUrl(pending?.returnHash);
    return null;
  }
}
