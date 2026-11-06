import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { needsName } from "@/lib/account/apple";
import { AuthScreen } from "@/components/auth-screen";
import { safeNextPath } from "@/lib/auth/next-path";
import { NameForm } from "./name-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fast fertig – Padelmaestro" };

export default async function WelcomeNamePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const { next } = await searchParams;
  const target = safeNextPath(typeof next === "string" ? next : undefined);
  if (!(await needsName(session.user.id))) redirect(target);

  return (
    <AuthScreen
      embedded
      kicker="Fast fertig"
      title={<span className="text-[28px] normal-case leading-[1.05]">Wie sollen dich deine Mitspieler sehen?</span>}
      subtitle="Dieser Name erscheint in Gruppen, Ergebnissen und der Rangliste. Du kannst ihn später ändern."
    >
      <NameForm next={target} />
    </AuthScreen>
  );
}
