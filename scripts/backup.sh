#!/usr/bin/env sh
# Backs up the database and all uploaded media into ./backups/<timestamp>/.
# Run from anywhere on the machine that runs the stack:  sh scripts/backup.sh
# Copy the backups folder somewhere else afterwards (a USB drive, Backblaze B2, Google Drive...).
set -eu
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
ts=$(date +%Y%m%d-%H%M%S)
out="backups/$ts"
mkdir -p "$out"

echo "Dumping database..."
# Uses the postgres image's pg_dump on the stack's network, so DATABASE_URL works as-is.
docker compose run --rm --no-deps -T --entrypoint pg_dump db "$DATABASE_URL" --no-owner --format=custom > "$out/db.dump"

echo "Archiving media..."
docker compose run --rm --no-deps -T -v "$PWD/$out:/backup" --entrypoint sh storage -c 'tar czf /backup/media.tgz -C /data .'

ls -lh "$out"
echo "Done. Restore notes are in README.md (Backups)."
