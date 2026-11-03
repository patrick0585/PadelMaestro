export function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Seeded accounts carry @padel.local addresses that cannot receive mail.
export function isPlaceholderEmail(email: string): boolean {
  return normaliseEmail(email).endsWith("@padel.local");
}
