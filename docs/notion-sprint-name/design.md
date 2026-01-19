# Design Document: Notion Sprint Name (Async Notion Page Update)

## Overview

This design document specifies the implementation of the **Notion Sprint Name** feature for the `automations` service. The system exposes a webhook endpoint intended to be called from a Notion Automation “Webhook Action”, then asynchronously updates the triggering Notion page via the Notion API with a deterministic sprint title.

The design optimizes for **fast webhook responses** (Notion automation steps should not time out) by responding immediately with HTTP `202` and a minimal JSON body. All expensive work (name generation + Notion API call) happens after the webhook returns. Determinism is driven by a Notion-provided `seed` in the fixed format `YYYY_WNN`, ensuring idempotent results across retries and re-runs.

This design aligns with `docs/notion-sprint-name/requirements.md` and uses versioned routes under `/v1/notion/*`, header-based authentication, and a bounded in-memory background queue to provide basic operational safety (returning `429` when the server is busy).

## Architecture

```mermaid
flowchart TB
    subgraph "External"
        Notion[Notion Automation<br/>Webhook Action]
        NotionAPI[Notion API<br/>PATCH /v1/pages/{page_id}]
    end

    subgraph "Express Application"
        Router[Express Router<br/>/v1/notion/*]
        LogMW[Logging Middleware<br/>request_id + latency]
        AuthMW[Auth Middleware<br/>X-Notion-Automations-Token]
        PageIdMW[Page ID Validation<br/>X-Notion-Page-Id]
        SeedMW[Seed Validation<br/>X-Notion-Sprint-Seed]
        AsyncHandler[Async Handler<br/>POST /sprint-name/async]
    end

    subgraph "Background Processing"
        Queue[In-memory job queue<br/>bounded pending]
        Generator[Name generator<br/>deterministic from seed]
        NotionClient[Notion client<br/>PATCH page properties]
    end

    Notion -->|POST /v1/notion/sprint-name/async<br/>Headers: token, seed, page id| Router
    Router --> LogMW --> AuthMW --> PageIdMW --> SeedMW --> AsyncHandler

    AsyncHandler -->|enqueue| Queue
    AsyncHandler -->|202 {request_id}| Notion

    Queue -->|setImmediate job| Generator --> NotionClient --> NotionAPI
```

## Components and Interfaces

### Endpoints

| Endpoint | File | Purpose |
|----------|------|---------|
| `POST /v1/notion/sprint-name/async` | `routes/v1/notion/sprint-name-async.js` | **Normative**: accepts webhook, enqueues background update, responds `202` |
| `POST /v1/notion/sprint-name` | `routes/v1/notion/sprint-name.js` | **Legacy/compat**: synchronous generator response (not required by current requirements) |

### Request Contract (normative)

- **Headers**
  - `X-Notion-Automations-Token`: shared secret token
  - `X-Notion-Sprint-Seed`: `YYYY_WNN` (e.g. `2026_W04`)
  - `X-Notion-Page-Id`: Notion page id (opaque string)
- **Body**
  - Optional. The system MAY accept `seed` and/or `page_id` in a JSON body as a compatibility fallback. Headers are normative.

### Response Contract (normative)

- **Success (202)**: JSON with `Content-Type: application/json`

```json
{ "request_id": "4c6d94b5-8897-4b3f-8e20-553e3c3a3b86" }
```

- **Errors**
  - `401` `{ "error": string }` for missing/invalid auth token
  - `400` `{ "error": string }` for missing/invalid `seed` or `page_id`
  - `429` `{ "error": string }` when the background queue is full
  - `500` `{ "error": string }` for unexpected server failures

### Authentication Middleware

| Component | File | Purpose |
|----------|------|---------|
| `createNotionAuthMiddleware()` | `routes/v1/notion/middleware.js` | Enforces `X-Notion-Automations-Token` |

**Behavior**:
- Reads `X-Notion-Automations-Token` (case-insensitive header lookup)
- Returns `401` with `{ error }` if missing or invalid

### Seed and Page ID Validation Middleware

| Component | File | Purpose |
|----------|------|---------|
| `validateSprintNameRequest()` | `routes/v1/notion/middleware.js` | Normalizes seed into `req.body.seed` |
| `validateNotionPageId()` | `routes/v1/notion/middleware.js` | Extracts page id and sets `req.notionPageId` |

**Seed validation (normative)**:
- Must exist and be a string
- Must match `^\d{4}_W\d{2}$`

