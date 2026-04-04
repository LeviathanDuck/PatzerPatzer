# CCP-721 — Audit: LFYM Engine Suppression and Surfacing Model

_Produced: 2026-04-04_

---

## 1. Toggle Fix

### Current handler (src/ceval/view.ts lines 136–142)

```typescript
click: () => {
  if (retroHiddenByDefault) {
    retroVisibleEngineEnabled = !retroVisibleEngineEnabled;
    if (retroVisibleEngineEnabled && !engineEnabled) toggleEngine();
    _redraw();
    return;
  }
  toggleEngine();
},
```

### What is missing

When the toggle turns ON (`retroVisibleEngineEnabled` becomes `true`):

| Missing call | Why needed |
|---|---|
| `_getCtrl().retro?.revealGuidance()` | Sets `_guidanceRevealed = true` so `retroHidden` in `buildArrowShapes()` evaluates to `false` and arrows render |
| `syncArrow()` | Pushes updated shapes to Chessground immediately; without it, arrows don't appear until the next redraw cycle that triggers `syncArrow` independently |
| `evalCurrentPosition()` | Ensures the engine is analyzing the current position (not a stale one); needed because the engine may have been running silently in the background |

When the toggle turns OFF, no additional calls are needed — `_redraw()` is sufficient.

### Exact fix

File: `src/ceval/view.ts`, lines 136–141.

Replace:
```typescript
click: () => {
  if (retroHiddenByDefault) {
    retroVisibleEngineEnabled = !retroVisibleEngineEnabled;
    if (retroVisibleEngineEnabled && !engineEnabled) toggleEngine();
    _redraw();
    return;
  }
  toggleEngine();
},
```

With:
```typescript
click: () => {
  if (retroHiddenByDefault) {
    retroVisibleEngineEnabled = !retroVisibleEngineEnabled;
    if (retroVisibleEngineEnabled) {
      if (!engineEnabled) toggleEngine();
      _getCtrl().retro?.revealGuidance();
      syncArrow();
      evalCurrentPosition();
    }
    _redraw();
    return;
  }
  toggleEngine();
},
```

### Import check

`syncArrow` and `evalCurrentPosition` are already imported from `'../engine/ctrl'` (line 26 of
`src/ceval/view.ts`). `_getCtrl` is already a module-level variable. No new imports needed.

---

## 2. Puzzle-Transition Reset Path

### Where the transition happens

`jumpToNext()` in `retroCtrl.ts` resets `_guidanceRevealed = false` (line 358) and other
per-candidate state. However, `retroVisibleEngineEnabled` lives in `src/ceval/view.ts` and
cannot be reset from `retroCtrl.ts` without creating a circular dependency.

The two call sites that advance to the next puzzle are both in `src/analyse/retroView.ts`:

1. **`renderContinue`** (line 255–260) — "Next" button:
   ```typescript
   on: { click: () => {
     retro.jumpToNext();
     const next = retro.current();
     if (next) navigate(next.parentPath);
     else redraw();
   }},
   ```

2. **`renderSkipOrView`** skip handler (lines 240–246) — "Skip this move" link:
   ```typescript
   on: { click: () => {
     retro.skip();
     const next = retro.current();
     if (next) navigate(next.parentPath);
     else redraw();
   }},
   ```

### Recommended location

Call `resetRetroVisibleEngineUi()` in both handlers in `retroView.ts`, immediately after
`retro.jumpToNext()` / `retro.skip()`:

```typescript
// renderContinue
retro.jumpToNext();
resetRetroVisibleEngineUi();
const next = retro.current();
...

// renderSkipOrView skip handler
retro.skip();
resetRetroVisibleEngineUi();
const next = retro.current();
...
```

`resetRetroVisibleEngineUi` is already exported from `src/ceval/view.ts` (line 75). It sets
`retroVisibleEngineEnabled = false` and `showEngineSettings = false`. It does NOT stop the
engine — the engine continues running for the next candidate.

**Do NOT put the reset inside `jumpToNext()` in `retroCtrl.ts`** — that would require
`retroCtrl.ts` to import from `ceval/view.ts`, creating a cross-layer dependency that violates
the module boundary (retro controller should not know about UI rendering state).

**Do NOT put the reset in `main.ts`'s navigate handler** — that function fires on every path
change, including moves made during solving, which would incorrectly suppress guidance the user
had already revealed.

---

## 3. Show Engine Button — Overlap with CCP-715-F2

### Finding: CCP-715-F2 fully removes the button

CCP-715-F2 was executed on 2026-04-03 and completed the following removals from
`src/analyse/retroView.ts`:

- Deleted the `showEngineBtn` variable (was lines 602–609)
- Removed `...showEngineBtn` from the feedback div
- Removed `onRevealGuidance` from the `RetroStripDeps` interface
- Removed `onRevealGuidance` from the `renderRetroStrip` destructure

And from `src/main.ts`:
- Removed the `onRevealGuidance` callback from `renderRetroStrip()` props

