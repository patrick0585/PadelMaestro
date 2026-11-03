// A throw here only makes Next answer every request with 500 while the
// process keeps running, so a broken mail config exits explicitly.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkMailConfig } = await import("@/lib/mail/startup-check");
  try {
    checkMailConfig(process.env);
  } catch (e) {
    console.error("[startup]", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}
