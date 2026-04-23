# Self-Service Password Change Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any logged-in player change their own password from a new `/profil` page, with current-password verification and audit logging.

**Architecture:** Mirrors the admin reset flow but gates on a second bcrypt compare against the stored hash. New service `changeOwnPassword` in `src/lib/players/change-password.ts`; new API route `POST /api/profile/password`; new server page `/profil` with a client form component; new "Profil" item in the existing `UserMenu` dropdown.

**Tech Stack:** Next.js 15 App Router, NextAuth credentials, Prisma, bcryptjs (existing `hashPassword`/`verifyPassword`), Zod, Vitest integration tests hitting a real DB via `resetDb`.

---

## File Structure

- `src/lib/players/change-password.ts` — new service
- `tests/integration/players-change-password.test.ts` — new integration tests (service + API layer)
- `src/app/api/profile/password/route.ts` — new POST endpoint
- `src/app/profil/page.tsx` — new server component
- `src/app/profil/change-password-form.tsx` — new client component
- `src/components/user-menu.tsx` — add "Profil" link above "Abmelden"

---

### Task 1: Service + integration tests

**Files:**
- Create: `src/lib/players/change-password.ts`
- Create: `tests/integration/players-change-password.test.ts`

**Context:** The service verifies the supplied current password against the stored hash, throws a typed error on mismatch, otherwise updates the hash and writes an audit log entry.

- [ ] **Step 1: Write failing integration tests**

Create `tests/integration/players-change-password.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  changeOwnPassword,
  WrongCurrentPasswordError,
  PlayerNotFoundError,
} from "@/lib/players/change-password";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

async function makePlayer(name: string, password: string) {
  const passwordHash = await hashPassword(password);
  return prisma.player.create({
    data: { name, email: `${name.toLowerCase()}@x`, passwordHash },
  });
}

describe("changeOwnPassword", () => {
  beforeEach(resetDb);

  it("updates the passwordHash when the current password matches", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await changeOwnPassword({
      playerId: me.id,
      currentPassword: "oldpass12",
      newPassword: "newpass12",
    });
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
    expect(await verifyPassword("oldpass12", updated.passwordHash!)).toBe(false);
  });

  it("throws WrongCurrentPasswordError when the current password is wrong", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await expect(
      changeOwnPassword({
        playerId: me.id,
        currentPassword: "WRONG",
        newPassword: "newpass12",
      }),
    ).rejects.toBeInstanceOf(WrongCurrentPasswordError);
    // Hash is unchanged.
    const stored = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("oldpass12", stored.passwordHash!)).toBe(true);
  });

  it("throws PlayerNotFoundError when the player is soft-deleted", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    await expect(
      changeOwnPassword({
        playerId: me.id,
        currentPassword: "oldpass12",
        newPassword: "newpass12",
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError when the player has no password set", async () => {
    const me = await prisma.player.create({
      data: { name: "NoPass", email: "nopass@x", passwordHash: null },
    });
    await expect(
      changeOwnPassword({
        playerId: me.id,
        currentPassword: "anything",
        newPassword: "newpass12",
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("writes a player.password_change audit log entry on success", async () => {
    const me = await makePlayer("Me", "oldpass12");
    await changeOwnPassword({
      playerId: me.id,
      currentPassword: "oldpass12",
      newPassword: "newpass12",
    });
    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.password_change" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(me.id);
    expect(logs[0].entityType).toBe("Player");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```
pnpm vitest run tests/integration/players-change-password.test.ts
```
Expected: FAIL (service module missing).

- [ ] **Step 3: Implement the service**

Create `src/lib/players/change-password.ts`:

```ts
import { prisma } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export class WrongCurrentPasswordError extends Error {
  constructor() {
    super("wrong current password");
    this.name = "WrongCurrentPasswordError";
  }
}

export interface ChangeOwnPasswordInput {
  playerId: string;
  currentPassword: string;
  newPassword: string;
}

export async function changeOwnPassword(input: ChangeOwnPasswordInput): Promise<void> {
  const existing = await prisma.player.findUnique({
    where: { id: input.playerId },
    select: { id: true, deletedAt: true, passwordHash: true },
  });
  if (!existing || existing.deletedAt || !existing.passwordHash) {
    throw new PlayerNotFoundError(input.playerId);
  }

  const ok = await verifyPassword(input.currentPassword, existing.passwordHash);
  if (!ok) throw new WrongCurrentPasswordError();

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: { passwordHash },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.playerId,
        action: "player.password_change",
        entityType: "Player",
        entityId: input.playerId,
        payload: { playerId: input.playerId },
      },
    });
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```
pnpm vitest run tests/integration/players-change-password.test.ts
```
Expected: 5/5 green.

- [ ] **Step 5: Typecheck**

```
pnpm tsc --noEmit
```
Expected: clean.

- [ ] **Step 6: Commit**

```
git add src/lib/players/change-password.ts tests/integration/players-change-password.test.ts
git commit -m "feat(players): add changeOwnPassword service"
```

---

### Task 2: API route

**Files:**
- Create: `src/app/api/profile/password/route.ts`
- Modify: `tests/integration/players-change-password.test.ts` (add API-layer cases)

**Context:** Only the authenticated user can change their own password — no `playerId` in the URL, the server reads it from the session.

- [ ] **Step 1: Write failing API tests**

Append to `tests/integration/players-change-password.test.ts` inside the same `describe`:

