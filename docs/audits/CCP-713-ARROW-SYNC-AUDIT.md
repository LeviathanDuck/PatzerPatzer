# CCP-713 — Played-Move Arrow Sync Coverage Audit

**Date:** 2026-04-03  
**Prompt:** CCP-713  
**Scope:** `src/main.ts`, `src/engine/ctrl.ts`, `src/board/index.ts`, `src/analyse/retroCtrl.ts`

---

## 1. All Position-Change Paths in `src/main.ts`

The following is every code path that changes `ctrl.path` or `ctrl.node`, with a status for
whether `syncArrow()` is called (directly or via `navigate()`/`syncBoardAndArrow()`).

### `navigate(path)` — `src/main.ts:553`
The canonical path-change function.

```
ctrl.setPath(path)
syncBoard()
syncArrow()         ← ✅ COVERED (unconditional)
evalCurrentPosition()
redraw()
```

All the following wrapper functions route through `navigate()` and are therefore covered:
- `next()` — line 608
- `prev()` — line 614
- `jumpToStart()` / `first()` — lines 619, 716
- `jumpToLast()` / `last()` — lines 623, 720
- Keyboard nav — `bindKeyboardHandlers` injects `navigate`, `next`, `prev`, `first`, `last`
- Wheel scroll — calls `next()`/`prev()` (lines 1202–1203)
- Scrub gesture — calls `next()`, `prev()`, `jumpToStart()`, `jumpToLast()` (lines 655–671)
- Opening explorer move click — `navigate(ctrl.path + child.id)` (line 1019)
- `onUserMove` / `applyMoveToTree` / `playUciMove` — all end with `_navigate(path)` (board/index.ts: line 261, 279)
- `retroCtrl.onCeval` fail branch — calls `navigateTo(c.parentPath)` which is `navigate` (retroCtrl.ts: lines 500, 508)

---

### `loadGame(pgn, opts)` — `src/main.ts:444`

| Branch | Arrow sync |
|---|---|
| Default (user-initiated) | `syncBoardAndArrow()` called at line 467 ✅ |
| `opts.source === 'queue'` | Returns early at line 452 — **NO syncBoardAndArrow** 🚩 |

The queue-source branch is **intentionally silent** — the background review queue drives game loading without updating the visible board. The user's board should not jump to the queue's position. This gap is **by design**, not a bug, and is correctly scoped to background-only operation.

---

### Startup IDB restore — `src/main.ts:1494–1499`

```typescript
ctrl = new AnalyseCtrl(pgnToTree(toLoad.pgn));
if (stored.path) ctrl.setPath(stored.path);   ← direct setPath
syncBoardAndArrow();                            ← ✅ COVERED (line 1499)
```

Arrow is synced immediately after `ctrl.setPath()`. Correct.

---

### `loadAndRestoreAnalysis()` — `src/main.ts:490`

Async function that populates `evalCache` and then calls `syncArrow()` at line 538. Does NOT
change `ctrl.path`, but updates the displayed arrow after cache population. ✅ COVERED.

---

### `toggleRetro()` — `src/main.ts:734`

| Branch | Arrow sync |
|---|---|
| Deactivating retro | `syncArrow()` called directly (line 749) ✅ |
| Activating retro | `navigate(first.parentPath)` called (line 795) ✅ |

---

### `rebuildRetroSession()` — `src/main.ts:820`

Calls `syncArrow()` at line 857, then `navigate(first.parentPath)` at line 859. ✅ COVERED.

---

### `clearRetroMode()` — `src/main.ts:799`

Calls `syncArrow()` at line 808. ✅ COVERED.

---

### `revealGuidance` handler — `src/main.ts:979`

```typescript
onRevealGuidance: () => { ctrl.retro?.revealGuidance(); syncArrow(); redraw(); }
```
✅ COVERED.

---

### `clearVariations()` — `src/main.ts:682`

```typescript
function clearVariations(): void {
  pruneVariations(ctrl.root);
  let repairPath = ctrl.path;
  while (repairPath !== '' && !nodeAtPath(ctrl.root, repairPath)) {
    repairPath = pathInit(repairPath);
  }
  if (repairPath !== ctrl.path) {
    navigate(repairPath);          // ← path changed → ✅ via navigate
  } else {
    ctrl.setPath(ctrl.path);       // ← direct setPath, no navigate
    syncBoard();
    scheduleNavStateSave(ctrl.path);
    redraw();                      // ← ⚠️  NO syncArrow
  }
}
```

