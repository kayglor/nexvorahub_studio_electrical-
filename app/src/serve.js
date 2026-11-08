// Local preview server: node serve.js  ->  http://localhost:5179/
// Serves the app (load-designer.html) at "/", the other files in site/ (legal pages), and applies the
// "/*" response headers from site/_headers so the Content-Security-Policy is tested exactly as Cloudflare Pages serves it.
const http = require('http'), fs = require('fs'), path = require('path');
const app = path.join(__dirname, '..', 'load-designer.html'), site = path.join(__dirname, '..', '..', 'site');
function siteHeaders() {
  const out = {}; let block = null;
  try {
    for (const line of fs.readFileSync(path.join(site, '_headers'), 'utf8').split(/\r?\n/)) {
      if (!line.trim() || line.trim().startsWith('#')) continue;
      if (!/^\s/.test(line)) { block = line.trim(); continue; }
      const m = line.trim().match(/^([^:]+):\s*(.*)$/); if (m && block === '/*') out[m[1]] = m[2];
    }
  } catch (e) { }
  return out;
}
http.createServer((req, res) => {
  const name = decodeURIComponent((req.url || '/').split('?')[0]).replace(/^\/+/, '');
  const file = !name || name === 'index.html' ? app : path.join(site, path.basename(name));
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': /\.html$/.test(file) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', ...siteHeaders() });
    res.end(buf);
  });
}).listen(5179, () => console.log('serving on http://localhost:5179/'));