**Conclusion:** The "Show Engine" button is completely removed. CCP-721-F1 and CCP-721-F2
do NOT need to handle any part of this removal. Executors should skip the removal step
entirely.

---

## 4. "Try another Move" Button Interface

### Current fail-state render (retroView.ts ~lines 520–545)

```typescript
feedbackContent = [
  h('div.retro-player', [
    h('div.retro-icon.retro-icon--fail', '✗'),
    h('div.retro-instruction', [
      h('strong', strongText),
      renderGameMoveEvalDiff(cand),
      renderDualEvalBoxes(retro),
      h('em', `Try another move for ${color}`),  // ← currently just text
      renderSkipOrView(retro, navigate, redraw),
      renderSaveToLibrary(cand, retro, redraw),
    ]),
  ]),
];
```

The `h('em', ...)` text is a prompt, not a clickable affordance. The user retries by playing
a move on the board, but the board position is not automatically at `parentPath` in the
exact-best MVP (auto-return only fires in `onCeval()`, which requires `'eval'` state not
yet triggered).

### State analysis for retry

| State field | Reset on retry? | Reason |
|---|---|---|
| `_feedback` | **Yes** — reset to `'find'` | The user is re-attempting; `'fail'` must clear so `onJump()` correctly resumes offTrack detection from `'find'` |
| `_guidanceRevealed` | **No** | The user may have already revealed the engine; resetting would hide it again |
| `retroVisibleEngineEnabled` | **No** | Same reasoning — the user explicitly enabled this |
| `_solvingMoveSnapshot` | **Yes** — reset to `undefined` | The previous wrong-move snapshot no longer applies to the new attempt |

### Recommended method: `resetForRetry()` on `RetroCtrl`

Add to the `RetroCtrl` interface (`src/analyse/retroCtrl.ts`):

```typescript
/**
 * Reset feedback to 'find' for a fresh retry of the current candidate.
 * Called when the user explicitly requests to try again after a fail.
 * Does NOT reset guidanceRevealed — the user's engine reveal is preserved.
 * Does NOT advance to the next candidate.
 */
resetForRetry(): void;
```

Implementation (inside `makeRetroCtrl` return object):
```typescript
resetForRetry(): void {
  _feedback = 'find';
  _solvingMoveSnapshot = undefined;
},
```

### Button render location

Replace the passive `h('em', ...)` text in the `'fail'` block with an active link:

**Before (retroView.ts ~line 540):**
```typescript
h('em', `Try another move for ${color}`),
```

**After:**
```typescript
h('a', {
  on: { click: () => {
    retro.resetForRetry();
    navigate(cand.parentPath);
  }},
}, `Try another move`),
```

This navigates back to the puzzle-start position and resets feedback to `'find'` so the user
can attempt the puzzle again. The `navigate()` call will trigger `onJump()`, which sees
`_feedback === 'find'` and `path === c.parentPath` — no state change, clean resume.

The color-specific text (`Try another move for White`) is simplified to `Try another move`
since the color context is already in the `strongText` above and the `h('em', ...)` text
in the `'find'` block.

---

## 5. Proposed Seam Split

### CCP-721-F1 — Toggle Fix and Puzzle-Transition Reset

**Scope:** Fix the two problems that don't require new `RetroCtrl` surface area.

**Files:** `src/ceval/view.ts`, `src/analyse/retroView.ts` (2 files)

**Changes:**
1. `src/ceval/view.ts` — update the LFYM toggle click handler to call `revealGuidance()`,
   `syncArrow()`, and `evalCurrentPosition()` when turning ON (exact diff in section 1)
2. `src/analyse/retroView.ts`:
   - Add `resetRetroVisibleEngineUi` to the import from `'../ceval/view'`
   - Call `resetRetroVisibleEngineUi()` in `renderContinue`'s click handler after `retro.jumpToNext()`
   - Call `resetRetroVisibleEngineUi()` in the "Skip this move" click handler after `retro.skip()`

**Does NOT include:** "Try another move" button, `resetForRetry()`, any Show Engine button work.

### CCP-721-F2 — "Try Another Move" Button

**Scope:** Add the retry affordance to the fail state.

**Files:** `src/analyse/retroCtrl.ts`, `src/analyse/retroView.ts` (2 files)

**Changes:**
1. `src/analyse/retroCtrl.ts`:
   - Add `resetForRetry(): void` to the `RetroCtrl` interface
   - Add the implementation in `makeRetroCtrl`'s return object
2. `src/analyse/retroView.ts`:
   - Replace `h('em', \`Try another move for ${color}\`)` in the `'fail'` block with the
     `resetForRetry()` + `navigate(cand.parentPath)` click handler (exact diff in section 4)

**Does NOT include:** Toggle fix, reset-on-transition calls, Show Engine button work.

### Rationale for this split

- F1 is pure wiring — no new interface surface area, fixes the two most visible bugs
  (toggle doesn't show arrows; switching puzzles keeps previous guidance revealed)
- F2 is the UX addition (new method + button) — isolated change, can be skipped without
  breaking F1's fixes
- Show Engine button is already gone (CCP-715-F2) — neither follow-up needs to touch it
