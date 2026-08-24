# LHQ Backend

API-only Django backend. No server-rendered business views — everything
outside `/admin/` is JSON over Django REST Framework, meant to be consumed
by the separate frontend app (`../fontend`).

## Stack

- Django + Django REST Framework
- `djangorestframework-simplejwt` for auth (JWT access/refresh, no sessions/cookies)
- `django-cors-headers` for cross-origin requests from the frontend dev server
- `drf-spectacular` for OpenAPI schema + docs
- `python-decouple` for env-based settings
- SQLite for local dev, Postgres-ready via env vars (`psycopg2-binary`)

## Setup

```bash
cp .env.example .env
uv run python manage.py migrate
uv run python manage.py createsuperuser   # optional, for /admin/
uv run python manage.py runserver
```

## Endpoints

- `GET /api/health/` — liveness check, no auth required
- `POST /api/auth/login/` — `{email, password}` → `{access, refresh, user}`
- `POST /api/auth/logout/` — `{refresh}`, requires `Authorization: Bearer <access>`, blacklists the refresh token
- `POST /api/auth/token/refresh/` — `{refresh}` → `{access, refresh}` (rotates the refresh token)
- `POST /api/auth/setup-password/` — new-hire password setup, token from the onboarding email
- `GET /api/me/`, `/api/users/` — require `Authorization: Bearer <access>`
- `GET /api/schema/` — OpenAPI 3 schema
- `GET /api/docs/` — Swagger UI
- `GET /api/redoc/` — ReDoc
- `/admin/` — Django admin (the one HTML surface in this project)

## Auth

JWT, not sessions: `POST /api/auth/login/` returns a short-lived access
token (15 min) and a refresh token (7 days). Send the access token as
`Authorization: Bearer <token>` on every request; when it expires, exchange
the refresh token at `/api/auth/token/refresh/` for a new pair (refresh
tokens rotate on every use, and the old one is blacklisted —
`rest_framework_simplejwt.token_blacklist` is in `INSTALLED_APPS` for this).
No cookies, no CSRF token, no `CORS_ALLOW_CREDENTIALS` — bearer tokens
aren't sent automatically by the browser, so cross-origin requests from the
frontend carry no CSRF risk.

## Adding an API

New endpoints live in an app's `views.py` (DRF `APIView`/`ViewSet`, not
template views) and get wired up in that app's `urls.py`, then included
under `/api/` in `config/urls.py`. See `core/` for the minimal pattern.

## Tests

```bash
uv run python manage.py test
```
