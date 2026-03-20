# Refactor Step Prompt

Read and follow:
- `/Users/leftcoast/Development/PatzerPatzer/AGENTS.md`
- `/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md`

This is a refactor step only.
Do not add features.
Do not widen scope casually.

Required workflow:
1. Identify the exact extraction boundary
2. Identify dependencies and shared state
3. Verify how the current code works before moving anything
4. Inspect relevant Lichess structure if it helps clarify module boundaries
5. Move one subsystem only
6. Keep behavior unchanged unless explicitly asked otherwise
7. Validate immediately after the extraction
8. Update docs if the structure actually changed

Before coding, state:
- what moves
- what stays
- why the boundary is correct
- what shared state still exists
- what validation will show no regression

Must not do:
- mix refactor with new features
- widen scope casually
- touch risky code paths unless that is the explicit step
- change behavior unless explicitly requested

Task:
[PASTE REFACTOR STEP HERE]
