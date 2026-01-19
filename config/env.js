function requireEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    const err = new Error(`Missing required environment variable: ${name}`);
    err.code = 'ERR_MISSING_ENV';
    throw err;
  }
  return value;
}

function getNotionApiToken() {
  return requireEnv('NOTION_API_TOKEN');
}

function getNotionVersion() {
  return process.env.NOTION_VERSION || '2022-06-28';
}

function getNotionSprintNameProperty() {
  return process.env.NOTION_SPRINT_NAME_PROPERTY || 'Sprint Name';
}

function getNotionSprintSlugProperty() {
  return process.env.NOTION_SPRINT_SLUG_PROPERTY || '';
}

function getNotionSprintGeneratorVersionProperty() {
  return process.env.NOTION_SPRINT_GENERATOR_VERSION_PROPERTY || '';
}

module.exports = {
  requireEnv,
  getNotionApiToken,
  getNotionVersion,
  getNotionSprintNameProperty,
  getNotionSprintSlugProperty,
  getNotionSprintGeneratorVersionProperty,
};

