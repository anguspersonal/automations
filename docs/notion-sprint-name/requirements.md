## Introduction

This document specifies the requirements for the **Notion Sprint Name** feature in the `automations` service. The system enables Notion database automations to request a **fun, deterministic sprint name** (e.g. `Sprint elegant-mercy`) via an HTTP webhook endpoint and use the returned value inside Notion automation steps. The key goals are **low operational overhead**, **fast responses**, **deterministic/idempotent outputs**, and **simple, secure invocation** from Notion.

## Glossary

- **Notion Webhook Action**: A Notion database automation action that sends an HTTP `POST` request to a configured URL with selected database properties and optional custom headers.
- **Sprint Name**: The human-friendly name for a sprint in Notion, formatted as `Sprint <adjective>-<noun>`.
- **Name Slug**: The hyphenated portion of the sprint name (e.g. `elegant-mercy`) intended to be used as a stable identifier inside the name.
- **Seed**: A stable string provided by Notion to ensure deterministic output (e.g. `2026-01-19` for sprint start date, or an ISO week key like `2026-W04`).
- **Deterministic**: Given the same seed (and generator version), the system returns the same sprint name every time.
- **Idempotent**: Repeated calls for the same seed produce the same outcome (to make retries safe).
- **Integration Secret Header**: A shared secret sent in a request header (e.g. `X-Notion-Automations-Token`) used to authenticate calls from Notion automations.
- **Generator Version**: A version identifier for the name generator (wordlists/algorithm) used to keep outputs stable over time.
- **Request ID**: A unique identifier generated per request (e.g. UUID) returned in successful responses as `request_id` and included in logs for correlating requests end-to-end.

## API Contract (normative)

### Endpoint

- `POST /v1/notion/sprint-name`

### Request

- **Headers**
  - `Content-Type: application/json`
  - `X-Notion-Automations-Token: <shared secret>`
- **Body**

```json
{ "seed": "2026-W04" }
```

### Success Response (200)

```json
{
  "request_id": "4c6d94b5-8897-4b3f-8e20-553e3c3a3b86",
  "name": "Sprint elegant-mercy",
  "slug": "elegant-mercy",
  "generator_version": "1.0.0"
}
```

### Error Response (4xx/5xx)

```json
{ "error": "Human-readable message suitable for logs" }
```

## Requirements

### Requirement 1: Provide sprint name via HTTP webhook endpoint

**User Story:** As a Notion automation builder, I want to call a webhook that returns a fun sprint name, so that weekly sprint creation can be fully automated.

#### Acceptance Criteria

1.1 WHEN a client sends an HTTP `POST` request to `/v1/notion/sprint-name` THEN the `Notion_Sprint_Name_System` SHALL respond with JSON and `Content-Type: application/json`.
1.2 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL respond with HTTP `200` and a response body containing a non-empty `name` string.
1.3 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL format `name` as `Sprint <adjective>-<noun>`.
1.4 WHEN the request body is missing or invalid JSON THEN the `Notion_Sprint_Name_System` SHALL return HTTP `400` with a JSON body containing an `error` string.

### Requirement 2: Authenticate requests from Notion automations

**User Story:** As the owner of the automations service, I want only my Notion automations to call the endpoint, so that public exposure doesn’t allow abuse.

#### Acceptance Criteria

2.1 WHEN a request to `/v1/notion/sprint-name` is missing the `X-Notion-Automations-Token` header THEN the `Notion_Sprint_Name_System` SHALL return HTTP `401`.
2.2 WHEN a request to `/v1/notion/sprint-name` includes an invalid `X-Notion-Automations-Token` header THEN the `Notion_Sprint_Name_System` SHALL return HTTP `401`.
2.3 WHEN the `Notion_Sprint_Name_System` returns HTTP `401` THEN it SHALL return a JSON body containing an `error` string suitable for logging/debugging.

### Requirement 3: Deterministic, idempotent name generation from a seed

