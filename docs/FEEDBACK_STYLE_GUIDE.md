# Feedback Style Guide

This document defines how move feedback, severity, and visual styling are used across
Patzer Pro. It is the canonical reference for anyone implementing new features that
display move quality information to the user.

## Lookbook

The visual reference for all Patzer Pro styling is a single tabbed page:

- File: `docs/patzer-lookbook.html`
- Regenerate: `npm run lookbook:generate`
- Source: `scripts/generate-patzer-lookbook.mjs` (orchestrator that runs both sub-generators)

Two tabs:

### Feedback tab

Move quality feedback: severity tiers, eval box grades, reason notes, LFYM panel states,
mistake count gradient, board glyphs, detail lines.

- Sub-generator: `scripts/generate-feedback-lookbook.mjs`
- Data: `src/feedback/severity.ts`

### General UI tab

App-wide UI elements: green palette, engine arrows, eval bar, W/D/L bars, buttons,
toggles, inputs, navigation, tabs, move list, badges, loading states.

- Sub-generator: `scripts/generate-ui-lookbook.mjs`
- Data: reads live from `src/styles/main.scss`, `src/analyse/moveList.ts`,
  `src/board/index.ts`, `src/engine/ctrl.ts`

The lookbook is a static snapshot. It must be regenerated after changes to source files.
It is authoritative **when current**. If the lookbook has not been regenerated after a
source change, the source files are the source of truth.

## Data Module

All feedback data — severity tiers, colors, glyphs, eval box grades, mistake count
tiers, reason×severity text matrices, and tone variants — lives in:

- `src/feedback/severity.ts`

This is a pure data + lookup module. No UI code, no side effects, no persistence.
All consumers import from here.

## Where Feedback Styling Is Currently Used

### LFYM Retro Panel (`src/analyse/retroView.ts`)

| Element | What it uses | Source function |
|---|---|---|
| "Chosen because:" label | Severity-modulated label, colored by tier | `getSeverityFeedback()` |
| "Chosen because:" summary | Severity-modulated summary text | `getSeverityFeedback()` |
| vs Engine Best eval box | 10-grade color from solving move loss | `classifyEvalBoxGrade()` |
| vs Move Played eval box | 10-grade color from game move comparison | `classifyEvalBoxGrade()` |
| Progress counter tint | Colored by mistake count tier | `classifyMistakeCount()` |
| Session intro message | Escalates by mistake count on first puzzle | `classifyMistakeCount()` |
| Session end message | Varies by mistake count tier | `classifyMistakeCount()` |

### Game Review Board Glyphs (`src/analyse/boardGlyphs.ts`)

| Element | What it uses |
|---|---|
| `?!` badge | Inaccuracy — `#56b4e9` |
| `?` badge | Mistake — `#e69f00` |
| `??` badge | Blunder — `#df5353` |
| `!` badge | Good move — `#22ac38` |
| `!!` badge | Brilliant — `#168226` |
| `!?` badge | Interesting — `#ea45d8` |
| KO overlay | Checkmate — purple gradient `#a855f7` family |

### Move List Glyph Colors (`src/analyse/moveList.ts`)

| Element | Color |
|---|---|
| `??` blunder | `hsl(0,69%,60%)` |
| `?` mistake | `hsl(41,100%,45%)` |
| `?!` inaccuracy | `hsl(202,78%,62%)` |
| `!!` brilliant | `hsl(129,71%,45%)` |
| `!` good | `hsl(88,62%,37%)` |
| `!?` interesting | `hsl(307,80%,70%)` |
| `M?!` missed mate | `#a855f7` |

### Eval Graph (`src/analyse/evalView.ts`)

| Element | Color |
|---|---|
| Mate opportunity dots | `hsl(307,80%,70%)` |
| Blunder dots | `hsl(0,69%,60%)` |
| Mistake dots | `hsl(41,100%,45%)` |
| Inaccuracy dots | `hsl(202,78%,62%)` |

### Game List Badges (`src/games/view.ts`)

| Element | Color |
|---|---|
| Missed mate badge (`M?!`) | `#a855f7` |
| Severity badges (`!`, `!!`, `!!!`) | Default text color |

### Stats Weakness Detection (`src/stats/weakness.ts`)

References blunder/mistake/inaccuracy counts. Does not currently use severity module
colors but could adopt them.

## Rules for New Features

When implementing new functionality that displays move quality feedback to the user:

1. **Import from the severity module** — do not hardcode colors, labels, or thresholds.
   Use `getSeverityFeedback()`, `classifyEvalBoxGrade()`, `classifyMistakeCount()`,
   `getTierMeta()`, or the exported constants.

2. **Follow the color palette** — the 9-tier severity gradient and 10-grade eval box
   gradient are the canonical color scales. Do not invent new colors for move quality.
   The exception is the KO purple (`#a855f7`) which is a special overlay, not a tier.

3. **Update the lookbook** — after wiring feedback styling into a new surface:
   - Add a representative example to the lookbook generator
     (`scripts/generate-feedback-lookbook.mjs`) showing how the styling appears
   - If it's an entirely new feedback surface (not just another consumer of existing
     styles), add a new lookbook section for it
   - Regenerate: `npm run lookbook:generate`

4. **Update this guide** — add the new surface to the "Where Feedback Styling Is
   Currently Used" section above, listing which severity module functions it uses.

5. **Use the tone system** — if the feature shows user-facing text from the severity
   module, pass the active `FeedbackTone` ('standard' or 'harsh'). Currently hardcoded
   to 'standard' everywhere — a future tone toggle will propagate through all consumers.

## Tone System

Two tones exist: `'standard'` and `'harsh'`. All text matrices in the severity module
have both variants. Currently all consumers use `'standard'`. A tone toggle UI has not
been built yet. When it is, it should be a single user preference that propagates to
all consumers via the severity module's API.

## Lookbook Maintenance

The lookbook is generated, not hand-edited. To change lookbook content:

- **Feedback text changes**: edit `src/feedback/severity.ts`, then `npm run lookbook:generate`
- **Lookbook layout/section changes**: edit `scripts/generate-feedback-lookbook.mjs`, then
  `npm run lookbook:generate`
- **Live editing**: the lookbook supports `contenteditable` fields. After editing in the
  browser, click "Save Edits" to download `feedback-edits.json`. Tell Claude:
  "Apply my feedback edits from docs/feedback-edits.json" to persist changes to the
  severity module and regenerate.
