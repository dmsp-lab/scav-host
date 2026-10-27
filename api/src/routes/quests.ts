import type { FastifyInstance } from 'fastify';
import { q, one } from '../db.js';
import { requirePlayer } from '../auth.js';
import { QUEST_COLUMNS, withTotals, loadSubmissions } from '../shapes.js';

export default async function questRoutes(app: FastifyInstance) {
  app.get('/api/categories', { preHandler: requirePlayer }, async () =>
    q('SELECT id, name FROM categories ORDER BY sort, id'));

  // All quests, each with the signed-in player's team progress ("none" | "pending" | "approved" | "rejected").
  app.get('/api/quests', { preHandler: requirePlayer }, async (req) => {
    const me = req.me!;
    const rows = await q(`
      SELECT ${QUEST_COLUMNS},
        COALESCE(my.status, 'none') AS "myStatus", my.points AS "myPoints",
        (SELECT count(DISTINCT team_id)::int FROM submissions a WHERE a.quest_id = q.id AND a.status = 'approved') AS "teamsDone"
      FROM quests q
      LEFT JOIN LATERAL (
        SELECT CASE WHEN bool_or(s.status = 'approved') THEN 'approved'
                    WHEN bool_or(s.status = 'pending') THEN 'pending'
                    ELSE 'rejected' END AS status,
               max(s.points_awarded) FILTER (WHERE s.status = 'approved') AS points
        FROM submissions s WHERE s.quest_id = q.id AND s.team_id = $1
        HAVING count(*) > 0
      ) my ON true
      WHERE q.is_active OR $2
      ORDER BY q.sort, q.id`, [me.teamId ?? -1, me.isAdmin]);
    return rows.map(withTotals);
  });

  app.get<{ Params: { id: string } }>('/api/quests/:id', { preHandler: requirePlayer }, async (req, reply) => {
    const me = req.me!;
    const quest = await one(`SELECT ${QUEST_COLUMNS} FROM quests q WHERE q.id = $1`, [req.params.id]);
    if (!quest || (!quest.isActive && !me.isAdmin)) return reply.code(404).send({ error: 'Quest not found.' });
    // Everyone sees approved proof; your own team (and the Game Master) also sees pending and rejected.
    const submissions = await loadSubmissions(
      `s.quest_id = $1 AND (s.status = 'approved' OR s.team_id = $2 OR $3)`, [quest.id, me.teamId ?? -1, me.isAdmin]);
    return { ...withTotals(quest), submissions };
  });

  app.get('/api/leaderboard', { preHandler: requirePlayer }, async () => {
    const teams = await q(`
      SELECT ts.team_id AS id, ts.name, ts.color, ts.points, ts.quests_completed AS "questsCompleted",
        (SELECT count(*)::int FROM submissions s WHERE s.team_id = ts.team_id AND s.status = 'pending') AS pending,
        (SELECT json_agg(json_build_object('id', p.id, 'name', p.name) ORDER BY lower(p.name))
         FROM players p WHERE p.team_id = ts.team_id) AS members
      FROM team_scores ts
      ORDER BY ts.points DESC, ts.quests_completed DESC, ts.sort`);
    return { teams, totalQuests: (await one('SELECT count(*)::int AS n FROM quests WHERE is_active')).n };
  });
}
