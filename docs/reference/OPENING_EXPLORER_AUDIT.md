# Opening Explorer — Lichess Implementation Audit

**Purpose:** Full audit of how Lichess implements the Opening Explorer on the analysis board.
Used as the primary reference for implementing this feature in Patzer Pro.

**Source:** `~/Development/lichess-source/lila`
**Audit date:** 2026-03-29

---

## 1. File Structure

All explorer code lives inside `ui/analyse/src/explorer/`.

| File | Lines | Role |
|---|---|---|
| `explorer/interfaces.ts` | 124 | All TypeScript types and interfaces |
| `explorer/explorerCtrl.ts` | 223 | Controller: state, fetch, cache, debounce |
| `explorer/explorerConfig.ts` | 375 | Config sub-controller + localStorage persistence |
| `explorer/explorerXhr.ts` | 84 | HTTP layer: request building, NDJSON streaming |
| `explorer/explorerView.ts` | 436 | All Snabbdom rendering |
| `explorer/explorerUtil.ts` | 50 | Shared helpers (compact numbers, result badges) |
| `explorer/tablebaseView.ts` | 83 | Tablebase-specific rendering |
| `css/explorer/_explorer.scss` | 387 | Panel layout, tables, bars, game rows |
| `css/explorer/_config.scss` | 152 | Config panel styling |

Integration points outside the module:

- `ui/analyse/src/ctrl.ts` — instantiates `ExplorerCtrl`, calls `setNode()` on navigation
- `ui/analyse/src/view/tools.ts` — renders explorer panel in side column
- `ui/analyse/src/view/controls.ts` — toggles explorer on/off via toolbar button

---

## 2. Data Types

### Database sources

```typescript
type ExplorerDb = 'lichess' | 'masters' | 'player'
```

### Core response shapes

```typescript
// Base — all three DBs return this
interface ExplorerData {
  fen: FEN
  moves: MoveStats[]
  isOpening?: true
  tablebase?: true
}

// Opening data (masters + lichess + player)
interface OpeningData extends ExplorerData {
  white: number       // total white wins
  black: number
  draws: number
  topGames?: OpeningGame[]
  recentGames?: OpeningGame[]
  opening?: { eco: string; name: string }
  queuePosition?: number  // player DB indexing queue
}

// Per-move stats
interface OpeningMoveStats extends MoveStats {
  white: number
  black: number
  draws: number
  averageRating?: number
  averageOpponentRating?: number
  performance?: number
  game?: OpeningGame   // single sample game for this move
  opening?: Opening
}

// A sample game in the top/recent games table
interface OpeningGame {
  id: string
  white: { name: string; rating: number }
  black: { name: string; rating: number }
  winner?: Color
  year?: string
  month?: string
  speed?: Speed
  mode?: ExplorerMode
  uci?: string
}

// Tablebase result
interface TablebaseData extends ExplorerData {
  moves: TablebaseMoveStats[]
  dtz?: number      // distance to zeroing
  dtm?: number      // distance to mate
  category: TablebaseCategory  // 'loss'|'draw'|'win'|'unknown'|...
  checkmate?: true
  stalemate?: true
}
```

---

## 3. API Endpoints & Parameters

**Base URL:** `https://explorer.lichess.ovh` (configurable)
**Tablebase URL:** separate external service

### Opening endpoints

```
GET /masters   — master-level historical games
GET /lichess   — all rated Lichess games
GET /player    — single player's personal opening stats
```

### Query parameters

| Parameter | Masters | Lichess | Player | Type | Notes |
|---|---|---|---|---|---|
| `fen` | ✓ | ✓ | ✓ | FEN string | Current position |
| `play` | ✓ | ✓ | ✓ | UCIs (CSV) | Moves from starting FEN |
| `variant` | ✓ | ✓ | — | string | `standard`, `chess960`, etc |
| `since` | ✓ | ✓ | — | `YYYY` or `YYYY-MM` | Date range start |
| `until` | ✓ | ✓ | — | `YYYY` or `YYYY-MM` | Date range end |
| `speeds` | — | ✓ | ✓ | CSV | `bullet,blitz,rapid,classical` |
| `ratings` | — | ✓ | — | CSV | `1600,1800,2000,2200` (bands) |
| `player` | — | — | ✓ | string | Username |
| `color` | — | — | ✓ | `white\|black` | Player's color |
| `modes` | — | — | ✓ | CSV | `casual,rated` |
| `topGames` | ✓ | ✓ | ✓ | `0\|1` | Include sample top games |
| `recentGames` | ✓ | ✓ | ✓ | `0\|1` | Include recent games |
| `source` | ✓ | ✓ | ✓ | `"analysis"` | Fixed string |

