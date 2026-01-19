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

**Webhook subscription (updates Notion page):** `POST /v1/notion/webhook`

### Webhook subscription endpoint (`POST /v1/notion/webhook`)

This endpoint is designed for **Notion webhook subscriptions** (e.g. `page.created`). It responds quickly with `200` and then updates the triggering Notion page via the Notion API in the background.

#### Webhook setup (Notion UI)

- In your Notion integration settings, create a webhook subscription pointing to:
  - `POST /v1/notion/webhook`
- Subscribe to at least `page.created`.

#### Seed

Seed is derived from the newly-created page:

- If the page title already contains a seed like `YYYY_WNN`, it will be used.
- Otherwise, the service computes the current ISO week seed (e.g. `2026_W04`) from the webhook timestamp.

#### Success response (200)

```json
{ "ok": true }
```

#### Error responses (4xx/5xx)

For webhook deliveries, the endpoint returns `401` only for invalid signatures (when configured). Other failures are logged and the endpoint still returns `200` to avoid webhook retries.

#### Notion update behavior

The background job computes the sprint title as:

- `Sprint <generated-slug> - <seed>` (e.g. `Sprint elegant-mercy - 2026_W04`)

and writes it to the Notion page title property named by `NOTION_SPRINT_NAME_PROPERTY` (default `Sprint Name`).

### Environment variables

- `NOTION_API_TOKEN` (required for async): Notion API token used to update pages in the background
- `NOTION_VERSION` (optional, default `2022-06-28`): Notion API version header
- `NOTION_SPRINT_NAME_PROPERTY` (optional, default `Sprint Name`): the Notion title property to write the sprint title into
- `NOTION_SPRINT_SLUG_PROPERTY` (optional): if set, also writes the slug into this property (rich_text)
- `NOTION_SPRINT_GENERATOR_VERSION_PROPERTY` (optional): if set, also writes the generator version into this property (rich_text)
- `NOTION_WEBHOOK_VERIFICATION_TOKEN` (recommended): used to validate `X-Notion-Signature`
- `NOTION_SPRINTS_DATABASE_ID` (recommended): only process webhook events for this database id
- `NOTION_SPRINTS_DATA_SOURCE_ID` (optional): alternative filter for newer Notion data sources
- `NOTION_SPRINT_SEED_PROPERTY` (optional): if set, read the seed from this page property name
- `GENERATOR_VERSION` (optional, default `"1.0.0"`): version identifier for deterministic name generation

## Architecture decisions

- ADR01 (service boundaries): `docs/ADR01-service-boundaries.md`
 - ADR02 (Notion sprint naming via webhooks): `docs/ADR02-notion-sprint-name-webhooks.md`



