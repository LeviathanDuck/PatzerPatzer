// Generate a standalone HTML dashboard for browsing prompt tracking data.
// Reads from prompt-registry.json and prompt item files.
// Output: docs/prompts/dashboard.html (open locally in browser).

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  activeDashboardPrompts,
  isEditablePrompt,
  isSkippablePrompt,
  promptFileBody,
  readRegistry,
  supersededPromptVersions,
} from './prompt-registry-lib.mjs';
import { buildSprintDashboardData } from './sprint-registry-lib.mjs';

const root = process.cwd();
const lookbookUrl = '/lookbook';
const { paths, registry } = readRegistry(root);
const prompts = activeDashboardPrompts(registry);
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
  if (p.status === 'skipped') {
    return 'SKIPPED: NOT RUNNABLE';
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
  if (p.status === 'skipped') return 'status--skipped';
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
for (const p of registry.prompts) {
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
  lastEditedAt: p.lastEditedAt || '',
  skippedAt: p.skippedAt || '',
  startedAt: p.startedAt || '',
  status: p.status,
  reviewOutcome: p.reviewOutcome,
  reviewIssues: p.reviewIssues,
  queueState: p.queueState,
  claudeUsed: p.claudeUsed,
  kind: p.kind,
  notes: p.notes,
  skipReason: p.skipReason || '',
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
  editable: isEditablePrompt(p),
  skippable: isSkippablePrompt(p),
  archivedVersions: supersededPromptVersions(registry, p.id).map(version => ({
    id: version.id,
    supersededAt: version.supersededAt || '',
    body: promptBodies.get(version.id) ?? '',
  })),
  isNew: previousGeneratedAt && p.createdAt && new Date(p.createdAt).getTime() > new Date(previousGeneratedAt).getTime(),
}));

// --- Markdown to HTML (runs at generation time) ---

function mdEsc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function mdInline(text) {
  text = text.replace(/\*\*\*(.*?)\*\*\*/g, (_, m) => '<strong><em>' + m + '</em></strong>');
  text = text.replace(/\*\*(.*?)\*\*/g, (_, m) => '<strong>' + m + '</strong>');
  text = text.replace(/\*([^*\n]+?)\*/g, (_, m) => '<em>' + m + '</em>');
  text = text.replace(/_([^_\n]+?)_/g, (_, m) => '<em>' + m + '</em>');
  text = text.replace(/`([^`\n]+?)`/g, (_, m) => '<code>' + m + '</code>');
  text = text.replace(/~~(.*?)~~/g, (_, m) => '<del>' + m + '</del>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => '<a href="' + mdEsc(href) + '" rel="noopener">' + label + '</a>');
  return text;
}

function markdownToHtml(md) {
  if (!md) return '';
  const lines = md.split('\n');
  const out = [];
  let i = 0;
  let listType = null;
  let listItems = [];
  let paraLines = [];

  function flushPara() {
    const text = paraLines.join(' ').trim();
    if (text) out.push('<p>' + mdInline(text) + '</p>');
    paraLines = [];
  }
  function flushList() {
    if (!listType) return;
    out.push('<' + listType + '>' + listItems.join('') + '</' + listType + '>');
    listType = null; listItems = [];
  }
  function flushAll() { flushPara(); flushList(); }

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    if (line.startsWith('```')) {
      flushAll();
      const lang = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(mdEsc(lines[i])); i++; }
      out.push('<pre><code' + (lang ? ' class="lang-' + mdEsc(lang) + '"' : '') + '>' + code.join('\n') + '</code></pre>');
      i++; continue;
    }

    // Heading
    const hm = line.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      flushAll();
      const lvl = hm[1].length;
      out.push('<h' + lvl + '>' + mdInline(mdEsc(hm[2])) + '</h' + lvl + '>');
      i++; continue;
    }

    // HR
    if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      flushAll(); out.push('<hr>'); i++; continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushAll();
      out.push('<blockquote>' + mdInline(mdEsc(line.slice(2))) + '</blockquote>');
      i++; continue;
    }

    // Unordered list
    const ulm = line.match(/^[ \t]*[-*+]\s+(.*)$/);
    if (ulm) {
      flushPara();
      if (listType && listType !== 'ul') flushList();
      listType = 'ul';
      let raw = ulm[1];
      let itemHtml;
      if (/^\[ \]\s/.test(raw)) itemHtml = '<span class="md-cb">☐</span> ' + mdInline(mdEsc(raw.slice(3).trim()));
      else if (/^\[x\]\s/i.test(raw)) itemHtml = '<span class="md-cb md-cb--done">☑</span> ' + mdInline(mdEsc(raw.slice(3).trim()));
      else itemHtml = mdInline(mdEsc(raw));
      listItems.push('<li>' + itemHtml + '</li>');
      i++; continue;
    }

    // Ordered list
    const olm = line.match(/^\d+\.\s+(.*)$/);
    if (olm) {
      flushPara();
      if (listType && listType !== 'ol') flushList();
      listType = 'ol';
      listItems.push('<li>' + mdInline(mdEsc(olm[1])) + '</li>');
      i++; continue;
    }

    // Blank line
    if (line.trim() === '') {
      flushPara(); flushList(); i++; continue;
    }

    // Paragraph text
    flushList();
    paraLines.push(mdEsc(line));
    i++;
  }
  flushAll();
  return out.join('\n');
}

