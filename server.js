'use strict';
/*
  Pagewright server.
  - Serves the builder from ./public
  - Saves each project as JSON through /api/projects/:id
  - Storage: Redis when REDIS_URL is set, otherwise files in DATA_DIR
*/
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const REDIS_URL = process.env.REDIS_URL || '';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const TTL_DAYS = Number(process.env.PROJECT_TTL_DAYS || 0);
const BODY_LIMIT = process.env.BODY_LIMIT || '60mb';
const AUTH_USER = process.env.BASIC_AUTH_USER || '';
const AUTH_PASS = process.env.BASIC_AUTH_PASS || '';
const KEY = 'pagewright:project:';
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function makeStore() {
  if (REDIS_URL) {
    const Redis = require('ioredis');
    const client = new Redis(REDIS_URL, { maxRetriesPerRequest: 2 });
    client.on('error', (e) => console.error('[redis]', e.message));
    return {
      name: 'redis',
      get: (id) => client.get(KEY + id),
      set: (id, json) => (TTL_DAYS > 0 ? client.set(KEY + id, json, 'EX', TTL_DAYS * 86400) : client.set(KEY + id, json)),
      del: (id) => client.del(KEY + id),
      ping: async () => (await client.ping()) === 'PONG',
    };
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const file = (id) => path.join(DATA_DIR, id + '.json');
  return {
    name: 'file',
    get: async (id) => {
      try { return await fs.promises.readFile(file(id), 'utf8'); }
      catch (e) { if (e.code === 'ENOENT') return null; throw e; }
    },
    set: async (id, json) => {
      const tmp = file(id) + '.' + process.pid + '.tmp';
      await fs.promises.writeFile(tmp, json);
      await fs.promises.rename(tmp, file(id));
    },
    del: async (id) => { try { await fs.promises.unlink(file(id)); } catch (e) { /* already gone */ } },
    ping: async () => { await fs.promises.access(DATA_DIR, fs.constants.W_OK); return true; },
  };
}

const store = makeStore();
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
if (AUTH_USER && AUTH_PASS) {
  app.use((req, res, next) => {
    if (req.path === '/healthz') return next();
    const m = /^Basic (.+)$/.exec(req.headers.authorization || '');
    if (m) {
      const [u, ...rest] = Buffer.from(m[1], 'base64').toString().split(':');
      if (safeEqual(u, AUTH_USER) && safeEqual(rest.join(':'), AUTH_PASS)) return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Pagewright"').status(401).send('Login required');
  });
}

app.get('/healthz', (req, res) => res.type('text').send('ok'));
app.get('/api/health', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try { await store.ping(); res.json({ ok: true, store: store.name }); }
  catch (e) { res.status(503).json({ ok: false, error: 'storage unavailable' }); }
});

const api = express.Router();
api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
api.use(express.json({ limit: BODY_LIMIT }));
api.param('id', (req, res, next, id) => (ID_RE.test(id) ? next() : res.status(400).json({ error: 'bad project id' })));

api.get('/:id', async (req, res, next) => {
  try {
    const raw = await store.get(req.params.id);
    if (!raw) return res.status(404).json({ error: 'not found' });
    res.type('json').send(raw);
  } catch (e) { next(e); }
});
api.put('/:id', async (req, res, next) => {
  try {
    const b = req.body;
    if (!b || typeof b.project !== 'object' || !Array.isArray(b.project.pages)) return res.status(400).json({ error: 'not a Pagewright project' });
    await store.set(req.params.id, JSON.stringify({ project: b.project, view: String(b.view || 'design'), savedAt: new Date().toISOString() }));
    res.json({ ok: true });
  } catch (e) { next(e); }
});
api.delete('/:id', async (req, res, next) => {
  try { await store.del(req.params.id); res.json({ ok: true }); } catch (e) { next(e); }
});
app.use('/api/projects', api);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err.message);
  res.status(status).json({ error: status === 413 ? 'project too large' : 'server error' });
});

app.listen(PORT, '0.0.0.0', () => console.log(`Pagewright on port ${PORT}, storage: ${store.name}`));
