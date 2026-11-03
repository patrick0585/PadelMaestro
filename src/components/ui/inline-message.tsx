import type { ReactNode } from "react";

export function InlineMessage({
  kind,
  id,
  children,
}: {
  kind: "error" | "success";
  id?: string;
  children: ReactNode;
}) {
  if (kind === "error") {
    return (
      <p id={id} role="alert" className="rounded-xl bg-destructive-soft/40 px-3 py-2 text-sm text-destructive">
        {children}
      </p>
    );
  }
  return (
    <p id={id} role="status" className="rounded-xl bg-success-soft/40 px-3 py-2 text-sm text-success">
      {children}
    </p>
  );
}
