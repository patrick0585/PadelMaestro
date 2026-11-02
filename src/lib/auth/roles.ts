export type GroupRole = "owner" | "admin" | "member";

export function isAdminRole(role: GroupRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function roleForAdminFlag(isAdmin: boolean): "admin" | "member" {
  return isAdmin ? "admin" : "member";
}
