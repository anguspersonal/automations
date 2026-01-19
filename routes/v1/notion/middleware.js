function createNotionAuthMiddleware(expectedToken) {
  return function notionAuthMiddleware(req, res, next) {
    const token = req.get('x-notion-automations-token');

    if (!token) {
      return res.status(401).json({ error: 'Missing X-Notion-Automations-Token header' });
    }

    if (token !== expectedToken) {
      return res.status(401).json({ error: 'Invalid X-Notion-Automations-Token' });
    }

    return next();
  };
}

function validateSprintNameRequest(req, res, next) {
  // Prefer header-based seed for easier invocation from no-code tools.
  // Backwards-compatible fallback: allow seed in JSON body.
  const headerSeed = req.get('x-notion-sprint-seed');
  const body = req.body;
  const bodySeed =
    body && typeof body === 'object' && !Array.isArray(body) ? body.seed : undefined;

  const seed = headerSeed !== undefined && headerSeed !== null ? headerSeed : bodySeed;

  if (seed === undefined || seed === null) {
    return res.status(400).json({ error: '`seed` is required' });
  }

  if (typeof seed !== 'string') {
    return res.status(400).json({ error: '`seed` must be a string' });
  }

  if (seed.trim() === '') {
    return res.status(400).json({ error: '`seed` must be a non-empty string' });
  }

  // Normalize for downstream handler (which reads req.body.seed).
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    req.body = {};
  }
  req.body.seed = seed;

  return next();
}

function extractPageIdFromRequest(req) {
  const header = req.get('x-notion-page-id');
  if (typeof header === 'string' && header.trim() !== '') return header.trim();

  const body = req && req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;

  // Support a few common shapes from automation tools.
  if (typeof body.page_id === 'string' && body.page_id.trim() !== '') return body.page_id.trim();
  if (typeof body.pageId === 'string' && body.pageId.trim() !== '') return body.pageId.trim();
  if (typeof body.id === 'string' && body.id.trim() !== '') return body.id.trim();
  if (body.page && typeof body.page.id === 'string' && body.page.id.trim() !== '') return body.page.id.trim();

  return undefined;
}

function validateNotionPageId(req, res, next) {
  const pageId = extractPageIdFromRequest(req);
  if (!pageId) {
    return res.status(400).json({ error: '`page_id` is required' });
  }

  req.notionPageId = pageId;
  return next();
}

module.exports = {
  createNotionAuthMiddleware,
  validateSprintNameRequest,
  validateNotionPageId,
};

