const crypto = require('crypto');

function createRequestId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return crypto.randomBytes(16).toString('hex');
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

module.exports = {
  createLoggingMiddleware,
};

