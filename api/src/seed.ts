import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tx } from './db.js';
import { config } from './config.js';

const SEED_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../seed');
const load = async (f: string) => JSON.parse(await readFile(path.join(SEED_DIR, f), 'utf8'));

interface SeedQuest {
  id: string; category: string; type: 'team' | 'group'; basePoints: number; bonusPoints: number;
  groupSize: number | null; minutes: number; submissionTypes: string[]; borough: string;
  neighborhood: string | null; place: string; lat: number; lng: number; anyLocation: boolean;
  title: string; description: string; steps: string[]; proof: string; note: string | null;
  distanceMiles: number; route: unknown; sort: number;
}

/**
 * Loads categories, quests, teams and players from api/seed/*.json.
 * - Categories and quests: new ones are inserted; with `overwrite`, existing ones are updated too
 *   (use this after you edit quests.json). Quests are never deleted, only deactivated by the Game Master.
 * - Teams and players: loaded only when the teams table is empty, so edits made in the app stick.
 * - The Game Master (admin) player always exists.
 */
export async function seed({ overwrite = false, log = console.log }: { overwrite?: boolean; log?: (m: string) => void } = {}) {
  const categories: { id: string; name: string }[] = await load('categories.json');
  const quests: SeedQuest[] = await load('quests.json');
  const { teams } = await load('teams.json') as { teams: { name: string; color: string; players: string[] }[] };

  await tx(async (c) => {
    for (const [i, cat] of categories.entries()) {
      await c.query(
        `INSERT INTO categories (id, name, sort) VALUES ($1,$2,$3)
         ON CONFLICT (id) DO ${overwrite ? 'UPDATE SET name = EXCLUDED.name, sort = EXCLUDED.sort' : 'NOTHING'}`,
        [cat.id, cat.name, i]);
    }
    let added = 0;
    for (const qd of quests) {
      const r = await c.query(
        `INSERT INTO quests (id, category_id, type, base_points, bonus_points, group_size, minutes, submission_types,
            borough, neighborhood, place, lat, lng, any_location, title, description, steps, proof, note,
            distance_miles, route, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
         ON CONFLICT (id) DO ${overwrite ? `UPDATE SET category_id=EXCLUDED.category_id, type=EXCLUDED.type,
            base_points=EXCLUDED.base_points, bonus_points=EXCLUDED.bonus_points, group_size=EXCLUDED.group_size,
            minutes=EXCLUDED.minutes, submission_types=EXCLUDED.submission_types, borough=EXCLUDED.borough,
            neighborhood=EXCLUDED.neighborhood, place=EXCLUDED.place, lat=EXCLUDED.lat, lng=EXCLUDED.lng,
            any_location=EXCLUDED.any_location, title=EXCLUDED.title, description=EXCLUDED.description,
            steps=EXCLUDED.steps, proof=EXCLUDED.proof, note=EXCLUDED.note, distance_miles=EXCLUDED.distance_miles,
            route=EXCLUDED.route, sort=EXCLUDED.sort, updated_at=now()` : 'NOTHING'}`,
        [qd.id, qd.category, qd.type, qd.basePoints, qd.bonusPoints, qd.groupSize, qd.minutes, qd.submissionTypes,
          qd.borough, qd.neighborhood, qd.place, qd.lat, qd.lng, qd.anyLocation, qd.title, qd.description,
          JSON.stringify(qd.steps), qd.proof, qd.note, qd.distanceMiles, qd.route ? JSON.stringify(qd.route) : null, qd.sort]);
      added += r.rowCount ?? 0;
    }
    log(`seed: ${quests.length} quests in seed file, ${added} ${overwrite ? 'inserted or updated' : 'newly inserted'}`);

    const { rows } = await c.query('SELECT count(*)::int AS n FROM teams');
    if (rows[0].n === 0) {
      for (const [i, t] of teams.entries()) {
        const team = await c.query('INSERT INTO teams (name, color, sort) VALUES ($1,$2,$3) RETURNING id', [t.name, t.color, i]);
        for (const name of t.players) {
          await c.query(
            'INSERT INTO players (name, team_id) VALUES ($1,$2) ON CONFLICT (lower(name)) DO UPDATE SET team_id = EXCLUDED.team_id',
            [name, team.rows[0].id]);
        }
      }
      log(`seed: created ${teams.length} teams with ${teams.reduce((n, t) => n + t.players.length, 0)} players`);
    }

    await c.query(
      `INSERT INTO players (name, is_admin) VALUES ($1, true)
       ON CONFLICT (lower(name)) DO UPDATE SET is_admin = true`, [config.adminName]);
  });
}
