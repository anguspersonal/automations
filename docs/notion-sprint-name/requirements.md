# Requirements: Notion Sprint Name (Async Notion Page Update)

## Introduction

This document specifies the requirements for the **Notion Sprint Name** feature in the `automations` service. The system enables Notion automations to trigger sprint-name generation via an HTTP webhook and then have the service **update the triggering Notion page via the Notion API**.

Key goals:

- **Fast webhook response** (Notion should not time out): respond immediately with `202` when accepted; otherwise fail fast with an appropriate `4xx/5xx`.
- **Deterministic/idempotent outputs** driven by a Notion-provided `seed`.
- **Asynchronous processing**: heavy work happens after the webhook returns.
- **Simple invocation** from Notion (use headers rather than requiring a complex body).

## Glossary

- **Notion Webhook Action**: A Notion automation action that sends an HTTP `POST` request to a configured URL with optional custom headers and optional body data.
- **Seed**: A deterministic key provided by Notion, formatted as `YYYY_WNN` where `YYYY` is the year and `NN` is a two-digit week number (e.g. `2026_W04`).
- **Generated Slug**: The deterministic `<adjective>-<noun>` value produced by the generator (e.g. `elegant-mercy`).
- **Sprint Title**: The final title string written into Notion: `Sprint <generated-slug> - YYYY_WNN`.
- **Title Property**: The Notion “title” property for a database. In this system, the title property defaults to **`Sprint Name`** (configurable via `NOTION_SPRINT_NAME_PROPERTY`).
- **Integration Secret Header**: A shared secret header `X-Notion-Automations-Token` used to authenticate webhook calls from Notion.
- **Request ID**: A unique identifier generated per request used for correlation in logs and returned in minimal `2xx` responses.

## API Contract (normative)

### Endpoint

- `POST /v1/notion/sprint-name/async`

### Request

- **Headers**
  - `X-Notion-Automations-Token: <shared secret>`
  - `X-Notion-Sprint-Seed: YYYY_WNN`
  - `X-Notion-Page-Id: <notion page id>`
- **Body**
  - Optional. The system MAY accept a JSON object containing `seed` and/or `page_id` as a compatibility fallback, but headers are normative (preferred and take precedence when present).
  - If compatibility fallback parsing is implemented, it MAY also support legacy shapes (e.g. `pageId`, `id`, or nested `page.id`) so long as header precedence is preserved.

### Success Response (202)

The Notion platform does not consume the webhook response body for downstream mapping. The system SHALL respond quickly with `202` to indicate “accepted”.

```json
{ "request_id": "4c6d94b5-8897-4b3f-8e20-553e3c3a3b86" }
```

### Error Response (4xx/5xx)

```json
{ "error": "Human-readable message suitable for logs" }
```

## Notion API Contract (normative)

The system SHALL update the triggering page using Notion’s `PATCH /v1/pages/{page_id}` endpoint and set the title property named by `NOTION_SPRINT_NAME_PROPERTY` (default: `Sprint Name`) to the computed Sprint Title string.

## Requirements

### Requirement 1: Accept Notion webhook and respond immediately

**User Story:** As a Notion automation builder, I want the webhook step to complete quickly, so that Notion marks the step successful and the automation doesn’t time out.

#### Acceptance Criteria

1.1 WHEN a client sends an HTTP `POST` request to `/v1/notion/sprint-name/async` THEN the `Notion_Sprint_Name_System` SHALL respond with JSON and `Content-Type: application/json` for both success and error responses.
1.2 WHEN the request includes valid authentication and inputs and background work is accepted THEN the `Notion_Sprint_Name_System` SHALL respond with HTTP `202` within 500ms under normal operating conditions (excluding network latency and cold starts).
1.3 WHEN the request is accepted THEN the `Notion_Sprint_Name_System` SHALL return a JSON body containing a non-empty `request_id` string.

### Requirement 2: Authenticate requests from Notion automations

**User Story:** As the owner of the automations service, I want only my Notion automations to call the endpoint, so that public exposure doesn’t allow abuse.

#### Acceptance Criteria

2.1 WHEN a request to `/v1/notion/sprint-name/async` is missing the `X-Notion-Automations-Token` header THEN the `Notion_Sprint_Name_System` SHALL return HTTP `401` with a JSON `{ "error": string }` body.
2.2 WHEN a request to `/v1/notion/sprint-name/async` includes an invalid `X-Notion-Automations-Token` header THEN the `Notion_Sprint_Name_System` SHALL return HTTP `401` with a JSON `{ "error": string }` body.

### Requirement 3: Validate and normalize the seed (`YYYY_WNN`)

**User Story:** As a Notion automation builder, I want sprint naming to be deterministic by week, so that retries and re-runs produce the same sprint title.

#### Acceptance Criteria

