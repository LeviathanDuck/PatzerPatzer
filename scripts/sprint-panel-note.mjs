#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { mutateSprintRegistryLocked } from './sprint-registry-lib.mjs';

const VALID_PANELS = new Set(['audit', 'mismatch', 'nextPhase', 'appendRequest']);

function usage(message = '') {
  if (message) console.error(message);
  console.error('Usage: node scripts/sprint-panel-note.mjs --sprint-id SPR-### --panel <audit|mismatch|nextPhase|appendRequest> [--text "..."] [--body "..."] [--clear]');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { clear: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--clear') {
      args.clear = true;
      continue;
    }
    const next = argv[index + 1];
    if (!token.startsWith('--')) usage(`Unexpected argument: ${token}`);
    if (next == null) usage(`Missing value for ${token}`);
    if (token === '--sprint-id') args.sprintId = next;
    else if (token === '--panel') args.panel = next;
    else if (token === '--text') args.text = next;
    else if (token === '--body') args.body = next;
    else usage(`Unknown argument: ${token}`);
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sprintId = String(args.sprintId ?? '').trim();
  const panel = String(args.panel ?? '').trim();
  const text = String(args.text ?? '').trim();
  const body = String(args.body ?? '').trim();

  if (!sprintId) usage('--sprint-id is required.');
  if (!VALID_PANELS.has(panel)) usage('--panel must be one of audit, mismatch, nextPhase, appendRequest.');
  if (!args.clear && !text && !body) usage('--text or --body is required unless --clear is used.');

  await mutateSprintRegistryLocked(process.cwd(), registry => {
    const sprint = registry.sprints.find(entry => entry.id === sprintId);
    if (!sprint) throw new Error(`Unknown sprint id: ${sprintId}`);
    sprint.panelNotes ||= {};
    if (args.clear) {
      delete sprint.panelNotes[panel];
      if (Object.keys(sprint.panelNotes).length === 0) delete sprint.panelNotes;
    } else {
      const now = new Date().toISOString();
      const previous = sprint.panelNotes[panel] && typeof sprint.panelNotes[panel] === 'object'
        ? sprint.panelNotes[panel]
        : {};
      if (body) {
        const entry = { ...previous };
        const previousBody = String(previous.currentBody || '').trim();
        if (previousBody && previousBody !== body) {
          entry.history = [...(Array.isArray(previous.history) ? previous.history : []), {
            body: previousBody,
            archivedAt: now,
          }];
        }
        entry.currentBody = body;
        delete entry.text;
        entry.lastEditedAt = now;
        entry.updatedAt = now;
        sprint.panelNotes[panel] = entry;
      } else {
        sprint.panelNotes[panel] = {
          ...(previous && typeof previous === 'object' ? previous : {}),
          text,
          updatedAt: now,
        };
      }
    }
    sprint.updatedAt = new Date().toISOString();
  });

  execSync('npm run sprint:recompute && npm run sprints:generate && npm run dashboard:generate', {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  console.log(`${args.clear ? 'Cleared' : 'Saved'} ${panel} sprint panel for ${sprintId}.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
