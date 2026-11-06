import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { listMyGroups } from "@/lib/group/active-group";
import { loadLiveStrip } from "@/lib/game-day/live-strip";
import { TopNav } from "./top-nav";
import { MobileTopBar } from "./mobile-top-bar";
import { BottomTabs } from "./bottom-tabs";
import { InstallHint } from "./install-hint";
import { NativePush } from "./native-push";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) {
    return <>{children}</>;
  }
  const { isAdmin, name } = session.user;

  const row = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { avatarVersion: true },
  });
  const avatarVersion = row?.avatarVersion ?? 0;
  const groups = (await listMyGroups(session.user.id)).map(({ id, name: groupName }) => ({
    id,
    name: groupName,
  }));
  const activeGroupId = session.user.groupId;
  const live = await loadLiveStrip(activeGroupId);

  return (
    <div className="flex min-h-screen flex-col">
      <NativePush activeGroupId={activeGroupId} />
      <TopNav
        isAdmin={isAdmin}
        name={name}
        playerId={session.user.id}
        avatarVersion={avatarVersion}
        groups={groups}
        activeGroupId={activeGroupId}
        live={live}
      />
      <MobileTopBar
        name={name}
        playerId={session.user.id}
        avatarVersion={avatarVersion}
        groups={groups}
        activeGroupId={activeGroupId}
        live={live}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">{children}</main>
      {/* Single sticky stack so banner + tab-bar share one stacking
          context — avoids z-index races between two sticky siblings. */}
      <div className="sticky bottom-0 z-40 flex flex-col">
        <InstallHint />
        <BottomTabs isAdmin={isAdmin} />
      </div>
    </div>
  );
}
