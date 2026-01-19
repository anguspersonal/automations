# Design Document: Notion Sprint Name

## Overview

This design document specifies the implementation of the **Notion Sprint Name** feature for the `automations` service. The system provides an HTTP webhook endpoint that generates fun, deterministic sprint names (e.g., `Sprint elegant-mercy`) for use in Notion database automations. The feature enables fully automated weekly sprint creation by allowing Notion automations to call a webhook and map the returned sprint name into database properties.

The implementation follows a **stateless, deterministic design** where sprint names are generated from a provided seed value, ensuring idempotency and reliability under retries. The system prioritizes **low operational overhead**, **fast response times** (<500ms), and **simple, secure invocation** from Notion automations using header-based authentication.

The architecture leverages Express.js middleware for request handling, authentication, and observability. The name generation algorithm uses deterministic hashing of seed values to select adjective-noun pairs from predefined wordlists, ensuring consistent outputs across repeated calls. The design aligns with ADR01's service boundary decisions, using versioned routes (`/v1/notion/*`) and per-integration authentication headers.

## Architecture

```mermaid
flowchart TB
    subgraph "External"
        Notion[Notion Automation<br/>Webhook Action]
    end
    
    subgraph "Express Application"
        Router[Express Router<br/>/v1/notion/*]
        AuthMW[Authentication Middleware<br/>X-Notion-Automations-Token]
        LogMW[Logging Middleware<br/>Request ID, Latency]
        ValidationMW[Validation Middleware<br/>JSON Schema]
    end
    
    subgraph "Business Logic"
        Handler[Sprint Name Handler<br/>/v1/notion/sprint-name]
        Generator[Name Generator<br/>Deterministic Hash]
        Wordlists[Word Lists<br/>Adjectives & Nouns]
    end
    
    subgraph "Configuration"
        Config[Environment Config<br/>NOTION_AUTOMATIONS_TOKEN, GENERATOR_VERSION]
    end
    
    Notion -->|POST /v1/notion/sprint-name<br/>Header: X-Notion-Automations-Token<br/>Body: { seed: string }| Router
    Router --> AuthMW
    AuthMW -->|Valid Token| LogMW
    AuthMW -->|Invalid/Missing| ErrorResponse[401 Response]
    LogMW --> ValidationMW
    ValidationMW -->|Valid Schema| Handler
    ValidationMW -->|Invalid Schema| ErrorResponse2[400 Response]
    Handler --> Generator
    Generator --> Wordlists
    Generator --> Config
    Handler -->|{ request_id, name, slug, generator_version }| SuccessResponse[200 Response]
    LogMW -->|Observability| SuccessResponse
    LogMW -->|Observability| ErrorResponse
    LogMW -->|Observability| ErrorResponse2
```

## Components and Interfaces

### Express Route Handler

| Component | File | Purpose |
|-----------|------|---------|
| `notionRouter` | `routes/v1/notion/index.js` | Express router for all `/v1/notion/*` endpoints |
| `sprintNameHandler` | `routes/v1/notion/sprint-name.js` | POST handler for `/v1/notion/sprint-name` endpoint |

### Authentication Middleware Interface

```typescript
interface AuthMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
}

// Middleware factory
export function createNotionAuthMiddleware(
  expectedToken: string
): AuthMiddleware;
```

**Behavior**:
- Extracts `X-Notion-Automations-Token` header from request
- Compares against expected token from environment variable `NOTION_AUTOMATIONS_TOKEN`
- Calls `next()` if token matches, returns `401` with JSON error if missing or invalid
- Error response format: `{ error: string }`

### Validation Middleware Interface

```typescript
interface ValidationMiddleware {
  (req: Request, res: Response, next: NextFunction): void;
}

// Request body schema
interface SprintNameRequest {
  seed: string;  // Required, non-empty string
}

// Validation middleware
export function validateSprintNameRequest(
  req: Request,
  res: Response,
  next: NextFunction
): void;
```

**Behavior**:
- Validates request body is valid JSON
- Ensures `seed` field exists and is a non-empty string
- Calls `next()` if valid, returns `400` with JSON error if invalid
- Error response format: `{ error: string }`

### Name Generator Interface

```typescript
interface NameGenerator {
  generate(seed: string): SprintName;
}

interface SprintName {
  name: string;           // Format: "Sprint <adjective>-<noun>"
  slug: string;          // Format: "<adjective>-<noun>"
  generator_version: string;
}

// Generator implementation
export class DeterministicNameGenerator implements NameGenerator {
  constructor(
    private adjectives: string[],
    private nouns: string[],
    private version: string
  ) {}
  
  generate(seed: string): SprintName;
}
```

