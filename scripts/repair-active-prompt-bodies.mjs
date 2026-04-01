import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRegistry, validatePromptBodyText } from './prompt-registry-lib.mjs';

const root = process.cwd();
const { registry } = readRegistry(root);

function buildChecklistFromRegistry(prompt, body) {
  const existing = Array.isArray(prompt.manualChecklist) ? prompt.manualChecklist.filter(Boolean) : [];
  if (existing.length) return existing;

  const validationMatch = body.match(/## Validation[\s\S]*?(?=\n## |\n# |$)/);
  if (validationMatch) {
    const bullets = validationMatch[0]
      .split('\n')
      .map(line => line.trim())
      .filter(line => /^- /.test(line))
      .map(line => line.replace(/^- \[[ x]\]\s*/, '').replace(/^- /, '- [ ] ').trim())
      .map(line => line.startsWith('- [ ] ') ? line : `- [ ] ${line}`);
    if (bullets.length) return bullets;
  }

  return [`- [ ] Review the validation steps described in ${prompt.id} and confirm the expected results`];
}

function pipeChecklist(items) {
  return items.map(item => item.replace(/\|/g, '/')).join('|');
}

function ensureReadAndFollowHeader(body) {
  const canonical = [
    'Read and follow:',
    '- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`',
    '- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`',
  ].join('\n');

  if (/Read and follow:\n(?:- .+\n?)+/m.test(body)) {
    return body.replace(/Read and follow:\n(?:- .+\n?)+/m, canonical);
  }

  if (body.startsWith('# ')) {
    const firstBlank = body.indexOf('\n\n');
    if (firstBlank !== -1) {
      return `${body.slice(0, firstBlank)}\n\n${canonical}\n\n${body.slice(firstBlank + 2)}`;
    }
  }

  return `${canonical}\n\n${body}`;
}

function ensureLifecycle(prompt, body) {
  if (body.includes('## Lifecycle')) return body;
  const checklist = pipeChecklist(buildChecklistFromRegistry(prompt, body));
  const lifecycle = [
    '## Lifecycle',
    '',
    'Before making any changes, mark this prompt as started:',
    '```sh',
    `npm run prompt:start -- ${prompt.id}`,
    '```',
    '',
    'After all work is complete, mark it as done:',
    '```sh',
    `npm run prompt:complete -- ${prompt.id} --checklist "${checklist}"`,
    '```',
    '',
    'If errors or issues were encountered during execution, use `--errors` instead:',
    '```sh',
    `npm run prompt:complete -- ${prompt.id} --errors "brief description of what went wrong" --checklist "${checklist}"`,
    '```',
    '',
  ].join('\n');

  return `${body.replace(/\s+$/, '')}\n\n${lifecycle}`;
}

let changed = 0;
for (const prompt of registry.prompts.filter(entry => entry.status !== 'reviewed' && entry.promptFile)) {
  const filePath = resolve(root, prompt.promptFile);
  let body = readFileSync(filePath, 'utf8');
  const before = body;
  body = ensureReadAndFollowHeader(body);
  body = body.replace(/- `\/Users\/leftcoast\/Development\/PatzerPatzer\/docs\/prompts\/(README\.md|CODEX_PROMPT_INSTRUCTIONS\.md|code-review\.md|manager-batch\.md|codexinstructionstopromptclaude(?:\.archived-v1)?\.md)`\n?/g, '');
  body = ensureLifecycle(prompt, body).replace(/\n{3,}/g, '\n\n');

  const findings = validatePromptBodyText(body, { id: prompt.id });
  if (findings.length) {
    throw new Error(`Unable to repair ${prompt.id}: ${findings.join(' ')}`);
  }

  if (body !== before) {
    writeFileSync(filePath, body.replace(/\s+$/, '') + '\n');
    changed += 1;
  }
}

console.log(`Repaired ${changed} active prompt bodies.`);
