const crypto = require('crypto');
const { enqueueJob } = require('../../../lib/async-jobs');
const { getNameGenerator } = require('../../../lib/name-generator');
const {
  buildRichTextProperty,
  buildTitleProperty,
  retrieveNotionPage,
  updateNotionPage,
} = require('../../../lib/notion-api');
const {
  getNotionApiToken,
  getNotionVersion,
  getNotionSprintNameProperty,
  getNotionSprintSlugProperty,
  getNotionSprintGeneratorVersionProperty,
} = require('../../../config/env');

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

function getSprintDatabaseId() {
  const v = process.env.NOTION_SPRINTS_DATABASE_ID;
  if (!v || String(v).trim() === '') return undefined;
  return String(v).trim();
}

function getSprintDataSourceId() {
  const v = process.env.NOTION_SPRINTS_DATA_SOURCE_ID;
  if (!v || String(v).trim() === '') return undefined;
  return String(v).trim();
}

function getSprintSeedPropertyName() {
  const v = process.env.NOTION_SPRINT_SEED_PROPERTY;
  if (!v || String(v).trim() === '') return undefined;
  return String(v).trim();
}

function extractPlainTextFromRichTextArray(arr) {
  if (!Array.isArray(arr)) return '';
  return arr
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      if (typeof item.plain_text === 'string') return item.plain_text;
      if (item.text && typeof item.text === 'object' && typeof item.text.content === 'string') return item.text.content;
      return '';
    })
    .join('');
}

function extractSeedFromPageProperties(page) {
  const props = page && typeof page === 'object' ? page.properties : undefined;
  if (!props || typeof props !== 'object') return { seed: undefined, source: 'missing_properties' };

  const seedPropName = getSprintSeedPropertyName();
  if (seedPropName && props[seedPropName]) {
    const p = props[seedPropName];
    if (p && typeof p === 'object') {
      if (p.type === 'rich_text') return { seed: extractPlainTextFromRichTextArray(p.rich_text), source: `property:${seedPropName}` };
      if (p.type === 'title') return { seed: extractPlainTextFromRichTextArray(p.title), source: `property:${seedPropName}` };
      if (p.type === 'number' && typeof p.number === 'number') return { seed: String(p.number), source: `property:${seedPropName}` };
      if (p.type === 'select' && p.select && typeof p.select.name === 'string') return { seed: p.select.name, source: `property:${seedPropName}` };
    }
  }

  // Fallback: use the title property (Sprint Name property is expected to be title)
  const titlePropName = getNotionSprintNameProperty();
  if (titlePropName && props[titlePropName]) {
    const p = props[titlePropName];
    if (p && typeof p === 'object' && p.type === 'title') {
      return { seed: extractPlainTextFromRichTextArray(p.title), source: `title:${titlePropName}` };
    }
  }

  return { seed: undefined, source: 'not_found' };
}

function isoWeekSeedFromDate(d) {
  // ISO week date, seed format: YYYY_WNN
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay() || 7; // 1..7 (Mon..Sun)
  date.setUTCDate(date.getUTCDate() + 4 - day); // move to Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  const year = date.getUTCFullYear();
  const nn = String(weekNo).padStart(2, '0');
  return `${year}_W${nn}`;
}

function normalizeSeed(seed) {
  if (seed === undefined || seed === null) return undefined;
  const s = String(seed).trim();
  if (s === '') return undefined;
  return s;
}

function isValidSeedFormat(seed) {
  return typeof seed === 'string' && /^\d{4}_W\d{2}$/.test(seed.trim());
}

function formatSprintTitle({ slug, seed }) {
  return `Sprint ${slug} - ${seed}`;
}

async function applySprintNameToNotionPage({ pageId, seed, notionApiToken, notionVersion, existingPage }) {
  const generator = getNameGenerator();
  const result = generator.generate(seed);

  const props = {};

  const sprintTitle = formatSprintTitle({ slug: result.slug, seed });

  const nameProp = getNotionSprintNameProperty();
  if (nameProp && String(nameProp).trim() !== '') {
    props[nameProp] = buildTitleProperty(sprintTitle);
  }

  const slugProp = getNotionSprintSlugProperty();
  if (slugProp && String(slugProp).trim() !== '') {
    props[slugProp] = buildRichTextProperty(result.slug);
  }

  const verProp = getNotionSprintGeneratorVersionProperty();
  if (verProp && String(verProp).trim() !== '') {
    // Idempotency: if already set to current generator_version, skip.
    const page = existingPage && existingPage.body ? existingPage.body : undefined;
    const existingProps = page && page.properties ? page.properties : undefined;
    const existing = existingProps && existingProps[verProp];
    const existingVer =
      existing && typeof existing === 'object' && existing.type === 'rich_text'
        ? extractPlainTextFromRichTextArray(existing.rich_text)
        : undefined;
    if (typeof existingVer === 'string' && existingVer.trim() === result.generator_version) {
      return { skipped: true, reason: 'already_processed', generator_version: result.generator_version };
    }

    props[verProp] = buildRichTextProperty(result.generator_version);
  }

  await updateNotionPage({
    notionApiToken,
    notionVersion,
    pageId,
    properties: props,
  });

  return { skipped: false, slug: result.slug, generator_version: result.generator_version };
}

