# CCP-726 — Audit: LFYM Wrong-Move Post-Fail Navigation

_Produced: 2026-04-04_

---

## 1. Exact Removal Target

### Where the auto-navigation happens

The `navigateTo(c.parentPath)` calls live in `src/analyse/retroCtrl.ts` inside the `onCeval()`
implementation. There are **two call sites**, both in the near-best evaluation branch that resolves
to a fail outcome:

**Call site A — fail with parent eval available** (line 522):
```typescript
if (c) outcomes.set(c.ply, 'fail');
_feedback = 'fail';
navigateTo(c.parentPath); // ← line 522 — REMOVE THIS LINE
notifyPersist();
```

**Call site B — fail without parent eval (fallback)** (line 530):
```typescript
if (c) outcomes.set(c.ply, 'fail');
_failKind = null;
_feedback = 'fail';
navigateTo(c.parentPath); // ← line 530 — REMOVE THIS LINE
notifyPersist();
```

### What does NOT need to change

`src/analyse/retroMoveHandler.ts` contains no `navigateTo` call. The after-move hook sets
`_feedback = 'eval'`, calls `evalCurrentPosition()`, then calls `retro.onCeval()`. All
navigation from the fail path originates inside `onCeval()`. There is nothing to remove in
`retroMoveHandler.ts`.

### Summary

| File | Function | Lines | Action |
|---|---|---|---|
| `src/analyse/retroCtrl.ts` | `onCeval()` | 522 | Remove `navigateTo(c.parentPath)` |
| `src/analyse/retroCtrl.ts` | `onCeval()` | 530 | Remove `navigateTo(c.parentPath)` |

---

## 2. onJump() Safety at the Wrong-Move Child Path

### Current flow with the navigation (before fix)

After a wrong move:
1. Board navigates to the child path (wrong move) via `navigate(childPath)`
2. `onJump(childPath)`: `_feedback = 'find'` → sets `_feedback = 'offTrack'`
3. After-move hook fires: `setFeedback('eval')`, `onCeval()` judges the move
4. `onCeval()` classifies as fail: `_feedback = 'fail'`, `navigateTo(c.parentPath)`
5. `navigate(parentPath)` → `onJump(parentPath)`: `_feedback = 'fail'`, `path === parentPath`
   → neither `onJump()` branch triggers → `_feedback` stays `'fail'` ✓

### Proposed flow without the navigation (after fix)

Steps 1–3 are identical. Step 4 changes:
4. `onCeval()` classifies as fail: `_feedback = 'fail'` — then returns (no `navigateTo`)

No new `onJump()` is called. Board stays at the child path. `_feedback = 'fail'`.

### Is the state stable at child path with feedback='fail'?

```typescript
// onJump() logic (retroCtrl.ts lines 453–459)
if (_feedback === 'offTrack' && path === c.parentPath) {
  _feedback = 'find';
} else if ((_feedback === 'find' || _feedback === 'fail') && path !== c.parentPath) {
  _feedback = 'offTrack';
}
```

After the fix, no `onJump()` fires automatically — the board simply stays at the child path.
`_feedback = 'fail'` is stable there: neither `onJump()` branch triggers unless the user
actively navigates.

### "Try another move" button path (safe)

When the user clicks "Try another move" (CCP-721-F2):
1. `resetForRetry()` → `_feedback = 'find'`
2. `navigate(cand.parentPath)` → `onJump(parentPath)`:
   - `_feedback = 'find'`, `path === c.parentPath`
   - Neither branch triggers (`find` + `path === parentPath` is not caught by either branch)
   - `_feedback` stays `'find'` ✓

### User actively navigates away (also safe)

If the user uses keyboard nav to go somewhere else while at child path:
- `onJump(otherPath)`: `_feedback = 'fail'`, `otherPath !== c.parentPath` → `_feedback = 'offTrack'`
- This is correct behavior — navigating away from the exercise position is off-track ✓

