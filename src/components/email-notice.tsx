import { prisma } from "@/lib/db";
import { isPlaceholderEmail } from "@/lib/auth/email";
import { EmailNoticeClient } from "./email-notice-client";
import type { EmailNoticeData } from "./email-notice-types";

export type { EmailNoticeData };

/** Null when the address is verified (nothing to show). */
export async function loadEmailNotice(playerId: string): Promise<EmailNoticeData | null> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { email: true, emailVerifiedAt: true, pendingEmail: true },
  });
  if (!player || player.emailVerifiedAt) return null;
  return {
    variant: isPlaceholderEmail(player.email) ? "placeholder" : "unverified",
    pending: player.pendingEmail,
  };
}

export async function EmailNotice({
  playerId,
  showProfileLink = true,
  compact = false,
}: {
  playerId: string;
  showProfileLink?: boolean;
  compact?: boolean;
}) {
  const data = await loadEmailNotice(playerId);
  if (!data) return null;
  return <EmailNoticeClient {...data} showProfileLink={showProfileLink} compact={compact} />;
}
