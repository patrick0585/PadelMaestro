# PR-A — Username Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let players log in with either their email address or a new, optional, lowercase username.

**Architecture:** Add a nullable unique `username` column on `Player`. NextAuth `authorize` accepts a single `identifier` field and resolves the player by `OR: [{ email }, { username }]`. Usernames are stored and compared lowercase. `createPlayer` gains an optional `username` input, validated with regex `^[a-z0-9_]{3,32}$`. No data migration — existing players keep logging in by email until an admin assigns a username (PR-B adds the edit UI; for this PR usernames are only set via the create dialog or direct DB edit).

**Tech Stack:** Prisma 6 (Postgres), NextAuth 5 (credentials), Next.js 15 App Router, Zod 4, Vitest 4 + @testing-library/react, pnpm 10.

**Spec:** `docs/superpowers/specs/2026-04-22-game-day-lifecycle-and-identity-design.md` → section "PR-A".

**Branch:** create a new branch off `main` named `feature/username-auth`.

---

## File Structure

**New files:**
- `prisma/migrations/<timestamp>_add_player_username/migration.sql` — Prisma generates this.
- `src/lib/auth/username.ts` — pure regex validator and lowercase normaliser.
- `tests/unit/auth/username.test.ts` — unit tests for the validator.
- `tests/integration/auth.test.ts` — integration tests for the NextAuth `authorize` callback.

**Modified files:**
- `prisma/schema.prisma` — add `username String? @unique` on `Player`.
- `src/auth.ts` — accept `identifier` credential, OR-lookup, lowercase normalise, update the declared `User`/`Session` shape to carry `username`.
- `src/lib/players/create.ts` — accept optional `username`, normalise lowercase, add `DuplicateUsernameError`, re-throw on P2002 with the correct target field.
- `src/app/api/players/route.ts` — extend Zod schema with optional `username`, map `DuplicateUsernameError` → 409 `{ error: "username_taken" }`.
- `src/app/login/login-form.tsx` — rename the field to "E-Mail oder Benutzername", `type="text"`, autocomplete `username`.
- `src/app/admin/create-player-dialog.tsx` — add optional "Benutzername" input, inline errors for `username_taken` and regex-fail.
- `tests/integration/players-create.test.ts` — extend to cover username paths.

**Responsibility split:**
- `src/lib/auth/username.ts` owns the regex + normalisation rule. The auth layer and create layer both import it instead of re-declaring the pattern.
- `src/auth.ts` owns credential shape and the OR-lookup.
- `src/lib/players/create.ts` owns DB insert + duplicate classification.
- API route owns HTTP shape only; no business logic added there.

---

## Task 1: Schema migration — add `username`

**Files:**
- Modify: `prisma/schema.prisma:10-35` (Player model)
- Generated: `prisma/migrations/<timestamp>_add_player_username/migration.sql`
- Generated: updated `node_modules/.prisma/client` types

- [ ] **Step 1: Start the local test DB (if not already running)**

Run:
```bash
docker compose -f docker-compose.dev.yml up -d
```
Expected: test DB container running on port 5433 (no error).

- [ ] **Step 2: Edit `prisma/schema.prisma` — add `username` to `Player`**

In the `Player` model, add one line right after `email`:

```prisma
model Player {
  id             String    @id @default(uuid())
  name           String
  email          String    @unique
  username       String?   @unique
  passwordHash   String?
  // ...rest unchanged
```

- [ ] **Step 3: Create the migration**

Run:
```bash
pnpm prisma migrate dev --name add_player_username
```
Expected: new folder under `prisma/migrations/` containing `migration.sql` with:
- `ALTER TABLE "Player" ADD COLUMN "username" TEXT;`
- `CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username");`

Migrate-dev also runs `prisma generate`. If you only have the production DB and want to defer the migration apply, use `pnpm prisma migrate dev --create-only --name add_player_username` and apply explicitly later — not needed for this task.

- [ ] **Step 4: Verify the generated Prisma client types include `username`**

Run:
```bash
pnpm tsc --noEmit
```
Expected: PASS. If it fails with `Property 'username' does not exist on type 'Player'`, re-run `pnpm prisma generate`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add nullable unique username column to Player"
```

---

## Task 2: Username validator (pure function)

**Files:**
- Create: `src/lib/auth/username.ts`
- Create: `tests/unit/auth/username.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/auth/username.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { USERNAME_REGEX, isValidUsername, normaliseUsername } from "@/lib/auth/username";

