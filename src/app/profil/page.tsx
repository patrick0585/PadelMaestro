import { auth } from "@/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound, Mail, Users } from "lucide-react";
import { prisma } from "@/lib/db";
import { contextFromSession } from "@/lib/auth/group-context";
import { loadPlayerPass } from "@/lib/profile/player-pass";
import { GroupedList, ListRow, SectionFooter, SectionLabel } from "@/components/ui/list";
import { LeaveGroupButton } from "./leave-group-button";
import { PushSettings } from "./push-settings";
import { EmailNotice } from "@/components/email-notice";
import { AccountSection } from "./account-section";
import { SignOutButton } from "./sign-out-button";
import { AppleLinkRow } from "./apple-link-row";
import { appleConfigured } from "@/lib/auth/apple/config";
import { PlayerPassTicket } from "./player-pass-ticket";
import { TrophyShelf } from "@/components/home/trophy-shelf";
import { LegalFooter } from "@/components/legal-footer";

export const dynamic = "force-dynamic";

const ICON = "size-[17px]";
const ROLE_LABELS = { owner: "Besitzer", admin: "Admin", member: "Mitglied" } as const;

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");
  const ctx = contextFromSession(session);

  const [player, group, pass] = await Promise.all([
    prisma.player.findUnique({
      where: { id: session.user.id },
      select: {
        avatarVersion: true,
        email: true,
        emailVerifiedAt: true,
        pendingEmail: true,
        passwordHash: true,
        appleSub: true,
        pushRemindersEnabled: true,
      },
    }),
    ctx ? prisma.group.findUnique({ where: { id: ctx.groupId }, select: { name: true } }) : null,
    ctx ? loadPlayerPass(session.user.id, ctx.groupId) : null,
  ]);
  const hasPassword = player?.passwordHash != null;
  const email = player?.email ?? session.user.email;
  const emailHint = player?.pendingEmail
    ? `Bestätigung für ${player.pendingEmail} ausstehend`
    : player?.emailVerifiedAt
      ? undefined
      : "Noch nicht bestätigt";

  return (
    <div className="space-y-1">
      <div className="space-y-2.5">
        <EmailNotice playerId={session.user.id} showProfileLink={false} />
        <PlayerPassTicket
          playerId={session.user.id}
          name={session.user.name}
          avatarVersion={player?.avatarVersion ?? 0}
          groupName={group?.name ?? null}
          roleLabel={ctx ? ROLE_LABELS[ctx.role] : null}
          memberSince={pass?.memberSince ?? null}
          seasonName={pass?.seasonName ?? null}
          stats={pass?.stats ?? null}
        />
        {pass?.stats && <TrophyShelf medals={pass.stats.medals} />}
      </div>

      {ctx && (
        <GroupedList className="mt-2.5">
          <ListRow
            href="/ranking?ansicht=duos"
            icon={{ node: <Users className={ICON} />, color: "#0e7490" }}
            title="Meine Duos"
            chevron
          />
        </GroupedList>
      )}

      <section>
        <SectionLabel>Konto</SectionLabel>
        <GroupedList>
          <ListRow
            href="/profil/email"
            icon={{ node: <Mail className={ICON} />, color: "#0369a1" }}
            title="E-Mail"
            subtitle={emailHint}
            value={email}
            truncateValue
            chevron
          />
          <ListRow
            href="/profil/passwort"
            icon={{ node: <KeyRound className={ICON} />, color: "#475569" }}
            title={hasPassword ? "Passwort ändern" : "Passwort festlegen"}
            chevron
          />
          <AppleLinkRow linked={player?.appleSub != null} configured={appleConfigured()} />
          <SignOutButton />
        </GroupedList>
      </section>

      <PushSettings remindersEnabled={player?.pushRemindersEnabled ?? true} />

      {ctx && group && (
        <section>
          <SectionLabel>Gruppe</SectionLabel>
          <GroupedList>
            <ListRow title={group.name} />
          </GroupedList>
          {ctx.role === "owner" ? (
            <SectionFooter>
              Als Besitzer kannst du die Gruppe nicht verlassen. Übertrage den Besitz in der{" "}
              <Link
                href="/admin/einstellungen"
                className="rounded text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Verwaltung
              </Link>
              .
            </SectionFooter>
          ) : (
            <div className="mx-1.5 mt-1.5">
              <LeaveGroupButton groupId={ctx.groupId} groupName={group.name} />
            </div>
          )}
        </section>
      )}

      <AccountSection hasPassword={hasPassword} />

      <div className="pt-4">
        <LegalFooter />
      </div>
    </div>
  );
}
