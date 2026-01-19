const express = require('express');
const { handleNotionWebhook } = require('./webhook');
const { createLoggingMiddleware, createIncomingRequestDebugMiddleware } = require('../../../lib/logging');

const router = express.Router();

// Basic observability for all Notion endpoints.
router.use(createLoggingMiddleware());

// Optional debug logging for incoming Notion POST payloads.
// Enable with DEBUG_NOTION_REQUESTS=1 (or "true").
router.use(
  createIncomingRequestDebugMiddleware({
    enabled: process.env.DEBUG_NOTION_REQUESTS,
    onlyMethods: ['POST'],
    label: 'notion_incoming',
    extra: (req) => {
      // Surface our best guess of page id / seed locations without blocking the request.
      const headerPageId = req.get ? req.get('x-notion-page-id') : undefined;
      const headerSeed = req.get ? req.get('x-notion-sprint-seed') : undefined;

      const body = req && req.body;
      const bodyPageId =
        body && typeof body === 'object' && !Array.isArray(body)
          ? body.page_id || body.pageId || body.id || (body.page && body.page.id)
          : undefined;
      const bodySeed =
        body && typeof body === 'object' && !Array.isArray(body) ? body.seed : undefined;

      return {
        page_id_candidate: headerPageId || bodyPageId,
        seed_candidate: headerSeed !== undefined && headerSeed !== null ? headerSeed : bodySeed,
      };
    },
  })
);

// Notion Webhooks (subscription delivery) — must NOT require our automations token header.
router.post('/webhook', handleNotionWebhook);

module.exports = router;

