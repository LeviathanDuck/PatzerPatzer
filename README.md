# Patzer Pro

Patzer Pro is a browser-local chess analysis app for importing personal games, reviewing them with
Stockfish, and extracting targeted puzzle candidates.

The project is currently in a stabilization phase: the core analysis workflow exists, the large
`src/main.ts` monolith has already been mostly broken apart, and current work is focused on
correctness, validation, and finishing remaining ownership seams.

## Stack

Frontend:
- TypeScript
- Snabbdom
- Chessground
- chessops
- SCSS
- esbuild

Engine:
- `@lichess-org/stockfish-web`
- Stockfish 18 smallnet

Persistence:
- IndexedDB in the browser

Server:
- small local Node HTTP server for development
- used to serve static files with COOP/COEP headers so SharedArrayBuffer-based Stockfish works

## Current scripts

- `npm run build`
  - bundles `src/main.ts`, builds the worker stub bundle, copies Stockfish assets, compiles SCSS
- `npm run serve`
  - serves `public/` locally with the headers required for the engine
- `npm run typecheck`
  - runs `tsc --noEmit` against the project config and currently fails with known repo-wide type errors

## Development

Install dependencies:

```bash
npm install
```

Build the app:

```bash
npm run build
```

Start the local dev server:

```bash
npm run serve
```

Then open:

```text
http://localhost:3001
```

## Deployment

Current Bluehost/cPanel deployment is prebuilt-static deployment, not server-side build deployment.

Why:
- the cPanel Git deployment shell on this host does not provide `node` or `npm`
- `.cpanel.yml` therefore deploys the checked-in `public/` artifacts directly

Deployment workflow:

1. Run `npm install` locally if needed.
2. Run `npm run build` locally.
3. Commit and push the updated `public/` artifacts together with any source changes.
4. In cPanel Git Version Control, click `Update from Remote`.
5. Then click `Deploy HEAD Commit`.

Deployment notes:
- `.cpanel.yml` must remain checked in at the repo root
- the deploy task syncs `public/` to `/home1/leftcoc0/public_html/patzerpro`
- if `public/` is not rebuilt and committed before pushing, cPanel will correctly deploy an older build

## License and source availability

Patzer Pro is distributed under the GNU Affero General Public License v3.0 or later.

- License text: [LICENSE](/Users/leftcoast/Development/PatzerPatzer/LICENSE)
- Public source repository: [github.com/LeviathanDuck/PatzerPatzer](https://github.com/LeviathanDuck/PatzerPatzer)
- Compliance tracking: [docs/AGPL_COMPLIANCE_CHECKLIST.md](/Users/leftcoast/Development/PatzerPatzer/docs/AGPL_COMPLIANCE_CHECKLIST.md)

The deployed app should expose a visible source-code link for network users. This repo tracks the
remaining compliance gaps in the checklist above.

## Active docs

These are the current project docs that should be treated as active sources of truth:

- [PRD.md](/Users/leftcoast/Development/PatzerPatzer/PRD.md)
- [AGENTS.md](/Users/leftcoast/Development/PatzerPatzer/AGENTS.md)
- [CLAUDE.md](/Users/leftcoast/Development/PatzerPatzer/CLAUDE.md)
- [ARCHITECTURE.md](/Users/leftcoast/Development/PatzerPatzer/docs/ARCHITECTURE.md)
- [NEXT_STEPS.md](/Users/leftcoast/Development/PatzerPatzer/docs/NEXT_STEPS.md)
- [KNOWN_ISSUES.md](/Users/leftcoast/Development/PatzerPatzer/docs/KNOWN_ISSUES.md)

Historical plans, audits, and legacy guidance live under:

- [docs/archive](/Users/leftcoast/Development/PatzerPatzer/docs/archive)

Reference material lives under:

- [docs/reference](/Users/leftcoast/Development/PatzerPatzer/docs/reference)

## Current status

Working today:
- import from Chess.com
- import from Lichess
- PGN paste import
- analysis board navigation
- live engine analysis
- batch review
- eval graph and move labels
- PGN export
- saved puzzle candidate extraction

Still incomplete:
- `analysis-game` route
- standalone puzzle product rebuild
- engine worker path
- clean typecheck baseline
