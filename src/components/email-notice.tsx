import { prisma } from "@/lib/db";
import { isPlaceholderEmail } from "@/lib/auth/email";
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
  const variant = isPlaceholderEmail(player.email) ? "placeholder" : "unverified";
  return (
    <EmailNoticeClient
      variant={variant}
      pending={player.pendingEmail}
      showProfileLink={showProfileLink}
    />
  );
}
