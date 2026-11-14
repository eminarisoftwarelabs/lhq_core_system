# LHQ Learning Hub

Internal ops system for LHQ Learning Hub (Lilongwe). Built by Eminari Software Labs for the client, Wanangwa.

## Repo layout

- `backend/` Django 6 + Django REST Framework, JSON only, JWT auth (simplejwt), Postgres. Managed with `uv`.
- `fontend/` React 19 + Vite SPA, plain JS (no TypeScript). The folder name is spelled `fontend`; do not rename it.
- `fontend/BACKEND_API_BRIEF.md` is the API contract the frontend implements. Keep it in sync when endpoints change.

## Branches

- `main` is the live holiday-timetable system. Do not commit to it.
- `v2-develop` is the new term-time, tutor-led version. Never commit to it directly.
- One branch per task, named `task-<n>-<short-name>` (e.g. `task-0-restyle`). Workflow:
  1. `git checkout v2-develop && git pull`
  2. `git checkout -b task-<n>-<short-name>`
  3. Build, run tests and build, commit.
  4. `git push -u origin <branch>` then `gh pr create --base v2-develop` with a summary and how to test. If `gh` is not available, push and tell Eddie to open the PR on GitHub.
  5. Stop. Eddie reviews the diff and merges. Do not merge PRs yourself.
- Tag `v1-holiday-system` marks the old build.
- Staging: backend host not decided yet. Develop and test locally.

## Commands

Backend (from `backend/`):
```
uv run python manage.py migrate
uv run python manage.py runserver
uv run python manage.py test
```

Frontend (from `fontend/`):
```
npm install
npm run dev     # http://localhost:5173
npm test        # vitest
npm run lint
npm run build
```

Run the relevant tests and the build before saying a task is done.

## Conventions

- Roles: TUTOR, ADMIN, OWNER, SYS_ADMIN on a single `User` model. Permission classes live in `accounts/permissions.py`.
- Django apps: accounts, academics, clients, enquiries, enrollments, billing, assessments, overview, core, plus `onboarding` from Task 4. New domain logic goes in the app it belongs to, with business rules in `services.py`, not views.
- Money is in MWK. Balances and overdue flags are computed, not stored.
- Frontend: plain `fetch` through `src/lib/apiClient.js`. No new state or UI libraries without asking.
- Styling: all colors, spacing and radii come from tokens in `fontend/src/index.css` (`:root`, plus dark overrides). Never hardcode a color in a component. The `src/styles/*.test.js` files check contrast and responsiveness; keep them passing.
- Every new page or component gets a `.test.jsx` next to it, like the existing ones.
- Migrations: one migration per change, named meaningfully. Never edit an applied migration.

## Design source of truth

`docs/v2/README.md` holds the plan, the decisions and the model map. Each task is a self-contained brief in `docs/v2/task-<n>-<name>.md`. Build only what the brief covers. If something in a brief is unclear or conflicts with the code, stop and ask rather than guess.