**State Management**:
- Wordlists (adjectives and nouns) are loaded at application startup from static files or embedded arrays
- Generator version is read from environment variable `GENERATOR_VERSION` (default: `"1.0.0"`)
- No runtime state changes; all operations are pure functions
- Deterministic hashing uses a stable algorithm (e.g., SHA-256) to convert seed to indices

### Logging/Observability Interface

```typescript
interface RequestLog {
  requestId: string;
  method: string;
  path: string;
  statusCode: number;
  latencyMs: number;
  timestamp: string;
}

// Middleware factory
export function createLoggingMiddleware(): RequestHandler;
```

**Behavior**:
- Generates unique request ID (UUID v4) for each request
- Logs request start with request ID, method, path
- Measures latency from request start to response send
- Emits structured log on response completion with request ID, endpoint, status, latency
- Logs to stdout in JSON format for structured logging

### Response Interface

```typescript
interface SprintNameResponse {
  request_id: string;        // Unique request identifier (e.g., UUID)
  name: string;              // "Sprint <adjective>-<noun>"
  slug: string;             // "<adjective>-<noun>"
  generator_version: string; // e.g., "1.0.0"
}

interface ErrorResponse {
  error: string;  // Human-readable error message
}
```

## Data Models

### No Persistent Data Storage

This feature is **stateless** and does not require database storage. All data is:
- **Request data**: Provided in HTTP request body (`seed`)
- **Configuration data**: Stored in environment variables (`NOTION_AUTOMATIONS_TOKEN`, `GENERATOR_VERSION`)
- **Wordlists**: Embedded in application code or loaded from static files at startup

### Configuration Model

| Variable | Type | Required | Description |
|----------|------|----------|-------------|
| `NOTION_AUTOMATIONS_TOKEN` | string | Yes | Secret token for authenticating Notion webhook requests |
| `GENERATOR_VERSION` | string | No | Version identifier for name generator (default: `"1.0.0"`) |
| `PORT` | number | No | HTTP server port (default: `3000`) |

### Wordlist Model

```typescript
interface Wordlists {
  adjectives: string[];  // Array of adjective strings
  nouns: string[];       // Array of noun strings
}

// Example structure
const wordlists: Wordlists = {
  adjectives: ["elegant", "swift", "brave", "calm", ...],
  nouns: ["mercy", "thunder", "ocean", "flame", ...]
};
```

**Wordlist Requirements**:
- Adjectives and nouns must be lowercase, hyphenated if multi-word
- Minimum 100 items per list for sufficient variety
- No duplicates within each list
- Loaded once at application startup

## Implementation Details

### Project Structure

```
automations/
├── app.js                          # Express app setup
├── routes/
│   ├── index.js                    # Root router
│   └── v1/
│       └── notion/
│           ├── index.js            # Notion router setup
│           ├── sprint-name.js      # Sprint name endpoint handler
│           └── middleware.js       # Auth & validation middleware
├── lib/
│   ├── name-generator.js          # Deterministic name generator
│   ├── wordlists.js               # Adjective/noun wordlists
│   └── logging.js                 # Request logging middleware
├── config/
│   └── env.js                     # Environment variable validation
└── docs/
    └── notion-sprint-name/
        ├── requirements.md
        └── design.md
```

### Database Migrations

**No database migrations required** - This feature is stateless and does not persist data.

### Express Route Setup

**File: `routes/v1/notion/index.js`**

```javascript
const express = require('express');
const router = express.Router();
const { createNotionAuthMiddleware } = require('./middleware');
const { sprintNameHandler } = require('./sprint-name');
const { createLoggingMiddleware } = require('../../../lib/logging');

// Apply logging middleware to all Notion routes
router.use(createLoggingMiddleware());

// Apply authentication middleware to all Notion routes
const authMiddleware = createNotionAuthMiddleware(
  process.env.NOTION_AUTOMATIONS_TOKEN
);
router.use(authMiddleware);

// Register sprint name endpoint
router.post('/sprint-name', sprintNameHandler);

module.exports = router;
```

**File: `app.js` (updated)**

