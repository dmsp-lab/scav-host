import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import { config } from './config.js';
import { pool, waitForDb } from './db.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { ensureBucket } from './s3.js';
import { COOKIE } from './auth.js';
import authRoutes from './routes/auth.js';
import questRoutes from './routes/quests.js';
import submissionRoutes from './routes/submissions.js';
import adminRoutes from './routes/admin.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, trustProxy: true });

// Accept empty JSON bodies (e.g. POST /api/uploads/:id/complete) instead of failing with a 400.
app.removeContentTypeParser('application/json');
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  try {
    done(null, body === '' ? {} : JSON.parse(body as string));
  } catch {
    done(Object.assign(new Error('Invalid JSON body.'), { statusCode: 400 }), undefined);
  }
});

await app.register(cookie);
await app.register(jwt, { secret: config.sessionSecret, cookie: { cookieName: COOKIE, signed: false } });

app.setErrorHandler((err: any, req, reply) => {
  const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
  if (status >= 500) req.log.error(err);
  reply.code(status).send({ error: status >= 500 ? 'Something went wrong on our side.' : err.message });
});

app.get('/api/health', async () => {
  await pool.query('SELECT 1');
  return { ok: true };
});

await app.register(authRoutes);
await app.register(questRoutes);
await app.register(submissionRoutes);
await app.register(adminRoutes);

await waitForDb((m) => app.log.warn(m));
if (config.runMigrations) await migrate((m) => app.log.info(m));
if (config.seedOnStart) await seed({ log: (m) => app.log.info(m) });
try {
  await ensureBucket();
} catch (err) {
  app.log.warn({ err }, 'Could not reach object storage yet; uploads will fail until it is up.');
}

await app.listen({ port: config.port, host: '0.0.0.0' });

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => { await app.close(); await pool.end(); process.exit(0); });
}
