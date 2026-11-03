export function publicSignupEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PUBLIC_SIGNUP === "true";
}
