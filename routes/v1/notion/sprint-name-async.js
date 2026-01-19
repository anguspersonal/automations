const crypto = require('crypto');
const { getNameGenerator } = require('../../../lib/name-generator');
const { enqueueJob } = require('../../../lib/async-jobs');
const { buildRichTextProperty, updateNotionPage } = require('../../../lib/notion-api');
const {
  getNotionApiToken,
  getNotionVersion,
  getNotionSprintNameProperty,
  getNotionSprintSlugProperty,
  getNotionSprintGeneratorVersionProperty,
} = require('../../../config/env');

function getRequestId(req) {
  const candidate = req && req.requestId;
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

async function applySprintNameToNotionPage({ pageId, seed }) {
  const notionApiToken = getNotionApiToken();
  const notionVersion = getNotionVersion();

  const generator = getNameGenerator();
  const result = generator.generate(seed);

  const props = {};

  const nameProp = getNotionSprintNameProperty();
  if (nameProp && String(nameProp).trim() !== '') {
    props[nameProp] = buildRichTextProperty(result.name);
  }

  const slugProp = getNotionSprintSlugProperty();
  if (slugProp && String(slugProp).trim() !== '') {
    props[slugProp] = buildRichTextProperty(result.slug);
  }

  const verProp = getNotionSprintGeneratorVersionProperty();
  if (verProp && String(verProp).trim() !== '') {
    props[verProp] = buildRichTextProperty(result.generator_version);
  }

  return updateNotionPage({
    notionApiToken,
    notionVersion,
    pageId,
    properties: props,
  });
}

function logAsyncNotionFailure({ requestId, pageId }, err) {
  const payload = {
    level: 'error',
    msg: 'notion sprint-name async job failed',
    request_id: requestId,
    page_id: pageId,
    error: {
      message: err && err.message ? String(err.message) : 'Unknown error',
      status: err && err.status ? err.status : undefined,
      response_body: err && err.response ? err.response.body : undefined,
    },
  };

  console.error(JSON.stringify(payload));
}

function handleSprintNameAsync(req, res) {
  try {
    const requestId = getRequestId(req);
    const pageId = req.notionPageId;
    const seed = req.body && req.body.seed;

    // Enqueue background work before responding; but do not wait for it.
    const result = enqueueJob(() => applySprintNameToNotionPage({ pageId, seed }), {
      onError: (err) => logAsyncNotionFailure({ requestId, pageId }, err),
    });

    if (!result.accepted) {
      return res.status(429).json({ error: 'Server is busy, try again later' });
    }

    // Notion doesn't consume the response body; return quickly.
    return res.status(202).json({ request_id: requestId });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  handleSprintNameAsync,
};

