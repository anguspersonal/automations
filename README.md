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

## First endpoint (planned)

- `POST /v1/notion/sprint-name` → `{ "name": "Sprint elegant-mercy" }`

## Architecture decisions

- ADR01 (service boundaries): `docs/ADR01-service-boundaries.md`



