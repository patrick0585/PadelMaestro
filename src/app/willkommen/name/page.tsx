import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { needsName } from "@/lib/account/apple";
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
    <div className="mx-auto w-full max-w-[400px] pt-6">
      <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-primary">Fast fertig</p>
      <h1 className="mt-2 text-2xl font-extrabold text-foreground">Wie sollen dich deine Mitspieler sehen?</h1>
      <p className="mb-5 mt-1.5 text-sm text-foreground-muted">
        Dieser Name erscheint in Gruppen, Ergebnissen und der Rangliste. Du kannst ihn später ändern.
      </p>
      <NameForm next={target} />
    </div>
  );
}
