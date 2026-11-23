# Focus Dashboard

A small single-user dashboard for tracking how much of your study time is actually focused.

Log a study block (when you started and stopped), then note which courses you worked on and roughly how many minutes each. The dashboard turns that into a daily focus ratio (focused minutes ÷ time at the desk), per-course focus, and trends over weeks and months.

## Features

- **Low-effort logging.** Tap "Start" when you sit down and "Stop" when you're done, then tap the courses you studied and adjust minutes in 15-minute steps. Energy, interruptions and notes are optional.
- **Focus ratio.** Time-weighted: Σ focused minutes ÷ Σ block span. Blocks that cross midnight are handled.
- **Per-course focus.** A block that mixes courses is apportioned to them by their minutes, so each course gets its own ratio and trend.
- **Charts.** Daily ratio with a 7-day rolling line and least-squares trend, a calendar heatmap, weekly time per course, and patterns by time of day, weekday, session length, energy and interruptions.
- **Your data stays yours.** SQLite on your own server, JSON export and import, and one password.

## Stack

- **Server:** Node 24 (native TypeScript, no build step), [Hono](https://hono.dev), `node:sqlite`.
- **Web:** Vite, React 19, TypeScript, ECharts.

## Development

```sh
pnpm install
pnpm -C web install

# API on :3100 with a throwaway database
APP_PASSWORD=devpassword COOKIE_SECURE=false DATA_DIR=/tmp/focus-dev PORT=3100 node server/index.ts

# Optional: about 60 days of sample data
node scripts/seed.ts http://localhost:3100 devpassword

# Web on :5173, proxying /api to :3100
pnpm -C web dev
```

Tests and type checks:

```sh
pnpm test && pnpm typecheck
pnpm -C web test && pnpm -C web typecheck
```

## Configuration

| Variable        | Default     | Meaning                                                       |
| --------------- | ----------- | ------------------------------------------------------------- |
| `APP_PASSWORD`  | (required)  | Login password, at least 8 characters. Changing it signs out every device. |
| `DATA_DIR`      | `./data`    | Where `focus.db` lives.                                       |
| `COOKIE_SECURE` | `true`      | Set to `false` only for plain-HTTP local development.         |
| `STATIC_DIR`    | (none)      | Built web app to serve; the Docker image sets it.             |
| `READ_TOKEN`    | (none)      | Optional bearer token, at least 32 characters, for life-os. It opens only `GET /api/lifeos/sessions`; any other request with it gets `403`. life-os keeps the same value as `FOCUS_READ_TOKEN`. |
| `LIFEOS_URL`    | (none)      | Base URL of life-os, `http://life-os:8080` on the shared network; Focus fetches `<LIFEOS_URL>/api/pick-list` for the task pick list. |
| `LIFEOS_TOKEN`  | (none)      | Bearer token Focus sends to life-os: the value of life-os's `LIFEOS_PICKLIST_TOKEN`. Without it or `LIFEOS_URL` the pick list is unavailable. |
| `PORT`, `HOST`  | `3000`, `0.0.0.0` | Listen address.                                         |

An empty value counts as unset. With life-os unset or unreachable, Focus works as before: names are typed by hand.

## Deployment

`deploy/deploy.sh` builds the Docker image and starts it with Docker Compose on `127.0.0.1:11120`. On first run it creates `deploy/.env` with a random `APP_PASSWORD`. The database is kept in the `focus-data` volume. Put a TLS-terminating reverse proxy in front of it.

```sh
./deploy/deploy.sh
```

### With life-os

The two stacks share the external Docker network `life-os-focus`; `deploy/deploy.sh` creates it when it is missing. On it, Focus answers as `focus` (port 3000) and life-os as `life-os` (port 8080). Add to `deploy/.env`:

```sh
LIFEOS_URL=http://life-os:8080
LIFEOS_TOKEN=<the value of life-os's LIFEOS_PICKLIST_TOKEN>
READ_TOKEN=<openssl rand -hex 32>
```

Give the same `READ_TOKEN` value to life-os as `FOCUS_READ_TOKEN`. life-os then reads `GET http://focus:3000/api/lifeos/sessions` with it: every study block as rows of `{taskId, title, subject, minutes}` and the block in progress (see focus-dashboard issue 2).