```javascript
const express = require('express');
const path = require('path');
const indexRouter = require('./routes/index');
const notionRouter = require('./routes/v1/notion');

const app = express();
const PORT = process.env.PORT || 3000;

// JSON body parser
app.use(express.json());

// Normalize invalid JSON errors to our error schema
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  next(err);
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Root routes
app.use('/', indexRouter);

// Versioned API routes
app.use('/v1/notion', notionRouter);

// Catch-all route for handling 404 errors
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
```

### Authentication Middleware Implementation

**File: `routes/v1/notion/middleware.js`**

```javascript
function createNotionAuthMiddleware(expectedToken) {
  if (!expectedToken) {
    throw new Error('NOTION_AUTOMATIONS_TOKEN environment variable is required');
  }

  return (req, res, next) => {
    const token = req.headers['x-notion-automations-token'];
    
    if (!token) {
      return res.status(401).json({
        error: 'Missing X-Notion-Automations-Token header'
      });
    }
    
    if (token !== expectedToken) {
      return res.status(401).json({
        error: 'Invalid X-Notion-Automations-Token'
      });
    }
    
    next();
  };
}

function validateSprintNameRequest(req, res, next) {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({
      error: 'Request body must be valid JSON'
    });
  }
  
  if (!req.body.seed || typeof req.body.seed !== 'string' || req.body.seed.trim() === '') {
    return res.status(400).json({
      error: 'Request body must include a non-empty "seed" string field'
    });
  }
  
  next();
}

module.exports = {
  createNotionAuthMiddleware,
  validateSprintNameRequest
};
```

### Name Generator Implementation

**File: `lib/name-generator.js`**

```javascript
const crypto = require('crypto');
const { wordlists } = require('./wordlists');

class DeterministicNameGenerator {
  constructor(adjectives, nouns, version) {
    this.adjectives = adjectives;
    this.nouns = nouns;
    this.version = version;
  }

  generate(seed) {
    // Create deterministic hash from seed
    const hash = crypto
      .createHash('sha256')
      .update(seed)
      .update(this.version) // Include version in hash for stability
      .digest('hex');
    
    // Convert hash to numbers for index selection
    const adjIndex = parseInt(hash.substring(0, 8), 16) % this.adjectives.length;
    const nounIndex = parseInt(hash.substring(8, 16), 16) % this.nouns.length;
    
    const adjective = this.adjectives[adjIndex];
    const noun = this.nouns[nounIndex];
    const slug = `${adjective}-${noun}`;
    
    return {
      name: `Sprint ${slug}`,
      slug: slug,
      generator_version: this.version
    };
  }
}

// Singleton instance
let generatorInstance = null;

function getNameGenerator() {
  if (!generatorInstance) {
    const version = process.env.GENERATOR_VERSION || '1.0.0';
    generatorInstance = new DeterministicNameGenerator(
      wordlists.adjectives,
      wordlists.nouns,
      version
    );
  }
  return generatorInstance;
}

module.exports = {
  DeterministicNameGenerator,
  getNameGenerator
};
```

### Sprint Name Handler Implementation

**File: `routes/v1/notion/sprint-name.js`**

```javascript
const { validateSprintNameRequest } = require('./middleware');
const { getNameGenerator } = require('../../../lib/name-generator');

async function handleSprintName(req, res) {
  try {
    // Validation middleware already checked seed exists
    const { seed } = req.body;
    
    const generator = getNameGenerator();
    const result = generator.generate(seed);
    
    // Enforce the response contract used by Notion property mapping:
    // { request_id, name, slug, generator_version } and no extra fields.
    res.status(200).json({
      request_id: req.requestId, // set by logging middleware
      name: result.name,
      slug: result.slug,
      generator_version: result.generator_version
    });
  } catch (error) {
    console.error('Error generating sprint name:', error);
    res.status(500).json({
      error: 'Internal server error while generating sprint name'
    });
  }
}

// Export handler with validation middleware applied
module.exports = {
  sprintNameHandler: [validateSprintNameRequest, handleSprintName]
};
```

### Logging Middleware Implementation

**File: `lib/logging.js`**

