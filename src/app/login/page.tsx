import { LoginForm } from "./login-form";
import { PadelLogo } from "@/components/padel-logo";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <PadelLogo className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-extrabold text-foreground">Willkommen zurück</h1>
          <p className="mt-1 text-sm text-foreground-muted">Bitte melde dich an.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