const sprintData = sprints.map(sprint => ({
  id: sprint.id,
  title: sprint.title,
  sourceDocument: sprint.sourceDocument,
  status: sprint.currentStatus,
  statusSlug: String(sprint.currentStatus || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
  createdAt: sprint.createdAt || '',
  updatedAt: sprint.updatedAt || '',
  dependencySprintIds: sprint.dependencySprintIds || [],
  auditRefs: (sprint.auditRefs || []).map(ref => {
    const absPath = resolve(root, ref.sourceDocument || '');
    const docContent = ref.sourceDocument && existsSync(absPath)
      ? readFileSync(absPath, 'utf8')
      : '';
    return { ...ref, docContent };
  }),
  recommendedNextSteps: sprint.recommendedNextSteps || [],
  completionSummary: sprint.completionSummary || '',
  planCoveragePct: sprint.planCoveragePct,
  executionPct: sprint.executionPct,
  implementationPct: sprint.implementationPct,
  totalTasks: sprint.totalTasks,
  promptsLinkedCount: sprint.promptsLinkedCount,
  promptsUnreviewedCount: sprint.promptsUnreviewedCount,
  unassignedPromptIds: sprint.unassignedPromptIds || [],
  normalizedStructure: !!sprint.normalizedStructure,
  showNormalizationWarning: !!sprint.showNormalizationWarning,
  showNextPromptPanel: !!sprint.showNextPromptPanel,
  nextAvailablePhase: sprint.nextAvailablePhase,
  nextPhaseTasks: sprint.nextPhaseTasks || [],
  tasksNeedingPrompts: sprint.tasksNeedingPrompts || [],
  nextPhaseCoveredTasks: sprint.nextPhaseCoveredTasks || [],
  auditPromptTemplate: sprint.auditPromptTemplate || '',
  auditPromptTemplateDefault: sprint.auditPromptTemplateDefault || '',
  auditPromptTemplateRendered: sprint.auditPromptTemplateRendered || sprint.auditPromptTemplate || '',
  nextPromptsTemplate: sprint.nextPromptsTemplate || '',
  nextPromptsTemplateDefault: sprint.nextPromptsTemplateDefault || '',
  nextPromptsTemplateRendered: sprint.nextPromptsTemplateRendered || sprint.nextPromptsTemplate || '',
  showMismatchPanel: !!sprint.showMismatchPanel,
  mismatchTasks: sprint.mismatchTasks || [],
  mismatchFollowUpTemplate: sprint.mismatchFollowUpTemplate || '',
  mismatchFollowUpTemplateDefault: sprint.mismatchFollowUpTemplateDefault || '',
  mismatchFollowUpTemplateRendered: sprint.mismatchFollowUpTemplateRendered || sprint.mismatchFollowUpTemplate || '',
  appendRequestTemplateDefault: sprint.appendRequestTemplateDefault || '',
  appendRequestTemplateRendered: sprint.appendRequestTemplateRendered || '',
  panelNotes: sprint.panelNotes || {},
  sprintDocHtml: (() => { try { return markdownToHtml(readFileSync(resolve(root, sprint.sourceDocument), 'utf8')); } catch { return ''; } })(),
  progress: sprint.progress,
  phases: sprint.phases.map(phase => ({
    id: phase.id,
    title: phase.title,
    order: phase.order,
    status: phase.currentStatus || phase.status,
    statusSlug: String(phase.currentStatus || phase.status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    isAvailable: !!phase.isAvailable,
    isPromptComplete: !!phase.isPromptComplete,
    nextPromptsTemplate: phase.nextPromptsTemplate || '',
    nextPromptsTemplateDefault: phase.nextPromptsTemplateDefault || phase.nextPromptsTemplate || '',
    dependencyPhaseIds: phase.dependencyPhaseIds || [],
    tasks: phase.tasks.map(task => ({
      id: task.id,
      title: task.title,
      status: task.currentState || task.status,
      statusSlug: String(task.currentState || task.status || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
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
.header__nav-link {
  padding: 5px 13px;
  background: transparent;
  color: var(--text-dim);
  border: 1px solid #333;
  border-radius: 4px;
  font-size: 0.82rem;
  font-weight: 500;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.header__nav-link:hover { background: #1e1e1e; color: var(--text); border-color: #555; }
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
  padding: 16px 10px;
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
.status--skipped { background: #4b4b4b; color: #ddd; }
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
.pagination { display: flex; align-items: center; gap: 4px; padding: 10px 0; flex-wrap: wrap; }
.page-btn { background: #1a1a1a; border: 1px solid #333; color: #ccc; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 0.82rem; min-width: 32px; }
.page-btn:hover:not(:disabled) { background: #2a2a2a; border-color: #555; }
.page-btn.active { background: #2563eb; border-color: #2563eb; color: #fff; font-weight: 600; }
.page-btn:disabled { opacity: 0.35; cursor: default; }
.page-ellipsis { color: #666; padding: 0 4px; font-size: 0.82rem; }
/* Sprint tab toolbar — CCP-643 foundational framing */
.sprint-tab-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
}
.sprint-toolbar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
/* Sprint grid — CCP-643 breathing room */
.sprint-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));
  gap: 20px;
}
/* Sprint card — CCP-642 card layout polish */
.sprint-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-left: 3px solid var(--border);
  border-radius: 10px;
  padding: 24px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.sprint-card:hover {
  border-color: #4b4b4b;
  border-left-color: inherit;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
/* CCP-662: Status left-border colours */
.sprint-card--needs-prompts      { border-left-color: #7a6940; }
.sprint-card--incomplete-start   { border-left-color: #7a6940; }
.sprint-card--ready-to-start     { border-left-color: #7b62b6; }
.sprint-card--in-progress        { border-left-color: #416b82; }
.sprint-card--needs-review       { border-left-color: #7e6536; }
.sprint-card--completed-issues   { border-left-color: #7e6536; }
.sprint-card--completed          { border-left-color: #3c6a4b; }
.sprint-card--superseded         { border-left-color: #6a5a8a; opacity: 0.7; }
.sprint-card--retired            { border-left-color: #555; opacity: 0.55; }
/* CCP-662: Normalization warning tint */
.sprint-card--warn {
  border-left-color: #b8960a !important;
  background: rgba(228,210,147,0.04);
}
/* Card header row: title left, status badge right */
.sprint-card__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.sprint-card__title-block {
  flex: 1;
  min-width: 0;
}
.sprint-card__title {
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1.3;
  word-break: break-word;
}
.sprint-card__doc {
  margin-top: 4px;
  color: var(--text-dim);
  font-size: 0.82rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* Status badge on cards — CCP-643 human-readable labels */
.sprint-status {
  display: inline-flex;
  align-items: center;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  border: 1px solid var(--border);
  background: #2a2a2a;
  white-space: nowrap;
  flex-shrink: 0;
}
.sprint-status--needs-prompts { color: #e4d293; border-color: #7a6940; background: rgba(228,210,147,0.08); }
.sprint-status--ready-to-start { color: #cbb6ff; border-color: #7b62b6; background: rgba(203,182,255,0.08); }
.sprint-status--in-progress { color: #87c2df; border-color: #416b82; background: rgba(135,194,223,0.08); }
.sprint-status--completed-needs-full-review { color: #d3b06d; border-color: #7e6536; background: rgba(211,176,109,0.08); }
.sprint-status--completed-with-issues { color: #f08f8f; border-color: #8b4747; background: rgba(240,143,143,0.08); }
.sprint-status--completed-reviews-passed { color: #90d0a8; border-color: #3c6a4b; background: rgba(144,208,168,0.08); }
.sprint-status--superseded { color: #b8a0d8; border-color: #6a5a8a; background: rgba(106,90,138,0.08); }
.sprint-status--retired { color: #888; border-color: #555; background: rgba(85,85,85,0.08); }
.sprint-status--incomplete-start-state { color: #e4d293; border-color: #7a6940; background: rgba(228,210,147,0.08); }
.sprint-status--completed { color: #90d0a8; border-color: #3c6a4b; background: rgba(144,208,168,0.08); }
.sprint-status--completed-issues-found { color: #f08f8f; border-color: #8b4747; background: rgba(240,143,143,0.08); }
.sprint-status--completed-review-passed { color: #90d0a8; border-color: #3c6a4b; background: rgba(144,208,168,0.08); }

/* Card summary — dim meta text */
.sprint-card__summary {
  font-size: 0.9rem;
  color: var(--text-dim);
  line-height: 1.5;
}

/* Progress stack — CCP-644 per-metric rows */
.progress-stack {
  display: grid;
  gap: 6px;
  margin: 0;
}
.progress-metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 0.73rem;
}
.progress-metric__label { color: var(--text-dim); flex-shrink: 0; }
.progress-metric__bar {
  flex: 1;
  height: 4px;
  background: #2a2a2a;
  border-radius: 999px;
  overflow: hidden;
  position: relative;
}
.progress-metric__fill {
  height: 100%;
  border-radius: 999px;
  position: absolute;
  left: 0;
  top: 0;
}
.progress-metric__fill--plan { background: #5a82b0; }
.progress-metric__fill--exec { background: #d39545; }
.progress-metric__fill--impl { background: #3db87a; }
/* Implementation bar — taller and brighter */
.progress-metric--impl .progress-metric__bar { height: 7px; background: #222; }
.progress-metric--impl .progress-metric__label { color: var(--text); font-weight: 700; }
.progress-metric--impl .progress-metric__value { color: #3db87a; font-weight: 700; }
.progress-metric__value {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  min-width: 30px;
  text-align: right;
}
/* Main segmented bar — CCP-644 thicker and more legible */
.progress-bar {
  display: flex;
  height: 8px;
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
/* Sprint card pill rows — CCP-642 two visual tiers */
.sprint-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
}
.sprint-pill {
  font-size: 0.71rem;
  color: var(--text-dim);
  background: #1a1a1a;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}
/* Dependency pills — visually distinct from stats pills */
.sprint-pill--dep {
  font-size: 0.71rem;
  color: #87c2df;
  background: rgba(135,194,223,0.06);
  border: 1px solid rgba(135,194,223,0.2);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
}
/* CCP-662: Warning pill for unreviewed prompts */
.sprint-pill--warn {
  font-size: 0.71rem;
  color: #d4a040;
  background: rgba(212,160,64,0.1);
  border: 1px solid rgba(212,160,64,0.3);
  border-radius: 999px;
  padding: 2px 8px;
  white-space: nowrap;
  font-weight: 600;
}
/* CCP-662: Recency footer */
.sprint-card__recency {
  font-size: 0.7rem;
  color: var(--text-dim);
  opacity: 0.75;
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 7px;
}
.sprint-card__recency-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  flex-shrink: 0;
  background: #666;
  box-shadow: 0 0 0 1px rgba(255,255,255,0.05);
}
.sprint-card__recency-dot--recent {
  background: #4fb66f;
  box-shadow: 0 0 0 1px rgba(79,182,111,0.25), 0 0 8px rgba(79,182,111,0.35);
}
.sprint-card__recency-dot--stale {
  background: #666;
}
.sprint-card__recency-text {
  min-width: 0;
}
.sprint-card__created-at {
  font-size: 0.68rem;
  color: var(--text-dim);
  opacity: 0.6;
  text-align: center;
}
/* CCP-645 detail panel section styles */
.sprint-section { margin-top: 14px; }
/* CCP-652: Sprint actions area shell — groups action panels as a distinct operator surface */
.sprint-actions-area {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
.sprint-actions-area > .sprint-section-heading { margin-bottom: 12px; }
.sprint-action-panel {
  margin-top: 10px;
  padding: 14px 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: #1c1c1c;
}
/* CCP-648: Audit panel — informational blue, always available */
.sprint-action-panel--audit { border-color: #3a4f5f; background: rgba(70, 110, 140, 0.08); }
.sprint-action-panel--mismatch { border-color: #7a3535; background: rgba(140, 60, 60, 0.08); }
/* CCP-649: Next-prompt panel — elevated green, primary action */
.sprint-action-panel--next { border-color: #4a7a4a; background: rgba(90, 140, 90, 0.1); }
/* CCP-650: Warning panel — caution amber */
.sprint-action-panel--warning { border-color: #7a6940; background: rgba(228,210,147,0.08); }
/* CCP-652: Panel header row — title + badge inline */
.sprint-action-panel__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.sprint-action-panel__title {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--text);
  flex: 1;
  min-width: 0;
}
/* CCP-650: Warning panel title in amber */
.sprint-action-panel--warning .sprint-action-panel__title { color: #d4c068; }
/* CCP-650: Warning icon */
.sprint-action-panel__icon { font-size: 0.9rem; line-height: 1; flex-shrink: 0; }
/* CCP-648/649: Availability badge */
.sprint-action-panel__badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 3px;
  white-space: nowrap;
  flex-shrink: 0;
}
.sprint-action-panel--audit .sprint-action-panel__badge {
  background: rgba(70, 110, 140, 0.25);
  color: #87c2df;
}
.sprint-action-panel--next .sprint-action-panel__badge {
  background: rgba(90, 140, 90, 0.3);
  color: #7ac87a;
}
.sprint-action-panel--mismatch .sprint-action-panel__title { color: #df8787; }
.sprint-action-panel__badge--mismatch {
  background: rgba(140, 60, 60, 0.3);
  color: #df8787;
}
.sprint-action-panel__meta {
  margin: 0 0 10px;
  font-size: 0.75rem;
  color: var(--text-dim);
  line-height: 1.4;
}
/* CCP-649: Phase context line */
.sprint-action-panel__phase-context {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 8px;
}
.sprint-action-panel__phase-context span { color: #7ac87a; }
/* CCP-649: Task coverage pills */
.sprint-action-panel__task-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}
.sprint-task-pill {
  font-size: 0.72rem;
  padding: 2px 7px;
  border-radius: 3px;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sprint-task-pill--needs {
  background: rgba(228,210,147,0.12);
  color: #d4c068;
  border: 1px solid rgba(228,210,147,0.22);
}
.sprint-task-pill--covered {
  background: rgba(90,140,90,0.12);
  color: #6aaa6a;
  border: 1px solid rgba(90,140,90,0.2);
}
.sprint-task-pill--mismatch {
  background: rgba(140,60,60,0.12);
  color: #df8787;
  border: 1px solid rgba(140,60,60,0.25);
}
/* Editable sprint prompt panels */
.sprint-panel-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 8px 0 8px;
}
.sprint-panel-controls--compact {
  margin-bottom: 0;
}
.sprint-panel-controls .copy-btn,
.sprint-panel-controls .sprint-panel-btn {
  position: static;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 112px;
  padding: 7px 12px;
  font-size: 0.78rem;
  font-weight: 600;
  text-align: center;
}
.sprint-panel-btn {
  background: #2a2a2a;
  color: var(--text-dim);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.sprint-panel-btn:hover { background: #333; color: var(--text); }
.sprint-panel-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.sprint-panel-btn.copied,
.sprint-panel-btn.saved,
.sprint-panel-btn.reset {
  background: var(--status-passed);
  color: #111;
  border-color: var(--status-passed);
}
.sprint-panel-textarea {
  width: 100%;
  min-height: 220px;
  resize: vertical;
  font-size: 0.76rem;
  line-height: 1.45;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  background: #141414;
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  padding: 10px 12px;
  color: #d0d0d0;
}
.sprint-panel-textarea-wrap[hidden] { display: none; }
.sprint-panel-textarea:focus {
  outline: 1px solid var(--accent);
  border-color: var(--accent);
}
.sprint-panel-note {
  margin: 0 0 8px;
  font-size: 0.74rem;
  color: var(--text-dim);
}
.sprint-panel-view {
  border: 1px solid #2a2a2a;
  border-radius: 6px;
  background: #141414;
  padding: 10px 12px;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 0.76rem;
  line-height: 1.45;
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  color: #d0d0d0;
}
.sprint-panel-preview[hidden] { display: none; }
.sprint-panel-last-edited {
  margin: 8px 0 0;
  font-size: 0.73rem;
  color: var(--text-dim);
}
.sprint-panel-archive-toggle {
  background: none;
  border: none;
  padding: 0;
  color: var(--accent);
  cursor: pointer;
  font: inherit;
  text-decoration: underline;
}
.sprint-panel-archive-list {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}
.sprint-panel-archive-item {
  border: 1px solid #3a2b2b;
  border-radius: 6px;
  background: #171212;
  padding: 10px 12px;
}
.sprint-panel-archive-item pre {
  margin: 8px 0 0;
}
.sprint-panel-context {
  margin: 0;
  padding: 10px 12px;
  background: #111;
  border-bottom: 1px solid var(--border);
  color: #9aa0a6;
  font-size: 0.76rem;
  white-space: pre-wrap;
}
.sprint-panel-status {
  margin: 8px 0 0;
  min-height: 1.1rem;
  font-size: 0.73rem;
  color: var(--text-dim);
}
.sprint-panel-status--error { color: #df8787; }
.sprint-panel-status--ok { color: #90d0a8; }
/* Sprint document preview — rendered markdown */
.sprint-doc-preview {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}
.sprint-doc-preview > .sprint-section-heading { margin-bottom: 18px; }
.sprint-doc-content {
  font-size: 0.875rem;
  line-height: 1.75;
  color: #cacaca;
}
.sprint-doc-content h1 {
  font-size: 1.35rem;
  font-weight: 800;
  color: #f0f0f0;
  margin: 0 0 10px;
  padding-bottom: 10px;
  border-bottom: 2px solid var(--accent);
  letter-spacing: -0.015em;
  line-height: 1.3;
}
.sprint-doc-content h2 {
  font-size: 1.05rem;
  font-weight: 700;
  color: #e4e4e4;
  margin: 24px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #2e2e2e;
}
.sprint-doc-content h3 {
  font-size: 0.92rem;
  font-weight: 700;
  color: #87c2df;
  margin: 18px 0 5px;
}
.sprint-doc-content h4 {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  margin: 14px 0 4px;
}
.sprint-doc-content p {
  margin: 0 0 10px;
  color: #c4c4c4;
}
.sprint-doc-content ul {
  list-style: none;
  padding-left: 16px;
  margin: 0 0 10px;
}
.sprint-doc-content ul li {
  position: relative;
  padding-left: 14px;
  margin-bottom: 3px;
}
.sprint-doc-content ul li::before {
  content: '–';
  position: absolute;
  left: 0;
  color: var(--accent);
  font-weight: 700;
}
.sprint-doc-content ol {
  padding-left: 22px;
  margin: 0 0 10px;
}
.sprint-doc-content ol li { margin-bottom: 3px; }
.sprint-doc-content code {
  font-family: 'SF Mono', 'Fira Code', 'Consolas', monospace;
  font-size: 0.82em;
  background: rgba(135,194,223,0.08);
  color: #87c2df;
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(135,194,223,0.15);
}
.sprint-doc-content pre {
  background: #141414;
  border: 1px solid #252525;
  border-radius: 6px;
  padding: 12px 14px;
  margin: 0 0 12px;
  overflow-x: auto;
}
.sprint-doc-content pre code {
  background: none;
  border: none;
  padding: 0;
  color: #b8c8c8;
  font-size: 0.82rem;
}
.sprint-doc-content blockquote {
  border-left: 3px solid var(--accent);
  padding: 3px 0 3px 14px;
  margin: 0 0 10px;
  color: var(--text-dim);
  font-style: italic;
}
.sprint-doc-content hr {
  border: none;
  border-top: 1px solid #2a2a2a;
  margin: 18px 0;
}
.sprint-doc-content strong { color: #f0f0f0; font-weight: 700; }
.sprint-doc-content em { color: #a8c8e8; font-style: italic; }
.sprint-doc-content del { color: var(--text-dim); opacity: 0.6; text-decoration: line-through; }
.sprint-doc-content a { color: var(--accent); text-decoration: none; }
.sprint-doc-content a:hover { text-decoration: underline; }
.md-cb { margin-right: 5px; opacity: 0.5; }
.md-cb--done { color: var(--accent); opacity: 1; }
/* CCP-648: action controls */
.sprint-action-panel .pre-wrap { margin-top: 8px; }
/* CCP-649: Next-phase copy button as primary CTA */
.sprint-action-panel--next .copy-btn,
.sprint-action-panel--next .sprint-panel-btn[data-sprint-panel-action="copy"] {
  background: rgba(74, 122, 74, 0.25);
  border-color: #4a7a4a;
  color: #9fd09f;
  font-weight: 700;
}
.sprint-action-panel--next .copy-btn:hover,
.sprint-action-panel--next .sprint-panel-btn[data-sprint-panel-action="copy"]:hover {
  background: #4a7a4a;
  border-color: #5a8a5a;
  color: #e8e8e8;
}
.sprint-action-panel--mismatch .copy-btn,
.sprint-action-panel--mismatch .sprint-panel-btn[data-sprint-panel-action="copy"] {
  background: rgba(122, 53, 53, 0.25);
  border-color: #7a3535;
  color: #df8787;
  font-weight: 700;
}
.sprint-action-panel--mismatch .copy-btn:hover,
.sprint-action-panel--mismatch .sprint-panel-btn[data-sprint-panel-action="copy"]:hover {
  background: #7a3535;
  border-color: #8a4545;
  color: #e8e8e8;
}
/* CCP-651: Responsive — action panels at narrow widths */
@media (max-width: 600px) {
  .sprint-action-panel { padding: 12px; }
  .sprint-panel-textarea { min-height: 170px; font-size: 0.7rem; }
  .sprint-action-panel__header { gap: 6px; }
}
/* Sprint detail panel — CCP-645 phase framing */
.sprint-detail-phase {
  border-top: 1px solid var(--border);
  padding-top: 14px;
  margin-top: 14px;
}
.sprint-phase__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.sprint-phase__header-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.sprint-phase__header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.sprint-phase__title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.sprint-phase__copy-btn {
  position: static;
  padding: 7px 10px;
  font-size: 0.73rem;
  white-space: nowrap;
}
.sprint-phase__copy-btn:hover {
  background: var(--accent);
  color: #111;
  border-color: var(--accent);
}
.sprint-phase__copy-btn.copied {
  background: var(--status-passed);
  color: #111;
  border-color: var(--status-passed);
}
.sprint-task-list {
  display: grid;
  gap: 8px;
  margin-top: 0;
}
.sprint-task {
  background: #1a1a1a;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px;
}
.sprint-expandable {
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.sprint-expandable:hover {
  border-color: #4b4b4b;
  background: #202020;
}
.sprint-expandable:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.sprint-task__head {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  align-items: flex-start;
}
.sprint-task__title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}
.sprint-task__meta {
  margin-top: 5px;
  color: var(--text-dim);
  font-size: 0.75rem;
}
.sprint-task__summary,
.sprint-next-step__summary,
.sprint-audit__summary {
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--text-dim);
}
.sprint-expand-hint {
  margin-top: 7px;
  font-size: 0.72rem;
  color: #87c2df;
  opacity: 0.85;
}
.sprint-expand-details[hidden] { display: none; }
.sprint-expand-details {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.06);
}
.sprint-expand-block {
  margin-top: 8px;
  color: var(--text-dim);
  font-size: 0.75rem;
  line-height: 1.45;
  white-space: pre-wrap;
  word-break: break-word;
}
.sprint-expand-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-dim);
  font-size: 0.75rem;
}
.sprint-expand-list li + li {
  margin-top: 5px;
}
.sprint-link-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 6px;
}
.sprint-link {
  display: inline-block;
  background: #232323;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 0.72rem;
  color: var(--text-dim);
}
/* Recommended next steps — CCP-645 actionable visual treatment */
.sprint-next-step {
  background: rgba(74,153,116,0.05);
  border: 1px solid rgba(74,153,116,0.18);
  border-left: 3px solid rgba(74,153,116,0.5);
  border-radius: 0 6px 6px 0;
  padding: 8px 12px;
}
.sprint-next-step__head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
}
.sprint-next-step__title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}
.sprint-next-step__reason {
  margin-top: 4px;
  font-size: 0.75rem;
  color: var(--text-dim);
}
/* Audit row in detail panel — CCP-645 */
.sprint-audit {
  background: #1a1a1a;
  border: 1px solid var(--border);
  border-left: 3px solid #5577a8;
  border-radius: 0 6px 6px 0;
  padding: 8px 12px;
}
.sprint-audit__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.sprint-audit__title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}
.sprint-audit__doc {
  margin-top: 3px;
  font-size: 0.75rem;
  color: var(--text-dim);
}
.sprint-audit__section-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin: 10px 0 5px;
}
.sprint-audit__task-outcomes {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}
.sprint-audit__findings {
  margin-top: 4px;
}
.sprint-audit__doc-body {
  margin-top: 6px;
  max-height: 400px;
  overflow-y: auto;
  white-space: pre-wrap;
  font-size: 0.73rem;
  font-family: monospace;
  color: var(--text-dim);
  line-height: 1.5;
  padding: 8px 10px;
  background: rgba(0,0,0,0.2);
  border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.06);
}
/* Section headings — CCP-645 stronger hierarchy */
.sprint-section-heading {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-dim);
  margin: 0 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #2a2a2a;
}
/* Unassigned prompts — CCP-645 lower visual weight */
.sprint-unassigned {
  opacity: 0.7;
}

/* Detail overlay */
.detail-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg);
  z-index: 100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
}
.detail-card {
  background: var(--bg-card);
  border: none;
  border-radius: 0;
  max-width: none;
  width: 100%;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  margin: 0;
  padding: 0;
}
body.detail-open { overflow: hidden; }
.detail-header-bar {
  width: 100%;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  flex-shrink: 0;
}
.detail-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 10px;
  max-width: 1100px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
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
.detail-body { padding: 16px 10px; max-width: 1100px; width: 100%; margin: 0 auto; box-sizing: border-box; }
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
.prompt-edit-shell {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #151515;
  overflow: hidden;
}
.prompt-edit-locked {
  margin: 0;
  padding: 12px 14px;
  background: #111;
  border-bottom: 1px solid var(--border);
  color: #9aa0a6;
  font-size: 0.8rem;
  white-space: pre-wrap;
}
.prompt-edit-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.prompt-edit-btn {
  background: #242424;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 12px;
  font-size: 0.8rem;
  cursor: pointer;
}
.prompt-edit-btn:hover { border-color: var(--accent); color: var(--accent); }
.prompt-edit-btn.prompt-edit-btn--primary {
  background: #17351f;
  border-color: #295e38;
  color: #bff0c7;
}
.prompt-edit-btn.prompt-edit-btn--danger {
  background: #331717;
  border-color: #6f3434;
  color: #f3b3b3;
}
.prompt-edit-btn.prompt-edit-btn--muted {
  color: var(--text-dim);
}
.prompt-edit-status {
  margin-top: 8px;
  font-size: 0.78rem;
  color: var(--text-dim);
}
.prompt-edit-status.prompt-edit-status--ok { color: #6fd08c; }
.prompt-edit-status.prompt-edit-status--error { color: #f28b82; }
.prompt-edit-textarea {
  width: 100%;
  min-height: 320px;
  border: none;
  outline: none;
  resize: vertical;
  background: #181818;
  color: #ddd;
  font: 0.84rem/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  padding: 14px;
  box-sizing: border-box;
}
.prompt-edit-preview {
  border-top: 1px solid var(--border);
  background: #101010;
  padding: 12px 14px;
}
.prompt-edit-preview h4 {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.prompt-diff {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font: 0.8rem/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.prompt-diff-line { display: block; padding: 1px 4px; border-radius: 4px; }
.prompt-diff-line--ctx { color: #b8b8b8; }
.prompt-diff-line--add { background: rgba(72, 187, 120, 0.16); color: #b9f6ca; }
.prompt-diff-line--remove { background: rgba(255, 107, 107, 0.14); color: #ffb3b3; text-decoration: line-through; }
.textarea-editor {
  background: #181818;
  font: 0.84rem/1.55 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.textarea-editor-locked {
  background: #111;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.textarea-editor-locked-line {
  color: #9aa0a6;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}
.textarea-editor-resize-wrap {
  position: relative;
}
.textarea-editor-input {
  display: block;
  width: 100%;
  min-height: 600px;
  background: transparent;
  color: #d7d7d7;
  border: none;
  outline: none;
  font: inherit;
  padding: 10px 12px;
  box-sizing: border-box;
  resize: vertical;
}
.textarea-editor-grip {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 22px;
  height: 22px;
  pointer-events: none;
}
.textarea-editor-grip::before,
.textarea-editor-grip::after {
  content: "";
  position: absolute;
  height: 2px;
  background: #aaa;
  border-radius: 1px;
  transition: background 0.12s;
}
.textarea-editor-grip::before {
  width: 5px;
  transform: translate(7px, 8px) rotate(-45deg);
}
.textarea-editor-grip::after {
  width: 12px;
  transform: translate(1px, 6px) rotate(-45deg);
}
.textarea-editor-resize-wrap:focus-within .textarea-editor-grip::before,
.textarea-editor-resize-wrap:focus-within .textarea-editor-grip::after {
  background: #6bbfbf;
}
.prompt-detail-note {
  margin: 10px 0 0;
  font-size: 0.82rem;
  color: var(--text-dim);
}
.prompt-archive-toggle {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  font: inherit;
  text-decoration: underline;
}
.prompt-archive-list {
  margin-top: 10px;
  display: grid;
  gap: 10px;
}
.prompt-archive-card {
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px 12px;
  background: #141414;
}
.prompt-archive-card--retired {
  border-color: #7a2b2b;
  background: #1d1111;
}
.prompt-archive-card h4 {
  margin: 0 0 6px;
  font-size: 0.82rem;
  color: var(--text);
}
.prompt-archive-warning {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 8px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(210, 74, 74, 0.18);
  color: #ffb4b4;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}
.prompt-archive-meta {
  margin: 0 0 8px;
  font-size: 0.76rem;
  color: var(--text-dim);
}

@media (max-width: 700px) {
  .container { padding: 10px; }
  .detail-meta { grid-template-columns: 1fr; }
  .detail-meta dt { margin-top: 6px; }
  td.title { max-width: none; }
}
/* CCP-647 — Sprint tab responsive */
@media (max-width: 720px) {
  .sprint-toolbar { gap: 5px; }
  .sprint-toolbar .filter-btn { font-size: 0.74rem; padding: 3px 8px; }
  .sprint-card { padding: 16px; gap: 12px; }
  .detail-overlay { padding: 0; }
  .sprint-phase__title { font-size: 0.8rem; }
  .sprint-phase__header { align-items: flex-start; }
  .sprint-phase__header-actions {
    width: 100%;
    justify-content: flex-start;
  }
}
/* CCP-647 — Focus states for sprint filter buttons */
.filter-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.sprint-card:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
/* CCP-647 — Pill wrapping on narrow cards */
.sprint-pills { row-gap: 4px; }
</style>
</head>
<body>

<div class="header">
  <a class="header__brand" href="#">Patzer Pro</a>
  <span class="header__title">Tracking Dashboard</span>
  <a class="header__nav-link" href="${lookbookUrl}" target="_blank">UI Lookbook</a>
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
    <div id="pagination" class="pagination"></div>
    <div class="count-label" id="count-label"></div>
  </section>
  <section class="panel" id="panel-sprints" hidden>
    <div class="sprint-tab-section">
      <div class="sprint-toolbar" id="sprint-filter-buttons"></div>
    </div>
    <div class="sprint-grid" id="sprint-list"></div>
    <div class="count-label" id="sprint-count-label"></div>
  </section>
</div>

<div class="detail-overlay" id="detail" style="display:none">
  <div class="detail-card">
    <div class="detail-header-bar">
      <div class="detail-header">
        <h2 id="detail-title"></h2>
        <button class="detail-close" id="detail-close">&times;</button>
      </div>
    </div>
    <div class="detail-body" id="detail-body"></div>
  </div>
</div>

<script>
let PROMPTS = ${JSON.stringify(promptData)};
let SPRINTS = ${JSON.stringify(sprintData)};
const GENERATED_AT = '${generatedAt}';

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
    const activePrompts = registry.prompts.filter(p => p.status !== 'superseded' && !p.hiddenFromDashboard);
    const supersededByPromptId = new Map();
    for (const archived of registry.prompts.filter(p => p.status === 'superseded' || p.retiredReferenceOnly)) {
      const key = archived.supersededFromPromptId;
      if (!key) continue;
      if (!supersededByPromptId.has(key)) supersededByPromptId.set(key, []);
      supersededByPromptId.get(key).push({
        id: archived.id,
        supersededAt: archived.supersededAt || '',
        body: archived.archivedPromptBody || '',
      });
    }
    for (const versions of supersededByPromptId.values()) {
      versions.sort((a, b) => String(a.supersededAt || '').localeCompare(String(b.supersededAt || '')));
    }

    const livePrompts = [];
    for (const p of activePrompts) {
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
        lastEditedAt: p.lastEditedAt || '',
        skippedAt: p.skippedAt || '',
        startedAt: p.startedAt || '',
        status: p.status || 'created',
        reviewOutcome: p.reviewOutcome || 'pending',
        reviewIssues: p.reviewIssues || 'none',
        queueState: p.queueState || 'not-queued',
        claudeUsed: p.claudeUsed || false,
        kind: p.kind || 'normal',
        notes: p.notes || 'none',
        skipReason: p.skipReason || '',
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
        editable: p.status === 'created' && p.queueState === 'queued-pending',
        skippable: p.status === 'created' && p.queueState === 'queued-pending',
        archivedVersions: supersededByPromptId.get(p.id) || [],
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
  if (p.status === 'skipped') return 'SKIPPED: NOT RUNNABLE';
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
  if (p.status === 'skipped') return 'status--skipped';
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
let currentPage = 1;
const PAGE_SIZE = 200;
let sortPreset = 'next-up';
let activeTab = readInitialTab();
let sprintFilter = 'all';

function normalizeTab(value) {
  return value === 'sprints' ? 'sprints' : 'prompts';
}

function currentUrl() {
  return new URL(window.location.href);
}

function readInitialTab() {
  try {
    return normalizeTab(currentUrl().searchParams.get('tab'));
  } catch {
    return 'prompts';
  }
}

function syncTabToUrl() {
  const url = currentUrl();
  url.searchParams.set('tab', normalizeTab(activeTab));
  history.replaceState(null, '', url.toString());
}


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
  { label: 'Notes',         value: 'multi:notes' },
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
      currentPage = 1;
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
    } else if (filterStatus === 'multi:notes') {
      list = list.filter(p => p.reviewOutcome === 'passed with notes');
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

  // Build reverse index: childId → manager prompt, so we can deduplicate below.
  function applyManagerDedup(list) {
    const childToManager = new Map();
    for (const p of PROMPTS) {
      if (p.kind === 'manager' && Array.isArray(p.batchPromptIds)) {
        for (const childId of p.batchPromptIds) {
          childToManager.set(childId, p);
        }
      }
    }
    const seen = new Set();
    const result = [];
    for (const p of list) {
      const mgr = childToManager.get(p.id);
      const effective = mgr || p;
      if (!seen.has(effective.id)) {
        seen.add(effective.id);
        result.push(effective);
      }
    }
    return result;
  }

  const PRIO_TIER = { critical: 0, high: 1, low: 3 };
  let urgent = PROMPTS.filter(isUrgent).sort((a, b) => {
    const pa = PRIO_TIER[a.priority] ?? 2, pb = PRIO_TIER[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.createdAt || '').localeCompare(a.createdAt || '') || idNum(b) - idNum(a);
  });
  urgent = applyManagerDedup(urgent);

  let isFallback = false;
  if (urgent.length === 0) {
    // Fallback: up to 5 queued-pending prompts in completion order (lowest ID first).
    const allQueued = PROMPTS
      .filter(p => p.queueState === 'queued-pending')
      .sort((a, b) => idNum(a) - idNum(b));
    const deduped = applyManagerDedup(allQueued);
    urgent = deduped.slice(0, 5);
    isFallback = true;
  }

  if (urgent.length === 0) {
    block.classList.remove('is-visible');
    return;
  }
  const suffix = isFallback ? ' — queued' : '';
  countEl.textContent = urgent.length + ' prompt' + (urgent.length !== 1 ? 's' : '') + suffix;
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
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);
  const tbody = document.getElementById('prompt-list');
  tbody.innerHTML = pageItems.map(p => {
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
  document.getElementById('count-label').textContent = list.length + ' of ' + PROMPTS.length + ' prompts' +
    (totalPages > 1 ? ' — page ' + currentPage + ' of ' + totalPages : '');
  renderPaginationControls(totalPages);
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

function renderPaginationControls(totalPages) {
  const el = document.getElementById('pagination');
  if (!el) return;
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  const parts = [];
  parts.push('<button class="page-btn" id="page-prev"' + (currentPage <= 1 ? ' disabled' : '') + '>&#8592; Prev</button>');
  const pages = paginationPageNumbers(currentPage, totalPages);
  for (const p of pages) {
    if (p === '...') {
      parts.push('<span class="page-ellipsis">\u2026</span>');
    } else {
      parts.push('<button class="page-btn' + (p === currentPage ? ' active' : '') + '" data-page="' + p + '">' + p + '</button>');
    }
  }
  parts.push('<button class="page-btn" id="page-next"' + (currentPage >= totalPages ? ' disabled' : '') + '>Next &#8594;</button>');
  el.innerHTML = parts.join('');
  el.querySelector('#page-prev')?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderList(); scrollToPromptTop(); } });
  el.querySelector('#page-next')?.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; renderList(); scrollToPromptTop(); } });
  el.querySelectorAll('.page-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => { currentPage = Number(btn.dataset.page); renderList(); scrollToPromptTop(); });
  });
}

function paginationPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current]);
  for (let d = 1; d <= 2; d++) { if (current - d >= 1) pages.add(current - d); if (current + d <= total) pages.add(current + d); }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  let prev = 0;
  for (const p of sorted) { if (p - prev > 1) result.push('...'); result.push(p); prev = p; }
  return result;
}

function scrollToPromptTop() {
  document.querySelector('.prompt-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// CCP-643: Human-readable sprint status labels
function sprintStatusLabel(status) {
  const labels = {
    'Needs Prompts': 'Needs Prompts',
    'Ready to Start': 'Ready to Start',
    'In Progress': 'In Progress',
    'Completed Needs Full Review': 'Completed Needs Full Review',
    'Completed: With Issues': 'Completed: With Issues',
    'Completed: Reviews Passed': 'Completed: Reviews Passed',
    'Incomplete Start State': 'Incomplete Start State',
    'Completed': 'Completed',
    'Completed: Issues Found': 'Completed: Issues Found',
    'Completed: Review Passed': 'Completed: Review Passed',
  };
  return labels[status] || status;
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
    list = list.filter(sprint => ['Needs Prompts', 'Ready to Start', 'In Progress'].includes(sprint.status));
  } else if (sprintFilter === 'needs-attention') {
    list = list.filter(sprint => ['Needs Prompts', 'Ready to Start', 'In Progress', 'Completed Needs Full Review', 'Completed: With Issues'].includes(sprint.status));
  } else if (sprintFilter === 'completed') {
    list = list.filter(sprint => ['Completed Needs Full Review', 'Completed: With Issues', 'Completed: Reviews Passed'].includes(sprint.status));
  }
  const sortTier = s => {
    if (s.status === 'Completed: Reviews Passed') return 2;
    if ((s.status || '').startsWith('Completed')) return 1;
    return 0;
  };
  return list.sort((a, b) => {
    const diff = sortTier(a) - sortTier(b);
    if (diff !== 0) return diff;
    return (b.updatedAt || '').localeCompare(a.updatedAt || '') || a.title.localeCompare(b.title);
  });
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

// CCP-662: relative time helper
function relativeTime(iso) {
  if (!iso) return 'unknown';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff >= 0 && diff < 60000) return 'just now';
  if (diff >= 0 && diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff >= 0 && diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'yesterday';
  if (days < 30) return days + 'd ago';
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return weeks + 'w ago';
  const months = Math.floor(days / 30);
  return months + 'mo ago';
}

function sprintRecencyInfo(iso) {
  if (!iso) {
    return {
      dotClass: 'sprint-card__recency-dot--stale',
      label: 'Last updated unknown',
      title: 'Unknown update time',
    };
  }
  const updated = new Date(iso);
  if (Number.isNaN(updated.getTime())) {
    return {
      dotClass: 'sprint-card__recency-dot--stale',
      label: 'Last updated unknown',
      title: iso,
    };
  }
  const diff = Date.now() - updated.getTime();
  const withinDay = diff >= 0 && diff < 86400000;
  if (withinDay) {
    return {
      dotClass: 'sprint-card__recency-dot--recent',
      label: 'Updated ' + relativeTime(iso),
      title: fmtDate(iso),
    };
  }
  return {
    dotClass: 'sprint-card__recency-dot--stale',
    label: 'Last updated ' + fmtDateShort(iso),
    title: fmtDate(iso),
  };
}

function renderSprints() {
  const list = filterSprints();
  const el = document.getElementById('sprint-list');
  el.innerHTML = list.map(sprint => {
    const statusClass = 'sprint-status sprint-status--' + sprint.statusSlug;
    // CCP-662: status border class mapped from sprint status slug
    const statusBorderClass = {
      'needs-prompts': 'sprint-card--needs-prompts',
      'incomplete-start-state': 'sprint-card--incomplete-start',
      'ready-to-start': 'sprint-card--ready-to-start',
      'in-progress': 'sprint-card--in-progress',
      'completed-needs-full-review': 'sprint-card--needs-review',
      'completed-with-issues': 'sprint-card--completed-issues',
      'completed-issues-found': 'sprint-card--completed-issues',
      'completed-reviews-passed': 'sprint-card--completed',
      'completed-review-passed': 'sprint-card--completed',
      'superseded': 'sprint-card--superseded',
      'retired': 'sprint-card--retired',
      'completed': 'sprint-card--completed',
    }[sprint.statusSlug] || '';
    const warnClass = sprint.showNormalizationWarning ? ' sprint-card--warn' : '';

    // CCP-662: trimmed pills — remove task count and linked count, keep signal-only pills
    const statsPills = [
      sprint.promptsUnreviewedCount > 0
        ? '<span class="sprint-pill--warn">&#9679; ' + sprint.promptsUnreviewedCount + ' unreviewed</span>'
        : '',
      (sprint.auditRefs || []).length > 0 ? '<span class="sprint-pill">' + (sprint.auditRefs || []).length + ' audit' + ((sprint.auditRefs || []).length !== 1 ? 's' : '') + '</span>' : '',
      (sprint.recommendedNextSteps || []).length > 0 ? '<span class="sprint-pill">' + (sprint.recommendedNextSteps || []).length + ' next step' + ((sprint.recommendedNextSteps || []).length !== 1 ? 's' : '') + '</span>' : '',
      sprint.nextAvailablePhase ? '<span class="sprint-pill">next: ' + esc(sprint.nextAvailablePhase.title) + '</span>' : '',
    ].filter(Boolean).join('');
    const depPills = (sprint.dependencySprintIds || []).map(id =>
      '<span class="sprint-pill--dep">&#8594; ' + esc(id) + '</span>'
    ).join('');
    const allPills = statsPills + depPills;

    // CCP-644: per-metric progress rows — CCP-662: rename Plan→Prompts, drop segmented bar
    const planPct = sprint.planCoveragePct;
    const execPct = sprint.executionPct;
    const implPct = sprint.implementationPct;
    const progressMetrics =
      '<div class="progress-metric">' +
        '<span class="progress-metric__label">Prompts</span>' +
        '<div class="progress-metric__bar"><div class="progress-metric__fill progress-metric__fill--plan" style="width:' + planPct + '%"></div></div>' +
        '<span class="progress-metric__value">' + planPct + '%</span>' +
      '</div>' +
      '<div class="progress-metric">' +
        '<span class="progress-metric__label">Execution</span>' +
        '<div class="progress-metric__bar"><div class="progress-metric__fill progress-metric__fill--exec" style="width:' + execPct + '%"></div></div>' +
        '<span class="progress-metric__value">' + execPct + '%</span>' +
      '</div>' +
      '<div class="progress-metric progress-metric--impl">' +
        '<span class="progress-metric__label">Implementation</span>' +
        '<div class="progress-metric__bar"><div class="progress-metric__fill progress-metric__fill--impl" style="width:' + implPct + '%"></div></div>' +
        '<span class="progress-metric__value">' + implPct + '%</span>' +
      '</div>';
    const recency = sprintRecencyInfo(sprint.updatedAt || sprint.createdAt);

    // CCP-662: structured card with status border, warn tint, recency footer
    return '<article class="sprint-card ' + statusBorderClass + warnClass + '" data-sprint-id="' + sprint.id + '" tabindex="0">' +
      '<div class="sprint-card__header">' +
        '<div class="sprint-card__title-block">' +
          '<div class="sprint-card__title">' + esc(sprint.title) + '</div>' +
          '<div class="sprint-card__doc">' + esc((sprint.sourceDocument || '').split('/').pop() || sprint.sourceDocument) + '</div>' +
        '</div>' +
        '<span class="' + statusClass + '">' + esc(sprintStatusLabel(sprint.status)) + '</span>' +
      '</div>' +
      '<div class="progress-stack">' + progressMetrics + '</div>' +
      (sprint.completionSummary ? '<div class="sprint-card__summary">' + esc(sprint.completionSummary) + '</div>' : '') +
      (allPills ? '<div class="sprint-pills">' + allPills + '</div>' : '') +
      '<div class="sprint-card__recency" title="' + esc(recency.title) + '">' +
        '<span class="sprint-card__recency-dot ' + recency.dotClass + '"></span>' +
        '<span class="sprint-card__recency-text">' + esc(recency.label) + '</span>' +
      '</div>' +
      (sprint.createdAt ? '<div class="sprint-card__created-at">Created: ' + esc(fmtDate(sprint.createdAt)) + '</div>' : '') +
      '</article>';
  }).join('');
  document.getElementById('sprint-count-label').textContent = list.length + ' of ' + SPRINTS.length + ' sprints';
  el.querySelectorAll('.sprint-card').forEach(card => {
    card.addEventListener('click', () => openSprintDetail(card.dataset.sprintId));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSprintDetail(card.dataset.sprintId); }
    });
  });
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function isLiveDashboard() {
  return location.protocol !== 'file:';
}

function localDashboardInstructions(subject) {
  return subject + ' requires the local dashboard server. Run: node server.mjs . Then open: http://localhost:3001/dashboard';
}

function sprintPanelTextareaId(sprintId, panel) {
  return 'sprint-panel-' + panel + '-' + sprintId;
}

function sprintPanelStatusId(sprintId, panel) {
  return 'sprint-panel-status-' + panel + '-' + sprintId;
}

function sprintPanelDefaultText(sprint, panel) {
  switch (panel) {
    case 'audit': return sprint.auditPromptTemplateDefault || '';
    case 'mismatch': return sprint.mismatchFollowUpTemplateDefault || '';
    case 'nextPhase': return sprint.nextPromptsTemplateDefault || '';
    case 'appendRequest': return sprint.appendRequestTemplateDefault || '';
    default: return '';
  }
}

function sprintPanelRenderedText(sprint, panel) {
  switch (panel) {
    case 'audit': return sprint.auditPromptTemplateRendered || sprint.auditPromptTemplate || '';
    case 'mismatch': return sprint.mismatchFollowUpTemplateRendered || sprint.mismatchFollowUpTemplate || '';
    case 'nextPhase': return sprint.nextPromptsTemplateRendered || sprint.nextPromptsTemplate || '';
    case 'appendRequest': return sprint.appendRequestTemplateRendered || '';
    default: return '';
  }
}

function sprintPanelCopyLabel(panel) {
  switch (panel) {
    case 'audit': return 'Copy Audit Prompt';
    case 'mismatch': return 'Copy Fix Prompt';
    case 'nextPhase': return 'Copy Next-Phase Prompt';
    case 'appendRequest': return 'Copy Sprint Update Prompt';
    default: return 'Copy';
  }
}

function sprintPanelSavedNote(sprint, panel) {
  return sprint.panelNotes && sprint.panelNotes[panel] ? String(sprint.panelNotes[panel].text || '') : '';
}

function sprintPanelLastEditedAt(sprint, panel) {
  return sprint.panelNotes && sprint.panelNotes[panel] ? String(sprint.panelNotes[panel].lastEditedAt || '') : '';
}

function sprintPanelHistory(sprint, panel) {
  return sprint.panelNotes && sprint.panelNotes[panel] && Array.isArray(sprint.panelNotes[panel].history)
    ? sprint.panelNotes[panel].history
    : [];
}

function sprintPanelEditKey(sprintId, panel) {
  return sprintId + '::' + panel;
}

function sprintPanelPreviewId(sprintId, panel) {
  return sprintPanelTextareaId(sprintId, panel) + '-preview';
}

function sprintPanelArchiveId(sprintId, panel) {
  return sprintPanelTextareaId(sprintId, panel) + '-archive';
}

function sprintPanelCurrentBody(sprint, panel) {
  return sprintPanelRenderedText(sprint, panel);
}

function sprintPanelContextLines(sprint, panel) {
  const lines = [
    'Sprint ID: ' + sprint.id,
    'Panel: ' + panel,
    'Source Sprint Doc: ' + (sprint.sourceDocument || 'unknown'),
  ];
  if (panel === 'nextPhase' && sprint.nextAvailablePhase) {
    lines.push('Next Phase: ' + sprint.nextAvailablePhase.id + ' — ' + sprint.nextAvailablePhase.title);
  }
  if (panel === 'mismatch' && sprint.mismatchTasks && sprint.mismatchTasks.length) {
    lines.push('Mismatch Tasks: ' + sprint.mismatchTasks.map(task => task.id).join(', '));
  }
  return lines.join('\\n');
}

function summarizeText(text, maxLength = 110) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, maxLength - 1).trimEnd() + '…';
}

function updateSprintRecord(updatedSprint) {
  const index = SPRINTS.findIndex(entry => entry.id === updatedSprint.id);
  if (index >= 0) SPRINTS[index] = updatedSprint;
  else SPRINTS.push(updatedSprint);
}

function setSprintPanelStatus(sprintId, panel, message, tone = '') {
  const status = document.getElementById(sprintPanelStatusId(sprintId, panel));
  if (!status) return;
  status.className = 'sprint-panel-status' + (tone ? ' sprint-panel-status--' + tone : '');
  status.textContent = message || '';
}

const sprintPanelEditStates = {};

function renderSprintPromptPanel({ sprint, panel, variantClass, title, badge = '', meta = '', note = '', phaseContext = '', taskPills = '', collapsed = false }) {
  const statusId = sprintPanelStatusId(sprint.id, panel);
  const wrapId = sprintPanelTextareaId(sprint.id, panel) + '-wrap';
  const renderedText = sprintPanelRenderedText(sprint, panel);
  const savedNote = sprintPanelSavedNote(sprint, panel);
  const history = sprintPanelHistory(sprint, panel);
  const lastEditedAt = sprintPanelLastEditedAt(sprint, panel);
  const editState = sprintPanelEditStates[sprintPanelEditKey(sprint.id, panel)];
  const isEditing = !!editState;
  const shownBody = isEditing ? editState.current : renderedText;
  const saveNoteHint = isLiveDashboard()
    ? (savedNote ? 'Saved note is already layered into this prompt. Add more context below the generated body, then save.' : 'Add your own context below the generated prompt, then save it for this sprint.')
    : localDashboardInstructions('Sprint panel editing');

  return '<div class="sprint-action-panel ' + variantClass + '">' +
    '<div class="sprint-action-panel__header">' +
      '<p class="sprint-action-panel__title">' + esc(title) + '</p>' +
      (badge ? '<span class="sprint-action-panel__badge' + (panel === 'mismatch' ? ' sprint-action-panel__badge--mismatch' : '') + '">' + esc(badge) + '</span>' : '') +
    '</div>' +
    (meta ? '<p class="sprint-action-panel__meta">' + esc(meta) + '</p>' : '') +
    (phaseContext || '') +
    (taskPills || '') +
    '<p class="sprint-panel-note">' + esc(saveNoteHint) + '</p>' +
    '<div class="sprint-panel-controls' + (collapsed ? ' sprint-panel-controls--compact' : '') + '">' +
      '<button class="sprint-panel-btn copy-btn" data-sprint-panel-action="copy" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">' + esc(sprintPanelCopyLabel(panel)) + '</button>' +
      (collapsed && !isEditing
        ? '<button class="sprint-panel-btn" data-sprint-panel-action="toggle" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '" aria-expanded="false" aria-controls="' + wrapId + '">Expand Prompt</button>'
        : '') +
      (isEditing
        ? (editState.confirming
            ? '<button class="sprint-panel-btn" data-sprint-panel-action="confirm-save" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">Confirm Save</button>' +
              '<button class="sprint-panel-btn" data-sprint-panel-action="back-edit" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">Back to Editing</button>'
            : '<button class="sprint-panel-btn" data-sprint-panel-action="save" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">Save</button>' +
              '<button class="sprint-panel-btn" data-sprint-panel-action="cancel" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">Cancel</button>' +
              '<button class="sprint-panel-btn" data-sprint-panel-action="reset" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">Reset to Saved</button>')
        : '<button class="sprint-panel-btn" data-sprint-panel-action="edit" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">' + (isLiveDashboard() ? 'Edit' : 'Edit (localhost only)') + '</button>') +
      '<button class="sprint-panel-btn" data-sprint-panel-action="clear" data-sprint-id="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '">Clear Saved Note</button>' +
    '</div>' +
    '<div class="sprint-panel-textarea-wrap" id="' + wrapId + '"' + (collapsed && !isEditing ? ' hidden' : '') + '>' +
      (isEditing
        ? '<div class="prompt-edit-shell">' +
            renderTextareaEditor('sprint', sprint.id + '::' + panel, editState, { lockedText: sprintPanelContextLines(sprint, panel) }) +
          '</div>'
        : '<div class="sprint-panel-preview" id="' + sprintPanelPreviewId(sprint.id, panel) + '-static">' +
            ((lastEditedAt && history.length)
              ? renderPromptDiffHtml(history[history.length - 1].body || '', shownBody)
              : '<pre class="sprint-panel-view">' + esc(shownBody) + '</pre>') +
          '</div>') +
    '</div>' +
    (lastEditedAt ? '<div class="sprint-panel-last-edited">Last edited: ' + esc(fmtDate(lastEditedAt) || lastEditedAt) + '</div>' : '') +
    (history.length && !isEditing
      ? '<div class="sprint-panel-last-edited">there is a superseded version of this panel available here <button class="sprint-panel-archive-toggle" data-sprint-panel-archive-toggle="' + esc(sprint.id) + '" data-sprint-panel="' + panel + '" aria-expanded="false" aria-controls="' + sprintPanelArchiveId(sprint.id, panel) + '">toggle history</button></div>' +
        '<div class="sprint-panel-archive-list" id="' + sprintPanelArchiveId(sprint.id, panel) + '" hidden>' +
          history.map(entry =>
            '<div class="sprint-panel-archive-item">' +
              '<div class="prompt-archive-warning">Archived version</div>' +
              '<div class="prompt-archive-meta">Archived ' + esc(fmtDate(entry.archivedAt) || entry.archivedAt || 'unknown') + '</div>' +
              '<pre class="sprint-panel-view">' + esc(entry.body || '') + '</pre>' +
            '</div>'
          ).join('') +
        '</div>'
      : '') +
    '<div class="sprint-panel-status" id="' + statusId + '"></div>' +
    '</div>';
}

async function saveSprintPanelNote(sprintId, panel, clear = false) {
  const sprint = SPRINTS.find(entry => entry.id === sprintId);
  const state = sprintPanelEditStates[sprintPanelEditKey(sprintId, panel)];
  if (!sprint) return;
  if (!isLiveDashboard()) {
    setSprintPanelStatus(sprintId, panel, localDashboardInstructions('Sprint panel editing'), 'error');
    return;
  }

  setSprintPanelStatus(sprintId, panel, clear ? 'Clearing saved note…' : 'Saving note…');
  try {
    const response = await fetch(clear ? '/api/sprint-panel-note/clear' : '/api/sprint-panel-note', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(clear ? { sprintId, panel } : { sprintId, panel, body: state ? normalizePromptBody(state.current) : sprintPanelRenderedText(sprint, panel) }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || ('Request failed with status ' + response.status));
    }
    if (payload.sprint) {
      delete sprintPanelEditStates[sprintPanelEditKey(sprintId, panel)];
      updateSprintRecord(payload.sprint);
      renderSprintFilters();
      renderSprints();
      openSprintDetail(sprintId);
      setSprintPanelStatus(sprintId, panel, clear ? 'Saved note cleared.' : 'Saved panel updated.', 'ok');
    }
  } catch (error) {
    setSprintPanelStatus(sprintId, panel, error instanceof Error ? error.message : String(error), 'error');
  }
}

function startSprintPanelEdit(sprint, panel) {
  const body = normalizePromptBody(sprintPanelCurrentBody(sprint, panel));
  sprintPanelEditStates[sprintPanelEditKey(sprint.id, panel)] = {
    original: body,
    current: body,
    confirming: false,
  };
}

function cancelSprintPanelEdit(sprint, panel) {
  const key = sprintPanelEditKey(sprint.id, panel);
  const state = sprintPanelEditStates[key];
  const changed = state && state.original !== normalizePromptBody(state.current);
  if (changed && !window.confirm('Discard unsaved sprint panel edits?')) return false;
  delete sprintPanelEditStates[key];
  return true;
}

function resetSprintPanelEdit(sprint, panel) {
  const key = sprintPanelEditKey(sprint.id, panel);
  const state = sprintPanelEditStates[key];
  if (!state) return;
  const body = normalizePromptBody(sprintPanelCurrentBody(sprint, panel));
  state.original = body;
  state.current = body;
  state.confirming = false;
}

let promptEditState = null;

function normalizePromptBody(body) {
  return String(body || '').replace(/\\r\\n/g, '\\n').replace(/\\s+$/, '');
}

function lockedPromptMetadataLines(prompt) {
  const lines = [
    'Prompt ID: ' + prompt.id,
    'Task ID: ' + (prompt.taskId || 'none'),
    'Source Document: ' + (prompt.sourceDocument || 'none'),
    'Source Step: ' + (prompt.sourceStep || 'none'),
    'Execution Target: ' + (prompt.executionTarget || 'none'),
  ];
  if (prompt.parentPromptId) lines.splice(2, 0, 'Parent Prompt ID: ' + prompt.parentPromptId);
  return lines.join('\\n');
}

function splitPromptEditorBody(prompt) {
  const lockedText = lockedPromptMetadataLines(prompt);
  const lockedLines = lockedText ? lockedText.split('\\n') : [];
  const storedBody = normalizePromptBody(prompt.body || '');
  const bodyLines = storedBody ? storedBody.split('\\n') : [];
  let includesLockedMetadata = lockedLines.length > 0 && bodyLines.length >= lockedLines.length;

  for (let i = 0; includesLockedMetadata && i < lockedLines.length; i += 1) {
    if (bodyLines[i] !== lockedLines[i]) includesLockedMetadata = false;
  }

  let editableLines = bodyLines;
  if (includesLockedMetadata) {
    editableLines = bodyLines.slice(lockedLines.length);
    if (editableLines[0] === '') editableLines = editableLines.slice(1);
  }

  return {
    lockedText,
    editableBody: editableLines.join('\\n'),
    includesLockedMetadata,
  };
}

function composePromptEditorBody(prompt, editableBody, split = null) {
  const body = normalizePromptBody(editableBody);
  const sections = split || splitPromptEditorBody(prompt);
  if (!sections.includesLockedMetadata) return body;
  if (!sections.lockedText) return body;
  return sections.lockedText + (body ? '\\n\\n' + body : '');
}

function renderTextareaEditor(ownerType, ownerId, state, { lockedText = '' } = {}) {
  const lockedLines = lockedText ? lockedText.split('\\n') : [];
  let html = '<div class="textarea-editor">';
  if (lockedLines.length) {
    html += '<div class="textarea-editor-locked">';
    for (const line of lockedLines) {
      html += '<div class="textarea-editor-locked-line">' + esc(line) + '</div>';
    }
    html += '</div>';
  }
  if (state.confirming) {
    html += renderPromptDiffHtml(state.original, state.current);
  } else {
    html += '<div class="textarea-editor-resize-wrap">' +
      '<textarea class="textarea-editor-input" data-textarea-editor-owner-type="' + ownerType + '" data-textarea-editor-owner-id="' + esc(ownerId) + '">' + esc(state.current) + '</textarea>' +
      '<div class="textarea-editor-grip"></div>' +
      '</div>';
  }
  html += '</div>';
  return html;
}

function buildPromptDiffOps(beforeText, afterText) {
  const before = normalizePromptBody(beforeText).split('\\n');
  const after = normalizePromptBody(afterText).split('\\n');
  const rows = before.length;
  const cols = after.length;
  const dp = Array.from({ length: rows + 1 }, () => Array(cols + 1).fill(0));
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      dp[i][j] = before[i] === after[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (before[i] === after[j]) {
      ops.push({ type: 'context', line: before[i] });
      i += 1;
      j += 1;
      continue;
    }
    if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: 'remove', line: before[i] });
      i += 1;
    } else {
      ops.push({ type: 'add', line: after[j] });
      j += 1;
    }
  }
  while (i < rows) ops.push({ type: 'remove', line: before[i++] });
  while (j < cols) ops.push({ type: 'add', line: after[j++] });
  return ops;
}

function summarizePromptDiff(beforeText, afterText) {
  const ops = buildPromptDiffOps(beforeText, afterText);
  const added = ops.filter(op => op.type === 'add').map(op => op.line).filter(Boolean);
  const removed = ops.filter(op => op.type === 'remove').map(op => op.line).filter(Boolean);
  const lines = [
    'Are you sure you want to overwrite this prompt body?',
    '',
    'Added (' + added.length + '):',
    ...(added.length ? added.slice(0, 12).map(line => '+ ' + line) : ['(none)']),
    '',
    'Removed (' + removed.length + '):',
    ...(removed.length ? removed.slice(0, 12).map(line => '- ' + line) : ['(none)']),
  ];
  if (added.length > 12 || removed.length > 12) {
    lines.push('', 'Only the first 12 changed lines from each side are shown here.');
  }
  return lines.join('\\n');
}

function renderPromptDiffHtml(beforeText, afterText) {
  const ops = buildPromptDiffOps(beforeText, afterText);
  if (!ops.some(op => op.type !== 'context')) {
    return '<div class="prompt-detail-note">No prompt-body changes yet.</div>';
  }
  return '<pre class="prompt-diff">' + ops.map(op => {
    const klass = op.type === 'add' ? 'prompt-diff-line--add' : op.type === 'remove' ? 'prompt-diff-line--remove' : 'prompt-diff-line--ctx';
    const prefix = op.type === 'add' ? '+ ' : op.type === 'remove' ? '- ' : '  ';
    return '<span class="prompt-diff-line ' + klass + '">' + esc(prefix + op.line) + '</span>';
  }).join('') + '</pre>';
}

function promptEditStatusId(id) {
  return 'prompt-edit-status-' + id;
}

function promptEditTextareaId(id) {
  return 'prompt-edit-textarea-' + id;
}

function promptDiffPreviewId(id) {
  return 'prompt-diff-preview-' + id;
}

function promptArchiveWrapId(id) {
  return 'prompt-archive-wrap-' + id;
}

function promptBodySectionId(id) {
  return 'prompt-body-section-' + id;
}

function setPromptEditStatus(id, message, tone = '') {
  const el = document.getElementById(promptEditStatusId(id));
  if (!el) return;
  el.className = 'prompt-edit-status' + (tone ? ' prompt-edit-status--' + tone : '');
  el.textContent = message || '';
}

function currentPromptEditDraft(prompt) {
  if (!promptEditState || promptEditState.promptId !== prompt.id) return splitPromptEditorBody(prompt).editableBody;
  return promptEditState.current;
}

function updatePromptDiffPreview(prompt) {
  const preview = document.getElementById(promptDiffPreviewId(prompt.id));
  if (!preview) return;
  preview.innerHTML = renderPromptDiffHtml(splitPromptEditorBody(prompt).editableBody, currentPromptEditDraft(prompt));
}

function resetPromptEditState(prompt) {
  const sections = splitPromptEditorBody(prompt);
  promptEditState = {
    promptId: prompt.id,
    lockedText: sections.lockedText,
    includesLockedMetadata: sections.includesLockedMetadata,
    original: sections.editableBody,
    current: sections.editableBody,
    confirming: false,
  };
}

function rerenderPromptBodySection(promptId, { statusMessage = '', statusTone = '' } = {}) {
  const prompt = PROMPTS.find(entry => entry.id === promptId);
  if (!prompt) return;
  const wrap = document.getElementById(promptBodySectionId(promptId));
  if (!wrap) {
    openDetail(promptId);
    if (statusMessage) setPromptEditStatus(promptId, statusMessage, statusTone);
    return;
  }
  wrap.outerHTML = renderPromptBodySection(prompt);
  if (statusMessage) setPromptEditStatus(promptId, statusMessage, statusTone);
}

function cancelPromptEdit(prompt) {
  const changed = promptEditState && promptEditState.promptId === prompt.id && normalizePromptBody(promptEditState.original) !== normalizePromptBody(promptEditState.current);
  if (changed && !window.confirm('Discard unsaved prompt edits?')) return;
  promptEditState = null;
  rerenderPromptBodySection(prompt.id);
}

async function savePromptEdit(prompt) {
  if (!promptEditState || promptEditState.promptId !== prompt.id) return;
  const currentEditableBody = splitPromptEditorBody(prompt).editableBody;
  const nextEditableBody = normalizePromptBody(promptEditState.current);
  if (nextEditableBody === currentEditableBody) {
    setPromptEditStatus(prompt.id, 'No prompt-body changes to save.', 'ok');
    return;
  }
  const currentBody = normalizePromptBody(prompt.body || '');
  const nextBody = composePromptEditorBody(prompt, nextEditableBody, { includesLockedMetadata: promptEditState.includesLockedMetadata, lockedText: promptEditState.lockedText });
  if (!isLiveDashboard()) {
    setPromptEditStatus(prompt.id, localDashboardInstructions('Prompt editing'), 'error');
    return;
  }

  setPromptEditStatus(prompt.id, 'Saving prompt body…');
  try {
    const response = await fetch('/api/prompt-edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptId: prompt.id, body: nextBody }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || ('Request failed with status ' + response.status));
    }
    if (payload.unchanged) {
      setPromptEditStatus(prompt.id, 'No prompt-body changes to save.', 'ok');
      return;
    }
    promptEditState = null;
    await fetchLiveData();
    openDetail(prompt.id);
    setPromptEditStatus(prompt.id, 'Saved', 'ok');
  } catch (error) {
    setPromptEditStatus(prompt.id, error instanceof Error ? error.message : String(error), 'error');
  }
}

async function skipPrompt(prompt) {
  if (!prompt || !prompt.skippable) return;
  if (!isLiveDashboard()) {
    setPromptEditStatus(prompt.id, localDashboardInstructions('Prompt skipping'), 'error');
    return;
  }
  if (!window.confirm('Skip this prompt and remove it from the runnable queue? This prompt will no longer be treated as available to run.')) {
    return;
  }
  setPromptEditStatus(prompt.id, 'Skipping prompt…');
  try {
    const response = await fetch('/api/prompt-skip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ promptId: prompt.id }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload.error || ('Request failed with status ' + response.status));
    }
    promptEditState = null;
    await fetchLiveData();
    openDetail(prompt.id);
    setPromptEditStatus(prompt.id, 'Skipped', 'ok');
  } catch (error) {
    setPromptEditStatus(prompt.id, error instanceof Error ? error.message : String(error), 'error');
  }
}

function renderPromptArchivedVersions(prompt, { hidden = false } = {}) {
  if (!prompt.archivedVersions || !prompt.archivedVersions.length) return '';
  return '<div class="detail-section">' +
    '<h3>Archived Superseded Versions</h3>' +
    '<p class="prompt-detail-note">there is a superseded version of this prompt available here <button class="prompt-archive-toggle" data-prompt-archive-toggle="' + esc(prompt.id) + '" aria-expanded="' + (hidden ? 'false' : 'true') + '" aria-controls="' + promptArchiveWrapId(prompt.id) + '">toggle archived versions</button></p>' +
    '<div class="prompt-archive-list" id="' + promptArchiveWrapId(prompt.id) + '"' + (hidden ? ' hidden' : '') + '>' +
      prompt.archivedVersions.map(version =>
        '<div class="prompt-archive-card prompt-archive-card--retired">' +
          '<h4>' + esc(version.id) + '</h4>' +
          '<div class="prompt-archive-warning">Retired reference only — do not run</div>' +
          '<p class="prompt-archive-meta">Archived ' + esc(fmtDate(version.supersededAt) || version.supersededAt || 'unknown') + '</p>' +
          '<pre>' + esc(version.body || '') + '</pre>' +
        '</div>'
      ).join('') +
    '</div>' +
    '</div>';
}

function renderPromptBodySection(prompt) {
  const copyButton = '<button class="copy-btn" data-copy-id="' + prompt.id + '">Copy</button>';
  const toolbarCopyButton = '<button class="prompt-edit-btn" data-copy-id="' + prompt.id + '">Copy</button>';
  const skipButton = prompt.skippable
    ? '<button class="prompt-edit-btn prompt-edit-btn--danger" data-prompt-edit-action="skip" data-prompt-id="' + esc(prompt.id) + '">' + (isLiveDashboard() ? 'Skip This Prompt' : 'Skip (localhost only)') + '</button>'
    : '';
  if (!prompt.editable) {
    return '<div id="' + promptBodySectionId(prompt.id) + '"><div class="detail-section"><h3>Full Prompt</h3><div class="prompt-edit-toolbar">' + toolbarCopyButton + skipButton + '</div><div class="pre-wrap">' + copyButton + '<pre id="prompt-body-' + prompt.id + '">' + esc(prompt.body) + '</pre></div>' + (!isLiveDashboard() && skipButton ? '<p class="prompt-detail-note">' + esc(localDashboardInstructions('Prompt skipping')) + '</p>' : '') + '</div>' +
      renderPromptArchivedVersions(prompt, { hidden: true }) + '</div>';
  }

  if (!promptEditState || promptEditState.promptId !== prompt.id) {
    return '<div id="' + promptBodySectionId(prompt.id) + '"><div class="detail-section"><h3>Full Prompt</h3>' +
      '<div class="prompt-edit-toolbar">' +
        '<button class="prompt-edit-btn" data-prompt-edit-action="start" data-prompt-id="' + esc(prompt.id) + '">' + (isLiveDashboard() ? 'Edit' : 'Edit (localhost only)') + '</button>' +
        toolbarCopyButton +
        skipButton +
      '</div>' +
      '<div class="pre-wrap"><pre id="prompt-body-' + prompt.id + '">' + esc(prompt.body) + '</pre></div>' +
      (!isLiveDashboard() ? '<p class="prompt-detail-note">' + esc(localDashboardInstructions('Prompt editing and skipping')) + '</p>' : '') +
      '</div>' +
      renderPromptArchivedVersions(prompt, { hidden: true }) + '</div>';
  }
  const split = splitPromptEditorBody(prompt);
  return '<div id="' + promptBodySectionId(prompt.id) + '"><div class="detail-section"><h3>Full Prompt</h3>' +
    '<div class="prompt-edit-toolbar">' +
      (promptEditState.confirming
        ? '<button class="prompt-edit-btn prompt-edit-btn--primary" data-prompt-edit-action="confirm-save" data-prompt-id="' + esc(prompt.id) + '">Confirm Save</button>' +
          '<button class="prompt-edit-btn prompt-edit-btn--muted" data-prompt-edit-action="back-edit" data-prompt-id="' + esc(prompt.id) + '">Back to Editing</button>' +
          '<button class="prompt-edit-btn prompt-edit-btn--danger" data-prompt-edit-action="decline" data-prompt-id="' + esc(prompt.id) + '">Decline / Revert</button>'
        : '<button class="prompt-edit-btn prompt-edit-btn--primary" data-prompt-edit-action="save" data-prompt-id="' + esc(prompt.id) + '">Save</button>' +
          '<button class="prompt-edit-btn prompt-edit-btn--muted" data-prompt-edit-action="cancel" data-prompt-id="' + esc(prompt.id) + '">Cancel</button>' +
          '<button class="prompt-edit-btn" data-prompt-edit-action="revert" data-prompt-id="' + esc(prompt.id) + '">Revert to Original</button>') +
      '<button class="prompt-edit-btn" data-prompt-edit-action="copy-draft" data-prompt-id="' + esc(prompt.id) + '">Copy</button>' +
    '</div>' +
    '<div class="prompt-edit-shell">' +
      renderTextareaEditor('prompt', prompt.id, promptEditState, { lockedText: split.lockedText }) +
    '</div>' +
    '<div class="prompt-edit-status" id="' + promptEditStatusId(prompt.id) + '"></div>' +
    '</div></div>';
}

// --- Detail ---
function showDetail() {
  document.getElementById('detail').style.display = 'flex';
  document.body.classList.add('detail-open');
}
function hideDetail() {
  document.getElementById('detail').style.display = 'none';
  document.body.classList.remove('detail-open');
}

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
    ['Last Edited At', esc(fmtDate(p.lastEditedAt) || 'not edited')],
    ['Skipped At', esc(fmtDate(p.skippedAt) || 'not skipped')],
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
  if (p.skipReason) meta.push(['Skip Reason', esc(p.skipReason)]);
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
  if (!(promptEditState && promptEditState.promptId === p.id) && p.lastEditedAt && p.archivedVersions && p.archivedVersions.length) {
    html += '<div class="detail-section"><h3>Dashboard Edit Diff</h3>' + renderPromptDiffHtml(p.archivedVersions[p.archivedVersions.length - 1].body || '', p.body || '') + '</div>';
  }
  html += renderPromptBodySection(p);

  document.getElementById('detail-body').innerHTML = html;
  showDetail();
}

function openSprintDetail(id) {
  const sprint = SPRINTS.find(entry => entry.id === id);
  if (!sprint) return;
  document.getElementById('detail-title').innerHTML = esc(sprint.id) + ' <span style="color:var(--text-dim);font-weight:400">— ' + esc(sprint.title) + '</span>';

  let html = '<dl class="detail-meta">';
  const latestAuditRef = (sprint.auditRefs || []).reduce((best, ref) =>
    !best || (ref.date || '') > (best.date || '') ? ref : best, null);
  const meta = [
    ['Sprint ID', sprint.id],
    ['Status', '<span class="sprint-status sprint-status--' + esc(sprint.statusSlug) + '">' + esc(sprint.status) + '</span>'],
    ['Source document', esc(sprint.sourceDocument || '')],
    ['Last updated', esc(fmtDate(sprint.updatedAt || sprint.createdAt || '') || 'unknown')],
    ['Last audited', latestAuditRef ? esc(latestAuditRef.date) + (latestAuditRef.title ? ' — ' + esc(latestAuditRef.title) : '') : 'never'],
    ['Plan coverage', esc(String(sprint.planCoveragePct) + '%')],
    ['Execution progress', esc(String(sprint.executionPct) + '%')],
    ['Implementation progress', esc(String(sprint.implementationPct) + '%')],
    ['Total tasks', esc(String(sprint.totalTasks))],
    ['Linked prompts', esc(String(sprint.promptsLinkedCount))],
    ['Unreviewed prompts', esc(String(sprint.promptsUnreviewedCount))],
    ['Normalized structure', sprint.normalizedStructure ? 'yes' : 'no'],
    ['Next available phase', sprint.nextAvailablePhase ? esc(sprint.nextAvailablePhase.title) : 'none'],
  ];
  meta.forEach(([k, v]) => { html += '<dt>' + k + '</dt><dd>' + v + '</dd>'; });
  html += '</dl>';

  // CCP-652: action area shell groups all sprint action panels
  html += '<div class="sprint-actions-area"><p class="sprint-section-heading">Sprint Actions</p>';

  // CCP-650: normalization warning — caution amber with icon
  if (sprint.showNormalizationWarning) {
    html += '<div class="sprint-action-panel sprint-action-panel--warning">' +
      '<div class="sprint-action-panel__header">' +
        '<span class="sprint-action-panel__icon">⚠</span>' +
        '<p class="sprint-action-panel__title">Normalization required before next-prompt generation</p>' +
      '</div>' +
      '<p class="sprint-action-panel__meta">This sprint does not yet have clean normalized phase/task structure. Run a sprint audit and normalize the sprint doc and registry before trusting next-phase prompt generation.</p>' +
      '</div>';
  }

  html += renderSprintPromptPanel({
    sprint,
    panel: 'audit',
    variantClass: 'sprint-action-panel--audit',
    title: 'Sprint Audit Prompt',
    badge: 'Always Available',
    meta: 'Use this when you want an agent to compare the sprint doc, registry, prompts, code, and latest audit truth.',
    collapsed: true,
  });

  // Mismatch follow-up panel — shown when sprint has Audit Found Mismatch tasks
  if (sprint.showMismatchPanel) {
    const mismatchPills = sprint.mismatchTasks.map(t => {
      const label = t.sourceAnchor || t.id;
      const note = t.notes ? ' — ' + t.notes : '';
      return '<span class="sprint-task-pill sprint-task-pill--mismatch" title="' + esc(t.notes || '') + '">' + esc(label + note) + '</span>';
    }).join('');
    html += renderSprintPromptPanel({
      sprint,
      panel: 'mismatch',
      variantClass: 'sprint-action-panel--mismatch',
      title: 'Generate Fix Prompts For Current Problems',
      badge: sprint.mismatchTasks.length + ' task' + (sprint.mismatchTasks.length !== 1 ? 's' : ''),
      meta: 'These tasks were audited as partial, wrong, or not started. Use this prompt to generate follow-up tracked prompts without recreating the original work.',
      taskPills: mismatchPills ? '<div class="sprint-action-panel__task-list">' + mismatchPills + '</div>' : '',
    });
  }

  // CCP-649: next-phase panel — primary action with phase context and task coverage
  if (sprint.showNextPromptPanel) {
    const tasksNeedingPrompts = sprint.tasksNeedingPrompts || [];
    const coveredTasks = sprint.nextPhaseCoveredTasks || [];
    const phaseContext = sprint.nextAvailablePhase
      ? '<p class="sprint-action-panel__phase-context">Next phase: <span>' + esc(sprint.nextAvailablePhase.title) + '</span></p>'
      : '';
    const taskPills = (tasksNeedingPrompts.length || coveredTasks.length)
      ? '<div class="sprint-action-panel__task-list">' +
          tasksNeedingPrompts.map(t => '<span class="sprint-task-pill sprint-task-pill--needs">' + esc(t.title || t.id) + '</span>').join('') +
          coveredTasks.map(t => '<span class="sprint-task-pill sprint-task-pill--covered">✓ ' + esc(t.title || t.id) + '</span>').join('') +
        '</div>'
      : '';
    html += renderSprintPromptPanel({
      sprint,
      panel: 'nextPhase',
      variantClass: 'sprint-action-panel--next',
      title: 'Generate Next Prompts For Planned Work',
      badge: 'Next Action',
      meta: 'Scoped to the next available phase. Already-covered tasks are included so agents do not recreate existing prompts unless the full phase scope needs it.',
      phaseContext,
      taskPills,
    });
  }

  html += renderSprintPromptPanel({
    sprint,
    panel: 'appendRequest',
    variantClass: 'sprint-action-panel--audit',
    title: 'Request Sprint Update',
    badge: 'Append Scope',
    meta: 'Add feature requests or sprint changes here. Save to keep the current panel body attached to this sprint, then copy the generated prompt so an agent updates the sprint officially through our workflow.',
  });

  html += '</div>'; // close .sprint-actions-area

  // CCP-645: visually distinct dep pills
  if (sprint.dependencySprintIds && sprint.dependencySprintIds.length) {
    html += '<div class="sprint-section">' +
      '<p class="sprint-section-heading">Dependencies</p>' +
      '<div class="sprint-link-list">' +
      sprint.dependencySprintIds.map(dep => '<span class="sprint-pill--dep">&#8594; ' + esc(dep) + '</span>').join('') +
      '</div></div>';
  }

  // CCP-645: audit rows with left-border visual treatment
  if (sprint.auditRefs && sprint.auditRefs.length) {
    html += '<div class="sprint-section"><p class="sprint-section-heading">Audits</p><div class="sprint-task-list">' +
      sprint.auditRefs.map((audit, index) => {
        const detailId = 'sprint-audit-details-' + esc(sprint.id) + '-' + index;
        const findingsExcerpt = audit.findings ? summarizeText(audit.findings, 70) : '';
        const summaryBits = [audit.type, audit.date, audit.sourceDocument, findingsExcerpt].filter(Boolean).join(' · ');
        const taskOutcomePills = (audit.taskOutcomes && audit.taskOutcomes.length)
          ? '<p class="sprint-audit__section-label">Task outcomes</p><div class="sprint-audit__task-outcomes">' +
              audit.taskOutcomes.map(o =>
                '<span class="sprint-task-pill ' +
                (o.state === 'Audit Confirmed Done' ? 'sprint-task-pill--covered' : 'sprint-task-pill--mismatch') +
                '">' + esc(o.taskId + ': ' + o.state) + '</span>'
              ).join('') +
            '</div>'
          : '';
        const findingsBlock = audit.findings
          ? '<div class="sprint-audit__findings"><p class="sprint-audit__section-label">Findings</p><div class="sprint-expand-block">' + esc(audit.findings) + '</div></div>'
          : '';
        const docContentBlock = audit.docContent
          ? '<div><p class="sprint-audit__section-label">Audit Document</p><div class="sprint-audit__doc-body">' + esc(audit.docContent) + '</div></div>'
          : '';
        return '<div class="sprint-audit sprint-expandable" tabindex="0" role="button" aria-expanded="false" aria-controls="' + detailId + '" data-sprint-expand-target="' + detailId + '">' +
          '<div class="sprint-audit__head"><span class="sprint-audit__title">' + esc(audit.title) + '</span><span class="sprint-link">' + esc(audit.status) + '</span></div>' +
          (summaryBits ? '<div class="sprint-audit__summary">' + esc(summaryBits) + '</div>' : '') +
          '<div class="sprint-expand-hint">Click to expand full audit details</div>' +
          '<div class="sprint-expand-details" id="' + detailId + '" hidden>' +
            (audit.sourceDocument ? '<div class="sprint-audit__doc">Source: ' + esc(audit.sourceDocument) + '</div>' : '') +
            '<div class="sprint-expand-block">' +
              (audit.id ? 'Audit ID: ' + esc(audit.id) + '\\\\n' : '') +
              (audit.type ? 'Type: ' + esc(audit.type) + '\\\\n' : '') +
              (audit.status ? 'Status: ' + esc(audit.status) + '\\\\n' : '') +
              (audit.date ? 'Date: ' + esc(audit.date) : '') +
            '</div>' +
            taskOutcomePills +
            findingsBlock +
            docContentBlock +
          '</div>' +
        '</div>'
      }).join('') + '</div></div>';
  }

  // CCP-645: next steps with actionable left-border treatment
  if (sprint.recommendedNextSteps && sprint.recommendedNextSteps.length) {
    html += '<div class="sprint-section"><p class="sprint-section-heading">Recommended Next Steps</p><div class="sprint-task-list">' +
      sprint.recommendedNextSteps.map((step, index) => {
        const detailId = 'sprint-step-details-' + esc(sprint.id) + '-' + index;
        return '<div class="sprint-next-step sprint-expandable" tabindex="0" role="button" aria-expanded="false" aria-controls="' + detailId + '" data-sprint-expand-target="' + detailId + '">' +
          '<div class="sprint-next-step__head">' +
            '<span class="sprint-next-step__title">' + esc(step.title) + '</span>' +
            '<span class="sprint-link">' + esc(step.priority) + '</span>' +
          '</div>' +
          (step.reason ? '<div class="sprint-next-step__summary">' + esc(summarizeText(step.reason, 120)) + '</div>' : '') +
          '<div class="sprint-expand-hint">Click to expand full next-step details</div>' +
          '<div class="sprint-expand-details" id="' + detailId + '" hidden>' +
            (step.reason ? '<div class="sprint-next-step__reason">' + esc(step.reason) + '</div>' : '') +
            (step.linkedTaskIds && step.linkedTaskIds.length
              ? '<div class="sprint-expand-block">Linked tasks: ' + esc(step.linkedTaskIds.join(', ')) + '</div>'
              : '') +
            (step.suggestedPromptIds && step.suggestedPromptIds.length
              ? '<div class="sprint-link-list" style="margin-top:6px">' + step.suggestedPromptIds.map(pid => '<span class="sprint-link">' + esc(pid) + '</span>').join('') + '</div>'
              : '') +
          '</div>' +
        '</div>'
      }).join('') + '</div></div>';
  }

  // CCP-645: phases with stronger header treatment
  html += '<div class="sprint-section"><p class="sprint-section-heading">Phases &amp; Tasks</p>';
  sprint.phases.forEach(phase => {
    html += '<div class="sprint-detail-phase">' +
      '<div class="sprint-phase__header">' +
        '<div class="sprint-phase__header-main">' +
          '<span class="sprint-phase__title">' + esc(phase.title) + '</span>' +
        '</div>' +
        '<div class="sprint-phase__header-actions">' +
          '<span class="sprint-link">' + esc(phase.status) + '</span>' +
          '<button class="sprint-panel-btn copy-btn sprint-phase__copy-btn" data-phase-template-copy="' + esc(sprint.id) + '" data-phase-id="' + esc(phase.id) + '">Generate Next Prompts Template</button>' +
        '</div>' +
      '</div>';
    html += '<div class="sprint-task-list">';
    phase.tasks.forEach((task, index) => {
      const detailId = 'sprint-task-details-' + esc(task.id) + '-' + index;
      const executionSummary = 'Execution: ' + task.executionState + (task.sourceAnchor ? ' · ' + task.sourceAnchor : '');
      html += '<div class="sprint-task sprint-expandable" tabindex="0" role="button" aria-expanded="false" aria-controls="' + detailId + '" data-sprint-expand-target="' + detailId + '">' +
        '<div class="sprint-task__head">' +
          '<span class="sprint-task__title">' + esc(task.title) + '</span>' +
          '<span class="sprint-link">' + esc(task.status) + '</span>' +
        '</div>' +
        '<div class="sprint-task__summary">' + esc(executionSummary) + '</div>' +
        (task.notes ? '<div class="sprint-task__summary">' + esc(summarizeText(task.notes, 110)) + '</div>' : '') +
        '<div class="sprint-expand-hint">Click to expand full task details</div>' +
        '<div class="sprint-expand-details" id="' + detailId + '" hidden>' +
          '<div class="sprint-task__meta">Execution: <strong>' + esc(task.executionState) + '</strong>' + (task.sourceAnchor ? ' &middot; ' + esc(task.sourceAnchor) : '') + '</div>' +
          (task.notes ? '<div class="sprint-task__meta">' + esc(task.notes) + '</div>' : '') +
          '<div class="sprint-expand-block">' +
            'Task ID: ' + esc(task.id) + '\\\\n' +
            'Prompt count: ' + esc(String(task.promptCount || 0)) + '\\\\n' +
            'Reviewed prompts: ' + esc(String(task.promptReviewedCount || 0)) + '\\\\n' +
            'Unreviewed prompts: ' + esc(String(task.promptUnreviewedCount || 0)) +
          '</div>' +
          (task.linkedPromptIds && task.linkedPromptIds.length
            ? '<div class="sprint-link-list">' + task.linkedPromptIds.map(pid => '<span class="sprint-link">' + esc(pid) + '</span>').join('') + '</div>'
            : '<div class="sprint-task__meta" style="opacity:0.5">No linked prompts</div>') +
        '</div>' +
        '</div>';
    });
    html += '</div></div>';
  });

  // CCP-645: unassigned prompts at lower visual weight
  if (sprint.unassignedPromptIds && sprint.unassignedPromptIds.length) {
    html += '<div class="sprint-section sprint-unassigned">' +
      '<p class="sprint-section-heading">Unassigned Prompts (' + sprint.unassignedPromptIds.length + ')</p>' +
      '<div class="sprint-link-list">' + sprint.unassignedPromptIds.map(pid => '<span class="sprint-link">' + esc(pid) + '</span>').join('') + '</div>' +
      '</div>';
  }
  html += '</div>';

  // Sprint document — rendered markdown preview
  if (sprint.sprintDocHtml) {
    html += '<div class="sprint-doc-preview">' +
      '<p class="sprint-section-heading">Sprint Document</p>' +
      '<div class="sprint-doc-content">' + sprint.sprintDocHtml + '</div>' +
      '</div>';
  }

  document.getElementById('detail-body').innerHTML = html;
  showDetail();
}

// Copy prompt body or fix suggestion to clipboard
document.getElementById('detail-body').addEventListener('click', (e) => {
  const expandToggle = e.target.closest('[data-sprint-expand-target]');
  if (expandToggle && !e.target.closest('.copy-btn, .sprint-panel-btn, .sprint-link')) {
    const targetId = expandToggle.dataset.sprintExpandTarget;
    const details = document.getElementById(targetId);
    if (details) {
      const expanded = !details.hidden;
      details.hidden = expanded;
      expandToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    }
    return;
  }

  const archiveToggle = e.target.closest('[data-prompt-archive-toggle]');
  if (archiveToggle) {
    const promptId = archiveToggle.dataset.promptArchiveToggle;
    const wrap = document.getElementById(promptArchiveWrapId(promptId));
    if (!wrap) return;
    const expanded = !wrap.hidden;
    wrap.hidden = expanded;
    archiveToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    return;
  }

  const promptEditBtn = e.target.closest('[data-prompt-edit-action]');
  if (promptEditBtn) {
    const promptId = promptEditBtn.dataset.promptId;
    const action = promptEditBtn.dataset.promptEditAction;
    const prompt = PROMPTS.find(entry => entry.id === promptId);
    if (!prompt) return;
    if (action === 'start') {
      if (!isLiveDashboard()) {
        setPromptEditStatus(promptId, localDashboardInstructions('Prompt editing'), 'error');
        return;
      }
      resetPromptEditState(prompt);
      rerenderPromptBodySection(promptId);
      return;
    }
    if (action === 'cancel') {
      cancelPromptEdit(prompt);
      return;
    }
    if (action === 'revert') {
      if (!promptEditState || promptEditState.promptId !== promptId) return;
      const body = splitPromptEditorBody(prompt).editableBody;
      promptEditState.original = body;
      promptEditState.current = body;
      promptEditState.confirming = false;
      rerenderPromptBodySection(promptId, { statusMessage: 'Draft reset to the current saved prompt body.', statusTone: 'ok' });
      return;
    }
    if (action === 'decline') {
      if (!promptEditState || promptEditState.promptId !== promptId) return;
      promptEditState = null;
      rerenderPromptBodySection(promptId);
      return;
    }
    if (action === 'copy-draft') {
      const text = promptEditState && promptEditState.promptId === promptId
        ? composePromptEditorBody(prompt, normalizePromptBody(promptEditState.current), { includesLockedMetadata: promptEditState.includesLockedMetadata, lockedText: promptEditState.lockedText })
        : normalizePromptBody(prompt.body || '');
      navigator.clipboard.writeText(text).then(() => {
        promptEditBtn.textContent = 'Copied!';
        setTimeout(() => { promptEditBtn.textContent = 'Copy'; }, 1200);
      });
      return;
    }
    if (action === 'skip') {
      void skipPrompt(prompt);
      return;
    }
    if (action === 'save') {
      if (!promptEditState || promptEditState.promptId !== promptId) return;
      const currentBody = splitPromptEditorBody(prompt).editableBody;
      const nextBody = normalizePromptBody(promptEditState.current);
      if (currentBody === nextBody) {
        setPromptEditStatus(promptId, 'No prompt-body changes to save.', 'ok');
        return;
      }
      promptEditState.confirming = true;
      rerenderPromptBodySection(promptId);
      return;
    }
    if (action === 'back-edit') {
      if (!promptEditState || promptEditState.promptId !== promptId) return;
      promptEditState.confirming = false;
      rerenderPromptBodySection(promptId);
      return;
    }
    if (action === 'confirm-save') {
      if (!promptEditState || promptEditState.promptId !== promptId) return;
      promptEditState.confirming = false;
      void savePromptEdit(prompt);
      return;
    }
  }

  const panelBtn = e.target.closest('.sprint-panel-btn');
  if (panelBtn) {
    const sprintId = panelBtn.dataset.sprintId;
    const panel = panelBtn.dataset.sprintPanel;
    const action = panelBtn.dataset.sprintPanelAction;
    const sprint = SPRINTS.find(entry => entry.id === sprintId);
    const key = sprintPanelEditKey(sprintId, panel);
    const state = sprintPanelEditStates[key];
    if (!sprint) return;
    if (action === 'copy') {
      const currentValue = state ? normalizePromptBody(state.current) : sprintPanelRenderedText(sprint, panel);
      navigator.clipboard.writeText(currentValue).then(() => {
        panelBtn.textContent = 'Copied!';
        panelBtn.classList.add('copied');
        setTimeout(() => {
          panelBtn.textContent = sprintPanelCopyLabel(panel);
          panelBtn.classList.remove('copied');
        }, 1500);
      });
      return;
    }
    if (action === 'toggle') {
      const wrap = document.getElementById(sprintPanelTextareaId(sprintId, panel) + '-wrap');
      if (!wrap) return;
      const expanded = !wrap.hidden;
      wrap.hidden = expanded;
      panelBtn.textContent = expanded ? 'Expand Prompt' : 'Collapse Prompt';
      panelBtn.setAttribute('aria-expanded', expanded ? 'false' : 'true');
      return;
    }
    if (action === 'edit') {
      if (!isLiveDashboard()) {
        setSprintPanelStatus(sprintId, panel, localDashboardInstructions('Sprint panel editing'), 'error');
        return;
      }
      startSprintPanelEdit(sprint, panel);
      openSprintDetail(sprintId);
      return;
    }
    if (action === 'cancel') {
      if (!cancelSprintPanelEdit(sprint, panel)) return;
      openSprintDetail(sprintId);
      return;
    }
    if (action === 'reset') {
      resetSprintPanelEdit(sprint, panel);
      openSprintDetail(sprintId);
      setSprintPanelStatus(sprintId, panel, 'Reset to the current saved sprint panel body.', 'ok');
      panelBtn.classList.add('reset');
      setTimeout(() => panelBtn.classList.remove('reset'), 1200);
      return;
    }
    if (action === 'save') {
      if (!state) return;
      const currentBody = normalizePromptBody(sprintPanelCurrentBody(sprint, panel));
      const nextBody = normalizePromptBody(state.current);
      if (currentBody === nextBody) {
        setSprintPanelStatus(sprintId, panel, 'No sprint panel changes to save.', 'ok');
        return;
      }
      state.confirming = true;
      openSprintDetail(sprintId);
      return;
    }
    if (action === 'back-edit') {
      if (!state) return;
      state.confirming = false;
      openSprintDetail(sprintId);
      return;
    }
    if (action === 'confirm-save') {
      if (!state) return;
      state.confirming = false;
      void saveSprintPanelNote(sprintId, panel, false);
      return;
    }
    if (action === 'clear') {
      void saveSprintPanelNote(sprintId, panel, true);
      return;
    }
  }

  const sprintArchiveToggle = e.target.closest('[data-sprint-panel-archive-toggle]');
  if (sprintArchiveToggle) {
    const sprintId = sprintArchiveToggle.dataset.sprintPanelArchiveToggle;
    const panel = sprintArchiveToggle.dataset.sprintPanel;
    const wrap = document.getElementById(sprintPanelArchiveId(sprintId, panel));
    if (!wrap) return;
    const expanded = !wrap.hidden;
    wrap.hidden = expanded;
    sprintArchiveToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    return;
  }

  const btn = e.target.closest('[data-copy-id], .copy-btn, .audit-copy-icon-btn');
  if (!btn) return;
  const phaseTemplateSprintId = btn.dataset.phaseTemplateCopy;
  if (phaseTemplateSprintId) {
    const sprint = SPRINTS.find(entry => entry.id === phaseTemplateSprintId);
    const phase = sprint && sprint.phases ? sprint.phases.find(entry => entry.id === btn.dataset.phaseId) : null;
    const text = phase ? String(phase.nextPromptsTemplate || phase.nextPromptsTemplateDefault || '').trim() : '';
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      btn.textContent = 'Copied!';
      btn.classList.add('copied');
      setTimeout(() => {
        btn.textContent = 'Generate Next Prompts Template';
        btn.classList.remove('copied');
      }, 1500);
    });
    return;
  }
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
  const prompt = PROMPTS.find(entry => entry.id === id);
  const text = prompt ? normalizePromptBody(prompt.body || '') : '';
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
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
  hideDetail();
});

document.getElementById('detail-body').addEventListener('input', (e) => {
  const ta = e.target.closest('[data-textarea-editor-owner-type]');
  if (!ta) return;
  const ownerType = ta.dataset.textareaEditorOwnerType;
  const ownerId = ta.dataset.textareaEditorOwnerId;
  if (ownerType === 'prompt') {
    if (!promptEditState || promptEditState.promptId !== ownerId) return;
    promptEditState.current = ta.value;
    return;
  }
  if (ownerType === 'sprint') {
    const [sprintId, sprintPanel] = ownerId.split('::');
    const state = sprintPanelEditStates[sprintPanelEditKey(sprintId, sprintPanel)];
    if (!state) return;
    state.current = ta.value;
  }
});

document.getElementById('detail-body').addEventListener('keydown', (e) => {
  const expandToggle = e.target.closest('[data-sprint-expand-target]');
  if (!expandToggle) return;
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  const targetId = expandToggle.dataset.sprintExpandTarget;
  const details = document.getElementById(targetId);
  if (!details) return;
  const expanded = !details.hidden;
  details.hidden = expanded;
  expandToggle.setAttribute('aria-expanded', expanded ? 'false' : 'true');
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideDetail();
});

// --- Search ---
document.getElementById('search').addEventListener('input', (e) => {
  searchText = e.target.value;
  currentPage = 1;
  renderList();
});

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab = normalizeTab(btn.dataset.tab);
    syncTabToUrl();
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
    // Live mode: recompute sprint state, fetch latest data, then hard-reload to bust cache.
    // Button state reset is intentionally omitted — the reload replaces the page.
    fetch('/api/sprint-recompute', { method: 'POST' })
      .catch(err => console.warn('[dashboard] sprint-recompute failed:', err))
      .finally(() => {
        fetchLiveData().then(() => {
          const url = currentUrl();
          url.searchParams.set('tab', normalizeTab(activeTab));
          url.searchParams.set('t', String(Date.now()));
          location.href = url.toString();
        });
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
syncTabToUrl();
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
    .map(p => p.id);
  bulkCopy(document.getElementById('copy-needs-review'), ids);
});
document.getElementById('copy-issues-found').addEventListener('click', () => {
  const ids = PROMPTS
    .filter(p => p.reviewOutcome === 'issues found' || p.reviewOutcome === 'needs rework')
    .map(p => p.id);
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
