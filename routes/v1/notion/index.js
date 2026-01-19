const express = require('express');
const { getNotionAutomationsToken } = require('../../../config/env');
const { createNotionAuthMiddleware } = require('./middleware');

const router = express.Router();

const notionToken = getNotionAutomationsToken();

// Apply auth middleware to all Notion v1 routes.
router.use(createNotionAuthMiddleware(notionToken));

// Placeholder endpoint registration.
// The full handler (auth, validation, generator, observability) is implemented in later tasks.
router.post('/sprint-name', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;

