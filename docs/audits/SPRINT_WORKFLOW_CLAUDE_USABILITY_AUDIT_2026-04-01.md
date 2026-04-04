# Sprint Workflow Claude Usability Audit — 2026-04-01

Source prompt: CCP-661

## 1. Overall Verdict

The sprint workflow is **currently strong enough for Claude to use safely**, but with **moderate confidence** (roughly 70%). The docs-to-tooling alignment is good — commands validate inputs, enforce normalized structure, and the lockfile mechanism prevents concurrent corruption. The main risks are not catastrophic failures but **silent drift**: places where Claude can follow the documented process correctly and still produce inconsistent or stale results because the docs leave certain decision points implicit, or because two subsystems (sprint registry vs prompt registry) have subtly different status vocabularies that map imprecisely during recomputation.

## 2. Findings

### Finding 1 — HIGH: Two overlapping status vocabularies create confusion

- Files: `scripts/sprint-registry-lib.mjs:19-68`, `docs/mini-sprints/SPRINT_PROGRESS_PROCESS.md:17-38`
- The sprint registry lib defines two complete sets of valid statuses for each entity level. For example, `VALID_SPRINT_STATUS` includes both human-readable dashboard states (`"Needs Prompts"`, `"Completed: With Issues"`) AND kebab-case internal states (`"planned"`, `"completed-with-issues"`). Same pattern for phases and tasks.
- The `sprint:backfill` script writes kebab-case statuses (`"planned"`, `"implemented"`, etc.) while the `sprint:recompute` path (via `buildSprintDashboardData`) derives human-readable statuses (`"Prompt Complete"`, `"Completed: Review Passed"`).
- **Failure mode for Claude:** When Claude runs a sprint audit and needs to set `--task-outcomes`, it must use exactly `"Audit Confirmed Done"` or `"Audit Found Mismatch"`. But the progress docs also show kebab-case statuses like `"verified"` and `"implemented"`. Claude could easily pick the wrong vocabulary for the wrong context.
- **Why this is a real risk:** The `sprint-audit-complete.mjs` script only accepts the two exact strings — anything else throws. But the docs never explicitly say "use these exact strings, not the kebab-case ones." Claude has to infer this from reading the script.

### Finding 2 — HIGH: `sprint:backfill` is destructive and globally scoped

- File: `scripts/sprint-backfill.mjs:616-637`
- `sprint:backfill` replaces `sprintRegistry.sprints`, `sprintRegistry.phases`, and `sprintRegistry.tasks` wholesale. It also clears and rebuilds ALL prompt sprint linkage fields (lines 617-631).
- If Claude runs `sprint:backfill` as part of a normal sprint creation flow (the creation process doc step 5 says "run `sprint:backfill` only when needed for legacy/backfill work"), it will overwrite any manually-set sprint linkage on prompts that were linked via `prompt:create --sprint-id`.
- **Failure mode for Claude:** The creation doc lists backfill as step 5, and a Claude session could reasonably run it "just in case." The guard rail is only a prose instruction "only when needed for legacy/backfill work."
- **Why this is a real risk:** This has already happened — the backfill was designed for the one-time bootstrap from the March 30 audit. Running it again wipes carefully-set prompt-to-sprint linkage.

### Finding 3 — MEDIUM: No validation that sprint markdown doc exists for `sprint:audit:complete`

- File: `scripts/sprint-audit-complete.mjs:32-36`
- The `--audit-document` flag is accepted without verifying the file exists. Claude could complete an audit referencing a nonexistent audit doc path.
- **Failure mode:** The sprint registry would reference a ghost audit document. The dashboard would show an audit link to nothing.

### Finding 4 — MEDIUM: `sprint:create` silently updates existing sprints instead of erroring

- File: `scripts/sprint-create.mjs:43-50`
- If a sprint already exists for the given `sourceDocument`, `sprint:create` updates the existing record (title, status, dependencies, etc.) rather than rejecting.
- **Failure mode for Claude:** If Claude is told "create a sprint for X" and X already has a registry entry, the command succeeds silently but doesn't create anything new — it mutates the existing sprint. Claude would report "created" when it actually modified.

### Finding 5 — MEDIUM: Dashboard `auditPromptTemplate` contains absolute file paths

