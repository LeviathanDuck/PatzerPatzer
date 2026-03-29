/**
 * Session-based authentication for Patzer Pro.
 *
 * Sessions are created by the Lichess OAuth flow (server/lichess-oauth.mjs)
 * and stored in memory for the lifetime of the server process.
 * Each session is tied to a secure random token sent as an HttpOnly cookie.
 *
 * On server restart all sessions are lost and users must re-authenticate
 * via Lichess OAuth — acceptable for a single-user dev/personal tool.
 */

import crypto from 'crypto';

const SESSION_COOKIE = 'patzer_session';

/** In-memory session store: sessionToken → { username, lichessToken, createdAt } */
const sessions = new Map();

// ── Session lifecycle ────────────────────────────────────────────────────────

/**
 * Create a new session for a Lichess-authenticated user.
 * Returns the opaque session token to set as a cookie.
 */
export function createSession(username, lichessToken) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { username, lichessToken, createdAt: Date.now() });
  return token;
}

function getSessionToken(req) {
  const cookieHeader = req.headers['cookie'] || '';
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}

/** Return the session object for this request, or null if not authenticated. */
export function getSession(req) {
  const token = getSessionToken(req);
  return token ? (sessions.get(token) ?? null) : null;
}

/** Remove the session associated with this request. */
export function destroySession(req) {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
}

/** Value for the Set-Cookie header when creating a session. */
export function sessionCookieHeader(token) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/`;
}

/** Value for the Set-Cookie header when clearing a session. */
export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

// ── Auth middleware ──────────────────────────────────────────────────────────

export function isAuthenticated(req) {
  return getSession(req) !== null;
}

/**
 * Middleware-style guard for protected routes.
 * Returns true if the request has a valid session, otherwise writes a 401 and returns false.
 */
export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

// ── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/auth/status — returns { authenticated, username } */
export function handleAuthStatus(req, res) {
  const session = getSession(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    authenticated: !!session,
    username: session?.username ?? null,
  }));
}

/** POST /api/auth/logout — destroys the session and clears the cookie */
export function handleLogout(req, res) {
  destroySession(req);
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'Set-Cookie': clearCookieHeader(),
  });
  res.end(JSON.stringify({ authenticated: false }));
}