```ts
import { POST } from "@/app/api/profile/password/route";
import { auth } from "@/auth";
import { vi } from "vitest";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

function jsonRequest(body: unknown): Request {
  return new Request("http://test/api/profile/password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/profile/password", () => {
  beforeEach(resetDb);

  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(jsonRequest({ currentPassword: "x", newPassword: "newpass12" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on schema violation", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(jsonRequest({ currentPassword: "oldpass12", newPassword: "short" }));
    expect(res.status).toBe(400);
  });

  it("returns 401 when current password is wrong", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(jsonRequest({ currentPassword: "WRONG", newPassword: "newpass12" }));
    expect(res.status).toBe(401);
  });

  it("returns 204 on success and updates the hash", async () => {
    const me = await makePlayer("Me", "oldpass12");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(jsonRequest({ currentPassword: "oldpass12", newPassword: "newpass12" }));
    expect(res.status).toBe(204);
    const updated = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(await verifyPassword("newpass12", updated.passwordHash!)).toBe(true);
  });
});
```

IMPORTANT: the second `describe` block requires the `vi.mock` call at *module scope* (hoisted), not inside the block. Move the `import { POST } ...`, `vi.mock(...)`, and the `authMock` + `jsonRequest` helpers to the top of the file if the implementer prefers a single top-level setup. Either way works — Vitest hoists `vi.mock`. Put all imports at the top.

- [ ] **Step 2: Run to verify failure**

```
pnpm vitest run tests/integration/players-change-password.test.ts
```
Expected: FAIL on the API tests (module missing).

- [ ] **Step 3: Implement the route**

Create `src/app/api/profile/password/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  changeOwnPassword,
  PlayerNotFoundError,
  WrongCurrentPasswordError,
} from "@/lib/players/change-password";

const Schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  try {
    await changeOwnPassword({
      playerId: session.user.id,
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    if (e instanceof WrongCurrentPasswordError) {
      return NextResponse.json({ error: "wrong_password" }, { status: 401 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run tests → 9/9 green**

```
pnpm vitest run tests/integration/players-change-password.test.ts
```

- [ ] **Step 5: Typecheck + full suite**

```
pnpm tsc --noEmit
pnpm vitest run
```
Expected: all green.

- [ ] **Step 6: Commit**

```
git add src/app/api/profile/password/route.ts tests/integration/players-change-password.test.ts
git commit -m "feat(profile): add POST /api/profile/password endpoint"
```

---

### Task 3: /profil page + form + UserMenu link

**Files:**
- Create: `src/app/profil/page.tsx`
- Create: `src/app/profil/change-password-form.tsx`
- Modify: `src/components/user-menu.tsx`

**Context:** A minimal profile page showing the name/email, plus a password-change form. The form uses client-side `fetch` like the admin reset dialog, handles 401 (wrong password) and 400 (validation) with readable German messages, redirects to `/` (or shows success) after a successful change.

- [ ] **Step 1: Create the server page**

Create `src/app/profil/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Profil
        </p>
        <h1 className="text-2xl font-bold text-foreground">{session.user.name}</h1>
        <p className="mt-0.5 text-sm text-foreground-muted">{session.user.email}</p>
      </header>

      <Card>
        <CardBody className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">Passwort ändern</h2>
          <ChangePasswordForm />
        </CardBody>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create the client form**

Create `src/app/profil/change-password-form.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setStatus({ kind: "error", message: "Die neuen Passwörter stimmen nicht überein." });
      return;
    }
    setStatus({ kind: "submitting" });
    const res = await fetch("/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    if (res.status === 204) {
      setStatus({ kind: "success" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      return;
    }
    if (res.status === 401) {
      setStatus({ kind: "error", message: "Aktuelles Passwort ist falsch." });
      return;
    }
    if (res.status === 400) {
      setStatus({ kind: "error", message: "Neues Passwort muss mindestens 8 Zeichen haben." });
      return;
    }
    setStatus({ kind: "error", message: "Unerwarteter Fehler. Bitte erneut versuchen." });
  }

  const submitting = status.kind === "submitting";

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor="current-password">Aktuelles Passwort</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="new-password">Neues Passwort (min. 8 Zeichen)</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          required
        />
      </div>
      <div>
        <Label htmlFor="confirm-password">Neues Passwort bestätigen</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
        />
      </div>
      {status.kind === "error" && (
        <p
          role="alert"
          className="rounded-xl bg-destructive-soft/40 px-3 py-2 text-sm text-destructive"
        >
          {status.message}
        </p>
      )}
      {status.kind === "success" && (
        <p
          role="status"
          className="rounded-xl bg-success-soft/40 px-3 py-2 text-sm text-success"
        >
          Passwort erfolgreich geändert.
        </p>
      )}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          Speichern
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Add "Profil" entry to UserMenu**

Edit `src/components/user-menu.tsx`. Add a Next.js `Link` import and insert a menu item above the "Abmelden" button:

```tsx
"use client";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
```

Then inside the `<div role="menu" ...>`, insert this BEFORE the existing "Abmelden" button:

```tsx
          <Link
            role="menuitem"
            href="/profil"
            onClick={() => setOpen(false)}
            className="block w-full px-4 py-2 text-left text-sm text-foreground hover:bg-surface-muted"
          >
            Profil
          </Link>
```

- [ ] **Step 4: Typecheck + full suite**

```
pnpm tsc --noEmit
pnpm vitest run
```
Expected: all green, no new failures.

- [ ] **Step 5: Commit**

```
git add src/app/profil/page.tsx src/app/profil/change-password-form.tsx src/components/user-menu.tsx
git commit -m "feat(profile): add /profil page with password-change form"
```

---

## Final Verification Gate

Parallel fan-out on full branch diff:
- `reviewer` — auth/session correctness, error handling, no leaking of sensitive strings
- `test-engineer` — coverage gaps (especially around the client form behaviors that aren't unit-tested)
- `refactor-cleanup` — duplication vs. admin's reset flow
- `commit-guard` — staged-state hygiene

Fix critical/important findings, then open PR B.
