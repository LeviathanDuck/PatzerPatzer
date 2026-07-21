# Chess Patzer

Chess Patzer is a web application for analyzing chess games and turning mistakes into targeted
practice.

## Development history

Development began March 17, 2026. The public repository preserves a sanitized commit-by-commit
history so the project timeline remains visible without publishing private development material.
See the [commit history](https://github.com/LeviathanDuck/ChessPatzer/commits/main).

## License and source

This repository contains the corresponding source for the publicly available application. The code
is licensed under the GNU Affero General Public License v3.0 (`AGPL-3.0`). See [LICENSE](LICENSE).

## Build from source

Use a current Node.js release and pnpm:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

The generated browser application is written to `public/`.

## Issues

Public issues are welcome for reproducible bugs and product feature requests. Please use the
structured issue forms and omit private data, credentials, game records, logs, screenshots, and
security-sensitive details. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md)
before filing a report.
