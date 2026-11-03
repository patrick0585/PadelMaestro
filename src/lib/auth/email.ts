export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Seeded accounts carry @padel.local addresses that cannot receive mail;
// .invalid is reserved for anonymised accounts.
export function isPlaceholderEmail(email: string): boolean {
  const e = normaliseEmail(email);
  return e.endsWith("@padel.local") || e.endsWith(".invalid");
}
