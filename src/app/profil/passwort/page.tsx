import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { GroupedList, LargeTitle } from "@/components/ui/list";
import { ChangePasswordForm } from "../change-password-form";

export const dynamic = "force-dynamic";

export default async function ProfilePasswordPage() {
  const session = await auth();
  if (!session) redirect("/login");
  return (
    <div className="mx-auto max-w-2xl">
      <LargeTitle title="Passwort" back={{ href: "/profil", label: "Profil" }} />
      <GroupedList className="p-4">
        <ChangePasswordForm />
      </GroupedList>
    </div>
  );
}
