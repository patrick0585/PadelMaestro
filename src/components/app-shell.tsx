import { auth } from "@/auth";
import { TopNav } from "./top-nav";
import { BottomTabs } from "./bottom-tabs";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) {
    return <>{children}</>;
  }
  const { isAdmin, name } = session.user;
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav isAdmin={isAdmin} name={name} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">{children}</main>
      <BottomTabs isAdmin={isAdmin} />
    </div>
  );
}
