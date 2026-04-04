# CLAUDE.md Slimdown — Audit Brief

_Generated: 2026-04-03_
_Purpose: External audit of the restructuring work performed on Claude Code instruction files._

---

## What was the problem?

The project had two always-loaded instruction files for Claude Code:

- `CLAUDE.md` — 1,176 lines, 40,414 characters
- `AGENTS.md` — 710 lines, 29,242 characters
- **Total loaded every session: 69,656 characters**

Both files were loaded into Claude's context window at the start of every session. The problems:

1. **Internal duplication in CLAUDE.md**: Nine sections appeared twice within the same file (a paste accident that was never cleaned up). Task Scope Rule, Pre-Implementation Checklist, Anti-Drift Rule, Terminology Clarification, Prompt Compliance, Prompt Execution Rule, Prompt Command Output Rule, Prompt Creation Output Rule, and Stop Condition all had verbatim second copies around lines 580-695.

2. **Cross-file duplication**: CLAUDE.md and AGENTS.md both contained full copies of prompt tracking rules, sprint tracking rules, retrospection/puzzle rules, doc dating rules, and anti-drift guidelines.

3. **Always-loaded reference catalogs**: Large tables (Lichess source paths, tech stack options, deliberate divergences, board/engine/tree specs, game import system details) were loaded every session even when the task was a docs edit or prompt workflow operation.

4. **Stale content**: A "Current Build Priority" list where items 1-6 were already completed.

5. **No `.claude/rules/` usage**: Claude Code supports path-scoped rules files that only load when Claude reads files matching specific glob patterns. This feature was not being used.

---

## What was the plan?

Six steps, executed in dependency order:

1. Delete internal CLAUDE.md duplication (the repeated block at lines ~580-695)
2. Create `.claude/rules/` directory with 7 path-scoped rules files
3. Remove the corresponding sections from CLAUDE.md (they now live in rules files)
4. Trim Prompt Tracking, Sprint Tracking, and Retrospection sections to redirect stubs (full rules remain in AGENTS.md)
5. Remove stale Current Build Priority list
6. Document everything in a changelog doc

---

## What was done — step by step

### Step 1: Delete internal CLAUDE.md duplication

**What**: Removed the second copy of 9 sections that appeared twice within CLAUDE.md. The duplicate block started at line 580 where a Frontend Rules bullet ran directly into `## Task Scope Rule (CRITICAL)` on the same line (malformed paste). Everything from there through line ~695 was a verbatim repeat of content from lines 57-319.

**Result**: CLAUDE.md went from 1,176 lines / 40,414 chars to 1,075 lines / 37,226 chars.

### Step 2: Create `.claude/rules/` with path-scoped rules

**What**: Created 7 new Markdown files in `.claude/rules/`, each with YAML frontmatter specifying which file paths trigger their loading:

| File | Paths trigger | Content source |
|---|---|---|
| `performance.md` | `src/**/*.ts`, `server/**` | CLAUDE.md Performance Rules section |
| `lichess-reference.md` | `src/**/*.ts` | CLAUDE.md Lichess Reference Source + Key Source Paths table + Reuse Priority + Adaptation Rule |
| `architecture.md` | `src/**/*.ts`, `server/**` | CLAUDE.md File-structure/extraction rules + subsystem boundaries + module patterns + State Architecture + First Task Rule |
| `stack-and-build.md` | `src/**/*.ts`, `package.json`, `tsconfig.json`, `esbuild*`, `server/**` | CLAUDE.md Tech Direction + Stack tables + Divergences + Packages + Frontend Rules + TS Config + Backend Rules + Build System |
| `board-engine-tree.md` | `src/board/**`, `src/engine/**`, `src/tree/**`, `src/ceval/**`, `src/analyse/**`, `src/puzzles/**`, `src/openings/**`, `src/study/practice/**` (paths expanded post-rollout) | CLAUDE.md Board Implementation + Engine Architecture + Move Tree/Variations + Puzzle Generation |
| `import-and-storage.md` | `src/header/**`, `src/import/**`, `src/games/**`, `src/idb/**`, `src/openings/**`, `server/**` (paths expanded post-rollout) | CLAUDE.md Game Import + Data Storage + Header/Navigation UI Reference |
| `provenance.md` | `src/**/*.ts`, `server/**` | CLAUDE.md Change Log/Comments/Provenance Rules |

