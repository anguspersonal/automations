const crypto = require('crypto');

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
}

function isTruthyEnv(value) {
  if (value === true) return true;
  if (value === false) return false;
  if (value === undefined || value === null) return false;
  const v = String(value).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'on';
}

function safeJsonStringify(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, val) => {
    if (typeof val !== 'object' || val === null) return val;
    if (seen.has(val)) return '[Circular]';
    seen.add(val);
    return val;
  });
}

function sanitizeHeaders(headers) {
  const redactedHeaderNames = new Set([
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-notion-automations-token',
  ]);

  const out = {};
  if (!headers || typeof headers !== 'object') return out;

  for (const [rawKey, rawValue] of Object.entries(headers)) {
    const key = String(rawKey).toLowerCase();
    if (redactedHeaderNames.has(key) || key.includes('token') || key.includes('secret')) {
      out[key] = '<redacted>';
      continue;
    }

    if (Array.isArray(rawValue)) {
      out[key] = rawValue.map(v => (typeof v === 'string' ? v : String(v)));
    } else if (typeof rawValue === 'string') {
      out[key] = rawValue;
    } else if (rawValue === undefined) {
      // omit
    } else {
      out[key] = String(rawValue);
    }
  }

  return out;
}

function sanitizeBody(value, opts = {}) {
  const maxStringLength = typeof opts.maxStringLength === 'number' ? opts.maxStringLength : 2000;
  const maxArrayLength = typeof opts.maxArrayLength === 'number' ? opts.maxArrayLength : 100;
  const maxDepth = typeof opts.maxDepth === 'number' ? opts.maxDepth : 6;
  const redactKeyPattern =
    opts.redactKeyPattern instanceof RegExp
      ? opts.redactKeyPattern
      : /(token|secret|password|authorization|cookie|api[_-]?key)/i;

  function inner(v, depth) {
    if (v === null || v === undefined) return v;

    const t = typeof v;
    if (t === 'string') {
      if (v.length <= maxStringLength) return v;
      return `${v.slice(0, maxStringLength)}…<truncated>`;
    }
    if (t === 'number' || t === 'boolean') return v;
    if (t === 'bigint') return String(v);
    if (t === 'function') return '[Function]';
    if (t !== 'object') return String(v);

    if (depth >= maxDepth) return '[MaxDepth]';

    if (Array.isArray(v)) {
      const slice = v.slice(0, maxArrayLength);
      const mapped = slice.map(item => inner(item, depth + 1));
      if (v.length > maxArrayLength) mapped.push(`…<${v.length - maxArrayLength} more items>`);
      return mapped;
    }

    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (redactKeyPattern.test(k)) {
        out[k] = '<redacted>';
      } else {
        out[k] = inner(val, depth + 1);
      }
    }
    return out;
  }

  return inner(value, 0);
}

function createLoggingMiddleware() {
  return function loggingMiddleware(req, res, next) {
    const start = process.hrtime.bigint();

    if (!req.requestId) {
      req.requestId = createRequestId();
    }

    res.on('finish', () => {
      const end = process.hrtime.bigint();
      const latencyMs = Number(end - start) / 1e6;

      const log = {
        request_id: req.requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        latency_ms: Math.round(latencyMs),
      };

      // Structured log line for easy ingestion.
      console.log(JSON.stringify(log));
    });

    next();
  };
}

function createIncomingRequestDebugMiddleware(options = {}) {
  const enabled = isTruthyEnv(options.enabled);
  const onlyMethods = Array.isArray(options.onlyMethods) ? options.onlyMethods : ['POST'];
  const label = typeof options.label === 'string' ? options.label : 'incoming_request_debug';
  const extra = typeof options.extra === 'function' ? options.extra : undefined;

  return function incomingRequestDebugMiddleware(req, res, next) {
    if (!enabled) return next();
    if (onlyMethods.length > 0 && !onlyMethods.includes(req.method)) return next();

    const log = {
      request_id: req.requestId || createRequestId(),
      label,
      method: req.method,
      path: req.originalUrl || req.url,
      ip: req.ip,
      content_type: req.get ? req.get('content-type') : undefined,
      headers: sanitizeHeaders(req.headers),
      body: sanitizeBody(req.body, options.bodySanitizer),
      raw_body: typeof req.rawBody === 'string' ? sanitizeBody(req.rawBody, options.bodySanitizer) : undefined,
      extra: extra ? sanitizeBody(extra(req), options.bodySanitizer) : undefined,
    };

    console.log(safeJsonStringify(log));
    return next();
  };
}

module.exports = {
  createLoggingMiddleware,
  createIncomingRequestDebugMiddleware,
};