describe("isValidUsername", () => {
  it("accepts lowercase alnum + underscore of length 3-32", () => {
    expect(isValidUsername("abc")).toBe(true);
    expect(isValidUsername("a_b")).toBe(true);
    expect(isValidUsername("user_123")).toBe(true);
    expect(isValidUsername("a".repeat(32))).toBe(true);
  });

  it("rejects too short, too long, or forbidden characters", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("a".repeat(33))).toBe(false);
    expect(isValidUsername("Has-Dash")).toBe(false);
    expect(isValidUsername("has space")).toBe(false);
    expect(isValidUsername("UPPER")).toBe(false);
    expect(isValidUsername("emoji🙂")).toBe(false);
    expect(isValidUsername("")).toBe(false);
  });

  it("exports the regex as USERNAME_REGEX", () => {
    expect(USERNAME_REGEX.test("ok_1")).toBe(true);
    expect(USERNAME_REGEX.test("NOPE")).toBe(false);
  });
});

describe("normaliseUsername", () => {
  it("lowercases and trims the input", () => {
    expect(normaliseUsername("  User_One  ")).toBe("user_one");
    expect(normaliseUsername("ABC")).toBe("abc");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
pnpm test tests/unit/auth/username.test.ts
```
Expected: FAIL with `Cannot find module '@/lib/auth/username'`.

- [ ] **Step 3: Implement the validator**

Create `src/lib/auth/username.ts`:

```ts
export const USERNAME_REGEX = /^[a-z0-9_]{3,32}$/;

export function isValidUsername(candidate: string): boolean {
  return USERNAME_REGEX.test(candidate);
}

export function normaliseUsername(raw: string): string {
  return raw.trim().toLowerCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:
```bash
pnpm test tests/unit/auth/username.test.ts
```
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth/username.ts tests/unit/auth/username.test.ts
git commit -m "feat(auth): add username regex validator and normaliser"
```

---

## Task 3: Extend `createPlayer` to accept `username`

**Files:**
- Modify: `src/lib/players/create.ts`
- Modify: `tests/integration/players-create.test.ts` (append tests; existing tests unchanged)

- [ ] **Step 1: Write the failing integration tests**

Append these blocks to `tests/integration/players-create.test.ts`, inside the existing `describe("POST /api/players", ...)`, after the "returns 409 for duplicate email" test:

```ts
  it("accepts an optional username and stores it lowercase", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({
        email: "alice@example.com",
        name: "Alice",
        password: "hunter22extra",
        username: "AliceSmith",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const row = await prisma.player.findUniqueOrThrow({
      where: { email: "alice@example.com" },
    });
    expect(row.username).toBe("alicesmith");
  });

  it("returns 400 when username does not match the regex", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const req = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({
        email: "bad@example.com",
        name: "Bad",
        password: "hunter22extra",
        username: "no spaces",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 409 with username_taken for duplicate username (case-insensitive)", async () => {
    const admin = await makeAdmin();
    asAdmin(admin.id);
    const first = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({
        email: "first@example.com",
        name: "First",
        password: "hunter22extra",
        username: "shared",
      }),
      headers: { "content-type": "application/json" },
    });
    expect((await POST(first)).status).toBe(201);
    const second = new Request("http://localhost/api/players", {
      method: "POST",
      body: JSON.stringify({
        email: "second@example.com",
        name: "Second",
        password: "hunter22extra",
        username: "SHARED",
      }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(second);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("username_taken");
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
pnpm test tests/integration/players-create.test.ts
```
Expected: the three new tests FAIL. The "accepts" test fails because `username` is not stored; the "400" test fails because Zod accepts the extra field; the "409 username_taken" test fails because the second insert succeeds (currently no username uniqueness is seen by the app).

- [ ] **Step 3: Update `src/lib/players/create.ts` — add username support**

Replace the entire contents of `src/lib/players/create.ts` with:

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { normaliseUsername } from "@/lib/auth/username";

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

export interface CreatePlayerInput {
  email: string;
  name: string;
  password: string;
  isAdmin: boolean;
  actorId: string;
  username?: string;
}

export interface CreatedPlayer {
  id: string;
  email: string;
  name: string;
  isAdmin: boolean;
  username: string | null;
}

export async function createPlayer(input: CreatePlayerInput): Promise<CreatedPlayer> {
  const passwordHash = await hashPassword(input.password);
  const username = input.username ? normaliseUsername(input.username) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const player = await tx.player.create({
        data: {
          email: input.email,
          name: input.name,
          isAdmin: input.isAdmin,
          passwordHash,
          username,
        },
        select: { id: true, email: true, name: true, isAdmin: true, username: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "player.create",
          entityType: "Player",
          entityId: player.id,
          payload: {
            email: player.email,
            name: player.name,
            isAdmin: player.isAdmin,
            username: player.username,
          },
        },
      });
      const plannedDays = await tx.gameDay.findMany({
        where: { status: "planned" },
        select: { id: true },
      });
      if (plannedDays.length > 0) {
        await tx.gameDayParticipant.createMany({
          data: plannedDays.map((d) => ({ gameDayId: d.id, playerId: player.id })),
          skipDuplicates: true,
        });
      }
      return player;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const target = (e.meta?.target ?? []) as string[];
      if (target.includes("username")) throw new DuplicateUsernameError(username ?? "");
      if (target.includes("email")) throw new DuplicateEmailError(input.email);
      throw new DuplicateEmailError(input.email);
    }
    throw e;
  }
}
```

- [ ] **Step 4: Update `src/app/api/players/route.ts` — add username in Zod + map 409**

Replace the whole `POST` function in `src/app/api/players/route.ts` (and update imports at the top) so the file becomes:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  createPlayer,
  DuplicateEmailError,
  DuplicateUsernameError,
} from "@/lib/players/create";
import { USERNAME_REGEX } from "@/lib/auth/username";

const CreateSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  password: z.string().min(8),
  isAdmin: z.boolean().optional(),
  username: z.string().regex(USERNAME_REGEX).optional(),
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
      username: parsed.data.username,
      actorId: session.user.id,
    });
    return NextResponse.json(player, { status: 201 });
  } catch (e) {
    if (e instanceof DuplicateEmailError) {
      return NextResponse.json({ error: "email_taken" }, { status: 409 });
    }
    if (e instanceof DuplicateUsernameError) {
      return NextResponse.json({ error: "username_taken" }, { status: 409 });
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
    select: {
      id: true,
      email: true,
      name: true,
      username: true,
      isAdmin: true,
      passwordHash: true,
    },
  });
  return NextResponse.json(
    players.map((p) => ({
      id: p.id,
      email: p.email,
      username: p.username,
      name: p.name,
      isAdmin: p.isAdmin,
      hasPassword: p.passwordHash !== null,
    })),
  );
}
```

Note: this flips the existing 409 error code from `duplicate_email` to `email_taken`. Update the existing client dialog copy in Task 7 accordingly. No other callers of this endpoint depend on the error string.

- [ ] **Step 5: Update the existing duplicate-email test body expectation**

In `tests/integration/players-create.test.ts`, find the existing "returns 409 for duplicate email" test and add a body check. The block becomes:

```ts
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
    const res = await POST(secondReq);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("email_taken");
  });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run:
```bash
pnpm test tests/integration/players-create.test.ts
```
Expected: all tests PASS (the original 6 plus the 3 added in Step 1 = 9 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/players/create.ts src/app/api/players/route.ts tests/integration/players-create.test.ts
git commit -m "feat(players): accept optional username on create, map 409 per field"
```

---

## Task 4: Update NextAuth `authorize` to accept `identifier`

**Files:**
- Modify: `src/auth.ts`
- Create: `tests/integration/auth.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/auth.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { resetDb } from "../helpers/reset-db";

// Import the raw authorize function so we can call it directly.
// We avoid booting the full NextAuth handler for this test.
import { authorizeForTests } from "@/auth";

async function seedPlayer(input: { email: string; username?: string; password: string }) {
  return prisma.player.create({
    data: {
      name: "P",
      email: input.email,
      username: input.username ?? null,
      passwordHash: await hashPassword(input.password),
    },
  });
}

describe("authorize (identifier-based)", () => {
  beforeEach(resetDb);

  it("logs in by email", async () => {
    const p = await seedPlayer({ email: "a@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "a@example.com", password: "pw12345678" });
    expect(user?.id).toBe(p.id);
  });

  it("logs in by exact-case username", async () => {
    const p = await seedPlayer({ email: "b@example.com", username: "alice", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "alice", password: "pw12345678" });
    expect(user?.id).toBe(p.id);
  });

  it("logs in by mixed-case username (normalised)", async () => {
    const p = await seedPlayer({ email: "c@example.com", username: "bob", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "BoB", password: "pw12345678" });
    expect(user?.id).toBe(p.id);
  });

  it("returns null on unknown identifier", async () => {
    await seedPlayer({ email: "d@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "nobody@example.com", password: "pw12345678" });
    expect(user).toBeNull();
  });

  it("returns null on correct identifier + wrong password", async () => {
    await seedPlayer({ email: "e@example.com", password: "pw12345678" });
    const user = await authorizeForTests({ identifier: "e@example.com", password: "wrong-password" });
    expect(user).toBeNull();
  });

  it("does not log in a deleted player", async () => {
    const p = await seedPlayer({ email: "f@example.com", username: "ghost", password: "pw12345678" });
    await prisma.player.update({ where: { id: p.id }, data: { deletedAt: new Date() } });
    const byEmail = await authorizeForTests({ identifier: "f@example.com", password: "pw12345678" });
    const byUsername = await authorizeForTests({ identifier: "ghost", password: "pw12345678" });
    expect(byEmail).toBeNull();
    expect(byUsername).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
pnpm test tests/integration/auth.test.ts
```
Expected: FAIL with `authorizeForTests is not exported from '@/auth'` (module does not expose the function yet).

- [ ] **Step 3: Rewrite `src/auth.ts`**

Replace the entire contents of `src/auth.ts` with:

```ts
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";
import { normaliseUsername } from "@/lib/auth/username";
import { authConfig } from "@/auth.config";

const CredentialsSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(1),
});

// Dummy bcrypt hash so timing is equalised for unknown identifiers.
const DUMMY_HASH =
  "$2b$10$CwTycUXWue0Thq9StjUM0uJ8xWJh7G4r8vGG3qJPiE5qiVXc3vN8C";

type AuthorizedUser = {
  id: string;
  email: string;
  name: string;
  username: string | null;
  isAdmin: boolean;
};

export async function authorizeForTests(
  raw: unknown,
): Promise<AuthorizedUser | null> {
  const parsed = CredentialsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { identifier, password } = parsed.data;
  const normalised = normaliseUsername(identifier);
  const player = await prisma.player.findFirst({
    where: {
      OR: [{ email: identifier }, { username: normalised }],
      deletedAt: null,
    },
  });
  const hash = player?.passwordHash ?? DUMMY_HASH;
  const ok = await verifyPassword(password, hash);
  if (!ok || !player) return null;
  return {
    id: player.id,
    email: player.email,
    name: player.name,
    username: player.username,
    isAdmin: player.isAdmin,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "E-Mail oder Benutzername" },
        password: { label: "Passwort", type: "password" },
      },
      authorize: authorizeForTests,
    }),
  ],
});

declare module "next-auth" {
  interface User {
    isAdmin?: boolean;
    username?: string | null;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      username: string | null;
      isAdmin: boolean;
    };
  }
}
```

- [ ] **Step 4: Thread `username` through the JWT/session callbacks**

Modify `src/auth.config.ts` to carry `username` into the session. Replace its contents with:

```ts
import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.isAdmin = (user as { isAdmin: boolean }).isAdmin;
        token.username = (user as { username: string | null }).username ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { isAdmin: boolean }).isAdmin = token.isAdmin as boolean;
        (session.user as { username: string | null }).username =
          (token.username as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
```

- [ ] **Step 5: Run the integration tests**

Run:
```bash
pnpm test tests/integration/auth.test.ts
```
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full test suite as a regression check**

Run:
```bash
pnpm test
```
Expected: all tests PASS. If a test still references the old `email` credential shape, it will fail — there are none at the time of writing, but `grep -r "email:.*password:" tests/` before committing, just in case.

- [ ] **Step 7: Commit**

```bash
git add src/auth.ts src/auth.config.ts tests/integration/auth.test.ts
git commit -m "feat(auth): accept email or username as login identifier"
```

---

## Task 5: Update the login form UI

**Files:**
- Modify: `src/app/login/login-form.tsx`

- [ ] **Step 1: Replace `src/app/login/login-form.tsx`**

```tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", { identifier, password, redirect: false });
    if (res?.error) {
      setLoading(false);
      setError("Falsche Anmeldedaten");
      return;
    }
    window.location.assign("/");
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-surface p-5 space-y-3">
      <div>
        <Label htmlFor="identifier">E-Mail oder Benutzername</Label>
        <Input
          id="identifier"
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          required
          autoComplete="username"
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
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button type="submit" loading={loading} className="w-full">
        Anmelden
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Run the dev server and smoke-test in a browser**

Run:
```bash
pnpm dev
```
Then open http://localhost:3000/login in a browser.

Expected: the single identifier input shows "E-Mail oder Benutzername". Typing a non-email value (e.g. `admin`) does not trigger the browser's HTML5 email validation. Logging in with an existing email still works. Stop the dev server with Ctrl-C afterwards.

- [ ] **Step 3: Typecheck and lint**

Run:
```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/login-form.tsx
git commit -m "feat(login): accept email or username in the login form"
```

---

## Task 6: Update the create-player dialog UI

**Files:**
- Modify: `src/app/admin/create-player-dialog.tsx`

- [ ] **Step 1: Replace `src/app/admin/create-player-dialog.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { isValidUsername } from "@/lib/auth/username";

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
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmail("");
    setName("");
    setUsername("");
    setPassword("");
    setIsAdmin(false);
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedUsername = username.trim();
    if (trimmedUsername && !isValidUsername(trimmedUsername.toLowerCase())) {
      setError(
        "Benutzername: 3–32 Zeichen, nur Kleinbuchstaben, Ziffern und Unterstriche",
      );
      return;
    }
    setLoading(true);
    const res = await fetch("/api/players", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        name,
        password,
        isAdmin,
        username: trimmedUsername || undefined,
      }),
    });
    setLoading(false);
    if (res.status === 409) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (body.error === "username_taken") {
        setError("Dieser Benutzername ist bereits vergeben");
      } else {
        setError("Ein Spieler mit dieser E-Mail existiert bereits");
      }
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
          <Label htmlFor="new-player-username">Benutzername (optional)</Label>
          <Input
            id="new-player-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="z. B. alice_42"
            autoComplete="off"
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

- [ ] **Step 2: Typecheck and lint**

Run:
```bash
pnpm tsc --noEmit && pnpm lint
```
Expected: both PASS.

- [ ] **Step 3: Smoke-test in a browser**

Run:
```bash
pnpm dev
```
Open http://localhost:3000/admin as an admin user. Click "Spieler anlegen" and:
- submit with a valid username → player appears in the list.
- submit with an invalid username ("Has-Dash") → inline error before any network call.
- submit with a duplicate username → inline error "Dieser Benutzername ist bereits vergeben".
- submit with an empty username → still succeeds.

Stop the dev server with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/create-player-dialog.tsx
git commit -m "feat(admin): allow assigning a username when creating a player"
```

---

## Task 7: Final regression pass and PR

- [ ] **Step 1: Run the entire test suite**

Run:
```bash
pnpm test
```
Expected: all tests PASS (including the 3 new unit tests, 6 new integration auth tests, 3 new integration create tests, and all pre-existing tests).

- [ ] **Step 2: Typecheck, lint, and build**

Run:
```bash
pnpm tsc --noEmit && pnpm lint && pnpm build
```
Expected: each command PASS.

- [ ] **Step 3: Run `commit-guard` before pushing**

If using subagent-driven execution, dispatch the `commit-guard` agent over the staged diff of the whole branch. Otherwise, review the combined diff manually.

Run:
```bash
git diff main...HEAD
```
Expected: only the files listed in the "File Structure" section at the top of this plan appear, plus the new Prisma migration folder.

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin feature/username-auth
gh pr create --title "feat: accept username as login alias" --body "$(cat <<'EOF'
## Summary
- Adds a nullable unique `username` column on `Player`.
- NextAuth `authorize` accepts `identifier` and resolves by email or lowercase username.
- Create-player dialog has an optional username field with regex validation and inline error for duplicates.
- Login form relabels the input to "E-Mail oder Benutzername" and uses `type="text"`.

## Test plan
- [ ] `pnpm test` passes.
- [ ] Smoke: login with existing admin email still works.
- [ ] Smoke: create a player with a username, then log in using the username.
- [ ] Smoke: create a second player trying to steal the same username → inline error.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL returned. Stop here; merge and deploy are manual.

---

## Spec coverage checklist

- ✅ Nullable unique `username` column — Task 1
- ✅ No backfill — Task 1 (nullable)
- ✅ Identifier-based `authorize` with `OR` lookup — Task 4
- ✅ Lowercase normalisation — Task 2 + Task 4 (login) + Task 3 (create)
- ✅ Timing dummy hash stays — Task 4
- ✅ Login form label + `type="text"` — Task 5
- ✅ Create-player dialog with optional Benutzername — Task 6
- ✅ Regex `^[a-z0-9_]{3,32}$` — Task 2 (unit) + Task 3 (API)
- ✅ Duplicate username → 409 — Task 3
- ✅ Unit test for regex — Task 2
- ✅ Integration tests for auth (5 cases from spec + deleted-player guard) — Task 4
- ✅ Integration tests for create (username success, dup → 409, invalid → 400) — Task 3

No spec item is unimplemented.
