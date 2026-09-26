# Architecture (English)

## Design goals
1. **Local-first & private** — the browser (localStorage) is the source of truth. The network is never
   touched unless the user opts into a self-hosted sync backend.
2. **Testable core** — all business logic lives in pure, DOM-free ES modules (`domain.js`, `timer.js`).
   The timer receives ticks externally so tests are deterministic without fake timers.
3. **No build step** — plain HTML/CSS/JS ES modules. This keeps GitHub Pages deployment trivial and the
   attack surface small.

## Layers
| Layer | File | Responsibility |
|---|---|---|
| Domain | `src/js/domain.js` | entity creation/validation, mention parsing, stats aggregation, sorting |
| Engine | `src/js/timer.js` | focus/short/long state machine, session records with unique ids |
| Persistence | `src/js/store.js` | localStorage read/write, schema-tolerant load, validated `replaceState` (import) |
| Presentation | `src/js/app.js` | views (Focus, Planen, Kalender, Team, Einstellungen), dialogs, rendering loop |
| Sync (optional) | `backend/server.js` | REST API for invites + workspace snapshot, token auth, JSON-file storage |

## Data model (versioned key `gogure-do-store-v1`)
- **tasks**: `{id,title,notes,type,priority,dueDate,projectId,assignee,mentions[],createdAt,completedAt}`
  where `type ∈ task | project-task | idea | memo`.
- **projects**: `{id,name,color,createdAt}` — tasks reference them via `projectId`.
- **events**: `{id,title,date,time,durationMin,description,createdAt}`.
- **invites**: `{id,email,role,status,createdAt}` with `role ∈ viewer|editor|admin`, `status ∈ pending|accepted|revoked`.
- **sessions**: `{id,mode,start,end,seconds,custom}` — finished timer runs; `custom:true` for manual logs.
- **settings**: durations, daily goal, theme.

## Cross-cutting behaviour
- **Mentions ↔ invites**: `parseMentions()` extracts `@name` tokens; `mentionedNotInvited()` links them to
  invite e-mails (match on normalised name, full e-mail or local part) and surfaces gaps in the Team view.
- **Delegation**: setting `assignee` on an entity reuses the same person-matching pipeline (`involvedPeople`).
- **Stats**: `todayStats` / `statsForDay` count only *finished* focus sessions of the given local calendar day;
  `weekStats` produces the 7-day chart series; `totalFocusMinutes` aggregates everything ever logged.

## Backend contract
```
GET    /api/health                 → {ok:true}
GET    /api/invites                → [invite]
POST   /api/invites                → 201 | 400 invalid email | 409 duplicate
PATCH  /api/invites/:id            → updated invite
DELETE /api/invites/:id            → removed invite (Art. 17 erasure)
GET    /api/workspace              → last snapshot
PUT    /api/workspace              → replace snapshot (adds syncedAt)
DELETE /api/workspace              → wipe snapshot
Authorization: Bearer $GOGURE_DO_TOKEN (when configured)
```
Storage: pretty-printed JSON under `$DATA_DIR` (atomic temp-file + rename writes). Body limit: 2 MB.

## Testing strategy
`node --test` (zero dependencies):
- `tests/domain.test.js` — validation, mention/stats edge cases, DST-safe date helpers.
- `tests/timer.test.js` — state machine transitions incl. pause/resume and auto-restart semantics.
- `tests/backend.test.js` — validator unit tests plus full HTTP CRUD integration against a temp data dir.
Run: `npm test`. CI mirrors this on every push/PR (`.github/workflows/ci.yml`).
