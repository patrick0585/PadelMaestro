export { PlayerNotFoundError } from "@/lib/players/errors";

export class EmailTakenError extends Error {
  constructor(email: string) {
    super(`email already in use: ${email}`);
    this.name = "EmailTakenError";
  }
}

export class InvalidTokenError extends Error {
  constructor() {
    super("invalid or expired token");
    this.name = "InvalidTokenError";
  }
}

export class WrongPasswordError extends Error {
  constructor() {
    super("wrong password");
    this.name = "WrongPasswordError";
  }
}
