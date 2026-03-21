# Patzer Pro — Wishlist

This document is a reference list for quality-of-life ideas, UI improvements, and smaller feature
thoughts that may be worth revisiting later.

Treat this as a wishlist only.

Important:

- do not treat wishlist items as active next steps
- do not assume wishlist items are safe to implement immediately
- always check wishlist items against the current codebase, `docs/ARCHITECTURE.md`,
  `docs/NEXT_STEPS.md`, and `docs/KNOWN_ISSUES.md` before planning or implementing them

This is a holding area for ideas that may eventually be integrated, but are not currently part of
the committed near-term roadmap.

## Wishlist items
- [x] The preview chess boards on engine mouse hover should be roughly twice in size unless it conflicts with other things
- [x] Changes to how the eval graph is displayed and formatted
- [x] Bring review annotation label/colors into Lichess parity. Current Patzer Pro review annotations are driven by `classifyLoss()` in `src/engine/winchances.ts`, rendered in `src/analyse/moveList.ts` and `src/analyse/evalView.ts`, and styled in `src/styles/main.scss`. Before changing colors, confirm the exact Lichess mapping for `inaccuracy`, `mistake`, `blunder`, and whether `miss` should exist as a per-move review label here or remain a separate missed-tactic/puzzle concept. Then align both the glyph/dot colors and any summary styling with that decision.
- [x] Move the analysis-page `Review` / `Re-analyze` button out of the underboard analysis controls and place it beside the move-navigation buttons in the analysis controls row near `Prev` / `Flip` / `Next`. Current split ownership is awkward: the navigation row is rendered in `src/main.ts`, while the review/export control block is rendered by `renderAnalysisControls()` in `src/analyse/pgnExport.ts`. If implemented, keep the move small and extraction-friendly instead of adding more control-layout glue back into `src/main.ts`.
- [x] Remove the `1` / `0` / `½` single-game result markers from the player strip by default. If we later support real multi-game match context between the same two players, only show running match score when that context actually exists and is meaningful. Find a different method to display who won. Maybe we should have a Green boarder box around player who won and red board box around player who lost. 
- [x] Add tag or label next to engine move arrows showing what their eval is
- [x] we shouldn't re import the same games that have already been imported
- [x] Import only new games since last import. Freshly imported games from last batch, if other games were already present should get a "new import" identifier that displays for 1h or more
- [ ] In the header, it should default to a chess.com username input field. You should be able to then click the chess.com Label as a button, and have it change to lichess. 
- [x] IF there is an engine line available that has a massive improvement ie. A Tactic or something, the engine lines eval number next to the engine line should change to a brighter more aggressive colour. Maybe a green shade. 
- [ ] When there is a list of games, it should on the right hand side of the list, say who the user they were playing against was. Less dominant and agressive, but also show the elo number of the user. This should be formatted more subtly. The goal is so that if you are importing games from multiple accounts it's easy to see 
- [ ] When mate is played on the board, the analysis engine should show a #KO symbol not a #0 symbol. 
- [ ] When mate is played on the board, for some reason the eval bar drops to full black. The eval bar should fill up entirely with whatever colour delivered the mate. 
- [x] For the mini board preview on engine line mouse hover should be larger. If right now is considered 100%, we should go up to 200% in size. 
- [ ] When M1 is played on the board, the losing king should get a KO symbol over it. The KO symbol would be a mini version of what is used in street fighter, if the source of this KO graphic isnt known you should ask. 
- [ ] when game review button is pressed, all arrows should be removed from board until game review is completed. 
- [ ] Setting to toggle only the users whose perspective we are looking at the game from to have their move review annotated dot colour shown. Default state shows both. 


## Completed items and completion date