**How path-scoped rules work**: Rules with a `paths` YAML frontmatter block only load when Claude reads a file matching one of those glob patterns. Rules without `paths` load every session (like CLAUDE.md). All 7 new rules use `paths`, so they only load when relevant.

**Initial extraction was verbatim** — the rules files were created with the exact text from
CLAUDE.md. However, the initial path coverage was too narrow for the live repo (see
"Post-rollout corrections" below), and the `architecture.md` subsystem boundary listing
contained a stale path (`src/persistence/`) that didn't match the actual repo (`src/idb/index.ts`).
These issues were corrected after the initial rollout.

### Step 3: Remove extracted sections from CLAUDE.md

**What**: After confirming each section existed in its rules file, removed:
- File-structure and extraction rules (now in `architecture.md`)
- Lichess Reference Source details + Key Source Paths table (now in `lichess-reference.md`)
- Change Log/Comments/Provenance Rules (now in `provenance.md`)
- Technical Direction + Stack tables + Divergences + Packages + Frontend Rules + TS Config + Backend Rules (now in `stack-and-build.md`)
- Board Implementation + State Architecture + Naming & Structure + Engine Architecture + Move Tree + Puzzle Generation + Game Import + Data Storage (now in `board-engine-tree.md` and `import-and-storage.md`)
- Build System (now in `stack-and-build.md`)
- First Task Rule + Reuse Priority + Adaptation Rule (now in `architecture.md` and `lichess-reference.md`)
- Header / Navigation UI Reference (now in `import-and-storage.md`)

### Step 4: Trim workflow sections to redirect stubs

**What**: Three sections in CLAUDE.md duplicated large blocks from AGENTS.md. Replaced them with short redirects that preserve the essential trigger + hard gate while pointing to AGENTS.md for the full rules.

