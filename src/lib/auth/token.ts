import { randomBytes } from "node:crypto";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

export const INVITATION_TTL_DAYS = 7;

export function invitationExpiryFromNow(): Date {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