### Response format: NDJSON streaming

Opening data is streamed as newline-delimited JSON. Each line is a partial object that gets merged into the final state:

```json
{"moves":[{"uci":"e2e4","san":"e4","white":100000,"black":50000,"draws":30000}]}
{"topGames":[{"id":"xyz123","white":{"name":"Magnus","rating":2850},...}]}
{"recentGames":[...]}
{"opening":{"eco":"B20","name":"Sicilian Defense"}}
```

Tablebase uses standard single-response JSON.

---

## 4. Complete Data Flow

```
User navigates to position
        │
        ▼
ctrl.explorer.setNode()
        │
        ├─ node.ply >= 50? → cache empty data, show "max depth"
        ├─ !isAuth?        → no-op, show "sign in" message
        └─ normal path:
                │
                ▼
        cache.get(node.fen)
                │
                ├─ HIT  → movesAway = 0 → redraw (instant)
                └─ MISS → debounce(250ms)
                                │
                                ▼
                        abortController.abort()  (cancel stale request)
                        new AbortController()
                                │
                                ▼
                        buildUrl(db, config, node)
                        fetch(url, { signal, credentials })
                                │
                                ├─ NDJSON stream → processData() per chunk
                                │       └─ cache[fen] = mergedData
                                │           loading(false)
                                │           redraw()
                                │
                                ├─ AbortError → ignored
                                └─ Other error → failing(err) → redraw()
```

---

## 5. UI Structure

### Outer container

```
section.explorer-box.sub-box
  div.overlay            ← semi-transparent loading overlay
  div.content
    [config panel OR data panel]
  button.fbt.toconf      ← gear icon, toggles config
```

### Title bar (always visible)

Shows tabs for the three databases. Active tab is highlighted. For the Player DB, shows username + "as White/Black" with a color-swap button. If the player's DB is still being indexed, shows a spinner.

### Config panel (toggleable via gear icon)

**Masters DB:**
- Since: year input (min 1952)
- Until: year input

**Lichess DB:**
- Time controls: multi-select buttons (ultraBullet, bullet, blitz, rapid, classical, correspondence)
- Average rating: multi-select buttons (400, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500)
- Since / Until: month inputs (YYYY-MM)

**Player DB:**
- Player: button → modal with username search, autocomplete, 20 previous players
- Color: "as White" / "as Black" toggle
- Time controls: same multi-select as Lichess DB
- Mode: casual / rated toggle
- Since / Until: month inputs

### Moves table

```
table.moves
  thead
    tr: Move | % | Games | W/D/B
  tbody
    tr × N     ← one row per available move
    tr.sum     ← totals row (sticky at bottom on desktop)
```

Each row:
- **Move** — SAN notation in chess font
- **%** — share of total games at this position
- **Games** — compact count (e.g. `12.4k`)
- **Result bar** — stacked horizontal bar: White | Draw | Black. Percentages shown inline if segment is wide enough (>12%). Bar transitions smoothly on update.

Row hover: draws an arrow on the board for that move.
Row click: plays the move on the board.

### Top / Recent games table

```
table.games
  thead: "Top Games" (colspan 4 or 5)
  tbody
    tr × N     ← one row per game
    tr.game-menu  ← expanded action row when a game is clicked
```

Columns:
1. Ratings (White Elo / Black Elo, stacked)
2. Player names (White / Black, stacked, truncated)
3. Result badge (`1-0` / `½-½` / `0-1`)
4. Date (year for masters, month for others)
5. *(Lichess/Player only)* Speed icon with tooltip

Click a game row:
- **In a study context:** shows inline action menu — View, Cite, Insert, Close
- **Elsewhere:** opens game in new tab

### Loading, error, and empty states

| State | Trigger | UI |
|---|---|---|
| Loading | fetch in progress | Overlay + table opacity 0.4 |
| Error | network / server error | Red error message, dismissible |
| Max depth | `ply >= 50` | "Maximum depth reached" message |
| No data | empty moves array | `movesAway` increments; >2 → panel narrows |
| Unauthenticated | no login | "You need an account" + sign-up button |
| Indexing queue | `queuePosition` in response | "Indexing N other players first…" |
| Tablebase checkmate | `checkmate: true` | "Checkmate" label instead of table |
| Tablebase stalemate | `stalemate: true` | "Stalemate" label |

