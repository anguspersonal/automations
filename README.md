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
- `X-Notion-Sprint-Seed: <string>`

### Seed

Provide a deterministic seed value (e.g. `2026-W04`) via the `X-Notion-Sprint-Seed` header.

For backwards compatibility, the endpoint also accepts `{ "seed": "<string>" }` in the JSON body.

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

### Performance smoke check (non-flaky)

This repo includes a lightweight, **non-asserting** latency smoke script that runs the same middleware + handler chain in-process (no HTTP).

Run:

```bash
node scripts/notion-sprint-name-perf.js
```

Optional tuning:

- `PERF_ITERS` (default `200`): iterations per case
- `PERF_WARMUP` (default `25`): warmup iterations (ignored in output)

Example:

```bash
PERF_ITERS=500 PERF_WARMUP=50 node scripts/notion-sprint-name-perf.js
```

## Architecture decisions

- ADR01 (service boundaries): `docs/ADR01-service-boundaries.md`



