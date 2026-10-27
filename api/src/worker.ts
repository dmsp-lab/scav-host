// Media worker: makes web-friendly copies (H.264 MP4 / JPEG) and thumbnails of uploads.
// Jobs live in Postgres; the API sends NOTIFY media_jobs, and we also poll as a fallback.
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import pg from 'pg';
import { pool, waitForDb } from './db.js';
import { config } from './config.js';
import { migrate } from './migrate.js';
import { downloadTo, uploadFile } from './s3.js';

const run = promisify(execFile);
const MAX_ATTEMPTS = 3;
const POLL_MS = 5000;
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

const ffmpeg = (args: string[]) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 1 << 24 });

async function probeDuration(file: string): Promise<number | null> {
  try {
    const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
    const d = parseFloat(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

async function processMedia(media: { id: string; kind: string; original_key: string }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'media-'));
  try {
    const src = path.join(dir, 'source');
    await downloadTo(media.original_key, src);
    const prefix = `processed/${media.id}`;
    const thumb = path.join(dir, 'thumb.jpg');
    const fit = (n: number) => `scale=w=${n}:h=${n}:force_original_aspect_ratio=decrease:force_divisible_by=2`;

    if (media.kind === 'video') {
      const out = path.join(dir, 'display.mp4');
      const duration = await probeDuration(src);
      await ffmpeg(['-i', src, '-vf', fit(1280), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26',
        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', out]);
      await ffmpeg(['-ss', duration && duration > 2 ? '1' : '0', '-i', out, '-frames:v', '1', '-vf', fit(480), '-q:v', '4', thumb]);
      await uploadFile(`${prefix}/display.mp4`, out, 'video/mp4');
      await uploadFile(`${prefix}/thumb.jpg`, thumb, 'image/jpeg');
      await pool.query(`UPDATE media SET display_key = $2, thumb_key = $3, duration_s = $4, status = 'ready', error = NULL WHERE id = $1`,
        [media.id, `${prefix}/display.mp4`, `${prefix}/thumb.jpg`, duration]);
    } else {
      const out = path.join(dir, 'display.jpg');
      await ffmpeg(['-i', src, '-frames:v', '1', '-vf', fit(1600), '-q:v', '3', out]);
      await ffmpeg(['-i', out, '-vf', fit(480), '-q:v', '4', thumb]);
      await uploadFile(`${prefix}/display.jpg`, out, 'image/jpeg');
      await uploadFile(`${prefix}/thumb.jpg`, thumb, 'image/jpeg');
      await pool.query(`UPDATE media SET display_key = $2, thumb_key = $3, status = 'ready', error = NULL WHERE id = $1`,
        [media.id, `${prefix}/display.jpg`, `${prefix}/thumb.jpg`]);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Claims and runs one job. Returns false when the queue is empty. */
async function runOne(): Promise<boolean> {
  const client = await pool.connect();
  let job: any;
  try {
    await client.query('BEGIN');
    job = (await client.query(`
      SELECT j.id, j.attempts, m.id AS media_id, m.kind, m.original_key
      FROM jobs j JOIN media m ON m.id = j.media_id
      WHERE j.status = 'queued' AND j.run_after <= now()
      ORDER BY j.id FOR UPDATE OF j SKIP LOCKED LIMIT 1`)).rows[0];
    if (job) await client.query(`UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = now() WHERE id = $1`, [job.id]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  if (!job) return false;

  const started = Date.now();
  try {
    await processMedia({ id: job.media_id, kind: job.kind, original_key: job.original_key });
    await pool.query(`UPDATE jobs SET status = 'done', updated_at = now() WHERE id = $1`, [job.id]);
    log(`job ${job.id}: ${job.kind} ${job.media_id} ready in ${Date.now() - started} ms`);
  } catch (err) {
    const msg = String((err as any)?.stderr || (err as Error).message).slice(0, 2000);
    const attempts = job.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await pool.query(`UPDATE jobs SET status = 'failed', last_error = $2, updated_at = now() WHERE id = $1`, [job.id, msg]);
      // The original stays viewable; the app falls back to it.
      await pool.query(`UPDATE media SET status = 'failed', error = $2 WHERE id = $1`, [job.media_id, msg]);
      log(`job ${job.id}: failed for good: ${msg}`);
    } else {
      await pool.query(`UPDATE jobs SET status = 'queued', last_error = $2, run_after = now() + interval '30 seconds', updated_at = now() WHERE id = $1`,
        [job.id, msg]);
      log(`job ${job.id}: attempt ${attempts} failed, retrying: ${msg}`);
    }
  }
  return true;
}

let draining = false;
async function drain() {
  if (draining) return;
  draining = true;
  try {
    while (await runOne()) { /* keep going until the queue is empty */ }
  } catch (err) {
    log('worker error', err);
  } finally {
    draining = false;
  }
}

await waitForDb(log);
if (config.runMigrations) await migrate(log);
// Jobs stuck in "running" from a crash go back to the queue.
await pool.query(`UPDATE jobs SET status = 'queued' WHERE status = 'running'`);

const listener = new pg.Client({ connectionString: config.databaseUrl, ssl: config.databaseSsl ? { rejectUnauthorized: false } : undefined });
await listener.connect();
await listener.query('LISTEN media_jobs');
listener.on('notification', () => void drain());
setInterval(() => void drain(), POLL_MS);
log('media worker started');
void drain();

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => { await listener.end(); await pool.end(); process.exit(0); });
}
