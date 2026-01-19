const crypto = require('crypto');
const { getNameGenerator } = require('../../../lib/name-generator');

function getRequestId(req) {
  const candidate = req && req.requestId;
  if (typeof candidate === 'string' && candidate.trim() !== '') return candidate;
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function handleSprintName(req, res) {
  try {
    const { seed } = req.body;

    const generator = getNameGenerator();
    const result = generator.generate(seed);

    // Enforce the exact response schema used for Notion mapping.
    const slug = result.slug;
    const response = {
      request_id: getRequestId(req),
      name: `Sprint ${slug}`,
      slug,
      generator_version: result.generator_version,
    };

    return res.status(200).json(response);
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  handleSprintName,
};

