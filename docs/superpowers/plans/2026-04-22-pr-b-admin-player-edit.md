# PR-B — Admin Player Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins fully edit a player record (username, name, email, admin flag) with audit-logged diffs, a last-admin guard, and per-field 409 conflicts.

**Architecture:** A new pure `updatePlayer` lib function in `src/lib/players/update.ts` owns the transactional update: load existing row, compute `changedFields`, enforce the last-admin invariant, write the update, and audit-log `{ before, after, changedFields }`. A `PATCH /api/players/[id]` route wraps the lib and maps typed errors to HTTP status codes. A new `EditPlayerDialog` client component drives it from the Admin page, triggered by a pencil icon next to the existing "Passwort" button. The create-dialog is unchanged.

**Tech Stack:** Next.js 15 App Router, Prisma 6 (Postgres), Zod 4, Vitest 4, NextAuth v5 (admin gate). Reuses `USERNAME_REGEX` / `normaliseUsername` from `src/lib/auth/username.ts`, and the `Prisma.P2002` → `meta.target` classification pattern from `src/lib/players/create.ts`.

**Spec reference:** `docs/superpowers/specs/2026-04-22-game-day-lifecycle-and-identity-design.md` — "PR-B — Admin Player Edit" section.

**Base branch:** `feature/admin-player-edit` (already created, cherry-picked spec + PR-A plan docs for context).

---

## File structure

### Created

- `src/lib/players/update.ts` — pure lib function `updatePlayer` + typed errors (`PlayerNotFoundError`, `DuplicateEmailError`, `DuplicateUsernameError`, `LastAdminError`, `NoFieldsError`).
- `src/app/api/players/[id]/route.ts` — `PATCH` handler. Admin gate, Zod parse, error→HTTP mapping.
- `src/app/admin/edit-player-dialog.tsx` — client component driving the PATCH.
- `tests/unit/players/update.test.ts` — unit tests for the lib (error classes, guard logic without full transaction).
- `tests/integration/players-update.test.ts` — integration tests exercising the route end-to-end against the test DB.

### Modified

- `src/app/admin/players-section.tsx` — `PlayerRow` gains `username: string | null`; pencil-icon trigger wired to `EditPlayerDialog`.
- `src/app/admin/page.tsx` — `select` includes `username`; `playersForUi` passes it through.
- *(No schema changes — the `username` column already exists from PR-A.)*

---

## Conventions reused from PR-A

- Error codes: `username_taken`, `email_taken`, `last_admin`, `not_found`, `no_fields`, `forbidden`, `invalid`. Consistent with the create route's `email_taken`/`username_taken`.
- P2002 branching: inspect `meta.target` array. `includes("username")` → `DuplicateUsernameError`. `includes("email")` → `DuplicateEmailError`. Anything else → rethrow (do **not** default-classify).
- Username validation in the API: `z.string().transform(normaliseUsername).refine(isValidUsername, ...)` so trimming+lowercasing happens once, server-side. The client dialog still pre-validates so the user sees the format hint before submit.
- Audit-log payload shape mirrors existing entries: action identifier + entity id + JSON payload. For updates: `{ before: {...}, after: {...}, changedFields: ["name","isAdmin"] }`.

---

## Task 1 — `updatePlayer` lib function

**Files:**
- Create: `src/lib/players/update.ts`
- Test: `tests/unit/players/update.test.ts`

The lib owns the full update contract. The route is a thin adapter. Tests assert behaviour directly against the DB (same pattern as `reset-password.test.ts`).

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/unit/players/update.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import {
  updatePlayer,
  PlayerNotFoundError,
  DuplicateEmailError,
  DuplicateUsernameError,
  LastAdminError,
  NoFieldsError,
} from "@/lib/players/update";
import { resetDb } from "../../helpers/reset-db";

async function makeAdmin(i = 1) {
  return prisma.player.create({
    data: {
      name: `Admin${i}`,
      email: `a${i}@x`,
      passwordHash: "x",
      isAdmin: true,
    },
  });
}
async function makeUser(i = 1) {
  return prisma.player.create({
    data: { name: `U${i}`, email: `u${i}@x`, passwordHash: "x" },
  });
}

