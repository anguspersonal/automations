const express = require('express');

const router = express.Router();

// Placeholder endpoint registration.
// The full handler (auth, validation, generator, observability) is implemented in later tasks.
router.post('/sprint-name', (req, res) => {
  res.status(501).json({ error: 'Not implemented' });
});

module.exports = router;

