# Patzer Pro — Product Requirements Document

## Product Summary
Patzer Pro is a personal chess analysis and training web app built around a user’s own games.

## Product Goal
Help users import their games, analyze them, review mistakes, and generate targeted puzzles for deliberate practice.

## Core Users
- improving club players
- players importing games from Chess.com and Lichess
- users who want a personal Lichess-style study environment

## Core User Flows
1. Import games by username, PGN paste, or PGN upload
2. Select a game from the library
3. Open it in the analysis board
4. Run engine analysis
5. Review mistakes and key moments
6. Extract puzzle candidates
7. Solve saved puzzles later

## Core Features
- game import
- analysis board
- move tree and variations
- engine evaluation
- move classifications
- puzzle extraction
- puzzle solving
- persistent local storage

## Non-Goals for MVP
- multiplayer play
- public profiles
- social features
- opening explorer at Lichess scale
- distributed engine analysis

## UX Principle
The product should feel like a personal Lichess-style analysis environment focused on a user’s own games.

## Platform Constraints
- TypeScript
- Snabbdom
- Chessground
- chessops
- esbuild
- pnpm
- no React
- no Express
- no MongoDB

## Success Criteria
- user can import games
- user can analyze a selected game
- user can navigate moves and variations
- user can extract and solve puzzles
- user data persists across refresh