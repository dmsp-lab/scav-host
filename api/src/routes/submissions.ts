import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { q, one, tx } from '../db.js';
import { requirePlayer } from '../auth.js';
import { config } from '../config.js';
import { presignPut, presignGet, headObject } from '../s3.js';
import { loadSubmissions } from '../shapes.js';

const safeName = (n: string) => n.normalize('NFKD').replace(/[^\w.-]+/g, '_').slice(-80) || 'file';

export default async function submissionRoutes(app: FastifyInstance) {
  // Step 1: reserve a media slot and get a presigned URL. The browser PUTs the file straight to storage.
  app.post('/api/uploads', { preHandler: requirePlayer }, async (req, reply) => {
    const body = z.object({
      filename: z.string().min(1).max(300),
      mimeType: z.string().regex(/^(image|video)\/[\w.+-]+$/, 'Only photos and videos can be uploaded.'),
      size: z.number().int().positive(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: body.error.issues[0].message });
    const { filename, mimeType, size } = body.data;
    const kind = mimeType.startsWith('video/') ? 'video' : 'image';
    const limit = kind === 'video' ? config.limits.videoBytes : config.limits.imageBytes;
    if (size > limit) {
      return reply.code(413).send({ error: `That ${kind} is too large (max ${Math.round(limit / 1024 / 1024)} MB).` });
    }
    const id = randomUUID();
    const key = `originals/${new Date().toISOString().slice(0, 10)}/${id}/${safeName(filename)}`;
    await q(`INSERT INTO media (id, player_id, kind, mime_type, size_bytes, original_name, original_key)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`, [id, req.me!.id, kind, mimeType, size, filename, key]);
    return { mediaId: id, uploadUrl: await presignPut(key, mimeType), headers: { 'Content-Type': mimeType } };
  });

  // Step 2: confirm the upload landed.
  app.post<{ Params: { id: string } }>('/api/uploads/:id/complete', { preHandler: requirePlayer }, async (req, reply) => {
    const m = await one('SELECT id, original_key, player_id, status FROM media WHERE id = $1', [req.params.id]);
    if (!m || m.player_id !== req.me!.id) return reply.code(404).send({ error: 'Upload not found.' });
    const head = await headObject(m.original_key);
    if (!head || head.size === 0) return reply.code(409).send({ error: 'The file did not finish uploading. Try again.' });
    await q(`UPDATE media SET status = 'uploaded', size_bytes = $2 WHERE id = $1 AND status = 'uploading'`, [m.id, head.size]);
    return { ok: true };
  });

  // Step 3: submit proof for a quest (text and/or uploaded media).
  app.post('/api/submissions', { preHandler: requirePlayer }, async (req, reply) => {
    const me = req.me!;
    if (!me.teamId) return reply.code(403).send({ error: 'You are not on a team yet. Ask the Game Master.' });
    const body = z.object({
      questId: z.string(),
      text: z.string().trim().max(4000).optional().default(''),
      mediaIds: z.array(z.uuid()).max(20).default([]),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid submission.' });
    const { questId, text, mediaIds } = body.data;
    if (!text && !mediaIds.length) return reply.code(400).send({ error: 'Add a photo, a video or some text first.' });

    const quest = await one('SELECT id, is_active FROM quests WHERE id = $1', [questId]);
    if (!quest || !quest.is_active) return reply.code(404).send({ error: 'Quest not found.' });

    const id = await tx(async (c) => {
      const media = (await c.query(
        `SELECT id FROM media WHERE id = ANY($1::uuid[]) AND player_id = $2 AND status = 'uploaded' AND submission_id IS NULL`,
        [mediaIds, me.id])).rows;
      if (media.length !== mediaIds.length) throw Object.assign(new Error('Some uploads are missing or unfinished.'), { statusCode: 409 });
      const s = await c.query(
        `INSERT INTO submissions (quest_id, team_id, player_id, text_body) VALUES ($1,$2,$3,$4) RETURNING id`,
        [questId, me.teamId, me.id, text || null]);
      if (mediaIds.length) {
        await c.query(`UPDATE media SET submission_id = $1, status = 'processing' WHERE id = ANY($2::uuid[])`, [s.rows[0].id, mediaIds]);
        await c.query(`INSERT INTO jobs (media_id) SELECT unnest($1::uuid[])`, [mediaIds]);
        await c.query(`NOTIFY media_jobs`);
      }
      return s.rows[0].id as string;
    });
    const [created] = await loadSubmissions('s.id = $1', [id]);
    return reply.code(201).send(created);
  });

  // Feed of submissions. Approved ones are public to every player; pending/rejected only to the team and the GM.
  app.get<{ Querystring: Record<string, string | undefined> }>('/api/submissions', { preHandler: requirePlayer }, async (req) => {
    const me = req.me!;
    const params: unknown[] = [me.teamId ?? -1, me.isAdmin];
    const where = [`(s.status = 'approved' OR s.team_id = $1 OR $2)`];
    const add = (sql: string, v: unknown) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    const { status, questId, teamId, mine } = req.query;
    if (status && ['pending', 'approved', 'rejected'].includes(status)) add('s.status = ?', status);
    if (questId) add('s.quest_id = ?', questId);
    if (teamId) add('s.team_id = ?', Number(teamId));
    if (mine === '1') add('s.team_id = ?', me.teamId ?? -1);
    return loadSubmissions(where.join(' AND '), params, Math.min(Number(req.query.limit) || 100, 300));
  });

  // Teams can withdraw a submission until it's reviewed.
  app.delete<{ Params: { id: string } }>('/api/submissions/:id', { preHandler: requirePlayer }, async (req, reply) => {
    const me = req.me!;
    const s = await one('SELECT id, team_id, status FROM submissions WHERE id = $1', [req.params.id]);
    if (!s || (s.team_id !== me.teamId && !me.isAdmin)) return reply.code(404).send({ error: 'Submission not found.' });
    if (s.status !== 'pending' && !me.isAdmin) return reply.code(409).send({ error: 'Reviewed submissions can only be removed by the Game Master.' });
    await q('DELETE FROM submissions WHERE id = $1', [s.id]);
    return { ok: true };
  });

  // Media is served through short-lived presigned links, after a visibility check.
  app.get<{ Params: { id: string; variant: string } }>('/api/media/:id/:variant', { preHandler: requirePlayer }, async (req, reply) => {
    const me = req.me!;
    const m = await one(`
      SELECT m.*, s.status AS sub_status, s.team_id AS sub_team FROM media m
      LEFT JOIN submissions s ON s.id = m.submission_id WHERE m.id = $1`, [req.params.id]);
    const visible = m && (me.isAdmin || m.player_id === me.id || m.sub_status === 'approved' || (m.sub_team && m.sub_team === me.teamId));
    if (!visible) return reply.code(404).send({ error: 'Not found.' });
    const key = req.params.variant === 'thumb' ? m.thumb_key
      : req.params.variant === 'display' ? (m.display_key ?? m.original_key)
      : m.original_key;
    if (!key) return reply.code(404).send({ error: 'Not ready yet.' });
    const url = await presignGet(key, req.params.variant === 'original' ? m.original_name : undefined);
    reply.header('Cache-Control', 'private, max-age=600');
    return reply.redirect(url, 302);
  });
}