### Tablebase panel

Used instead of the opening panel when total piece count ≤ 8 (standard). Shows moves grouped by outcome category:

```
[Losing]   — rows with the winning moves for the opponent
[Unknown]  — no tablebase entry
[Draw]     — drawn moves with DTZ badge
[Winning]  — moves that win, with DTZ/DTM/DTW badges
```

Each move row: `[SAN]  [Outcome badge]  [DTZ badge]  [DTM badge if available]`

---

## 6. State Management

### ExplorerCtrl

```typescript
allowed: Prop<boolean>           // Show explorer button at all
enabled: Prop<boolean>           // Toggled by user; stored in localStorage
withGames: boolean               // Show game tables (false for studies)
loading: Prop<boolean>
failing: Prop<Error | null>
hovering: Prop<{ fen, uci } | null>
movesAway: Prop<number>          // Distance from last known position
gameMenu: Prop<string | null>    // Expanded game ID
cache: Dictionary<ExplorerData>  // FEN → response, in-memory only
abortController: AbortController
```

### ExplorerConfigCtrl

```typescript
data: {
  open: Prop<boolean>                   // Config panel open/closed
  db: StoredProp<ExplorerDb>            // localStorage
  rating: Prop<number[]>                // localStorage
  speed: Prop<ExplorerSpeed[]>          // localStorage
  mode: Prop<ExplorerMode[]>            // localStorage
  byDbData: {
    [db]: {
      since: StoredProp<Month>          // localStorage, per-DB
      until: StoredProp<Month>
    }
  }
  playerName: {
    open: Prop<boolean>
    value: StoredProp<string>
    previous: StoredProp<string[]>      // 20 previous usernames
  }
  color: Prop<Color>
}
```

### localStorage keys

```
explorer.db2.{variant}                  active DB per variant
analyse.explorer.enabled                panel open/closed
explorer.speed                          selected speeds
analyse.explorer.rating                 selected rating bands
explorer.mode                           casual/rated
analyse.explorer.since-2.{db}          date range per DB
analyse.explorer.until-2.{db}
analyse.explorer.player.name            last searched username
explorer.player.name.previous           array of 20 previous
```

---

## 7. Performance & Caching

| Technique | Detail |
|---|---|
| Debounce | 250ms, leading-edge — first call fires immediately, subsequent calls wait |
| In-memory cache | FEN-keyed `Dictionary<ExplorerData>`, unbounded (~50 entries/session) |
| Cache invalidation | Full clear on `reload()` or variant change; partial clear on board flip (player DB only) |
| Abort controller | Cancels in-flight request when user navigates away before response |
| NDJSON streaming | Partial data shown while remaining chunks still loading |
| Lazy rendering | VNodes only created if data exists |
| CSS will-change | Applied to moves table to prevent Safari repaints |

---

## 8. Board Integration

### Hover → arrows

```typescript
setHovering(fen, uci) {
  this.root.fork.hover(uci)    // highlight in move tree
  this.hovering({ fen, uci })
  this.root.setAutoShapes()    // draw arrows on board
}
```

`mouseover` on a move row calls `setHovering`; `mouseout` calls `setHovering(fen, null)`.

### Click → play move

```typescript
explorerMove(uci) {
  this.playUci(uci)          // appends move to tree, navigates board
  this.explorer.loading(true) // triggers setNode() → new fetch
}
```

### Node change → fetch

`ctrl.setNode()` is called by every board navigation action. `ExplorerCtrl.setNode()` is called from there, triggering the debounced fetch cycle.

### Master game import

Master games can be opened via:
```
/import/master/{gameId}/{orientation}?fen={fen}
```
The PGN is fetched from `{explorerEndpoint}/masters/pgn/{id}` and imported as a Lichess game record.

---

## 9. Hash / Deep-link Scheme

```
#explorer/lichess             open with Lichess DB
#explorer/masters             open with Masters DB
#explorer/{username}          open with Player DB for that username
#explorer/{username}/black    Player DB as black
#opening/*                    alias for #explorer/*
```

---

## 10. CSS Layout Approach

```scss
// Panel width: flex-based, three states
.explorer-box {
  flex: 3 1 0;           // normal: takes 3× share

  &.reduced {
    flex: 0.3 3 0;       // collapsed: ~10% width

    &:hover {
      flex: 1 2 0;       // hover-expand
    }
  }

  transition: flex 0.3s;
}
```

