// Generate a standalone HTML dashboard for browsing prompt tracking data.
// Reads from prompt-registry.json and prompt item files.
// Output: docs/prompts/dashboard.html (open locally in browser).

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRegistry, promptFileBody } from './prompt-registry-lib.mjs';
import { buildSprintDashboardData } from './sprint-registry-lib.mjs';

const root = process.cwd();
const { paths, registry } = readRegistry(root);
const prompts = registry.prompts;
const sprintDashboard = buildSprintDashboardData(root);
const sprints = sprintDashboard.sprints;

// --- Track previous generation timestamp for "new" badges ---
const TIMESTAMP_PATH = resolve(root, 'docs/prompts/.dashboard-last-generated');
let previousGeneratedAt = '';
if (existsSync(TIMESTAMP_PATH)) {
  previousGeneratedAt = readFileSync(TIMESTAMP_PATH, 'utf8').trim();
}

// --- Status label logic ---

function statusLabel(p) {
  if (p.status === 'reserved') {
    return p.reservationReleasedAt ? 'RESERVED: RELEASED' : 'RESERVED';
  }
  if (p.status === 'reviewed') {
    switch (p.reviewOutcome) {
      case 'passed':           return 'REVIEWED: PASSED';
      case 'passed with notes': return 'REVIEWED: PASSED WITH NOTES';
      case 'issues found':     return 'REVIEWED: ISSUES FOUND';
      case 'needs rework':     return 'REVIEWED: NEEDS REWORK';
      default:                 return 'REVIEWED';
    }
  }
  if (p.queueState === 'queued-started') return 'STARTED: NOT COMPLETED';
  if (p.queueState === 'queued-run' && p.completionErrors) return 'COMPLETED WITH ERRORS: NEEDS REVIEW';
  if (p.queueState === 'queued-run') return 'COMPLETED: NEEDS REVIEW';
  if (p.queueState === 'queued-pending') return 'READY TO RUN';
  if (p.status === 'created') return 'NOT REVIEWED';
  return p.status?.toUpperCase() ?? 'UNKNOWN';
}

function statusClass(p) {
  if (p.status === 'reserved') {
    return p.reservationReleasedAt ? 'status--released' : 'status--reserved';
  }
  if (p.status === 'reviewed') {
    if (p.reviewOutcome === 'passed') return 'status--passed';
    if (p.reviewOutcome === 'passed with notes') return 'status--notes';
    if (p.reviewOutcome === 'issues found') return 'status--issues';
    if (p.reviewOutcome === 'needs rework') return 'status--rework';
    return 'status--reviewed';
  }
  if (p.queueState === 'queued-started') return 'status--started';
  if (p.queueState === 'queued-run' && p.completionErrors) return 'status--run-errors';
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
  reservationReleasedAt: p.reservationReleasedAt || '',
  priority: p.priority || 'normal',
  category: p.category || '',
  completedAt: p.completedAt || '',
  completionErrors: p.completionErrors || '',
  manualChecklist: p.manualChecklist || [],
  fixPromptSuggestion: p.fixPromptSuggestion || '',
  fixesPromptId: p.fixesPromptId || '',
  fixedByPromptId: p.fixedByPromptId || '',
  sprintId: p.sprintId || '',
  sprintPhaseId: p.sprintPhaseId || '',
  sprintTaskId: p.sprintTaskId || '',
  statusLabel: statusLabel(p),
  statusClass: statusClass(p),
  body: promptBodies.get(p.id) ?? '',
  isNew: previousGeneratedAt && p.createdAt && new Date(p.createdAt).getTime() > new Date(previousGeneratedAt).getTime(),
}));

const sprintData = sprints.map(sprint => ({
  id: sprint.id,
  title: sprint.title,
  sourceDocument: sprint.sourceDocument,
  status: sprint.status,
  createdAt: sprint.createdAt || '',
  updatedAt: sprint.updatedAt || '',
  dependencySprintIds: sprint.dependencySprintIds || [],
  auditRefs: sprint.auditRefs || [],
  recommendedNextSteps: sprint.recommendedNextSteps || [],
  completionSummary: sprint.completionSummary || '',
  planCoveragePct: sprint.planCoveragePct,
  executionPct: sprint.executionPct,
  implementationPct: sprint.implementationPct,
  totalTasks: sprint.totalTasks,
  promptsLinkedCount: sprint.promptsLinkedCount,
  promptsUnreviewedCount: sprint.promptsUnreviewedCount,
  unassignedPromptIds: sprint.unassignedPromptIds || [],
  progress: sprint.progress,
  phases: sprint.phases.map(phase => ({
    id: phase.id,
    title: phase.title,
    order: phase.order,
    status: phase.status,
    dependencyPhaseIds: phase.dependencyPhaseIds || [],
    tasks: phase.tasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      sourceAnchor: task.sourceAnchor || '',
      notes: task.notes || '',
      linkedPromptIds: task.linkedPromptIds || [],
      executionState: task._execution.executionState,
      promptCount: task._execution.promptCount,
      promptReviewedCount: task._execution.promptReviewedCount,
      promptUnreviewedCount: task._execution.promptUnreviewedCount,
    })),
  })),
}));

// --- Generate HTML ---

