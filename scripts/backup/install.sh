#!/usr/bin/env bash
# Installs the daily DB backup (script + systemd service/timer) on the VPS.
# Run as root from the directory containing the three files. Idempotent.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -m 0755 -o root -g root "$here/padel-db-backup.sh" /usr/local/bin/padel-db-backup.sh
install -m 0644 -o root -g root "$here/padel-db-backup.service" /etc/systemd/system/padel-db-backup.service
install -m 0644 -o root -g root "$here/padel-db-backup.timer" /etc/systemd/system/padel-db-backup.timer
install -d -m 0700 -o postgres -g postgres /var/backups/padel

systemctl daemon-reload
systemctl enable --now padel-db-backup.timer

echo "--- smoke test"
systemctl start padel-db-backup.service
journalctl -u padel-db-backup.service -n 3 --no-pager -o cat

echo "--- timer"
systemctl list-timers 'padel-db-backup*' --no-pager
echo "--- dumps"
ls -lh /var/backups/padel
