"use client";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";
import { InlineMessage } from "@/components/ui/inline-message";
import { FOCUS_INSET } from "@/components/ui/focus";

type Group = { id: string; name: string };

const NAME_WIDTH = "block min-w-0 max-w-[9rem] truncate min-[380px]:max-w-[11rem] lg:max-w-[12rem]";
const NAME_TEXT = "font-display text-[17px] font-extrabold uppercase tracking-[0.05em] text-foreground";

export function GroupSwitcher({
  groups,
  activeGroupId,
}: {
  groups: Group[];
  activeGroupId: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const returnFocus = useRef(false);
  const pointerInside = useRef(false);

  const active = groups.find((g) => g.id === activeGroupId) ?? groups[0];

  function openMenu() {
    setFailed(false);
    const checkedIndex = groups.findIndex((g) => g.id === active?.id);
    setFocusIndex(Math.max(checkedIndex, 0));
    setOpen(true);
  }

  function closeMenu(focusTrigger: boolean) {
    setFailed(false);
    setOpen(false);
    returnFocus.current = focusTrigger;
  }

  useEffect(() => {
    if (open) itemRefs.current[focusIndex]?.focus();
  }, [open, focusIndex]);

  useEffect(() => {
    if (!open && !pending && returnFocus.current) {
      returnFocus.current = false;
      triggerRef.current?.focus();
    }
  }, [open, pending]);

  if (groups.length === 0) return null;

  if (groups.length === 1) {
    const { name } = groups[0];
    return (
      <span className={`${NAME_WIDTH} ${NAME_TEXT}`} title={name}>
        {name}
      </span>
    );
  }

  async function select(groupId: string) {
    if (pending) return;
    if (groupId === activeGroupId) {
      closeMenu(true);
      return;
    }
    setFailed(false);
    setPending(true);
    try {
      const res = await fetch("/api/profile/active-group", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupId }),
      });
      if (res.status !== 204) throw new Error(`status ${res.status}`);
      closeMenu(true);
      router.refresh();
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const last = groups.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: focusIndex === last ? 0 : focusIndex + 1,
      ArrowUp: focusIndex === 0 ? last : focusIndex - 1,
      Home: 0,
      End: last,
    };
    if (e.key in moves) {
      e.preventDefault();
      setFocusIndex(moves[e.key]);
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative -ml-2 min-w-0"
      onKeyDown={(e) => {
        if (open && e.key === "Escape") closeMenu(true);
      }}
      // Safari and Firefox on macOS don't focus buttons on mousedown, so a press
      // inside blurs with relatedTarget null; ignore that blur until mouseup.
      onMouseDown={() => {
        pointerInside.current = true;
        window.addEventListener("mouseup", () => (pointerInside.current = false), { once: true });
      }}
      onBlur={(e) => {
        if (pointerInside.current) return;
        const next = e.relatedTarget as Node | null;
        // Focus to nowhere means a click on inert content: hand it back to the trigger.
        if (open && !rootRef.current?.contains(next)) closeMenu(next === null);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={pending}
        disabled={pending}
        onClick={() => (open ? closeMenu(true) : openMenu())}
        className="flex min-h-11 min-w-0 items-center gap-1 rounded-xl px-1.5 text-foreground transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-wait disabled:opacity-60"
      >
        <span className="sr-only">Gruppe wechseln:</span>{" "}
        <span className={`${NAME_WIDTH} ${NAME_TEXT}`} title={active.name}>
          {active.name}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-foreground-muted" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-2 flex w-64 max-w-[calc(100vw-2rem)] flex-col gap-2">
          <div
            role="menu"
            aria-label="Gruppen"
            onKeyDown={onMenuKeyDown}
            className="rounded-xl border border-border-strong bg-surface-elevated py-1 text-foreground"
          >
            {groups.map((g, i) => {
              const checked = g.id === active.id;
              return (
                <button
                  key={g.id}
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  type="button"
                  role="menuitemradio"
                  aria-checked={checked}
                  tabIndex={i === focusIndex ? 0 : -1}
                  title={g.name}
                  onClick={() => select(g.id)}
                  className={`flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm hover:bg-surface-muted ${FOCUS_INSET} ${
                    checked ? "font-semibold text-primary" : "text-foreground"
                  }`}
                >
                  <span className="truncate">{g.name}</span>
                  {checked && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                </button>
              );
            })}
          </div>
          {failed && (
            <InlineMessage kind="error">
              Gruppenwechsel fehlgeschlagen. Bitte erneut versuchen.
            </InlineMessage>
          )}
        </div>
      )}
    </div>
  );
}
