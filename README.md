# automations

A minimal Node.js web application with  lightweight HTTP service intended to support small personal automations (e.g. Notion database automations calling a webhook to fetch a fun sprint name).

# nodejs

![static-site](public/images/static-site.png)

For a step-by-step guide to deploying on [Railway](https://railway.app/?referralCode=alphasec), see [this](https://alphasec.io/how-to-deploy-a-nodejs-app-on-railway/) post, or click the button below.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template/Abo1zu?referralCode=alphasec)



## Intended shape

- One deploy (Railway) with many endpoints.
- Endpoints grouped by integration (e.g. `/v1/notion/*`, `/v1/google/*`).
- Simple header-based auth per integration.
- Fast, deterministic responses (idempotent) to handle retries.

## Notion: Sprint name webhook

### Endpoint

- `POST /v1/notion/sprint-name`

### Required headers

- `Content-Type: application/json`
- `X-Notion-Automations-Token: <shared secret>`

### Request body

```json
{ "seed": "2026-W04" }
```

### Success response (200)

```json
{
  "request_id": "4c6d94b5-8897-4b3f-8e20-553e3c3a3b86",
  "name": "Sprint elegant-mercy",
  "slug": "elegant-mercy",
  "generator_version": "1.0.0"
}
```

### Error responses (4xx/5xx)

All errors return JSON with this shape:

```json
{ "error": "Human-readable message suitable for logs" }
```

### Environment variables

- `NOTION_AUTOMATIONS_TOKEN` (required): shared secret for `X-Notion-Automations-Token`
- `GENERATOR_VERSION` (optional, default `"1.0.0"`): version identifier for deterministic name generation

## Architecture decisions

- ADR01 (service boundaries): `docs/ADR01-service-boundaries.md`



