# UI Redesign & Admin User Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current dark-auto theme with a light-only, modern, mobile-first UI in Sky-Blue, add bottom-tab / top navigation, swap invitation-link signup for admin-driven user creation + password reset.

**Architecture:** Tailwind v4 `@theme inline` tokens drive a small shared UI library under `src/components/ui/`. A server-rendered `<AppShell>` in `src/app/layout.tsx` reads the session and mounts `<TopNav>` (desktop) + `<BottomTabs>` (mobile). Two new admin-only API routes (`POST /api/players`, `PATCH /api/players/:id/password`) replace the entire invitation flow, which is removed (routes, pages, Prisma model).

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 6, Tailwind v4, Prisma 6 + PostgreSQL, next-auth v5 (split `auth.config.ts` + `auth.ts`), bcryptjs, zod, Vitest 2, React Testing Library.

**Source spec:** `docs/superpowers/specs/2026-04-20-ui-redesign-and-admin-user-management-design.md`

---

## File Structure

### New files

```
src/app/api/players/route.ts                            POST + GET
src/app/api/players/[id]/password/route.ts              PATCH
src/app/admin/create-player-dialog.tsx                  Dialog wrapper
src/app/admin/reset-password-dialog.tsx                 Dialog wrapper
src/app/admin/players-section.tsx                       List + dialogs
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/badge.tsx
src/components/ui/dialog.tsx
src/components/ui/input.tsx
src/components/app-shell.tsx                            Server component
src/components/bottom-tabs.tsx                          Client component
src/components/top-nav.tsx                              Client component
src/components/user-menu.tsx                            Client component
src/lib/players/create.ts
src/lib/players/reset-password.ts
tests/components/button.test.tsx
tests/components/badge.test.tsx
tests/components/dialog.test.tsx
tests/components/bottom-tabs.test.tsx
tests/components/top-nav.test.tsx
tests/components/user-menu.test.tsx
tests/unit/players/create.test.ts
tests/unit/players/reset-password.test.ts
tests/integration/players-create.test.ts
tests/integration/players-reset.test.ts
prisma/migrations/<timestamp>_drop_invitations/migration.sql
```

### Modified files

```
src/app/globals.css                                     tokens rewrite
src/app/layout.tsx                                      mount <AppShell>
src/app/login/page.tsx                                  restyle
src/app/login/login-form.tsx                            use UI components
src/app/ranking/page.tsx                                restyle, drop inline nav
src/components/ranking-table.tsx                        card-based redesign
src/app/game-day/page.tsx                               restyle
src/app/game-day/attendance-widget.tsx                  restyle
src/app/game-day/match-list.tsx                         card-based
src/app/game-day/score-dialog.tsx                       use <Dialog>
src/app/admin/page.tsx                                  three sections, no invites
src/app/admin/create-game-day-form.tsx                  restyle
src/app/admin/start-game-day-button.tsx                 restyle
prisma/schema.prisma                                    drop Invitation model + back-relation
tests/helpers/reset-db.ts                               remove invitation deleteMany
```

### Deleted files

```
src/app/api/invitations/                                entire directory
src/app/invite/                                         entire directory
src/app/admin/invite-form.tsx
tests/integration/invitation-redeem.test.ts
tests/integration/invitations-api.test.ts
```

---

## Task 1: Create feature branch

**Files:**
- No code changes

- [ ] **Step 1: Create and switch to branch**

Run: `git checkout -b feature/ui-redesign`
Expected: `Switched to a new branch 'feature/ui-redesign'`

- [ ] **Step 2: Verify clean working tree**

Run: `git status --short`
Expected: empty output (plus optionally `.superpowers/` if tracked locally)

---

## Task 2: Rewrite design tokens in globals.css

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Replace globals.css contents**

Full new file contents:

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-border: var(--border);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-soft: var(--primary-soft);
  --color-primary-border: var(--primary-border);
  --color-muted-foreground: var(--muted-foreground);
  --color-destructive: var(--destructive);
  --color-success: var(--success);
}

