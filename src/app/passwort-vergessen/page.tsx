import { RequestForm } from "./request-form";
import { PadelLogo } from "@/components/padel-logo";

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-foreground">Passwort vergessen</h1>
        </div>
        <RequestForm />
      </div>
    </div>
  );
}
