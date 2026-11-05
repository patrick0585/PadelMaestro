import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { GroupedList, LargeTitle } from "@/components/ui/list";
import { AvatarUploader } from "../avatar-uploader";

export const dynamic = "force-dynamic";

export default async function ProfilePhotoPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const player = await prisma.player.findUnique({ where: { id: session.user.id }, select: { avatarVersion: true } });
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Profilbild" back={{ href: "/profil", label: "Profil" }} />
      <GroupedList className="p-4">
        <AvatarUploader playerId={session.user.id} name={session.user.name} avatarVersion={player?.avatarVersion ?? 0} />
      </GroupedList>
    </div>
  );
}
