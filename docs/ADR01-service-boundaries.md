# ADR01: Service boundaries for personal automations

## Status

Accepted

## Context

We want to support lots of small automations (e.g. Notion database automations calling a webhook to fetch a fun sprint name). Over time there may be dozens/hundreds of tiny endpoints.

The decision to make is whether to:

- run one small service with many endpoints,
- split into multiple services by integration (Notion/Google/Supabase), or
- split by domain (marketing/ops/legal).

## Decision

We will start with **one service**, and **group endpoints by integration inside it** (modules/folders and URL prefixes).

- Example route grouping: `/v1/notion/*`, `/v1/google/*`, `/v1/supabase/*`

We will only split into multiple services when concrete constraints appear (security boundary, reliability boundary, runtime/dependency mismatch, or exposure boundary).

## How to choose boundaries (what actually matters)

### Single service is best when

- **Same trust boundary**: all endpoints are “your” automations; same secret/header auth model.
- **Same ops profile**: all should be fast, simple HTTP, similar uptime expectations.
- **Shared primitives are useful**: request auth, logging, rate limiting, idempotency keys, retry handling, common Notion/Google/Supabase clients.

### Multiple services is best when

- **Different secrets / principals**: e.g. “Notion webhook utility” vs “high-privilege Google admin actions”.
- **Different failure tolerance**: e.g. “name generator” must be 99.99% reliable vs “weekly report” can fail and retry later.
- **Different runtimes/deps**: one wants headless browser / heavy libs; others must stay tiny/low-latency.
- **Different exposure**: some endpoints public (webhooks), others internal-only (cron jobs), or you want separate allowlists.

## “Don’t regret later” baseline

Even as a single service, adopt these from day 1:

- **Versioned endpoints**: `/v1/...`
- **Per-integration secrets** (even within one service): e.g. `X-Notion-Automations-Token`, `X-Google-Automations-Token`
- **Deterministic/idempotent outputs** where retries are possible
- **Basic observability**: request id, endpoint, status, latency

## Consequences

- **Pros**: minimal ops overhead, easy to add new endpoints, shared tooling, single deploy target.
- **Cons**: larger blast radius than fully split services; mitigated via per-integration auth, minimal dependencies, and clear module boundaries.

