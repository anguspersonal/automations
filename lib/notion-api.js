const https = require('https');

function requestJson({ method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);

    const req = https.request(
      {
        method,
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        headers,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          const status = res.statusCode || 0;
          const isJson = (res.headers['content-type'] || '').includes('application/json');
          const parsed = data && isJson ? safeJsonParse(data) : undefined;

          if (status >= 200 && status < 300) {
            return resolve({ status, body: parsed });
          }

          const err = new Error(`Notion API request failed: ${status}`);
          err.status = status;
          err.response = { body: parsed, raw: data };
          return reject(err);
        });
      }
    );

    req.on('error', reject);

    if (body) req.write(body);
    req.end();
  });
}

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return undefined;
  }
}

function buildRichTextProperty(content) {
  return {
    rich_text: [{ text: { content: String(content) } }],
  };
}

async function updateNotionPage({
  notionApiToken,
  notionVersion,
  pageId,
  properties,
}) {
  if (!pageId || String(pageId).trim() === '') {
    throw new Error('pageId is required');
  }

  return requestJson({
    method: 'PATCH',
    url: `https://api.notion.com/v1/pages/${encodeURIComponent(pageId)}`,
    headers: {
      Authorization: `Bearer ${notionApiToken}`,
      'Notion-Version': notionVersion,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
}

module.exports = {
  buildRichTextProperty,
  updateNotionPage,
};

