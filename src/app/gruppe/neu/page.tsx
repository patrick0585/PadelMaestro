import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { canFoundGroup } from "@/lib/group/create";
import { PadelLogo } from "@/components/padel-logo";
import { LegalFooter } from "@/components/legal-footer";
import { GroupForm } from "./group-form";

export const dynamic = "force-dynamic";

const LINK_CLASS =
  "flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Shell({ title = "Neue Gruppe", children }: { title?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="break-words text-2xl font-extrabold text-foreground">{title}</h1>
        </div>
        {children}
        <LegalFooter />
      </div>
    </div>
  );
}

export default async function NewGroupPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=/gruppe/neu");

  if (!(await canFoundGroup(session.user.id))) {
    return (
      <Shell title="Gründer-Link nötig">
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          <h2 className="text-base font-semibold text-foreground">
            Dafür brauchst du einen Gründer-Link
          </h2>
          <p className="text-sm text-foreground-muted">
            Frag den Betreiber der App nach einem Gründer-Link.
          </p>
          <Link href="/" className={LINK_CLASS}>
            Zum Dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <GroupForm />
    </Shell>
  );
}
