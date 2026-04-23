import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { TopNav } from "./top-nav";
import { BottomTabs } from "./bottom-tabs";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) {
    return <>{children}</>;
  }
  const { isAdmin, name } = session.user;

  let avatarVersion = 0;
  if (session?.user?.id) {
    const row = await prisma.player.findUnique({
      where: { id: session.user.id },
      select: { avatarVersion: true },
    });
    avatarVersion = row?.avatarVersion ?? 0;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <TopNav
        isAdmin={isAdmin}
        name={name}
        playerId={session.user.id}
        avatarVersion={avatarVersion}
      />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">{children}</main>
      <BottomTabs isAdmin={isAdmin} />
    </div>
  );
}
