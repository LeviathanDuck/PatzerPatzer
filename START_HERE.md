# START HERE — Patzer Pro Agent Entry Point

This file is a repo onboarding and routing guide for agents performing work in this repository.

It applies to **all agent activity**, including:

- code implementation
- bug fixes
- refactors
- prompt creation
- sprint work
- documentation updates
- audits and reviews

Use this file to understand which docs currently own which rules.

---

# Current Read Path

Current tracked prompt bodies explicitly tell agents to read:

1. `CLAUDE.md`
2. `AGENTS.md`

This file is useful as a human-maintained orientation page, but it is **not currently guaranteed to
be auto-opened** by Claude, Codex, or other agents unless a prompt, system, or tool instruction
explicitly routes them here.

When an agent is using the current tracked prompt workflow, the effective read path is:

1. `CLAUDE.md`
2. `AGENTS.md`
3. canonical prompt docs when prompt work is involved
4. canonical sprint docs when sprint work is involved
5. agent-specific instructions (for example `GEMINI.md`) if present

Additional docs must be read when relevant:

- prompt workflow → `docs/prompts/PROMPT_REGISTRY_README.md`
- sprint workflow → `docs/mini-sprints/SPRINT_REGISTRY_README.md`

Agents should not begin repository work until the relevant active docs for the task are read.

---

# Doc Responsibility Split

Current ownership is:

- `CLAUDE.md`
  - concise top-level brief
- `AGENTS.md`
  - detailed operating rules and routing
- `docs/prompts/*.md`
  - canonical prompt workflow
- `docs/mini-sprints/*.md`
  - canonical sprint workflow

If `CLAUDE.md` is reorganized or slimmed down, prompt and sprint behavior still comes from the
canonical workflow docs plus `AGENTS.md`, not from historical expectations about older `CLAUDE.md`
content.

---

# Prompt Workflow (Mandatory)

This repository uses a tracked prompt system for code work.

Before **every code change**, agents must determine whether the work is:

- already covered by an existing `CCP-###` prompt
- a new tracked prompt that should be created
- explicitly untracked by user instruction

If the status is unclear, the agent must ask before proceeding.

Tracked prompts are the default for all code work.

Small or trivial changes are **not exceptions**.

When executing a prompt, the agent must follow the lifecycle commands documented in the canonical
prompt workflow docs:

Start work:

```
npm run prompt:start -- <PROMPT_ID>
```

Complete work:

```
npm run prompt:complete -- <PROMPT_ID> --checklist "..."
```

Lifecycle command output must never be truncated.

---

# Lichess Reference Rule

Lichess is the primary behavioral reference for core chess functionality.

This includes:

- analysis board behavior
- move tree and variation logic
- engine UX and evaluation display
- board interaction and keyboard navigation
- puzzle and retrospection workflows

Before modifying behavior in these systems:

1. inspect the relevant Patzer implementation
2. inspect the corresponding Lichess source
3. compare behavior

If a requested change would materially diverge from Lichess behavior and that divergence was not explicitly requested by the user, the agent must stop and ask before implementing.

---

# UI Exploration Rule

Some tasks involve UI reverse engineering or design exploration.

In those cases:

- Lichess remains the default behavioral reference
- visual or layout deviations may be explored when explicitly requested
- UI exploration must **not silently change underlying chess logic**

Agents must not alter:

- move tree semantics
- engine analysis pipeline
- review workflows
- puzzle logic

without explicit approval.

---

# Task Scope Rule

Implementation tasks must remain small.

Constraints:

- touch **1–3 files maximum**
- implement **one small task at a time**
- do not refactor unrelated systems
- do not bundle multiple features

If a task expands beyond the smallest safe step, the agent must stop and explain why.

---

# Required Validation

After any code change, agents must run:

```
npm run build
```

Agents must also verify that newly implemented code is actually wired into a live execution path.

Run additional task-specific validation required by the active workflow docs.

If `npx tsc --noEmit` is part of the intended validation path for a task, report the real result.
Do not assume it is always a hard clean-pass gate unless the current canonical docs for that task
make it one.

---

# Stop Conditions

Agents must stop and ask for clarification if:

- the task exceeds 3 files
- Lichess parity vs deviation is unclear
- the affected files are unclear
- acceptance criteria are unclear
- prompt tracking status is unclear
- build or type-check fails

Agents must not guess.

---

# Decision Clarification Rule

Agents must not invent missing decisions. If a request is ambiguous, agents must ask clarification questions before implementing.

Agents should clarify:
- exact behavior
- Lichess parity vs intentional deviation
- affected subsystem/files
- acceptance criteria

No implementation should begin if critical decisions are unclear.

For behavior work with a Lichess reference:
- if the requested implementation would materially diverge from Lichess behavior and the user did
  not explicitly ask for that divergence, stop and ask before implementing

---

# Operating Principle

Discover first.  
Compare to Lichess.  
Choose the smallest safe step.  
Follow prompt workflows exactly.  
Validate fully.  
Do not improvise.
