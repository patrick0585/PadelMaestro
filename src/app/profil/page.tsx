import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { contextFromSession } from "@/lib/auth/group-context";
import { LeaveGroupButton } from "./leave-group-button";
import { ChangePasswordForm } from "./change-password-form";
import { AvatarUploader } from "./avatar-uploader";
import { EmailForm } from "./email-form";
import { EmailNotice } from "@/components/email-notice";

export const dynamic = "force-dynamic";

const ROLE_LABELS = { owner: "Besitzer", admin: "Admin", member: "Mitglied" } as const;

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const player = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { avatarVersion: true, email: true, emailVerifiedAt: true, pendingEmail: true },
  });
  const avatarVersion = player?.avatarVersion ?? 0;
  const email = player?.email ?? session.user.email;
  const ctx = contextFromSession(session);
  const group = ctx
    ? await prisma.group.findUnique({ where: { id: ctx.groupId }, select: { name: true } })
    : null;

  return (
    <div className="space-y-4">
      <EmailNotice playerId={session.user.id} showProfileLink={false} />

      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Profil
        </p>
        <h1 className="text-2xl font-bold text-foreground">{session.user.name}</h1>
        <p className="mt-0.5 text-sm text-foreground-muted">{email}</p>
      </header>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Profilbild</h2>
          <AvatarUploader
            playerId={session.user.id}
            name={session.user.name}
            avatarVersion={avatarVersion}
          />
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">E-Mail-Adresse</h2>
          <EmailForm
            email={email ?? ""}
            pendingEmail={player?.pendingEmail ?? null}
            emailVerified={!!player?.emailVerifiedAt}
          />
        </CardBody>
      </Card>

      {ctx && group && (
        <Card>
          <CardBody className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">Gruppe</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{group.name}</span>
              <Badge variant="neutral">{ROLE_LABELS[ctx.role]}</Badge>
            </div>
            {ctx.role === "owner" ? (
              <p className="text-sm text-foreground-muted">
                Als Besitzer kannst du die Gruppe nicht verlassen. Übertrage den Besitz im
                Admin-Bereich.
              </p>
            ) : (
              <LeaveGroupButton />
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Passwort ändern</h2>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
