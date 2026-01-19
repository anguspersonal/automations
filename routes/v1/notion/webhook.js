const crypto = require('crypto');

function safeJsonStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, val) => {
    if (typeof val !== 'object' || val === null) return val;
    if (seen.has(val)) return '[Circular]';
    seen.add(val);
    return val;
  });
}

function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function getHeader(req, name) {
  if (req && typeof req.get === 'function') return req.get(name);
  const key = String(name).toLowerCase();
  const headers = req && req.headers;
  if (!headers || typeof headers !== 'object') return undefined;
  return headers[key];
}

function computeNotionSignature({ verificationToken, rawBody }) {
  const digest = crypto.createHmac('sha256', verificationToken).update(rawBody).digest('hex');
  return `sha256=${digest}`;
}

function isValidNotionSignature({ verificationToken, rawBody, providedSignature }) {
  if (!verificationToken || typeof verificationToken !== 'string') return false;
  if (typeof rawBody !== 'string') return false;
  if (typeof providedSignature !== 'string') return false;

  const expected = computeNotionSignature({ verificationToken, rawBody });
  return timingSafeEqualString(expected, providedSignature);
}

function getNotionWebhookVerificationToken() {
  const token = process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN;
  if (!token || String(token).trim() === '') return undefined;
  return String(token).trim();
}

function handleNotionWebhook(req, res) {
  try {
    const body = req && req.body;

    // Step 2 (subscription verification) — Notion sends a one-time token.
    if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.verification_token === 'string') {
      const log = {
        msg: 'notion webhook verification token received',
        // Intentionally include the token so you can copy it from logs during setup.
        verification_token: body.verification_token,
      };
      console.log(safeJsonStringify(log));
      return res.status(200).json({ ok: true });
    }

    const verificationToken = getNotionWebhookVerificationToken();
    const signature = getHeader(req, 'x-notion-signature');

    // For non-verification payloads, validate signature if configured.
    if (verificationToken) {
      const rawBody = typeof req.rawBody === 'string' ? req.rawBody : JSON.stringify(body ?? {});
      const valid = isValidNotionSignature({
        verificationToken,
        rawBody,
        providedSignature: signature,
      });

      if (!valid) {
        const log = {
          level: 'warn',
          msg: 'notion webhook signature mismatch',
          has_signature: typeof signature === 'string' && signature.trim() !== '',
        };
        console.warn(safeJsonStringify(log));
        return res.status(401).json({ error: 'Invalid Notion webhook signature' });
      }
    }

    // Minimal, safe observability for events.
    const eventType = body && typeof body === 'object' && !Array.isArray(body) ? body.type : undefined;
    const entityId =
      body && typeof body === 'object' && !Array.isArray(body) && body.entity && typeof body.entity === 'object'
        ? body.entity.id
        : undefined;

    console.log(
      safeJsonStringify({
        msg: 'notion webhook event received',
        type: eventType,
        entity_id: entityId,
      })
    );

    // Always acknowledge quickly; any heavy work should be queued.
    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  handleNotionWebhook,
  // exported for tests/debugging if needed
  computeNotionSignature,
  isValidNotionSignature,
};

