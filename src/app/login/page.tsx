import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[image:var(--cta-gradient)] text-xl font-extrabold text-background">
            P
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Willkommen zurück</h1>
          <p className="mt-1 text-sm text-foreground-muted">Bitte melde dich an.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
