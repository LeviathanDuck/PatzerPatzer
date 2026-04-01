# Performance Checklist

Run through this checklist before shipping any feature or fix.
Every item must pass. If any item fails, fix it before merging.

---

## Data & Storage

- [ ] **No full-store loads.** Does this feature call `getAll()` on any IDB
      store that can exceed 500 records? If yes, switch to cursor + limit.

- [ ] **No single-record collections.** Does this feature store a
      variable-length array as one IDB record? If yes, restructure to
      individual keyed records.

- [ ] **Scalable to 30k records.** Will this query, filter, or render
      pattern still work with 30,000+ records in the store? If uncertain,
      test with synthetic data or add explicit limits.

- [ ] **No full-content dedup.** Does deduplication hold entire record
      contents (like PGN strings) in a Set? If yes, use hashes or
      composite keys.

- [ ] **Indexed queries.** Are queries hitting an IDB index rather than
      scanning the full store? Check that required indexes exist.

- [ ] **Bounded growth.** If this feature writes to an append-only store
      (attempts, history), is there a retention policy?

---

## Rendering & UI

- [ ] **No UI blocking.** Does this feature block the main thread for
      >16ms during normal interaction? If yes, defer or offload.

- [ ] **Throttled updates.** If this feature triggers redraws from
      high-frequency sources (engine, scroll, resize, drag), are those
      redraws throttled?

- [ ] **No full-tree regen for local changes.** Does a localized state
      change (e.g., toggling one setting) trigger regeneration of the
      entire view tree? If yes, memoize unaffected sections.

- [ ] **Virtualized lists.** If this feature renders a list that can
      exceed 200 items, is it virtualized or paginated?

- [ ] **Shell before data.** Does this route render its layout skeleton
      immediately, or does it wait for async data before showing anything?

---

## Imports & Sync

- [ ] **Non-blocking import.** Does the game import flow keep the UI
      responsive? Can the user cancel or navigate during import?

- [ ] **Batched server writes.** Does this feature write to the server
      using multi-row inserts, not sequential single-row loops?

- [ ] **Differential sync.** Does push/pull transfer only changed records,
      not the full dataset?

- [ ] **Paginated responses.** Do server endpoints limit response size to
      ~1000 records per request?

---

## Engine & Analysis

- [ ] **200ms engine throttle.** Are engine-triggered redraws throttled to
      at most one per 200ms?

- [ ] **No data duplication.** Is analysis data stored in exactly one
      place (IDB for persistence, eval cache Map for runtime)?

- [ ] **Incremental saves.** Does batch analysis save partial progress to
      IDB, not just at the end?

---

## Memory

- [ ] **Bounded caches.** Do in-memory caches (shard cache, eval cache,
      analytics cache) have a maximum size or eviction policy?

- [ ] **No leaked listeners.** Are event listeners cleaned up when
      switching routes or closing panels?

- [ ] **No full-library in memory.** Is the full game library, puzzle
      library, or summary list held in a JavaScript array? If yes,
      switch to on-demand loading.

---

## Lichess Alignment

- [ ] **Pattern check.** Does this feature have a Lichess equivalent?
      If yes, does the implementation follow the Lichess performance
      pattern (throttling, lazy init, cursor-based queries)?

- [ ] **No unnecessary divergence.** If the implementation differs from
      Lichess, is the divergence justified and documented?
