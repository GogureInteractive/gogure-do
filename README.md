# Gogure Do — “Do”

**ADHD-optimised focus web app** by [Gogure Interactive Labs](https://github.com/gogure-interactive-labs).
Light, minimal **Material 3** UI (Notion × Google Workspace inspired), German interface, EU GDPR/DSGVO-first:
the app is **local-first** — all data stays in your browser unless you explicitly enable the optional sync backend.

## Features
- ⏱ **Focus timer** with three modes: Fokus · Kurzpause · Langpause (Start / Pause / Reset, custom durations, manual session logging)
- 📊 **Today's focus statistics**: sessions, minutes, daily-goal progress, weekly overview chart, total minutes
- ✅ **Tasks / Todos**, 📁 **Projects**, 💡 **Ideas**, 📝 **Memos** — create, edit, delete, complete, priorities, due dates
- 🗓 **Calendar / Planning**: events with date, time and duration; day overview
- 👥 **Invites & delegation**: e-mail invites with roles (viewer/editor/admin), `@mentions` inside tasks link to invitees, assign work via *Delegieren*, team overview, hints for mentioned-but-not-invited people
- 💾 **Export / import** of the full workspace as JSON (GDPR Art. 20 – data portability) and one-click deletion (Art. 17)
- 🔌 Optional **self-hosted sync backend** (`backend/`) — off by default, enabled only when you save a backend URL in Settings

## Architecture
```
src/            static front-end (ES modules, no build step → GitHub Pages ready)
  index.html      app shell, German UI
  css/style.css   Material 3 design tokens (light background)
  js/domain.js    pure business logic (unit-testable, DOM-free)
  js/timer.js     timer state machine (ticks injected → deterministic tests)
  js/store.js     localStorage persistence + validated import
  js/app.js       UI wiring (single store → render cycle)
backend/        zero-dependency Node.js sync API (JSON file storage)
tests/          node:test unit + integration tests
docs/           PRIVACY.md (DSGVO), ARCHITECTURE.md, CONTRIBUTING.md
```

## Getting started
```bash
npm test                    # run all unit/integration tests (Node ≥ 18)
python3 -m http.server 8080 --directory src   # serve the app → http://localhost:8080
node backend/server.js      # optional sync API → http://localhost:8787/api/health
```

## Deployment (GitHub Pages)
`.github/workflows/deploy.yml` publishes `src/` with GitHub Actions (`actions/deploy-pages`).
Push to `main` → the site is served from the `gh-pages` branch / `github.io` URL.
Releases: `.github/workflows/release.yml` builds a zip asset on every `v*` tag.

## Privacy (DSGVO)
See **[docs/PRIVACY.md](docs/PRIVACY.md)** (German). Summary:
no tracking, no cookies, no accounts, no cloud by default; personal data (e-mail addresses of invitees)
is stored locally and only transmitted if the user configures their own backend. The backend stores
only e-mail addresses and an opaque workspace blob, supports Bearer-token auth and hard DELETE endpoints.

## Development principles
Pure domain layer · dependency-injected clock/ticks · atomic file writes · validation at every boundary
(store import, backend input) · conventional commits · tests before features · docs in English, UI in German.

## License
MIT © Gogure Interactive Labs
