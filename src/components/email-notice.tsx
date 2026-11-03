import { prisma } from "@/lib/db";
import { EmailNoticeClient } from "./email-notice-client";

export async function EmailNotice({
  playerId,
  showProfileLink = true,
}: {
  playerId: string;
  showProfileLink?: boolean;
}) {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { email: true, emailVerifiedAt: true, pendingEmail: true },
  });
  if (!player || player.emailVerifiedAt) return null;
  const variant = player.email.endsWith("@padel.local") ? "placeholder" : "unverified";
  return (
    <EmailNoticeClient
      variant={variant}
      pending={player.pendingEmail}
      showProfileLink={showProfileLink}
    />
  );
}
