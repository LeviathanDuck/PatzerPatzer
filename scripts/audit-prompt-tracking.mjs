import { readFileSync } from 'node:fs';
import { generatedDocs, registryPaths, safePromptFileBody, validatePromptBodyText, validateRegistry } from './prompt-registry-lib.mjs';

const root = process.cwd();
const { paths, registry, findings } = validateRegistry(root);
const generated = generatedDocs(root);

const queueText = readFileSync(paths.queue, 'utf8');
const logText = readFileSync(paths.log, 'utf8');
const historyText = readFileSync(paths.history, 'utf8');
const dashboardText = readFileSync(paths.dashboard, 'utf8');

if (queueText !== generated.queue) findings.push(`Generated queue doc does not match ${paths.queue}`);
if (logText !== generated.log) findings.push(`Generated log doc does not match ${paths.log}`);
if (historyText !== generated.history) findings.push(`Generated history doc does not match ${paths.history}`);
if (!dashboardText.includes('Tracking Dashboard')) findings.push(`Generated dashboard doc looks invalid: ${paths.dashboard}`);

const queueIndexIds = registry.prompts.filter(p => p.queueState !== 'not-queued').length;
const logCheckedIds = registry.prompts.filter(p => p.status === 'reviewed').length;
const logPendingIds = registry.prompts.filter(p => p.status !== 'reviewed').length;
const startedIds = registry.prompts.filter(p => p.queueState === 'queued-started' || p.queueState === 'queued-run').length;
const reservedIds = registry.prompts.filter(p => p.status === 'reserved' && !p.reservationReleasedAt).length;

console.log('Prompt tracking audit');
console.log(`- registry ids: ${registry.prompts.length}`);
console.log(`- queue ids: ${queueIndexIds}`);
console.log(`- started ids: ${startedIds}`);
console.log(`- reviewed ids: ${logCheckedIds}`);
console.log(`- pending ids: ${logPendingIds}`);
console.log(`- active reservations: ${reservedIds}`);

// Stale prompt detection: started 24h+ ago without completion
const STALE_MS = 24 * 60 * 60 * 1000;
const now = Date.now();
const stale = registry.prompts.filter(p =>
  p.queueState === 'queued-started' && !p.completedAt && p.startedAt &&
  now - new Date(p.startedAt).getTime() > STALE_MS
);
if (stale.length > 0) {
  console.log(`\nStale prompts (started 24h+ ago, never completed): ${stale.length}`);
  for (const p of stale.slice(0, 10)) {
    const age = Math.round((now - new Date(p.startedAt).getTime()) / (60 * 60 * 1000));
    console.log(`  ${p.id} — ${age}h ago — ${p.title}`);
  }
  if (stale.length > 10) console.log(`  ... and ${stale.length - 10} more`);
}

// Completed but never reviewed — nudge
const completedUnreviewed = registry.prompts.filter(p =>
  p.queueState === 'queued-run' && p.status !== 'reviewed'
);
if (completedUnreviewed.length > 0) {
  console.log(`\nCompleted but awaiting review: ${completedUnreviewed.length}`);
  for (const p of completedUnreviewed.slice(0, 5)) {
    const label = p.completionErrors ? '(WITH ERRORS)' : '';
    console.log(`  ${p.id} ${label} — ${p.title}`);
  }
  if (completedUnreviewed.length > 5) console.log(`  ... and ${completedUnreviewed.length - 5} more`);
}

const staleReservations = registry.prompts.filter(p =>
  p.status === 'reserved' &&
  !p.reservationReleasedAt &&
  p.createdAt &&
  now - new Date(p.createdAt).getTime() > STALE_MS
);
if (staleReservations.length > 0) {
  console.log(`\nStale reservations (older than 24h): ${staleReservations.length}`);
  for (const p of staleReservations.slice(0, 10)) {
    const age = Math.round((now - new Date(p.createdAt).getTime()) / (60 * 60 * 1000));
    console.log(`  ${p.id} — ${age}h ago — ${p.title}`);
  }
  if (staleReservations.length > 10) console.log(`  ... and ${staleReservations.length - 10} more`);
}

const activeBodyIssues = [];
for (const prompt of registry.prompts.filter(p => p.status !== 'reviewed' && p.promptFile)) {
  const findingsForPrompt = validatePromptBodyText(safePromptFileBody(root, prompt), { id: prompt.id });
  if (findingsForPrompt.length) {
    activeBodyIssues.push({ id: prompt.id, findings: findingsForPrompt });
    findings.push(`Active prompt ${prompt.id} has body drift: ${findingsForPrompt.join(' ')}`);
  }
}
if (activeBodyIssues.length > 0) {
  console.log(`\nActive prompt body issues: ${activeBodyIssues.length}`);
  for (const issue of activeBodyIssues.slice(0, 10)) {
    console.log(`  ${issue.id} — ${issue.findings.join(' | ')}`);
  }
  if (activeBodyIssues.length > 10) console.log(`  ... and ${activeBodyIssues.length - 10} more`);
}

if (!findings.length) {
  console.log('\nNo prompt-tracking inconsistencies found.');
  process.exit(0);
}

for (const finding of findings) console.log(`- ${finding}`);
process.exit(1);
