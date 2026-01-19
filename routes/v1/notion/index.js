const express = require('express');
const { getNotionAutomationsToken } = require('../../../config/env');
const { createNotionAuthMiddleware, validateNotionPageId, validateSprintNameRequest } = require('./middleware');
const { handleSprintName } = require('./sprint-name');
const { handleSprintNameAsync } = require('./sprint-name-async');
const { createLoggingMiddleware, createIncomingRequestDebugMiddleware } = require('../../../lib/logging');

const router = express.Router();

const notionToken = getNotionAutomationsToken();

// Basic observability for all Notion endpoints.
router.use(createLoggingMiddleware());

// Optional debug logging for incoming Notion POST payloads.
// Enable with DEBUG_NOTION_REQUESTS=1 (or "true").
router.use(
  createIncomingRequestDebugMiddleware({
    enabled: process.env.DEBUG_NOTION_REQUESTS,
    onlyMethods: ['POST'],
    label: 'notion_incoming',
  })
);

// Apply auth middleware to all Notion v1 routes.
router.use(createNotionAuthMiddleware(notionToken));

router.post('/sprint-name', validateSprintNameRequest, handleSprintName);
router.post('/sprint-name/async', validateNotionPageId, validateSprintNameRequest, handleSprintNameAsync);

module.exports = router;