**Page id extraction (compat)**:
- Prefer `X-Notion-Page-Id`
- Fallback to `body.page_id` and MAY support legacy shapes (e.g. `pageId`, `id`, `page.id`) for compatibility
- Header precedence is normative: if the header is present it MUST be used, even if the body contains a different value

### Background Job Queue

| Component | File | Purpose |
|----------|------|---------|
| `enqueueJob()` | `lib/async-jobs.js` | Bounded “fire-and-forget” in-memory queue |

**Behavior**:
- Maintains a global queue counter (`pending`) and a `maxPending` (default `50`, configurable via `ASYNC_MAX_PENDING`)
- Rejects enqueue when full and returns `429` at the handler
- Runs the job with `setImmediate` and logs errors best-effort (Notion does not observe them)

### Notion API Client

| Component | File | Purpose |
|----------|------|---------|
| `updateNotionPage()` | `lib/notion-api.js` | Performs `PATCH https://api.notion.com/v1/pages/{page_id}` |

**Normative Notion update**:
- The system SHALL set the page’s title property named `Sprint Name` to the sprint title string.
- Sprint Title format: `Sprint <generated-slug> - <seed>`

**Implementation note**:
- Notion “title” properties require a `title` payload (not `rich_text`). If `Sprint Name` is truly the database title property, the request body must use the `title` property shape.
- The Notion request MUST include `Authorization: Bearer <NOTION_API_TOKEN>` and `Notion-Version: <NOTION_VERSION>` headers.

### Name Generator

| Component | File | Purpose |
|----------|------|---------|
| `getNameGenerator()` | `lib/name-generator.js` | Deterministically maps seed+version to a `<adjective>-<noun>` slug |

## Data Models

### No persistent storage

This feature is stateless. Determinism and idempotency are achieved via:
- The input seed (`YYYY_WNN`)
- The generator version (`GENERATOR_VERSION`)
- Pure name generation
- A deterministic target update (writing the same sprint title for the same `seed` and `page_id`)

