// Generate a standalone HTML dashboard for browsing prompt tracking data.
// Reads from prompt-registry.json and prompt item files.
// Output: docs/prompts/dashboard.html (open locally in browser).

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRegistry, promptFileBody } from './prompt-registry-lib.mjs';

const root = process.cwd();
const { paths, registry } = readRegistry(root);
const prompts = registry.prompts;

// --- Track previous generation timestamp for "new" badges ---
const TIMESTAMP_PATH = resolve(root, 'docs/prompts/.dashboard-last-generated');
let previousGeneratedAt = '';
if (existsSync(TIMESTAMP_PATH)) {
  previousGeneratedAt = readFileSync(TIMESTAMP_PATH, 'utf8').trim();
}

// --- Status label logic ---

function statusLabel(p) {
  if (p.status === 'reviewed') {
    switch (p.reviewOutcome) {
      case 'passed':           return 'REVIEWED: PASSED';
      case 'passed with notes': return 'REVIEWED: PASSED WITH NOTES';
      case 'issues found':     return 'REVIEWED: ISSUES FOUND';
      case 'needs rework':     return 'REVIEWED: NEEDS REWORK';
      default:                 return 'REVIEWED';
    }
  }
  if (p.queueState === 'queued-started') return 'RAN: NEEDS REVIEW';
  if (p.queueState === 'queued-run') return 'RAN: READY FOR REVIEW';
  if (p.queueState === 'queued-pending') return 'READY TO RUN';
  if (p.status === 'created') return 'NOT REVIEWED';
  return p.status?.toUpperCase() ?? 'UNKNOWN';
}

function statusClass(p) {
  if (p.status === 'reviewed') {
    if (p.reviewOutcome === 'passed') return 'status--passed';
    if (p.reviewOutcome === 'passed with notes') return 'status--notes';
    if (p.reviewOutcome === 'issues found') return 'status--issues';
    if (p.reviewOutcome === 'needs rework') return 'status--rework';
    return 'status--reviewed';
  }
  if (p.queueState === 'queued-started') return 'status--started';
  if (p.queueState === 'queued-run') return 'status--run';
  if (p.queueState === 'queued-pending') return 'status--ready';
  return 'status--pending';
}

// --- Load prompt bodies ---

const promptBodies = new Map();
for (const p of prompts) {
  try {
    promptBodies.set(p.id, promptFileBody(root, p));
  } catch {
    promptBodies.set(p.id, '(prompt file not found)');
  }
}

// --- Escape HTML ---

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Build prompt detail JSON for inline JS ---

const promptData = prompts.map(p => ({
  id: p.id,
  title: p.title,
  taskId: p.taskId,
  parentPromptId: p.parentPromptId,
  batchPromptIds: p.batchPromptIds,
  sourceDocument: p.sourceDocument,
  sourceStep: p.sourceStep,
  task: p.task,
  executionTarget: p.executionTarget,
  createdBy: p.createdBy || 'unknown',
  createdAt: p.createdAt || '',
  startedAt: p.startedAt || '',
  status: p.status,
  reviewOutcome: p.reviewOutcome,
  reviewIssues: p.reviewIssues,
  queueState: p.queueState,
  claudeUsed: p.claudeUsed,
  kind: p.kind,
  notes: p.notes,
  statusLabel: statusLabel(p),
  statusClass: statusClass(p),
  body: promptBodies.get(p.id) ?? '',
  isNew: previousGeneratedAt && p.createdAt && new Date(p.createdAt).getTime() > new Date(previousGeneratedAt).getTime(),
}));

// --- Generate HTML ---

const generatedAt = new Date().toISOString();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patzer Pro - Prompt Tracking Dashboard</title>
<style>
:root {
  --bg: #1a1a1a;
  --bg-card: #222;
  --bg-header: #111;
  --text: #e8e8e8;
  --text-dim: #888;
  --border: #333;
  --accent: #4a9;
  --status-passed: #4a9;
  --status-notes: #8b8;
  --status-issues: #c46060;
  --status-rework: #e05555;
  --status-run: #6ba3d6;
  --status-started: #e8a040;
  --status-ready: #9b86d6;
  --status-pending: #666;
}
*, *::before, *::after { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  height: 52px;
  background: var(--bg-header);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}
