const { chromium } = require('playwright'); const fs = require('fs'); const http = require('http'); const path = require('path');
const root = __dirname; const out = process.argv[2] || 'shots'; const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); r.end(b); } }); }).listen(0, async () => {
  const port = srv.address().port; fs.mkdirSync(path.join(root, out), { recursive: true });
  const b = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'] });
  const pg = await (await b.newContext({ viewport: { width: 1920, height: 540 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await pg.goto(`http://localhost:${port}/index.html`); await pg.waitForFunction(() => window.ready, null, { timeout: 120000 });
  const n = await pg.evaluate(() => window.frameCount);
  for (let i = 0; i < n; i++) { if (only && !only.includes(i)) continue; await pg.evaluate((k) => window.renderFrame(k), i); await pg.locator('canvas').screenshot({ path: path.join(root, out, `a${String(i).padStart(3, '0')}.png`) }); }
  console.log('rendered', only ? only.length : n, 'errors', JSON.stringify(errs.slice(0, 5))); await b.close(); srv.close();
});
