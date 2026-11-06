// Only same-origin relative paths. A leading single "/" rules out schemes. Browsers strip
// tabs/newlines and treat "\" like "/", so "/\evil" or "/\t/evil" would become "//evil".
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return "/";
  return raw;
}

/** Appends a validated `next` to an internal link; unsafe or missing values are dropped. */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNextPath(next);
  return safe === "/" ? path : `${path}?next=${encodeURIComponent(safe)}`;
}