function logWebhookJobFailure(context, err) {
  console.error(
    safeJsonStringify({
      level: 'error',
      msg: 'notion webhook job failed',
      ...context,
      error: {
        message: err && err.message ? String(err.message) : 'Unknown error',
        status: err && err.status ? err.status : undefined,
        response_body: err && err.response ? err.response.body : undefined,
      },
    })
  );
}

function handleNotionWebhook(req, res) {
  try {
    const body = req && req.body;

    // Step 2 (subscription verification) — Notion sends a one-time token.
    if (body && typeof body === 'object' && !Array.isArray(body) && typeof body.verification_token === 'string') {
      const alreadyConfigured = typeof process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN === 'string'
        && process.env.NOTION_WEBHOOK_VERIFICATION_TOKEN.trim() !== '';

      const log = alreadyConfigured
        ? { msg: 'notion webhook verification token received' }
        : {
            msg: 'notion webhook verification token received',
            // Only log the token during initial setup (when not configured yet).
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

    const parent =
      body && typeof body === 'object' && !Array.isArray(body) && body.data && typeof body.data === 'object'
        ? body.data.parent
        : undefined;
    const parentId = parent && typeof parent === 'object' ? parent.id : undefined;
    const parentDataSourceId = parent && typeof parent === 'object' ? parent.data_source_id : undefined;

    console.log(
      safeJsonStringify({
        msg: 'notion webhook event received',
        type: eventType,
        entity_id: entityId,
      })
    );

    // Kick off async work for sprint pages on creation.
    if (eventType === 'page.created' && typeof entityId === 'string' && entityId.trim() !== '') {
      const sprintDbId = getSprintDatabaseId();
      const sprintDsId = getSprintDataSourceId();

      const isSprintParent =
        (sprintDbId && parentId && String(parentId) === sprintDbId) ||
        (sprintDsId && parentDataSourceId && String(parentDataSourceId) === sprintDsId) ||
        // If not configured, do not filter (safe default is configurable; keep permissive for now).
        (!sprintDbId && !sprintDsId);

      if (!isSprintParent) {
        // Ignore other databases/data-sources.
        return res.status(200).json({ ok: true });
      }

      const notionApiToken = getNotionApiToken();
      // Prefer the version Notion used to send the event (matches latest payload shapes).
      const notionVersion =
        body && typeof body === 'object' && typeof body.api_version === 'string' && body.api_version.trim() !== ''
          ? body.api_version.trim()
          : getNotionVersion();

      const eventId = body && typeof body === 'object' ? body.id : undefined;
      const eventTimestamp = body && typeof body === 'object' ? body.timestamp : undefined;

      const enqueueResult = enqueueJob(
        async () => {
          const page = await retrieveNotionPage({
            notionApiToken,
            notionVersion,
            pageId: entityId,
          });

          const { seed: rawSeed, source } = extractSeedFromPageProperties(page.body);
          let seed = normalizeSeed(rawSeed);
          if (!seed || !isValidSeedFormat(seed)) {
            // Fallback: compute from event timestamp (or now) using ISO week.
            const d = eventTimestamp ? new Date(eventTimestamp) : new Date();
            seed = isoWeekSeedFromDate(d);
          }

          if (!isValidSeedFormat(seed)) {
            console.log(
              safeJsonStringify({
                level: 'warn',
                msg: 'notion sprint seed invalid; skipping page update',
                page_id: entityId,
                seed,
                seed_source: source,
              })
            );
            return;
          }

          const result = await applySprintNameToNotionPage({
            pageId: entityId,
            seed,
            notionApiToken,
            notionVersion,
            existingPage: page,
          });

          console.log(
            safeJsonStringify({
              msg: 'notion sprint page updated',
              page_id: entityId,
              seed,
              seed_source: source,
              parent_id: parentId,
              parent_data_source_id: parentDataSourceId,
              ...result,
            })
          );
        },
        {
          onError: (err) =>
            logWebhookJobFailure(
              {
                event_id: eventId,
                event_type: eventType,
                page_id: entityId,
                parent_id: parentId,
                parent_data_source_id: parentDataSourceId,
              },
              err
            ),
        }
      );

      if (!enqueueResult.accepted) {
        // Still ack the webhook, but log queue pressure.
        console.warn(
          safeJsonStringify({
            level: 'warn',
            msg: 'notion webhook job queue full; skipping event',
            event_type: eventType,
            page_id: entityId,
            pending: enqueueResult.pending,
            maxPending: enqueueResult.maxPending,
          })
        );
      }
    }

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

