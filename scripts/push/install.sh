#!/usr/bin/env bash
# Installs the push reminder job (systemd service/timer) on the VPS.
# Run as root from the directory containing the files. Idempotent.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install -m 0644 -o root -g root "$here/padel-push-reminders.service" /etc/systemd/system/padel-push-reminders.service
install -m 0644 -o root -g root "$here/padel-push-reminders.timer" /etc/systemd/system/padel-push-reminders.timer

systemctl daemon-reload
systemctl enable --now padel-push-reminders.timer

echo "--- smoke test"
systemctl start padel-push-reminders.service || {
  journalctl -u padel-push-reminders.service -n 20 --no-pager -o cat
  exit 1
}
journalctl -u padel-push-reminders.service -n 3 --no-pager -o cat

echo "--- timer"
systemctl list-timers 'padel-push-reminders*' --no-pager