```javascript
const { v4: uuidv4 } = require('uuid');

function createLoggingMiddleware() {
  return (req, res, next) => {
    const requestId = uuidv4();
    const startTime = Date.now();
    
    // Attach request ID to request object for potential use in handlers
    req.requestId = requestId;
    
    // Log request start
    console.log(JSON.stringify({
      type: 'request_start',
      requestId,
      method: req.method,
      path: req.path,
      timestamp: new Date().toISOString()
    }));
    
    // Log request completion when the response finishes
    res.on('finish', () => {
      const latencyMs = Date.now() - startTime;
      
      // Log request completion
      console.log(JSON.stringify({
        type: 'request_complete',
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        latencyMs,
        timestamp: new Date().toISOString()
      }));
    });
    
    next();
  };
}

module.exports = {
  createLoggingMiddleware
};
```

### Wordlists Implementation

**File: `lib/wordlists.js`**

```javascript
// Minimum 100 items per list for sufficient variety
const adjectives = [
  'elegant', 'swift', 'brave', 'calm', 'bright', 'bold', 'clever', 'daring',
  'fierce', 'gentle', 'mighty', 'noble', 'proud', 'quick', 'radiant', 'silent',
  'sturdy', 'vivid', 'witty', 'zealous', 'ancient', 'brilliant', 'cunning',
  'dynamic', 'eternal', 'fearless', 'graceful', 'harmonious', 'infinite',
  'jubilant', 'keen', 'luminous', 'majestic', 'nimble', 'optimistic',
  'peaceful', 'quaint', 'resilient', 'serene', 'tranquil', 'unified',
  'valiant', 'wondrous', 'youthful', 'zenith', 'agile', 'balanced',
  'confident', 'diligent', 'efficient', 'flexible', 'generous', 'honest',
  'innovative', 'joyful', 'kind', 'loyal', 'mindful', 'natural',
  'organized', 'patient', 'quality', 'reliable', 'strong', 'thoughtful',
  'unique', 'versatile', 'wise', 'excellent', 'fantastic', 'glorious',
  'heroic', 'inspiring', 'jovial', 'knightly', 'legendary', 'magnificent',
  'notable', 'outstanding', 'perfect', 'remarkable', 'splendid', 'triumphant',
  'ultimate', 'victorious', 'wonderful', 'extraordinary', 'phenomenal',
  'spectacular', 'superb', 'terrific', 'amazing', 'awesome', 'incredible'
];

const nouns = [
  'mercy', 'thunder', 'ocean', 'flame', 'storm', 'shadow', 'light', 'dawn',
  'dusk', 'moon', 'star', 'sun', 'wind', 'wave', 'mountain', 'valley',
  'river', 'forest', 'desert', 'island', 'horizon', 'sky', 'cloud', 'rain',
  'snow', 'ice', 'fire', 'earth', 'stone', 'crystal', 'pearl', 'diamond',
  'emerald', 'sapphire', 'ruby', 'gold', 'silver', 'bronze', 'iron', 'steel',
  'blade', 'shield', 'arrow', 'bow', 'sword', 'spear', 'lance', 'axe',
  'hammer', 'crown', 'throne', 'castle', 'tower', 'bridge', 'gate', 'path',
  'journey', 'quest', 'adventure', 'legend', 'myth', 'tale', 'story', 'song',
  'poem', 'verse', 'rhyme', 'melody', 'harmony', 'chord', 'note', 'beat',
  'rhythm', 'dance', 'movement', 'motion', 'flow', 'current', 'stream',
  'cascade', 'fountain', 'spring', 'well', 'pool', 'lake', 'sea', 'bay',
  'harbor', 'port', 'coast', 'shore', 'beach', 'cliff', 'peak', 'summit',
  'ridge', 'crest', 'pinnacle', 'zenith', 'apex', 'height', 'depth',
  'expanse', 'realm', 'domain', 'kingdom', 'empire', 'nation', 'land'
];

module.exports = {
  wordlists: {
    adjectives,
    nouns
  }
};
```

### Environment Configuration

**File: `config/env.js`**

```javascript
function validateEnvironment() {
  const required = ['NOTION_AUTOMATIONS_TOKEN'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
  
  return {
    notionToken: process.env.NOTION_AUTOMATIONS_TOKEN,
    generatorVersion: process.env.GENERATOR_VERSION || '1.0.0',
    port: parseInt(process.env.PORT || '3000', 10)
  };
}

module.exports = {
  validateEnvironment
};
```

## Correctness Properties

### Property 1: Deterministic Name Generation

*For any* valid request with a given `seed` value and `generator_version`, the `Notion_Sprint_Name_System` SHALL return the same `name` and `slug` values across all invocations.

**Validates: Requirements 3.1, 3.2**

### Property 2: Response Format Compliance

