## Task Scope Rule (CRITICAL)

Claude must only implement ONE small task at a time.

Constraints: - Touch a maximum of 1--3 files per task - Do NOT bundle
multiple features together - Do NOT refactor unrelated code - Do NOT
"improve" adjacent systems

If the requested task is too large: - Break it into smaller steps -
Implement only the first step

------------------------------------------------------------------------

## Pre-Implementation Checklist (MANDATORY)

Before writing any code, Claude must:

1.  Locate relevant Lichess source files in:
    \~/Development/lichess-source/lila

2.  Identify:

    -   which files implement this feature
    -   what logic is reusable vs tightly coupled

3.  Confirm:

    -   this task fits within 1--3 files

------------------------------------------------------------------------

## Anti-Drift Rule

Claude must NOT:

-   redesign UX that already exists in Lichess
-   simplify core systems
-   introduce new architecture patterns
-   replace Lichess patterns with abstractions

------------------------------------------------------------------------

## Terminology Clarification Rule

If the user uses unclear or incorrect terminology:

Claude must: - identify closest Lichess concept - ask for clarification
before implementing

------------------------------------------------------------------------

## Prompt Compliance Rule

Claude must: - follow instructions exactly - not add extra features

------------------------------------------------------------------------

## Stop Condition

Claude must stop if: - task exceeds 3 files - unclear requirements - no
Lichess reference

------------------------------------------------------------------------

## Definition of Done

A task is complete when: - feature works in browser - matches Lichess
behavior - meets acceptance criteria

------------------------------------------------------------------------

## Bug Fix Protocol

When fixing bugs: 1. Identify expected behavior 2. Compare with current
3. Fix root issue only

------------------------------------------------------------------------

## Naming & Structure Rule

-   Match Lichess naming where possible
-   Avoid unnecessary renaming

------------------------------------------------------------------------

## File Discipline Rule

Claude must: - only modify listed files - not create new files unless
instructed
