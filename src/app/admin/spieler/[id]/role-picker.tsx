"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { InlineMessage } from "@/components/ui/inline-message";
import { FOCUS_INSET } from "@/components/ui/focus";

type PickableRole = "member" | "admin";

const OPTIONS: { value: PickableRole; label: string }[] = [
  { value: "member", label: "Mitglied" },
  { value: "admin", label: "Admin" },
];

export function RolePicker({
  open,
  onClose,
  playerId,
  playerName,
  currentRole,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string;
  playerName: string;
  currentRole: PickableRole;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setError(null);
  }, [open]);

  async function choose(role: PickableRole) {
    if (role === currentRole) {
      onClose();
      return;
    }
    setLoading(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch(`/api/players/${playerId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role }),
      });
    } catch {
      setLoading(false);
      setError("Speichern fehlgeschlagen");
      return;
    }
    setLoading(false);
    if (res.ok) {
      onClose();
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 409 && body.error === "last_admin") {
      setError("Der letzte verbleibende Admin kann nicht degradiert werden");
    } else if (res.status === 409 && body.error === "owner_protected") {
      setError("Die Rolle des Besitzers kann nicht geändert werden");
    } else {
      setError("Speichern fehlgeschlagen");
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Rolle — ${playerName}`}>
      <div className="space-y-3">
        <div className="overflow-hidden rounded-xl border border-border">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={loading}
              onClick={() => choose(o.value)}
              className={`flex min-h-11 w-full items-center justify-between border-b border-border px-3 text-left text-[14.5px] last:border-b-0 ${FOCUS_INSET} disabled:opacity-50`}
            >
              {o.label}
              {o.value === currentRole && (
                <span aria-hidden="true" className="text-primary">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
        {error && <InlineMessage kind="error">{error}</InlineMessage>}
        <div className="flex justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
