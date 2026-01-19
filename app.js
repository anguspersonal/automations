const express = require('express');
const path = require('path');
const indexRouter = require('./routes/index');
const notionRouter = require('./routes/v1/notion');

const app = express();
const PORT = process.env.PORT || 3000;

// Parse JSON request bodies (for API routes)
app.use(express.json());

// Normalize invalid JSON errors to our error schema
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({ error: 'Request body must be valid JSON' });
  }
  next(err);
});

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// Versioned API routes
app.use('/v1/notion', notionRouter);

// Use the router for handling routes
app.use('/', indexRouter);

// Catch-all route for handling 404 errors
app.use((req, res, next) => {
    res.status(404).sendFile(path.join(__dirname, 'views', '404.html'));
  });

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