The `else` branch is reached when the active path is still valid after pruning. `pruneVariations`
always keeps `children[0]` intact, so in the most common case the arrow target (`ctrl.node.children[0]`)
is unchanged. **However:** if a variation was previously promoted to `children[0]` and that "promoted
mainline" is the one being kept, `children[0]` after pruning is still the promoted node — no change.
The risk here is low but `syncArrow()` is still absent. ⚠️ LOW RISK / INCOMPLETE.

---

### `deleteVariation(path)` — `src/main.ts:704`  🚩 FLAG

```typescript
function deleteVariation(path: string): void {
  deleteNodeAt(ctrl.root, path);
  if (ctrl.path.startsWith(path)) {
    navigate(pathInit(path));      // ← path repair → ✅ via navigate
  } else {
    scheduleNavStateSave(ctrl.path);
    redraw();                      // ← 🚩 NO syncArrow — tree mutated, no arrow update
  }
}
```

**The `else` branch is a bug suspect.** When the user deletes a variation but their current position
is NOT inside the deleted branch, `syncArrow()` is never called. If the deleted node was
`ctrl.node.children[0]` (the first child of the current position), the played-move arrow now points to
a deleted node. The hash guard in `applyAutoShapes` will prevent Chessground from being updated
because `syncArrow()` is never invoked to pass the new (corrected) shapes. The stale arrow from the
deleted first child can persist until the next navigation event.

---

### Context Menu: Promote variation / Make main line — `src/main.ts:247–261`  🚩 FLAG

```typescript
// "Promote variation"
on: { click: () => {
  promoteAt(ctrl.root, path, false);
  redraw();          // ← 🚩 NO syncArrow — children[0] may have changed
} },

// "Make main line"
on: { click: () => {
  promoteAt(ctrl.root, path, true);
  redraw();          // ← 🚩 NO syncArrow — children[0] may have changed
} },
```

**This is the primary suspect for the stuck-arrow bug.**

`promoteAt()` reorders `parent.children` so that the promoted node becomes `children[0]`. If the
user's current position is the PARENT of the promoted node (i.e., `contextMenuPath === ctrl.path + someChildId`),
then `ctrl.node.children[0]` has changed — a different move is now the "mainline continuation." The
played-move arrow (`buildArrowShapes` reads `ctrl.node.children[0]`) should update to show the new
first child, but `syncArrow()` is never called after the promote. `redraw()` alone does not call
`applyAutoShapes`. The stale arrow persists until the next user navigation.

---

## 2. `applyAutoShapes()` Hash Guard Analysis

**Location:** `src/engine/ctrl.ts:539–563`

```typescript
function applyAutoShapes(shapes: DrawShape[]): void {
  const cg = _getCgInstance();
  if (!cg) return;
  if (cg !== lastAutoShapesCg) {
    lastAutoShapesCg = cg;
    lastAutoShapesHash = null;       // ← reset hash when CG instance changes
  }
  const nextHash = autoShapesHash(shapes);
  if (nextHash === lastAutoShapesHash) return;   // ← skip if no change
  lastAutoShapesHash = nextHash;
  cg.setAutoShapes(shapes);
}
```

**Hash computation covers:** `orig`, `dest`, `brush`, `piece`, `modifiers.lineWidth/hilite`, 
`customSvg.center/html`, `label.text/fill`, `below` — per-shape joined with `~`, shapes joined with `;`.

**Hash collision risk:** Low. Two different positions would need to produce the same complete set of
shapes (same arrows, same brushes, same eval labels) to trigger a spurious skip. Possible in theory
(e.g. both positions have the same best move with the same eval, no secondary lines, no glyph) but
unlikely in practice to cause the intermittent stuck-arrow symptoms.

**Assessment:** The hash guard is not a primary cause of the bug. It is a no-op optimization. The
fundamental issue is that `syncArrow()` itself is not being called after certain tree mutations —
the hash guard only fires AFTER `syncArrow()` is already in the call chain.

---

## 3. `pathIsMainline()` Edge Cases

**Location:** `src/tree/ops.ts:65`

```typescript
export function pathIsMainline(root: TreeNode, path: TreePath): boolean {
  if (path === '') return true;
  const firstChild = root.children[0];
  return (
    firstChild?.id === pathHead(path) &&
    pathIsMainline(firstChild, pathTail(path))
  );
}
```

**Edge cases inspected:**

| Case | Result |
|---|---|
| `path === ''` | Returns `true` ✅ correct — root is always mainline |
| All first children | Returns `true` ✅ correct |
| Any non-first child in the path | Returns `false` ✅ correct |
| After `promoteAt(root, path, true)` — promoted node is now `children[0]` all the way up | Returns `true` ✅ correct — `children[0]` is the promoted node |
| After `deleteNodeAt` deletes `children[0]` — former `children[1]` is now `children[0]` | Returns `true` for former `children[1]`'s path, `false` for deleted path ✅ correct — the function reads the live tree |

