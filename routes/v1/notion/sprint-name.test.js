const { createNotionAuthMiddleware, validateSprintNameRequest } = require('./middleware');
const { handleSprintName } = require('./sprint-name');
const { getNameGenerator } = require('../../../lib/name-generator');

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

function createNextSpy() {
  const next = jest.fn();
  return next;
}

describe('Notion sprint name - auth middleware', () => {
  test('missing token -> 401 + JSON error', () => {
    const middleware = createNotionAuthMiddleware('expected-token');
    const req = {
      get: () => undefined,
    };
    const res = createMockRes();
    const next = createNextSpy();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Missing X-Notion-Automations-Token header' });
  });

  test('invalid token -> 401 + JSON error', () => {
    const middleware = createNotionAuthMiddleware('expected-token');
    const req = {
      get: () => 'wrong-token',
    };
    const res = createMockRes();
    const next = createNextSpy();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid X-Notion-Automations-Token' });
  });
});

describe('Notion sprint name - request validation middleware', () => {
  test('missing seed -> 400 + JSON error', () => {
    const req = { get: () => undefined, body: {} };
    const res = createMockRes();
    const next = createNextSpy();

    validateSprintNameRequest(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '`seed` is required' });
  });

  test('non-string seed -> 400 + JSON error', () => {
    const req = { get: () => undefined, body: { seed: 123 } };
    const res = createMockRes();
    const next = createNextSpy();

    validateSprintNameRequest(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '`seed` must be a string' });
  });

  test('empty seed -> 400 + JSON error', () => {
    const req = { get: () => undefined, body: { seed: '   ' } };
    const res = createMockRes();
    const next = createNextSpy();

    validateSprintNameRequest(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: '`seed` must be a non-empty string' });
  });

  test('seed from header passes and normalizes to req.body.seed', () => {
    const req = {
      get: (key) => (key === 'x-notion-sprint-seed' ? '2026-W04' : undefined),
      body: undefined,
    };
    const res = createMockRes();
    const next = createNextSpy();

    validateSprintNameRequest(req, res, next);

    expect(res.statusCode).toBeUndefined();
    expect(res.body).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ seed: '2026-W04' });
  });
});

describe('Notion sprint name - generator contract', () => {
  const globalKey = '__automations_name_generator_instance__';

  afterEach(() => {
    // Avoid cross-test coupling via module singleton.
    delete globalThis[globalKey];
    delete process.env.GENERATOR_VERSION;
  });

  test('returns name, slug, generator_version; name === "Sprint " + slug', () => {
    process.env.GENERATOR_VERSION = 'test-1';
    const generator = getNameGenerator();

    const result = generator.generate('seed-value');

    expect(result).toEqual({
      name: expect.any(String),
      slug: expect.any(String),
      generator_version: 'test-1',
    });
    expect(result.slug.trim()).not.toBe('');
    expect(result.name).toBe(`Sprint ${result.slug}`);
  });
});

describe('Notion sprint name - handler', () => {
  const globalKey = '__automations_name_generator_instance__';

  afterEach(() => {
    delete globalThis[globalKey];
    delete process.env.GENERATOR_VERSION;
  });

  test('returns request_id, name, slug, generator_version; request_id is non-empty', () => {
    process.env.GENERATOR_VERSION = 'test-2';
    const req = { body: { seed: 'seed-value' } };
    const res = createMockRes();

    handleSprintName(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      request_id: expect.any(String),
      name: expect.any(String),
      slug: expect.any(String),
      generator_version: 'test-2',
    });

    expect(res.body.request_id.trim()).not.toBe('');
    expect(res.body.slug.trim()).not.toBe('');
    expect(res.body.name).toBe(`Sprint ${res.body.slug}`);
  });
});

