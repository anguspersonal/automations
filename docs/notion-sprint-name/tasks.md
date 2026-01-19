# Implementation Plan

- [x] 1. Add versioned Notion API routing and JSON handling
  - [x] 1.1 Mount `/v1/notion` routes in the Express app
    - Update `app.js` to add `express.json()` for request parsing
    - Add middleware to normalize invalid JSON parse errors to `{ error: string }` with HTTP `400`
    - Create and mount a new router at `app.use('/v1/notion', notionRouter)`
    - Keep existing `/` route and `404` behavior unchanged
    - _Requirements: 1.1, 1.4, 6.1, 6.2_
  - [x] 1.2 Create Notion v1 router skeleton
    - Create `routes/v1/notion/index.js` as an Express router
    - Register `POST /sprint-name` on that router (handler added in later tasks)
    - _Requirements: 1.1, 6.1, 6.2_

- [x] 2. Implement Notion request authentication (header token)
  - [x] 2.1 Implement Notion auth middleware
    - Create `routes/v1/notion/middleware.js`
    - Implement `createNotionAuthMiddleware(expectedToken)`:
      - Read `X-Notion-Automations-Token` (header key `x-notion-automations-token`)
      - If missing: return HTTP `401` with `{ error: string }`
      - If invalid: return HTTP `401` with `{ error: string }`
    - Apply middleware to all routes under `routes/v1/notion/index.js`
    - _Requirements: 2.1, 2.2, 2.3, 5.2, 6.3_
  - [x] 2.2 Add environment variable contract for auth token
    - Define required env var `NOTION_AUTOMATIONS_TOKEN`
    - Add minimal startup validation (either in `app.js` or a new `config/env.js`)
    - Ensure the service fails fast (clear error) if the token is missing at runtime
    - _Requirements: 2.1, 2.2, 6.3_

- [x] 3. Implement request validation and consistent error responses
  - [x] 3.1 Validate `seed` is present and non-empty
    - In `routes/v1/notion/middleware.js`, implement `validateSprintNameRequest(req, res, next)`
    - Return HTTP `400` with `{ error: string }` when:
      - Body is missing or not a JSON object
      - `seed` is missing
      - `seed` is not a string
      - `seed` is empty/whitespace-only
    - Ensure response `Content-Type` is JSON for validation failures
    - _Requirements: 1.4, 3.3, 3.4, 5.2_
  - [x] 3.2 Standardize unexpected error handling for the endpoint
    - In `routes/v1/notion/sprint-name.js` (added later), wrap handler logic in try/catch
    - Return HTTP `500` with `{ error: string }` on unexpected exceptions
    - _Requirements: 5.3_

- [x] 4. Implement deterministic sprint name generation (stateless)
  - [x] 4.1 Add wordlists for adjective/noun generation
    - Create `lib/wordlists.js`
    - Export `wordlists.adjectives` and `wordlists.nouns` arrays
    - Keep entries lowercase (hyphenated for multi-word)
    - Ensure sufficient size/variety (design target: 100+ items per list)
    - _Requirements: 1.3, 3.1_
  - [x] 4.2 Implement deterministic generator with versioning
    - Create `lib/name-generator.js`
    - Implement `DeterministicNameGenerator` using Node `crypto` hashing over:
      - `seed`
      - `generator_version`
    - Implement `generate(seed)` returning:
      - `slug` as `<adjective>-<noun>`
      - `name` as `Sprint <adjective>-<noun>`
      - `generator_version` as a non-empty string (env var `GENERATOR_VERSION`, default `"1.0.0"`)
    - Add `getNameGenerator()` singleton factory to avoid re-initialization per request
    - _Requirements: 1.3, 3.1, 3.2, 4.2, 4.3, 4.4, 5.1_

- [ ] 5. Implement the `/v1/notion/sprint-name` endpoint handler and response contract
  - [ ] 5.1 Add sprint name handler wired with middleware chain
    - Create `routes/v1/notion/sprint-name.js`
    - Implement handler pipeline:
      - `validateSprintNameRequest`
      - `handleSprintName` (uses generator to produce output)
    - Ensure success responses are HTTP `200` and JSON
    - _Requirements: 1.1, 1.2, 3.1, 4.1_
  - [ ] 5.2 Enforce exact response schema for Notion mapping
    - Ensure handler responds with a JSON object containing **exactly**:
      - `request_id`
      - `name`
      - `slug`
      - `generator_version`
    - Ensure `slug` is exactly the part after `Sprint ` in `name`
    - Ensure `request_id` is a non-empty string (e.g. UUID), and is stable within the request (used for logging/correlation)
    - _Requirements: 1.3, 4.1, 4.2, 4.3, 4.4, 4.5, 6.4_