.header__brand {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  text-decoration: none;
  white-space: nowrap;
}
.header__title {
  font-size: 0.85rem;
  color: var(--text-dim);
}
.header__stats {
  margin-left: auto;
  font-size: 0.8rem;
  color: var(--text-dim);
  display: flex;
  gap: 12px;
  align-items: center;
}
.header__stat { white-space: nowrap; }
.header__stat b { color: var(--text); }
.header__refresh {
  padding: 4px 10px;
  background: var(--bg-card);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.header__refresh:hover { background: var(--accent); color: #111; border-color: var(--accent); }
.header__generated {
  font-size: 0.72rem;
  color: #555;
  white-space: nowrap;
}
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 12px;
}
.toolbar input[type="text"] {
  flex: 1;
  min-width: 200px;
  padding: 6px 10px;
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.85rem;
}
.toolbar input[type="text"]::placeholder { color: var(--text-dim); }
.sort-select {
  padding: 4px 8px;
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  flex-shrink: 0;
}
.sort-select:focus { outline: 1px solid var(--accent); }
.filter-btn {
  padding: 4px 10px;
  background: var(--bg-card);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: background 0.15s;
}
.filter-btn:hover { background: #2a2a2a; }
.filter-btn.active {
  background: var(--accent);
  color: #111;
  border-color: var(--accent);
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
thead th {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 2px solid var(--border);
  color: var(--text-dim);
  font-weight: 600;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
thead th:hover { color: var(--text); }
tbody tr {
  border-bottom: 1px solid #262626;
  cursor: pointer;
  transition: background 0.1s;
}
tbody tr:hover { background: #252525; }
td { padding: 6px 10px; vertical-align: top; }
td.id { font-family: monospace; font-size: 0.82rem; white-space: nowrap; color: var(--accent); }
.id-copy {
  background: none;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  font-size: 0.95rem;
  padding: 2px 6px 2px 0;
  opacity: 0.8;
  transition: opacity 0.15s, color 0.15s;
  vertical-align: middle;
  line-height: 1;
}
.id-copy:hover { opacity: 1; color: var(--accent); }
.id-copy.copied { opacity: 1; color: var(--status-passed); }
td.title { max-width: 360px; }
.row-copy {
  background: #2a2a2a;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  line-height: 1;
  white-space: nowrap;
}
.row-copy:hover { background: var(--accent); color: #111; border-color: var(--accent); }
.row-copy.copied { background: var(--status-passed); color: #111; border-color: var(--status-passed); }
td.actions { text-align: right; width: 1%; white-space: nowrap; }
tr.row--manager {
  background: #1e2228;
  border-left: 3px solid #6ba3d6;
}
tr.row--manager:hover { background: #242a32; }
tr.row--manager td.id { color: #6ba3d6; }
tr.row--manager td.title { font-weight: 600; }
.kind-badge {
  display: inline-block;
  font-size: 0.72rem;
  color: var(--text-dim);
}
.kind-badge--manager {
  background: rgba(107, 163, 214, 0.15);
  color: #6ba3d6;
  border: 1px solid rgba(107, 163, 214, 0.3);
  border-radius: 3px;
  padding: 1px 6px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.new-badge {
  display: inline-block;
  background: #e8a735;
  color: #111;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 1px 4px;
  border-radius: 3px;
  margin-left: 5px;
  vertical-align: middle;
  line-height: 1.3;
}
.batch-hint {
  display: inline-block;
  font-size: 0.72rem;
  color: #6ba3d6;
  margin-left: 8px;
  opacity: 0.7;
}
td.date { font-size: 0.78rem; color: var(--text-dim); white-space: nowrap; }
td.source { font-size: 0.78rem; color: var(--text-dim); max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
td.kind { font-size: 0.78rem; color: var(--text-dim); }
.status-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.status--passed  { background: var(--status-passed); color: #111; }
.status--notes   { background: var(--status-notes); color: #111; }
.status--issues  { background: var(--status-issues); color: #111; }
.status--rework  { background: var(--status-rework); color: #fff; }
.status--run     { background: var(--status-run); color: #111; }
.status--started { background: var(--status-started); color: #111; }
.status--ready   { background: var(--status-ready); color: #111; }
.status--pending { background: var(--status-pending); color: #ddd; }
.status--reviewed { background: #555; color: #ddd; }
.count-label { font-size: 0.78rem; color: var(--text-dim); margin-top: 8px; }

/* Detail overlay */
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 100;
  display: flex;
  justify-content: center;
  overflow-y: auto;
  padding: 24px 16px;
}
.detail-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 800px;
  width: 100%;
  margin: auto;
  padding: 0;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.detail-header h2 {
  margin: 0;
  font-size: 1.1rem;
  flex: 1;
}
.detail-close {
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.3rem;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
}
.detail-close:hover { color: var(--text); }
.detail-id-copy {
  background: var(--bg-card);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  vertical-align: middle;
  margin-left: 8px;
}
.detail-id-copy:hover { background: var(--accent); color: #111; border-color: var(--accent); }
.detail-id-copy.copied { background: var(--status-passed); color: #111; border-color: var(--status-passed); }
.detail-body { padding: 16px 20px; }
.detail-meta {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 4px 12px;
  font-size: 0.85rem;
  margin-bottom: 16px;
}
.detail-meta dt { color: var(--text-dim); font-weight: 600; }
.detail-meta dd { margin: 0; word-break: break-word; }
.detail-section {
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}
.detail-section h3 {
  margin: 0 0 8px;
  font-size: 0.9rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.detail-body .pre-wrap {
  position: relative;
}
.detail-body pre {
  background: #181818;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 12px;
  overflow-x: auto;
  font-size: 0.82rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #ccc;
  max-height: 400px;
  overflow-y: auto;
}
.copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  background: #2a2a2a;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 7px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  z-index: 1;
}
.copy-btn:hover { background: var(--accent); color: #111; border-color: var(--accent); }
.copy-btn.copied { background: var(--status-passed); color: #111; border-color: var(--status-passed); }

@media (max-width: 700px) {
  .header { flex-wrap: wrap; height: auto; padding: 8px 12px; gap: 6px; }
  .header__stats { margin-left: 0; flex-wrap: wrap; }
  .container { padding: 10px; }
  .detail-meta { grid-template-columns: 1fr; }
  .detail-meta dt { margin-top: 6px; }
  td.title { max-width: none; }
}
</style>
</head>
<body>

<div class="header">
  <a class="header__brand" href="#">Patzer Pro</a>
  <span class="header__title">Prompt Tracking Dashboard</span>
  <div class="header__stats" id="stats"></div>
  <span class="header__generated">Updated ${new Date(generatedAt).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}</span>
  <button class="header__refresh" id="refresh-btn" title="Regenerate dashboard from latest registry data">Refresh Data</button>
</div>

<div class="container">
  <div class="toolbar">
    <input type="text" id="search" placeholder="Filter by ID, title, or task...">
    <div id="filter-buttons"></div>
    <select id="sort-select" class="sort-select"></select>
  </div>
  <table>
    <thead>
      <tr>
        <th>ID</th>
        <th>Title</th>
        <th>Date</th>
        <th>Source</th>
        <th>Kind</th>
        <th>Status</th>
        <th></th>
      </tr>
    </thead>
    <tbody id="prompt-list"></tbody>
  </table>
  <div class="count-label" id="count-label"></div>
</div>

<div class="detail-overlay" id="detail" style="display:none">
  <div class="detail-card">
    <div class="detail-header">
      <h2 id="detail-title"></h2>
      <button class="detail-close" id="detail-close">&times;</button>
    </div>
    <div class="detail-body" id="detail-body"></div>
  </div>
</div>

<script>
let PROMPTS = ${JSON.stringify(promptData)};

// --- Live data fetch (dev server only) ---
// When served via the dev server, fetch the registry live so the dashboard
// always shows current data without needing regeneration.
async function fetchLiveData() {
  if (location.protocol === 'file:') return; // static file — use baked data
  try {
    const res = await fetch('/api/prompt-registry');
    if (!res.ok) return;
    const registry = await res.json();
    if (!Array.isArray(registry.prompts)) return;

    // Rebuild PROMPTS from live registry
    const livePrompts = [];
    for (const p of registry.prompts) {
      // Fetch prompt body
      let body = '';
      try {
        const itemRes = await fetch('/api/prompt-item/' + p.id);
        if (itemRes.ok) body = await itemRes.text();
      } catch {}

      livePrompts.push({
        id: p.id,
        title: p.title || '',
        taskId: p.taskId || '',
        parentPromptId: p.parentPromptId,
        batchPromptIds: p.batchPromptIds || [],
        sourceDocument: p.sourceDocument || '',
        sourceStep: p.sourceStep || '',
        task: p.task || '',
        executionTarget: p.executionTarget || '',
        createdBy: p.createdBy || 'unknown',
        createdAt: p.createdAt || '',
        startedAt: p.startedAt || '',
        status: p.status || 'created',
        reviewOutcome: p.reviewOutcome || 'pending',
        reviewIssues: p.reviewIssues || 'none',
        queueState: p.queueState || 'not-queued',
        claudeUsed: p.claudeUsed || false,
        kind: p.kind || 'normal',
        notes: p.notes || 'none',
        statusLabel: computeStatusLabel(p),
        statusClass: computeStatusClass(p),
        body: body,
        isNew: false, // live mode doesn't track new-since-last-refresh
      });
    }
    PROMPTS = livePrompts;
    renderStats();
    renderFilterButtons();
    renderList();
    // Update the timestamp display
    const genEl = document.querySelector('.header__generated');
    if (genEl) genEl.textContent = 'Live data';
  } catch (e) {
    console.warn('[dashboard] live fetch failed, using baked data', e);
  }
}

function computeStatusLabel(p) {
  if (p.status === 'reviewed') {
    switch (p.reviewOutcome) {
      case 'passed': return 'REVIEWED: PASSED';
      case 'passed with notes': return 'REVIEWED: PASSED WITH NOTES';
      case 'issues found': return 'REVIEWED: ISSUES FOUND';
      case 'needs rework': return 'REVIEWED: NEEDS REWORK';
      default: return 'REVIEWED';
    }
  }
  if (p.queueState === 'queued-started') return 'RAN: NEEDS REVIEW';
  if (p.queueState === 'queued-run') return 'RAN: READY FOR REVIEW';
  if (p.queueState === 'queued-pending') return 'READY TO RUN';
  if (p.status === 'created') return 'NOT REVIEWED';
  return (p.status || '').toUpperCase() || 'UNKNOWN';
}

function computeStatusClass(p) {
  if (p.status === 'reviewed') {
    if (p.reviewOutcome === 'passed') return 'status--passed';
    if (p.reviewOutcome === 'passed with notes') return 'status--notes';
    if (p.reviewOutcome === 'issues found') return 'status--issues';
    if (p.reviewOutcome === 'needs rework') return 'status--rework';
    return 'status--reviewed';
  }
  if (p.queueState === 'queued-started') return 'status--started';
  if (p.queueState === 'queued-run') return 'status--run';
  if (p.queueState === 'queued-pending') return 'status--ready';
  return 'status--pending';
}

// --- Date formatting (Pacific time, human-readable) ---
function fmtDate(iso) {
  if (!iso || iso === 'unknown' || iso === 'not started') return iso || '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}
function fmtDateShort(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso.slice(0, 10);
    const now = Date.now();
    const ago = now - d.getTime();
    if (ago >= 0 && ago < 86400000) {
      const mins = Math.floor(ago / 60000);
      if (mins < 1) return 'just now';
      if (mins < 60) return mins + 'm ago';
      const hrs = Math.floor(mins / 60);
      return hrs + 'h ago';
    }
    return d.toLocaleDateString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short', day: 'numeric',
    });
  } catch { return iso.slice(0, 10); }
}

// --- State ---
let filterStatus = '';
let searchText = '';
let sortPreset = 'next-up';

// --- Stats ---
function renderStats() {
  const total = PROMPTS.length;
  const reviewed = PROMPTS.filter(p => p.status === 'reviewed').length;
  const run = PROMPTS.filter(p => p.queueState === 'queued-run').length;
  const started = PROMPTS.filter(p => p.queueState === 'queued-started').length;
  const ready = PROMPTS.filter(p => p.queueState === 'queued-pending').length;
  document.getElementById('stats').innerHTML =
    '<span class="header__stat"><b>' + total + '</b> total</span>' +
    '<span class="header__stat"><b>' + reviewed + '</b> reviewed</span>' +
    '<span class="header__stat"><b>' + started + '</b> started</span>' +
    '<span class="header__stat"><b>' + run + '</b> run</span>' +
    '<span class="header__stat"><b>' + ready + '</b> ready</span>';
}

// --- Filter buttons ---
const STATUS_FILTERS = [
  { label: 'All', value: '' },
  { label: 'Ready', value: 'status--ready' },
  { label: 'Ran', value: 'status--started' },
  { label: 'Ran: Review', value: 'status--run' },
  { label: 'Passed', value: 'status--passed' },
  { label: 'Issues', value: 'status--issues' },
  { label: 'Pending', value: 'status--pending' },
];

function renderFilterButtons() {
  const el = document.getElementById('filter-buttons');
  el.innerHTML = STATUS_FILTERS.map(f =>
    '<button class="filter-btn' + (filterStatus === f.value ? ' active' : '') +
    '" data-filter="' + f.value + '">' + f.label + '</button>'
  ).join('');
  el.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      filterStatus = btn.dataset.filter;
      renderFilterButtons();
      renderList();
    });
  });
}

// --- Sort presets ---
function idNum(p) { return parseInt(p.id.replace(/\\D/g, '')) || 0; }

// Priority rank for "next up" sort: lower = higher priority.
// Ranks 0-2 are queue items that always float to the top.
// Everything else collapses to rank 3 and sorts by recency.
function nextUpRank(p) {
  if (p.queueState === 'queued-pending') return 0; // ready to run — top
  if (p.queueState === 'queued-started') return 1; // in progress
  if (p.queueState === 'queued-run')     return 2; // run, awaiting review
  return 3; // all non-queue items: sort by recency within this rank
}

// Best available date for recency sorting (prefer startedAt, fall back to createdAt)
function bestDate(p) {
  return p.startedAt || p.createdAt || '';
}

const SORT_PRESETS = [
  { value: 'next-up',     label: 'Next Up' },
  { value: 'id-newest',   label: 'ID (newest first)' },
  { value: 'id-oldest',   label: 'ID (oldest first)' },
  { value: 'date-newest',  label: 'Date (newest first)' },
  { value: 'date-oldest',  label: 'Date (oldest first)' },
  { value: 'title-az',    label: 'Title (A-Z)' },
  { value: 'title-za',    label: 'Title (Z-A)' },
  { value: 'status',      label: 'Status' },
  { value: 'kind',        label: 'Kind' },
  { value: 'source',      label: 'Source Document' },
];

function sortPrompts(list) {
  return [...list].sort((a, b) => {
    switch (sortPreset) {
      case 'next-up': {
        const ra = nextUpRank(a), rb = nextUpRank(b);
        if (ra !== rb) return ra - rb;
        // Queue items (ranks 0-2): earliest ID first
        if (ra < 3) return idNum(a) - idNum(b);
        // Non-queue items (rank 3): most recent first by date, then highest ID
        const da = bestDate(a), db = bestDate(b);
        if (da || db) {
          const cmp = (db || '').localeCompare(da || '');
          if (cmp !== 0) return cmp;
        }
        return idNum(b) - idNum(a);
      }
      case 'id-newest':  return idNum(b) - idNum(a);
      case 'id-oldest':  return idNum(a) - idNum(b);
      case 'date-newest': return (b.startedAt || b.createdAt || '').localeCompare(a.startedAt || a.createdAt || '') || idNum(b) - idNum(a);
      case 'date-oldest': return (a.startedAt || a.createdAt || '').localeCompare(b.startedAt || b.createdAt || '') || idNum(a) - idNum(b);
      case 'title-az':   return a.title.localeCompare(b.title);
      case 'title-za':   return b.title.localeCompare(a.title);
      case 'status':     return a.statusLabel.localeCompare(b.statusLabel) || idNum(a) - idNum(b);
      case 'kind':       return (a.kind || '').localeCompare(b.kind || '') || idNum(a) - idNum(b);
      case 'source':     return (a.sourceDocument || '').localeCompare(b.sourceDocument || '') || idNum(a) - idNum(b);
      default:           return 0;
    }
  });
}

// --- Render list ---
function filterPrompts() {
  let list = PROMPTS;
  if (filterStatus) list = list.filter(p => p.statusClass === filterStatus);
  if (searchText) {
    const q = searchText.toLowerCase();
    list = list.filter(p =>
      p.id.toLowerCase().includes(q) ||
      p.title.toLowerCase().includes(q) ||
      (p.task || '').toLowerCase().includes(q)
    );
  }
  return sortPrompts(list);
}

function renderList() {
  const list = filterPrompts();
  const tbody = document.getElementById('prompt-list');
  tbody.innerHTML = list.map(p => {
    // Show a short source label: just the filename without path
    const srcShort = (p.sourceDocument || '').split('/').pop() || '';
    // Show copy button only for prompts not yet run or reviewed
    const showCopy = p.status !== 'reviewed' && p.queueState !== 'queued-run';
    const copyCell = showCopy
      ? '<button class="row-copy" data-copy-id="' + esc(p.id) + '" title="Copy full prompt">Copy</button>'
      : '';
    const isManager = p.kind === 'manager';
    const rowClass = isManager ? ' class="row--manager"' : '';
    const kindLabel = isManager
      ? '<span class="kind-badge kind-badge--manager">manager</span>'
      : '<span class="kind-badge">' + esc(p.kind || 'normal') + '</span>';
    const batchHint = isManager && p.batchPromptIds && p.batchPromptIds.length
      ? '<span class="batch-hint">' + p.batchPromptIds.length + ' prompts</span>'
      : '';
    const newBadge = p.isNew ? '<span class="new-badge">new</span>' : '';
    // Show startedAt if ran, otherwise createdAt
    const dateRaw = p.startedAt || p.createdAt || '';
    const dateLabel = fmtDateShort(dateRaw);
    const dateTitle = p.startedAt ? 'Ran: ' + fmtDate(p.startedAt) : (p.createdAt ? 'Created: ' + fmtDate(p.createdAt) : '');
    return '<tr data-id="' + p.id + '"' + rowClass + '>' +
      '<td class="id"><button class="id-copy" data-id="' + esc(p.id) + '" title="Copy prompt ID">&#x2398;</button>' + p.id + newBadge + '</td>' +
      '<td class="title">' + esc(p.title) + batchHint + '</td>' +
      '<td class="date" title="' + esc(dateTitle) + '">' + esc(dateLabel) + '</td>' +
      '<td class="source">' + esc(srcShort) + '</td>' +
      '<td class="kind">' + kindLabel + '</td>' +
      '<td><span class="status-badge ' + p.statusClass + '">' + p.statusLabel + '</span></td>' +
      '<td class="actions">' + copyCell + '</td>' +
      '</tr>';
  }).join('');
  document.getElementById('count-label').textContent = list.length + ' of ' + PROMPTS.length + ' prompts';
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.row-copy') || e.target.closest('.id-copy')) return; // handled separately
      openDetail(tr.dataset.id);
    });
  });
  tbody.querySelectorAll('.row-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = PROMPTS.find(x => x.id === btn.dataset.copyId);
      if (!p) return;
      navigator.clipboard.writeText(p.body).then(() => {
        btn.classList.add('copied');
        btn.textContent = '\u2713';
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '\u2398'; }, 1200);
      });
    });
  });
  tbody.querySelectorAll('.id-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.id).then(() => {
        btn.classList.add('copied');
        btn.textContent = '\u2713';
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = '\u2398'; }, 1200);
      });
    });
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// --- Detail ---
function openDetail(id) {
  const p = PROMPTS.find(x => x.id === id);
  if (!p) return;
  document.getElementById('detail-title').innerHTML = esc(p.id) + ' <button class="detail-id-copy" data-id="' + esc(p.id) + '" title="Copy prompt ID">Copy ID</button> <span style="color:var(--text-dim);font-weight:400">— ' + esc(p.title) + '</span>';
  const meta = [
    ['Prompt ID', p.id],
    ['Task ID', p.taskId],
    ['Status', '<span class="status-badge ' + p.statusClass + '">' + p.statusLabel + '</span>'],
    ['Kind', p.kind || 'normal'],
    ['Source', esc(p.sourceDocument || '')],
    ['Source Step', esc(p.sourceStep || '')],
    ['Created By', esc(p.createdBy || 'unknown')],
    ['Created At', esc(fmtDate(p.createdAt) || 'unknown')],
    ['Started At', esc(fmtDate(p.startedAt) || 'not started')],
    ['Execution Target', esc(p.executionTarget || '')],
    ['Claude Used', p.claudeUsed ? 'Yes' : 'No'],
    ['Review Outcome', esc(p.reviewOutcome || 'pending')],
    ['Review Issues', esc(p.reviewIssues || 'none')],
  ];
  if (p.parentPromptId) meta.push(['Parent Prompt', esc(p.parentPromptId)]);
  if (p.batchPromptIds && p.batchPromptIds.length) meta.push(['Batch Prompts', esc(p.batchPromptIds.join(', '))]);
  if (p.notes && p.notes !== 'none') meta.push(['Notes', esc(p.notes)]);

  let html = '<dl class="detail-meta">';
  meta.forEach(([k, v]) => { html += '<dt>' + k + '</dt><dd>' + v + '</dd>'; });
  html += '</dl>';

  html += '<div class="detail-section"><h3>Task</h3><p>' + esc(p.task || '') + '</p></div>';
  html += '<div class="detail-section"><h3>Full Prompt</h3><div class="pre-wrap"><button class="copy-btn" data-copy-id="' + p.id + '">Copy</button><pre id="prompt-body-' + p.id + '">' + esc(p.body) + '</pre></div></div>';

  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail').style.display = 'flex';
}

// Copy prompt body to clipboard
document.getElementById('detail-body').addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  const id = btn.dataset.copyId;
  const pre = document.getElementById('prompt-body-' + id);
  if (!pre) return;
  navigator.clipboard.writeText(pre.textContent).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
  });
});

