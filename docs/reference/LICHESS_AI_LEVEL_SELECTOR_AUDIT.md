# Lichess AI Level Selector — Audit

**Audited for:** CCP-588 (Phase 5.1 of Engine Strength Levels Sprint)
**Lichess source path:** `ui/lobby/src/view/setup/components/levelButtons.ts`
**Related sprint:** `docs/mini-sprints/ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md`

---

## What is being audited

The "Play with the computer" setup modal on Lichess includes a strength level picker
that lets users choose 1–8 before starting a game. This document captures the source-
confirmed UI pattern and the recommended approach for Patzer Pro's `renderStrengthSelector`.

---

## Source-Confirmed Findings

### Primary source file
`ui/lobby/src/view/setup/components/levelButtons.ts`

The entire component is a **`<group.radio>`** element — a custom element that renders
8 sibling pairs of `<input type="radio">` / `<label>`:

```typescript
const levels = [1, 2, 3, 4, 5, 6, 7, 8];

h('group.radio',
  levels.map(level =>
    h('div', [
      h(`input#sf_level_${level}`, {
        attrs: { name: 'level', type: 'radio', value: level, checked: level === aiLevel() },
        on: { change: (e) => aiLevel(parseInt(e.target.value)) },
      }),
      h('label', { attrs: { for: `sf_level_${level}` } }, level),
    ]),
  ),
)
```

### What the labels show
Labels contain **just the level number** (1, 2, … 8). There are no descriptions,
Elo ranges, or tooltip text per level in `levelButtons.ts` or `modal.ts`.
The group has a section label `i18n.site.strength` ("Strength") rendered above via
`.radio-pane > .label`.

### Active / selected state — CSS only
Source: `ui/lib/css/form/_radio.scss`

```scss
group.radio {
  @extend %box-neat, %flex-wrap;
  overflow: hidden;

  div { flex: 1 1 auto; position: relative; }

  input { @extend %visually-hidden; }

  label {
    @extend %metal, %flex-center-center;
    padding: 10px;
    height: 100%;
    cursor: pointer;
    border-inline-end: $border;
  }

  input:checked + label { @extend %active; }       // selected state
  input:focus-visible + label { outline: $outline; outline-offset: -2px; }
}
```

Key points:
- Radio `input` elements are **visually hidden** but present in the DOM (accessible to keyboard and screen readers)
- Selected state is pure CSS via `input:checked + label` — no JavaScript state class
- Each level segment is `flex: 1 1 auto` (equal width, fills container)
- Focus ring applied on `focus-visible` for keyboard navigation
- Border between segments via `border-inline-end`

### Accessibility — blind mode fallback
When `site.blindMode` is true, the component renders a plain `<select#sf_level>` dropdown
instead of the radio group. This is an explicit branch in `levelButtons.ts`.

### Persistence
Source: `ui/lobby/src/setupCtrl.ts`

`aiLevel` is stored in `SetupStore` via `storedJsonProp` — a localStorage prop keyed
by `lobby.setup.<username>.<gameType>`. Selection persists across sessions.

Default level: **1** (set in `makeSetupStore`).

### Level displayed in game context
Source: `modules/game/src/main/Namer.scala`

When showing the opponent name during a game, the level is formatted as:
`"Stockfish level N"` — just the number, no description label.

---

## Inferred (Not Directly Source-Confirmed)

- There are no hover tooltips or per-level descriptions shown in the Lichess setup modal.
  The numbers alone are the UI. Any Elo/skill context is implicit to experienced users.
- The `%active`, `%metal`, `%visually-hidden` Sass placeholders are part of Lichess's
  shared design system — not public. Their visual output is approximately: a blue/green
  highlight background for selected, a muted metal gradient for unselected.
- Mobile behavior: `flex-wrap` on the group allows natural wrapping. No explicit
  breakpoints observed in `_radio.scss` or `_setup.scss`.

---

## Recommended Patzer Pro Approach

For `src/engine/strengthView.ts` (CCP-589):

### Match the radio-button-group pattern
Use visually hidden radio inputs + styled labels. This gives keyboard navigation,
screen reader support, and focus ring behavior for free — no custom JS needed for
active state.

```typescript
// Snabbdom equivalent of levelButtons.ts pattern
h('div.strength-selector', [
  h('div.strength-selector__label', 'Strength'),
  h('div.strength-selector__group',
    STRENGTH_LEVELS.map(lvl =>
      h('div.strength-selector__item', [
        h(`input#strength_level_${lvl.level}`, {
          attrs: {
            type:    'radio',
            name:    'strength',
            value:   lvl.level,
            checked: lvl.level === currentLevel,
          },
          on: { change: () => onChange(lvl.level) },
        }),
        h('label', { attrs: { for: `strength_level_${lvl.level}` } },
          lvl.label,  // "Beginner", "Casual", etc. from STRENGTH_LEVELS
        ),
      ])
    )
  ),
])
```

### Diverge from Lichess: show level labels, not numbers
Lichess shows `1`–`8`. Patzer Pro's `STRENGTH_LEVELS` array already defines human-
readable labels (Beginner, Casual, Club Novice, etc.) — use those in the labels.
Numbers alone are opaque to users who don't know the scale.

### CSS pattern to implement (CCP-591)
```scss
.strength-selector {
  &__label { font-weight: 600; margin-bottom: 6px; }

  &__group {
    display: flex;
    flex-wrap: wrap;
    overflow: hidden;
    border-radius: 4px;
    border: 1px solid #444;
  }

  &__item {
    flex: 1 1 auto;
    position: relative;

    input { @extend %visually-hidden; }  // or: position:absolute; opacity:0; ...

    label {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 6px;
      cursor: pointer;
      border-right: 1px solid #444;
      background: #2a2a2a;
      font-size: 0.82rem;
      white-space: nowrap;
    }

    input:checked + label { background: #4a90d9; color: #fff; }
    input:focus-visible + label { outline: 2px solid #4a90d9; outline-offset: -2px; }
    label:hover:not(input:checked + label) { background: #333; }
  }

  &__item:last-child label { border-right: 0; }
}
```

### Persistence
Persist the selected level in localStorage:
`patzer.playStrengthLevel` → already planned in CCP-574 (`src/engine/ctrl.ts`).
The strength selector reads the persisted value on mount.

---

## Files Reviewed

| File | Role |
|---|---|
| `ui/lobby/src/view/setup/components/levelButtons.ts` | The selector component — source of truth |
| `ui/lobby/src/view/setup/modal.ts` | Placement in the setup modal |
| `ui/lobby/src/setupCtrl.ts` | `aiLevel` state, default (1), and localStorage persistence |
| `ui/lobby/src/interfaces.ts` | `SetupStore.aiLevel: number` type |
| `ui/lib/css/form/_radio.scss` | `group.radio` CSS pattern |
| `ui/lobby/css/_setup.scss` | Setup modal container CSS |
| `modules/game/src/main/Namer.scala` | "Stockfish level N" display in game context |
