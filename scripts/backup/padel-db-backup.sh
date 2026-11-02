#!/usr/bin/env bash
# Daily pg_dump of the padel_tracker database. Runs as user postgres via
# padel-db-backup.service; the timer is padel-db-backup.timer.
set -euo pipefail

DB="${PADEL_DB:-padel_tracker}"
DIR="${PADEL_BACKUP_DIR:-/var/backups/padel}"
KEEP_DAYS="${PADEL_BACKUP_KEEP_DAYS:-30}"

stamp="$(date +%F_%H%M)"
out="${DIR}/${DB}-${stamp}.dump"
tmp="${out}.part"

mkdir -p "$DIR"
trap 'rm -f "$tmp"' EXIT

pg_dump -Fc --no-owner --no-acl -f "$tmp" "$DB"

if [[ ! -s "$tmp" ]]; then
  echo "backup failed: empty dump $tmp" >&2
  exit 1
fi
pg_restore --list "$tmp" > /dev/null
mv "$tmp" "$out"
trap - EXIT

find "$DIR" -maxdepth 1 -name "${DB}-*.dump" -mtime +"$((KEEP_DAYS - 1))" -delete
find "$DIR" -maxdepth 1 -name "*.dump.part" -mmin +60 -delete

size="$(du -h "$out" | cut -f1)"
count="$(find "$DIR" -maxdepth 1 -name "${DB}-*.dump" | wc -l | tr -d ' ')"
echo "backup ok: $out ($size), $count dumps retained"