describe("updatePlayer", () => {
  beforeEach(resetDb);

  it("updates only the provided fields and writes an audit log with before/after/changedFields", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();

    const updated = await updatePlayer({
      playerId: target.id,
      actorId: admin.id,
      fields: { name: "New Name", username: "newname" },
    });

    expect(updated.name).toBe("New Name");
    expect(updated.username).toBe("newname");
    expect(updated.email).toBe("u1@x"); // unchanged
    expect(updated.isAdmin).toBe(false);

    const entries = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.update" },
    });
    expect(entries).toHaveLength(1);
    const payload = entries[0].payload as {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
      changedFields: string[];
    };
    expect(payload.changedFields.sort()).toEqual(["name", "username"]);
    expect(payload.before.name).toBe("U1");
    expect(payload.before.username).toBeNull();
    expect(payload.after.name).toBe("New Name");
    expect(payload.after.username).toBe("newname");
  });

  it("throws NoFieldsError when fields is empty", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await expect(
      updatePlayer({ playerId: target.id, actorId: admin.id, fields: {} }),
    ).rejects.toBeInstanceOf(NoFieldsError);
  });

  it("throws PlayerNotFoundError for unknown id", async () => {
    const admin = await makeAdmin();
    await expect(
      updatePlayer({
        playerId: "00000000-0000-0000-0000-000000000000",
        actorId: admin.id,
        fields: { name: "X" },
      }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws PlayerNotFoundError for soft-deleted players", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    await prisma.player.update({
      where: { id: target.id },
      data: { deletedAt: new Date() },
    });
    await expect(
      updatePlayer({ playerId: target.id, actorId: admin.id, fields: { name: "X" } }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });

  it("throws DuplicateUsernameError on P2002 username collision", async () => {
    const admin = await makeAdmin();
    const a = await prisma.player.create({
      data: { name: "A", email: "aa@x", passwordHash: "x", username: "alice" },
    });
    const b = await makeUser(2);
    await expect(
      updatePlayer({ playerId: b.id, actorId: admin.id, fields: { username: "alice" } }),
    ).rejects.toBeInstanceOf(DuplicateUsernameError);
    // nothing was written
    const fresh = await prisma.player.findUniqueOrThrow({ where: { id: b.id } });
    expect(fresh.username).toBeNull();
    void a;
  });

  it("throws DuplicateEmailError on P2002 email collision", async () => {
    const admin = await makeAdmin();
    const a = await prisma.player.create({
      data: { name: "A", email: "taken@x", passwordHash: "x" },
    });
    const b = await makeUser(2);
    await expect(
      updatePlayer({ playerId: b.id, actorId: admin.id, fields: { email: "taken@x" } }),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    void a;
  });

  it("throws LastAdminError when demoting the only remaining admin", async () => {
    const onlyAdmin = await makeAdmin();
    // no other admins
    await expect(
      updatePlayer({
        playerId: onlyAdmin.id,
        actorId: onlyAdmin.id,
        fields: { isAdmin: false },
      }),
    ).rejects.toBeInstanceOf(LastAdminError);
  });

  it("allows demoting an admin when another admin exists", async () => {
    const a1 = await makeAdmin(1);
    const a2 = await makeAdmin(2);
    const updated = await updatePlayer({
      playerId: a2.id,
      actorId: a1.id,
      fields: { isAdmin: false },
    });
    expect(updated.isAdmin).toBe(false);
  });

  it("promotes a non-admin even when only one admin exists (no guard)", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    const updated = await updatePlayer({
      playerId: target.id,
      actorId: admin.id,
      fields: { isAdmin: true },
    });
    expect(updated.isAdmin).toBe(true);
  });

  it("omits unchanged fields from changedFields", async () => {
    const admin = await makeAdmin();
    const target = await prisma.player.create({
      data: { name: "Same", email: "same@x", passwordHash: "x", username: "same" },
    });
    await updatePlayer({
      playerId: target.id,
      actorId: admin.id,
      fields: { name: "Same", username: "different" },
    });
    const entry = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: target.id, action: "player.update" },
    });
    expect((entry.payload as { changedFields: string[] }).changedFields).toEqual([
      "username",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm vitest run tests/unit/players/update.test.ts`

Expected: FAIL with "Cannot find module '@/lib/players/update'".

- [ ] **Step 3: Implement `updatePlayer`**

```ts
// src/lib/players/update.ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}
export class DuplicateEmailError extends Error {
  constructor(email: string) {
    super(`duplicate email: ${email}`);
    this.name = "DuplicateEmailError";
  }
}
export class DuplicateUsernameError extends Error {
  constructor(username: string) {
    super(`duplicate username: ${username}`);
    this.name = "DuplicateUsernameError";
  }
}
export class LastAdminError extends Error {
  constructor() {
    super("cannot demote the last remaining admin");
    this.name = "LastAdminError";
  }
}
export class NoFieldsError extends Error {
  constructor() {
    super("no fields to update");
    this.name = "NoFieldsError";
  }
}

export interface UpdatablePlayerFields {
  username?: string | null;
  name?: string;
  email?: string;
  isAdmin?: boolean;
}

export interface UpdatePlayerInput {
  playerId: string;
  actorId: string;
  fields: UpdatablePlayerFields;
}

export interface UpdatedPlayer {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  username: string | null;
}

const TRACKED_FIELDS = ["username", "name", "email", "isAdmin"] as const;
type TrackedField = (typeof TRACKED_FIELDS)[number];

export async function updatePlayer(input: UpdatePlayerInput): Promise<UpdatedPlayer> {
  if (Object.keys(input.fields).length === 0) throw new NoFieldsError();

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.player.findUnique({
        where: { id: input.playerId },
        select: {
          id: true,
          email: true,
          name: true,
          isAdmin: true,
          username: true,
          deletedAt: true,
        },
      });
      if (!existing || existing.deletedAt) {
        throw new PlayerNotFoundError(input.playerId);
      }

      if (
        input.fields.isAdmin === false &&
        existing.isAdmin === true
      ) {
        const remaining = await tx.player.count({
          where: { isAdmin: true, deletedAt: null, id: { not: existing.id } },
        });
        if (remaining === 0) throw new LastAdminError();
      }

      const updated = await tx.player.update({
        where: { id: existing.id },
        data: input.fields,
        select: {
          id: true,
          email: true,
          name: true,
          isAdmin: true,
          username: true,
        },
      });

      const changedFields: TrackedField[] = [];
      const before: Record<TrackedField, unknown> = {
        username: existing.username,
        name: existing.name,
        email: existing.email,
        isAdmin: existing.isAdmin,
      };
      const after: Record<TrackedField, unknown> = {
        username: updated.username,
        name: updated.name,
        email: updated.email,
        isAdmin: updated.isAdmin,
      };
      for (const f of TRACKED_FIELDS) {
        if (before[f] !== after[f]) changedFields.push(f);
      }

      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "player.update",
          entityType: "Player",
          entityId: existing.id,
          payload: { before, after, changedFields },
        },
      });

      return updated;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("username")) {
        throw new DuplicateUsernameError(input.fields.username ?? "");
      }
      if (target.includes("email")) {
        throw new DuplicateEmailError(input.fields.email ?? "");
      }
      throw e;
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm vitest run tests/unit/players/update.test.ts`

Expected: PASS for all 9 cases.

- [ ] **Step 5: Commit**

```bash
git add src/lib/players/update.ts tests/unit/players/update.test.ts
git commit -m "$(cat <<'EOF'
feat(players): add updatePlayer lib with last-admin guard

