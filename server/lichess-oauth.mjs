/**
 * Lichess OAuth PKCE flow for Patzer Pro.
 *
 * Handles the server-side legs of the Authorization Code + PKCE flow:
 *   GET /api/lichess/connect  → redirect user to Lichess consent page
 *   GET /oauth/callback       → exchange code for token, redirect back to app
 *   GET /api/lichess/status   → return { connected, username }
 *
 * Token is stored in memory for the lifetime of the server process.
 * No special Lichess scopes are required — a zero-scope token is enough
 * for the opening explorer API.
 *
 * Reference: https://lichess.org/api#section/Authentication
 */

import crypto from 'crypto';
import https  from 'https';
import { createSession, sessionCookieHeader } from './auth.mjs';

const LICHESS  = 'https://lichess.org';
const CLIENT_ID = 'patzer-pro';

// Allowlist for session-based login (sync functionality).
// Opening explorer OAuth still works for any authenticated user.
const ALLOWED_USERS = new Set(['leviathan_duck']);

// In-memory state — survives navigation, lost on server restart.
let _verifier  = null;   // PKCE code_verifier (cleared after use)
let _token     = null;   // Lichess access token
let _username  = null;   // Lichess username for display

// ── Promise-based HTTPS helpers ──────────────────────────────────────────────

function httpsPost(url, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpsGetJson(url, token) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Authorization: `Bearer ${token}` } }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error('JSON parse error')); }
      });
    }).on('error', reject);
  });
}

// ── Public API ───────────────────────────────────────────────

export function getLichessToken()  { return _token; }
export function getLichessStatus() { return { connected: !!_token, username: _username }; }

export function disconnectLichess() {
  _token    = null;
  _username = null;
}

/**
 * GET /api/lichess/connect
 * Generates PKCE params and redirects the browser to the Lichess OAuth consent page.
 */
export function startOAuth(req, res) {
  const proto  = req.headers['x-forwarded-proto'] ?? 'http';
  const origin = `${proto}://${req.headers.host}`;
  _verifier      = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(_verifier).digest('base64url');

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          `${origin}/oauth/callback`,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
    scope:                 '',
  });

  res.writeHead(302, { Location: `${LICHESS}/oauth?${params}` });
  res.end();
}

/**
 * GET /oauth/callback
 * Exchanges the authorization code for a token, fetches the Lichess username,
 * creates a session, and redirects back to the app with the session cookie set.
 */
export async function handleCallback(req, res) {
  const proto  = req.headers['x-forwarded-proto'] ?? 'http';
  const origin = `${proto}://${req.headers.host}`;
  const url    = new URL(req.url, origin);
  const code   = url.searchParams.get('code');

  if (!code || !_verifier) {
    res.writeHead(302, { Location: '/#' });
    res.end();
    return;
  }

  const verifier = _verifier;
  _verifier = null;

  try {
    const body = new URLSearchParams({
      grant_type:    'authorization_code',
      code,
      redirect_uri:  `${origin}/oauth/callback`,
      client_id:     CLIENT_ID,
      code_verifier: verifier,
    }).toString();

    const tokenJson = await httpsPost(`${LICHESS}/api/token`, body);
    if (!tokenJson.access_token) throw new Error('No access token');
    _token = tokenJson.access_token;

    const accountJson = await httpsGetJson(`${LICHESS}/api/account`, _token);
    _username = accountJson.username ?? null;

    // Restrict session-based login to the allowlist.
    // The Lichess token is still stored for opening explorer access.
    if (!_username || !ALLOWED_USERS.has(_username.toLowerCase())) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><title>Patzer Pro</title>
<style>
  body { background: #111; color: #ccc; font-family: sans-serif;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; }
  .card { background: #1a1a1a; border: 1px solid #333; border-radius: 8px;
          padding: 32px 40px; text-align: center; max-width: 420px; }
  h2 { color: #e8e8e8; margin: 0 0 12px; }
  p  { margin: 0 0 24px; line-height: 1.6; }
  a  { color: #6a9; text-decoration: none; border: 1px solid #2a4a2a;
       border-radius: 4px; padding: 8px 18px; }
  a:hover { color: #8fc; border-color: #3a6a3a; }
</style>
</head>
<body>
  <div class="card">
    <h2>Access Restricted</h2>
    <p>Sorry — login sync functionality is only currently available for Admin.</p>
    <a href="/">Back to Patzer Pro</a>
  </div>
</body>
</html>`);
      return;
    }

    const sessionToken = createSession(_username, _token);
    res.writeHead(302, {
      Location:   '/#',
      'Set-Cookie': sessionCookieHeader(sessionToken),
    });
    res.end();
  } catch {
    res.writeHead(302, { Location: '/#' });
    res.end();
  }
}