**Assessment:** `pathIsMainline()` is correct. It computes the answer by reading `children[0]` at
each step. It cannot return a stale or incorrect value by itself. The issue is not here.

However, there is an **indirect interaction** with the `deleteVariation` and `promoteAt` bugs: after
a tree mutation, `pathIsMainline()` would return the correct NEW value — but since `syncArrow()` is
not called after the mutation, `buildArrowShapes()` is never re-evaluated with the updated tree. The
arrows remain as they were before the mutation until the next `syncArrow()` call.

---

## 4. `lastAutoShapesCg` Guard Analysis

**Location:** `src/engine/ctrl.ts:542–545`

```typescript
if (cg !== lastAutoShapesCg) {
  lastAutoShapesCg = cg;
  lastAutoShapesHash = null;   // ← forces setAutoShapes on next call
}
```

**When does `cgInstance` change?**

The board VNode uses `key: 'board'` in `renderBoard()`. When the user navigates away from the
`/analysis` route (to `/games`, `/puzzles`, etc.), Snabbdom removes the `.cg-wrap` element from
the DOM tree, firing the `destroy` hook which sets `cgInstance = undefined`. When returning to
`/analysis`, Snabbdom re-inserts the element and fires the `insert` hook, which calls
`makeChessground(...)` and assigns a new `cgInstance`.

**Does the guard correctly handle this?**

Yes. When `cgInstance` is replaced:
1. Next `syncArrow()` call → `applyAutoShapes()` → `cg !== lastAutoShapesCg` → `lastAutoShapesHash = null`
2. `nextHash !== null` → `cg.setAutoShapes(shapes)` fires unconditionally

**However, the `insert` hook does not call `syncArrow()`.** After board remount, the new Chessground
instance has no auto shapes at all — they were lost with the old instance. The guard correctly resets
the hash, but it has no effect until something calls `syncArrow()`. On the first navigation or engine
event after remount, `syncArrow()` fires and the guard correctly re-applies the shapes.

**Assessment:** The guard itself is correct. Board remount causes **missing arrows** (not stuck arrows)
for a brief window until the next `syncArrow()` call. This is a minor cosmetic gap but not the primary
cause of the stuck-arrow symptom.

---

## 5. Ranked Root Cause Suspects

### 🔴 Suspect 1 (HIGHEST PROBABILITY): Promote variation context menu  
**File:** `src/main.ts:247–261`  
**Mechanism:** `promoteAt(ctrl.root, path, false|true)` reorders `children` at an ancestor node,
changing which move is `children[0]`. If the user is currently at the parent position, the played-move
arrow target has changed. `redraw()` is called but `syncArrow()` is not. Chessground retains the old
arrow pointing to the demoted first child. Subsequent navigation will clear it, which explains the
intermittent nature of the bug.

**Fix:** Add `syncArrow()` immediately after each `promoteAt()` call in both context menu handlers
(lines 252 and 259–260 respectively).

---

