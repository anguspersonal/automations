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
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Request body must be a JSON object' });
  }

  const seed = body.seed;

  if (seed === undefined || seed === null) {
    return res.status(400).json({ error: '`seed` is required' });
  }

  if (typeof seed !== 'string') {
    return res.status(400).json({ error: '`seed` must be a string' });
  }

  if (seed.trim() === '') {
    return res.status(400).json({ error: '`seed` must be a non-empty string' });
  }

  return next();
}

module.exports = {
  createNotionAuthMiddleware,
  validateSprintNameRequest,
};

