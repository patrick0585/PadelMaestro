import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #f0f9ff, #eff6ff)" }}
    >
      <LoginForm />
    </main>
  );
}
