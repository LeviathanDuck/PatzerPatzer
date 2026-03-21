# Filters, Themes, and Selection

This document captures how Lichess exposes puzzle selection and filtering at the product level.

## Confirmed route surfaces

From [sources/conf/routes](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/conf/routes):
- `/training`
- `/training/themes`
- `/training/openings`
- `/training/of-player`
- `/training/dashboard/:days`
- `/training/replay/:days/:theme`
- `/training/history`
- `/training/:angleOrId`
- `/training/:angle/:color`
- `/training/difficulty/:theme`
- `/streak`
- `/storm`
- `/storm/dashboard`
- `/racer`

This means Lichess puzzle selection is not just "fetch next puzzle by rating."
It is shaped by:
- theme angle
- opening angle
- optional preferred color
- difficulty
- replay state
- history/dashboard context
- special product modes

## Theme/opening angle model

Standard training uses a `PuzzleAngle` server concept.
Visible entry points:
- themes page
- openings page
- player-game lookup page
- direct `/training/:angleOrId`

`PuzzleUi.scala` shows:
- themes are categorized and rendered as a page of links
- openings are a separate page with ordering and tree structure
- "player games" is treated as a special origin-like entry point

## Difficulty

Classic puzzle difficulty is user-configurable in the side panel:
- easiest
- easier
- normal
- harder
- hardest

The client submits to:
- `/training/difficulty/:theme`

This is not a local-only UI tweak; it is wired into server-side puzzle selection.

## Color preference

Classic training also supports:
- white
- black
- random

This is a route-level selector:
- `/training/:angle/:color`

## Replay

Replay is a distinct product behavior:
- `PuzzleReplay` exists on both client and server
- replay mode links back to dashboard history windows
- the side panel shows replay progress

Replay is not generic session persistence.
It is a themed replay workflow tied to prior performance.

## Session/history strip

`session.ts` stores recent rounds and the current theme.
The UI then renders a row of session dots/links.

That means Lichess tracks at least two different continuity layers:
- short local session memory for the current training run
- broader dashboard/history/replay server-backed flows

## Storm/Racer filters

The shared `PuzFilters` in [sources/ui/lib/src/puz/filters.ts](/Users/leftcoast/Development/PatzerPatzer/docs/reference/lichess-puzzle-ux/sources/ui/lib/src/puz/filters.ts) includes:
- fail
- slow
- optional skip

This is runtime filtering/inspection for timed modes, not the same as classic training theme/difficulty selection.

## Important caution for Patzer

Do not flatten all of this into one local "puzzle filters" feature.

Lichess uses several layers:
- preselection of what puzzle to serve
- route-based theme/opening/color choice
- session continuity
- replay workflows
- timed-mode run filters

Those are different concerns.
