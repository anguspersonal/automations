const fc = require('fast-check');
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

function validSeedArb() {
  return fc
    .tuple(fc.integer({ min: 2000, max: 2099 }), fc.integer({ min: 0, max: 53 }))
    .map(([year, week]) => `${year}_W${String(week).padStart(2, '0')}`);
}

describe('Notion sprint-name async endpoint (property tests)', () => {
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

  test('Property 3: accept response has correct shape', () => {
    jest.isolateModules(() => {
      // Avoid queue saturation during property runs. We only care about the HTTP response contract here.
      jest.doMock('../../../lib/async-jobs', () => ({
        enqueueJob: (fn, opts) => {
          Promise.resolve()
            .then(fn)
            .catch((err) => {
              if (opts && typeof opts.onError === 'function') opts.onError(err);
            });
          return { accepted: true };
        },
      }));

      jest.doMock('../../../lib/notion-api', () => {
        const actual = jest.requireActual('../../../lib/notion-api');
        return {
          ...actual,
          updateNotionPage: jest.fn(async () => ({ status: 200, body: {} })),
        };
      });

      const { handleSprintNameAsync } = require('./sprint-name-async');

      fc.assert(
        fc.property(
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((t) => t.trim() !== '' && t === t.trim()),
          validSeedArb(),
          fc
            .string({ minLength: 1, maxLength: 80 })
            .filter((s) => s.trim() !== ''),
          (expectedToken, seed, pageId) => {
            const auth = createNotionAuthMiddleware(expectedToken);
            const req = {
              requestId: undefined,
              body: {},
              get: headerGetter({
                'x-notion-automations-token': expectedToken,
                'x-notion-sprint-seed': seed,
                'x-notion-page-id': pageId,
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
          }
        ),
        { numRuns: 200 }
      );
    });
  });

  test('Property 4: deterministic title formatting', () => {
    jest.isolateModules(() => {
      const { getNameGenerator } = require('../../../lib/name-generator');
      const { formatSprintTitle } = require('./sprint-name-async');

      fc.assert(
        fc.property(validSeedArb(), (seed) => {
          process.env.GENERATOR_VERSION = 'test-title-1';
          const generator = getNameGenerator();

          const a = generator.generate(seed);
          const b = generator.generate(seed);

          const titleA = formatSprintTitle({ slug: a.slug, seed });
          const titleB = formatSprintTitle({ slug: b.slug, seed });

          expect(titleA).toBe(`Sprint ${a.slug} - ${seed}`);
          expect(titleB).toBe(`Sprint ${b.slug} - ${seed}`);
          expect(titleA).toBe(titleB);
        }),
        { numRuns: 200 }
      );
    });
  });
});

