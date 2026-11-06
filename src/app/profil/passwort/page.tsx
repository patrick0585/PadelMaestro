import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { GroupedList, LargeTitle } from "@/components/ui/list";
import { ChangePasswordForm } from "../change-password-form";

export const dynamic = "force-dynamic";

export default async function ProfilePasswordPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const player = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  const hasPassword = player?.passwordHash != null;
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle
        title={hasPassword ? "Passwort" : "Passwort festlegen"}
        back={{ href: "/profil", label: "Profil" }}
      />
      <GroupedList className="p-4">
        <ChangePasswordForm hasPassword={hasPassword} />
      </GroupedList>
    </div>
  );
}
