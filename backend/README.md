# LHQ Backend

API-only Django backend. No server-rendered business views — everything
outside `/admin/` is JSON over Django REST Framework, meant to be consumed
by the separate frontend app (`../fontend`).

## Stack

- Django + Django REST Framework
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
- `GET /api/schema/` — OpenAPI 3 schema
- `GET /api/docs/` — Swagger UI
- `GET /api/redoc/` — ReDoc
- `/admin/` — Django admin (the one HTML surface in this project)

## Adding an API

New endpoints live in an app's `views.py` (DRF `APIView`/`ViewSet`, not
template views) and get wired up in that app's `urls.py`, then included
under `/api/` in `config/urls.py`. See `core/` for the minimal pattern.

## Tests

```bash
uv run python manage.py test
```
