function getQueue() {
  const key = '__automations_async_job_queue__';
  if (!globalThis[key]) {
    globalThis[key] = {
      pending: 0,
      maxPending: Number(process.env.ASYNC_MAX_PENDING || 50),
    };
  }
  return globalThis[key];
}

function enqueueJob(fn) {
  const q = getQueue();
  if (q.pending >= q.maxPending) {
    return { accepted: false, reason: 'queue_full' };
  }

  q.pending += 1;

  // Fire-and-forget: respond to Notion immediately, do work later.
  setImmediate(async () => {
    try {
      await fn();
    } catch (err) {
      // Best-effort logging only. Notion won't see these errors.
      console.error('async job failed', err);
    } finally {
      q.pending -= 1;
    }
  });

  return { accepted: true };
}

module.exports = {
  enqueueJob,
};

