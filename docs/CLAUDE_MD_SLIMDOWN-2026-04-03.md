# CLAUDE.md Slimdown — 2026-04-03

## Purpose

Document the restructuring of `CLAUDE.md` and introduction of `.claude/rules/` to reduce
always-loaded context, eliminate duplication, and improve instruction adherence.

## Problem

| File | Lines (before) | Characters (before) |
|---|---|---|
| CLAUDE.md | 1,176 | 40,414 |
| AGENTS.md | 710 | 29,242 |
| **Total always-loaded** | **1,886** | **69,656** |

Issues identified:
- CLAUDE.md contained internal duplication: ~9 sections repeated verbatim within the same file (lines ~580-695 duplicating lines ~57-319)
- CLAUDE.md and AGENTS.md duplicated prompt tracking, sprint tracking, retrospection/puzzle, doc dating, and anti-drift rules
- Reference catalogs (Lichess source paths, stack tables, divergence tables, board/engine/tree specs) loaded every session regardless of task relevance
- "Current Build Priority" list was stale (items 1-6 already completed)
- No `.claude/rules/` directory existed — all instructions were always-loaded

## Changes Made

### 1. Deleted internal CLAUDE.md duplication

Removed the second copy of these sections that appeared twice within CLAUDE.md:
- Task Scope Rule
- Pre-Implementation Checklist
- Anti-Drift Rule
- Terminology Clarification Rule
- Prompt Compliance Rule
- Prompt Execution Rule
- Prompt Command Output Rule
- Prompt Creation Output Rule
- Stop Condition

### 2. Created `.claude/rules/` with path-scoped rules

New files (only loaded when Claude reads matching file paths):

| Rules file | Paths trigger | Content moved from CLAUDE.md |
|---|---|---|
| `performance.md` | `src/**/*.ts`, `server/**` | Performance Rules (CR-1 to CR-10, anti-patterns, rendering rules) |
| `lichess-reference.md` | `src/**/*.ts` | Key Source Paths table, Lichess reference details, Reuse Priority, Adaptation Rule |
| `architecture.md` | `src/**/*.ts`, `server/**` | File-structure/extraction rules, subsystem boundaries, module structure examples, State Architecture Rule |
| `stack-and-build.md` | `src/**/*.ts`, `package.json`, `tsconfig.json`, `esbuild*` | Stack tables, Deliberate Divergences, Key Packages, Frontend Rules, TS Config, Backend Rules, Build System |
| `board-engine-tree.md` | `src/board/**`, `src/engine/**`, `src/tree/**`, `src/ceval/**`, `src/analyse/**`, `src/puzzles/**`, `src/openings/**`, `src/study/practice/**` | Board Implementation Direction, Engine Architecture, Move Tree/Variations |
| `import-and-storage.md` | `src/header/**`, `src/import/**`, `src/games/**`, `src/idb/**`, `src/openings/**`, `server/**` | Game Import System, Data Storage, Header/Navigation UI Reference |
| `provenance.md` | `src/**/*.ts`, `server/**` | Change Log, Comments, and Provenance Rules |

### 3. Trimmed cross-file duplication with AGENTS.md

Sections reduced to redirect stubs (trigger + doc pointer + hard gates only):
- Prompt Tracking Rule — kept Tracked Prompt Gate, removed inline hard-rules list
- Sprint Tracking Rule — kept trigger + redirect, removed inline hard-rules list
- Retrospection / Puzzle Research Rule — reduced to 3-line redirect

### 4. Removed stale content

- Removed "Current Build Priority" list (items 1-6 already completed)

### 5. What was preserved in CLAUDE.md (always-loaded)

These sections remain because they are hard behavioral gates:
- Project Overview + Terminology
- Core Philosophy
- Task Scope Rule (single copy)
- Pre-Implementation Checklist (single copy)
- Anti-Drift Rule (single copy)
- Prompt Execution Rule (lifecycle commands)
- Prompt Command Output Rule (SIGPIPE prevention)
- Prompt Creation Output Rule
- Tracked Prompt Gate
- Prompt Tracking trigger + redirect
- Sprint Tracking trigger + redirect
- Stop Condition (single copy)
- File Discipline Rule
- Development Workflow
- Definition of Done
- Bug Fix Protocol
- Doc Line Item Dating Rule
- Open Source / License Rule
- Navigation Structure
- UI States + Mobile Behavior
- Goal statement

## Results

| File | Lines (after) | Characters (after) |
|---|---|---|
| CLAUDE.md | 385 | 12,377 |
| AGENTS.md | 710 (modified — see below) | 29,242 (modified — see below) |
| `.claude/rules/` (7 files, conditional) | 582 total | 19,301 total |

### Always-loaded context comparison

| Metric | Before | After | Change |
|---|---|---|---|
| CLAUDE.md lines | 1,176 | 385 | -67% |
| CLAUDE.md characters | 40,414 | 12,377 | -69% |
| Always-loaded total (CLAUDE.md + AGENTS.md) | 69,656 chars | 41,619 chars | -40% |

### Conditional rules files created

| File | Lines | Characters | Triggers on |
|---|---|---|---|
| `performance.md` | 64 | 2,792 | `src/**/*.ts`, `server/**` |
| `lichess-reference.md` | 66 | 2,170 | `src/**/*.ts` |
| `architecture.md` | 79 | 3,073 | `src/**/*.ts`, `server/**` |
| `stack-and-build.md` | 106 | 3,657 | `src/**/*.ts`, `package.json`, `tsconfig.json`, `esbuild*`, `server/**` |
| `board-engine-tree.md` | 97 | 2,163 | `src/board/**`, `src/engine/**`, `src/tree/**`, `src/ceval/**`, `src/analyse/**`, `src/puzzles/**`, `src/openings/**`, `src/study/practice/**` |
| `import-and-storage.md` | 74 | 2,317 | `src/header/**`, `src/import/**`, `src/games/**`, `src/idb/**`, `src/openings/**`, `server/**` |
| `provenance.md` | 96 | 3,129 | `src/**/*.ts`, `server/**` |

### Net effect

- For **non-code sessions** (docs, prompts, sprints): context savings of ~28,000 characters (40%)
- For **code sessions** touching `src/`: most rules load conditionally, but total context is still reduced by ~10,000+ characters due to eliminated duplication
- **No behavioral rules were removed** — all hard gates (Tracked Prompt Gate, lifecycle commands, SIGPIPE prevention, sprint/prompt redirects) remain in always-loaded CLAUDE.md

### Corrections and post-rollout changes

The initial version of this document described the slimdown as a pure mechanical extraction with
AGENTS.md unchanged. That was not accurate:

1. **AGENTS.md was materially modified** during the same session. When CLAUDE.md sections were
   trimmed to redirect stubs, the AGENTS.md counterparts were updated and expanded to serve as the
   complete canonical source. Changes included: Decision Lock Rule added, material divergence
   definition expanded, prompt/sprint tracking hard rules expanded, doc line item dating rule added.

2. **Scoped rules had initial path coverage gaps** that were corrected post-rollout:
   - `board-engine-tree.md` — added `src/puzzles/**`, `src/openings/**`, `src/study/practice/**`
   - `import-and-storage.md` — added `src/header/**`, `src/openings/**`
   - `architecture.md` — corrected stale subsystem path from `src/persistence/` to `src/idb/index.ts`

See `docs/CLAUDE_MD_SLIMDOWN_AUDIT_BRIEF.md` for the full audit record.