### Configuration

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NOTION_AUTOMATIONS_TOKEN` | Yes | - | Auth token for incoming webhooks |
| `NOTION_API_TOKEN` | Yes (async endpoint) | - | Notion API token used for background updates |
| `NOTION_VERSION` | No | `2022-06-28` | Notion API version header |
| `NOTION_SPRINT_NAME_PROPERTY` | No | `Sprint Name` | Target property to write the sprint title to |
| `NOTION_SPRINT_SLUG_PROPERTY` | No | `""` | Optional: extra property to write slug into |
| `NOTION_SPRINT_GENERATOR_VERSION_PROPERTY` | No | `""` | Optional: extra property to write generator version into |
| `GENERATOR_VERSION` | No | `1.0.0` | Name generator version (stability knob) |
| `ASYNC_MAX_PENDING` | No | `50` | Max queued jobs before returning `429` |

## Implementation Details

### Route wiring

`routes/v1/notion/index.js` mounts:
- `POST /sprint-name/async` with middleware ordering: logging → auth → page-id validation → seed validation → handler

### Async handler behavior

`routes/v1/notion/sprint-name-async.js`:
- Computes `request_id`
- Enqueues the Notion update job
- Returns:
  - `202 { request_id }` if accepted
  - `429 { error }` if queue is full

### Notion update payload (normative example)

If the configured property is the database title property, the Notion API `properties` payload should look like:

```json
{
  "properties": {
    "Sprint Name": {
      "title": [{ "text": { "content": "Sprint elegant-mercy - 2026_W04" } }]
    }
  }
}
```

If `NOTION_SPRINT_SLUG_PROPERTY` or `NOTION_SPRINT_GENERATOR_VERSION_PROPERTY` are configured, the system MAY also write those values (as rich_text) to separate properties.

## Correctness Properties

### Property 1: Authentication enforcement

*For any* request to `POST /v1/notion/sprint-name/async` missing `X-Notion-Automations-Token` or containing an invalid token, the `Notion_Sprint_Name_System` SHALL return HTTP `401` with JSON `{ error: string }`.

**Validates: Requirements 2.1, 2.2**

### Property 2: Seed presence + format validation

*For any* request where the seed is missing, not a string, or does not match `^\d{4}_W\d{2}$`, the `Notion_Sprint_Name_System` SHALL return HTTP `400` with JSON `{ error: string }` indicating the required format is `YYYY_WNN`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 3: Page id required

*For any* request where the page id is missing, the `Notion_Sprint_Name_System` SHALL return HTTP `400` with JSON `{ error: string }` indicating `page_id` is required.

**Validates: Requirements 4.1, 4.2**

### Property 3a: Header precedence over body (seed + page id)

*For any* request that includes `X-Notion-Sprint-Seed` and/or `X-Notion-Page-Id`, the `Notion_Sprint_Name_System` SHALL use the header value(s) even if the request body contains different `seed` and/or `page_id` values.

**Validates: Requirements 3.1, 4.1**

### Property 4: Fast accept response

*For any* valid request, the `Notion_Sprint_Name_System` SHALL respond with HTTP `202`, `Content-Type: application/json`, and a non-empty `request_id` string, within 500ms under normal operating conditions (excluding network latency and cold starts).

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 5: Queue capacity protection

*For any* valid request received when the background job queue is at capacity, the `Notion_Sprint_Name_System` SHALL return HTTP `429` with JSON `{ error: string }`.

**Validates: Requirements 6.5**

### Property 6: Deterministic/idempotent Notion updates

*For any* accepted request with a given `seed` and `page_id`, the `Notion_Sprint_Name_System` SHALL compute `generated-slug` deterministically from `seed` and SHALL write the Sprint Title exactly as `Sprint <generated-slug> - <seed>` to the configured Notion property (default `Sprint Name`); repeated requests with the same `seed` and `page_id` SHALL write the same title.

**Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

### Property 7: Notion failure does not affect webhook response

*For any* accepted request, if the Notion API update fails during background execution, the `Notion_Sprint_Name_System` SHALL log an error including `request_id` and `page_id` (best-effort) and SHALL NOT block the webhook response.

**Validates: Requirements 5.6**

## Error Handling

### Authentication / Input validation / Capacity

| Error Scenario | User-Facing Behavior | Recovery Action |
|----------------|---------------------|-----------------|
| Missing/invalid `X-Notion-Automations-Token` | `401` `{ error }` | Fix token configuration in Notion automation |
| Missing/invalid `X-Notion-Sprint-Seed` | `400` `{ error }` | Provide a valid `YYYY_WNN` seed |
| Missing `X-Notion-Page-Id` | `400` `{ error }` | Provide the triggering page id |
| Queue full | `429` `{ error }` | Retry later (Notion may retry automatically) |

### Background Notion update failures

| Error Scenario | User-Facing Behavior | Recovery Action |
|----------------|---------------------|-----------------|
| Notion API request fails (4xx/5xx) | Webhook still returns `202`; error only appears in logs | Fix Notion token/permissions, property configuration, or page id; re-run automation |
| Missing `NOTION_API_TOKEN` | Webhook may return `500` (if required env access throws during enqueue) | Set `NOTION_API_TOKEN` for async endpoint |

## Testing Strategy

### Unit testing

- **Middleware**
  - Auth: missing/invalid token → `401`
  - Seed: missing/non-string/whitespace → `400`
  - Seed format: does not match `^\d{4}_W\d{2}$` → `400`
  - Page id: missing → `400`; header + supported body shapes → extracted
- **Async handler**
  - Valid request → `202` and `{ request_id }`
  - Queue full → `429`
- **Queue**
  - Enqueue increments/decrements `pending`
  - Errors in jobs are caught and logged (do not crash process)
- **Notion client**
  - Builds correct request (method, URL, headers)
  - Emits meaningful errors for non-2xx statuses (for logging)

### Property-based testing

Use `fast-check` to validate invariants:
- Determinism: for any valid seed string in `YYYY_WNN` format, generator returns stable slug for a fixed `GENERATOR_VERSION`.
- Validation: for any invalid seeds (wrong format), middleware returns `400` with `{ error: string }`.

### Performance validation

The 500ms webhook-response target should be validated with:
- A small non-flaky smoke test (few requests, basic timing), and
- Production observability (latency logs/metrics),
rather than strict CI thresholds.

## Document Revision Notes

### Key changes from the previous design

1. **Async-first flow**: The normative endpoint is now `POST /v1/notion/sprint-name/async` returning `202` quickly, with the Notion page update done asynchronously.
2. **Header-based contract**: Inputs are specified as headers (`X-Notion-Sprint-Seed`, `X-Notion-Page-Id`) with optional body fallback for compatibility.
3. **Notion API update is required**: The system updates the triggering page via `PATCH /v1/pages/{page_id}`; the webhook response is not used for Notion property mapping.
4. **Operational safety**: A bounded queue protects the service and returns `429` when saturated.
