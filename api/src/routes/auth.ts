import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { q, one } from '../db.js';
import { config } from '../config.js';
import { COOKIE, requirePlayer } from '../auth.js';

export default async function authRoutes(app: FastifyInstance) {
  // Names for the sign-in picker, grouped by team. Public on purpose: it's a party, not a bank.
  app.get('/api/players', async () => {
    const teams = await q(`SELECT id, name, color FROM teams ORDER BY sort, id`);
    const players = await q(
      `SELECT id, name, team_id AS "teamId", is_admin AS "isAdmin" FROM players ORDER BY is_admin DESC, lower(name)`);
    return { teams, players };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const body = z.object({ playerId: z.number().int(), code: z.string().trim().min(1) }).safeParse(req.body);
    if (!body.success) return reply.code(400).send({ error: 'Pick your name and enter the code.' });
    const p = await one('SELECT id, name, is_admin FROM players WHERE id = $1', [body.data.playerId]);
    if (!p) return reply.code(404).send({ error: 'That player was not found.' });
    const expected = p.is_admin ? config.adminCode : config.partyCode;
    if (body.data.code.toLowerCase() !== expected.toLowerCase()) {
      return reply.code(401).send({ error: p.is_admin ? 'Wrong Game Master code.' : 'Wrong party code.' });
    }
    const token = await reply.jwtSign({ pid: p.id }, { expiresIn: '30d' });
    reply.setCookie(COOKIE, token, {
      path: '/', httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true };
  });

  app.post('/api/auth/logout', async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requirePlayer }, async (req) => {
    const team = req.me!.teamId
      ? await one(`SELECT t.id, t.name, t.color,
                     (SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY lower(p.name))
                      FROM players p WHERE p.team_id = t.id) AS members
                   FROM teams t WHERE t.id = $1`, [req.me!.teamId])
      : null;
    return { ...req.me, team };
  });
}
