import Link from "next/link";
import type { ReactNode } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { previewInvitation } from "@/lib/invitations/lookup";
import { findGroupMembership } from "@/lib/group/active-membership";
import type { InvitationInvalidReason } from "@/lib/invitations/errors";
import { PadelLogo } from "@/components/padel-logo";
import { SignupForm } from "./signup-form";
import { JoinButton } from "./join-button";

export const dynamic = "force-dynamic";

const REASONS: Record<InvitationInvalidReason, string> = {
  unknown: "Diesen Link kennen wir nicht.",
  expired: "Dieser Link ist abgelaufen.",
  revoked: "Dieser Link wurde zurückgezogen.",
  exhausted: "Dieser Link wurde schon zu oft verwendet.",
};

const LINK_CLASS =
  "flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-foreground">{title}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const preview = await previewInvitation(token);

  if (!preview.ok) {
    return (
      <Shell title="Einladung ungültig">
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          <p className="text-sm text-foreground">{REASONS[preview.reason]}</p>
          <Link href="/login" className={LINK_CLASS}>
            Zur Anmeldung
          </Link>
        </div>
      </Shell>
    );
  }

  const title =
    preview.kind === "founder"
      ? "Einladung: eigene Gruppe gründen"
      : `Einladung zu ${preview.groupName ?? ""}`;
  const session = await auth();

  if (!session) {
    return (
      <Shell title={title}>
        <SignupForm token={token} kind={preview.kind} />
      </Shell>
    );
  }

  const alreadyMember =
    preview.kind === "member" &&
    preview.groupId !== null &&
    (await findGroupMembership(prisma, preview.groupId, session.user.id)) !== null;

  if (alreadyMember) {
    return (
      <Shell title={title}>
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-3">
          <p className="text-sm text-foreground">Du bist schon Mitglied von {preview.groupName}</p>
          <Link href="/" className={LINK_CLASS}>
            Zum Dashboard
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell title={title}>
      <JoinButton token={token} kind={preview.kind} groupName={preview.groupName} />
    </Shell>
  );
}
