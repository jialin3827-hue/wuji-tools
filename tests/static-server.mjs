import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ics': 'text/calendar; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function resolvePath(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch (e) {
    return null;
  }
  const resolved = path.resolve(root, '.' + decoded);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function allowLocal(html) {
  return html.replace(/(<script\b[^>]*\bcount\.js\b[^>]*?)(>)/gi, (match, head, tail) => {
    if (/\bdata-goatcounter-allow-local\b/.test(head)) return match;
    return head + ' data-goatcounter-allow-local' + tail;
  });
}

export async function startServer() {
  const server = http.createServer(async (req, res) => {
    try {
      let filePath = resolvePath(req.url || '/');
      if (!filePath) {
        res.writeHead(400).end('bad path');
        return;
      }
      let info;
      try {
        info = await fs.stat(filePath);
      } catch (e) {
        res.writeHead(404).end('not found');
        return;
      }
      if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
      const ext = path.extname(filePath).toLowerCase();
      let body = await fs.readFile(filePath);
      if (ext === '.html') body = Buffer.from(allowLocal(body.toString('utf8')), 'utf8');
      res.writeHead(200, {
        'Content-Type': types[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500).end('server error');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}
