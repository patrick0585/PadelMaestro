import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

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
          <h2 className="text-base font-semibold text-foreground">Passwort ändern</h2>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
