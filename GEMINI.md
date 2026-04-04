# Gemini CLI — Patzer Pro Agent Configuration

This document defines the behavior and workflow for Gemini CLI agents working in this repository.

It is intentionally concise and defers architectural and workflow authority to the canonical repo
documents:

1. `CLAUDE.md` — architecture rules, stack rules, subsystem structure
2. `AGENTS.md` — workflow rules, prompt lifecycle, review protocol, and validation requirements

Gemini must read those documents before beginning any work.

---

# Core Principles

## 1. Lichess Parity as Default

Patzer Pro uses **Lichess as the behavioral and architectural reference** for core chess systems.

This includes:

- analysis board behavior
- move tree and variation logic
- engine UX and evaluation display
- keyboard navigation
- board interaction
- puzzle and retrospection workflows
- analysis/review pipeline
- engine communication and state handling

Before implementing or modifying any feature related to these systems:

1. Inspect the relevant Lichess source in:

```
~/Development/lichess-source/lila
```

2. Identify the corresponding modules
3. Compare the current Patzer implementation
4. Detect any divergence

If a requested change would materially diverge from Lichess behavior and the user has not explicitly
requested that divergence, **stop and ask for confirmation before coding**.

---

## 2. Controlled UI Deviation (Design / Reverse Engineering Work)

Gemini is frequently used for:

- UI exploration
- reverse engineering UX patterns
- layout experimentation
- design analysis
- UI behavior comparison

In these cases:

Lichess should still be treated as the **primary behavioral reference**, but **visual or structural
UI differences may be explored when explicitly requested**.

Allowed deviations (when requested):

- layout variations
- improved UI hierarchy
- alternative panel structures
- spacing and typography adjustments
- control placement
- discoverability improvements
- experimentation for Patzer-specific workflows

Not allowed without explicit instruction:

- changing core chess interaction behavior
- altering move tree semantics
- modifying engine analysis pipeline
- inventing new puzzle-selection heuristics
- replacing Lichess architectural patterns

UI exploration should **never silently change underlying chess logic or data flow**.

If a UI exploration requires backend or behavioral divergence, Gemini must clearly call this out
before implementing.

---

## Decision Lock for UI Exploration

Gemini is frequently used for UI reverse engineering, design exploration, and layout experiments. Before implementing UI changes, Gemini must explicitly confirm:

- whether the task maintains Lichess parity or intentionally deviates
- whether the change is visual-only or behavior-changing
- which subsystem/files are affected
- acceptance criteria

Gemini must not silently change:
- chess logic
- engine pipeline
- move tree behavior
- puzzle logic

If any of these could change, Gemini must ask before implementing.

---

## 3. Small Task Scope

All implementation work must remain tightly scoped.

Constraints:

- change **1–3 files maximum**
- implement **one small task at a time**
- do not bundle multiple features
- do not refactor unrelated code

If a task grows beyond this scope:

- stop
- explain why
- propose smaller steps

---

## 4. Snabbdom + Chessground UI Rules

Frontend must follow the Lichess UI model.

Allowed UI stack:

- **Snabbdom (`h()` virtual DOM)**
- **Chessground board**
- **TypeScript modules**

Do NOT introduce:

- React
- heavy component frameworks
- direct DOM mutation patterns
- unnecessary abstraction layers

When building UI modules, follow the Lichess pattern:

```
ctrl.ts  → state + behavior
view.ts  → rendering only
```

---

## 5. Prompt Lifecycle Workflow

This repository uses a tracked prompt system.

For any task delivered as a `CCP-###` prompt:

Before coding:

```
npm run prompt:start -- <PROMPT_ID>
```

After completing work:

```
npm run prompt:complete -- <PROMPT_ID> --checklist "..."
```

Never truncate output of these commands.

Do not pipe lifecycle commands through `head` or `tail`.

---

## 6. Mandatory Validation

After any code change, Gemini must run:

```
npm run build
npx tsc --noEmit
```

Both must succeed.

A successful esbuild bundle **does not guarantee type safety**.

---

## 7. Wiring Verification

New functions or services must be verified as actually used.

Before finishing a task:

- search the codebase for a call site
- confirm the implementation is reachable through a live code path

Avoid shipping dead code.

---

## 8. Performance Rules

All implementation must comply with:

```
docs/PERFORMANCE_GUIDELINES.md
```

Core rules (CR-1 → CR-10) are blocking.

Gemini must not introduce patterns that:

- block the UI thread
- load large datasets eagerly
- store collections as single IDB records
- trigger unthrottled engine redraws

---

## 9. Research Workflow

Before implementing any feature:

1. Inspect the Patzer codebase
2. Locate the relevant subsystem
3. Inspect the Lichess reference implementation
4. Identify the smallest safe step

Helpful strategies:

- utilize `codebase_investigator` for broad architectural mapping or finding cross-module dependencies before deep-diving with `grep_search`
- search the repo for existing logic
- confirm wiring paths
- verify subsystem ownership

---

## 10. Stop Conditions

Gemini must stop and ask for guidance if:

- the task exceeds 3 files
- Lichess reference is unclear
- requirements are ambiguous
- build or type-check fails
- a change would materially diverge from Lichess behavior without explicit instruction

---

# Context Priority

Before starting work, read in this order:

1. `CLAUDE.md`
2. `AGENTS.md`
3. `docs/prompts/PROMPT_REGISTRY_README.md`
4. `docs/mini-sprints/SPRINT_REGISTRY_README.md`

---

# Summary

Gemini should behave as:

- a **careful implementer**
- a **Lichess-informed reverse engineer**
- a **UI exploration assistant when requested**

Default stance:

**replicate Lichess behavior first, then experiment with UI only when explicitly directed.**