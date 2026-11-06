// After a deploy, an open tab or the iOS app still runs the old client bundle. Lazy chunks and
// server actions of that bundle no longer exist on the server; one full reload fixes it.
const STALE = [
  /loading (css )?chunk [\w-]+ failed/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /failed to find server action/i,
];

export function isStaleDeploymentError(error: { name?: string; message?: string }): boolean {
  if (error.name === "ChunkLoadError") return true;
  return STALE.some((re) => re.test(error.message ?? ""));
}

const KEY = "stale-deployment-reload-at";
const WINDOW_MS = 60_000;

/**
 * Reloads at most once per minute; without storage it does nothing to rule out a reload loop.
 * Offline it keeps the error page: chunk errors also happen without network, and a reload would
 * only swap it for a blank page.
 */
export function reloadOnceForStaleDeployment(reload: () => void = () => window.location.reload()): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < WINDOW_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return false;
  }
  reload();
  return true;
}
