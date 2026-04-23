import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";
import { AvatarUploader } from "./avatar-uploader";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const player = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { avatarVersion: true },
  });
  const avatarVersion = player?.avatarVersion ?? 0;

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Profil
        </p>
        <h1 className="text-2xl font-bold text-foreground">{session.user.name}</h1>
        <p className="mt-0.5 text-sm text-foreground-muted">{session.user.email}</p>
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
          <h2 className="text-base font-semibold text-foreground">Passwort ändern</h2>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