### Conclusion

Removing `navigateTo(c.parentPath)` is safe. The state machine handles `feedback = 'fail'` at the
child path without unexpected transitions. The only concern is the board being interactive (see §4).

---

## 3. Panel Rendering — Position-Independence

The `fail` feedback block in `src/analyse/retroView.ts` (lines 522–551) reads exclusively from
retro session state:

| Data | Source | Path-dependent? |
|---|---|---|
| `feedback` | `retro.feedback()` | No |
| `fk` (fail kind) | `retro.failKind()` | No |
| `cand` (candidate) | `retro.current()` | No |
| Eval diff | `retro.getSolvingMoveSnapshot()` | No |
| Player color | `cand.playerColor` | No |

None of these depend on `ctrl.path`. The fail panel renders identically whether the board is at
`parentPath` or the wrong-move child path. The eval diff boxes, fail icon, "Try another move"
link, "View the solution" / "Skip" links, and "Save to Library" button are all position-independent.

**Conclusion: no rendering changes needed.** The panel already works correctly at the child path.

---

## 4. Board Interactivity During 'fail' at the Wrong-Move Position

### Current behavior

The board is **not locked** during the `fail` state. Chessground's `movable.color` is always
set to the side to move at the current position (`node.ply % 2 === 0 ? 'white' : 'black'`).
There is no retro-aware gate in `board/index.ts` that disables moves during `fail`.

### What happens if the user makes another move from the child position?

The move hooks in `retroMoveHandler.ts` are guarded:

- **Before-move hook** (line 39): `if (info.path !== cand.parentPath) return;` → guard triggers,
  no `onWin()` called
- **After-move hook** (lines 62–64): `atRetroExercise` check requires
  `ctrl.path.length === cand.parentPath.length + 2` → fails for a grandchild path → returns early

So the retro logic ignores the move. `onJump()` fires with the grandchild path:
`_feedback = 'fail'`, `path !== c.parentPath` → `_feedback = 'offTrack'`.

The user enters the off-track state. They can recover via the "Resume learning" link.

### Is this a regression?

No. In the current behavior (before this fix), the board snaps back to `parentPath` after fail.
At `parentPath`, the board is also fully interactive — the user can make moves and retry. The
difference after this fix is where the board is held, not whether it is locked. The interactivity
gap exists in both cases.

### Is locking needed for this fix?

**No, not for this prompt's scope.** The existing behavior (unlocked board) is unchanged. The
"Try another move" button provides the explicit reset path. If the user accidentally makes another
move from the child position, they enter 'offTrack' and can recover.

**Future improvement** (not in scope): Chessground could be set to `movable.color: undefined`
(read-only) when `feedback === 'fail'` and the board is at a non-exercise path. This would
prevent accidental moves from the wrong-move position. This is a separate task.

---

## 5. Dependency Note

**CCP-721-F2 ("Try another move" button) is a hard prerequisite.**

Without the "Try another move" button, removing the `navigateTo(c.parentPath)` calls would leave
the user stranded at the wrong-move position with no way to return to the puzzle-start except
using the move list or keyboard nav (which triggers 'offTrack'). The "Skip" and "View the
solution" links do work from any position, but the expected retry path (navigate to parentPath,
reset feedback to 'find') requires the button.

CCP-721-F2 was completed on 2026-04-03. The "Try another move" button is in place. This
fix can ship safely.

---

## Implementation Summary (for CCP-726-F1)

**File:** `src/analyse/retroCtrl.ts`
**Function:** `onCeval()`

**Remove line 522:**
```typescript
navigateTo(c.parentPath); // return user to exercise start for retry
```

**Remove line 530:**
```typescript
navigateTo(c.parentPath);
```

Also remove the trailing comment on line 522 (or adjust) since the navigation is intentionally removed.

No other files need to change. The panel, the state machine, and the board hooks all handle
`feedback = 'fail'` at the child path without modification.