*For any* valid request, the `Notion_Sprint_Name_System` SHALL return an HTTP `200` JSON response body containing exactly the fields `request_id`, `name`, `slug`, and `generator_version`, where:

- `request_id` is a non-empty string
- `name` is a non-empty string and equals `"Sprint " + slug`
- `slug` is a non-empty string containing only lowercase letters and hyphens (no spaces)
- `generator_version` is a non-empty string

**Validates: Requirements 1.2, 1.3, 4.1, 4.2, 4.3, 4.4, 4.5**

### Property 3: Authentication Enforcement

*For any* request to `/v1/notion/sprint-name` missing the `X-Notion-Automations-Token` header or containing an invalid token value, the `Notion_Sprint_Name_System` SHALL return HTTP `401` with a JSON body containing an `error` field.

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 4: Seed Requirement Validation

*For any* request to `/v1/notion/sprint-name` with a request body missing the `seed` field or containing an empty `seed` value, the `Notion_Sprint_Name_System` SHALL return HTTP `400` with a JSON body containing an `error` field indicating that `seed` is required.

**Validates: Requirements 3.3, 3.4**

### Property 5: Performance Bounds

*For any* valid or invalid request to `/v1/notion/sprint-name`, the `Notion_Sprint_Name_System` SHALL send an HTTP response within 500ms under normal operating conditions (excluding network latency and cold starts).

**Validates: Requirements 5.1, 5.2**

### Property 6: Error Response Format

*For any* error condition (authentication failure, validation failure, or unexpected error), the `Notion_Sprint_Name_System` SHALL return a JSON response body with `Content-Type: application/json` containing an `error` field with a non-empty string value.

**Validates: Requirements 1.1, 1.4, 2.3, 3.3, 3.4, 5.3**

## Error Handling

### Authentication Errors

| Error Scenario | User-Facing Behavior | Recovery Action |
|----------------|---------------------|-----------------|
| Missing `X-Notion-Automations-Token` header | HTTP `401` with `{ error: "Missing X-Notion-Automations-Token header" }` | Client must include valid token header |
| Invalid token value | HTTP `401` with `{ error: "Invalid X-Notion-Automations-Token" }` | Client must use correct token from environment configuration |

### Validation Errors

| Error Scenario | User-Facing Behavior | Recovery Action |
|----------------|---------------------|-----------------|
| Missing or invalid JSON body | HTTP `400` with `{ error: "Request body must be valid JSON" }` | Client must send valid JSON |
| Missing `seed` field | HTTP `400` with `{ error: "Request body must include a non-empty \"seed\" string field" }` | Client must include `seed` in request body |
| Empty `seed` value | HTTP `400` with `{ error: "Request body must include a non-empty \"seed\" string field" }` | Client must provide non-empty `seed` value |

### System Errors

| Error Scenario | User-Facing Behavior | Recovery Action |
|----------------|---------------------|-----------------|
| Unexpected error during name generation | HTTP `500` with `{ error: "Internal server error while generating sprint name" }` | Error logged with request ID; system should be monitored for recurring failures |
| Missing environment configuration | Application fails to start with error message | Operator must set required environment variables before deployment |

### Network/Request Errors

| Error Scenario | User-Facing Behavior | Recovery Action |
|----------------|---------------------|-----------------|
| Request timeout (client-side) | Client receives timeout error | Notion automation may retry; idempotent design ensures safe retries |
| Malformed request | HTTP `400` or handled by Express error middleware | Client must send properly formatted requests |

## Testing Strategy

### Unit Testing

Unit tests will cover specific examples and edge cases:

1. **Authentication Middleware Tests**
   - Valid token in header allows request to proceed
   - Missing token returns 401 with error message
   - Invalid token returns 401 with error message
   - Token comparison is case-sensitive

2. **Validation Middleware Tests**
   - Valid request body with seed passes validation
   - Missing seed field returns 400 with error
   - Empty seed string returns 400 with error
   - Non-string seed value returns 400 with error
   - Invalid JSON body returns 400 with error

3. **Name Generator Tests**
   - Same seed produces same output across multiple calls
   - Different seeds produce different outputs
   - Generator version affects output (same seed, different version = different output)
   - Output format matches "Sprint <adjective>-<noun>" pattern
   - Slug matches the portion after "Sprint "
   - All generated names use words from wordlists

4. **Sprint Name Handler Tests**
   - Valid request returns 200 with correct response structure
   - Response includes request_id, name, slug, and generator_version fields
   - Error handling returns 500 for unexpected errors
   - Request ID is attached to request object

