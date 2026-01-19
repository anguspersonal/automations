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

### Endpoints

- **Normative (async, updates Notion page):** `POST /v1/notion/sprint-name/async`
- **Legacy (sync, returns generated values):** `POST /v1/notion/sprint-name`

### Normative async endpoint (`POST /v1/notion/sprint-name/async`)

This endpoint is designed for Notion Automations where the webhook response body is not used for downstream mapping. It responds quickly with `202` and then updates the triggering Notion page via the Notion API.

#### Required headers

- `Content-Type: application/json`
- `X-Notion-Automations-Token: <shared secret>`
- `X-Notion-Sprint-Seed: YYYY_WNN` (e.g. `2026_W04`)
- `X-Notion-Page-Id: <notion page id>`

#### Seed

Provide a deterministic seed value in the fixed format `YYYY_WNN` (e.g. `2026_W04`) via the `X-Notion-Sprint-Seed` header.

For backwards compatibility, the endpoint also accepts `seed` and/or `page_id` in the JSON body. **Headers take precedence** when present.

#### Success response (202)

```json
{ "request_id": "4c6d94b5-8897-4b3f-8e20-553e3c3a3b86" }
```

#### Error responses (4xx/5xx)

All errors return JSON with this shape:

```json
{ "error": "Human-readable message suitable for logs" }
```

Common statuses:

- `400` for missing/invalid `seed` or `page_id`
- `401` for missing/invalid `X-Notion-Automations-Token`
- `429` when the async job queue is full

#### Notion update behavior

The background job computes the sprint title as:

- `Sprint <generated-slug> - <seed>` (e.g. `Sprint elegant-mercy - 2026_W04`)

and writes it to the Notion page title property named by `NOTION_SPRINT_NAME_PROPERTY` (default `Sprint Name`).

### Legacy synchronous endpoint (`POST /v1/notion/sprint-name`)

This endpoint is kept for compatibility. It returns generated values in the response body and does **not** update Notion pages via the Notion API.

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
- `NOTION_API_TOKEN` (required for async): Notion API token used to update pages in the background
- `NOTION_VERSION` (optional, default `2022-06-28`): Notion API version header
- `NOTION_SPRINT_NAME_PROPERTY` (optional, default `Sprint Name`): the Notion title property to write the sprint title into
- `NOTION_SPRINT_SLUG_PROPERTY` (optional): if set, also writes the slug into this property (rich_text)
- `NOTION_SPRINT_GENERATOR_VERSION_PROPERTY` (optional): if set, also writes the generator version into this property (rich_text)
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