3.1 WHEN a request is received THEN the `Notion_Sprint_Name_System` SHALL read the seed from the `X-Notion-Sprint-Seed` header when present; otherwise it MAY read `seed` from a JSON body as a compatibility fallback.
3.2 WHEN the seed is missing THEN the `Notion_Sprint_Name_System` SHALL return HTTP `400` with a JSON `{ "error": string }` body indicating `seed` is required.
3.3 WHEN the seed is present THEN the `Notion_Sprint_Name_System` SHALL validate it matches the format `^\d{4}_W\d{2}$`.
3.4 WHEN the seed fails validation THEN the `Notion_Sprint_Name_System` SHALL return HTTP `400` with a JSON `{ "error": string }` body indicating the required format is `YYYY_WNN`.
3.5 WHEN the seed is valid THEN the `Notion_Sprint_Name_System` SHALL use it as the deterministic input to the name generator.

### Requirement 4: Identify the triggering Notion page to update

**User Story:** As a Notion automation builder, I want the service to update the page that triggered the webhook, so that the generated sprint title appears in my database.

#### Acceptance Criteria

4.1 WHEN a request is received THEN the `Notion_Sprint_Name_System` SHALL read the target page id from the `X-Notion-Page-Id` header when present; otherwise it MAY read `page_id` from a JSON body as a compatibility fallback.
4.2 WHEN the page id is missing THEN the `Notion_Sprint_Name_System` SHALL return HTTP `400` with a JSON `{ "error": string }` body indicating `page_id` is required.
4.3 WHEN the page id is present THEN the `Notion_Sprint_Name_System` SHALL treat it as an opaque string identifier and pass it to the Notion API update call.

### Requirement 5: Update Notion page title via Notion API (async)

**User Story:** As a Notion automation user, I want the sprint page title to be updated automatically, so that I can see the generated sprint name inside Notion.

#### Acceptance Criteria

5.1 WHEN a request is accepted THEN the `Notion_Sprint_Name_System` SHALL enqueue background work that performs the Notion page update after sending the `202` response.
5.2 WHEN background work runs THEN the `Notion_Sprint_Name_System` SHALL compute `generated-slug` deterministically from `seed`.
5.3 WHEN background work runs THEN the `Notion_Sprint_Name_System` SHALL compute Sprint Title exactly as `Sprint <generated-slug> - <seed>`.
5.4 WHEN background work updates Notion THEN the `Notion_Sprint_Name_System` SHALL set the Notion page title property named by `NOTION_SPRINT_NAME_PROPERTY` (default: `Sprint Name`) to the Sprint Title string.
5.5 WHEN the same request (same `page_id` and same `seed`) is received multiple times THEN the `Notion_Sprint_Name_System` SHALL write the same Sprint Title each time (idempotent update).
5.6 WHEN the Notion API update fails THEN the `Notion_Sprint_Name_System` SHALL log an error including the `request_id` and `page_id` (best-effort), and it SHALL NOT block the webhook response.

### Requirement 6: Configuration and operational safety

**User Story:** As the owner of the automations service, I want clear configuration boundaries and basic operational safety, so that the integration is maintainable and secure.

#### Acceptance Criteria

6.1 WHEN the service starts THEN the `Notion_Sprint_Name_System` SHALL require `NOTION_AUTOMATIONS_TOKEN` to be set.
6.2 WHEN the async endpoint is used THEN the `Notion_Sprint_Name_System` SHALL require a Notion API token (`NOTION_API_TOKEN`) to be set for background updates.
6.3 WHEN updating Notion THEN the `Notion_Sprint_Name_System` SHALL use a configurable Notion API version header (`NOTION_VERSION`) with a safe default.
6.4 WHEN updating Notion THEN the `Notion_Sprint_Name_System` SHALL allow configuring the title property name via `NOTION_SPRINT_NAME_PROPERTY` with a default of `Sprint Name`.
6.5 WHEN the background job queue is at capacity THEN the `Notion_Sprint_Name_System` SHALL return HTTP `429` with a JSON `{ "error": string }` body.
6.6 WHEN handling requests THEN the `Notion_Sprint_Name_System` SHALL emit basic observability signals including request id, endpoint, status, and latency.
6.7 WHEN handling requests THEN the `Notion_Sprint_Name_System` SHALL NOT log the raw value of `X-Notion-Automations-Token` (to avoid secret leakage); logs MAY indicate token presence/absence.

## Document Revision Notes

### Key Clarifications Made

1. **Notion webhook response is not consumed**: The system cannot rely on Notion mapping response JSON back into properties; therefore it must update Notion via API asynchronously.
2. **Seed format is fixed**: The seed is `YYYY_WNN` (two-digit week number) and is passed from Notion into the webhook request.
3. **Title property name**: The Notion title property defaults to `Sprint Name` (configurable) and is set to `Sprint <generated-slug> - YYYY_WNN`.
4. **Accepted vs rejected requests**: The endpoint returns `202` only when background work is accepted; it may return non-`2xx` (e.g., `401`, `400`, `429`) for invalid/unauthorized or capacity-constrained requests.
5. **Header precedence**: Headers are normative and take precedence; JSON body inputs are a compatibility fallback only.

