"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { signOut } from "next-auth/react";
import { unregisterThisDevice } from "@/lib/push/client";
import { ListRow } from "@/components/ui/list";

/** Row for the profile's account list. */
export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <ListRow
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        // Push must stop for this device before the session ends.
        await unregisterThisDevice();
        await signOut({ callbackUrl: "/login" });
      }}
      icon={{ node: <LogOut className="size-[17px]" />, color: "#64748b" }}
      title={busy ? "Abmelden…" : "Abmelden"}
    />
  );
}
