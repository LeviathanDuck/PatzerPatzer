# AGPL Compliance Checklist

This checklist tracks the practical AGPL and Lichess-derived source-availability work for Patzer
Pro. It is not a substitute for legal advice. It is the repo's current implementation checklist.

## Current status

Implemented in this step:
- Top-level AGPL license file at [LICENSE](/Users/leftcoast/Development/PatzerPatzer/LICENSE)
- Public source repository link in [README.md](/Users/leftcoast/Development/PatzerPatzer/README.md)
- Visible in-app source/license notice rendered from [src/main.ts](/Users/leftcoast/Development/PatzerPatzer/src/main.ts)

Still incomplete:
- Full provenance audit of all Lichess-derived code, styles, fonts, and copied assets
- Explicit third-party notices/inventory for bundled assets and libraries
- Deployment process check to ensure the live site always points users at the exact corresponding source for the deployed revision
- Legal review of trademark/branding boundaries and any additional attribution expectations

## Checklist

Source availability:
- [x] Publish the corresponding source in a public repository
- [x] Make the source link visible to network users in the running app
- [x] Include the project license in the repository
- [ ] Link the live deployment to the exact deployed revision or release artifact, not only the moving default branch

License and notices:
- [x] State the repo license in project documentation
- [ ] Audit whether every redistributed third-party asset has an appropriate retained notice
- [ ] Add a dedicated third-party notices file if the asset/license audit shows it is needed
- [ ] Verify warranty/no-warranty language is sufficiently visible wherever required

Lichess-derived material:
- [x] Keep inline provenance comments where code was adapted from Lichess
- [ ] Audit copied styles, icons, font assets, and engine-related assets for retained notices and correct licensing treatment
- [ ] Confirm that all Lichess-derived material used in production is available in corresponding source form in this repo

Deployment:
- [ ] Verify the production site exposes the same source/license notice as local builds
- [ ] Verify the linked public repository remains available to users of the deployed app
- [ ] Decide whether the deployment should expose a local `/license` or `/source` route in addition to the GitHub links

## Notes

- Lichess's main server project is published under AGPL-3.0-or-later, and Lichess publicly exposes its source repositories to users.
- Patzer Pro already contains many Lichess-derived or Lichess-aligned adaptations in `src/`, so source availability must be treated as a real product requirement, not only a repo housekeeping task.
- This checklist is intentionally conservative: items stay open until verified against the deployed site, not merely the local repo.
