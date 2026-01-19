const fc = require('fast-check');
const { validateNotionPageId } = require('./middleware');

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

describe('Notion page id validation (property tests)', () => {
  test('Property 2: missing page id -> 400 + JSON { error: string } indicating page_id requirement', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          // No body, no header
          fc.constant({ header: undefined, body: undefined }),
          // Empty object
          fc.constant({ header: undefined, body: {} }),
          // Explicitly null/undefined in supported shapes
          fc.constant({ header: undefined, body: { page_id: null } }),
          fc.constant({ header: undefined, body: { page_id: undefined } }),
          fc.constant({ header: undefined, body: { pageId: null } }),
          fc.constant({ header: undefined, body: { id: undefined } }),
          fc.constant({ header: undefined, body: { page: { id: null } } }),
          // Whitespace-only in supported shapes
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim() === '')
            .map((ws) => ({ header: undefined, body: { page_id: ws } })),
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim() === '')
            .map((ws) => ({ header: undefined, body: { pageId: ws } })),
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim() === '')
            .map((ws) => ({ header: undefined, body: { id: ws } })),
          fc
            .string({ minLength: 1, maxLength: 50 })
            .filter((s) => s.trim() === '')
            .map((ws) => ({ header: undefined, body: { page: { id: ws } } }))
        ),
        ({ header, body }) => {
          const req = {
            get: () => header,
            body,
          };
          const res = createMockRes();
          const next = jest.fn();

          validateNotionPageId(req, res, next);

          expect(next).not.toHaveBeenCalled();
          expect(res.statusCode).toBe(400);
          expect(res.body).toEqual({ error: expect.any(String) });
          expect(res.body.error.trim()).not.toBe('');
          expect(res.body.error).toContain('`page_id`');
        }
      ),
      { numRuns: 200 }
    );
  });
});