5. **Logging Middleware Tests**
   - Request ID is generated for each request
   - Request start is logged with correct fields
   - Request completion is logged with latency and status code
   - Logs are in JSON format

### Property-Based Testing

Property-based tests will use **fast-check** library to verify universal properties across many inputs.

Each property test will:
- Run a minimum of 100 iterations
- Be tagged with the format: `**Feature: notion-sprint-name, Property {number}: {property_text}**`
- Reference the specific correctness property from this design document

**Property Tests to Implement**:

1. **Property 1 Test**: For any seed string, calling the generator multiple times with the same seed and version produces identical name and slug values.
   - **Tag**: `**Feature: notion-sprint-name, Property 1: Deterministic Name Generation**`
   - **Validates**: Property 1

2. **Property 2 Test**: For any valid request, the response contains exactly the fields request_id, name, slug, and generator_version; `name === "Sprint " + slug`; and `slug` is a non-empty lowercase-and-hyphens string with no spaces.
   - **Tag**: `**Feature: notion-sprint-name, Property 2: Response Format Compliance**`
   - **Validates**: Property 2

3. **Property 3 Test**: For any request without X-Notion-Automations-Token header or with invalid token, the system returns HTTP 401 with JSON error field.
   - **Tag**: `**Feature: notion-sprint-name, Property 3: Authentication Enforcement**`
   - **Validates**: Property 3

4. **Property 4 Test**: For any request body missing seed or with empty seed, the system returns HTTP 400 with JSON error field indicating seed is required.
   - **Tag**: `**Feature: notion-sprint-name, Property 4: Seed Requirement Validation**`
   - **Validates**: Property 4

**Notes**:
- The 500ms latency requirement is better validated via a small integration/performance smoke test and/or production observability, not property-based testing (to avoid flaky tests).
- Error response shape/content-type is covered via targeted unit/integration tests rather than a property-based test.

### Test File Organization

```
automations/
├── routes/
│   └── v1/
│       └── notion/
│           └── __tests__/
│               ├── middleware.test.js          # Unit tests for auth & validation
│               ├── middleware.property.js      # Property tests for middleware
│               ├── sprint-name.test.js         # Unit tests for handler
│               └── sprint-name.property.js     # Property tests for handler
├── lib/
│   └── __tests__/
│       ├── name-generator.test.js              # Unit tests for generator
│       ├── name-generator.property.js          # Property tests for generator
│       ├── logging.test.js                    # Unit tests for logging
│       └── wordlists.test.js                  # Unit tests for wordlists
└── config/
    └── __tests__/
        └── env.test.js                         # Unit tests for env validation
```

## Developer Guide: Implementation Steps

This section provides step-by-step instructions for implementing the Notion Sprint Name feature.

### Step 1: Set Up Project Dependencies

1. Install required npm packages:
   ```bash
   npm install uuid
   # Choose one test runner: Jest or Vitest
   npm install --save-dev fast-check supertest
   ```
2. Update `package.json` to include test scripts:
   ```json
   {
     "scripts": {
       "start": "node app.js",
        "test": "<your test runner command>",
        "test:watch": "<your test runner watch command>"
     }
   }
   ```

### Step 2: Create Wordlists Module

1. Create `lib/wordlists.js` with adjective and noun arrays (minimum 100 items each)
2. Export wordlists object with `adjectives` and `nouns` arrays
3. Add unit tests to verify wordlist structure and content

### Step 3: Implement Name Generator

1. Create `lib/name-generator.js` with `DeterministicNameGenerator` class
2. Implement SHA-256 hashing for deterministic index selection
3. Implement `generate()` method returning `{ name, slug, generator_version }`
4. Add singleton factory function `getNameGenerator()`
5. Write unit tests for deterministic behavior
6. Write property tests for Property 1 and Property 2

### Step 4: Implement Logging Middleware

1. Create `lib/logging.js` with `createLoggingMiddleware()` function
2. Generate UUID v4 request IDs
3. Measure and log request latency
4. Emit structured JSON logs to stdout
5. Write unit tests for logging behavior

### Step 5: Implement Authentication Middleware

1. Create `routes/v1/notion/middleware.js`
2. Implement `createNotionAuthMiddleware()` factory function
3. Validate `X-Notion-Automations-Token` header
4. Return 401 with JSON error for missing/invalid tokens
5. Write unit tests for all authentication scenarios
6. Write property tests for Property 3

