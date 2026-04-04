// Show the status of all tracked sprints.
//
// Usage:
//   npm run sprint:status                    — show all sprints
//   npm run sprint:status -- OPPONENT        — filter by title/source fragment
//   npm run sprint:status -- --needs-attn    — only active/problem sprints

import { buildSprintDashboardData } from './sprint-registry-lib.mjs';

const args = process.argv.slice(2);
const filter = args.find(arg => !arg.startsWith('--')) || '';
const needsAttentionOnly = args.includes('--needs-attn');

const { sprints } = buildSprintDashboardData(process.cwd());

let list = sprints;
if (filter) {
  const q = filter.toLowerCase();
  list = list.filter(sprint =>
    sprint.title.toLowerCase().includes(q) ||
    sprint.sourceDocument.toLowerCase().includes(q) ||
    sprint.id.toLowerCase().includes(q)
  );
}

if (needsAttentionOnly) {
  list = list.filter(sprint => ['Needs Prompts', 'Ready to Start', 'In Progress', 'Completed Needs Full Review', 'Completed: With Issues'].includes(sprint.currentStatus));
}

if (list.length === 0) {
  console.log(filter ? `No sprints matching "${filter}".` : 'No tracked sprints found.');
  process.exit(0);
}

for (const sprint of list) {
  console.log(`\n${sprint.id} — ${sprint.title}`);
  console.log(`${'─'.repeat(`${sprint.id} — ${sprint.title}`.length)}`);
  console.log(`Status: ${sprint.currentStatus}`);
  console.log(`Tasks: ${sprint.totalTasks} | Plan coverage: ${sprint.planCoveragePct}% | Execution: ${sprint.executionPct}% | Implementation: ${sprint.implementationPct}%`);
  console.log(`Linked prompts: ${sprint.promptsLinkedCount} | Unreviewed prompts: ${sprint.promptsUnreviewedCount} | Audits: ${(sprint.auditRefs || []).length} | Next steps: ${(sprint.recommendedNextSteps || []).length}`);
  if (sprint.dependencySprintIds?.length) console.log(`Depends on: ${sprint.dependencySprintIds.join(', ')}`);
  if (sprint.recommendedNextSteps?.length) {
    for (const step of sprint.recommendedNextSteps.slice(0, 3)) {
      console.log(`  [${step.priority}] ${step.title}`);
    }
  }
}

console.log('');