Transactional update that computes before/after diff, enforces the
last-admin invariant when demoting, classifies P2002 by field, and
writes a player.update audit log. Pure function, no HTTP awareness.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `PATCH /api/players/[id]` route

**Files:**
- Create: `src/app/api/players/[id]/route.ts`
- Test: `tests/integration/players-update.test.ts`

Thin HTTP wrapper around `updatePlayer`. Zod parses the body (all fields optional, at-least-one-required, username trimmed+lowercased via transform+refine). All typed errors map to specific HTTP responses.

- [ ] **Step 1: Write the failing integration test**

```ts
// tests/integration/players-update.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { PATCH } from "@/app/api/players/[id]/route";
import { resetDb } from "../helpers/reset-db";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

async function makeAdmin(i = 1) {
  return prisma.player.create({
    data: {
      name: `Admin${i}`,
      email: `a${i}@x`,
      passwordHash: "x",
      isAdmin: true,
    },
  });
}
async function makeUser(i = 1) {
  return prisma.player.create({
    data: { name: `U${i}`, email: `u${i}@x`, passwordHash: "x" },
  });
}

function patchRequest(id: string, body: unknown) {
  return new Request(`http://localhost/api/players/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

async function call(id: string, body: unknown) {
  return PATCH(patchRequest(id, body), { params: Promise.resolve({ id }) });
}

