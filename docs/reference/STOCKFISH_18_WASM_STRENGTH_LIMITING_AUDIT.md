# Stockfish 18 WASM Strength-Limiting Audit

Audited for:
- `CCP-566`
- `CCP-566-F1`

Related sprint:
- [ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md](/Users/leftcoast/Development/PatzerPatzer/docs/mini-sprints/ENGINE_STRENGTH_LEVELS_SPRINT_2026-03-30.md)

Sources inspected:
- `~/Development/lichess-source/lila/ui/botDev/src/rateBot.ts`
- `~/Development/lichess-source/lila/ui/lib/src/ceval/protocol.ts`
- [protocol.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/protocol.ts)
- `public/stockfish-web/sf_18_smallnet.wasm` string table

## Goal

Capture the durable research answer for how Patzer's shipped Stockfish 18 WASM path can be limited for weaker play, what is directly source-confirmed, and what remains inference.

## Source-Confirmed Findings

### 1. The shipped Stockfish 18 WASM binary exposes the expected strength options

Confirmed by searching string literals in:
- `public/stockfish-web/sf_18_smallnet.wasm`

Observed option strings:
- `Threads`
- `UCI_Elo`
- `Skill Level`
- `UCI_LimitStrength`

This is the strongest local proof that the shipped engine build knows about:
- Elo limiting via `UCI_Elo`
- strength limiting via `UCI_LimitStrength`
- a separate skill option exposed as `Skill Level`

Important wording note:
- the binary string is `Skill Level`
- not `Skill_Level`

So any future UCI command should use the literal option name the engine exposes, not a guessed underscore variant.

### 2. Patzer's current protocol already uses the Elo-limiting path

In [protocol.ts](/Users/leftcoast/Development/PatzerPatzer/src/ceval/protocol.ts):
- `setPlayStrength(config)` sends `setoption name UCI_LimitStrength value true`
- then sends `setoption name UCI_Elo value <elo>`
- level 8 disables `UCI_LimitStrength`

So the current Patzer implementation already follows the intended primary weakening seam:
- levels 1-7: Elo-limited play
- level 8: full strength

### 3. Lichess `rateBot.ts` does not use UCI options for weakening

In `ui/botDev/src/rateBot.ts`, Lichess's bot-strength mapping is not a frontend UCI option table.

What it actually does:
- maps a level to an approximate rating with `rating = (level + 8) * 75`
- maps a level to depth with `depth = clamp(level - 9, { min: 1, max: 20 })`
- calls `goFish(... { level: this.level - 10, by: { depth: this.depth } })`

So `rateBot.ts` confirms:
- Lichess uses discrete levels
- depth is part of the weakening story
- lower levels are intentionally depth-capped

But it does not prove a browser-UCI `UCI_Elo` table by itself.

### 4. Lichess frontend ceval protocol does not carry a public weakening table

`ui/lib/src/ceval/protocol.ts` is focused on:
- UCI handshake
- option setting for analysis
- work swapping
- bestmove/info handling

It does not provide a ready-made browser-side "AI level 1-8" weakening table for Patzer to copy.

So the actual frontend strength mapping remains a Patzer-owned policy informed by:
- available engine options
- Lichess level semantics
- the sprint's desired 1-8 UX

## Not Directly Confirmed

These points were asked about in the original research prompt, but are not fully proven by the inspected local sources alone.

### `UCI_LimitStrength` value domain

Strong inference:
- standard UCI boolean option
- Patzer uses `true` / `false`

Local source proof:
- option name exists in the wasm binary

What is not proven here:
- a checked-in option schema document from the package spelling out the boolean domain

### `UCI_Elo` numeric range

Local source proof:
- option name exists in the wasm binary
- Patzer already sends concrete Elo values through it

What is not fully source-proven here:
- a bundled README or type file that states the exact min/max range for this shipped build

Practical conclusion:
- Patzer's chosen values `1320` through `2500` are conservative and plausible
- exact engine-supported min/max should still be treated as runtime-validated rather than fully documented from the local package

### `Skill Level` numeric range

Local source proof:
- the option exists in the wasm binary as `Skill Level`

What is not proven from inspected package docs:
- exact numeric range

Historical Stockfish convention strongly suggests `0-20`, but that remains inference here, not package-doc proof.

### Depth capping behavior at low levels

Source-confirmed:
- Lichess `rateBot.ts` explicitly combines level-based weakening with depth caps

Not source-confirmed from the shipped browser engine alone:
- whether `UCI_LimitStrength` by itself already enforces enough weakening for low levels in this exact build

So the sprint's "supplement with depth caps at low levels" remains a sound design choice, not a directly proven engine requirement.

## Recommended Patzer Mapping

### Recommended primary mechanism

Use:
- `UCI_LimitStrength`
- `UCI_Elo`

as the primary weakening mechanism for play mode.

Reason:
- directly supported by the shipped binary
- already integrated into Patzer's protocol layer
- preserves the single-engine architecture

### Recommended secondary mechanism

Keep explicit `maxDepth` caps in the level table, especially at the weaker end.

Reason:
- Lichess's `rateBot.ts` clearly treats depth as part of level shaping
- depth caps reduce the chance that low nominal Elo settings still feel tactically sharp

### Recommended 1-8 product seam

Treat the Patzer level table as a product policy layer:
- `level`
- `label`
- `uciElo`
- `maxDepth`
- `description`

That is already the shape in [types.ts](/Users/leftcoast/Development/PatzerPatzer/src/engine/types.ts).

This is the right ownership seam because:
- the engine protocol owns UCI commands
- the product owns the user-facing level scale

## Summary

What is solidly proven:
- the shipped SF18 WASM path exposes `UCI_Elo`, `UCI_LimitStrength`, and `Skill Level`
- Patzer is correctly built around `UCI_LimitStrength + UCI_Elo`
- Lichess's strength ecosystem uses discrete levels plus depth shaping

What remains inference:
- exact `UCI_Elo` min/max bounds from package docs
- exact `Skill Level` numeric range from the shipped package docs

Best current decision:
- keep Patzer's existing Elo-limited 1-8 mapping
- keep depth caps as a product-level supplement
- do not switch to a `Skill Level`-first design without a stronger reason
