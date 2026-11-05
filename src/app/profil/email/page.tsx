import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { GroupedList, LargeTitle } from "@/components/ui/list";
import { EmailForm } from "../email-form";

export const dynamic = "force-dynamic";

export default async function ProfileEmailPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const player = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { email: true, emailVerifiedAt: true, pendingEmail: true },
  });
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="E-Mail" back={{ href: "/profil", label: "Profil" }} />
      <GroupedList className="p-4">
        <EmailForm
          email={player?.email ?? session.user.email ?? ""}
          pendingEmail={player?.pendingEmail ?? null}
          emailVerified={!!player?.emailVerifiedAt}
        />
      </GroupedList>
    </div>
  );
}
