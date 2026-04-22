export const USERNAME_REGEX = /^[a-z0-9_]{3,32}$/;

export function isValidUsername(candidate: string): boolean {
  return USERNAME_REGEX.test(candidate);
}

export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
