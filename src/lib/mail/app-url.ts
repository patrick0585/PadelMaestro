export function appUrl(path: string): string {
  const base = (
    process.env.APP_URL ||
    process.env.AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}
