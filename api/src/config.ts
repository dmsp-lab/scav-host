// All runtime settings come from environment variables (see .env.example at the repo root).

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing required environment variable ${name}`);
  return v;
}
const num = (name: string, fallback: number) => {
  const v = process.env[name];
  return v ? Number(v) : fallback;
};
const bool = (name: string, fallback: boolean) => {
  const v = process.env[name];
  return v === undefined ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase());
};

export const config = {
  port: num('PORT', 3000),
  databaseUrl: req('DATABASE_URL'),
  databaseSsl: bool('DATABASE_SSL', false),

  // Auth: players pick their name and type the party code; the Game Master uses the admin code.
  sessionSecret: req('SESSION_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-only-secret-change-me'),
  partyCode: req('PARTY_CODE', 'gobble'),
  adminCode: req('ADMIN_CODE', 'gamemaster'),
  adminName: process.env.ADMIN_NAME || 'Game Master',
  cookieSecure: bool('COOKIE_SECURE', false),

  // Object storage (MinIO or any S3-compatible service).
  s3: {
    endpoint: req('S3_ENDPOINT', 'http://minio:9000'),        // how the API/worker reach storage
    publicUrl: req('PUBLIC_URL', 'http://localhost:8080'),     // how browsers reach the site; presigned URLs use this host
    region: process.env.S3_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || 'scav-media',
    accessKey: req('S3_ACCESS_KEY', 'minioadmin'),
    secretKey: req('S3_SECRET_KEY', 'minioadmin'),
  },

  limits: {
    imageBytes: num('MAX_IMAGE_MB', 25) * 1024 * 1024,
    videoBytes: num('MAX_VIDEO_MB', 400) * 1024 * 1024,
  },

  runMigrations: bool('RUN_MIGRATIONS', true),
  seedOnStart: bool('SEED_ON_START', true),
};
