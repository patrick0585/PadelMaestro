export type GroupRole = "owner" | "admin" | "member";

export function isAdminRole(role: GroupRole | null | undefined): boolean {
  return role === "owner" || role === "admin";
}
