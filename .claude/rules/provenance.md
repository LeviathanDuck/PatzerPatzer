---
paths:
  - "src/**/*.ts"
  - "server/**"
---

# Change Log, Comments, and Provenance Rules

## Public commit messages
Public commit messages must describe:
- what changed
- why it changed
- user-visible impact

Do NOT include:
- brainstorming notes
- exploratory prompt history
- irrelevant reference material
- competitor/site names unless legally or technically necessary

Good examples:
- `Improve engine lines panel hierarchy and spacing`
- `Add board theme preview tiles and filter sliders`
- `Fix variation rendering order in move list`

Bad examples:
- `Copied header idea from X`
- `Reverse engineered X`
- `Made ours look like X`

## Code comments
Code comments must explain:
- intent
- behavior
- constraints
- implementation details

Do NOT include:
- prompt history
- competitor/site references
- "copied from" notes for non-licensed third-party sites
- commentary about hiding or disguising influence

Allowed:
- source references when legally required
- source references for Lichess-derived logic/code where AGPL/license compliance applies
- neutral technical notes such as:
  - `Adapted to match existing board-area sizing model`
  - `Uses path-keyed analysis identity to avoid node-id collisions`

## External reference handling
When outside references influence design or implementation:

- Use them to understand patterns and requirements
- Reimplement in a way that fits the current Patzer Pro architecture
- Avoid copying markup, wording, CSS, or distinctive presentation directly
- Do not mention non-required external references in public commits/comments

## Provenance tracking (private/internal)
For any work materially influenced by external sources, maintain a private provenance note outside public-facing code comments and commit messages.

Use a private file such as:
- `docs/internal/PROVENANCE_NOTES.md` (only if intended to remain private)
or another non-public workflow record

For each influenced feature, record:
- date
- feature
- source reviewed
- what was learned
- whether any license obligations apply

## Lichess-specific rule
Lichess is the one approved exception for explicit source-derived implementation references, because this project assumes AGPL-compliant handling for Lichess-derived or compatible work.

For Lichess-derived logic/code:
- preserve required attribution where appropriate
- keep license obligations in mind
- it is acceptable to reference Lichess source files in internal implementation notes and, where needed, in code comments

## Default writing behavior for Claude
When generating:
- commit messages
- code comments
- changelog text
- PR summaries

Claude must:
- describe the implementation directly and neutrally
- avoid mentioning prompts, reverse engineering, or third-party references unless required
- avoid naming external sites except Lichess or where legally/technically necessary
- never add concealment language
- never suggest hiding provenance or license obligations

## If unsure
If a source reference might be legally or ethically important, keep it out of public fluff text but do not omit required attribution or compliance obligations.
