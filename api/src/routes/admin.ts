import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q, one } from '../db.js';
import { requireAdmin } from '../auth.js';
import { loadSubmissions, GROUP_POINTS } from '../shapes.js';

export default async function adminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAdmin);

  // Review queue, oldest first so nobody waits too long.
  app.get<{ Querystring: { status?: string } }>('/api/admin/submissions', async (req) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status ?? '') ? req.query.status : 'pending';
    const rows = await loadSubmissions('s.status = $1', [status], 300);
    return status === 'pending' ? rows.reverse() : rows;
  });

  // Approve (with points, defaulting to the quest's full value) or reject (with an optional note).
  app.post<{ Params: { id: string } }>('/api/admin/submissions/:id/review', async (req, reply) => {
    const body = z.object({
      status: z.enum(['approved', 'rejected', 'pending']),
      points: z.number().int().min(0).max(1000).optional(),
      note: z.string().trim().max(1000).optional(),
    }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid review.' });
    const s = await one(`
      SELECT s.id, qu.base_points + qu.bonus_points + CASE WHEN qu.type = 'group' THEN $2::int ELSE 0 END AS full_points
      FROM submissions s JOIN quests qu ON qu.id = s.quest_id WHERE s.id = $1`, [req.params.id, GROUP_POINTS]);
    if (!s) return reply.code(404).send({ error: 'Submission not found.' });
    const { status, points, note } = body.data;
    await q(`UPDATE submissions SET status = $2, points_awarded = $3, reviewer_note = $4,
               reviewed_at = CASE WHEN $2 = 'pending' THEN NULL ELSE now() END WHERE id = $1`,
      [s.id, status, status === 'approved' ? (points ?? s.full_points) : null, note || null]);
    const [out] = await loadSubmissions('s.id = $1', [s.id]);
    return out;
  });

  app.patch<{ Params: { id: string } }>('/api/admin/quests/:id', async (req, reply) => {
    const body = z.object({ isActive: z.boolean() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid change.' });
    const r = await one('UPDATE quests SET is_active = $2, updated_at = now() WHERE id = $1 RETURNING id', [req.params.id, body.data.isActive]);
    if (!r) return reply.code(404).send({ error: 'Quest not found.' });
    return { ok: true };
  });

  // Players and teams.
  app.get('/api/admin/roster', async () => ({
    teams: await q('SELECT id, name, color, sort FROM teams ORDER BY sort, id'),
    players: await q('SELECT id, name, team_id AS "teamId", is_admin AS "isAdmin" FROM players ORDER BY lower(name)'),
  }));

  app.post('/api/admin/players', async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(60), teamId: z.number().int().nullable() }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Enter a name.' });
    const dup = await one('SELECT id FROM players WHERE lower(name) = lower($1)', [body.data.name]);
    if (dup) return reply.code(409).send({ error: 'Someone already has that name.' });
    return one('INSERT INTO players (name, team_id) VALUES ($1,$2) RETURNING id, name, team_id AS "teamId"',
      [body.data.name, body.data.teamId]);
  });

  app.patch<{ Params: { id: string } }>('/api/admin/players/:id', async (req, reply) => {
    const body = z.object({ teamId: z.number().int().nullable().optional(), name: z.string().trim().min(1).max(60).optional() })
      .safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Invalid change.' });
    const r = await one(`UPDATE players SET team_id = CASE WHEN $2 THEN $3::int ELSE team_id END, name = COALESCE($4, name)
                         WHERE id = $1 RETURNING id`,
      [Number(req.params.id), body.data.teamId !== undefined, body.data.teamId ?? null, body.data.name ?? null]);
    if (!r) return reply.code(404).send({ error: 'Player not found.' });
    return { ok: true };
  });

  app.post('/api/admin/teams', async (req, reply) => {
    const body = z.object({ name: z.string().trim().min(1).max(40), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Enter a name and a color.' });
    return one(`INSERT INTO teams (name, color, sort) VALUES ($1,$2,(SELECT COALESCE(max(sort),0)+1 FROM teams))
                RETURNING id, name, color`, [body.data.name, body.data.color]);
  });

  // Media processing health, for the GM's dashboard.
  app.get('/api/admin/jobs', async () =>
    q(`SELECT status, count(*)::int AS n FROM jobs GROUP BY status`));
}