### Step 6: Implement Validation Middleware

1. Add `validateSprintNameRequest()` to `routes/v1/notion/middleware.js`
2. Validate JSON body structure
3. Validate `seed` field presence and type
4. Return 400 with JSON error for validation failures
5. Write unit tests for all validation scenarios
6. Write property tests for Property 4

### Step 7: Implement Sprint Name Handler

1. Create `routes/v1/notion/sprint-name.js`
2. Implement `sprintNameHandler()` function
3. Extract `seed` from request body
4. Call name generator and return response
5. Add error handling for unexpected errors (500 response)
6. Write unit tests for handler behavior

### Step 8: Set Up Route Structure

1. Create `routes/v1/notion/index.js` router
2. Apply logging middleware to all Notion routes
3. Apply authentication middleware to all Notion routes
4. Register POST `/sprint-name` endpoint with validation and handler
5. Update `app.js` to mount `/v1/notion` router
6. Add JSON body parser middleware to `app.js`

### Step 9: Environment Configuration

1. Create `config/env.js` with `validateEnvironment()` function
2. Validate required environment variables at startup
3. Provide defaults for optional variables
4. Update `app.js` to call validation on startup
5. Write unit tests for environment validation

### Step 10: Integration Testing

1. Create integration test file `__tests__/integration/sprint-name.test.js`
2. Test full request/response flow with valid requests
3. Test authentication failures
4. Test validation failures
5. Test error handling
6. Add a small performance smoke check (non-flaky) that exercises a handful of requests and asserts order-of-magnitude latency (and rely on logs/metrics for ongoing enforcement of the 500ms target)

### Step 11: Documentation and Deployment

1. Update README.md with endpoint documentation
2. Document environment variables required for deployment
3. Add example request/response to documentation
4. Test deployment with actual environment variables
5. Verify observability logs are working correctly

## Testing Checklist

Before considering implementation complete, verify:

1. **Core Functionality**:
   - [ ] Valid request with seed returns 200 with correct response format
   - [ ] Response contains name, slug, and generator_version fields
   - [ ] Name format is "Sprint <adjective>-<noun>"
   - [ ] Slug matches portion after "Sprint " in name
   - [ ] Same seed produces same output across multiple calls

2. **Authentication**:
   - [ ] Missing token header returns 401
   - [ ] Invalid token returns 401
   - [ ] Valid token allows request to proceed
   - [ ] 401 responses include JSON error field

3. **Validation**:
   - [ ] Missing seed returns 400
   - [ ] Empty seed returns 400
   - [ ] Non-string seed returns 400
   - [ ] Invalid JSON body returns 400
   - [ ] 400 responses include JSON error field

4. **Error Handling**:
   - [ ] Unexpected errors return 500
   - [ ] 500 responses include JSON error field
   - [ ] All error responses have Content-Type: application/json

5. **Performance**:
   - [ ] Valid requests respond within 500ms
   - [ ] Invalid requests respond within 500ms
   - [ ] Response times are logged correctly

6. **Observability**:
   - [ ] Request IDs are generated and logged
   - [ ] Request start events are logged
   - [ ] Request completion events include latency and status
   - [ ] Logs are in JSON format

7. **Property-Based Tests**:
   - [ ] Property 1 test passes (deterministic generation)
   - [ ] Property 2 test passes (response format)
   - [ ] Property 3 test passes (authentication)
   - [ ] Property 4 test passes (seed validation)
   - [ ] Performance smoke check is defined and documented (avoid flaky hard thresholds in CI)

8. **Integration**:
   - [ ] Endpoint is accessible at `/v1/notion/sprint-name`
   - [ ] Route versioning is correct
   - [ ] Middleware chain executes in correct order
   - [ ] Environment variables are validated at startup

## Document Revision Notes

### Key Clarifications Made

1. **Stable requirement references**: Correctness properties now validate `requirements.md` acceptance criteria by `X.Y` IDs (e.g. `4.1`) to avoid ambiguity across documents.
2. **Non-flaky testing guidance**: The 500ms performance requirement is treated as a smoke check + observability concern rather than a property-based test (to reduce CI flake).
3. **Success response contract**: Successful responses include `request_id` and return exactly `{ request_id, name, slug, generator_version }`.
4. **Latency requirement scope**: The 500ms target excludes cold starts and network latency.
