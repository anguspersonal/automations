function requireEnv(name) {
  const value = process.env[name];
  if (!value || String(value).trim() === '') {
    const err = new Error(`Missing required environment variable: ${name}`);
    err.code = 'ERR_MISSING_ENV';
    throw err;
  }
  return value;
}

function getNotionAutomationsToken() {
  return requireEnv('NOTION_AUTOMATIONS_TOKEN');
}

module.exports = {
  requireEnv,
  getNotionAutomationsToken,
};

