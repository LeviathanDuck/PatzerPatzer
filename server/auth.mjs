/**
 * Admin authentication module for Patzer Pro server.
 *
 * Uses a simple shared-secret token model:
 * - Set ADMIN_TOKEN environment variable on the server
 * - Client sends token via Authorization: Bearer <token> header
 * - Middleware checks the header on protected routes
 *
 * No sessions, no cookies, no OAuth. Single-admin model.
 */

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';

if (!ADMIN_TOKEN) {
  console.warn('[auth] WARNING: ADMIN_TOKEN not set. Auth endpoints will reject all requests.');
  console.warn('[auth] Set it with: ADMIN_TOKEN=your-secret node server.mjs');
}

/**
 * Check if a request has a valid admin auth token.
 * @param {import('http').IncomingMessage} req
 * @returns {boolean}
 */
export function isAuthenticated(req) {
  if (!ADMIN_TOKEN) return false;
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) return false;
  const token = header.slice(7).trim();
  return token === ADMIN_TOKEN;
}

/**
 * Middleware-style check. Returns true if authenticated, false otherwise.
 * If not authenticated, writes a 401 response and returns false.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @returns {boolean} true if request is authorized
 */
export function requireAuth(req, res) {
  if (isAuthenticated(req)) return true;
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Unauthorized' }));
  return false;
}

/**
 * Handle POST /api/auth/login
 * Expects JSON body: { "token": "..." }
 * Returns 200 with { authenticated: true, bearer: token } on success,
 * or 401 with { authenticated: false } on failure.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export function handleLogin(req, res) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const { token } = JSON.parse(body);
      if (token && ADMIN_TOKEN && token === ADMIN_TOKEN) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: true, bearer: token }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: false, error: 'Invalid token' }));
      }
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
}

/**
 * Handle GET /api/auth/status
 * Returns { authenticated: true/false } based on the Authorization header.
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 */
export function handleAuthStatus(req, res) {
  const authed = isAuthenticated(req);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ authenticated: authed }));
}
