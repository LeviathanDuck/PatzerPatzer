# Patzer Pro — Big Picture Features down the line

> **Status update (2026-03-30):** Items marked with **(DONE)** or **(PARTIAL)** have been implemented.
> See `docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md` for details.

- **(DONE)** The website should be loaded on mobile and use styling similar to lichess — mobile analysis and puzzle usability sprints completed

- **(DONE)** Users should be able to import games and have the analysis saved locally — game import (Lichess, Chess.com, PGN), analysis persistence, and background bulk review all working

- **(PARTIAL)** The admin of the site should have a special log in area, where the user data can be saved to and “sync’d” — Lichess OAuth login works, server DB (SQLite) exists, push works, pull partially fixed (CCP-466). End-to-end sync not yet validated.

- **(DONE)** Special admin login ability — Lichess OAuth implemented in `server/auth.mjs`

- In the future, user identity should own more than imported games:
  - saved review data
  - saved puzzle library items
  - puzzle attempt history
  - repetition state
  - notes, tags, and folder memberships
  - import ownership labels such as:
    - `this is me`
    - `this is opponent`
  - support for multiple user-owned chess identities across different accounts and sites so imported games can still be grouped as the user's own history instead of being fragmented by username

- The long-term product flow should connect analysis and puzzle work directly:
  - review a game on the analysis board
  - enter Learn From Your Mistakes
  - save moments into the user puzzle library
  - move into a dedicated puzzle-training surface
  - return later and continue puzzle work with the same saved progress

- **(PLANNED)** Study Library + Repetition Practice — a universal save target and content-agnostic drill engine:
  - Study Library: user-managed collection of saved games, positions, and annotated move sequences
  - one-click save from any tool surface (right-click move → "Save to Library")
  - library browser at `#/library` with sort, filter, folders, tags, favorites
  - study detail view with board, move list, notes, and metadata editing
  - Repetition Practice: spaced-repetition drill engine for any saved material
  - position-aware scheduling (FEN-keyed, transposition-safe, confidence 0–6)
  - becomes the connective tissue between all existing tools
  - ORP should build on top of the Study Library drill engine rather than creating a parallel system
  - full planning document: `docs/STUDY_LIBRARY_PLAN.md`

- Patzer should eventually support broader user-owned puzzle import beyond review-derived moments and the bundled Lichess source, but only after the canonical puzzle model and library ownership are stable

- Patzer should eventually add `Opening Repetition Practice` (`ORP`) as a dedicated spaced-repetition training surface for openings:
  - this is the canonical repo name for the feature
  - it should help users rehearse and retain opening lines over time
  - ORP should be built on top of the Study Library drill engine (see `docs/STUDY_LIBRARY_PLAN.md`) — the scheduler, grader, and drill controller are shared infrastructure; ORP adds opening-specific entry points and opponent-aware line selection
  - acceptable generic descriptions are:
    - opening practice
    - repertoire practice
    - line repetition
    - opening drill flow
  - this is distinct from the openings opponent-research tool and distinct from `Practice Against Them`

- Patzer should eventually add richer imported-game `match` ownership for opponent research:
  - when imported games show the same two players facing each other in consecutive or rematch-style runs, the app should be able to detect and group those games as a specific match/session rather than only as isolated games
  - those grouped matches should become a review and research surface of their own, with goals such as:
    - reviewing how a mini-match evolved game to game
    - comparing opening choices and adjustments between games
    - seeing whether one side changed plans after earlier results
    - tracking repeated lines the user entered and later analyzed against that same opponent
  - in opponent-research tooling, the app should also be able to locate all imported games where the researched opponent played the user directly, separate from their broader game history
  - this should be treated as a richer language and product layer than simple game rows:
    - opponent history
    - rematch chains
    - mini-match review
    - repeated-opponent prep
    - reviewed lines against this opponent
  - this should only be built once game ownership, opponent identity matching, and openings/opponent research surfaces are stable enough to support it cleanly

- Patzer should eventually support import-time ownership tagging for account/game routing:
  - when importing a username/account, the user should be able to mark that import as:
    - `this is me`
    - `this is opponent`
  - `this is me` should let Patzer merge games from multiple personal accounts and multiple sites into one user-owned playing history
  - `this is opponent` should let Patzer route that imported history into the opponent-research surface instead of treating it as part of the user's own game library
  - this should become part of a broader identity model, not just a one-off checkbox:
    - multiple self identities
    - opponent aliases / identities
    - cross-site identity grouping
    - consistent ownership tagging on imported games
  - this matters because later features like:
    - opponent history lookup
    - direct head-to-head detection
    - rematch-chain grouping
    - reviewed-line recall against a specific opponent
    - self-improvement analytics across multiple accounts
    all depend on imported games knowing whether they belong to the user or to an opponent research target

- **(DONE)** Rated puzzle progression:
  - user puzzle rating — Glicko-2 implemented
  - rated / unrated training toggle — session mode selector
  - rating changes based on puzzle difficulty and solve result — working with delta display
  - cloud sync for ratings wired (CCP-463) but not end-to-end validated
