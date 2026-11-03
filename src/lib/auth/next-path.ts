// Only same-origin relative paths. Browsers strip tabs/newlines and treat "\" like "/",
// so "/\evil" or "/\t/evil" would become protocol-relative URLs.
export function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  if (raw.includes("\\") || /[\u0000-\u001f\u007f]/.test(raw)) return "/";
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return "/";
  return raw;
}
