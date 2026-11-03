export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`duplicate email: ${email}`);
    this.name = "DuplicateEmailError";
  }
}

export class DuplicateUsernameError extends Error {
  constructor(username: string) {
    super(`duplicate username: ${username}`);
    this.name = "DuplicateUsernameError";
  }
}

export class LastAdminError extends Error {
  constructor() {
    super("cannot remove the last remaining admin");
    this.name = "LastAdminError";
  }
}

export class OwnerProtectedError extends Error {
  constructor(message = "the group owner cannot be demoted or removed") {
    super(message);
    this.name = "OwnerProtectedError";
  }
}

export class SharedAccountError extends Error {
  constructor() {
    super("account belongs to other groups too");
    this.name = "SharedAccountError";
  }
}
