export class OwnerProtectedError extends Error {
  constructor(message = "the group owner cannot be demoted or removed") {
    super(message);
    this.name = "OwnerProtectedError";
  }
}