describe("PATCH /api/players/[id]", () => {
  beforeEach(async () => {
    authMock.mockReset();
    await resetDb();
  });

  it("updates fields and returns the patched player", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { name: "Renamed", username: "renamed" });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { username: string; name: string };
    expect(body.name).toBe("Renamed");
    expect(body.username).toBe("renamed");
    const entries = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.update" },
    });
    expect(entries).toHaveLength(1);
  });

  it("normalises username to lowercase", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { username: "AliceSmith" });
    expect(res.status).toBe(200);
    const row = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(row.username).toBe("alicesmith");
  });

  it("returns 400 for an empty body", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, {});
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("no_fields");
  });

  it("returns 400 for an invalid username regex", async () => {
    const admin = await makeAdmin();
    const target = await makeUser();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { username: "AB" });
    expect(res.status).toBe(400);
  });

  it("returns 403 for non-admin", async () => {
    const u = await makeUser();
    authMock.mockResolvedValue({
      user: { id: u.id, isAdmin: false, email: u.email, name: u.name },
    });
    const res = await call(u.id, { name: "X" });
    expect(res.status).toBe(403);
  });

  it("returns 404 for unknown player", async () => {
    const admin = await makeAdmin();
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call("00000000-0000-0000-0000-000000000000", { name: "X" });
    expect(res.status).toBe(404);
  });

  it("returns 409 username_taken on collision", async () => {
    const admin = await makeAdmin();
    await prisma.player.create({
      data: { name: "Taken", email: "tt@x", passwordHash: "x", username: "alice" },
    });
    const target = await makeUser(2);
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { username: "alice" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("username_taken");
  });

  it("returns 409 email_taken on collision", async () => {
    const admin = await makeAdmin();
    await prisma.player.create({
      data: { name: "Taken", email: "taken@x", passwordHash: "x" },
    });
    const target = await makeUser(2);
    authMock.mockResolvedValue({
      user: { id: admin.id, isAdmin: true, email: admin.email, name: admin.name },
    });
    const res = await call(target.id, { email: "taken@x" });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("email_taken");
  });

  it("returns 409 last_admin when demoting the only admin", async () => {
    const onlyAdmin = await makeAdmin();
    authMock.mockResolvedValue({
      user: {
        id: onlyAdmin.id,
        isAdmin: true,
        email: onlyAdmin.email,
        name: onlyAdmin.name,
      },
    });
    const res = await call(onlyAdmin.id, { isAdmin: false });
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("last_admin");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/integration/players-update.test.ts`

Expected: FAIL with "Cannot find module '@/app/api/players/[id]/route'".

- [ ] **Step 3: Implement the route**

```ts
// src/app/api/players/[id]/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  updatePlayer,
  PlayerNotFoundError,
  DuplicateEmailError,
  DuplicateUsernameError,
  LastAdminError,
  NoFieldsError,
} from "@/lib/players/update";
import { normaliseUsername, isValidUsername } from "@/lib/auth/username";

const PatchSchema = z
  .object({
    username: z
      .string()
      .transform(normaliseUsername)
      .refine(isValidUsername, { message: "invalid username" })
      .optional(),
    name: z.string().min(1).max(64).optional(),
    email: z.string().email().optional(),
    isAdmin: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "no_fields" });

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
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const isEmpty =
      flat.formErrors.some((m) => m === "no_fields") ||
      (body !== null && typeof body === "object" && Object.keys(body as object).length === 0);
    return NextResponse.json(
      { error: isEmpty ? "no_fields" : "invalid", details: flat },
      { status: 400 },
    );
  }
  try {
    const updated = await updatePlayer({
      playerId: id,
      actorId: session.user.id,
      fields: parsed.data,
    });
    return NextResponse.json(updated, { status: 200 });
  } catch (e) {
    if (e instanceof NoFieldsError) {
      return NextResponse.json({ error: "no_fields" }, { status: 400 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    if (e instanceof DuplicateUsernameError) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
    }
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    if (e instanceof LastAdminError) {
      return NextResponse.json({ error: "last_admin" }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run tests/integration/players-update.test.ts`

Expected: PASS for all 9 cases.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/players/[id]/route.ts tests/integration/players-update.test.ts
git commit -m "$(cat <<'EOF'
feat(api): PATCH /api/players/[id] for admin edits

Thin wrapper around updatePlayer. Zod parses an all-optional body
with at-least-one-field required, transforms usernames, and maps
typed errors to 400/403/404/409 per the spec.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `EditPlayerDialog` component

**Files:**
- Create: `src/app/admin/edit-player-dialog.tsx`

Fields: Anzeigename, Benutzername (optional, nullable), E-Mail, Admin-Toggle. The dialog pre-populates from the player's current values, sends only diffed fields to the PATCH endpoint, and renders field-specific errors on 409. On success → `router.refresh()` and close.

- [ ] **Step 1: Implement the component**

```tsx
// src/app/admin/edit-player-dialog.tsx
"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isValidUsername, normaliseUsername } from "@/lib/auth/username";

export interface EditablePlayer {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
}

export function EditPlayerDialog({
  open,
  onClose,
  player,
}: {
  open: boolean;
  onClose: () => void;
  player: EditablePlayer | null;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && player) {
      setName(player.name);
      setEmail(player.email);
      setUsername(player.username ?? "");
      setIsAdmin(player.isAdmin);
      setError(null);
    }
  }, [open, player]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!player) return;
    setError(null);

    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const trimmedUsername = username.trim();
    const normalisedUsername = trimmedUsername ? normaliseUsername(trimmedUsername) : "";

    if (trimmedUsername && !isValidUsername(normalisedUsername)) {
      setError("Benutzername: 3–32 Zeichen, nur Kleinbuchstaben, Ziffern und Unterstriche");
      return;
    }

    const diff: Record<string, unknown> = {};
    if (trimmedName !== player.name) diff.name = trimmedName;
    if (trimmedEmail !== player.email) diff.email = trimmedEmail;
    if (normalisedUsername !== (player.username ?? "")) {
      diff.username = normalisedUsername || undefined;
    }
    if (isAdmin !== player.isAdmin) diff.isAdmin = isAdmin;

    if (Object.keys(diff).length === 0) {
      onClose();
      return;
    }

    setLoading(true);
    const res = await fetch(`/api/players/${player.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(diff),
    });
    setLoading(false);

    if (res.ok) {
      onClose();
      router.refresh();
      return;
    }
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    if (res.status === 409 && body.error === "username_taken") {
      setError("Dieser Benutzername ist bereits vergeben");
    } else if (res.status === 409 && body.error === "email_taken") {
      setError("Diese E-Mail ist bereits vergeben");
    } else if (res.status === 409 && body.error === "last_admin") {
      setError("Der letzte verbleibende Admin kann nicht degradiert werden");
    } else if (res.status === 400) {
      setError("Eingabe ungültig");
    } else if (res.status === 404) {
      setError("Spieler nicht gefunden");
    } else {
      setError("Speichern fehlgeschlagen");
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Spieler bearbeiten — ${player?.name ?? ""}`}
    >
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <Label htmlFor="edit-player-name">Anzeigename</Label>
          <Input
            id="edit-player-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="edit-player-email">E-Mail</Label>
          <Input
            id="edit-player-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <Label htmlFor="edit-player-username">Benutzername (optional)</Label>
          <Input
            id="edit-player-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="z. B. alice_42"
            autoComplete="off"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
          />
          Admin-Rechte
        </label>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button type="submit" loading={loading}>
            Speichern
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`

Expected: clean (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/edit-player-dialog.tsx
git commit -m "$(cat <<'EOF'
feat(admin): add EditPlayerDialog component

Pre-populated edit form that sends only diffed fields to PATCH
/api/players/[id] and renders 409 errors inline per field
(username_taken, email_taken, last_admin).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Wire pencil trigger into `PlayersSection`

**Files:**
- Modify: `src/app/admin/players-section.tsx`
- Modify: `src/app/admin/page.tsx`

`PlayerRow` gains `username`. The row renders a small pencil button next to the existing Passwort button, which opens `EditPlayerDialog`. `AdminPage` selects `username` from Prisma and threads it through `playersForUi`.

- [ ] **Step 1: Extend the server `select` and `playersForUi`**

Replace the `select` block in `src/app/admin/page.tsx` (lines 45–49):

```ts
  const players = await prisma.player.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      username: true,
      isAdmin: true,
      passwordHash: true,
    },
  });
```

Replace the `playersForUi` block (lines 61–67):

```ts
  const playersForUi = players.map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    username: p.username,
    isAdmin: p.isAdmin,
    hasPassword: p.passwordHash !== null,
  }));
