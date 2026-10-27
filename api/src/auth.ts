import type { FastifyReply, FastifyRequest } from 'fastify';
import { one } from './db.js';

export interface Session { pid: number }
export interface Me { id: number; name: string; teamId: number | null; isAdmin: boolean }

export const COOKIE = 'scav_session';

declare module '@fastify/jwt' {
  interface FastifyJWT { payload: Session; user: Session }
}
declare module 'fastify' {
  interface FastifyRequest { me?: Me }
}

/** Loads the signed-in player from the session cookie; replies 401 when there is none. */
export async function requirePlayer(req: FastifyRequest, reply: FastifyReply) {
  try {
    await req.jwtVerify({ onlyCookie: true });
  } catch {
    return reply.code(401).send({ error: 'Sign in first.' });
  }
  const p = await one<Me>(
    'SELECT id, name, team_id AS "teamId", is_admin AS "isAdmin" FROM players WHERE id = $1', [req.user.pid]);
  if (!p) return reply.code(401).send({ error: 'Your player no longer exists. Sign in again.' });
  req.me = p;
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  await requirePlayer(req, reply);
  if (reply.sent) return;
  if (!req.me?.isAdmin) return reply.code(403).send({ error: 'Game Master only.' });
}
