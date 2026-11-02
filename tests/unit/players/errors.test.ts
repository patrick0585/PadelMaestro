import { describe, it, expect } from "vitest";
import * as errors from "@/lib/players/errors";
import * as create from "@/lib/players/create";
import * as del from "@/lib/players/delete";
import * as reset from "@/lib/players/reset-password";
import * as avatar from "@/lib/players/avatar";
import * as change from "@/lib/players/change-password";

describe("shared player errors", () => {
  it("sets names and messages", () => {
    expect(new errors.PlayerNotFoundError("p1")).toMatchObject({
      name: "PlayerNotFoundError",
      message: "player not found: p1",
    });
    expect(new errors.DuplicateEmailError("a@b.c").name).toBe("DuplicateEmailError");
    expect(new errors.DuplicateUsernameError("x").name).toBe("DuplicateUsernameError");
    expect(new errors.LastAdminError().name).toBe("LastAdminError");
    expect(new errors.OwnerProtectedError().name).toBe("OwnerProtectedError");
  });

  it("re-exports the same classes from every module", () => {
    expect(del.PlayerNotFoundError).toBe(errors.PlayerNotFoundError);
    expect(reset.PlayerNotFoundError).toBe(errors.PlayerNotFoundError);
    expect(avatar.PlayerNotFoundError).toBe(errors.PlayerNotFoundError);
    expect(change.PlayerNotFoundError).toBe(errors.PlayerNotFoundError);
    expect(create.DuplicateEmailError).toBe(errors.DuplicateEmailError);
    expect(create.DuplicateUsernameError).toBe(errors.DuplicateUsernameError);
    expect(del.LastAdminError).toBe(errors.LastAdminError);
  });
});
