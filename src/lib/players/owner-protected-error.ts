export class OwnerProtectedError extends Error {
  constructor() {
    super("the group owner cannot be demoted or removed");
    this.name = "OwnerProtectedError";
  }
}