### 🔴 Suspect 2 (HIGH PROBABILITY): Delete variation else branch  
**File:** `src/main.ts:709–713`  
**Mechanism:** `deleteNodeAt(ctrl.root, path)` removes a node from the tree. If the deleted node was
`ctrl.node.children[0]` (the first child of the user's current position), `children[0]` is now the
former second child — or `undefined` if no other children exist. The played-move arrow should update
or disappear, but `syncArrow()` is not called. The stale arrow persists.

**Fix:** Add `syncArrow()` in the `else` branch of `deleteVariation()` (after `deleteNodeAt`, when
`ctrl.path` is not inside the deleted subtree).

---

### 🟡 Suspect 3 (LOW PROBABILITY): `clearVariations()` valid-path branch  
**File:** `src/main.ts:691–696`  
**Mechanism:** `pruneVariations` keeps `children[0]` intact at every node, so in the typical case the
arrow target is unchanged. Edge case: if the current node had a promoted variation as `children[0]`,
that promoted node is still kept. Arrow target unchanged. `syncArrow()` is absent but not needed in
normal flows.

**Fix:** Add `syncArrow()` after `ctrl.setPath()` in the else branch for correctness and robustness
against future tree mutation changes.

---

### 🟢 Suspect 4 (VERY LOW): Hash collision in `autoShapesHash()`  
**File:** `src/engine/ctrl.ts:552–563`  
**Mechanism:** If two distinct board positions produce identical shape arrays (same best-move UCI,
same brush, same eval label text, no secondary PV lines, no glyph), the hash guard skips the update.
This is structurally possible but statistically unlikely to produce the observed intermittent symptom.
No fix needed unless a concrete reproduction case is found.

---

### 🟢 Suspect 5 (VERY LOW): Board remount after route change  
**File:** `src/board/index.ts:569–619` (renderBoard insert hook)  
**Mechanism:** `cgInstance` is new after remount. The guard resets `lastAutoShapesHash = null`, so the
next `syncArrow()` correctly re-applies shapes. Gap: the `insert` hook does not call `syncArrow()`,
so arrows are missing for the brief window between board mount and the next engine/navigation event.
This causes **missing arrows** (not stuck arrows) — a different symptom.

---

## 6. Summary Table

| Path | Changes position | Calls syncArrow | Status |
|---|---|---|---|
| `navigate()` | ✅ | ✅ | Covered |
| `next()` / `prev()` / `first()` / `last()` | via navigate | via navigate | Covered |
| Keyboard nav | via navigate | via navigate | Covered |
| Wheel / scrub | via navigate | via navigate | Covered |
| `onUserMove` / `applyMoveToTree` | via navigate | via navigate | Covered |
| `loadGame()` (user) | ✅ | `syncBoardAndArrow()` | Covered |
| `loadGame()` (queue) | ✅ (background only) | ❌ intentional | By design |
| `loadGamesFromIdb` startup | `ctrl.setPath()` | `syncBoardAndArrow()` | Covered |
| `loadAndRestoreAnalysis()` | evalCache only | `syncArrow()` line 538 | Covered |
| `toggleRetro()` deactivate | ❌ | `syncArrow()` | Covered |
| `toggleRetro()` activate | via navigate | via navigate | Covered |
| `rebuildRetroSession()` | via navigate | `syncArrow()` + navigate | Covered |
| `clearRetroMode()` | ❌ | `syncArrow()` | Covered |
| `revealGuidance` handler | ❌ | `syncArrow()` | Covered |
| `retroCtrl.onCeval` fail | via navigate | via navigate | Covered |
| `clearVariations()` path-repair | via navigate | via navigate | Covered |
| **`clearVariations()` valid-path** | `ctrl.setPath()` | **❌ absent** | ⚠️ Low-risk gap |
| **`deleteVariation()` else branch** | tree mutation | **❌ absent** | 🚩 Bug suspect |
| **Promote variation (context menu)** | tree mutation | **❌ absent** | 🚩 Primary suspect |
| **Make main line (context menu)** | tree mutation | **❌ absent** | 🚩 Primary suspect |
| Board remount (insert hook) | ❌ | ❌ (handled by guard) | Low-risk gap |

---

## 7. Recommended Fixes

### Fix A — Promote variation context menu (src/main.ts ~247–261)

```typescript
// "Promote variation"
on: { click: () => {
  const path = contextMenuPath!;
  contextMenuPath = null; contextMenuPos = null;
  promoteAt(ctrl.root, path, false);
  syncArrow();   // ← ADD: children[0] may have changed at parent node
  redraw();
} },

// "Make main line"
on: { click: () => {
  const path = contextMenuPath!;
  contextMenuPath = null; contextMenuPos = null;
  promoteAt(ctrl.root, path, true);
  syncArrow();   // ← ADD: children[0] may have changed at all ancestor nodes
  redraw();
} },
```

### Fix B — Delete variation else branch (src/main.ts ~709–713)

```typescript
function deleteVariation(path: string): void {
  deleteNodeAt(ctrl.root, path);
  if (ctrl.path.startsWith(path)) {
    navigate(pathInit(path));
  } else {
    syncArrow();               // ← ADD: children[0] at current position may have changed
    scheduleNavStateSave(ctrl.path);
    redraw();
  }
}
```

### Fix C — clearVariations() valid-path branch (src/main.ts ~691–696) — optional/robustness

```typescript
} else {
  ctrl.setPath(ctrl.path);
  syncBoard();
  syncArrow();                 // ← ADD: robustness — no-ops if arrow unchanged due to hash guard
  scheduleNavStateSave(ctrl.path);
  redraw();
}
```

Fix C is low priority because `pruneVariations` preserves `children[0]`, so the arrow target is
unchanged in all current code paths. The hash guard in `applyAutoShapes` would no-op the redundant
`setAutoShapes` call anyway. However, adding it makes the pattern consistent and guards against
future changes to pruning logic.

---

## Validation Checklist

- [x] Audit report written to `docs/audits/CCP-713-ARROW-SYNC-AUDIT.md`
- [x] All position-change paths in `src/main.ts` are accounted for
- [x] At least one concrete suspect code location identified with file and line number:
  - `src/main.ts:247–261` — promote context menu handlers (PRIMARY SUSPECT)
  - `src/main.ts:709–713` — deleteVariation else branch (SECONDARY SUSPECT)