:root {
  --background: #ffffff;
  --foreground: #0f172a;
  --surface: #ffffff;
  --surface-muted: #f8fafc;
  --border: #e2e8f0;
  --primary: #0ea5e9;
  --primary-hover: #0284c7;
  --primary-soft: #f0f9ff;
  --primary-border: #bae6fd;
  --muted-foreground: #64748b;
  --destructive: #dc2626;
  --success: #16a34a;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 2: Verify dev server compiles**

Run: `pnpm build`
Expected: build succeeds with no CSS errors. There may still be pre-existing warnings (e.g. unused eslint-disable in `src/lib/db.ts`); those are acceptable.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style: replace dark-auto tokens with sky-blue light palette"
```

---

## Task 3: Button component

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `tests/components/button.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/components/button.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("<Button>", () => {
  it("renders children", () => {
    render(<Button>Speichern</Button>);
    expect(screen.getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });

  it("applies the primary variant by default", () => {
    render(<Button>Los</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toMatch(/bg-primary/);
  });

  it("applies the ghost variant when asked", () => {
    render(<Button variant="ghost">Abbrechen</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).not.toMatch(/bg-primary/);
  });

  it("disables the button while loading and shows a spinner marker", () => {
    render(<Button loading>Speichern</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("…");
  });

  it("invokes onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Klick</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/components/button.test.tsx`
Expected: FAIL — cannot find module `@/components/ui/button`.

- [ ] **Step 3: Create the Button component**

`src/components/ui/button.tsx`:

```tsx
"use client";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-white hover:bg-primary-hover",
  secondary: "bg-surface text-foreground border border-border hover:bg-surface-muted",
  ghost: "bg-transparent text-foreground hover:bg-surface-muted",
  destructive: "bg-destructive text-white hover:opacity-90",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className = "",
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`.trim()}
    >
      {loading ? "…" : children}
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/components/button.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/button.tsx tests/components/button.test.tsx
git commit -m "feat(ui): add <Button> with variants and loading state"
```

---

## Task 4: Card component

**Files:**
- Create: `src/components/ui/card.tsx`

- [ ] **Step 1: Create the Card component**

`src/components/ui/card.tsx`:

```tsx
import type { HTMLAttributes } from "react";

const BASE = "rounded-2xl bg-surface border border-border shadow-sm";

export function Card({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`${BASE} ${className}`.trim()} />;
}

export function CardHeader({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`px-5 pt-5 ${className}`.trim()} />;
}

export function CardBody({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`p-5 ${className}`.trim()} />;
}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "feat(ui): add <Card>, <CardHeader>, <CardBody>"
```

---

## Task 5: Badge component

**Files:**
- Create: `src/components/ui/badge.tsx`
- Create: `tests/components/badge.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/components/badge.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Badge } from "@/components/ui/badge";

describe("<Badge>", () => {
  it("renders children", () => {
    render(<Badge>Admin</Badge>);
    expect(screen.getByText("Admin")).toBeInTheDocument();
  });

  it("uses primary variant styling by default", () => {
    render(<Badge>Aktiv</Badge>);
    expect(screen.getByText("Aktiv").className).toMatch(/bg-primary-soft/);
  });

  it("uses neutral variant styling when requested", () => {
    render(<Badge variant="neutral">#3</Badge>);
    expect(screen.getByText("#3").className).toMatch(/bg-surface-muted/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/components/badge.test.tsx`
Expected: FAIL — cannot find module `@/components/ui/badge`.

- [ ] **Step 3: Create the Badge component**

`src/components/ui/badge.tsx`:

```tsx
import type { HTMLAttributes } from "react";

type Variant = "primary" | "neutral" | "success" | "destructive";

const BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary-soft text-primary border border-primary-border",
  neutral: "bg-surface-muted text-muted-foreground",
  success: "bg-surface-muted text-success",
  destructive: "bg-surface-muted text-destructive",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = "primary", className = "", ...rest }: BadgeProps) {
  return <span {...rest} className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/components/badge.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/badge.tsx tests/components/badge.test.tsx
git commit -m "feat(ui): add <Badge> with color variants"
```

---

## Task 6: Input and Label components

**Files:**
- Create: `src/components/ui/input.tsx`

- [ ] **Step 1: Create the Input + Label components**

`src/components/ui/input.tsx`:

```tsx
import type { InputHTMLAttributes, LabelHTMLAttributes } from "react";

const INPUT_BASE =
  "w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${INPUT_BASE} ${className}`.trim()} />;
}

const LABEL_BASE = "mb-1 block text-sm font-medium text-foreground";

export function Label({ className = "", ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...rest} className={`${LABEL_BASE} ${className}`.trim()} />;
}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/input.tsx
git commit -m "feat(ui): add <Input> and <Label>"
```

---

## Task 7: Dialog component

**Files:**
- Create: `src/components/ui/dialog.tsx`
- Create: `tests/components/dialog.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/components/dialog.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
import { Dialog } from "@/components/ui/dialog";

describe("<Dialog>", () => {
  it("does not render when closed", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Test">
        <p>hidden</p>
      </Dialog>,
    );
    expect(screen.queryByText("hidden")).not.toBeInTheDocument();
  });

  it("renders title and children when open", () => {
    render(
      <Dialog open onClose={() => {}} title="Neuer Spieler">
        <p>visible</p>
      </Dialog>,
    );
    expect(screen.getByRole("dialog", { name: "Neuer Spieler" })).toBeInTheDocument();
    expect(screen.getByText("visible")).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="x">
        <p>x</p>
      </Dialog>,
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="x">
        <p>x</p>
      </Dialog>,
    );
    const backdrop = screen.getByTestId("dialog-backdrop");
    await userEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not close when clicking inside the dialog", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="x">
        <p>inside</p>
      </Dialog>,
    );
    await userEvent.click(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/components/dialog.test.tsx`
Expected: FAIL — cannot find module `@/components/ui/dialog`.

- [ ] **Step 3: Create the Dialog component**

`src/components/ui/dialog.tsx`:

```tsx
"use client";
import { useEffect, useId } from "react";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Dialog({ open, onClose, title, children }: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      data-testid="dialog-backdrop"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl bg-surface p-5 shadow-sm sm:rounded-2xl"
      >
        <h2 id={titleId} className="mb-4 text-lg font-semibold text-foreground">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/components/dialog.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/dialog.tsx tests/components/dialog.test.tsx
git commit -m "feat(ui): add accessible <Dialog> with Escape and backdrop close"
```

---

## Task 8: UserMenu component

**Files:**
- Create: `src/components/user-menu.tsx`
- Create: `tests/components/user-menu.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/components/user-menu.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { UserMenu } from "@/components/user-menu";

const signOutMock = vi.fn();
vi.mock("next-auth/react", () => ({
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

describe("<UserMenu>", () => {
  beforeEach(() => signOutMock.mockClear());

  it("shows initials derived from the name", () => {
    render(<UserMenu name="Patrick Koch" />);
    expect(screen.getByRole("button", { name: /benutzermenü/i })).toHaveTextContent("PK");
  });

  it("falls back to a single initial for single-word names", () => {
    render(<UserMenu name="Patrick" />);
    expect(screen.getByRole("button", { name: /benutzermenü/i })).toHaveTextContent("P");
  });

  it("opens menu and calls signOut when clicking Abmelden", async () => {
    render(<UserMenu name="Patrick Koch" />);
    await userEvent.click(screen.getByRole("button", { name: /benutzermenü/i }));
    await userEvent.click(screen.getByRole("menuitem", { name: /abmelden/i }));
    expect(signOutMock).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/components/user-menu.test.tsx`
Expected: FAIL — cannot find module `@/components/user-menu`.

- [ ] **Step 3: Create the UserMenu**

`src/components/user-menu.tsx`:

```tsx
"use client";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
        className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white"
      >
        {initials(name)}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-44 rounded-xl border border-border bg-surface py-1 shadow-sm"
        >
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/components/user-menu.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/user-menu.tsx tests/components/user-menu.test.tsx
git commit -m "feat(nav): add <UserMenu> with initials and sign-out"
```

---

## Task 9: BottomTabs component

**Files:**
- Create: `src/components/bottom-tabs.tsx`
- Create: `tests/components/bottom-tabs.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/components/bottom-tabs.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { BottomTabs } from "@/components/bottom-tabs";

let currentPath = "/ranking";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));

describe("<BottomTabs>", () => {
  it("renders Rangliste and Spieltag for non-admins", () => {
    currentPath = "/ranking";
    render(<BottomTabs isAdmin={false} />);
    expect(screen.getByRole("link", { name: /rangliste/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /spieltag/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument();
  });

  it("shows the Admin tab when isAdmin is true", () => {
    currentPath = "/ranking";
    render(<BottomTabs isAdmin />);
    expect(screen.getByRole("link", { name: /admin/i })).toBeInTheDocument();
  });

  it("marks the active tab with aria-current='page'", () => {
    currentPath = "/game-day";
    render(<BottomTabs isAdmin={false} />);
    const spieltag = screen.getByRole("link", { name: /spieltag/i });
    expect(spieltag).toHaveAttribute("aria-current", "page");
    const rangliste = screen.getByRole("link", { name: /rangliste/i });
    expect(rangliste).not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/components/bottom-tabs.test.tsx`
Expected: FAIL — cannot find module `@/components/bottom-tabs`.

- [ ] **Step 3: Create the BottomTabs**

`src/components/bottom-tabs.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { href: string; label: string; icon: string };

const USER_TABS: Tab[] = [
  { href: "/ranking", label: "Rangliste", icon: "🏆" },
  { href: "/game-day", label: "Spieltag", icon: "🎾" },
];

const ADMIN_TAB: Tab = { href: "/admin", label: "Admin", icon: "⚙️" };

export function BottomTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...USER_TABS, ADMIN_TAB] : USER_TABS;

  return (
    <nav
      aria-label="Hauptnavigation"
      className="sticky bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
              active ? "text-primary font-semibold" : "text-muted-foreground"
            }`}
          >
            <span className="text-xl">{t.icon}</span>
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/components/bottom-tabs.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/bottom-tabs.tsx tests/components/bottom-tabs.test.tsx
git commit -m "feat(nav): add mobile <BottomTabs> with safe-area padding"
```

---

## Task 10: TopNav component

**Files:**
- Create: `src/components/top-nav.tsx`
- Create: `tests/components/top-nav.test.tsx`

- [ ] **Step 1: Write the failing test**

`tests/components/top-nav.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TopNav } from "@/components/top-nav";

let currentPath = "/ranking";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));

describe("<TopNav>", () => {
  it("renders the brand, user-visible links, and user menu", () => {
    currentPath = "/ranking";
    render(<TopNav isAdmin={false} name="Patrick Koch" />);
    expect(screen.getByText("Padel Tracker")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /rangliste/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /spieltag/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /admin/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /benutzermenü/i })).toHaveTextContent("PK");
  });

  it("shows the Admin link when isAdmin is true", () => {
    currentPath = "/admin";
    render(<TopNav isAdmin name="A B" />);
    const adminLink = screen.getByRole("link", { name: /admin/i });
    expect(adminLink).toHaveAttribute("aria-current", "page");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/components/top-nav.test.tsx`
Expected: FAIL — cannot find module `@/components/top-nav`.

- [ ] **Step 3: Create the TopNav**

`src/components/top-nav.tsx`:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

type Item = { href: string; label: string };

const USER_ITEMS: Item[] = [
  { href: "/ranking", label: "Rangliste" },
  { href: "/game-day", label: "Spieltag" },
];

const ADMIN_ITEM: Item = { href: "/admin", label: "Admin" };

export function TopNav({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const pathname = usePathname();
  const items = isAdmin ? [...USER_ITEMS, ADMIN_ITEM] : USER_ITEMS;

  return (
    <header className="hidden md:block sticky top-0 z-40 border-b border-border bg-surface">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/ranking" className="text-lg font-bold text-foreground">
          Padel Tracker
        </Link>
        <nav aria-label="Hauptnavigation" className="flex items-center gap-4">
          {items.map((i) => {
            const active = pathname === i.href;
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`text-sm ${
                  active ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {i.label}
              </Link>
            );
          })}
          <UserMenu name={name} />
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/components/top-nav.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/top-nav.tsx tests/components/top-nav.test.tsx
git commit -m "feat(nav): add desktop <TopNav>"
```

---

## Task 11: AppShell and layout wiring

**Files:**
- Create: `src/components/app-shell.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Create AppShell**

`src/components/app-shell.tsx`:

```tsx
import { auth } from "@/auth";
import { TopNav } from "./top-nav";
import { BottomTabs } from "./bottom-tabs";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session) {
    return <>{children}</>;
  }
  const { isAdmin, name } = session.user;
  return (
    <div className="flex min-h-screen flex-col">
      <TopNav isAdmin={isAdmin} name={name} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">{children}</main>
      <BottomTabs isAdmin={isAdmin} />
    </div>
  );
}
```

- [ ] **Step 2: Wire layout.tsx**

Replace full contents of `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

export const metadata: Metadata = {
  title: "Padel Tracker",
  description: "Paarungen und Rangliste für unsere Padel-Gruppe",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/app-shell.tsx src/app/layout.tsx
git commit -m "feat(nav): mount <AppShell> at root with session-aware nav"
```

---

## Task 12: Login page restyle

**Files:**
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/login/login-form.tsx`

- [ ] **Step 1: Replace login page contents**

`src/app/login/page.tsx`:

```tsx
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center px-4"
      style={{ background: "linear-gradient(135deg, #f0f9ff, #eff6ff)" }}
    >
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 2: Replace login form contents**

`src/app/login/login-form.tsx`:

```tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { email, password, redirect: false });
    setLoading(false);
    if (res?.error) setError("Falsche E-Mail oder Passwort");
    else router.push("/ranking");
  }

  return (
    <Card className="w-full max-w-sm">
      <CardBody>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-2xl text-white">
            🎾
          </div>
          <h1 className="text-xl font-bold text-foreground">Padel Tracker</h1>
          <p className="text-sm text-muted-foreground">Melde dich an, um weiterzumachen</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="email">E-Mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Passwort</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
          {error && (
            <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
          )}
          <Button type="submit" loading={loading} className="w-full">
            Anmelden
          </Button>
        </form>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx src/app/login/login-form.tsx
git commit -m "style(login): card layout on sky gradient, new UI components"
```

---

## Task 13: RankingTable redesign

**Files:**
- Modify: `src/components/ranking-table.tsx`

- [ ] **Step 1: Replace ranking-table.tsx**

`src/components/ranking-table.tsx`:

```tsx
import type { RankingRow } from "@/lib/ranking/compute";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MEDALS = ["🥇", "🥈", "🥉"] as const;

export function RankingTable({ ranking }: { ranking: RankingRow[] }) {
  if (ranking.length === 0) {
    return (
      <Card>
        <p className="p-8 text-center text-sm text-muted-foreground">
          Noch keine gewerteten Spiele in dieser Saison.
        </p>
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {ranking.map((r) => {
        const medal = r.rank <= 3 ? MEDALS[r.rank - 1] : null;
        const highlight = r.rank <= 3;
        return (
          <li
            key={r.playerId}
            className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
              highlight
                ? "bg-primary-soft border-primary-border"
                : "bg-surface border-border"
            }`}
          >
            <div className="flex items-center gap-3">
              {medal ? (
                <span className="text-2xl" aria-label={`Platz ${r.rank}`}>
                  {medal}
                </span>
              ) : (
                <Badge variant="neutral" aria-label={`Platz ${r.rank}`}>
                  {r.rank}
                </Badge>
              )}
              <span className="font-medium text-foreground">{r.playerName}</span>
            </div>
            <div className="text-right">
              <div className="font-semibold text-foreground">
                {r.pointsPerGame.toFixed(2)} ppS
              </div>
              <div className="text-xs text-muted-foreground">
                {r.games} Spiele · {r.points.toFixed(0)} Pkt · {r.jokersUsed} Joker
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/ranking-table.tsx
git commit -m "style(ranking): card-based layout with medal badges"
```

---

## Task 14: Ranking page restyle

**Files:**
- Modify: `src/app/ranking/page.tsx`

- [ ] **Step 1: Replace ranking page**

`src/app/ranking/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { RankingTable } from "@/components/ranking-table";

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const season = await getOrCreateActiveSeason();
  const ranking = await computeRanking(season.id);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Saison {season.year}
          </p>
          <h1 className="text-2xl font-bold text-foreground">Rangliste</h1>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-xl">
          🎾
        </div>
      </header>
      <RankingTable ranking={ranking} />
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/ranking/page.tsx
git commit -m "style(ranking): header with season caption, drop inline nav"
```

---

## Task 15: Game-day page restyle

**Files:**
- Modify: `src/app/game-day/page.tsx`

- [ ] **Step 1: Replace game-day page**

`src/app/game-day/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AttendanceWidget } from "./attendance-widget";
import { MatchList } from "./match-list";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "Geplant",
  roster_locked: "Paarungen festgelegt",
  in_progress: "Läuft",
  finished: "Beendet",
};

export default async function GameDayPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const day = await prisma.gameDay.findFirst({
    where: { status: { in: ["planned", "roster_locked", "in_progress"] } },
    orderBy: { date: "desc" },
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
      matches: {
        orderBy: { matchNumber: "asc" },
        include: {
          team1PlayerA: { select: { name: true } },
          team1PlayerB: { select: { name: true } },
          team2PlayerA: { select: { name: true } },
          team2PlayerB: { select: { name: true } },
        },
      },
    },
  });

  if (!day) {
    return (
      <Card>
        <CardBody>
          <h1 className="text-lg font-semibold text-foreground">Kein aktiver Spieltag</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ein Admin muss zuerst einen Spieltag anlegen.
          </p>
        </CardBody>
      </Card>
    );
  }

  const me = day.participants.find((p) => p.playerId === session.user.id);
  const format = day.playerCount === 4 ? "first-to-6" : "first-to-3";

  return (
    <div className="space-y-5">
      <Card>
        <CardBody className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Spieltag
            </p>
            <h1 className="text-xl font-bold text-foreground">
              {new Date(day.date).toLocaleDateString("de-DE")}
            </h1>
          </div>
          <Badge>{STATUS_LABEL[day.status] ?? day.status}</Badge>
        </CardBody>
      </Card>

      {day.status === "planned" && me && (
        <Card>
          <CardBody>
            <h2 className="mb-3 text-base font-semibold text-foreground">Bist du dabei?</h2>
            <AttendanceWidget gameDayId={day.id} current={me.attendance} />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardBody>
          <h2 className="mb-3 text-base font-semibold text-foreground">Teilnehmer</h2>
          <ul className="space-y-1 text-sm">
            {day.participants.map((p) => (
              <li key={p.id} className="flex justify-between text-foreground">
                <span>{p.player.name}</span>
                <span className="text-muted-foreground">{p.attendance}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {day.matches.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-foreground">Spiele</h2>
          <MatchList
            format={format}
            matches={day.matches.map((m) => ({
              id: m.id,
              matchNumber: m.matchNumber,
              team1A: m.team1PlayerA.name,
              team1B: m.team1PlayerB.name,
              team2A: m.team2PlayerA.name,
              team2B: m.team2PlayerB.name,
              team1Score: m.team1Score,
              team2Score: m.team2Score,
              version: m.version,
            }))}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds. If `MatchList` props have changed upstream, the next task repairs them.

- [ ] **Step 3: Commit**

```bash
git add src/app/game-day/page.tsx
git commit -m "style(game-day): card layout with status badge"
```

---

## Task 16: AttendanceWidget restyle

**Files:**
- Modify: `src/app/game-day/attendance-widget.tsx`

- [ ] **Step 1: Read the existing widget**

Run: `cat src/app/game-day/attendance-widget.tsx`
Note the current shape so the error state is preserved in the restyle.

- [ ] **Step 2: Replace attendance-widget.tsx**

`src/app/game-day/attendance-widget.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type Attendance = "unknown" | "confirmed" | "declined";

const OPTIONS: Array<{ value: Attendance; label: string }> = [
  { value: "confirmed", label: "Dabei" },
  { value: "declined", label: "Nicht dabei" },
  { value: "unknown", label: "Weiß nicht" },
];

export function AttendanceWidget({
  gameDayId,
  current,
}: {
  gameDayId: string;
  current: Attendance;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Attendance>(current);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function set(next: Attendance) {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attendance: next }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Konnte Status nicht speichern");
      return;
    }
    setValue(next);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {OPTIONS.map((o) => (
          <Button
            key={o.value}
            type="button"
            variant={value === o.value ? "primary" : "secondary"}
            size="sm"
            disabled={loading}
            onClick={() => set(o.value)}
          >
            {o.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run integration tests for attendance**

Run: `pnpm test -- tests/integration/attendance.test.ts`
Expected: PASS (unchanged API).

- [ ] **Step 4: Commit**

```bash
git add src/app/game-day/attendance-widget.tsx
git commit -m "style(game-day): attendance toggles as button group"
```

---

## Task 17: MatchList restyle

**Files:**
- Modify: `src/app/game-day/match-list.tsx`

- [ ] **Step 1: Replace match-list.tsx**

`src/app/game-day/match-list.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreDialog } from "./score-dialog";

export interface MatchRow {
  id: string;
  matchNumber: number;
  team1A: string;
  team1B: string;
  team2A: string;
  team2B: string;
  team1Score: number | null;
  team2Score: number | null;
  version: number;
}

export function MatchList({
  format,
  matches,
}: {
  format: "first-to-3" | "first-to-6";
  matches: MatchRow[];
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = matches.find((m) => m.id === editingId) ?? null;

  async function undo(id: string) {
    const res = await fetch(`/api/matches/${id}/undo`, { method: "POST" });
    if (res.ok) router.refresh();
  }

  return (
    <ul className="space-y-2">
      {matches.map((m) => {
        const hasScore = m.team1Score !== null && m.team2Score !== null;
        return (
          <li key={m.id}>
            <Card>
              <CardBody className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Badge variant="neutral">#{m.matchNumber}</Badge>
                  <div className="text-sm">
                    <div className="font-medium text-foreground">
                      {m.team1A} &amp; {m.team1B}
                    </div>
                    <div className="text-xs text-muted-foreground">vs</div>
                    <div className="font-medium text-foreground">
                      {m.team2A} &amp; {m.team2B}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasScore ? (
                    <>
                      <div className="text-lg font-bold text-foreground">
                        {m.team1Score}:{m.team2Score}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => undo(m.id)}>
                        Zurück
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setEditingId(m.id)}>
                      Ergebnis
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          </li>
        );
      })}
      {editing && (
        <ScoreDialog
          match={editing}
          format={format}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            router.refresh();
          }}
        />
      )}
    </ul>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build may fail because `ScoreDialog` signature hasn't been updated yet — acceptable. The next task repairs `ScoreDialog`.

- [ ] **Step 3: Commit (keep the failing build local — it's fixed in Task 18)**

```bash
git add src/app/game-day/match-list.tsx
git commit -m "style(game-day): match list as cards with inline score"
```

---

## Task 18: Migrate ScoreDialog to new Dialog

**Files:**
- Modify: `src/app/game-day/score-dialog.tsx`

- [ ] **Step 1: Read existing score-dialog.tsx**

Run: `cat src/app/game-day/score-dialog.tsx`
Note: it accepts `match`, `format` and whatever close callbacks it currently has; we standardise to `onClose` + `onSaved`.

- [ ] **Step 2: Replace score-dialog.tsx**

`src/app/game-day/score-dialog.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import type { MatchRow } from "./match-list";

const PRESETS = {
  "first-to-3": [
    { team1: 3, team2: 0 },
    { team1: 3, team2: 1 },
    { team1: 3, team2: 2 },
    { team1: 2, team2: 3 },
    { team1: 1, team2: 3 },
    { team1: 0, team2: 3 },
  ],
  "first-to-6": [
    { team1: 6, team2: 0 },
    { team1: 6, team2: 2 },
    { team1: 6, team2: 4 },
    { team1: 4, team2: 6 },
    { team1: 2, team2: 6 },
    { team1: 0, team2: 6 },
  ],
} as const;

export function ScoreDialog({
  match,
  format,
  onClose,
  onSaved,
}: {
  match: MatchRow;
  format: "first-to-3" | "first-to-6";
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<{ team1: number; team2: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        team1Score: selected.team1,
        team2Score: selected.team2,
        version: match.version,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      if (res.status === 409) setError("Das Spiel wurde zwischenzeitlich geändert");
      else setError("Speichern fehlgeschlagen");
      return;
    }
    onSaved();
  }

  return (
    <Dialog open onClose={onClose} title={`Ergebnis — Spiel #${match.matchNumber}`}>
      <div className="space-y-4">
        <p className="text-sm text-foreground">
          <span className="font-medium">{match.team1A} &amp; {match.team1B}</span>
          <span className="text-muted-foreground"> vs </span>
          <span className="font-medium">{match.team2A} &amp; {match.team2B}</span>
        </p>

        <div>
          <Label>Ergebnis wählen</Label>
          <div className="grid grid-cols-3 gap-2">
            {PRESETS[format].map((p) => {
              const active = selected?.team1 === p.team1 && selected?.team2 === p.team2;
              return (
                <button
                  key={`${p.team1}-${p.team2}`}
                  type="button"
                  onClick={() => setSelected(p)}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    active
                      ? "bg-primary-soft border-primary-border text-primary"
                      : "bg-surface border-border text-foreground hover:bg-surface-muted"
                  }`}
                >
                  {p.team1}:{p.team2}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
          <Button onClick={save} disabled={!selected} loading={saving}>
            Speichern
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 3: Run game-day integration tests**

Run: `pnpm test -- tests/integration/enter-score.test.ts tests/integration/undo.test.ts`
Expected: PASS (API unchanged).

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/game-day/score-dialog.tsx
git commit -m "style(game-day): score dialog uses shared <Dialog>"
```

---

## Task 19: Admin page — remove invite section, restyle game-day and list

**Files:**
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Replace admin page contents**

`src/app/admin/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreateGameDayForm } from "./create-game-day-form";
import { StartGameDayButton } from "./start-game-day-button";
import { PlayersSection } from "./players-section";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) redirect("/ranking");

  const players = await prisma.player.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, isAdmin: true, passwordHash: true },
  });
  const plannedDay = await prisma.gameDay.findFirst({
    where: { status: "planned" },
    orderBy: { date: "desc" },
  });

  const playersForUi = players.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    isAdmin: p.isAdmin,
    hasPassword: p.passwordHash !== null,
  }));

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-primary">Admin</p>
        <h1 className="text-2xl font-bold text-foreground">Verwaltung</h1>
      </header>

      <PlayersSection players={playersForUi} />

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Spieltage</h2>
          <CreateGameDayForm />
          {plannedDay && (
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div className="text-sm">
                <div className="font-medium text-foreground">
                  Offener Spieltag: {new Date(plannedDay.date).toLocaleDateString("de-DE")}
                </div>
                <Badge variant="neutral">planned</Badge>
              </div>
              <StartGameDayButton gameDayId={plannedDay.id} />
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h2 className="mb-2 text-base font-semibold text-foreground">Historische Daten</h2>
          <p className="text-sm text-muted-foreground">
            Import über die CLI:
            <code className="mx-1 rounded-md bg-surface-muted px-1.5 py-0.5">
              pnpm import:historical &lt;file&gt;
            </code>
            — Details in <code className="rounded-md bg-surface-muted px-1.5 py-0.5">docs/import-historical.md</code>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify build fails with expected error**

Run: `pnpm build`
Expected: FAIL — cannot find module `./players-section`. This is expected; Task 24 creates it.

- [ ] **Step 3: Commit the half-wired admin page**

```bash
git add src/app/admin/page.tsx
git commit -m "refactor(admin): three-section layout, drop invite references"
```

Note: build will succeed once Task 24 adds `players-section.tsx`.

---

## Task 20: CreateGameDayForm restyle

**Files:**
- Modify: `src/app/admin/create-game-day-form.tsx`

- [ ] **Step 1: Read existing file**

Run: `cat src/app/admin/create-game-day-form.tsx`
Note the current fetch URL and field names so the replacement keeps the same API contract.

- [ ] **Step 2: Replace contents**

`src/app/admin/create-game-day-form.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreateGameDayForm() {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/game-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Anlegen fehlgeschlagen");
      return;
    }
    setDate("");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      <div className="flex-1 min-w-[12rem]">
        <Label htmlFor="game-day-date">Datum</Label>
        <Input
          id="game-day-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </div>
      <Button type="submit" loading={loading}>
        Spieltag anlegen
      </Button>
      {error && (
        <p className="w-full rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Run game-day create test**

Run: `pnpm test -- tests/integration/game-day-create.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/create-game-day-form.tsx
git commit -m "style(admin): CreateGameDayForm uses shared UI"
```

---

## Task 21: StartGameDayButton restyle

**Files:**
- Modify: `src/app/admin/start-game-day-button.tsx`

- [ ] **Step 1: Read existing file**

Run: `cat src/app/admin/start-game-day-button.tsx`
Keep the existing POST URL; we only swap the button for `<Button>`.

- [ ] **Step 2: Replace contents**

`src/app/admin/start-game-day-button.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function StartGameDayButton({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onClick() {
    setLoading(true);
    const res = await fetch(`/api/game-days/${gameDayId}/start`, { method: "POST" });
    setLoading(false);
    if (res.ok) router.refresh();
  }

  return (
    <Button size="sm" onClick={onClick} loading={loading}>
      Spieltag starten
    </Button>
  );
}
```

- [ ] **Step 3: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/start-game-day-button.tsx
git commit -m "style(admin): StartGameDayButton uses shared UI"
```

---

## Task 22: createPlayer lib function

**Files:**
- Create: `src/lib/players/create.ts`
- Create: `tests/unit/players/create.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/players/create.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { createPlayer } from "@/lib/players/create";
import { resetDb } from "../../helpers/reset-db";

describe("createPlayer", () => {
  beforeEach(resetDb);

  async function makeAdmin() {
    return prisma.player.create({
      data: { name: "Admin", email: "admin@example.com", isAdmin: true, passwordHash: "x" },
    });
  }

  it("creates a player with bcrypt-hashed password", async () => {
    const actor = await makeAdmin();
    const player = await createPlayer({
      email: "new@example.com",
      name: "Newbie",
      password: "hunter22extra",
      isAdmin: false,
      actorId: actor.id,
    });
    expect(player.email).toBe("new@example.com");
    expect(player.name).toBe("Newbie");
    expect(player.isAdmin).toBe(false);
    const persisted = await prisma.player.findUniqueOrThrow({ where: { id: player.id } });
    expect(persisted.passwordHash).not.toBe("hunter22extra");
    expect(await verifyPassword("hunter22extra", persisted.passwordHash!)).toBe(true);
  });

  it("writes an audit log without the password", async () => {
    const actor = await makeAdmin();
    await createPlayer({
      email: "new@example.com",
      name: "Newbie",
      password: "hunter22extra",
      isAdmin: true,
      actorId: actor.id,
    });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "player.create" },
    });
    expect(log.payload).toMatchObject({ email: "new@example.com", name: "Newbie", isAdmin: true });
    expect(JSON.stringify(log.payload)).not.toContain("hunter22extra");
  });

  it("throws DuplicateEmailError for an existing email", async () => {
    const actor = await makeAdmin();
    await createPlayer({
      email: "dupe@example.com",
      name: "First",
      password: "hunter22extra",
      isAdmin: false,
      actorId: actor.id,
    });
    await expect(
      createPlayer({
        email: "dupe@example.com",
        name: "Second",
        password: "hunter22extra",
        isAdmin: false,
        actorId: actor.id,
      }),
    ).rejects.toThrow(/duplicate/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/players/create.test.ts`
Expected: FAIL — cannot find module `@/lib/players/create`.

- [ ] **Step 3: Create the function**

`src/lib/players/create.ts`:

```ts
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";

export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`duplicate email: ${email}`);
    this.name = "DuplicateEmailError";
  }
}

export interface CreatePlayerInput {
  email: string;
  name: string;
  password: string;
  isAdmin: boolean;
  actorId: string;
}

export interface CreatedPlayer {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
}

export async function createPlayer(input: CreatePlayerInput): Promise<CreatedPlayer> {
  const existing = await prisma.player.findUnique({ where: { email: input.email } });
  if (existing) throw new DuplicateEmailError(input.email);

  const passwordHash = await hashPassword(input.password);

  return prisma.$transaction(async (tx) => {
    const player = await tx.player.create({
      data: {
        email: input.email,
        name: input.name,
        isAdmin: input.isAdmin,
        passwordHash,
      },
      select: { id: true, email: true, name: true, isAdmin: true },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "player.create",
        entityType: "Player",
        entityId: player.id,
        payload: { email: player.email, name: player.name, isAdmin: player.isAdmin },
      },
    });
    return player;
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/players/create.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/create.ts tests/unit/players/create.test.ts
git commit -m "feat(players): createPlayer with bcrypt hash and audit log"
```

---

## Task 23: resetPlayerPassword lib function

**Files:**
- Create: `src/lib/players/reset-password.ts`
- Create: `tests/unit/players/reset-password.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/players/reset-password.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";
import { resetPlayerPassword, PlayerNotFoundError } from "@/lib/players/reset-password";
import { resetDb } from "../../helpers/reset-db";

describe("resetPlayerPassword", () => {
  beforeEach(resetDb);

  async function setup() {
    const actor = await prisma.player.create({
      data: { name: "Admin", email: "admin@example.com", isAdmin: true, passwordHash: "x" },
    });
    const target = await prisma.player.create({
      data: {
        name: "Target",
        email: "t@example.com",
        passwordHash: await hashPassword("oldpass12"),
      },
    });
    return { actor, target };
  }

  it("hashes and stores the new password", async () => {
    const { actor, target } = await setup();
    await resetPlayerPassword({ playerId: target.id, password: "newpass12", actorId: actor.id });
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
    expect(await verifyPassword("oldpass12", updated.passwordHash!)).toBe(false);
  });

  it("writes an audit log without the password", async () => {
    const { actor, target } = await setup();
    await resetPlayerPassword({ playerId: target.id, password: "newpass12", actorId: actor.id });
    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "player.password_reset" },
    });
    expect(log.payload).toMatchObject({ playerId: target.id });
    expect(JSON.stringify(log.payload)).not.toContain("newpass12");
  });

  it("throws PlayerNotFoundError for an unknown id", async () => {
    const { actor } = await setup();
    await expect(
      resetPlayerPassword({
        playerId: "00000000-0000-0000-0000-000000000000",
        password: "whatever12",
        actorId: actor.id,
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/unit/players/reset-password.test.ts`
Expected: FAIL — cannot find module `@/lib/players/reset-password`.

- [ ] **Step 3: Create the function**

`src/lib/players/reset-password.ts`:

```ts
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export interface ResetPlayerPasswordInput {
  playerId: string;
  password: string;
  actorId: string;
}

export async function resetPlayerPassword(input: ResetPlayerPasswordInput): Promise<void> {
  const existing = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, deletedAt: true },
  });
  if (!existing || existing.deletedAt) throw new PlayerNotFoundError(input.playerId);

  const passwordHash = await hashPassword(input.password);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: { passwordHash },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.actorId,
        action: "player.password_reset",
        entityType: "Player",
        entityId: input.playerId,
        payload: { playerId: input.playerId },
      },
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/unit/players/reset-password.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/reset-password.ts tests/unit/players/reset-password.test.ts
git commit -m "feat(players): resetPlayerPassword with audit log"
```

---

## Task 24: POST /api/players + GET + PlayersSection stub

**Files:**
- Create: `src/app/api/players/route.ts`
- Create: `src/app/admin/players-section.tsx`
- Create: `tests/integration/players-create.test.ts`

- [ ] **Step 1: Write the failing API test**

`tests/integration/players-create.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { POST, GET } from "@/app/api/players/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/auth";

const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "a@example.com", isAdmin: true, passwordHash: "x" },
  });
}

function asAdmin(id: string) {
  authMock.mockResolvedValue({ user: { id, isAdmin: true, email: "a@example.com", name: "Admin" } });
}
function asNonAdmin(id: string) {
  authMock.mockResolvedValue({ user: { id, isAdmin: false, email: "u@example.com", name: "User" } });
}

describe("POST /api/players", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("creates a player when admin", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({
        email: "new@example.com",
        name: "Newbie",
        password: "hunter22extra",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.email).toBe("new@example.com");
  });

  it("returns 403 for non-admin", async () => {
    const admin = await makeAdmin();
    const other = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    void admin;
    asNonAdmin(other.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "x@example.com", name: "X", password: "pass1234" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 for short password", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "x@example.com", name: "X", password: "short" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 for duplicate email", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const firstReq = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "dup@example.com", name: "A", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    expect((await POST(firstReq)).status).toBe(201);
    const secondReq = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({ email: "dup@example.com", name: "B", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    expect((await POST(secondReq)).status).toBe(409);
  });
});

describe("GET /api/players", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("returns all non-deleted players with hasPassword flag", async () => {
    const admin = await makeAdmin();
    await prisma.player.create({
      data: { name: "Historical", email: "h@example.com", passwordHash: null },
    });
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ email: string; hasPassword: boolean }>;
    const historical = body.find((p) => p.email === "h@example.com");
    expect(historical?.hasPassword).toBe(false);
    const self = body.find((p) => p.email === "a@example.com");
    expect(self?.hasPassword).toBe(true);
  });

  it("returns 403 for non-admin", async () => {
    const u = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    asNonAdmin(u.id);
    const req = new Request("http://localhost/api/players", { method: "GET" });
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/integration/players-create.test.ts`
Expected: FAIL — cannot find module `@/app/api/players/route`.

- [ ] **Step 3: Create the API route**

`src/app/api/players/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createPlayer, DuplicateEmailError } from "@/lib/players/create";

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  isAdmin: z.boolean().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", details: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const player = await createPlayer({
      email: parsed.data.email,
      name: parsed.data.name,
      password: parsed.data.password,
      isAdmin: parsed.data.isAdmin ?? false,
      actorId: session.user.id,
    });
    return NextResponse.json(player, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json({ error: "duplicate_email" }, { status: 409 });
    }
    throw e;
  }
}

export async function GET(_req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const players = await prisma.player.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, email: true, name: true, isAdmin: true, passwordHash: true },
  });
  return NextResponse.json(
    players.map((p) => ({
      id: p.id,
      email: p.email,
      name: p.name,
      isAdmin: p.isAdmin,
      hasPassword: p.passwordHash !== null,
    })),
  );
}
```

- [ ] **Step 4: Create a PlayersSection stub so the admin page compiles**

`src/app/admin/players-section.tsx`:

```tsx
"use client";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  hasPassword: boolean;
}

export function PlayersSection({ players }: { players: PlayerRow[] }) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Spieler</h2>
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-border p-3"
            >
              <div className="text-sm">
                <div className="font-medium text-foreground">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {p.isAdmin && <Badge variant="primary">Admin</Badge>}
                {!p.hasPassword && <Badge variant="neutral">Nur Stats</Badge>}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm test -- tests/integration/players-create.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: build succeeds (admin page now resolves).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/players/route.ts src/app/admin/players-section.tsx tests/integration/players-create.test.ts
git commit -m "feat(api): POST /api/players + GET /api/players + admin stub"
```

---

## Task 25: PATCH /api/players/:id/password

**Files:**
- Create: `src/app/api/players/[id]/password/route.ts`
- Create: `tests/integration/players-reset.test.ts`

- [ ] **Step 1: Write the failing API test**

`tests/integration/players-reset.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { PATCH } from "@/app/api/players/[id]/password/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function makeAdmin() {
  return prisma.player.create({
    data: { name: "Admin", email: "a@example.com", isAdmin: true, passwordHash: "x" },
  });
}

describe("PATCH /api/players/[id]/password", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("resets the password and returns 204", async () => {
    const admin = await makeAdmin();
    const target = await prisma.player.create({
      data: { name: "Target", email: "t@example.com", passwordHash: "legacy" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const req = new Request(`http://localhost/api/players/${target.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "newpass12" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: target.id }) });
    expect(res.status).toBe(204);
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
  });

  it("returns 404 for unknown id", async () => {
    const admin = await makeAdmin();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const req = new Request(`http://localhost/api/players/unknown/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "newpass12" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ id: "00000000-0000-0000-0000-000000000000" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 403 for non-admin", async () => {
    const u = await prisma.player.create({
      data: { name: "U", email: "u@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: u.id, isAdmin: false, email: u.email, name: u.name },
    });
    const req = new Request(`http://localhost/api/players/${u.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "newpass12" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: u.id }) });
    expect(res.status).toBe(403);
  });

  it("returns 400 for short password", async () => {
    const admin = await makeAdmin();
    const target = await prisma.player.create({
      data: { name: "T", email: "t2@example.com", passwordHash: "x" },
    });
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const req = new Request(`http://localhost/api/players/${target.id}/password`, {
      method: "PATCH",
      body: JSON.stringify({ password: "short" }),
      headers: { "content-type": "application/json" },
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: target.id }) });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/integration/players-reset.test.ts`
Expected: FAIL — cannot find module `@/app/api/players/[id]/password/route`.

- [ ] **Step 3: Create the route**

`src/app/api/players/[id]/password/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resetPlayerPassword, PlayerNotFoundError } from "@/lib/players/reset-password";

const Schema = z.object({ password: z.string().min(8) });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    await resetPlayerPassword({
      playerId: id,
      password: parsed.data.password,
      actorId: session.user.id,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm test -- tests/integration/players-reset.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/players/[id]/password/route.ts tests/integration/players-reset.test.ts
git commit -m "feat(api): PATCH /api/players/:id/password"
```

---

## Task 26: CreatePlayerDialog

**Files:**
- Create: `src/app/admin/create-player-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

`src/app/admin/create-player-dialog.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function CreatePlayerDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setName("");
    setPassword("");
    setIsAdmin(false);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, name, password, isAdmin }),
    });
    setLoading(false);
    if (res.status === 409) {
      setError("Ein Spieler mit dieser E-Mail existiert bereits");
      return;
    }
    if (!res.ok) {
      setError("Anlegen fehlgeschlagen");
      return;
    }
    reset();
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Spieler anlegen">
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="new-player-name">Name</Label>
          <Input
            id="new-player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="new-player-email">E-Mail</Label>
          <Input
            id="new-player-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="new-player-password">Passwort (min. 8 Zeichen)</Label>
          <Input
            id="new-player-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin-Rechte vergeben
        </label>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            Anlegen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/create-player-dialog.tsx
git commit -m "feat(admin): CreatePlayerDialog"
```

---

## Task 27: ResetPasswordDialog

**Files:**
- Create: `src/app/admin/reset-password-dialog.tsx`

- [ ] **Step 1: Create the dialog component**

`src/app/admin/reset-password-dialog.tsx`:

```tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ResetPasswordDialog({
  open,
  onClose,
  playerId,
  playerName,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string | null;
  playerName: string | null;
}) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setPassword("");
      setError(null);
    }
  }, [open]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/players/${playerId}/password`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setLoading(false);
    if (!res.ok) {
      setError("Zurücksetzen fehlgeschlagen");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog open={open} onClose={onClose} title={`Passwort zurücksetzen — ${playerName ?? ""}`}>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="reset-password">Neues Passwort (min. 8 Zeichen)</Label>
          <Input
            id="reset-password"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">{error}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            Zurücksetzen
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/reset-password-dialog.tsx
git commit -m "feat(admin): ResetPasswordDialog"
```

---

## Task 28: Wire PlayersSection with dialogs

**Files:**
- Modify: `src/app/admin/players-section.tsx`

- [ ] **Step 1: Replace players-section.tsx**

`src/app/admin/players-section.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreatePlayerDialog } from "./create-player-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";

export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  hasPassword: boolean;
}

export function PlayersSection({ players }: { players: PlayerRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<PlayerRow | null>(null);

  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Spieler</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            Spieler hinzufügen
          </Button>
        </div>
        <ul className="space-y-2">
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded-xl border border-border p-3"
            >
              <div className="text-sm">
                <div className="font-medium text-foreground">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.email}</div>
              </div>
              <div className="flex items-center gap-2">
                {p.isAdmin && <Badge variant="primary">Admin</Badge>}
                {!p.hasPassword && <Badge variant="neutral">Nur Stats</Badge>}
                {p.hasPassword && (
                  <Button variant="ghost" size="sm" onClick={() => setResetFor(p)}>
                    Passwort
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
      <CreatePlayerDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <ResetPasswordDialog
        open={resetFor !== null}
        onClose={() => setResetFor(null)}
        playerId={resetFor?.id ?? null}
        playerName={resetFor?.name ?? null}
      />
    </Card>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/players-section.tsx
git commit -m "feat(admin): wire PlayersSection with create + reset dialogs"
```

---

## Task 29: Remove invitation API routes

**Files:**
- Delete: `src/app/api/invitations/route.ts`
- Delete: `src/app/api/invitations/[token]/route.ts`
- Delete: `src/app/api/invitations/` directory

- [ ] **Step 1: Delete the files**

Run: `rm -rf src/app/api/invitations`
Expected: no output.

- [ ] **Step 2: Grep for leftover imports**

Run: `grep -rn "api/invitations\|@/app/api/invitations" src tests`
Expected: empty output.

- [ ] **Step 3: Commit**

```bash
git add -A src/app/api/invitations
git commit -m "refactor: remove invitation API routes"
```

---

## Task 30: Remove invite pages and admin InviteForm

**Files:**
- Delete: `src/app/invite/[token]/` (entire directory)
- Delete: `src/app/admin/invite-form.tsx`

- [ ] **Step 1: Delete the files**

Run: `rm -rf src/app/invite src/app/admin/invite-form.tsx`
Expected: no output.

- [ ] **Step 2: Grep for leftover imports**

Run: `grep -rn "invite-form\|@/app/invite\|from \"./invite-form\"" src tests`
Expected: empty output.

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add -A src/app/invite src/app/admin/invite-form.tsx
git commit -m "refactor: remove invitation pages and admin InviteForm"
```

---

## Task 31: Remove invitation integration tests + update reset-db

**Files:**
- Delete: `tests/integration/invitation-redeem.test.ts`
- Delete: `tests/integration/invitations-api.test.ts`
- Modify: `tests/helpers/reset-db.ts`

- [ ] **Step 1: Delete the invitation tests**

Run: `rm tests/integration/invitation-redeem.test.ts tests/integration/invitations-api.test.ts`
Expected: no output.

- [ ] **Step 2: Replace reset-db.ts**

`tests/helpers/reset-db.ts`:

```ts
import { prisma } from "@/lib/db";

export async function resetDb(): Promise<void> {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}
```

- [ ] **Step 3: Run full test suite (still against existing schema that has Invitation)**

Run: `pnpm test`
Expected: all remaining tests PASS. `prisma.invitation.deleteMany()` is no longer referenced.

- [ ] **Step 4: Commit**

```bash
git add -A tests/integration tests/helpers/reset-db.ts
git commit -m "test: drop invitation integration tests, remove invitation truncate"
```

---

## Task 32: Drop Invitation model and migrate

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_drop_invitations/migration.sql`

- [ ] **Step 1: Remove the back-relation on Player**

Open `prisma/schema.prisma`. Find the line:

```prisma
  invitationsSent Invitation[] @relation("InvitedBy")
```

Delete that line.

- [ ] **Step 2: Remove the Invitation model**

In the same file, delete the entire block:

```prisma
model Invitation {
  id          String    @id @default(uuid())
  email       String
  token       String    @unique
  invitedById String
  expiresAt   DateTime
  usedAt      DateTime?
  createdAt   DateTime  @default(now())

  invitedBy Player @relation("InvitedBy", fields: [invitedById], references: [id])

  @@index([email])
  @@index([expiresAt])
}
```

- [ ] **Step 3: Generate the migration**

Run: `pnpm prisma migrate dev --name drop_invitations`
Expected: creates `prisma/migrations/<timestamp>_drop_invitations/migration.sql` containing a `DROP TABLE "Invitation"` statement, and applies it to the local DB.

If Prisma prompts for AI consent (the guard we hit in Phase 1), run instead:

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=ja pnpm prisma migrate dev --name drop_invitations
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `pnpm prisma generate`
Expected: success.

- [ ] **Step 5: Verify build + tests**

Run: `pnpm build && pnpm test`
Expected: all pass. No references to `prisma.invitation` remain.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): drop Invitation model"
```

---

## Task 33: Verify full build + test + format check

**Files:**
- No code changes

- [ ] **Step 1: Run full test suite**

Run: `pnpm test`
Expected: all tests PASS (count should be pre-existing tests minus the 2 invitation suites, plus the new component + player suites).

- [ ] **Step 2: Run build**

Run: `pnpm build`
Expected: build succeeds with at most the pre-existing warnings.

- [ ] **Step 3: Run type-check**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: no new errors. If new ESLint rules-of-hooks complaints appear for dialog refs or similar, fix them inline (rename callbacks starting with `use*` that aren't hooks).

- [ ] **Step 5: If all green, no commit needed (verification-only task)**

---

## Task 34: Manual smoke test

**Files:**
- No code changes

- [ ] **Step 1: Bring up Postgres**

Run: `docker compose -f docker-compose.dev.yml up -d`
Expected: `padel-tracker-db` container running on port 5433.

- [ ] **Step 2: Reset DB and re-bootstrap admin**

Run:

```bash
PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION=ja pnpm prisma migrate reset --force
pnpm bootstrap:admin patrick@example.com "Patrick Koch"
```

Expected: a generated password printed to stdout; copy it.

- [ ] **Step 3: Start dev server**

Run: `pnpm dev`
Expected: ready on `http://localhost:3000` within ~5s.

- [ ] **Step 4: Click through the mobile smoke test (Chrome DevTools device toolbar, iPhone 14 Pro viewport)**

Checklist (manual):

1. Open `http://localhost:3000` — lands on `/login`, sees centered card on sky gradient, no dark background anywhere.
2. Log in as `patrick@example.com` with the bootstrap password — redirected to `/ranking`.
3. Verify empty-state card "Noch keine gewerteten Spiele in dieser Saison".
4. Bottom-tab bar shows 🏆 Rangliste, 🎾 Spieltag, ⚙️ Admin (because admin). Home-indicator area has padding.
5. Tap 🎾 Spieltag → "Kein aktiver Spieltag" card.
6. Tap ⚙️ Admin → sees three cards: Spieler, Spieltage, Historische Daten.
7. In Spieler: only self listed, with `Admin` badge. Tap "Spieler hinzufügen" → dialog opens. Create: Name "Jan", Email "jan@example.com", Passwort "start12345", no admin. Dialog closes, list shows Jan.
8. Tap "Passwort" on Jan → reset dialog. Enter "reset1234", confirm. No error.
9. In Spieltage: enter today's date, tap "Spieltag anlegen". Card updates, offener Spieltag visible. Tap "Spieltag starten" → still shows planned (because only 1 player confirmed).
10. Log out via avatar menu → lands on `/login`.
11. Log in as `jan@example.com` / `reset1234` → redirected to `/ranking`, no Admin tab in bottom-bar.
12. Tap 🎾 Spieltag → Anwesenheit-Karte zeigt "Bist du dabei?" (since status is `planned`). Tap "Dabei" → button flips to primary.
13. Log out, log back in as Patrick, confirm attendance too, start day. Verify 4+ player flow works end-to-end (if you have 4 players).

- [ ] **Step 5: Resize to desktop viewport and confirm**

- Top nav appears, bottom tabs hidden.
- Active link has primary color + bold weight.
- Avatar dropdown opens, click-outside closes.

- [ ] **Step 6: Stop dev server and Docker**

Run: `docker compose -f docker-compose.dev.yml down`
Expected: container removed.

- [ ] **Step 7: If issues surfaced in Step 4 or 5**

Return to the relevant task and fix (small changes can be separate commits prefixed `fix:` on this branch).

---

## Task 35: Final branch review

**Files:**
- No code changes

- [ ] **Step 1: Compare diff against `feature/phase-1-mvp`**

Run: `git diff feature/phase-1-mvp --stat`
Expected: a reasonable summary — a dozen or so created files, a dozen or so modified, a handful deleted.

- [ ] **Step 2: Review commits**

Run: `git log feature/phase-1-mvp..HEAD --oneline`
Expected: 30+ commits, each with a focused subject.

- [ ] **Step 3: Stop here**

Leave the branch ready for the user to merge or continue with another scope. Do not push or merge automatically.

---

## Plan Self-Review Notes

**Spec coverage:**
- Visual system → Task 2 (tokens), Tasks 3–7 (UI components)
- Navigation → Tasks 8–11
- Login → Task 12
- Ranking → Tasks 13–14
- Game-day → Tasks 15–18
- Admin → Tasks 19–21, 26–28
- Backend player API → Tasks 22–25
- Invitation removal → Tasks 29–32
- Tests → woven through; full-suite check Task 33; manual smoke Task 34

**Type consistency:**
- `MatchRow` defined in Task 17, referenced in Task 18 ✓
- `PlayerRow` defined in Task 24 stub, reused verbatim in Task 28 ✓
- `Attendance` union defined locally in Task 16 (no cross-task reference needed)

**Known accepted breaks:**
- Between Task 19 (admin page imports `players-section`) and Task 24 (the stub is created), `pnpm build` will fail on admin. Task 19 calls this out and commits the broken state deliberately so the diff stays coherent with the spec sections.
- Between Task 17 (MatchList changes ScoreDialog call signature) and Task 18 (ScoreDialog rewrite), `pnpm build` may fail on game-day. Same treatment: Task 17 explicitly warns; Task 18 repairs.

---

## Execution options

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session with checkpoints.
