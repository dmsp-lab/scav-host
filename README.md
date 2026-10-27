# scav-host

The Friendsgiving 2026 NYC scavenger hunt: a quest board with a map, per-quest photo/video/text proof, a Game Master review queue, and a live scoreboard. It runs as a handful of Docker containers, on your laptop with Docker Desktop and on the on-prem server for the real thing.

- **85 quests** across 11 categories, from the Quest Board (base points 5/10/15, distance bonus, +5 for group quests)
- **Teams** from the final "3v3v3" combination in the Team Assignment Tool: Team 1 (Lani, Moon, Han), Team 2 (David, Paulina, Diego), Team 3 (Kathy, Trinh, Kwak)
- Players pick their name and type the party code. The Game Master signs in with a separate code.

See [docs/architecture.md](docs/architecture.md) for how the pieces fit together.

## Run it on your laptop

You need Docker Desktop and Git.

```sh
git clone https://github.com/dmsp-lab/scav-host.git
cd scav-host
cp .env.example .env          # the defaults work for a laptop
docker compose up --build
```

Open **http://localhost:8080**. Sign in as any player with the party code `gobble`, or as **Game Master** with the `ADMIN_CODE` from your `.env`.

The first start builds the images (a few minutes), creates the database tables, loads the quests and teams, and creates the media bucket. Stop with `Ctrl+C`; `docker compose down -v` also wipes the data.

**Trying it on your phone:** set `PUBLIC_URL=http://<your computer's Wi-Fi IP>:8080` in `.env`, run `docker compose up -d` again, and open that address on your phone. Upload links are signed for `PUBLIC_URL`, so it has to be the exact address the browser uses.

**Smoke test:** with a fresh stack running and `ffmpeg` installed, `node api/test/e2e.mjs` signs in, uploads a photo and a video, submits, reviews and checks the scoreboard. Reset afterwards with `docker compose down -v && docker compose up -d`.

## What's inside

| Path | What it is |
|---|---|
| `web/` | React + Vite app (map, quest list, submit form, feed, scoreboard, Game Master pages), served by Caddy. `web/Caddyfile` routes `/api` and `/scav-media` |
| `api/` | TypeScript API (Fastify + Postgres) and the media worker (ffmpeg). One image, two commands |
| `api/migrations/` | Database schema, applied automatically on start |
| `api/seed/` | `quests.json`, `categories.json`, `teams.json`, loaded on first start |
| `docker-compose.yml` | The whole stack. Optional profiles: `localdb` (Postgres for laptops) and `tunnel` (Cloudflare) |
| `scripts/backup.sh` | Database dump + media archive |
| `.github/workflows/ci.yml` | Builds both apps on every push and publishes images to GitHub Container Registry |

### Working on the UI with hot reload

Keep the stack running, then:

```sh
cd web && npm install && npm run dev     # http://localhost:5173, proxies /api to the stack
```

### Changing quests or teams

- **Quests:** edit `api/seed/quests.json` (or replace it with the updated list), then load it into the running database:
  ```sh
  docker compose exec api node dist/cli.js seed --overwrite
  ```
  New quests are added and existing ones updated by `id`. Removing a quest from the file doesn't delete it; hide it in **Review → Quests** instead.
- **Teams and players:** `teams.json` is only used when the database has no teams yet. After that, manage people in **Review → Players & teams** (add players, move them between teams, add a team).

## Deploying to the on-prem server

The server needs Docker Engine with the Compose plugin, and network access to your roommate's Postgres.

**1. Database.** On your roommate's Postgres (version 13 or newer), create a database and a user that can only touch it:

```sql
CREATE USER scav_app WITH PASSWORD 'pick-a-strong-one';
CREATE DATABASE friendsgiving OWNER scav_app;
```

Make sure the Docker host can reach it (`listen_addresses` and `pg_hba.conf`). If Postgres runs on the same machine as Docker, use `host.docker.internal` as the host in `DATABASE_URL`; on Linux also add `extra_hosts: ["host.docker.internal:host-gateway"]` under `api` and `worker` in `docker-compose.yml`.

**2. Get the code and configure it.**

```sh
git clone https://github.com/dmsp-lab/scav-host.git && cd scav-host
cp .env.example .env
```

In `.env`:
- `COMPOSE_PROFILES=` (empty for now, so it uses your roommate's database instead of the bundled one)
- `DATABASE_URL=postgres://scav_app:...@<db-host>:5432/friendsgiving`
- New random values for `SESSION_SECRET` (`openssl rand -hex 32`), `ADMIN_CODE` and `S3_SECRET_KEY`; your own `PARTY_CODE`
- `PUBLIC_URL=https://your-domain`, `COOKIE_SECURE=true`

**3. Public HTTPS with a Cloudflare tunnel** (no router ports opened):
1. Put your domain on Cloudflare (a free account is fine).
2. In Cloudflare Zero Trust go to **Networks → Tunnels → Create a tunnel** (type Cloudflared) and copy the token into `TUNNEL_TOKEN`.
3. Add a public hostname for your domain with service **HTTP → `web:80`**.
4. Set `COMPOSE_PROFILES=tunnel`.

**4. Start it.**

```sh
docker compose up -d --build
docker compose logs -f api worker      # watch the first start
```

To use the images CI publishes instead of building on the server, set `IMAGE_PREFIX=ghcr.io/dmsp-lab/scav-host` in `.env` and run `docker compose pull && docker compose up -d`. While the repo is public, the images are public too; the first time, you may need to make each package public under the repo's **Packages** on GitHub.

**Updating later:** `git pull && docker compose up -d --build` (or `docker compose pull && docker compose up -d`).

### Things to know before the party

- **Upload size:** Cloudflare's free plan rejects uploads over 100 MB, so `MAX_VIDEO_MB` defaults to 95. Ask everyone to record in 1080p, not 4K, and keep clips short. The app shows a clear error if a video is too big.
- **iPhone files:** HEIC photos and HEVC `.mov` videos upload fine. The worker makes JPEG/MP4 copies so they play in every browser. If a conversion fails, the original is still viewable and downloadable.
- **Signature errors on upload** usually mean `PUBLIC_URL` doesn't exactly match the address in the browser (scheme, host and port).
- **Disk:** plan on 30–50 GB for media. It lives in the `media` Docker volume.

## Backups

```sh
sh scripts/backup.sh
```

This writes `backups/<timestamp>/db.dump` and `media.tgz`. Run it nightly during the event (e.g. with cron) and copy the folder off the machine.

To restore, run these against a stopped app (`docker compose stop api worker`):

```sh
docker compose run --rm --no-deps -T --entrypoint pg_restore db --clean --no-owner -d "$DATABASE_URL" < backups/<ts>/db.dump
docker compose run --rm --no-deps -T -v "$PWD/backups/<ts>:/backup" --entrypoint sh storage -c 'tar xzf /backup/media.tgz -C /data'
```

## Configuration reference

All settings live in `.env`; `.env.example` explains each one. The API also reads `RUN_MIGRATIONS` and `SEED_ON_START` (both default `true`) and `LOG_LEVEL`.
