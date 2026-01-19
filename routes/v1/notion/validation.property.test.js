const fc = require('fast-check');
const { validateSprintNameRequest } = require('./middleware');

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

describe('Notion sprint-name request validation (property tests)', () => {
  test('Property 4: missing/empty seed -> 400 + JSON { error: string } indicating seed requirement', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // Missing seed
          fc.record({}, { withDeletedKeys: true }),
          // Explicitly null/undefined seed
          fc.record({ seed: fc.oneof(fc.constant(null), fc.constant(undefined)) }),
          // Whitespace-only seed
          fc
            .string({ minLength: 1, maxLength: 200 })
            .filter((s) => s.trim() === '')
            .map((seed) => ({ seed }))
        ),
        (body) => {
          const req = { body };
          const res = createMockRes();
          const next = jest.fn();

          validateSprintNameRequest(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(res.statusCode).toBe(400);
          expect(res.body).toEqual({ error: expect.any(String) });
          expect(res.body.error.trim()).not.toBe('');
          // "Indicating seed requirement" across both missing and whitespace cases.
          expect(res.body.error).toContain('`seed`');
        }
      ),
      { numRuns: 200 }
    );
  });
});

