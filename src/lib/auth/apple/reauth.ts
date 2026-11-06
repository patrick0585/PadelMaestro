import { appleConfig } from "./config";
import { AppleAuthError } from "./errors";
import { verifyRequestIdentity } from "./flow";
import type { AppleIdentity } from "./verify";

export const REAUTH_MAX_AGE_S = 300;
const CLOCK_SKEW_S = 60;

export class AppleReauthRequiredError extends Error {
  constructor() {
    super("fresh Apple sign-in required");
    this.name = "AppleReauthRequiredError";
  }
}

export const APPLE_REAUTH_MESSAGE = "Bitte bestätige das mit Apple.";

/** Apple-only accounts have no password, so a just-issued Apple token for their own ID stands in for it. */
export function assertFreshAppleProof(
  appleSub: string,
  proof: AppleIdentity | undefined,
  now: Date = new Date(),
): void {
  if (!proof || proof.sub !== appleSub || proof.issuedAt === null) throw new AppleReauthRequiredError();
  const age = Math.floor(now.getTime() / 1000) - proof.issuedAt;
  if (age > REAUTH_MAX_AGE_S || age < -CLOCK_SKEW_S) throw new AppleReauthRequiredError();
}

/** Route helper: verifies an optional identity token; any failure means re-authentication is required. */
export async function verifyReauthToken(
  req: Request,
  identityToken: string | undefined,
): Promise<AppleIdentity | undefined> {
  if (!identityToken) return undefined;
  const cfg = appleConfig();
  if (!cfg) throw new AppleReauthRequiredError();
  try {
    return await verifyRequestIdentity(cfg, req, identityToken);
  } catch (e) {
    if (e instanceof AppleAuthError) throw new AppleReauthRequiredError();
    throw e;
  }
}
