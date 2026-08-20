# LHQ Learning Hub — frontend

React 19 + Vite SPA for LHQ's internal staff system. Talks to the Django/DRF
backend in `../backend/` over JWT-authenticated JSON. See
[`BACKEND_API_BRIEF.md`](./BACKEND_API_BRIEF.md) for the full API contract
this app implements.

## Stack

- Vite + React 19, plain JS (no TypeScript)
- `react-router` for routing
- Plain `fetch`, wrapped in [`src/lib/apiClient.js`](./src/lib/apiClient.js)
  (no axios) — attaches the JWT, retries once on `401` after a token refresh
- React context for auth state ([`src/auth/`](./src/auth))
- No component/state library beyond React itself

## Setup

```sh
npm install
cp .env.example .env   # optional — defaults already point at 127.0.0.1:8000/api
```

Run the backend (`../backend/`) first — see its README — then:

```sh
npm run dev
```

The dev server runs on `http://localhost:5173`, matching the backend's
default `CORS_ALLOWED_ORIGINS`.

## Scripts

| Command | Does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | ESLint |
| `npm test` | Run the test suite once (Vitest + Testing Library) |
| `npm run test:watch` | Test suite in watch mode |

## App structure

```
src/
  auth/           AuthProvider, useAuth, and the role-permission matrices
  components/      Shared UI: NavBar, ProtectedRoute, UserEditForm, ...
  lib/             apiClient (fetch wrapper), api.js (endpoint calls), tokenStorage
  pages/           Route-level pages (Login, UsersList, CreateUser, ...)
```

`src/auth/permissions.js` is a pure, framework-free mirror of the backend's
`can_create_role` / `has_staff_scope_over` matrices
(`../backend/accounts/permissions.py`) — it decides which roles a user can
assign and which fields they can edit on a given account. It has one
deliberate deviation from the backend, documented inline: the backend would
technically let an Owner/SYS_ADMIN PATCH their own `role`/`is_active` (their
staff scope covers "anyone," self included), but the UI never exposes that —
role and active-status changes only ever appear on an admin-facing edit form
for *someone else's* account, never on "my profile." See the comment on
`editableFields` for why.

## Testing

`npm test` runs:

- `src/auth/permissions.test.js` — exhaustive coverage of the role/edit
  matrices against the backend's actual values.
- `src/lib/apiClient.test.js` — the 401 → refresh → retry-once flow,
  refresh-failure handling, and single-flight refresh deduplication.
- Component tests for the permission-gating UI (`ProtectedRoute`,
  `CreateUserPage`'s role dropdown, `UserEditForm`'s field visibility).

Note: `npm test` sets `NODE_OPTIONS=--no-experimental-webstorage` — Node
22+'s own experimental global `localStorage` can otherwise shadow jsdom's
implementation in tests. See the comment in `vite.config.js`.

## Known gaps (by design, not oversight)

Per the API brief: no self-registration, no email sending (so
`setup-password` is reachable but has no real onboarding flow pointing at
it yet), no Subjects UI (no backend endpoint for it), no full-object `PUT`
on users (`PATCH` only).
