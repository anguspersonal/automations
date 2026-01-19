const fc = require('fast-check');
const { handleSprintName } = require('./sprint-name');

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

describe('Notion sprint name (property tests)', () => {
  const globalKey = '__automations_name_generator_instance__';

  beforeAll(() => {
    // Lock generator_version for predictable assertions.
    process.env.GENERATOR_VERSION = 'prop-test-2';
    delete globalThis[globalKey];
  });

  afterAll(() => {
    delete globalThis[globalKey];
    delete process.env.GENERATOR_VERSION;
  });

  test('Property 2: response format compliance', () => {
    const expectedKeys = ['generator_version', 'name', 'request_id', 'slug'];
    const slugRegex = /^[a-z]+(?:-[a-z]+)+$/;

    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 200 })
          .filter((seed) => typeof seed === 'string' && seed.trim() !== ''),
        (seed) => {
          const req = { body: { seed } };
          const res = createMockRes();

          handleSprintName(req, res);

          expect(res.statusCode).toBe(200);
          expect(res.body).toEqual({
            request_id: expect.any(String),
            name: expect.any(String),
            slug: expect.any(String),
            generator_version: 'prop-test-2',
          });

          // "Exactly" these keys (no extras).
          expect(Object.keys(res.body).sort()).toEqual(expectedKeys);

          // request_id is a non-empty string.
          expect(res.body.request_id.trim()).not.toBe('');

          // name/slug relationship and slug formatting.
          expect(res.body.slug.trim()).not.toBe('');
          expect(res.body.name).toBe(`Sprint ${res.body.slug}`);
          expect(res.body.slug).toMatch(slugRegex);
          expect(res.body.slug).not.toMatch(/\s/);
        }
      ),
      { numRuns: 200 }
    );
  });
});