**User Story:** As a Notion automation builder, I want the same sprint to always get the same name even if Notion retries the webhook, so that the automation is reliable.

#### Acceptance Criteria

3.1 WHEN a valid request includes a `seed` value in the JSON body THEN the `Notion_Sprint_Name_System` SHALL generate the sprint name deterministically from that `seed`.
3.2 WHEN the same valid request (same `seed` and same generator version) is repeated multiple times THEN the `Notion_Sprint_Name_System` SHALL return the same `name` each time.
3.3 WHEN the request body is missing `seed` THEN the `Notion_Sprint_Name_System` SHALL return HTTP `400` with a JSON body containing an `error` string indicating `seed` is required.
3.4 WHEN `seed` is present but is not a non-empty string (including empty/whitespace-only) THEN the `Notion_Sprint_Name_System` SHALL return HTTP `400` with a JSON body containing an `error` string indicating `seed` must be a non-empty string.

### Requirement 4: Response contract for mapping into Notion properties

**User Story:** As a Notion automation builder, I want a stable response schema, so that I can map fields from the webhook response into Notion properties.

#### Acceptance Criteria

4.1 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL return an HTTP `200` JSON object containing exactly the fields `request_id`, `name`, `slug`, and `generator_version`.
4.2 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL ensure `slug` equals `<adjective>-<noun>` (the portion of `name` after `Sprint `).
4.3 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL include a `generator_version` field in the response.
4.4 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL ensure `generator_version` is a non-empty string.
4.5 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL include `request_id` as a non-empty string.

### Requirement 5: Performance and reliability characteristics for webhook usage

**User Story:** As the owner of the automations service, I want fast and predictable webhook responses, so that Notion automations don’t time out or become flaky.

#### Acceptance Criteria

5.1 WHEN the request is valid THEN the `Notion_Sprint_Name_System` SHALL respond within 500ms under normal operating conditions (excluding network latency and cold starts).
5.2 WHEN the request is invalid (auth or schema) THEN the `Notion_Sprint_Name_System` SHALL respond within 500ms under normal operating conditions (excluding network latency and cold starts).
5.3 WHEN the system encounters an unexpected error THEN the `Notion_Sprint_Name_System` SHALL return HTTP `500` with a JSON body containing an `error` string.

### Requirement 6: “Don’t regret later” operational baseline

**User Story:** As the owner of the automations service, I want consistent operational primitives across endpoints, so that adding future endpoints stays easy and safe.

#### Acceptance Criteria

6.1 WHEN the `Notion_Sprint_Name_System` exposes endpoints THEN it SHALL use versioned routes under `/v1`.
6.2 WHEN additional integration endpoints are added in the service THEN the `Notion_Sprint_Name_System` SHALL group them by integration prefix (e.g. `/v1/notion/*`, `/v1/google/*`, `/v1/supabase/*`).
6.3 WHEN handling requests THEN the `Notion_Sprint_Name_System` SHALL support per-integration secret headers (at minimum defining `X-Notion-Automations-Token` for Notion).
6.4 WHEN handling requests THEN the `Notion_Sprint_Name_System` SHALL emit basic observability signals including request id, endpoint, status, and latency.

## Document Revision Notes

### Key Clarifications Made

1. **Determinism requires an explicit seed**: The webhook must be safe under retries, so `seed` is required (HTTP `400` if missing/empty) to avoid request-time-based randomness.
2. **Stable response schema**: The endpoint returns a small, fixed JSON schema (`request_id`, `name`, `slug`, `generator_version`) to support mapping into Notion properties and correlating logs without requiring the service to call the Notion API.
3. **Cross-document requirement IDs**: Acceptance criteria are numbered as `Requirement.AcceptanceCriteria` (e.g. `3.2`) so `design.md` correctness properties and `tasks.md` requirement references are stable and unambiguous.
4. **Latency scope**: The 500ms target applies to warm requests (excluding cold starts), aligning with real-world serverless/platform behavior.

