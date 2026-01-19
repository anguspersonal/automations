function handleSprintName(req, res) {
  try {
    // Implemented in later tasks (generator + exact response schema).
    return res.status(501).json({ error: 'Not implemented' });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
}

module.exports = {
  handleSprintName,
};

