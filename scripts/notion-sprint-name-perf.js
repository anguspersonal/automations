const crypto = require('crypto');
const { createNotionAuthMiddleware, validateSprintNameRequest } = require('../routes/v1/notion/middleware');
const { handleSprintName } = require('../routes/v1/notion/sprint-name');

function nowNs() {
  return process.hrtime.bigint();
}

function nsToMs(ns) {
  return Number(ns) / 1e6;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarizeMs(valuesMs) {
  const sorted = valuesMs.slice().sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const avg = sorted.length ? sum / sorted.length : 0;
  return {
    n: sorted.length,
    min: sorted[0] ?? 0,
    avg,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1] ?? 0,
  };
}

function createMockRes() {
  const res = {
    statusCode: undefined,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

function runChain({ req, res, middlewares }) {
  let idx = 0;
  const next = (err) => {
    if (err) throw err;
    const fn = middlewares[idx++];
    if (!fn) return;
    return fn(req, res, next);
  };
  next();
}

function headerGetter(headers) {
  const normalized = {};
  for (const [k, v] of Object.entries(headers || {})) {
    normalized[String(k).toLowerCase()] = v;
  }
  return (key) => normalized[String(key).toLowerCase()];
}

function makeReq({ token, body }) {
  const headers = {};
  if (token !== undefined) headers['x-notion-automations-token'] = token;

  return {
    requestId: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'),
    body,
    get: headerGetter(headers),
    method: 'POST',
    originalUrl: '/v1/notion/sprint-name',
  };
}

function runCase({ name, token, body, expectedStatus }, iterations) {
  const expectedToken = 'perf-token';
  const auth = createNotionAuthMiddleware(expectedToken);

  const durationsMs = [];
  const statuses = new Map();

  for (let i = 0; i < iterations; i++) {
    const req = makeReq({ token, body });
    const res = createMockRes();

    const start = nowNs();
    runChain({
      req,
      res,
      middlewares: [auth, validateSprintNameRequest, handleSprintName],
    });
    const end = nowNs();

    durationsMs.push(nsToMs(end - start));
    statuses.set(res.statusCode, (statuses.get(res.statusCode) || 0) + 1);
  }

  const stats = summarizeMs(durationsMs);
  const statusLine = [...statuses.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([code, count]) => `${code}:${count}`)
    .join(' ');

  const ok = statuses.size === 1 && statuses.has(expectedStatus);

  return {
    name,
    ok,
    expectedStatus,
    statusLine,
    stats,
  };
}

function formatMs(ms) {
  return `${ms.toFixed(3)}ms`;
}

function main() {
  const iterations = Number(process.env.PERF_ITERS || 200);
  const warmup = Number(process.env.PERF_WARMUP || 25);

  console.log('Notion sprint-name performance smoke check (non-flaky)');
  console.log(`Iterations: ${iterations} (warmup: ${warmup})`);
  console.log('');

  // Warmup to reduce one-time effects (JIT, module init, etc.)
  runCase({ name: 'warmup (valid)', token: 'perf-token', body: { seed: '2026-W04' }, expectedStatus: 200 }, warmup);

  const cases = [
    { name: 'valid', token: 'perf-token', body: { seed: '2026-W04' }, expectedStatus: 200 },
    { name: 'auth missing token', token: undefined, body: { seed: '2026-W04' }, expectedStatus: 401 },
    { name: 'auth invalid token', token: 'wrong', body: { seed: '2026-W04' }, expectedStatus: 401 },
    { name: 'validation missing seed', token: 'perf-token', body: {}, expectedStatus: 400 },
    { name: 'validation empty seed', token: 'perf-token', body: { seed: '   ' }, expectedStatus: 400 },
  ];

  const results = cases.map((c) => runCase(c, iterations));

  for (const r of results) {
    const s = r.stats;
    console.log(`Case: ${r.name}`);
    console.log(`  Statuses: ${r.statusLine} (expected ${r.expectedStatus}) ${r.ok ? 'OK' : 'UNEXPECTED'}`);
    console.log(
      `  Latency: n=${s.n} min=${formatMs(s.min)} avg=${formatMs(s.avg)} p50=${formatMs(s.p50)} p95=${formatMs(
        s.p95
      )} max=${formatMs(s.max)}`
    );
  }

  // Non-flaky: no hard threshold exits. This is for human inspection and local comparisons.
}

main();

