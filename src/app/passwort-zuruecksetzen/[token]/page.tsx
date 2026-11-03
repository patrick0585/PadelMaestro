import { ResetForm } from "./reset-form";
import { PadelLogo } from "@/components/padel-logo";

export default async function ResetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-foreground">Neues Passwort</h1>
        </div>
        <ResetForm token={token} />
      </div>
    </div>
  );
}
