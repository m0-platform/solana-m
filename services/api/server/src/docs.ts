import express from 'express';
import spec from '../openapi/openapi.json';

export const docs = express.Router();

// https://github.com/scalar/scalar
docs.get('/', (req, res) => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:5500';

  res.send(`
    <!doctype html>
    <html>
    <head>
      <title>M0 Solana API Reference</title>
      <link rel="icon" type="image/x-icon" href="https://dashboard.m0.org/img/logos/m0.svg">
      <meta charset="utf-8" />
      <meta
        name="viewport"
        content="width=device-width, initial-scale=1" />
    </head>

    <body>
      <div id="app"></div>

      <!-- Load the Script -->
      <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>

      <!-- Initialize the Scalar API Reference -->
      <script>
      Scalar.createApiReference('#app', {
          url: '${baseUrl}/docs/schema.json',
      })
      </script>
    </body>
    </html>
  `);
});

// OpenAPI spec
docs.get('/schema.json', (req, res) => {
  spec.info.title = 'M0 Solana API';
  res.json(spec);
});