Result bar segments:
```scss
.white { background: #fff; }
.draws { background: #a0a0a0; }
.black { background: #333; }
// Inline percentage text hidden if segment < 12%
```

Mobile: explorer is in a tab panel at full height. Desktop: flexible side panel with sticky totals row.

---

## 11. Database-Specific Differences

| Feature | Masters | Lichess | Player |
|---|---|---|---|
| Auth required | No | No | Yes (to save preferences) |
| Date filter | Year (1952–now) | Month (YYYY-MM) | Month (YYYY-MM) |
| Speed filter | No | Yes | Yes |
| Rating filter | No | Yes | No |
| Color filter | No | No | Yes |
| Mode filter | No | No | Yes |
| Game columns | 4 (no speed) | 5 | 5 |
| Game link | `/import/master/{id}` | `/game/{id}` | `/game/{id}` |
| Indexing queue | No | No | Yes (shows position) |
| Max depth | 50 ply | 50 ply | 50 ply |

---

## 12. Variant Support

| Variant | Masters | Lichess | Tablebase |
|---|---|---|---|
| Standard | ✓ | ✓ | ✓ (≤8 pieces) |
| Chess960 | — | ✓ | — |
| Atomic | — | ✓ | ✓ |
| Antichess | — | ✓ | ✓ |
| Crazyhouse | — | ✓ | — |
| Others | — | ✓ | — |

---

## 13. What Patzer Pro Already Has

| Component | Status |
|---|---|
| Openings page with board | ✓ Built |
| Opening tree from imported games | ✓ Built |
| Explorer panel toggle | ✓ Built |
| Board navigation via move click | ✓ Built |
| IDB caching infrastructure | ✓ Built |
| API fetch utilities | ✓ Built |

---

## 14. What Needs to Be Built

The following is a breakdown suitable for sprint planning:

### Sprint A — API layer
- `explorerXhr.ts` equivalent: fetch function for `/masters`, `/lichess`, `/player`
- NDJSON streaming reader
- AbortController + debounce wrapper
- Response types matching interfaces above

### Sprint B — ExplorerCtrl
- State: `enabled`, `loading`, `failing`, `cache`, `movesAway`, `hovering`
- `setNode()` trigger from board navigation
- In-memory FEN cache
- Config sub-controller with localStorage persistence

### Sprint C — Moves table
- Stacked result bar (White / Draw / Black)
- % column and compact game count
- Hover → board arrow integration
- Click → `explorerMove(uci)` → board play

### Sprint D — Config panel
- Masters DB: year range pickers
- Lichess DB: speed multi-select, rating band multi-select, month range
- Player DB: username search + previous list, color toggle, mode toggle

### Sprint E — Top / Recent games table
- Game rows: ratings, names, result badge, date, speed icon
- Click → open game (new tab for now; study integration later)

### Sprint F — Empty / loading / error states
- Loading overlay
- Max depth message
- No-data messaging
- Error state with retry

### Sprint G — Integration into analysis board
- Analysis board side panel: add explorer below or alongside move list
- Toolbar toggle button
- `setNode()` call on every board navigation

### Sprint H — Tablebase (optional / later)
- Detect piece count
- Switch to tablebase view when ≤ 8 pieces
- DTZ / DTM badges

---

## 15. Reliability Notes

As of early 2026, `explorer.lichess.ovh` has experienced intermittent 429 rate-limiting.

Mitigation strategies:
- **Cache aggressively** — IDB persistence across sessions, not just in-memory
- **Graceful degradation** — show cached data if fresh fetch fails
- **Offline fallback** — Lichess publishes DB dumps at `database.lichess.org` (could be imported locally)
- **Rate limit respect** — 250ms debounce at minimum; back off further on 429 responses

---

*Source files audited:*
- `ui/analyse/src/explorer/interfaces.ts`
- `ui/analyse/src/explorer/explorerCtrl.ts`
- `ui/analyse/src/explorer/explorerConfig.ts`
- `ui/analyse/src/explorer/explorerXhr.ts`
- `ui/analyse/src/explorer/explorerView.ts`
- `ui/analyse/src/explorer/explorerUtil.ts`
- `ui/analyse/src/explorer/tablebaseView.ts`
- `ui/analyse/css/explorer/_explorer.scss`
- `ui/analyse/css/explorer/_config.scss`
- `ui/analyse/src/ctrl.ts` (integration points)
- `ui/analyse/src/view/tools.ts` (integration points)
- `ui/analyse/src/view/controls.ts` (integration points)
