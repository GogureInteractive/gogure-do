# Contributing (English)

## Workflow
1. Branch from `main`: `feat/<scope>` or `fix/<scope>`.
2. Write a failing test first when changing behaviour in `domain.js`, `timer.js` or `backend/server.js`.
3. Keep the UI language **German**, code comments and documentation **English**.
4. Run `npm test` — all green, no skipped tests.
5. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `feat(timer): add long-break auto-suggestion` · `fix(store): tolerate missing settings keys` ·
   `docs(readme): describe release flow`. One logical change per commit, imperative mood, body explains *why*.
6. Open a PR; CI must pass. Squash-merge keeps `main` history clean.

## Code style
- ES modules, no framework, no build step. Small pure functions over classes.
- Every mutation of persisted state goes through `store.update()`; never write localStorage directly.
- Validate all external input (imports, backend payloads) at the boundary and fail with friendly errors.
- Material 3 tokens live in `src/css/style.css` — use existing CSS variables instead of hard-coded values.

## Releases
Tag `vMAJOR.MINOR.PATCH` (semver). The release workflow attaches a source/build zip and a changelog cut
from conventional-commit messages. GitHub Pages deploys automatically from `main`.
