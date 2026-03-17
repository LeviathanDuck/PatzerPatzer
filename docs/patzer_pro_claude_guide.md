# Patzer Pro --- Claude Development Guide (Enhanced)

## Project Overview

Patzer Pro is a chess web app that faithfully adapts Lichess behavior.

Core goals: - Import batches of user games - Analyze them in bulk -
Study via analysis board - Extract puzzles

------------------------------------------------------------------------

## Core Philosophy

Replicate Lichess as closely as possible. Do not redesign.

------------------------------------------------------------------------

## Core Implementation Rule

Claude must treat Lichess source as primary truth.

------------------------------------------------------------------------

## Task Scope Rule (CRITICAL)

-   One task at a time
-   Max 1--3 files
-   No unrelated refactors

------------------------------------------------------------------------

## Pre-Implementation Checklist (MANDATORY)

-   Inspect Lichess source
-   Identify relevant files
-   Extract minimal logic

------------------------------------------------------------------------

## Anti-Drift Rule

-   Do NOT redesign Lichess features
-   Do NOT simplify core systems
-   Do NOT invent new architectures

------------------------------------------------------------------------

## Terminology Clarification Rule

If user uses unclear terms: - Ask clarification before implementing -
Map to Lichess terminology when possible

------------------------------------------------------------------------

## Prompt Compliance Rule

-   Follow prompt exactly
-   Do not add extra features

------------------------------------------------------------------------

## Stop Condition

Stop if: - task exceeds 3 files - unclear requirements - no Lichess
reference

------------------------------------------------------------------------

## Development Workflow

1.  Claude writes code
2.  Developer tests
3.  Developer commits

------------------------------------------------------------------------

## Definition of Done

-   Feature works
-   Matches Lichess behavior
-   Passes acceptance criteria

------------------------------------------------------------------------

## Bug Fix Protocol

-   Identify expected vs actual
-   Fix root issue only

------------------------------------------------------------------------

## Naming & Structure Rule

-   Match Lichess naming where possible
-   Avoid renaming concepts

------------------------------------------------------------------------

## File Discipline Rule

-   Only modify listed files
-   Do not create extras unless instructed

------------------------------------------------------------------------

## Goal

Patzer Pro should feel like a personal Lichess-style analysis tool.
