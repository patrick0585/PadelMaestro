"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";

type Group = { id: string; name: string };

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background";

export function GroupSwitcher({
  groups,
  activeGroupId,
}: {
  groups: Group[];
  activeGroupId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (groups.length === 0) return null;

  if (groups.length === 1) {
    const { name } = groups[0];
    return (
      <span
        className="max-w-[12rem] truncate text-sm font-semibold text-foreground-muted"
        title={name}
      >
        {name}
      </span>
    );
  }

  const active = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  async function select(groupId: string) {
    setFailed(false);
    setPending(true);
    try {
      const res = await fetch("/api/profile/active-group", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (res.status !== 204) throw new Error(`status ${res.status}`);
      setOpen(false);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Gruppe wechseln"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={pending}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className={`flex min-h-11 max-w-full items-center gap-1 rounded-xl px-2 text-sm font-semibold text-foreground-muted transition-colors hover:text-foreground disabled:cursor-wait disabled:opacity-60 ${FOCUS_RING}`}
      >
        <span className="max-w-[12rem] truncate" title={active.name}>
          {active.name}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
      </button>
      {(open || failed) && (
        <div className="absolute left-0 top-full z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2">
          {open && (
            <div
              role="menu"
              aria-label="Gruppen"
              className="rounded-xl border border-border-strong bg-surface-elevated py-1 text-foreground"
            >
              {groups.map((g) => {
                const checked = g.id === active.id;
                return (
                  <button
                    key={g.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={checked}
                    disabled={pending}
                    onClick={() => (checked ? setOpen(false) : select(g.id))}
                    className={`flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${
                      checked ? "font-semibold text-primary" : "text-foreground"
                    }`}
                  >
                    <span className="truncate">{g.name}</span>
                    {checked && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                  </button>
                );
              })}
            </div>
          )}
          {failed && <InlineMessage kind="error">Wechsel fehlgeschlagen.</InlineMessage>}
        </div>
      )}
    </div>
  );
}
