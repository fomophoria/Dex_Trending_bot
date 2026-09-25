'use strict';

const http = require('node:http');

const HOST = process.env.MOCK_HOST || '127.0.0.1';
const PORT = Number.parseInt(process.env.MOCK_PORT || '3000', 10);

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DEX Lab Local Mock</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 40px; min-height: 180vh; }
    nav { display: flex; gap: 12px; position: sticky; top: 0; background: white; padding: 12px 0; }
    button { padding: 10px 14px; cursor: pointer; }
    #status { margin-top: 24px; font-weight: 700; }
  </style>
</head>
<body>
  <h1>DEX Lab Local Mock</h1>
  <p>This page exists only to exercise the local Playwright worker.</p>
  <nav>
    <button type="button">Transactions</button>
    <button type="button">Top Traders</button>
    <button type="button">Price</button>
  </nav>
  <div id="status">Ready</div>
  <script>
    document.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', () => {
        document.getElementById('status').textContent = 'Clicked: ' + button.textContent;
      });
    });
  </script>
</body>
</html>`;

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(html);
});

server.listen(PORT, HOST, () => {
    console.log(`Local mock listening on http://${HOST}:${PORT}`);
});

function shutdown() {
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
