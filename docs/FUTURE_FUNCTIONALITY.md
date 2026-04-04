# Patzer Pro — Big Picture Features down the line

> **Status update (2026-03-30):** Items marked with **(DONE)** or **(PARTIAL)** have been implemented.
> See `docs/audits/SPRINT_VS_IMPLEMENTATION_AUDIT_2026-03-30.md` for details.

> **Dating rule (from 2026-04-03):** New items added to this doc must include `_(YYYY-MM-DD)_`
> immediately after the `-` bullet marker. Items without a date predate this rule.

- [x] **(DONE)** The website should be loaded on mobile and use styling similar to lichess — mobile analysis and puzzle usability sprints completed

- [x] **(DONE)** Users should be able to import games and have the analysis saved locally — game import (Lichess, Chess.com, PGN), analysis persistence, and background bulk review all working

- [ ] **(PARTIAL)** The admin of the site should have a special log in area, where the user data can be saved to and “sync’d” — Lichess OAuth login works, server DB (SQLite) exists, push works, pull partially fixed (CCP-466). End-to-end sync not yet validated.

- [x] **(DONE)** Special admin login ability — Lichess OAuth implemented in `server/auth.mjs`

- [ ] In the future, user identity should own more than imported games:
  - saved review data
  - saved puzzle library items
  - puzzle attempt history
  - repetition state
  - notes, tags, and folder memberships
  - import ownership labels such as:
    - `this is me`
    - `this is opponent`
  - support for multiple user-owned chess identities across different accounts and sites so imported games can still be grouped as the user's own history instead of being fragmented by username

- [ ] The long-term product flow should connect analysis and puzzle work directly:
  - review a game on the analysis board
  - enter Learn From Your Mistakes
  - save moments into the user puzzle library
  - move into a dedicated puzzle-training surface
  - return later and continue puzzle work with the same saved progress

- [ ] **(PLANNED)** Study Library + Repetition Practice — a universal save target and content-agnostic drill engine:
  - Study Library: user-managed collection of saved games, positions, and annotated move sequences
  - one-click save from any tool surface (right-click move → "Save to Library")
  - library browser at `#/library` with sort, filter, folders, tags, favorites
  - study detail view with board, move list, notes, and metadata editing
  - repertoire upload should also live here:
    - users should be able to upload PGNs of the opening lines they prefer to play
    - those uploads should become labeled opening-repertoire study items, not just generic study entries
  - Repetition Practice: spaced-repetition drill engine for any saved material
  - position-aware scheduling (FEN-keyed, transposition-safe, confidence 0–6)
  - becomes the connective tissue between all existing tools
  - ORP should build on top of the Study Library drill engine rather than creating a parallel system
  - full planning document: `docs/STUDY_LIBRARY_PLAN.md`

- [ ] Patzer should eventually support broader user-owned puzzle import beyond review-derived moments and the bundled Lichess source, but only after the canonical puzzle model and library ownership are stable

- [ ] Patzer should eventually add `Opening Repetition Practice` (`ORP`) as a dedicated spaced-repetition training surface for openings:
  - this is the canonical repo name for the feature
  - it should help users rehearse and retain opening lines over time
  - ORP should be built on top of the Study Library drill engine (see `docs/STUDY_LIBRARY_PLAN.md`) — the scheduler, grader, and drill controller are shared infrastructure; ORP adds opening-specific entry points and opponent-aware line selection
  - acceptable generic descriptions are:
    - opening practice
    - repertoire practice
    - line repetition
    - opening drill flow
  - this is distinct from the openings opponent-research tool and distinct from `Practice Against Them`

- [ ] Patzer should eventually let user-uploaded repertoire appear through the book button on analysis and related pages:
  - from the analysis board, the user should be able to open the existing book/explorer surface and see:
    - masters games
    - Lichess games
    - an overlay or view of the user's uploaded repertoire
  - from any game position, the user should be able to bring up repertoire information and see what the suggested repertoire move would have been from their uploaded opening lines
  - this should stay explicitly tied to the current book-button surface rather than becoming a separate disconnected repertoire page
  - the same repertoire information should remain reusable on other pages where the current book/explorer affordance already makes sense

- [ ] Patzer should eventually add richer imported-game `match` ownership for opponent research:
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

- [ ] Patzer should eventually add opening-tree head-to-head filtering inside opponent research:
  - when viewing an opponent opening tree, the user should be able to enable a `load all games vs you` option directly in the opening-tree workflow
  - that flow should prefill the user's known imported identity from their main game library instead of asking them to re-enter it every time
  - it should also support richer identity prompts tied to the opening-tree filter:
    - `did you play them on any alts?`
    - `were they on any alts when they played you?`
    - `would you like to import or isolate just those head-to-head games?`
  - the opening tree should then be able to filter down to only the lines that opponent played against the user's known identities and optional alt identities
  - this should remain explicitly framed as opening-tree functionality, not only as a generic opponent-history report, because the product value is seeing which branches and move orders that opponent actually chose against you
  - this depends on the same broader identity and ownership layer as:
    - self identity detection from imports
    - self alt mapping
    - opponent alt mapping
    - direct head-to-head extraction
    - opponent-research subset filtering

- [ ] _(2026-04-03)_ Patzer should eventually add single-click piece-to-arrow move entry in the Opening Tree view:
  - when a piece on the Opening Tree board has a connected arrow / linked continuation, clicking that piece once should automatically play the associated move on the board
  - this should mirror the current behavior where clicking a line from the right-side move list plays that line on the board
  - this should only apply when the clicked piece has a clear linked move/arrow destination in the Opening Tree position
  - drag-and-drop move entry must remain fully supported and must not be replaced by this feature
  - the product goal is to let users follow visible Opening Tree arrows more quickly without forcing them to drag when the destination is already being explicitly shown

- [ ] Patzer should eventually add stronger variation-management controls on the analysis move list:
  - the move-list surface should support a clear user-facing `Clear` action for removing the variations the user created and returning the move list to the normal game order
  - this action should remove the added variations without wiping the engine evaluation or completed game review attached to the main game
  - the move list should also support removing variations one by one with a small `x` directly beside each added variation
  - this should stay explicitly framed as variation management in the move list / analysis tree, not as generic game reset behavior

- [ ] Patzer should eventually support import-time ownership tagging for account/game routing:
  - in the header import box filter dropdown, the user should be able to mark that import as:
    - `this is me`
    - `this is opponent`
  - on the user's first import, this toggle should default to `this is me`
  - on later imports, it should default to `this is opponent`
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

- [x] **(DONE)** Rated puzzle progression:
  - user puzzle rating — Glicko-2 implemented
  - rated / unrated training toggle — session mode selector
  - rating changes based on puzzle difficulty and solve result — working with delta display
  - cloud sync for ratings wired (CCP-463) but not end-to-end validated