- File: `docs/mini-sprints/sprint-registry.json:22` (e.g., `"/Users/leftcoast/Development/PatzerPatzer/docs/reference/..."`)
- Some `auditRefs[].sourceDocument` values use absolute paths while others use relative. This inconsistency exists in the generated `auditPromptTemplate` text too.
- **Failure mode for Claude:** If Claude copies the audit prompt template and uses the paths, they work only on this machine. If anyone else works on this repo or it's deployed elsewhere, these paths break silently.

### Finding 6 — MEDIUM: No `sprint:recompute` run after `sprint:create`

- File: `scripts/sprint-create.mjs` — the script does NOT call `sprint:recompute` or `sprints:refresh` after creating/updating a sprint.
- The `SPRINT_CREATION_PROCESS.md` step 6 says "run a sprint audit after creation so the dashboard truth is refreshed through the audit workflow" — but that's a heavy workaround for what should be a simple refresh call.
- **Failure mode for Claude:** After running `sprint:create`, the dashboard and status doc are stale until Claude remembers to manually refresh.

### Finding 7 — LOW: `recommendedNextSteps` contains markdown formatting artifacts

- File: `docs/mini-sprints/sprint-registry.json:39-40`
- Recommended step titles like `"Implement **Not confirmed**"` contain markdown bold markers. These were likely parsed from audit doc markdown and stored verbatim.
- **Failure mode:** Low severity, but if Claude reads these titles and uses them to name prompts or generate text, the bold markers propagate into places they shouldn't be.

### Finding 8 — LOW: Sprint progress process doc doesn't mention `sprint:status` command

- File: `docs/mini-sprints/SPRINT_PROGRESS_PROCESS.md`
- The progress process doc lists `sprint:recompute` and `sprints:refresh` but does not mention `npm run sprint:status` as a way to quickly check sprint state from the terminal. Claude could overlook this useful diagnostic tool.

## 3. Workflow Gaps Or Ambiguities

1. **No explicit "which status vocabulary to use when"** — The docs never have a table saying "when writing `--task-outcomes`, use these exact strings; when writing `--status` for `sprint:create`, use these other strings." Claude must reverse-engineer this from script source.

2. **Backfill is ambiguously positioned** — It's listed as step 5 in the creation flow but also described as "only when needed for legacy/backfill work." There's no tooling guard (like a `--force` flag or a warning message) preventing accidental destructive runs.

3. **No clear guidance on when to audit vs when to just refresh** — The creation process says "run a sprint audit after creation." But for a brand-new sprint with zero prompts, what would the audit even find? The audit process doc doesn't address this "empty sprint" case.

4. **Dashboard status values are computed, not stored** — The `buildSprintDashboardData` function derives all statuses at render time. But the sprint registry also stores `status` fields on sprints, phases, and tasks from backfill. These two sources can diverge. The docs don't clarify which one Claude should trust when deciding what to do next.

5. **`sprint:create` doesn't seed phases and tasks** — After running `sprint:create`, the sprint exists in the registry but has empty `phaseIds`. The markdown doc has the phase/task structure but Claude has to manually run `sprint:backfill` (which is destructive) or there's no way to populate the registry with phases/tasks from the doc. This is a gap in the creation flow.

6. **No command to add a single sprint's phases/tasks** — There's `sprint:backfill` (global, destructive) but no targeted command like `sprint:seed -- --sprint-id SPR-016` that would parse one sprint doc and add its phases/tasks without touching other sprints.

## 4. What Is Already Good

1. **Lockfile-based concurrency protection** — Both registries use file locks with timeout. This prevents corruption from concurrent scripts.

2. **Prompt body validation at creation time** — `prompt-create.mjs` calls `validatePromptBodyText()` which catches missing headers, missing lifecycle sections, and wrong prompt IDs.

3. **Sprint linkage validation at prompt creation** — The `prompt-create.mjs` script validates that all three sprint linkage fields are present and point to valid, consistent sprint/phase/task chains. The check at lines 100-117 is thorough and catches cross-reference errors.

4. **Normalized structure enforcement** — `sprint:create` rejects sprint docs that don't have phase/task headings. This prevents the "sprint exists but can't generate prompts" problem.

5. **Prompt lifecycle auto-refresh** — `prompt:complete` runs both `sprint:recompute` and `prompts:refresh`, so sprint progress updates automatically when prompts complete.

