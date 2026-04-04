/**
 * Dev server for PatzerPro.
 *
 * Sets Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy headers,
 * which are required to unlock SharedArrayBuffer in the browser.
 * Without these headers, multi-threaded Stockfish WASM cannot run because
 * Emscripten pthreads rely on SharedArrayBuffer for shared memory.
 *
 * Usage:  node server.mjs        (serves on http://localhost:3000)
 *         node server.mjs 8080   (custom port)
 *
 * After starting, open http://localhost:3000 in your browser.
 * File://  URLs do NOT get these headers — you must use this server.
 */

import http  from 'http';
import https from 'https';
import fs    from 'fs';
import path  from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { handleAuthStatus, handleLogout } from './server/auth.mjs';
import { handleSyncRoute } from './server/sync.mjs';
import {
  startOAuth, handleCallback,
  getLichessToken, getLichessStatus, disconnectLichess,
} from './server/lichess-oauth.mjs';
import { runMigrations } from './server/db.mjs';
import { buildSprintDashboardData, mutateSprintRegistryLocked, nextSprintPanelRetiredId } from './scripts/sprint-registry-lib.mjs';
import {
  compareRegistryOwnedBodyMetadata,
  isEditablePrompt,
  isSkippablePrompt,
  mutateRegistryLocked,
  nextSupersededPromptId,
  normalizePromptBodyText,
  readRegistry,
  requirePrompt,
  validatePromptBodyText,
  writePromptBodyFile,
} from './scripts/prompt-registry-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC    = path.join(__dirname, 'public');
const DOCS      = path.join(__dirname, 'docs');
const PORT      = parseInt(process.argv[2] ?? '3001', 10);
const DASHBOARD_PATH = path.join(DOCS, 'prompts', 'dashboard.html');
const LOOKBOOK_PATH  = path.join(DOCS, 'patzer-lookbook.html');
const VALID_SPRINT_PANEL_IDS = new Set(['audit', 'mismatch', 'nextPhase', 'appendRequest']);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.wasm': 'application/wasm',
  '.nnue': 'application/octet-stream',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.map':  'application/json',
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function readJsonBody(req) {
  return new Promise((resolvePromise, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw.trim()) {
        resolvePromise({});
        return;
      }
      try {
        resolvePromise(JSON.parse(raw));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function refreshSprintArtifacts() {
  execSync('npm run sprint:recompute && npm run sprints:generate && npm run dashboard:generate', {
    cwd: __dirname,
    timeout: 30000,
    stdio: 'pipe',
  });
}

function refreshPromptArtifacts() {
  execSync('npm run prompts:refresh', {
    cwd: __dirname,
    timeout: 30000,
    stdio: 'pipe',
  });
}

function retiredPromptWarningBlock(prompt) {
  return [
    'RETIRED REFERENCE ONLY — DO NOT RUN',
    `Retired prompt id: ${prompt.id}`,
    `Active prompt id: ${prompt.supersededFromPromptId || 'unknown'}`,
    '',
    String(prompt.archivedPromptBody || ''),
  ].join('\n');
}

async function handleSprintPanelNoteWrite(req, res, { clear = false } = {}) {
  try {
    const body = await readJsonBody(req);
    const sprintId = String(body.sprintId ?? '').trim();
    const panel = String(body.panel ?? '').trim();
    const text = String(body.text ?? '').trim();
    const fullBody = String(body.body ?? '').trim();

    if (!sprintId) {
      sendJson(res, 400, { error: 'sprintId is required.' });
      return;
    }
    if (!VALID_SPRINT_PANEL_IDS.has(panel)) {
      sendJson(res, 400, { error: 'panel must be one of audit, mismatch, nextPhase, appendRequest.' });
      return;
    }
    if (!clear && !text && !fullBody) {
      sendJson(res, 400, { error: 'text or body is required when saving a sprint panel.' });
      return;
    }

    const priorSprint = buildSprintDashboardData(__dirname).sprints.find(entry => entry.id === sprintId);
    if (!priorSprint) {
      sendJson(res, 404, { error: `Unknown sprint id: ${sprintId}` });
      return;
    }

    const defaultBodies = {
      audit: String(priorSprint.auditPromptTemplateDefault || '').trim(),
      mismatch: String(priorSprint.mismatchFollowUpTemplateDefault || '').trim(),
      nextPhase: String(priorSprint.nextPromptsTemplateDefault || '').trim(),
      appendRequest: String(priorSprint.appendRequestTemplateDefault || '').trim(),
    };
    const currentBodies = {
      audit: String(priorSprint.auditPromptTemplateRendered || priorSprint.auditPromptTemplate || '').trim(),
      mismatch: String(priorSprint.mismatchFollowUpTemplateRendered || priorSprint.mismatchFollowUpTemplate || '').trim(),
      nextPhase: String(priorSprint.nextPromptsTemplateRendered || priorSprint.nextPromptsTemplate || '').trim(),
      appendRequest: String(priorSprint.appendRequestTemplateRendered || priorSprint.appendRequestTemplate || '').trim(),
    };

    let savedRetiredId = null;
    await mutateSprintRegistryLocked(__dirname, registry => {
      const sprint = registry.sprints.find(entry => entry.id === sprintId);
      if (!sprint) throw new Error(`Unknown sprint id: ${sprintId}`);

      sprint.panelNotes ||= {};
      if (clear) {
        delete sprint.panelNotes[panel];
        if (Object.keys(sprint.panelNotes).length === 0) delete sprint.panelNotes;
      } else {
        const now = new Date().toISOString();
        const previous = sprint.panelNotes[panel] && typeof sprint.panelNotes[panel] === 'object'
          ? sprint.panelNotes[panel]
          : {};
        const entry = { ...previous };
        if (fullBody) {
          const previousBody = String(previous.currentBody || currentBodies[panel] || '').trim();
          if (previousBody && previousBody !== fullBody) {
            const retiredId = nextSprintPanelRetiredId(registry, sprintId, panel);
            registry.sprints.push({
              id: retiredId,
              sprintId,
              panel,
              archivedBody: previousBody,
              archivedAt: now,
              supersededFromSprintId: sprintId,
              retiredReferenceOnly: true,
              hiddenFromDashboard: true,
            });
            entry.supersededVersionIds = [...(Array.isArray(previous.supersededVersionIds) ? previous.supersededVersionIds : []), retiredId];
            savedRetiredId = retiredId;
          }
          entry.currentBody = fullBody;
          delete entry.text;
          entry.lastEditedAt = now;
          entry.updatedAt = now;
        } else {
          entry.text = text;
          if (!entry.currentBody && !text) delete entry.text;
          entry.updatedAt = now;
        }
        if (String(entry.currentBody || '').trim() === defaultBodies[panel]) {
          delete entry.currentBody;
          delete entry.lastEditedAt;
          if (!entry.text && !(entry.supersededVersionIds && entry.supersededVersionIds.length)) {
            delete sprint.panelNotes[panel];
          } else {
            sprint.panelNotes[panel] = entry;
          }
        } else {
          sprint.panelNotes[panel] = entry;
        }
        if (sprint.panelNotes && Object.keys(sprint.panelNotes).length === 0) delete sprint.panelNotes;
      }
      sprint.updatedAt = new Date().toISOString();
    });

    refreshSprintArtifacts();

    const sprint = buildSprintDashboardData(__dirname).sprints.find(entry => entry.id === sprintId);
    if (!sprint) {
      sendJson(res, 500, { error: `Sprint ${sprintId} was updated but could not be reloaded.` });
      return;
    }
    const result = { sprint };
    if (savedRetiredId) result.retiredId = savedRetiredId;
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function handlePromptEditSave(req, res) {
  try {
    const body = await readJsonBody(req);
    const promptId = String(body.promptId ?? '').trim();
    const nextBodyRaw = String(body.body ?? '');

    if (!promptId) {
      sendJson(res, 400, { error: 'promptId is required.' });
      return;
    }

    const { registry } = readRegistry(__dirname);
    const prompt = requirePrompt(registry, promptId);
    if (!isEditablePrompt(prompt)) {
      sendJson(res, 400, { error: `${promptId} is not editable from the dashboard. Only created / queued-pending prompts can be edited.` });
      return;
    }

    const currentBody = normalizePromptBodyText(fs.readFileSync(path.resolve(__dirname, prompt.promptFile), 'utf8'));
    const nextBody = normalizePromptBodyText(nextBodyRaw);
    if (currentBody === nextBody) {
      sendJson(res, 200, { unchanged: true });
      return;
    }

    const metadataFindings = compareRegistryOwnedBodyMetadata(currentBody, nextBody);
    if (metadataFindings.length) {
      sendJson(res, 400, { error: `Registry-owned metadata was changed: ${metadataFindings.join('; ')}` });
      return;
    }

    const validationWarnings = validatePromptBodyText(nextBody, { id: promptId });

    let result = null;
    await mutateRegistryLocked(__dirname, workingRegistry => {
      const activePrompt = requirePrompt(workingRegistry, promptId);
      if (!isEditablePrompt(activePrompt)) {
        throw new Error(`${promptId} is not editable from the dashboard anymore.`);
      }

      const now = new Date().toISOString();
      const archivedId = nextSupersededPromptId(workingRegistry, promptId);
      const archivedPrompt = {
        ...activePrompt,
        id: archivedId,
        title: `Superseded reference for ${promptId} — ${activePrompt.title}`,
        status: 'superseded',
        queueState: 'not-queued',
        reviewOutcome: 'pending',
        reviewIssues: '',
        promptFile: '',
        archivedPromptBody: currentBody,
        supersededFromPromptId: promptId,
        supersededAt: now,
        hiddenFromDashboard: true,
        retiredReferenceOnly: true,
        lastEditedAt: '',
        notes: 'Dashboard-edited superseded archive. Reference only. Do not run.',
        startedAt: '',
        reviewedAt: '',
        reviewedBy: '',
        reviewMethod: '',
        reviewScope: '',
        completedAt: '',
        completionErrors: '',
        manualChecklist: [],
        fixesPromptId: '',
        fixedByPromptId: '',
        fixPromptSuggestion: '',
        batchPromptIds: [],
        parentPromptId: '',
        claudeUsed: false,
      };

      workingRegistry.prompts.push(archivedPrompt);
      activePrompt.supersededVersionIds = [...(activePrompt.supersededVersionIds || []), archivedId];
      activePrompt.lastEditedAt = now;
      writePromptBodyFile(__dirname, activePrompt, nextBody);

      result = { archivedId, lastEditedAt: now };
    });

    try {
      refreshPromptArtifacts();
    } catch {
      // prompts:refresh may report pre-existing audit issues after generating files.
    }

    const updated = readRegistry(__dirname).registry.prompts.find(entry => entry.id === promptId);
    sendJson(res, 200, {
      ok: true,
      prompt: updated,
      archivedId: result?.archivedId || '',
      lastEditedAt: result?.lastEditedAt || '',
      validationWarnings,
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

async function handlePromptSkip(req, res) {
  try {
    const body = await readJsonBody(req);
    const promptId = String(body.promptId ?? '').trim();
    const reason = String(body.reason ?? '').trim();

    if (!promptId) {
      sendJson(res, 400, { error: 'promptId is required.' });
      return;
    }

    const { registry } = readRegistry(__dirname);
    const prompt = requirePrompt(registry, promptId);
    if (!isSkippablePrompt(prompt)) {
      sendJson(res, 400, { error: `${promptId} cannot be skipped. Only created / queued-pending prompts may be skipped.` });
      return;
    }

    let skippedAt = '';
    await mutateRegistryLocked(__dirname, workingRegistry => {
      const target = requirePrompt(workingRegistry, promptId);
      if (!isSkippablePrompt(target)) {
        throw new Error(`${promptId} cannot be skipped anymore.`);
      }
      skippedAt = new Date().toISOString();
      target.status = 'skipped';
      target.queueState = 'not-queued';
      target.skippedAt = skippedAt;
      target.skipReason = reason;
      target.startedAt = '';
      target.completedAt = '';
      target.completionErrors = '';
      target.reviewedAt = '';
      target.reviewedBy = '';
      target.reviewMethod = '';
      target.reviewScope = '';
      target.reviewIssues = '';
      target.reviewOutcome = 'pending';
      target.manualChecklist = [];
    });

    try {
      refreshPromptArtifacts();
    } catch {
      // prompts:refresh may report pre-existing audit issues after generating files.
    }

    const updated = readRegistry(__dirname).registry.prompts.find(entry => entry.id === promptId);
    sendJson(res, 200, {
      ok: true,
      prompt: updated,
      skippedAt,
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : String(error) });
  }
}

const server = http.createServer((req, res) => {
  // SharedArrayBuffer requires both of these (COOP + COEP).
  // Mirrors the headers Lichess production servers set on every response.
  res.setHeader('Cross-Origin-Opener-Policy',   'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  const url      = (req.url ?? '/').split('?')[0];
  const method   = req.method ?? 'GET';

  // --- Lichess OAuth endpoints ---
  if (url === '/api/lichess/connect') return startOAuth(req, res);
  if (url === '/oauth/callback')      return handleCallback(req, res);
  if (url === '/api/lichess/status' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getLichessStatus()));
    return;
  }
  if (url === '/api/lichess/disconnect' && method === 'POST') {
    disconnectLichess();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ connected: false }));
    return;
  }

  // --- Opening explorer proxy ---
  // Forwards /api/explorer/:db?... to https://explorer.lichess.ovh/:db?...
  // Uses the Lichess OAuth token from the OAuth flow (falls back to LICHESS_TOKEN env var).
  if (url.startsWith('/api/explorer/')) {
    const db    = url.slice('/api/explorer/'.length);
    const qs    = (req.url ?? '').includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const token = getLichessToken() || process.env.LICHESS_TOKEN || '';
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not connected to Lichess' }));
      return;
    }
    const target = `https://explorer.lichess.ovh/${db}${qs}`;
    https.get(target, {
      headers: { 'User-Agent': 'PatzerPro/1.0', 'Authorization': `Bearer ${token}` },
    }, upstream => {
      res.setHeader('Content-Type', upstream.headers['content-type'] ?? 'application/x-ndjson');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.writeHead(upstream.statusCode ?? 502);
      upstream.pipe(res);
    }).on('error', err => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Explorer proxy error: ${err.message}`);
    });
    return;
  }

  // --- Auth endpoints ---
  if (url === '/api/auth/status' && method === 'GET') {
    return handleAuthStatus(req, res);
  }
  if (url === '/api/auth/logout' && method === 'POST') {
    return handleLogout(req, res);
  }

  // --- Sync endpoints (require auth) ---
  if (url.startsWith('/api/sync/') && handleSyncRoute(url, method, req, res)) return;

  // Prompt dashboard: regenerate from registry and redirect back.
  if (url === '/api/refresh-dashboard') {
    try {
      execSync('npm run dashboard:generate', { cwd: __dirname, timeout: 15000 });
      res.writeHead(302, { Location: '/dashboard' });
      res.end();
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Dashboard generation failed: ' + (e.message ?? e));
    }
    return;
  }

  // Serve the prompt dashboard at /dashboard
  if (url === '/dashboard') {
    if (fs.existsSync(DASHBOARD_PATH)) {
      res.setHeader('Content-Type', MIME['.html']);
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      fs.createReadStream(DASHBOARD_PATH).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Dashboard not generated yet. Run: npm run dashboard:generate');
    }
    return;
  }

  // Serve the UI lookbook at /lookbook
  if (url === '/lookbook') {
    if (fs.existsSync(LOOKBOOK_PATH)) {
      res.setHeader('Content-Type', MIME['.html']);
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      fs.createReadStream(LOOKBOOK_PATH).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Lookbook not generated yet. Run: npm run lookbook:generate');
    }
    return;
  }

  // Serve prompt registry JSON for live dashboard reads
  if (url === '/api/prompt-registry') {
    const regPath = path.join(__dirname, 'docs', 'prompts', 'prompt-registry.json');
    if (fs.existsSync(regPath)) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      fs.createReadStream(regPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('{}');
    }
    return;
  }

  if (url === '/api/sprint-registry') {
    try {
      const data = buildSprintDashboardData(__dirname);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      res.end(JSON.stringify({ sprints: data.sprints }));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }));
    }
    return;
  }

  if (url === '/api/sprint-recompute' && method === 'POST') {
    try {
      refreshSprintArtifacts();
      sendJson(res, 200, { ok: true });
    } catch (err) {
      sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }

  if (url === '/api/sprint-panel-note' && method === 'POST') {
    void handleSprintPanelNoteWrite(req, res, { clear: false });
    return;
  }

  if (url === '/api/sprint-panel-note/clear' && method === 'POST') {
    void handleSprintPanelNoteWrite(req, res, { clear: true });
    return;
  }

  if (url === '/api/prompt-edit' && method === 'POST') {
    void handlePromptEditSave(req, res);
    return;
  }

  if (url === '/api/prompt-skip' && method === 'POST') {
    void handlePromptSkip(req, res);
    return;
  }

  // Serve prompt item files for live dashboard reads
  if (url.startsWith('/api/prompt-item/')) {
    const id = url.slice('/api/prompt-item/'.length);
    const { registry } = readRegistry(__dirname);
    const prompt = registry.prompts.find(entry => entry.id === id);
    if (prompt?.archivedPromptBody) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      res.end(retiredPromptWarningBlock(prompt));
      return;
    }
    const itemPath = path.join(__dirname, 'docs', 'prompts', 'items', `${id}.md`);
    if (fs.existsSync(itemPath)) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');
      res.writeHead(200);
      fs.createReadStream(itemPath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('');
    }
    return;
  }

  const filePath = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));

  // Prevent path traversal outside public/
  if (!filePath.startsWith(PUBLIC + path.sep) && filePath !== PUBLIC) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback — serve index.html for unknown paths so that
    // a hard refresh on any hash route still loads the app.
    const index = path.join(PUBLIC, 'index.html');
    res.setHeader('Content-Type', MIME['.html']);
    res.writeHead(200);
    fs.createReadStream(index).pipe(res);
    return;
  }

  const ext = path.extname(filePath);
  res.setHeader('Content-Type', MIME[ext] ?? 'application/octet-stream');
  res.writeHead(200);
  fs.createReadStream(filePath).pipe(res);

});

// Run database migrations then start listening
runMigrations()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`\nPatzerPro dev server → http://localhost:${PORT}`);
      console.log('COOP + COEP headers active — SharedArrayBuffer available');
      console.log('Multi-threaded Stockfish will be used automatically.\n');
    });
  })
  .catch(err => {
    console.warn('[db] Migration failed (server starting without database):', err.message);
    server.listen(PORT, () => {
      console.log(`\nPatzerPro dev server → http://localhost:${PORT} (no database)`);
    });
  });
