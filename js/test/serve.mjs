// A static server on 127.0.0.1 for the browser tests: root, with or without COOP/COEP (cross-origin isolation),
// and the model file at any path ending in its name. -> { origin, close() }
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { basename, extname, join, normalize, sep } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.data': 'application/octet-stream', '.onnx': 'application/octet-stream',
};

export function serve(root, { isolated = true, model } = {}) {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/favicon.ico') { res.writeHead(204); return res.end(); } // the browser asks for one on every page
    let file = model && basename(path) === basename(model) ? model : normalize(join(root, path));
    if (file !== model && !file.startsWith(root + sep) && file !== root) { res.writeHead(403); return res.end(); }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      return res.end(`not found: ${path}`);
    }
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': statSync(file).size,
      'cache-control': 'no-store',
      ...(isolated && { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'require-corp' }),
    });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({
    origin: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }),
  })));
}
