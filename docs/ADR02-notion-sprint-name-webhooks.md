# ADR02: Notion sprint name automation via webhook subscriptions

## Status

Accepted

## Context

We want a Notion automation that assigns a generated sprint name (and optional metadata like slug / generator version) to a newly-created Sprint page.

Constraints we learned while iterating:

1. **“HTTP POST -> return data to Notion” does not work**
   - We initially assumed a Notion Automation HTTP step could call our service and map the response into Notion properties.
   - In practice (for our use-case), the automation could not reliably consume / map response data back into the Notion page, so this approach failed to update Notion.

2. **Async “call server then server updates Notion” needs a page id**
   - The next design moved the write-back into our service: Notion calls our endpoint, we compute the name, then we call the Notion API to update the page.
   - This requires the Notion request to include a `page_id`. The Notion Automation step we used did **not** provide a page id, so the request failed validation and we could not complete the update.

3. We need a **reliable trigger that includes (or can be resolved to) a page id**
   - Notion webhook subscriptions emit events with a page entity id, and can notify us when pages are created/updated.
   - This gives us a deterministic identifier that we can use to call the Notion API and update the page.

## Decision

We will implement the sprint naming automation using **Notion webhook subscriptions**:

- Create a webhook subscription for the integration in Notion’s Integration UI.
- Subscribe to `page.created` events (and optionally other page events if needed).
- Configure the webhook URL to our service endpoint: `/v1/notion/webhook`.
- On delivery:
  - Verify the request (recommended) using `X-Notion-Signature` and the subscription `verification_token`.
  - Extract the page id from the event payload.
  - Ensure the page belongs to the **Sprint database** (hardcoded database id or env-configured database id).
    - If the webhook payload does not include the database id, retrieve the page via Notion API and check `parent.database_id`.
  - Compute the sprint name from the seed (based on our generator rules).
  - Update the page via Notion API:
    - Title property: `NOTION_SPRINT_NAME_PROPERTY` (expected to be the title property)
    - Optional rich text properties: `NOTION_SPRINT_SLUG_PROPERTY`, `NOTION_SPRINT_GENERATOR_VERSION_PROPERTY`

Operationally:

- The webhook handler must return **200 quickly** (Notion delivery semantics), and any heavier work should be queued.
- The endpoint is **public** (Notion must reach it), so it must not rely on our internal header token (`X-Notion-Automations-Token`) used by other Notion routes.

## Implementation notes (high-level)

- **Endpoint**: `POST /v1/notion/webhook`
  - Handles initial subscription verification payload (contains `verification_token`).
  - Validates event payload signature when `NOTION_WEBHOOK_VERIFICATION_TOKEN` is configured.
  - Logs minimal metadata (`type`, `entity_id`) to support debugging.

- **Filtering to Sprint pages**
  - Configure `NOTION_SPRINTS_DATABASE_ID` (recommended) and ignore events for other pages.
  - If the event doesn’t provide enough context to determine the parent database, call `retrieve page` to validate the parent before updating.

## Consequences

- **Pros**
  - Reliable trigger with a page id, enabling deterministic page updates.
  - No dependence on Notion Automation’s ability to map HTTP responses back into Notion properties.
  - Clear security posture: signed webhook payloads and a dedicated public endpoint.

- **Cons / risks**
  - Webhooks can be noisy; we must filter events to the Sprint database to avoid unintended updates.
  - Webhook delivery is “at least once”; handlers should be idempotent (e.g. re-updating title to the same value is safe).
  - Requires extra operational setup (subscription creation + verification token management).

## Follow-ups

- Add/confirm `NOTION_SPRINTS_DATABASE_ID` configuration and filtering logic.
- Decide which exact event types we subscribe to beyond `page.created` (if any).
- Add idempotency guard (e.g. skip if `NOTION_SPRINT_GENERATOR_VERSION_PROPERTY` already matches current generator version).

