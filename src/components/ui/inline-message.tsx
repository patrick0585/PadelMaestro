import type { ReactNode } from "react";

export function InlineMessage({
  kind,
  children,
}: {
  kind: "error" | "success";
  children: ReactNode;
}) {
  if (kind === "error") {
    return (
      <p role="alert" className="rounded-xl bg-destructive-soft/40 px-3 py-2 text-sm text-destructive">
        {children}
      </p>
    );
  }
  return (
    <p role="status" className="rounded-xl bg-success-soft/40 px-3 py-2 text-sm text-success">
      {children}
    </p>
  );
}