```

- [ ] **Step 2: Update `PlayersSection`**

Replace the entire file `src/app/admin/players-section.tsx`:

```tsx
"use client";
import { useState } from "react";
import { Pencil } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreatePlayerDialog } from "./create-player-dialog";
import { ResetPasswordDialog } from "./reset-password-dialog";
import { EditPlayerDialog, type EditablePlayer } from "./edit-player-dialog";

export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
}

export function PlayersSection({ players }: { players: PlayerRow[] }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [resetFor, setResetFor] = useState<PlayerRow | null>(null);
  const [editFor, setEditFor] = useState<EditablePlayer | null>(null);

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
                <div className="text-xs text-muted-foreground">
                  {p.email}
                  {p.username && <span className="ml-2">· @{p.username}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {p.isAdmin && <Badge variant="primary">Admin</Badge>}
                {!p.hasPassword && <Badge variant="neutral">Nur Stats</Badge>}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Spieler ${p.name} bearbeiten`}
                  onClick={() =>
                    setEditFor({
                      id: p.id,
                      name: p.name,
                      email: p.email,
                      username: p.username,
                      isAdmin: p.isAdmin,
                    })
                  }
                >
                  <Pencil className="h-4 w-4" aria-hidden />
                </Button>
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
      <EditPlayerDialog
        open={editFor !== null}
        onClose={() => setEditFor(null)}
        player={editFor}
      />
    </Card>
  );
}
```

- [ ] **Step 3: Type-check, lint, full test run**

```bash
pnpm tsc --noEmit
pnpm lint
pnpm test
```

Expected:
- `tsc`: clean.
- `lint`: no new warnings.
- `test`: all previously-passing tests still pass plus the two new suites (unit `update`, integration `players-update`). The pre-existing `tests/components/button.test.tsx` failure is unrelated.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/app/admin/players-section.tsx
git commit -m "$(cat <<'EOF'
feat(admin): trigger edit dialog from player row

Admin page selects username; PlayersSection shows the handle next to
the email and opens EditPlayerDialog via a Bearbeiten button.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Regression + PR

**Files:** none (process step).

- [ ] **Step 1: Run the full quality gate**

```bash
pnpm tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Expected:
- `tsc`: clean.
- `lint`: only pre-existing `src/lib/db.ts` warning.
- `test`: 183 previously-passing + ~18 new assertions pass. The pre-existing `tests/components/button.test.tsx` failure is still unrelated and non-blocking.
- `build`: all routes (including the new `/api/players/[id]`) compile.

- [ ] **Step 2: Manual smoke test (document in PR body)**

- As admin, open `/admin`, click "Bearbeiten" on a player, change the username, save, verify the row updates and audit log entry exists.
- Try to demote yourself when no other admin exists → inline "letzte verbleibende Admin"-Fehler.
- Try to set a username already in use → inline "bereits vergeben"-Fehler.

- [ ] **Step 3: Run `commit-guard` before pushing**

If using subagent-driven execution, dispatch the `commit-guard` agent over the staged diff of the whole branch. Otherwise, review the combined diff manually.

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin feature/admin-player-edit
gh pr create --base main --head feature/admin-player-edit \
  --title "feat: admin can fully edit a player" \
  --body "$(cat <<'EOF'
## Summary

Admins can now edit a player's username, display name, email, and admin flag from the Admin page.

- New `updatePlayer` lib function in `src/lib/players/update.ts` owns the transaction, computes a `{ before, after, changedFields }` audit-log diff, and enforces the last-admin invariant.
- New `PATCH /api/players/[id]` route wraps it; errors map to 400 (`no_fields`, `invalid`), 403, 404, 409 (`username_taken`, `email_taken`, `last_admin`).
- New `EditPlayerDialog` triggered by a "Bearbeiten" button in each player row. Sends only diffed fields; renders per-field errors inline. The existing "Passwort zurücksetzen" flow is untouched.

## Scope

Second of three PRs from `docs/superpowers/specs/2026-04-22-game-day-lifecycle-and-identity-design.md`. PR-C (game-day lifecycle) follows after this merges.

## Test plan

- [x] `pnpm test` — new unit + integration suites pass
- [x] `pnpm tsc --noEmit` — clean
- [x] `pnpm lint` — only pre-existing `src/lib/db.ts` warning
- [x] `pnpm build` — new route compiled
- [x] Unit: 9 cases covering each error class and the happy path
- [x] Integration: 9 cases covering 200/400/403/404/409 paths and username lower-casing
- [ ] Manual: edit username, demote last admin (blocked), duplicate username (blocked)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Notes for the implementer

- The `auditLog` model does not have an FK to `Player`, so the update audit entries persist even if the player is soft-deleted later — no special handling needed.
- `Prisma.sql` fragments / raw queries are **not** used here. All writes go through the typed client.
- Keep the diff between the dialog's "Speichern" button and the backend small: if the user didn't change anything, just close the dialog without firing a request.
- The last-admin guard lives in the lib, not the route — this keeps the invariant enforced for any future caller (e.g. a future bulk-edit).
- Do not delete or rename the existing `create-player-dialog.tsx`; it still owns player creation and is unaffected.
