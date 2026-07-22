const path = require('path');
const http = require('http');
const serveHandler = require('serve-handler');
const { handleClientUpdateApi } = require('./client-update-api.cjs');
const { handleGidgetApi } = require('./gidget-api.cjs');
const { createProductSourceHandler } = require('./product-source-api.cjs');

require('./write-runtime-config.cjs');
if (process.exitCode) process.exit(process.exitCode);

const rawPort = String(process.env.PORT || '3000').trim();
const port = /^\d+$/.test(rawPort) ? rawPort : '3000';
const publicDir = path.join(process.cwd(), 'dist');
const handleProductSource = createProductSourceHandler({
  supabaseUrl: String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ''),
  publishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || ''),
});

console.log(`Starting GadgetBoy POS web server on 0.0.0.0:${port}`);
const server = http.createServer(async (req, res) => {
  try {
    if (await handleClientUpdateApi(req, res)) return;
    if (await handleGidgetApi(req, res)) return;
    if (await handleProductSource(req, res)) return;
    await serveHandler(req, res, {
      public: publicDir,
      cleanUrls: true,
    });
  } catch (error) {
    console.error('Web request failed:', error?.message || error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    }
    if (!res.writableEnded) res.end('Internal Server Error');
  }
});

server.on('error', (error) => {
  console.error('Web server failed to start:', error?.message || error);
  process.exit(1);
});

server.listen(Number(port), '0.0.0.0');

function shutdown(signal) {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
  console.log(`Received ${signal}; stopping web server.`);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