- [ ] 6. Add basic observability (request id + latency)
  - [ ] 6.1 Implement logging middleware for `/v1/notion/*`
    - Create `lib/logging.js` with `createLoggingMiddleware()`
    - Generate a request id per request (e.g. UUID v4) and attach to `req`
    - Measure latency and emit structured logs including:
      - request id
      - endpoint/path
      - status
      - latency (ms)
    - Apply middleware to the Notion router in `routes/v1/notion/index.js`
    - _Requirements: 6.4_

- [ ] 7. Documentation updates for operational use
  - [ ] 7.1 Document endpoint contract and env vars
    - Update `README.md` with:
      - `POST /v1/notion/sprint-name` request/response examples
      - Required header `X-Notion-Automations-Token`
      - Required env var `NOTION_AUTOMATIONS_TOKEN`
      - Optional env var `GENERATOR_VERSION` (default `"1.0.0"`)
      - Error response format `{ error: string }`
    - _Requirements: 1.1, 1.4, 2.1, 4.1, 6.3_

- [ ] 8. Tests (unit + property tests for core invariants)
  - [ ] 8.1 Add a test runner + dependencies
    - Choose and configure a JS test runner (e.g. Jest or Vitest) and add scripts to `package.json`
    - Add dev dependencies needed for property tests (e.g. `fast-check`)
    - _Requirements: 3.2, 4.1, 6.4_
  - [ ] 8.2 Add unit tests for middleware and generator
    - Add tests covering:
      - Auth: missing/invalid token → 401 + JSON error
      - Validation: missing/empty/non-string `seed` → 400 + JSON error
      - Generator: returns `name`, `slug`, `generator_version`; `name === "Sprint " + slug`
      - Handler: returns `request_id`, `name`, `slug`, `generator_version`; `request_id` is non-empty
    - _Requirements: 1.3, 1.4, 2.1, 2.2, 2.3, 3.3, 3.4, 4.1, 4.2, 4.3, 4.4, 4.5_
  - [ ]* 8.3 Write property test for deterministic name generation
    - **Property 1: Deterministic Name Generation**
    - For any non-empty `seed`, repeated calls with same `seed` + same `generator_version` yield identical `{ name, slug, generator_version }`
    - **Validates: Requirements 3.1, 3.2**
  - [ ]* 8.4 Write property test for response format compliance
    - **Property 2: Response Format Compliance**
    - For any valid `seed`, response has exactly `{ request_id, name, slug, generator_version }`, `request_id` is non-empty, `name === "Sprint " + slug`, and `slug` is a non-empty lowercase-and-hyphens string with no spaces
    - **Validates: Requirements 1.3, 4.1, 4.2, 4.3, 4.4, 4.5**
  - [ ]* 8.5 Write property test for authentication enforcement
    - **Property 3: Authentication Enforcement**
    - For any request missing/invalid token, response is HTTP `401` with JSON `{ error: string }`
    - **Validates: Requirements 2.1, 2.2, 2.3**
  - [ ]* 8.6 Write property test for seed requirement validation
    - **Property 4: Seed Requirement Validation**
    - For any request body missing `seed` or with empty/whitespace `seed`, response is HTTP `400` with JSON `{ error: string }` indicating `seed` is required
    - **Validates: Requirements 3.3, 3.4**

  - [ ] 8.7 Add a lightweight performance smoke check (non-flaky)
    - Add a small script or integration test that exercises a handful of valid + invalid requests and records observed latency
    - Document how to run it locally and how to interpret results (avoid hard CI thresholds that will be flaky)
    - _Requirements: 5.1, 5.2, 6.4_

## Document Revision Notes

### Key Clarifications Made

1. **Requirement ID consistency**: Task requirement references match `requirements.md` acceptance criteria IDs (e.g. `3.4`).
2. **Performance verification included**: Added a dedicated performance smoke-check task to address Requirements 5.1 and 5.2 without introducing flaky CI assertions.

