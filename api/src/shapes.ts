// Row -> JSON shapes shared by the routes.
import { q } from './db.js';

export const GROUP_POINTS = 5; // every team taking part in a group quest earns this on top

export const QUEST_COLUMNS = `
  q.id, q.category_id AS "category", q.type, q.base_points AS "basePoints", q.bonus_points AS "bonusPoints",
  q.group_size AS "groupSize", q.minutes, q.submission_types AS "submissionTypes", q.borough,
  q.neighborhood, q.place, q.lat, q.lng, q.any_location AS "anyLocation", q.title, q.description,
  q.steps, q.proof, q.note, q.distance_miles AS "distanceMiles", q.route, q.is_active AS "isActive", q.sort`;

export function withTotals<T extends { type: string; basePoints: number; bonusPoints: number }>(row: T) {
  const groupPoints = row.type === 'group' ? GROUP_POINTS : 0;
  return { ...row, groupPoints, totalPoints: row.basePoints + row.bonusPoints + groupPoints };
}

export interface MediaOut {
  id: string; kind: 'image' | 'video'; status: string; mimeType: string;
  url: string; thumbUrl: string | null; originalUrl: string;
}

export function mediaOut(m: { id: string; kind: 'image' | 'video'; status: string; mime_type: string; thumb_key: string | null }): MediaOut {
  return {
    id: m.id, kind: m.kind, status: m.status, mimeType: m.mime_type,
    url: `/api/media/${m.id}/display`,
    thumbUrl: m.thumb_key ? `/api/media/${m.id}/thumb` : null,
    originalUrl: `/api/media/${m.id}/original`,
  };
}

/**
 * Loads submissions with their team, player and media.
 * `where` is a SQL fragment using alias s; params are positional.
 */
export async function loadSubmissions(where: string, params: unknown[], limit = 200) {
  const rows = await q(`
    SELECT s.id, s.quest_id AS "questId", qu.title AS "questTitle", qu.category_id AS "questCategory",
           s.text_body AS "text", s.status, s.points_awarded AS "pointsAwarded", s.reviewer_note AS "reviewerNote",
           s.created_at AS "createdAt", s.reviewed_at AS "reviewedAt",
           json_build_object('id', t.id, 'name', t.name, 'color', t.color) AS team,
           json_build_object('id', p.id, 'name', p.name) AS player
    FROM submissions s
    JOIN quests qu ON qu.id = s.quest_id
    JOIN teams t ON t.id = s.team_id
    JOIN players p ON p.id = s.player_id
    WHERE ${where}
    ORDER BY s.created_at DESC
    LIMIT ${Number(limit)}`, params);
  if (!rows.length) return [];
  const media = await q(
    `SELECT id, submission_id, kind, status, mime_type, thumb_key FROM media
     WHERE submission_id = ANY($1::uuid[]) ORDER BY created_at`, [rows.map((r) => r.id)]);
  const bySub = new Map<string, MediaOut[]>();
  for (const m of media) {
    if (!bySub.has(m.submission_id)) bySub.set(m.submission_id, []);
    bySub.get(m.submission_id)!.push(mediaOut(m));
  }
  return rows.map((r) => ({ ...r, media: bySub.get(r.id) ?? [] }));
}
