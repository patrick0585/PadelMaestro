import { InviteForm } from "./invite-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center">
      <InviteForm token={token} />
    </main>
  );
}