6. **Clear canonical doc hierarchy** — The "read this first" pattern in both `SPRINT_REGISTRY_README.md` and `PROMPT_REGISTRY_README.md` is effective. The authority chain is unambiguous.

7. **Comprehensive trigger/phrasing maps** — Both README files include user language trigger maps that help Claude match natural language to the right workflow.

8. **Audit truth update command** — `sprint:audit:complete` cleanly separates audit completion from dashboard refresh, with explicit task outcome mapping.

## 5. Recommended Hardening Changes

### Priority 1: Add a targeted sprint seeding command

Create `sprint:seed -- --sprint-id SPR-###` that parses one sprint doc and populates phases/tasks for that sprint only, without touching other sprints or prompt linkage. This fills the critical gap between `sprint:create` (which only creates the sprint shell) and `sprint:backfill` (which is globally destructive). Until this exists, there's no safe non-destructive way to populate a new sprint's registry structure.

### Priority 2: Add `sprints:refresh` call to `sprint:create`

The script should auto-refresh after creating/updating a sprint, just like `prompt:create` auto-refreshes. This eliminates a manual step Claude will forget.

### Priority 3: Guard `sprint:backfill` with a confirmation flag

Add a `--confirm-overwrite` flag (or similar). Without it, the script should warn and exit. This prevents accidental destructive runs.

### Priority 4: Document the exact status vocabulary per command

Add a small table to `SPRINT_PROGRESS_PROCESS.md` or `SPRINT_AUDIT_PROCESS.md`:

| Command | Accepted status values |
|---|---|
| `sprint:create --status` | `planned`, `active`, `completed`, etc. (kebab-case) |
| `sprint:audit:complete --task-outcomes` | exactly `Audit Confirmed Done` or `Audit Found Mismatch` |

### Priority 5: Validate `--audit-document` exists

Add `existsSync` check in `sprint-audit-complete.mjs` before accepting the audit document path.

### Priority 6: Normalize audit ref paths to relative

Ensure `auditRefs[].sourceDocument` always stores repo-relative paths, not absolute. Strip any absolute prefix before storing.

## 6. Best Prompting Advice For The User

### Create a sprint

> Create a sprint plan for [goal]. The sprint doc is at docs/mini-sprints/[FILENAME].md. Make sure the doc has normalized Phase/Task headings before registering. After sprint:create, run sprint:backfill if phases/tasks need to be seeded (but only if no other sprints have manually-linked prompts that would be overwritten).

### Create prompts for a sprint

> Create the next prompts for sprint SPR-### phase SPR-###-P#. Use exact sprint linkage (--sprint-id, --sprint-phase-id, --sprint-task-id) for each prompt. Verify linkage in the registry after creation.

### Audit a sprint

> Audit sprint SPR-### against implementation. Compare the sprint doc, sprint registry, linked prompts, and actual codebase. For each task, determine whether it's Audit Confirmed Done or Audit Found Mismatch. Run sprint:audit:complete with --task-outcomes using those exact strings. Then verify the dashboard refreshed correctly.

### Update the sprint workflow

> Update our sprint workflow so that [change]. Follow the workflow-change propagation rule -- check every canonical sprint doc plus AGENTS.md and CLAUDE.md.

## Validation Answers

- **Sprint creation path decision-complete for Claude?** No. `sprint:create` only creates the shell; there's no safe way to seed phases/tasks without the destructive global backfill.
- **Sprint audit path decision-complete for Claude?** Mostly yes. The `sprint:audit:complete` command is well-structured, but Claude must know to use exact status strings (`Audit Confirmed Done` / `Audit Found Mismatch`) which are not documented clearly enough.
- **Prompt-to-sprint linkage clear enough?** Yes, at prompt creation time. The tooling enforces all three linkage fields and validates the chain. Risk is only from `sprint:backfill` overwriting this linkage.
- **Dashboard semantics aligned with documented sprint states?** Partially. The dashboard computes states at render time which may differ from stored registry states. The two vocabularies (kebab-case stored vs human-readable computed) are both valid but confusing.
- **Any docs or scripts likely to mislead Claude?** Yes. The backfill step in `SPRINT_CREATION_PROCESS.md` step 5 is the biggest risk. The dual status vocabulary is the second.
