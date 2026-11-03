export type InvitationInvalidReason = "unknown" | "expired" | "revoked" | "exhausted";

export class InvitationInvalidError extends Error {
  constructor(public readonly reason: InvitationInvalidReason) {
    super(`invitation not redeemable: ${reason}`);
    this.name = "InvitationInvalidError";
  }
}

export class InvitationNotFoundError extends Error {
  constructor() {
    super("invitation not found");
    this.name = "InvitationNotFoundError";
  }
}
