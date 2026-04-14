const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const HOST = process.env.HOST || '127.0.0.1';
const DEFAULT_PORT = Number.parseInt(process.env.PORT || '3000', 10);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_PATH = path.join(DATA_DIR, 'registrations.db');
const MAX_BODY_SIZE = 8 * 1024 * 1024;
const MAX_SCREENSHOT_SIZE = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp'
]);

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.jfif': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp'
};

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS registrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    paper_id TEXT NOT NULL,
    first_author_name TEXT NOT NULL,
    screenshot_file_name TEXT NOT NULL,
    screenshot_mime_type TEXT NOT NULL,
    screenshot_size INTEGER NOT NULL,
    screenshot_blob BLOB NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

const insertRegistration = db.prepare(`
  INSERT INTO registrations (
    paper_id,
    first_author_name,
    screenshot_file_name,
    screenshot_mime_type,
    screenshot_size,
    screenshot_blob
  ) VALUES (?, ?, ?, ?, ?, ?)
`);

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(text)
  });
  res.end(text);
}

function normalizeRoute(pathname) {
  if (pathname === '/') {
    return '/index.html';
  }

  if (pathname === '/registration') {
    return '/registration.html';
  }

  return pathname;
}

function safeJoin(root, requestPath) {
  const relativePath = requestPath.replace(/^\/+/, '');
  const fullPath = path.normalize(path.join(root, relativePath));
  const relativeToRoot = path.relative(root, fullPath);

  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) {
    return null;
  }

  return fullPath;
}

function collectJsonBody(req) {
  return new Promise((resolve, reject) => {
    let totalSize = 0;
    const chunks = [];

    req.on('data', (chunk) => {
      totalSize += chunk.length;

      if (totalSize > MAX_BODY_SIZE) {
        reject(new Error('Request body is too large.'));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', () => {
      reject(new Error('Unable to read request body.'));
    });
  });
}

function decodeScreenshot(base64Data) {
  const normalized = String(base64Data || '').replace(/\s+/g, '');

  if (!normalized) {
    throw new Error('Payment Screenshot is required.');
  }

  const buffer = Buffer.from(normalized, 'base64');

  if (!buffer.length) {
    throw new Error('Payment Screenshot is invalid.');
  }

  const canonical = buffer.toString('base64').replace(/=+$/u, '');
  const comparable = normalized.replace(/=+$/u, '');

  if (canonical !== comparable) {
    throw new Error('Payment Screenshot is invalid.');
  }

  if (buffer.length > MAX_SCREENSHOT_SIZE) {
    throw new Error('Payment Screenshot must be smaller than 5 MB.');
  }

  return buffer;
}

async function handleCreateRegistration(req, res) {
  try {
    const payload = await collectJsonBody(req);
    const paperId = String(payload.paperId || '').trim();
    const firstAuthorName = String(payload.firstAuthorName || '').trim();
    const screenshot = payload.screenshot || {};
    const fileName = path.basename(String(screenshot.fileName || '').trim());
    const mimeType = String(screenshot.mimeType || '').trim().toLowerCase();

    if (!paperId) {
      sendJson(res, 400, { error: 'Paper ID is required.' });
      return;
    }

    if (!firstAuthorName) {
      sendJson(res, 400, { error: "First Author's Name is required." });
      return;
    }

    if (!fileName) {
      sendJson(res, 400, { error: 'Payment Screenshot is required.' });
      return;
    }

    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      sendJson(res, 400, { error: 'Payment Screenshot must be PNG, JPG, JPEG, or WEBP.' });
      return;
    }

    if (paperId.length > 100 || firstAuthorName.length > 120 || fileName.length > 255) {
      sendJson(res, 400, { error: 'One or more fields are too long.' });
      return;
    }

    const screenshotBuffer = decodeScreenshot(screenshot.base64Data);
    const result = insertRegistration.run(
      paperId,
      firstAuthorName,
      fileName,
      mimeType,
      screenshotBuffer.length,
      screenshotBuffer
    );

    sendJson(res, 201, {
      id: Number(result.lastInsertRowid),
      message: '\u4e0a\u4f20\u6210\u529f'
    });
  } catch (error) {
    const statusCode = error.message.includes('too large') ? 413 : 400;
    sendJson(res, statusCode, { error: error.message || 'Upload failed.' });
  }
}

async function serveStaticFile(req, res, pathname) {
  const normalizedPath = normalizeRoute(pathname);
  const fullPath = safeJoin(ROOT_DIR, normalizedPath);

  if (!fullPath) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(fullPath);

    if (stat.isDirectory()) {
      sendText(res, 403, 'Forbidden');
      return;
    }

    const extension = path.extname(fullPath).toLowerCase();
    const contentType = MIME_TYPES[extension] || 'application/octet-stream';
    const content = await fsp.readFile(fullPath);

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': content.length
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    res.end(content);
  } catch (error) {
    sendText(res, 404, 'Not Found');
  }
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${server.address()?.port || DEFAULT_PORT}`}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/registrations') {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed.' });
      return;
    }

    await handleCreateRegistration(req, res);
    return;
  }

  if (pathname.startsWith('/api/')) {
    sendJson(res, 404, { error: 'API route not found.' });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    sendText(res, 405, 'Method Not Allowed');
    return;
  }

  await serveStaticFile(req, res, pathname);
});

function startServer(port, attemptsLeft) {
  const handleListening = () => {
    server.removeListener('error', handleError);
    console.log(`Conference site server is running at http://127.0.0.1:${port}`);
  };

  const handleError = (error) => {
    server.removeListener('listening', handleListening);
    server.removeListener('error', handleError);

    if (error.code === 'EADDRINUSE' && !process.env.PORT && attemptsLeft > 0) {
      startServer(port + 1, attemptsLeft - 1);
      return;
    }

    throw error;
  };

  server.once('listening', handleListening);
  server.once('error', handleError);
  server.listen(port, HOST);
}

startServer(DEFAULT_PORT, 10);

function shutdown() {
  db.close();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