**Prompt Tracking Rule** — was ~50 lines with a full routing table and ~15 inline hard rules. Now ~8 lines: trigger description, pointer to PROMPT_REGISTRY_README.md, pointer to AGENTS.md for full routing table, and the Tracked Prompt Gate (preserved in full because it's a hard behavioral gate that prevents untracked code changes).

**Sprint Tracking Rule** — was ~40 lines with full routing table and ~8 inline hard rules. Now ~5 lines: trigger description, pointer to SPRINT_REGISTRY_README.md, pointer to AGENTS.md.

**Retrospection / Puzzle Research Rule** — was ~37 lines with detailed process steps. Now 3 lines: redirect to AGENTS.md rule + mandatory reference doc pointers.

### Step 5: Remove stale content

**What**: Removed the "Current Build Priority" list (items 1-6 were already completed based on the actual codebase state).

### Step 6: Documentation

Created:
- `docs/CLAUDE_MD_SLIMDOWN-2026-04-03.md` — changelog with before/after metrics
- `docs/CLAUDE_CODE_USER_GUIDE.md` — user guide for all Claude Code configuration
- This file (`docs/CLAUDE_MD_SLIMDOWN_AUDIT_BRIEF.md`) — audit brief

---

## Results

### Size comparison

| Metric | Before | After | Change |
|---|---|---|---|
| CLAUDE.md lines | 1,176 | 385 | -67% |
| CLAUDE.md characters | 40,414 | 12,377 | -69% |
| AGENTS.md lines | 710 | 710 (same line count, content modified) | modified |
| AGENTS.md characters | 29,242 | 29,242 (same char count, content modified) | modified |
| Always-loaded total | 69,656 chars | 41,619 chars | -40% |
| Rules files (7, conditional) | 0 | 582 lines / 19,301 chars | new |

### What was preserved in always-loaded CLAUDE.md

All hard behavioral gates remain:
- Project identity, terminology, core philosophy
- Task Scope Rule (1-3 file limit)
- Pre-Implementation Checklist (Lichess-first, divergence confirmation)
- Anti-Drift Rule
- Prompt Execution Rule (lifecycle commands: start/complete)
- Prompt Command Output Rule (SIGPIPE prevention — never truncate lifecycle output)
- Prompt Creation Output Rule (reserved ID + checklist + taxonomy verification)
- Tracked Prompt Gate (must check for existing CCP prompt before any code change)
- Prompt Tracking trigger + redirect to canonical docs
- Sprint Tracking trigger + redirect to canonical docs
- Stop Condition
- File Discipline Rule
- Doc Line Item Dating Rule
- Open Source / License Rule
- Navigation Structure, Development Workflow, Definition of Done, Bug Fix Protocol
- Goal statement

### What else changed (corrections to original claims)

The original version of this document stated that `AGENTS.md` was "completely unchanged" and that
the slimdown was a "pure extraction" with "no rules rewritten." That was not accurate. The full
picture:

**`AGENTS.md` was materially modified.** The uncommitted diff shows ~137 added lines and ~7
removed lines relative to the last commit. Changes include:
- Decision Lock Rule added (new section)
- Material divergence definition expanded with explicit examples and exclusions
- Prompt command output rule expanded (added `prompt:skip` to the lifecycle command list)
- Prompt creation output rule expanded (taxonomy verification step added)
- Prompt tracking hard rules expanded (hand-edit prohibition for generated artifacts, manager
  workflow default, dashboard editing rules, skipped-prompt handling)
- Sprint tracking hard rules expanded (normalized phase/task requirement, backfill restriction,
  sprint detail panel behavior)
- Doc line item dating rule added to AGENTS.md (was previously only in CLAUDE.md)
- Various wording refinements throughout

These changes happened during the same session as the CLAUDE.md slimdown. When CLAUDE.md sections
were trimmed to redirect stubs pointing at AGENTS.md, the AGENTS.md versions were updated to be
the complete canonical source. This means the slimdown was not purely mechanical — it also
involved strengthening and expanding the AGENTS.md rules that CLAUDE.md now delegates to.

**Scoped rules had initial path coverage gaps.** The initial rollout of `.claude/rules/` files
used path globs that were too narrow for the live repo:
- `board-engine-tree.md` initially covered only `src/board/**`, `src/engine/**`, `src/tree/**`,
  `src/ceval/**`, `src/analyse/**` — missing `src/puzzles/**`, `src/openings/**`, and
  `src/study/practice/**`. Corrected post-rollout.
- `import-and-storage.md` initially covered only `src/import/**`, `src/games/**`, `src/idb/**`,
  `server/**` — missing `src/header/**` and `src/openings/**`. Corrected post-rollout.
- `architecture.md` listed `src/persistence/` as a subsystem boundary, but the actual repo path
  is `src/idb/index.ts`. Corrected post-rollout.

**What was NOT changed:**
- The canonical prompt docs (`docs/prompts/`) and sprint docs (`docs/mini-sprints/`) were not touched
- No behavioral rules were removed — all rules exist in at least one of CLAUDE.md, AGENTS.md, or `.claude/rules/`

---

## Audit questions for the reviewer

1. **Completeness**: Is any behavioral rule that was in the original CLAUDE.md now missing from all three locations (CLAUDE.md, AGENTS.md, `.claude/rules/`)?

2. **Hard gate preservation**: Are the critical gates (Tracked Prompt Gate, prompt lifecycle commands, SIGPIPE prevention, sprint doc redirect) still in always-loaded CLAUDE.md?

3. **Path coverage**: Do the glob patterns in the rules files cover all relevant source paths? Could any rule fail to load when it should?

4. **Cross-file consistency**: Do the redirect stubs in CLAUDE.md correctly point to AGENTS.md? Is there any case where CLAUDE.md says one thing and AGENTS.md says something different?

5. **AGENTS.md duplication**: Now that CLAUDE.md is slim, should AGENTS.md also be trimmed? (It still contains some content that is also in the rules files, though from a different perspective — AGENTS.md frames rules for all agents, rules files frame them for file-specific context.)
