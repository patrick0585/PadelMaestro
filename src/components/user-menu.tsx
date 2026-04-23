"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { initials } from "@/lib/player/initials";

export function UserMenu({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Benutzermenü"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-elevated text-sm font-semibold text-primary border border-border-strong"
      >
        {initials(name)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-border-strong bg-surface-elevated py-1 text-foreground"
        >
          <Link
            role="menuitem"
            href="/profil"
            onClick={() => setOpen(false)}
            className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
          >
            Profil
          </Link>
          <button
            role="menuitem"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
          >
            Abmelden
          </button>
        </div>
      )}
    </div>
  );
}
