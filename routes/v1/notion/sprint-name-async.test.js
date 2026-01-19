const { createNotionAuthMiddleware, validateNotionPageId, validateSprintNameRequest } = require('./middleware');

function createMockRes() {
  const res = {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return res;
}

function headerGetter(headers) {
  const normalized = {};
  for (const [k, v] of Object.entries(headers || {})) {
    normalized[String(k).toLowerCase()] = v;
  }
  return (key) => normalized[String(key).toLowerCase()];
}

function runChain({ req, res, handlers }) {
  let idx = 0;
  const next = (err) => {
    if (err) throw err;
    const fn = handlers[idx++];
    if (!fn) return;
    return fn(req, res, next);
  };
  next();
}

function resetAsyncQueue() {
  delete globalThis.__automations_async_job_queue__;
}

describe('Notion sprint-name async endpoint (unit)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NOTION_API_TOKEN = 'test-notion-token';
    process.env.ASYNC_MAX_PENDING = '50';
    resetAsyncQueue();
  });

  afterEach(() => {
    resetAsyncQueue();
    process.env = originalEnv;
  });

  test('valid request -> 202 + { request_id } (non-empty)', () => {
    jest.isolateModules(() => {
      jest.doMock('../../../lib/notion-api', () => {
        const actual = jest.requireActual('../../../lib/notion-api');
        return {
          ...actual,
          updateNotionPage: jest.fn(async () => ({ status: 200, body: {} })),
        };
      });

      const { handleSprintNameAsync } = require('./sprint-name-async');

      const expectedToken = 'expected-token';
      const auth = createNotionAuthMiddleware(expectedToken);

      const req = {
        requestId: 'req-1',
        body: {},
        get: headerGetter({
          'x-notion-automations-token': expectedToken,
          'x-notion-sprint-seed': '2026_W04',
          'x-notion-page-id': 'page-123',
        }),
      };
      const res = createMockRes();

      runChain({
        req,
        res,
        handlers: [auth, validateNotionPageId, validateSprintNameRequest, handleSprintNameAsync],
      });

      expect(res.statusCode).toBe(202);
      expect(res.body).toEqual({ request_id: expect.any(String) });
      expect(res.body.request_id.trim()).not.toBe('');
    });
  });

  test('queue full -> 429 + { error }', () => {
    jest.isolateModules(() => {
      jest.doMock('../../../lib/notion-api', () => {
        const actual = jest.requireActual('../../../lib/notion-api');
        return {
          ...actual,
          updateNotionPage: jest.fn(async () => ({ status: 200, body: {} })),
        };
      });

      process.env.ASYNC_MAX_PENDING = '0';
      resetAsyncQueue();

      const { handleSprintNameAsync } = require('./sprint-name-async');

      const expectedToken = 'expected-token';
      const auth = createNotionAuthMiddleware(expectedToken);

      const req = {
        requestId: 'req-2',
        body: {},
        get: headerGetter({
          'x-notion-automations-token': expectedToken,
          'x-notion-sprint-seed': '2026_W04',
          'x-notion-page-id': 'page-123',
        }),
      };
      const res = createMockRes();

      runChain({
        req,
        res,
        handlers: [auth, validateNotionPageId, validateSprintNameRequest, handleSprintNameAsync],
      });

      expect(res.statusCode).toBe(429);
      expect(res.body).toEqual({ error: expect.any(String) });
    });
  });

  test('missing auth token -> 401 + { error }', () => {
    jest.isolateModules(() => {
      jest.doMock('../../../lib/notion-api', () => {
        const actual = jest.requireActual('../../../lib/notion-api');
        return {
          ...actual,
          updateNotionPage: jest.fn(async () => ({ status: 200, body: {} })),
        };
      });

      const { handleSprintNameAsync } = require('./sprint-name-async');

      const expectedToken = 'expected-token';
      const auth = createNotionAuthMiddleware(expectedToken);

      const req = {
        requestId: 'req-3',
        body: {},
        get: headerGetter({
          'x-notion-sprint-seed': '2026_W04',
          'x-notion-page-id': 'page-123',
        }),
      };
      const res = createMockRes();

      runChain({
        req,
        res,
        handlers: [auth, validateNotionPageId, validateSprintNameRequest, handleSprintNameAsync],
      });

      expect(res.statusCode).toBe(401);
      expect(res.body).toEqual({ error: expect.any(String) });
    });
  });

  test('missing page id -> 400 + { error }', () => {
    jest.isolateModules(() => {
      jest.doMock('../../../lib/notion-api', () => {
        const actual = jest.requireActual('../../../lib/notion-api');
        return {
          ...actual,
          updateNotionPage: jest.fn(async () => ({ status: 200, body: {} })),
        };
      });

      const { handleSprintNameAsync } = require('./sprint-name-async');

      const expectedToken = 'expected-token';
      const auth = createNotionAuthMiddleware(expectedToken);

      const req = {
        requestId: 'req-4',
        body: {},
        get: headerGetter({
          'x-notion-automations-token': expectedToken,
          'x-notion-sprint-seed': '2026_W04',
        }),
      };
      const res = createMockRes();

      runChain({
        req,
        res,
        handlers: [auth, validateNotionPageId, validateSprintNameRequest, handleSprintNameAsync],
      });

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: expect.any(String) });
    });
  });

  test('invalid seed format -> 400 + { error }', () => {
    jest.isolateModules(() => {
      jest.doMock('../../../lib/notion-api', () => {
        const actual = jest.requireActual('../../../lib/notion-api');
        return {
          ...actual,
          updateNotionPage: jest.fn(async () => ({ status: 200, body: {} })),
        };
      });

      const { handleSprintNameAsync } = require('./sprint-name-async');

      const expectedToken = 'expected-token';
      const auth = createNotionAuthMiddleware(expectedToken);

      const req = {
        requestId: 'req-5',
        body: {},
        get: headerGetter({
          'x-notion-automations-token': expectedToken,
          'x-notion-sprint-seed': '2026-W04',
          'x-notion-page-id': 'page-123',
        }),
      };
      const res = createMockRes();

      runChain({
        req,
        res,
        handlers: [auth, validateNotionPageId, validateSprintNameRequest, handleSprintNameAsync],
      });

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({ error: expect.any(String) });
    });
  });
});