document.getElementById('detail').addEventListener('click', (e) => {
  const btn = e.target.closest('.detail-id-copy');
  if (!btn) return;
  navigator.clipboard.writeText(btn.dataset.id).then(() => {
    btn.classList.add('copied');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.classList.remove('copied'); btn.textContent = 'Copy ID'; }, 1200);
  });
});

document.getElementById('detail-close').addEventListener('click', () => {
  document.getElementById('detail').style.display = 'none';
});
document.getElementById('detail').addEventListener('click', (e) => {
  if (e.target === document.getElementById('detail')) {
    document.getElementById('detail').style.display = 'none';
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') document.getElementById('detail').style.display = 'none';
});

// --- Search ---
document.getElementById('search').addEventListener('input', (e) => {
  searchText = e.target.value;
  renderList();
});

// --- Sort select ---
const sortSelect = document.getElementById('sort-select');
SORT_PRESETS.forEach(p => {
  const opt = document.createElement('option');
  opt.value = p.value;
  opt.textContent = p.label;
  if (p.value === sortPreset) opt.selected = true;
  sortSelect.appendChild(opt);
});
sortSelect.addEventListener('change', () => {
  sortPreset = sortSelect.value;
  renderList();
});

// --- Refresh button ---
document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = 'Refreshing...';
  btn.disabled = true;
  if (location.protocol === 'file:') {
    alert('To refresh, run in your terminal:\\n\\nnpm run prompts:dashboard\\n\\nThen reload this page.');
    btn.textContent = 'Refresh Data';
    btn.disabled = false;
  } else {
    // Live mode: re-fetch registry data directly
    fetchLiveData().then(() => {
      btn.textContent = 'Refresh Data';
      btn.disabled = false;
    });
  }
});

// --- Init ---
renderStats();
renderFilterButtons();
renderList();
// Fetch live data from dev server (replaces baked data if available)
fetchLiveData();
</script>

</body>
</html>`;

const outPath = resolve(root, 'docs/prompts/dashboard.html');
writeFileSync(outPath, html);

// Save generation timestamp so the next run can mark new prompts.
writeFileSync(TIMESTAMP_PATH, generatedAt);

const newCount = promptData.filter(p => p.isNew).length;
console.log(`Generated prompt dashboard: ${outPath}`);
console.log(`${prompts.length} prompts indexed.${newCount ? ` (${newCount} new since last refresh)` : ''}`);
