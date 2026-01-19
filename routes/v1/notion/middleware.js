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

module.exports = {
  createNotionAuthMiddleware,
};

