---
paths:
  - "src/**/*.ts"
  - "server/**"
---

# Performance Rules (MANDATORY)

Claude must follow `docs/PERFORMANCE_GUIDELINES.md` for all implementation work.
Violations of Core Rules (CR-1 through CR-10) are blocking — code must not ship
until they are resolved.

## Quick reference (non-negotiable rules)

- **CR-1:** Never block UI on large dataset queries (>100 records must be async)
- **CR-2:** Never load an entire object store eagerly (use cursors, pagination, on-demand)
- **CR-3:** All lists >200 items must be virtualized or paginated
- **CR-4:** Heavy computation (>1000 records or >50ms) must be deferred or offloaded
- **CR-5:** Game imports must never freeze the UI
- **CR-6:** Analysis data stored once — eval cache for runtime, IDB for persistence
- **CR-7:** IDB records must be individually keyed (never store a collection as one record)
- **CR-8:** Sync must be differential (transfer only changed records)
- **CR-9:** Server writes must be batched (multi-row INSERT, not sequential loops)
- **CR-10:** Engine UI updates must be throttled to 200ms maximum frequency

## Performance pre-implementation step

Before writing any code, Claude must:
1. Identify performance risks in the proposed approach
2. Confirm the approach scales to 30k+ games
3. Check `docs/PERFORMANCE_CHECKLIST.md` against the implementation plan
4. Compare with Lichess implementation for performance patterns
5. Verify no anti-patterns from `docs/PERFORMANCE_GUIDELINES.md` (AP-1 through AP-8)

If the task involves data storage, query patterns, list rendering, engine
integration, or sync, Claude must read the relevant section of
`docs/DATA_ARCHITECTURE.md` before implementing.

## Known debt

Active performance debt is tracked in `docs/PERFORMANCE_DEBT.md`. Claude must
not add new features on top of Critical-severity debt without explicit approval.
When fixing debt items, mark them as resolved in that document.

## Rendering rules

- Do not re-render board unnecessarily (Snabbdom patches only changed vnodes)
- Throttle engine updates to 200ms (Lichess pattern: `ui/lib/src/ceval/ctrl.ts`)
- Gate all `redraw()` calls through `requestAnimationFrame`
- Chunk large imports with `setTimeout(fn, 0)` yielding
- Cache analysis results (IndexedDB)
- Use `requestIdleCallback` for non-critical initialization
- Render page shell immediately; fill data asynchronously

## Anti-patterns (explicitly forbidden)

- Storing collections as single IDB records (AP-1)
- `getAll()` on stores exceeding 500 records (AP-2)
- Sequential single-row server inserts in loops (AP-3)
- Full-dump sync of entire datasets (AP-4)
- Unthrottled engine-to-UI redraws (AP-5)
- Dedup via full-content Set (AP-6)
- Unbounded in-memory caches without eviction (AP-7)
- Version-based analysis data discard (AP-8)