const generatedAt = new Date().toISOString();

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Patzer Pro - Tracking Dashboard</title>
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
  --status-reserved: #5577a8;
  --status-released: #505050;
  --tab-bg: #151515;
  --bar-planned: #444;
  --bar-created: #5f7ea6;
  --bar-started: #d39545;
  --bar-completed: #57a8c9;
  --bar-passed: #4a9;
  --bar-notes: #a3b56a;
  --bar-issues: #d06262;
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
.header__refresh {
  margin-left: auto;
  padding: 6px 16px;
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid #444;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.header__refresh:hover { background: var(--accent); color: #111; border-color: var(--accent); }
.header__refresh.is-stale { border-color: #b8860b; color: #f0a500; }
/* --- Refresh modal --- */
.refresh-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 100;
  align-items: center;
  justify-content: center;
}
.refresh-backdrop.is-open { display: flex; }
.refresh-modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 100%;
  max-width: 620px;
  margin: 16px;
  padding: 24px;
  position: relative;
}
.refresh-modal__close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  color: var(--text-dim);
  font-size: 1.2rem;
  cursor: pointer;
  line-height: 1;
  padding: 2px 6px;
}
.refresh-modal__close:hover { color: var(--text); }
.refresh-modal__title {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
}
.refresh-modal__subtitle {
  font-size: 0.8rem;
  color: var(--text-dim);
  margin: 0 0 20px;
}
.refresh-modal__panels {
  display: flex;
  gap: 16px;
}
@media (max-width: 520px) {
  .refresh-modal__panels { flex-direction: column; }
}
.refresh-panel {
  flex: 1;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 16px;
}
.refresh-panel__heading {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
  margin: 0 0 4px;
}
.refresh-panel__desc {
  font-size: 0.75rem;
  color: var(--text-dim);
  margin: 0 0 10px;
}
.refresh-panel__note {
  font-size: 0.72rem;
  color: var(--text-dim);
  margin: 8px 0 0;
  font-style: italic;
}
.refresh-panel__label {
  font-size: 0.72rem;
  color: var(--text-dim);
  margin: 10px 0 4px;
}
.code-row {
  display: flex;
  align-items: center;
  background: #181818;
  border: 1px solid #2a2a2a;
  border-radius: 4px;
  padding: 6px 8px;
  gap: 8px;
}
.code-row code {
  flex: 1;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.78rem;
  color: var(--text);
  word-break: break-all;
}
/* Override absolute positioning from generic .copy-btn for modal code rows */
.code-row .copy-btn {
  position: static;
  flex-shrink: 0;
  padding: 2px 7px;
  font-size: 0.7rem;
  white-space: nowrap;
}
/* --- Urgent block --- */
#urgent-block {
  display: none;
  border-left: 3px solid #e8a040;
  background: rgba(232, 160, 64, 0.06);
  border-radius: 0 6px 6px 0;
  margin-bottom: 16px;
  padding: 12px 16px;
}
#urgent-block.is-visible { display: block; }
.urgent-block__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  font-size: 0.8rem;
  font-weight: 700;
  color: #e8a040;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.urgent-block__count {
  font-weight: 400;
  color: var(--text-dim);
  text-transform: none;
  letter-spacing: 0;
}
.urgent-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid rgba(255,255,255,0.05);
  cursor: pointer;
  font-size: 0.82rem;
}
.urgent-row:hover { background: rgba(255,255,255,0.03); margin: 0 -16px; padding-left: 16px; padding-right: 16px; }
.urgent-row:first-child { border-top: none; }
.urgent-row__id {
  font-weight: 600;
  color: var(--text-dim);
  white-space: nowrap;
  min-width: 70px;
}
.urgent-row__title {
  flex: 1;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.urgent-row__meta {
  font-size: 0.72rem;
  color: var(--text-dim);
  white-space: nowrap;
}
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 16px;
}
.tabs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.tabs__bulk-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
.bulk-copy-btn {
  background: var(--bg-card);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.75rem;
  padding: 4px 10px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.bulk-copy-btn:hover { background: #2a2a2a; color: var(--text); }
.bulk-copy-btn.copied { color: var(--accent); border-color: var(--accent); }
.bulk-copy-btn.empty { color: var(--text-dim); border-color: var(--border); }
.tab-btn {
  padding: 6px 12px;
  background: var(--tab-bg);
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 0.82rem;
  cursor: pointer;
}
.tab-btn.active {
  background: var(--accent);
  color: #111;
  border-color: var(--accent);
}
.panel[hidden] { display: none; }
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
/* Sticky last two columns (Status + actions) */
thead th:nth-last-child(1),
thead th:nth-last-child(2),
td:nth-last-child(1),
td:nth-last-child(2) {
  position: sticky;
  background: #1a1a1a;
}
thead th:nth-last-child(1),
td:nth-last-child(1) { right: 0; }
thead th:nth-last-child(2),
td:nth-last-child(2) { right: 62px; border-left: 1px solid #2a2a2a; }
tbody tr:hover td:nth-last-child(1),
tbody tr:hover td:nth-last-child(2) { background: #252525; }
tr.row--manager td:nth-last-child(1),
tr.row--manager td:nth-last-child(2) { background: #1e2228; }
tr.row--manager:hover td:nth-last-child(1),
tr.row--manager:hover td:nth-last-child(2) { background: #252a32; }
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
.status--run-errors { background: #cc3333; color: #fff; }
.status--started { background: var(--status-started); color: #111; }
.status--ready   { background: var(--status-ready); color: #111; }
.status--pending { background: var(--status-pending); color: #ddd; }
.status--reserved { background: var(--status-reserved); color: #fff; }
.status--released { background: var(--status-released); color: #ddd; }
.status--reviewed { background: #555; color: #ddd; }

/* Priority badges */
.priority-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  margin-right: 4px;
}
.priority--critical { background: #cc3333; color: #fff; }
.priority--high     { background: #e08030; color: #111; }
.priority--normal   { background: transparent; color: transparent; font-size: 0; padding: 0; margin: 0; }
.priority--low      { background: #444; color: #999; }

/* Category badges */
.category-badge {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  margin-right: 4px;
}
.cat--bugfix    { background: #8b2020; color: #fcc; }
.cat--typecheck { background: #6b3080; color: #e8d0f8; }
.cat--wiring    { background: #806020; color: #ffe8a0; }
.cat--feature   { background: #206040; color: #a0f0c0; }
.cat--refactor  { background: #205080; color: #a0d0f0; }
.cat--research  { background: #505050; color: #ccc; }
.cat--manager   { background: #404060; color: #c0c0e0; }
.cat--polish    { background: #404040; color: #bbb; }
.count-label { font-size: 0.78rem; color: var(--text-dim); margin-top: 8px; }
.sprint-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.sprint-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}
.sprint-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
}
.sprint-card:hover { border-color: #4b4b4b; }
.sprint-card__top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.sprint-card__title {
  font-size: 0.95rem;
  font-weight: 700;
}
.sprint-card__doc,
.sprint-card__meta {
  color: var(--text-dim);
  font-size: 0.78rem;
}
.sprint-status {
  padding: 3px 8px;
  border-radius: 999px;
  font-size: 0.72rem;
  border: 1px solid var(--border);
  background: #2a2a2a;
  white-space: nowrap;
}
.sprint-status--active,
.sprint-status--needs-review { color: #e4d293; border-color: #7a6940; }
.sprint-status--implementation-partial { color: #87c2df; border-color: #416b82; }
.sprint-status--blocked { color: #f08f8f; border-color: #8b4747; }
.sprint-status--completed { color: #90d0a8; border-color: #3c6a4b; }
.sprint-status--completed-with-issues { color: #d3b06d; border-color: #7e6536; }
.sprint-status--archived { color: #a4a4a4; border-color: #5d5d5d; }
.progress-stack {
  display: grid;
  gap: 8px;
  margin: 10px 0;
}
.progress-labels {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.74rem;
  color: var(--text-dim);
}
.progress-bar {
  display: flex;
  height: 10px;
  border-radius: 999px;
  overflow: hidden;
  background: #111;
  border: 1px solid var(--border);
}
.progress-seg--planned { background: var(--bar-planned); }
.progress-seg--promptCreated { background: var(--bar-created); }
.progress-seg--started { background: var(--bar-started); }
.progress-seg--completed { background: var(--bar-completed); }
.progress-seg--reviewedPassed { background: var(--bar-passed); }
.progress-seg--reviewedWithNotes { background: var(--bar-notes); }
.progress-seg--issuesFound { background: var(--bar-issues); }
.sprint-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.sprint-pill {
  font-size: 0.72rem;
  color: var(--text-dim);
  background: #1a1a1a;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 8px;
}
.sprint-section { margin-top: 14px; }
.sprint-detail-phase {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  margin-top: 12px;
}
.sprint-task-list {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}
.sprint-task {
  background: #1a1a1a;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
}
.sprint-task__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.sprint-task__meta {
  margin-top: 6px;
  color: var(--text-dim);
  font-size: 0.76rem;
}
.sprint-link-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}
.sprint-link {
  display: inline-block;
  background: #232323;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.72rem;
}

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
  <span class="header__title">Tracking Dashboard</span>
  <button class="header__refresh" id="refresh-btn" title="Regenerate dashboard from latest registry data">Refresh Data</button>
</div>

<!-- Refresh options modal (shown when opened via file://) -->
<div class="refresh-backdrop" id="refresh-backdrop">
  <div class="refresh-modal" role="dialog" aria-modal="true" aria-labelledby="refresh-modal-title">
    <button class="refresh-modal__close" id="refresh-modal-close" aria-label="Close">&#x2715;</button>
    <p class="refresh-modal__title" id="refresh-modal-title">Refresh Options</p>
    <p class="refresh-modal__subtitle">Opened via file:// &mdash; live refresh is unavailable. Choose an option below.</p>
    <div class="refresh-modal__panels">
      <div class="refresh-panel">
        <p class="refresh-panel__heading">Rebuild &amp; Reload</p>
        <p class="refresh-panel__desc">Run this command in your terminal, then reload the page.</p>
        <div class="code-row">
          <code>npm run dashboard:generate</code>
          <button class="copy-btn" data-copy="npm run dashboard:generate">Copy</button>
        </div>
        <p class="refresh-panel__note">Then reload this page.</p>
      </div>
      <div class="refresh-panel">
        <p class="refresh-panel__heading">Use Live Server <span style="font-size:0.7rem;color:var(--accent);font-weight:400;">(Recommended)</span></p>
        <p class="refresh-panel__desc">Start the dev server to get live auto-refresh.</p>
        <div class="code-row">
          <code>node server.mjs</code>
          <button class="copy-btn" data-copy="node server.mjs">Copy</button>
        </div>
        <p class="refresh-panel__label">Then open:</p>
        <div class="code-row">
          <code>http://localhost:3001/docs/prompts/dashboard.html</code>
          <button class="copy-btn" data-copy="http://localhost:3001/docs/prompts/dashboard.html">Copy</button>
        </div>
        <p class="refresh-panel__note">Live mode fetches registry data directly &mdash; no rebuild needed.</p>
      </div>
    </div>
  </div>
</div>

<div class="container">
  <div class="tabs">
    <button class="tab-btn active" data-tab="prompts">Prompts</button>
    <button class="tab-btn" data-tab="sprints">Sprints</button>
    <div class="tabs__bulk-actions">
      <button class="bulk-copy-btn" id="copy-needs-review">Copy Needs Review IDs</button>
      <button class="bulk-copy-btn" id="copy-issues-found">Copy Issues Found IDs</button>
    </div>
  </div>
  <section class="panel" id="panel-prompts">
    <div class="toolbar">
      <input type="text" id="search" placeholder="Filter by ID, title, or task...">
      <div id="filter-buttons"></div>
      <select id="sort-select" class="sort-select"></select>
    </div>
    <div id="urgent-block">
      <div class="urgent-block__header">
        <span>Recommended Next</span>
        <span class="urgent-block__count" id="urgent-block-count"></span>
      </div>
      <div id="urgent-block-list"></div>
    </div>
    <div style="overflow-x: auto;">
    <table>
      <thead>
        <tr>
          <th>ID</th>
          <th>Title</th>
          <th>Priority</th>
          <th>Category</th>
          <th>Date</th>
          <th>Source</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="prompt-list"></tbody>
    </table>
    </div>
    <div class="count-label" id="count-label"></div>
  </section>
  <section class="panel" id="panel-sprints" hidden>
    <div class="sprint-toolbar" id="sprint-filter-buttons"></div>
    <div class="sprint-grid" id="sprint-list"></div>
    <div class="count-label" id="sprint-count-label"></div>
  </section>
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
let SPRINTS = ${JSON.stringify(sprintData)};

// --- Live data fetch (dev server only) ---
// When served via the dev server, fetch the registry live so the dashboard
// always shows current data without needing regeneration.
async function fetchLiveData() {
  if (location.protocol === 'file:') return; // static file — use baked data
  try {
    const [promptRes, sprintRes] = await Promise.all([
      fetch('/api/prompt-registry'),
      fetch('/api/sprint-registry'),
    ]);
    if (!promptRes.ok || !sprintRes.ok) return;
    const registry = await promptRes.json();
    const sprintRegistry = await sprintRes.json();
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
        reservationReleasedAt: p.reservationReleasedAt || '',
        priority: p.priority || 'normal',
        category: p.category || '',
        completedAt: p.completedAt || '',
        completionErrors: p.completionErrors || '',
        manualChecklist: p.manualChecklist || [],
        fixPromptSuggestion: p.fixPromptSuggestion || '',
        fixesPromptId: p.fixesPromptId || '',
        fixedByPromptId: p.fixedByPromptId || '',
        sprintId: p.sprintId || '',
        sprintPhaseId: p.sprintPhaseId || '',
        sprintTaskId: p.sprintTaskId || '',
        statusLabel: computeStatusLabel(p),
        statusClass: computeStatusClass(p),
        body: body,
        isNew: false, // live mode doesn't track new-since-last-refresh
      });
    }
    PROMPTS = livePrompts;
    if (Array.isArray(sprintRegistry.sprints)) {
      SPRINTS = sprintRegistry.sprints;
    }
    renderFilterButtons();
    renderList();
    renderSprintFilters();
    renderSprints();
  } catch (e) {
    console.warn('[dashboard] live fetch failed, using baked data', e);
  }
}

function computeStatusLabel(p) {
  if (p.status === 'reserved') {
    return p.reservationReleasedAt ? 'RESERVED: RELEASED' : 'RESERVED';
  }
  if (p.status === 'reviewed') {
    switch (p.reviewOutcome) {
      case 'passed': return 'REVIEWED: PASSED';
      case 'passed with notes': return 'REVIEWED: PASSED WITH NOTES';
      case 'issues found': return 'REVIEWED: ISSUES FOUND';
      case 'needs rework': return 'REVIEWED: NEEDS REWORK';
      default: return 'REVIEWED';
    }
  }
  if (p.queueState === 'queued-started') return 'STARTED: NOT COMPLETED';
  if (p.queueState === 'queued-run' && p.completionErrors) return 'COMPLETED WITH ERRORS: NEEDS REVIEW';
  if (p.queueState === 'queued-run') return 'COMPLETED: NEEDS REVIEW';
  if (p.queueState === 'queued-pending') return 'READY TO RUN';
  if (p.status === 'created') return 'NOT REVIEWED';
  return (p.status || '').toUpperCase() || 'UNKNOWN';
}

function computeStatusClass(p) {
  if (p.status === 'reserved') {
    return p.reservationReleasedAt ? 'status--released' : 'status--reserved';
  }
  if (p.status === 'reviewed') {
    if (p.reviewOutcome === 'passed') return 'status--passed';
    if (p.reviewOutcome === 'passed with notes') return 'status--notes';
    if (p.reviewOutcome === 'issues found') return 'status--issues';
    if (p.reviewOutcome === 'needs rework') return 'status--rework';
    return 'status--reviewed';
  }
  if (p.queueState === 'queued-started') return 'status--started';
  if (p.queueState === 'queued-run' && p.completionErrors) return 'status--run-errors';
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
let activeTab = 'prompts';
let sprintFilter = 'active';


function renderTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  document.getElementById('panel-prompts').hidden = activeTab !== 'prompts';
  document.getElementById('panel-sprints').hidden = activeTab !== 'sprints';
}

// --- Filter buttons ---
const STATUS_FILTERS = [
  { label: 'All',           value: '' },
  { label: 'Managers',      value: 'kind:manager' },
  { label: 'Ready',         value: 'status--ready' },
  { label: 'Started',       value: 'status--started' },
  { label: 'Errors',        value: 'multi:errors' },
  { label: 'Completed',     value: 'status--run' },
  { label: 'Passed Review', value: 'status--passed' },
];

function renderFilterButtons() {
  const el = document.getElementById('filter-buttons');
  const activeCount = filterPrompts().length;
  el.innerHTML = STATUS_FILTERS.map(f =>
    f.value === 'sep' ? '<span style="margin:0 4px;color:#555">|</span>' :
    '<button class="filter-btn' + (filterStatus === f.value ? ' active' : '') +
    '" data-filter="' + f.value + '">' +
    (filterStatus === f.value ? f.label + ' (' + activeCount + ')' : f.label) +
    '</button>'
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
      // Flat creation-order: newest first, oldest at bottom. Status never affects position.
      case 'next-up':
        return (b.createdAt || '').localeCompare(a.createdAt || '') || idNum(b) - idNum(a);
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
  if (filterStatus) {
    if (filterStatus.startsWith('cat:')) {
      list = list.filter(p => p.category === filterStatus.slice(4));
    } else if (filterStatus.startsWith('prio:')) {
      list = list.filter(p => p.priority === filterStatus.slice(5));
    } else if (filterStatus === 'kind:manager') {
      list = list.filter(p => p.kind === 'manager');
    } else if (filterStatus === 'multi:errors') {
      list = list.filter(p =>
        p.statusClass === 'status--run-errors' ||
        p.reviewOutcome === 'issues found' ||
        p.reviewOutcome === 'needs rework'
      );
    } else {
      list = list.filter(p => p.statusClass === filterStatus);
    }
  }
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

function isUrgent(p) {
  return p.queueState === 'queued-pending' && (
    p.priority === 'critical' ||
    p.priority === 'high' ||
    p.category === 'bugfix' ||
    p.category === 'typecheck'
  );
}

function renderUrgentBlock() {
  const block = document.getElementById('urgent-block');
  const listEl = document.getElementById('urgent-block-list');
  const countEl = document.getElementById('urgent-block-count');
  if (sortPreset !== 'next-up') {
    block.classList.remove('is-visible');
    return;
  }
  const PRIO_TIER = { critical: 0, high: 1, low: 3 };
  const urgent = PROMPTS.filter(isUrgent).sort((a, b) => {
    const pa = PRIO_TIER[a.priority] ?? 2, pb = PRIO_TIER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.createdAt || '').localeCompare(a.createdAt || '') || idNum(b) - idNum(a);
  });
  if (urgent.length === 0) {
    block.classList.remove('is-visible');
    return;
  }
  countEl.textContent = urgent.length + ' prompt' + (urgent.length !== 1 ? 's' : '');
  listEl.innerHTML = urgent.map(p => {
    const statusHtml = '<span class="status-badge ' + p.statusClass + '">' + esc(p.statusLabel) + '</span>';
    const catBadge = p.category ? '<span class="category-badge cat--' + esc(p.category) + '">' + esc(p.category) + '</span>' : '';
    const prioBadge = p.priority ? '<span class="priority-badge priority--' + esc(p.priority) + '">' + esc(p.priority) + '</span>' : '';
    return '<div class="urgent-row" data-id="' + esc(p.id) + '">' +
      statusHtml +
      '<span class="urgent-row__id">' +
        '<button class="id-copy" data-id="' + esc(p.id) + '" title="Copy prompt ID">&#x2398;</button>' +
        esc(p.id) +
      '</span>' +
      '<span class="urgent-row__title">' + esc(p.title) + '</span>' +
      prioBadge +
      catBadge +
      '<button class="row-copy urgent-row__copy" data-copy-id="' + esc(p.id) + '" title="Copy full prompt">Copy</button>' +
      '</div>';
  }).join('');
  listEl.querySelectorAll('.urgent-row').forEach(row => {
    row.addEventListener('click', (e) => {
      if (e.target.closest('.id-copy') || e.target.closest('.row-copy')) return;
      openDetail(row.dataset.id);
    });
  });
  listEl.querySelectorAll('.id-copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      navigator.clipboard.writeText(btn.dataset.id).then(() => {
        btn.classList.add('copied');
        const orig = btn.innerHTML;
        btn.textContent = '\u2713';
        setTimeout(() => { btn.classList.remove('copied'); btn.innerHTML = orig; }, 1200);
      });
    });
  });
  listEl.querySelectorAll('.urgent-row__copy').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = PROMPTS.find(x => x.id === btn.dataset.copyId);
      if (!p) return;
      navigator.clipboard.writeText(p.body).then(() => {
        btn.classList.add('copied');
        btn.textContent = '\u2713 Copied';
        setTimeout(() => { btn.classList.remove('copied'); btn.textContent = 'Copy'; }, 1200);
      });
    });
  });
  block.classList.add('is-visible');
}

function renderList() {
  renderUrgentBlock();
  const list = filterPrompts();
  const tbody = document.getElementById('prompt-list');
  tbody.innerHTML = list.map(p => {
    // Show a short source label: just the filename without path
    const srcShort = (p.sourceDocument || '').split('/').pop() || '';
    const copyCell = '<button class="row-copy" data-copy-id="' + esc(p.id) + '" title="Copy full prompt">Copy</button>';
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
    const prioClass = 'priority--' + (p.priority || 'normal');
    const prioBadge = p.priority && p.priority !== 'normal'
      ? '<span class="priority-badge ' + prioClass + '">' + esc(p.priority) + '</span>'
      : '';
    const catBadge = p.category
      ? '<span class="category-badge cat--' + esc(p.category) + '">' + esc(p.category) + '</span>'
      : '';
    return '<tr data-id="' + p.id + '"' + rowClass + '>' +
      '<td class="id"><button class="id-copy" data-id="' + esc(p.id) + '" title="Copy prompt ID">&#x2398;</button>' + p.id + newBadge + '</td>' +
      '<td class="title">' + esc(p.title) + batchHint + '</td>' +
      '<td>' + prioBadge + '</td>' +
      '<td>' + catBadge + '</td>' +
      '<td class="date" title="' + esc(dateTitle) + '">' + esc(dateLabel) + '</td>' +
      '<td class="source">' + esc(srcShort) + '</td>' +
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

const SPRINT_FILTERS = [
  { label: 'Active', value: 'active' },
  { label: 'Needs Attention', value: 'needs-attention' },
  { label: 'Completed', value: 'completed' },
  { label: 'All', value: 'all' },
];

function renderSprintFilters() {
  const el = document.getElementById('sprint-filter-buttons');
  el.innerHTML = SPRINT_FILTERS.map(filter =>
    '<button class="filter-btn' + (sprintFilter === filter.value ? ' active' : '') + '" data-sprint-filter="' + filter.value + '">' + filter.label + '</button>'
  ).join('');
  el.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      sprintFilter = btn.dataset.sprintFilter;
      renderSprintFilters();
      renderSprints();
    });
  });
}

function filterSprints() {
  let list = [...SPRINTS];
  if (sprintFilter === 'active') {
    list = list.filter(sprint => ['active', 'implementation-partial', 'needs-review'].includes(sprint.status));
  } else if (sprintFilter === 'needs-attention') {
    list = list.filter(sprint => ['implementation-partial', 'needs-review', 'blocked', 'completed-with-issues'].includes(sprint.status));
  } else if (sprintFilter === 'completed') {
    list = list.filter(sprint => ['completed', 'completed-with-issues', 'archived'].includes(sprint.status));
  }
  return list.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title));
}

function progressSegments(progress, total) {
  if (!total) return '';
  const segments = [
    ['planned', progress.planned],
    ['promptCreated', progress.promptCreated],
    ['started', progress.started],
    ['completed', progress.completed],
    ['reviewedPassed', progress.reviewedPassed],
    ['reviewedWithNotes', progress.reviewedWithNotes],
    ['issuesFound', progress.issuesFound],
  ];
  return segments
    .filter(([, count]) => count > 0)
    .map(([key, count]) => '<span class="progress-seg progress-seg--' + key + '" style="width:' + ((count / total) * 100).toFixed(2) + '%"></span>')
    .join('');
}

function renderSprints() {
  const list = filterSprints();
  const el = document.getElementById('sprint-list');
  el.innerHTML = list.map(sprint => {
    const statusClass = 'sprint-status sprint-status--' + sprint.status;
    const dependencyPills = (sprint.dependencySprintIds || []).map(id => '<span class="sprint-pill">depends on ' + esc(id) + '</span>').join('');
    const pills = [
      '<span class="sprint-pill">' + sprint.totalTasks + ' tasks</span>',
      '<span class="sprint-pill">' + sprint.promptsLinkedCount + ' linked prompts</span>',
      '<span class="sprint-pill">' + sprint.promptsUnreviewedCount + ' unreviewed prompts</span>',
      '<span class="sprint-pill">' + (sprint.auditRefs || []).length + ' audits</span>',
      '<span class="sprint-pill">' + (sprint.recommendedNextSteps || []).length + ' next steps</span>',
      dependencyPills,
    ].join('');
    return '<article class="sprint-card" data-sprint-id="' + sprint.id + '">' +
      '<div class="sprint-card__top">' +
      '<div><div class="sprint-card__title">' + esc(sprint.title) + '</div><div class="sprint-card__doc">' + esc((sprint.sourceDocument || '').split('/').pop() || sprint.sourceDocument) + '</div></div>' +
      '<span class="' + statusClass + '">' + esc(sprint.status) + '</span>' +
      '</div>' +
      '<div class="progress-stack">' +
      '<div class="progress-labels"><span>Plan coverage ' + sprint.planCoveragePct + '%</span><span>Execution ' + sprint.executionPct + '%</span><span>Reality ' + sprint.implementationPct + '%</span></div>' +
      '<div class="progress-bar">' + progressSegments(sprint.progress, sprint.totalTasks) + '</div>' +
      '</div>' +
      '<div class="sprint-card__meta">' + esc(sprint.completionSummary || 'No summary yet.') + '</div>' +
      '<div class="sprint-pills">' + pills + '</div>' +
      '</article>';
  }).join('');
  document.getElementById('sprint-count-label').textContent = list.length + ' of ' + SPRINTS.length + ' sprints';
  el.querySelectorAll('.sprint-card').forEach(card => {
    card.addEventListener('click', () => openSprintDetail(card.dataset.sprintId));
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
    ['Priority', p.priority && p.priority !== 'normal' ? '<span class="priority-badge priority--' + esc(p.priority) + '">' + esc(p.priority) + '</span>' : 'normal'],
    ['Category', p.category ? '<span class="category-badge cat--' + esc(p.category) + '">' + esc(p.category) + '</span>' : 'none'],
    ['Kind', p.kind || 'normal'],
    ['Source', esc(p.sourceDocument || '')],
    ['Source Step', esc(p.sourceStep || '')],
    ['Created By', esc(p.createdBy || 'unknown')],
    ['Created At', esc(fmtDate(p.createdAt) || 'unknown')],
    ['Started At', esc(fmtDate(p.startedAt) || 'not started')],
    ['Reviewed At', esc(fmtDate(p.reviewedAt) || 'not reviewed')],
    ['Reviewed By', esc(p.reviewedBy || 'unknown')],
    ['Review Method', esc(p.reviewMethod || 'unknown')],
    ['Review Scope', esc(p.reviewScope || 'none')],
    ['Execution Target', esc(p.executionTarget || '')],
    ['Sprint ID', esc(p.sprintId || 'none')],
    ['Sprint Phase ID', esc(p.sprintPhaseId || 'none')],
    ['Sprint Task ID', esc(p.sprintTaskId || 'none')],
    ['Claude Used', p.claudeUsed ? 'Yes' : 'No'],
    ['Review Outcome', esc(p.reviewOutcome || 'pending')],
    ['Review Issues', esc(p.reviewIssues || 'none')],
  ];
  if (p.completedAt) meta.push(['Completed At', esc(fmtDate(p.completedAt))]);
  if (p.completionErrors) meta.push(['Completion Errors', '<span style="color:#e55">' + esc(p.completionErrors) + '</span>']);
  if (p.parentPromptId) meta.push(['Parent Prompt', esc(p.parentPromptId)]);
  if (p.batchPromptIds && p.batchPromptIds.length) meta.push(['Batch Prompts', esc(p.batchPromptIds.join(', '))]);
  if (p.fixesPromptId) meta.push(['Fixes Prompt', esc(p.fixesPromptId) + ' <span style="color:#888;font-size:0.85em">(this prompt resolves issues from that review)</span>']);
  if (p.fixedByPromptId) meta.push(['Fixed By Prompt', esc(p.fixedByPromptId) + ' <span style="color:#888;font-size:0.85em">(issues resolved by that prompt)</span>']);
  if (p.notes && p.notes !== 'none') meta.push(['Notes', esc(p.notes)]);

  let html = '<dl class="detail-meta">';
  meta.forEach(([k, v]) => { html += '<dt>' + k + '</dt><dd>' + v + '</dd>'; });
  html += '</dl>';

  // Manual checklist section — shown prominently for reviewers
  if (p.manualChecklist && p.manualChecklist.length > 0) {
    html += '<div class="detail-section" style="background:#1a2a1a;border:1px solid #2a4a2a;border-radius:6px;padding:12px 16px;margin:12px 0">';
    html += '<h3 style="color:#6c6;margin:0 0 8px">Manual Verification Checklist</h3>';
    html += '<ul style="margin:0;padding-left:20px;list-style:none">';
    p.manualChecklist.forEach(item => {
      const cleaned = esc(item.replace(/^- \[[ x]\] /, ''));
      html += '<li style="margin:4px 0"><label><input type="checkbox" style="margin-right:8px">' + cleaned + '</label></li>';
    });
    html += '</ul></div>';
  }

  // "Prompt this to start fix" box — shown when review found issues and no fix has been linked yet
  if (p.fixPromptSuggestion && !p.fixedByPromptId) {
    const fixBoxId = 'fix-suggestion-' + p.id;
    html += '<div class="detail-section" style="background:#2a1a0a;border:1px solid #6a3a0a;border-radius:6px;padding:12px 16px;margin:12px 0">';
    html += '<h3 style="color:#fa0;margin:0 0 8px">Prompt this to start fix</h3>';
    html += '<div class="pre-wrap" style="position:relative"><button class="copy-btn" data-fix-copy-id="' + esc(p.id) + '">Copy</button>';
    html += '<pre id="' + fixBoxId + '" style="white-space:pre-wrap;margin:0;font-size:0.9em">' + esc(p.fixPromptSuggestion) + '</pre></div></div>';
  }

  html += '<div class="detail-section"><h3>Task</h3><p>' + esc(p.task || '') + '</p></div>';
  html += '<div class="detail-section"><h3>Full Prompt</h3><div class="pre-wrap"><button class="copy-btn" data-copy-id="' + p.id + '">Copy</button><pre id="prompt-body-' + p.id + '">' + esc(p.body) + '</pre></div></div>';

  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail').style.display = 'flex';
}

function openSprintDetail(id) {
  const sprint = SPRINTS.find(entry => entry.id === id);
  if (!sprint) return;
  document.getElementById('detail-title').innerHTML = esc(sprint.id) + ' <span style="color:var(--text-dim);font-weight:400">— ' + esc(sprint.title) + '</span>';

  let html = '<dl class="detail-meta">';
  const meta = [
    ['Sprint ID', sprint.id],
    ['Status', '<span class="sprint-status sprint-status--' + esc(sprint.status) + '">' + esc(sprint.status) + '</span>'],
    ['Source document', esc(sprint.sourceDocument || '')],
    ['Updated', esc(fmtDate(sprint.updatedAt || sprint.createdAt || '') || 'unknown')],
    ['Plan coverage', esc(String(sprint.planCoveragePct) + '%')],
    ['Execution progress', esc(String(sprint.executionPct) + '%')],
    ['Implementation progress', esc(String(sprint.implementationPct) + '%')],
    ['Total tasks', esc(String(sprint.totalTasks))],
    ['Linked prompts', esc(String(sprint.promptsLinkedCount))],
    ['Unreviewed prompts', esc(String(sprint.promptsUnreviewedCount))],
  ];
  meta.forEach(([k, v]) => { html += '<dt>' + k + '</dt><dd>' + v + '</dd>'; });
  html += '</dl>';

  if (sprint.dependencySprintIds && sprint.dependencySprintIds.length) {
    html += '<div class="sprint-section"><h3>Dependencies</h3><div class="sprint-link-list">' + sprint.dependencySprintIds.map(dep => '<span class="sprint-link">' + esc(dep) + '</span>').join('') + '</div></div>';
  }

  if (sprint.auditRefs && sprint.auditRefs.length) {
    html += '<div class="sprint-section"><h3>Audits</h3><div class="sprint-task-list">' + sprint.auditRefs.map(audit =>
      '<div class="sprint-task"><div class="sprint-task__head"><strong>' + esc(audit.title) + '</strong><span class="sprint-link">' + esc(audit.status) + '</span></div>' +
      '<div class="sprint-task__meta">' + esc(audit.sourceDocument || '') + '</div></div>'
    ).join('') + '</div></div>';
  }

  if (sprint.recommendedNextSteps && sprint.recommendedNextSteps.length) {
    html += '<div class="sprint-section"><h3>Recommended Next Steps</h3><div class="sprint-task-list">' + sprint.recommendedNextSteps.map(step =>
      '<div class="sprint-task"><div class="sprint-task__head"><strong>' + esc(step.title) + '</strong><span class="sprint-link">' + esc(step.priority) + '</span></div>' +
      '<div class="sprint-task__meta">' + esc(step.reason || '') + '</div>' +
      (step.suggestedPromptIds && step.suggestedPromptIds.length
        ? '<div class="sprint-link-list">' + step.suggestedPromptIds.map(promptId => '<span class="sprint-link">' + esc(promptId) + '</span>').join('') + '</div>'
        : '') +
      '</div>'
    ).join('') + '</div></div>';
  }

  html += '<div class="sprint-section"><h3>Phases And Tasks</h3>';
  sprint.phases.forEach(phase => {
    html += '<div class="sprint-detail-phase"><div class="sprint-task__head"><strong>' + esc(phase.title) + '</strong><span class="sprint-link">' + esc(phase.status) + '</span></div>';
    html += '<div class="sprint-task-list">';
    phase.tasks.forEach(task => {
      html += '<div class="sprint-task">' +
        '<div class="sprint-task__head"><strong>' + esc(task.title) + '</strong><span class="sprint-link">' + esc(task.status) + '</span></div>' +
        '<div class="sprint-task__meta">Execution: ' + esc(task.executionState) + (task.sourceAnchor ? ' | ' + esc(task.sourceAnchor) : '') + '</div>' +
        (task.notes ? '<div class="sprint-task__meta">' + esc(task.notes) + '</div>' : '') +
        (task.linkedPromptIds && task.linkedPromptIds.length
          ? '<div class="sprint-link-list">' + task.linkedPromptIds.map(promptId => '<span class="sprint-link">' + esc(promptId) + '</span>').join('') + '</div>'
          : '<div class="sprint-task__meta">No linked prompts yet.</div>') +
        '</div>';
    });
    html += '</div></div>';
  });
  if (sprint.unassignedPromptIds && sprint.unassignedPromptIds.length) {
    html += '<div class="sprint-section"><h3>Unassigned Prompts</h3><div class="sprint-link-list">' + sprint.unassignedPromptIds.map(promptId => '<span class="sprint-link">' + esc(promptId) + '</span>').join('') + '</div></div>';
  }
  html += '</div>';

  document.getElementById('detail-body').innerHTML = html;
  document.getElementById('detail').style.display = 'flex';
}

// Copy prompt body or fix suggestion to clipboard
document.getElementById('detail-body').addEventListener('click', (e) => {
  const btn = e.target.closest('.copy-btn');
  if (!btn) return;
  // Fix suggestion copy button
  if (btn.dataset.fixCopyId) {
    const pre = document.getElementById('fix-suggestion-' + btn.dataset.fixCopyId);
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
    });
    return;
  }
  // Full prompt body copy button
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

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = btn.dataset.tab;
    renderTabs();
  });
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

// --- Refresh modal helpers ---
function openRefreshModal() {
  document.getElementById('refresh-backdrop').classList.add('is-open');
  document.getElementById('refresh-modal-close').focus();
}
function closeRefreshModal() {
  document.getElementById('refresh-backdrop').classList.remove('is-open');
  document.getElementById('refresh-btn').disabled = false;
  document.getElementById('refresh-btn').textContent = 'Refresh Data';
}
document.getElementById('refresh-modal-close').addEventListener('click', closeRefreshModal);
document.getElementById('refresh-backdrop').addEventListener('click', (e) => {
  if (e.target === document.getElementById('refresh-backdrop')) closeRefreshModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('refresh-backdrop').classList.contains('is-open')) {
    closeRefreshModal();
  }
});
document.querySelectorAll('.copy-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const text = btn.dataset.copy;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
    }).catch(() => {
      btn.textContent = 'Error';
      setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
    });
  });
});

// --- Refresh button ---
document.getElementById('refresh-btn').addEventListener('click', () => {
  const btn = document.getElementById('refresh-btn');
  btn.textContent = 'Refreshing...';
  btn.disabled = true;
  if (location.protocol === 'file:') {
    openRefreshModal();
  } else {
    // Live mode: fetch latest data then hard-reload to bust cache on the page itself.
    // Button state reset is intentionally omitted — the reload replaces the page.
    fetchLiveData().then(() => {
      location.href = location.href.split('?')[0] + '?t=' + Date.now();
    });
  }
});

// --- Stale indicator ---
let staleTimer = null;
function resetStaleTimer() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.remove('is-stale');
  clearTimeout(staleTimer);
  staleTimer = setTimeout(() => {
    btn.classList.add('is-stale');
  }, 2 * 60 * 1000);
}
resetStaleTimer();
document.getElementById('refresh-btn').addEventListener('click', resetStaleTimer);

// --- Init ---
renderTabs();
renderFilterButtons();
renderList();
renderSprintFilters();
renderSprints();
// Fetch live data from dev server (replaces baked data if available)
fetchLiveData();

// --- Bulk copy buttons ---
function bulkCopy(btn, ids) {
  const orig = btn.textContent;
  if (ids.length === 0) {
    btn.textContent = 'None';
    btn.classList.add('empty');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('empty'); }, 1500);
    return;
  }
  navigator.clipboard.writeText(ids.join(', ')).then(() => {
    btn.textContent = '\\u2713 Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('copied'); }, 1500);
  });
}
document.getElementById('copy-needs-review').addEventListener('click', () => {
  const ids = PROMPTS
    .filter(p => p.queueState === 'queued-run')
    .map((p, i) => (i + 1) + '. ' + p.id);
  bulkCopy(document.getElementById('copy-needs-review'), ids);
});
document.getElementById('copy-issues-found').addEventListener('click', () => {
  const ids = PROMPTS
    .filter(p => p.reviewOutcome === 'issues found' || p.reviewOutcome === 'needs rework')
    .map((p, i) => (i + 1) + '. ' + p.id);
  bulkCopy(document.getElementById('copy-issues-found'), ids);
});
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
