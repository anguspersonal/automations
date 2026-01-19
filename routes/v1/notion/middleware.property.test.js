const fc = require('fast-check');
const { createNotionAuthMiddleware } = require('./middleware');

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

describe('Notion auth middleware (property tests)', () => {
  test('Property 3: missing/invalid token -> 401 + JSON { error: string }', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((expectedToken) => expectedToken.trim() !== '' && expectedToken === expectedToken.trim()),
        fc.oneof(
          // missing header
          fc.constant(undefined),
          fc.constant(null),
          fc.constant(''),
          fc.constant('   '),
          // invalid header value (anything != expectedToken)
          fc
            .string({ minLength: 0, maxLength: 100 })
            .filter((providedToken) => providedToken !== undefined && providedToken !== null)
        ),
        (expectedToken, providedToken) => {
          const auth = createNotionAuthMiddleware(expectedToken);

          const req = {
            get: () => providedToken,
          };
          const res = createMockRes();
          const next = jest.fn();

          auth(req, res, next);

          if (typeof providedToken === 'string' && providedToken === expectedToken) {
            // The property only targets missing/invalid token cases; allow the valid case to pass through.
            expect(next).toHaveBeenCalledTimes(1);
            return;
          }

          expect(next).not.toHaveBeenCalled();
          expect(res.statusCode).toBe(401);
          expect(res.body).toEqual({ error: expect.any(String) });
          expect(res.body.error.trim()).not.toBe('');
        }
      ),
      { numRuns: 200 }
    );
  });

  test('Property 3a: valid token with surrounding whitespace authenticates', () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 100 })
          .filter((expectedToken) => expectedToken.trim() !== '' && expectedToken === expectedToken.trim()),
        fc
          .string({ minLength: 1, maxLength: 10 })
          .filter((s) => s.trim() === ''),
        fc
          .string({ minLength: 1, maxLength: 10 })
          .filter((s) => s.trim() === ''),
        (expectedToken, leftWs, rightWs) => {
          const auth = createNotionAuthMiddleware(expectedToken);

          const req = {
            get: () => `${leftWs}${expectedToken}${rightWs}`,
          };
          const res = createMockRes();
          const next = jest.fn();

          auth(req, res, next);

          expect(res.statusCode).toBeUndefined();
          expect(res.body).toBeUndefined();
          expect(next).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 200 }
    );
  });
});

