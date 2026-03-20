# New Feature Prompt

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

This task is a new feature or new workflow.

Required workflow:
1. Search the current codebase first
2. Identify which subsystem should own the feature
3. Inspect relevant Lichess source if the feature overlaps with Lichess behavior
4. Decide whether the work belongs in:
   - an existing subsystem
   - a new module
5. Implement only the smallest useful first step
6. Validate after coding

Rules:
- do not add medium or large feature code to `src/main.ts`
- choose the owner module before implementing
- preserve the current architecture direction
- prefer incremental rollout over broad implementation

Before coding, provide:
- feature type
- owner subsystem
- relevant current files
- relevant Lichess files if applicable
- exact first step being implemented
- why that first step is the correct size

Task:
[PASTE FEATURE HERE]
