-- Friendsgiving scavenger hunt: initial schema.

CREATE TABLE teams (
  id          serial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  color       text NOT NULL DEFAULT '#0039a6',
  sort        int  NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE players (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  team_id     int REFERENCES teams(id) ON DELETE SET NULL,
  is_admin    boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX players_name_key ON players (lower(name));

CREATE TABLE categories (
  id    text PRIMARY KEY,
  name  text NOT NULL,
  sort  int  NOT NULL DEFAULT 0
);

CREATE TABLE quests (
  id                text PRIMARY KEY,               -- e.g. POP-01
  category_id       text NOT NULL REFERENCES categories(id),
  type              text NOT NULL CHECK (type IN ('team','group')),
  base_points       int  NOT NULL,
  bonus_points      int  NOT NULL DEFAULT 0,        -- distance bonus from basecamp
  group_size        int,                            -- teams needed (group quests)
  minutes           int  NOT NULL,
  submission_types  text[] NOT NULL,                -- subset of {photo,video,text}
  borough           text NOT NULL,
  neighborhood      text,
  place             text NOT NULL,
  lat               double precision NOT NULL,
  lng               double precision NOT NULL,
  any_location      boolean NOT NULL DEFAULT false,
  title             text NOT NULL,
  description       text NOT NULL,
  steps             jsonb NOT NULL DEFAULT '[]',
  proof             text NOT NULL,
  note              text,
  distance_miles    double precision,
  route             jsonb,
  is_active         boolean NOT NULL DEFAULT true,
  sort              int  NOT NULL DEFAULT 0,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE submissions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_id        text NOT NULL REFERENCES quests(id),
  team_id         int  NOT NULL REFERENCES teams(id),
  player_id       int  NOT NULL REFERENCES players(id),
  text_body       text,
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  points_awarded  int,
  reviewer_note   text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  reviewed_at     timestamptz
);
CREATE INDEX submissions_quest_idx ON submissions (quest_id);
CREATE INDEX submissions_team_idx  ON submissions (team_id);
CREATE INDEX submissions_status_idx ON submissions (status, created_at);

CREATE TABLE media (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       int  NOT NULL REFERENCES players(id),
  submission_id   uuid REFERENCES submissions(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN ('image','video')),
  mime_type       text NOT NULL,
  size_bytes      bigint NOT NULL,
  original_name   text,
  original_key    text NOT NULL,
  display_key     text,                 -- web-friendly version (mp4 / jpg)
  thumb_key       text,
  duration_s      double precision,
  status          text NOT NULL DEFAULT 'uploading'
                  CHECK (status IN ('uploading','uploaded','processing','ready','failed')),
  error           text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX media_submission_idx ON media (submission_id);

-- Work queue for the media worker (SELECT ... FOR UPDATE SKIP LOCKED).
CREATE TABLE jobs (
  id          bigserial PRIMARY KEY,
  media_id    uuid NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','done','failed')),
  attempts    int  NOT NULL DEFAULT 0,
  last_error  text,
  run_after   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX jobs_ready_idx ON jobs (status, run_after);

-- Leaderboard: a team scores each quest once, using its best approved submission.
CREATE VIEW team_scores AS
SELECT t.id AS team_id,
       t.name,
       t.color,
       t.sort,
       COALESCE(SUM(best.points), 0)::int AS points,
       COUNT(best.quest_id)::int          AS quests_completed
FROM teams t
LEFT JOIN (
  SELECT team_id, quest_id, MAX(points_awarded) AS points
  FROM submissions
  WHERE status = 'approved'
  GROUP BY team_id, quest_id
) best ON best.team_id = t.id
GROUP BY t.id;
