const express = require('express');
const { getNotionAutomationsToken } = require('../../../config/env');
const { createNotionAuthMiddleware, validateSprintNameRequest } = require('./middleware');
const { handleSprintName } = require('./sprint-name');

const router = express.Router();

const notionToken = getNotionAutomationsToken();

// Apply auth middleware to all Notion v1 routes.
router.use(createNotionAuthMiddleware(notionToken));

router.post('/sprint-name', validateSprintNameRequest, handleSprintName);

module.exports = router;

