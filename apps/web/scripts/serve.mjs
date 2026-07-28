import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputDirectory = path.resolve(currentDirectory, '..', 'dist');
const port = Number.parseInt(process.env.PORT ?? '4173', 10);
const host = process.env.HOST ?? '127.0.0.1';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.map', 'application/json; charset=utf-8'],
]);

function safePath(requestPath) {
  const pathname = new URL(requestPath, 'http://localhost').pathname;
  const decoded = decodeURIComponent(pathname);
  const requested = decoded === '/' || decoded === '/status' ? '/index.html' : decoded;
  const candidate = path.resolve(outputDirectory, `.${requested}`);
  return candidate.startsWith(outputDirectory) ? candidate : path.join(outputDirectory, 'index.html');
}

const server = createServer(async (request, response) => {
  try {
    let filePath = safePath(request.url ?? '/');
    try {
      const details = await stat(filePath);
      if (!details.isFile()) filePath = path.join(outputDirectory, 'index.html');
    } catch {
      filePath = path.join(outputDirectory, 'index.html');
    }
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes.get(path.extname(filePath)) ?? 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') || filePath.endsWith('config.js') ? 'no-store' : 'public, max-age=3600',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
    });
    response.end(body);
  } catch {
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('MemoryOS portal could not be served.');
  }
});

server.listen(port, host, () => {
  process.stdout.write(`MemoryOS portal available at http://${host}:${port}\n`);
});
