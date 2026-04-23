# Avatar Upload + Header Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any player (self-service) or admin (override) upload, replace, or remove a player's avatar, stored in Postgres, served with cache-busting, and rendered everywhere a player is shown.

**Architecture:** Multipart upload → `sharp` center-crop to 256×256 WebP → Postgres `bytea` column on `Player` → cached `GET /api/players/[id]/avatar?v={version}` route → shared `<Avatar>` component that falls back to initials.

**Tech Stack:** Next.js 15 App Router, Prisma 6, NextAuth credentials, `sharp` (new dep), bcryptjs (existing), Zod, Vitest integration tests with real DB.

**Design doc:** `docs/superpowers/specs/2026-04-23-avatar-upload-design.md`.

---

## File Structure

**New files:**

- `prisma/migrations/<timestamp>_add_player_avatar/migration.sql` — migration
- `src/lib/player/initials.ts` — shared initials helper (extracted from `user-menu.tsx`)
- `src/lib/players/avatar.ts` — service (set/delete/get) with typed errors
- `src/components/ui/avatar.tsx` — shared `<Avatar>` component
- `src/app/api/profile/avatar/route.ts` — self-service POST + DELETE
- `src/app/api/players/[id]/avatar/route.ts` — admin PUT + DELETE + public GET
- `src/app/profil/avatar-uploader.tsx` — client upload widget on `/profil`
- `src/app/admin/avatar-dialog.tsx` — admin upload dialog
- `tests/integration/players-avatar.test.ts` — service + API integration tests
- `tests/unit/lib/player/initials.test.ts` — unit test for the helper
- `tests/unit/components/avatar.test.tsx` — unit test for fallback behaviour
- `tests/fixtures/avatar-sample.png` — tiny (3×3) valid PNG for upload tests

**Modified files:**

- `prisma/schema.prisma` — add three fields to `Player`
- `package.json` — add `sharp`
- `src/components/user-menu.tsx` — accept `avatarVersion` + `playerId` props, render `<Avatar>` instead of inline initials, import `initials` from shared module
- `src/components/top-nav.tsx` — thread `avatarVersion` + `playerId` props
- `src/app/layout.tsx` (or the layout that renders `TopNav`) — query `avatarVersion` for logged-in user, pass to `TopNav`
- `src/app/page.tsx` — render `<Avatar>` next to "Hi, {firstName}", add avatars to Top-3 list and teamwork cards
- `src/app/profil/page.tsx` — render `<AvatarUploader>` above the existing password card
- `src/components/ranking-table.tsx` — add avatar column; type `RankingRow` gains `avatarVersion`
- `src/lib/ranking/compute.ts` — include `"avatarVersion"` in the raw SQL select
- `src/app/game-day/finished-summary.tsx` — avatars on podium and table; `GameDaySummaryRow` gains `avatarVersion`
- `src/lib/game-day/summary.ts` — include `avatarVersion` in the player name lookup
- `src/app/admin/players-section.tsx` — add "Avatar" button per row, mount `AvatarDialog`

---

### Task 1: Database migration + sharp dependency

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_player_avatar/migration.sql` (generated)
- Modify: `package.json`, `pnpm-lock.yaml`

- [ ] **Step 1: Add the three fields to `Player` in `prisma/schema.prisma`**

Inside the `Player` model, below `passwordHash`, add:

```prisma
  avatarData     Bytes?
  avatarMimeType String?
  avatarVersion  Int       @default(0)
```

- [ ] **Step 2: Generate the migration**

```
pnpm prisma migrate dev --name add_player_avatar
```

Expected: creates `prisma/migrations/<ts>_add_player_avatar/migration.sql` with three `ALTER TABLE "Player" ADD COLUMN ...` statements, re-generates the client without error.

- [ ] **Step 3: Install sharp**

```
pnpm add sharp
```

Expected: `sharp` appears in `dependencies` in `package.json` at a recent version (0.33.x or newer). `pnpm-lock.yaml` gets updated.

- [ ] **Step 4: Confirm sharp loads and the new client compiles**

```
pnpm tsc --noEmit
node -e "console.log(require('sharp').versions)"
```

Expected: `tsc` clean; `node` prints the sharp version info (libvips etc.) without throwing.

- [ ] **Step 5: Commit**

```
git add prisma/schema.prisma prisma/migrations package.json pnpm-lock.yaml
git commit -m "feat(db): add avatar fields to Player; install sharp"
```

---

### Task 2: Extract `initials()` helper

**Files:**
- Create: `src/lib/player/initials.ts`
- Create: `tests/unit/lib/player/initials.test.ts`
- Modify: `src/components/user-menu.tsx`

**Context:** The inline `initials()` in `user-menu.tsx` will also be needed by `<Avatar>`. Extract it now so the two call sites share one implementation.

- [ ] **Step 1: Write the failing unit test**

Create `tests/unit/lib/player/initials.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { initials } from "@/lib/player/initials";

describe("initials", () => {
  it("returns the first two letters for a two-part name", () => {
    expect(initials("Patrick Berger")).toBe("PB");
  });

  it("returns the first and last letter for a three-part name", () => {
    expect(initials("Anna Maria Schmidt")).toBe("AS");
  });

  it("returns a single uppercase letter for a one-word name", () => {
    expect(initials("Patrick")).toBe("P");
  });

  it("returns an empty string for an empty name", () => {
    expect(initials("")).toBe("");
  });

  it("collapses whitespace and handles tabs", () => {
    expect(initials("  Patrick\tBerger  ")).toBe("PB");
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
pnpm vitest run tests/unit/lib/player/initials.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Create the helper**

Create `src/lib/player/initials.ts`:

```ts
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "";
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```
pnpm vitest run tests/unit/lib/player/initials.test.ts
```

Expected: 5/5 green.

- [ ] **Step 5: Replace the inline definition in `user-menu.tsx`**

Replace the contents of `src/components/user-menu.tsx` with (only the helper block changes; signature stays the same for now, plumbing comes in Task 8):

```tsx
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
```

- [ ] **Step 6: Verify full suite + typecheck still pass**

```
pnpm tsc --noEmit
pnpm vitest run
```

Expected: all green.

- [ ] **Step 7: Commit**

```
git add src/lib/player/initials.ts src/components/user-menu.tsx tests/unit/lib/player/initials.test.ts
git commit -m "refactor(player): extract initials helper to shared module"
```

---

### Task 3: `<Avatar>` component

**Files:**
- Create: `src/components/ui/avatar.tsx`
- Create: `tests/unit/components/avatar.test.tsx`

**Context:** One reusable presentational component. If `avatarVersion === 0` or `avatarData` is unavailable, show initials. Otherwise show a cached `<img>`.

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/components/avatar.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Avatar } from "@/components/ui/avatar";

describe("Avatar", () => {
  it("shows initials when avatarVersion is 0", () => {
    render(<Avatar playerId="abc" name="Patrick Berger" avatarVersion={0} />);
    expect(screen.getByText("PB")).toBeInTheDocument();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders an img with versioned src when avatarVersion > 0", () => {
    render(<Avatar playerId="abc" name="Patrick Berger" avatarVersion={3} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", "/api/players/abc/avatar?v=3");
    expect(img).toHaveAttribute("alt", "Patrick Berger");
    expect(img).toHaveAttribute("loading", "lazy");
  });

  it("respects the size prop on the fallback", () => {
    const { container } = render(
      <Avatar playerId="abc" name="Patrick Berger" avatarVersion={0} size={96} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.className).toMatch(/h-24/);
    expect(root.className).toMatch(/w-24/);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```
pnpm vitest run tests/unit/components/avatar.test.tsx
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the component**

Create `src/components/ui/avatar.tsx`:

```tsx
import { initials } from "@/lib/player/initials";

export type AvatarSize = 32 | 40 | 48 | 64 | 96;

const SIZE_CLASSES: Record<AvatarSize, string> = {
  32: "h-8 w-8 text-xs",
  40: "h-10 w-10 text-sm",
  48: "h-12 w-12 text-sm",
  64: "h-16 w-16 text-base",
  96: "h-24 w-24 text-xl",
};

export interface AvatarProps {
  playerId: string;
  name: string;
  avatarVersion: number;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({
  playerId,
  name,
  avatarVersion,
  size = 40,
  className = "",
}: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];
  const base = `inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${sizeClass} ${className}`.trim();

  if (avatarVersion === 0) {
    return (
      <span
        aria-hidden="true"
        className={`${base} bg-surface-elevated font-semibold text-primary border border-border-strong`}
      >
        {initials(name)}
      </span>
    );
  }

  return (
    <span className={base}>
      <img
        src={`/api/players/${playerId}/avatar?v=${avatarVersion}`}
        alt={name}
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </span>
  );
}
```

- [ ] **Step 4: Run tests**

```
pnpm vitest run tests/unit/components/avatar.test.tsx
pnpm tsc --noEmit
```

Expected: 3/3 green; tsc clean.

- [ ] **Step 5: Commit**

```
git add src/components/ui/avatar.tsx tests/unit/components/avatar.test.tsx
git commit -m "feat(ui): add Avatar component with initials fallback"
```

---

### Task 4: Service layer `src/lib/players/avatar.ts`

**Files:**
- Create: `src/lib/players/avatar.ts`
- Create: `tests/integration/players-avatar.test.ts` (service-only describe block for now)
- Create: `tests/fixtures/avatar-sample.png` (tiny real PNG)

**Context:** Pure, DB-only service with typed errors. Mirrors the `change-password.ts` pattern: `findUnique` pre-check for `PlayerNotFoundError`, then the work in a `$transaction` with an audit log.

- [ ] **Step 1: Create a tiny PNG fixture**

Generate a 3×3 PNG at `tests/fixtures/avatar-sample.png`. Run this one-liner (from the repo root) to produce a real PNG deterministically:

```
node -e "const s=require('sharp');s({create:{width:3,height:3,channels:3,background:{r:100,g:150,b:200}}}).png().toFile('tests/fixtures/avatar-sample.png').then(()=>console.log('ok'))"
```

Expected: prints `ok`; the file is roughly 75–120 bytes.

- [ ] **Step 2: Write the failing integration tests (service only)**

Create `tests/integration/players-avatar.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "@/lib/db";
import { resetDb } from "../helpers/reset-db";
import {
  setPlayerAvatar,
  deletePlayerAvatar,
  getPlayerAvatar,
  PlayerNotFoundError,
  InvalidImageError,
  FileTooLargeError,
} from "@/lib/players/avatar";

// vi.mock hoisted to file scope so route tests in later describes can reuse it.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
import { auth } from "@/auth";
const authMock = auth as unknown as ReturnType<typeof vi.fn>;

const FIXTURE = readFileSync(path.join(__dirname, "../fixtures/avatar-sample.png"));

async function makePlayer(name: string, extra: { isAdmin?: boolean } = {}) {
  return prisma.player.create({
    data: {
      name,
      email: `${name.toLowerCase()}@x`,
      isAdmin: extra.isAdmin ?? false,
    },
  });
}

describe("setPlayerAvatar", () => {
  beforeEach(resetDb);

  it("stores the processed bytes, sets version to 1, and writes an audit log on first upload", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE });

    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(1);
    expect(after.avatarMimeType).toBe("image/webp");
    expect(after.avatarData).not.toBeNull();

    const meta = await sharp(after.avatarData!).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.avatar_change" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(me.id);
    expect(logs[0].payload).toMatchObject({ action: "upload" });
  });

  it("increments avatarVersion on replace", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE });
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(2);
  });

  it("throws FileTooLargeError for buffers > 5 MB without touching the row", async () => {
    const me = await makePlayer("Me");
    const huge = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
    await expect(setPlayerAvatar({ playerId: me.id, file: huge })).rejects.toBeInstanceOf(
      FileTooLargeError,
    );
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(0);
    expect(after.avatarData).toBeNull();
  });

  it("throws InvalidImageError for non-image bytes without touching the row", async () => {
    const me = await makePlayer("Me");
    const junk = Buffer.from("this is not an image");
    await expect(setPlayerAvatar({ playerId: me.id, file: junk })).rejects.toBeInstanceOf(
      InvalidImageError,
    );
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarVersion).toBe(0);
  });

  it("throws PlayerNotFoundError for a soft-deleted player", async () => {
    const me = await makePlayer("Me");
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    await expect(setPlayerAvatar({ playerId: me.id, file: FIXTURE })).rejects.toBeInstanceOf(
      PlayerNotFoundError,
    );
  });

  it("does not write an audit log on InvalidImageError", async () => {
    const me = await makePlayer("Me");
    await expect(
      setPlayerAvatar({ playerId: me.id, file: Buffer.from("nope") }),
    ).rejects.toBeInstanceOf(InvalidImageError);
    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.avatar_change" },
    });
    expect(logs).toHaveLength(0);
  });
});

describe("deletePlayerAvatar", () => {
  beforeEach(resetDb);

  it("clears avatarData + avatarMimeType, bumps version, writes audit log with action=delete", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE });
    await deletePlayerAvatar({ playerId: me.id });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarData).toBeNull();
    expect(after.avatarMimeType).toBeNull();
    expect(after.avatarVersion).toBe(2);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: me.id, action: "player.avatar_change" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs).toHaveLength(2);
    expect(logs[1].payload).toMatchObject({ action: "delete" });
  });

  it("throws PlayerNotFoundError for an unknown player", async () => {
    await expect(
      deletePlayerAvatar({ playerId: "00000000-0000-0000-0000-000000000000" }),
    ).rejects.toBeInstanceOf(PlayerNotFoundError);
  });
});

describe("getPlayerAvatar", () => {
  beforeEach(resetDb);

  it("returns null when no avatar is set", async () => {
    const me = await makePlayer("Me");
    expect(await getPlayerAvatar(me.id)).toBeNull();
  });

  it("returns { data, mimeType, version } after upload", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE });
    const got = await getPlayerAvatar(me.id);
    expect(got).not.toBeNull();
    expect(got!.mimeType).toBe("image/webp");
    expect(got!.version).toBe(1);
    expect(got!.data.length).toBeGreaterThan(0);
  });

  it("returns null for a soft-deleted player even if bytes exist", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, file: FIXTURE });
    await prisma.player.update({ where: { id: me.id }, data: { deletedAt: new Date() } });
    expect(await getPlayerAvatar(me.id)).toBeNull();
  });
});
```

Keep `authMock` exported-by-import-side-effect for later describes to reuse — that's why the mock lives at file scope.

- [ ] **Step 3: Run to verify failure**

```
pnpm vitest run tests/integration/players-avatar.test.ts
```

Expected: FAIL — service module missing.

- [ ] **Step 4: Implement the service**

Create `src/lib/players/avatar.ts`:

```ts
import sharp from "sharp";
import { prisma } from "@/lib/db";

export class PlayerNotFoundError extends Error {
  constructor(id: string) {
    super(`player not found: ${id}`);
    this.name = "PlayerNotFoundError";
  }
}

export class InvalidImageError extends Error {
  constructor() {
    super("invalid image");
    this.name = "InvalidImageError";
  }
}

export class FileTooLargeError extends Error {
  constructor() {
    super("file too large");
    this.name = "FileTooLargeError";
  }
}

// 5 MB cap; the route layer also sniffs Content-Length, but this is source of truth.
const MAX_BYTES = 5 * 1024 * 1024;

export interface SetPlayerAvatarInput {
  playerId: string;
  file: Buffer;
}

async function processToWebp(file: Buffer): Promise<Buffer> {
  // sharp throws on non-image bytes; surface as InvalidImageError.
  try {
    return await sharp(file)
      .rotate() // normalise EXIF orientation
      .resize(256, 256, { fit: "cover", position: "centre" })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new InvalidImageError();
  }
}

async function ensureActivePlayer(playerId: string): Promise<void> {
  const row = await prisma.player.findUnique({
    where: { id: playerId },
    select: { id: true, deletedAt: true },
  });
  if (!row || row.deletedAt) throw new PlayerNotFoundError(playerId);
}

export async function setPlayerAvatar(input: SetPlayerAvatarInput): Promise<void> {
  if (input.file.length > MAX_BYTES) throw new FileTooLargeError();
  await ensureActivePlayer(input.playerId);
  const avatarData = await processToWebp(input.file);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: {
        avatarData,
        avatarMimeType: "image/webp",
        avatarVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.playerId,
        action: "player.avatar_change",
        entityType: "Player",
        entityId: input.playerId,
        payload: { action: "upload" },
      },
    });
  });
}

export async function deletePlayerAvatar(input: { playerId: string }): Promise<void> {
  await ensureActivePlayer(input.playerId);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: input.playerId },
      data: {
        avatarData: null,
        avatarMimeType: null,
        avatarVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        actorId: input.playerId,
        action: "player.avatar_change",
        entityType: "Player",
        entityId: input.playerId,
        payload: { action: "delete" },
      },
    });
  });
}

export async function getPlayerAvatar(
  playerId: string,
): Promise<{ data: Buffer; mimeType: string; version: number } | null> {
  const row = await prisma.player.findUnique({
    where: { id: playerId },
    select: { deletedAt: true, avatarData: true, avatarMimeType: true, avatarVersion: true },
  });
  if (!row || row.deletedAt || !row.avatarData || !row.avatarMimeType) return null;
  return {
    data: Buffer.from(row.avatarData),
    mimeType: row.avatarMimeType,
    version: row.avatarVersion,
  };
}
```

**Note on audit actor for admin-triggered changes:** the service uses `playerId` as `actorId`. The admin override route will need a different actor (the admin's id), so the service takes a separate `actorId` param. Fix: extend the signature now so tests and callers are consistent.

Add `actorId` to both mutation inputs:

```ts
export interface SetPlayerAvatarInput {
  playerId: string;
  file: Buffer;
  actorId: string;
}

export interface DeletePlayerAvatarInput {
  playerId: string;
  actorId: string;
}
```

Then in `setPlayerAvatar`: `actorId: input.actorId` inside the `auditLog.create`. Same in `deletePlayerAvatar`.

Update the test file's `setPlayerAvatar({ playerId: me.id, file: FIXTURE })` calls to `setPlayerAvatar({ playerId: me.id, file: FIXTURE, actorId: me.id })` — do this find-and-replace in the test file before re-running.

- [ ] **Step 5: Run tests to verify they pass**

```
pnpm vitest run tests/integration/players-avatar.test.ts
pnpm tsc --noEmit
```

Expected: all service-describe tests green, tsc clean.

- [ ] **Step 6: Commit**

```
git add src/lib/players/avatar.ts tests/integration/players-avatar.test.ts tests/fixtures/avatar-sample.png
git commit -m "feat(players): add avatar service (set/delete/get)"
```

---

### Task 5: Self-service API routes

**Files:**
- Create: `src/app/api/profile/avatar/route.ts`
- Modify: `tests/integration/players-avatar.test.ts` (append describe block)

**Context:** `POST` + `DELETE`. Body is `multipart/form-data` with one `file` field. 401/400/413/404/204 mapping per the spec.

- [ ] **Step 1: Write the failing API tests**

Append to `tests/integration/players-avatar.test.ts`:

```ts
import { POST, DELETE } from "@/app/api/profile/avatar/route";

function multipartRequest(url: string, file: Buffer | null, method: "POST" | "DELETE" = "POST"): Request {
  if (file === null) {
    return new Request(url, { method });
  }
  const body = new FormData();
  const blob = new Blob([file], { type: "image/png" });
  body.append("file", blob, "avatar.png");
  return new Request(url, { method, body });
}

describe("POST /api/profile/avatar", () => {
  beforeEach(resetDb);

  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(multipartRequest("http://test/api/profile/avatar", FIXTURE));
    expect(res.status).toBe(401);
  });

  it("returns 400 when the file field is missing", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const req = new Request("http://test/api/profile/avatar", { method: "POST", body: new FormData() });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for non-image bytes", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(
      multipartRequest("http://test/api/profile/avatar", Buffer.from("not-an-image")),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_image");
  });

  it("returns 413 for a > 5 MB file", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const big = Buffer.alloc(5 * 1024 * 1024 + 1);
    const res = await POST(multipartRequest("http://test/api/profile/avatar", big));
    expect(res.status).toBe(413);
  });

  it("returns 200 with { version } on success and stores WebP bytes", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await POST(multipartRequest("http://test/api/profile/avatar", FIXTURE));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ version: 1 });
    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarMimeType).toBe("image/webp");
    expect(after.avatarVersion).toBe(1);
  });
});

describe("DELETE /api/profile/avatar", () => {
  beforeEach(resetDb);

  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await DELETE(new Request("http://test/api/profile/avatar", { method: "DELETE" }));
    expect(res.status).toBe(401);
  });

  it("returns 204 and clears the row for an authenticated user", async () => {
    const me = await makePlayer("Me");
    // seed an avatar first
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    await POST(multipartRequest("http://test/api/profile/avatar", FIXTURE));

    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await DELETE(new Request("http://test/api/profile/avatar", { method: "DELETE" }));
    expect(res.status).toBe(204);

    const after = await prisma.player.findUniqueOrThrow({ where: { id: me.id } });
    expect(after.avatarData).toBeNull();
    expect(after.avatarVersion).toBe(2);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```
pnpm vitest run tests/integration/players-avatar.test.ts
```

Expected: the new POST/DELETE tests fail (route module missing).

- [ ] **Step 3: Implement the route**

Create `src/app/api/profile/avatar/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  setPlayerAvatar,
  deletePlayerAvatar,
  PlayerNotFoundError,
  InvalidImageError,
  FileTooLargeError,
} from "@/lib/players/avatar";

const MAX_BYTES = 5 * 1024 * 1024;

function tooLargeByContentLength(req: Request): boolean {
  const raw = req.headers.get("content-length");
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > MAX_BYTES;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (tooLargeByContentLength(req)) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await setPlayerAvatar({
      playerId: session.user.id,
      actorId: session.user.id,
      file: buffer,
    });
  } catch (e) {
    if (e instanceof FileTooLargeError) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }
    if (e instanceof InvalidImageError) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }

  const row = await (await import("@/lib/db")).prisma.player.findUniqueOrThrow({
    where: { id: session.user.id },
    select: { avatarVersion: true },
  });
  return NextResponse.json({ version: row.avatarVersion }, { status: 200 });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    await deletePlayerAvatar({ playerId: session.user.id, actorId: session.user.id });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}
```

Replace the dynamic `import("@/lib/db")` with a top-level `import { prisma } from "@/lib/db";` — the dynamic import above is a common mistake; use the top-level one the rest of the codebase uses.

- [ ] **Step 4: Run tests**

```
pnpm vitest run tests/integration/players-avatar.test.ts
pnpm tsc --noEmit
```

Expected: all POST/DELETE describe tests green.

- [ ] **Step 5: Commit**

```
git add src/app/api/profile/avatar/route.ts tests/integration/players-avatar.test.ts
git commit -m "feat(profile): add POST/DELETE /api/profile/avatar"
```

---

### Task 6: Admin API routes

**Files:**
- Create: `src/app/api/players/[id]/avatar/route.ts` (PUT + DELETE; GET added in Task 7)
- Modify: `tests/integration/players-avatar.test.ts`

**Context:** `session.user.isAdmin` check, operates on the URL's `playerId`, otherwise identical to self-service. `actorId` in the audit log is the admin's session id, so a forensic trail records who uploaded on whose behalf.

- [ ] **Step 1: Write failing tests**

Append to `tests/integration/players-avatar.test.ts`:

```ts
import { PUT as adminPut, DELETE as adminDelete } from "@/app/api/players/[id]/avatar/route";

function adminMultipart(url: string, file: Buffer): Request {
  const body = new FormData();
  body.append("file", new Blob([file], { type: "image/png" }), "avatar.png");
  return new Request(url, { method: "PUT", body });
}

describe("PUT /api/players/[id]/avatar (admin)", () => {
  beforeEach(resetDb);

  it("returns 401 without a session", async () => {
    const target = await makePlayer("Target");
    authMock.mockResolvedValueOnce(null);
    const res = await adminPut(
      adminMultipart(`http://test/api/players/${target.id}/avatar`, FIXTURE),
      { params: Promise.resolve({ id: target.id }) },
    );
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin user", async () => {
    const admin = await makePlayer("NotAdmin");
    const target = await makePlayer("Target");
    authMock.mockResolvedValueOnce({ user: { id: admin.id, isAdmin: false } });
    const res = await adminPut(
      adminMultipart(`http://test/api/players/${target.id}/avatar`, FIXTURE),
      { params: Promise.resolve({ id: target.id }) },
    );
    expect(res.status).toBe(403);
  });

  it("returns 404 for a missing player", async () => {
    const admin = await makePlayer("Admin", { isAdmin: true });
    authMock.mockResolvedValueOnce({ user: { id: admin.id, isAdmin: true } });
    const unknown = "00000000-0000-0000-0000-000000000000";
    const res = await adminPut(
      adminMultipart(`http://test/api/players/${unknown}/avatar`, FIXTURE),
      { params: Promise.resolve({ id: unknown }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns 200 with { version } on success and records admin as actor", async () => {
    const admin = await makePlayer("Admin", { isAdmin: true });
    const target = await makePlayer("Target");
    authMock.mockResolvedValueOnce({ user: { id: admin.id, isAdmin: true } });
    const res = await adminPut(
      adminMultipart(`http://test/api/players/${target.id}/avatar`, FIXTURE),
      { params: Promise.resolve({ id: target.id }) },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ version: 1 });

    const logs = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.avatar_change" },
    });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorId).toBe(admin.id);
  });
});

describe("DELETE /api/players/[id]/avatar (admin)", () => {
  beforeEach(resetDb);

  it("clears the target avatar and records the admin as actor", async () => {
    const admin = await makePlayer("Admin", { isAdmin: true });
    const target = await makePlayer("Target");
    // seed
    authMock.mockResolvedValueOnce({ user: { id: admin.id, isAdmin: true } });
    await adminPut(
      adminMultipart(`http://test/api/players/${target.id}/avatar`, FIXTURE),
      { params: Promise.resolve({ id: target.id }) },
    );

    authMock.mockResolvedValueOnce({ user: { id: admin.id, isAdmin: true } });
    const res = await adminDelete(
      new Request(`http://test/api/players/${target.id}/avatar`, { method: "DELETE" }),
      { params: Promise.resolve({ id: target.id }) },
    );
    expect(res.status).toBe(204);

    const after = await prisma.player.findUniqueOrThrow({ where: { id: target.id } });
    expect(after.avatarData).toBeNull();
    expect(after.avatarVersion).toBe(2);

    const logs = await prisma.auditLog.findMany({
      where: { entityId: target.id, action: "player.avatar_change" },
      orderBy: { createdAt: "asc" },
    });
    expect(logs[1].actorId).toBe(admin.id);
  });

  it("returns 403 for non-admin", async () => {
    const nobody = await makePlayer("Nobody");
    const target = await makePlayer("Target");
    authMock.mockResolvedValueOnce({ user: { id: nobody.id, isAdmin: false } });
    const res = await adminDelete(
      new Request(`http://test/api/players/${target.id}/avatar`, { method: "DELETE" }),
      { params: Promise.resolve({ id: target.id }) },
    );
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
pnpm vitest run tests/integration/players-avatar.test.ts
```

Expected: new admin describes fail — module missing.

- [ ] **Step 3: Implement the route**

Create `src/app/api/players/[id]/avatar/route.ts`:

```ts
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  setPlayerAvatar,
  deletePlayerAvatar,
  PlayerNotFoundError,
  InvalidImageError,
  FileTooLargeError,
} from "@/lib/players/avatar";

const MAX_BYTES = 5 * 1024 * 1024;

function tooLargeByContentLength(req: Request): boolean {
  const raw = req.headers.get("content-length");
  if (!raw) return false;
  const n = Number(raw);
  return Number.isFinite(n) && n > MAX_BYTES;
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function PUT(req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (tooLargeByContentLength(req)) {
    return NextResponse.json({ error: "file_too_large" }, { status: 413 });
  }

  const { id } = await ctx.params;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    await setPlayerAvatar({ playerId: id, actorId: session.user.id, file: buffer });
  } catch (e) {
    if (e instanceof FileTooLargeError) {
      return NextResponse.json({ error: "file_too_large" }, { status: 413 });
    }
    if (e instanceof InvalidImageError) {
      return NextResponse.json({ error: "invalid_image" }, { status: 400 });
    }
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }

  const row = await prisma.player.findUniqueOrThrow({
    where: { id },
    select: { avatarVersion: true },
  });
  return NextResponse.json({ version: row.avatarVersion }, { status: 200 });
}

export async function DELETE(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.user.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  try {
    await deletePlayerAvatar({ playerId: id, actorId: session.user.id });
  } catch (e) {
    if (e instanceof PlayerNotFoundError) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    throw e;
  }
  return new NextResponse(null, { status: 204 });
}
```

- [ ] **Step 4: Run tests**

```
pnpm vitest run tests/integration/players-avatar.test.ts
pnpm tsc --noEmit
```

Expected: all admin describes green.

- [ ] **Step 5: Commit**

```
git add src/app/api/players/[id]/avatar/route.ts tests/integration/players-avatar.test.ts
git commit -m "feat(admin): add PUT/DELETE /api/players/[id]/avatar"
```

---

### Task 7: Serving GET route

**Files:**
- Modify: `src/app/api/players/[id]/avatar/route.ts` (add `GET`)
- Modify: `tests/integration/players-avatar.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `tests/integration/players-avatar.test.ts`:

```ts
import { GET as adminGet } from "@/app/api/players/[id]/avatar/route";

describe("GET /api/players/[id]/avatar", () => {
  beforeEach(resetDb);

  it("returns 404 when the player has no avatar", async () => {
    const me = await makePlayer("Me");
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await adminGet(
      new Request(`http://test/api/players/${me.id}/avatar`),
      { params: Promise.resolve({ id: me.id }) },
    );
    expect(res.status).toBe(404);
  });

  it("returns the bytes with Content-Type image/webp and an immutable Cache-Control", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, actorId: me.id, file: FIXTURE });
    authMock.mockResolvedValueOnce({ user: { id: me.id } });
    const res = await adminGet(
      new Request(`http://test/api/players/${me.id}/avatar`),
      { params: Promise.resolve({ id: me.id }) },
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toContain("immutable");
    expect(res.headers.get("etag")).toBe(`"${me.id}-1"`);
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.length).toBeGreaterThan(0);
  });

  it("returns 401 when not logged in", async () => {
    const me = await makePlayer("Me");
    await setPlayerAvatar({ playerId: me.id, actorId: me.id, file: FIXTURE });
    authMock.mockResolvedValueOnce(null);
    const res = await adminGet(
      new Request(`http://test/api/players/${me.id}/avatar`),
      { params: Promise.resolve({ id: me.id }) },
    );
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```
pnpm vitest run tests/integration/players-avatar.test.ts
```

Expected: new GET describes fail.

- [ ] **Step 3: Append `GET` to the route**

Append to `src/app/api/players/[id]/avatar/route.ts`:

```ts
import { getPlayerAvatar } from "@/lib/players/avatar";

export async function GET(_req: Request, ctx: RouteCtx) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const avatar = await getPlayerAvatar(id);
  if (!avatar) return new NextResponse(null, { status: 404 });
  return new NextResponse(avatar.data, {
    status: 200,
    headers: {
      "Content-Type": avatar.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${id}-${avatar.version}"`,
    },
  });
}
```

(Merge the imports at the top of the file — `getPlayerAvatar` joins the others.)

- [ ] **Step 4: Run tests**

```
pnpm vitest run tests/integration/players-avatar.test.ts
pnpm tsc --noEmit
```

Expected: all green.

- [ ] **Step 5: Commit**

```
git add src/app/api/players/[id]/avatar/route.ts tests/integration/players-avatar.test.ts
git commit -m "feat(avatar): add GET /api/players/[id]/avatar with cache headers"
```

---

### Task 8: Wire `<Avatar>` into TopNav, UserMenu, and the root layout

**Files:**
- Modify: `src/components/user-menu.tsx` — accept `playerId` + `avatarVersion` props
- Modify: `src/components/top-nav.tsx` — thread the new props through
- Modify: `src/app/layout.tsx` (or the layout that renders `<TopNav>`) — query `avatarVersion` for the session user and pass it

**Context:** `TopNav` is already rendered with `name` / `isAdmin` from a parent. Add two more props. The logged-in user's `avatarVersion` comes from a fresh Prisma read (not the session — the session is JWT-cached and lags behind uploads).

- [ ] **Step 1: Update `UserMenu` signature and render**

Replace the `UserMenu` signature and button body in `src/components/user-menu.tsx`:

```tsx
import { Avatar } from "@/components/ui/avatar";

export function UserMenu({
  playerId,
  name,
  avatarVersion,
}: {
  playerId: string;
  name: string;
  avatarVersion: number;
}) {
```

Replace the `<button>` inner `{initials(name)}` with `<Avatar playerId={playerId} name={name} avatarVersion={avatarVersion} size={40} />`. Remove the `initials` import — `<Avatar>` handles the fallback now.

- [ ] **Step 2: Update `TopNav` signature and forward the props**

Replace in `src/components/top-nav.tsx`:

```tsx
export function TopNav({
  isAdmin,
  name,
  playerId,
  avatarVersion,
}: {
  isAdmin: boolean;
  name: string;
  playerId: string;
  avatarVersion: number;
}) {
```

Replace `<UserMenu name={name} />` with `<UserMenu playerId={playerId} name={name} avatarVersion={avatarVersion} />`.

- [ ] **Step 3: Plumb from the layout**

Open `src/app/layout.tsx`. Locate the `<TopNav>` call. Add a Prisma read for the session user's `avatarVersion` before rendering, and pass it:

```tsx
import { prisma } from "@/lib/db";

// inside the server layout, after `const session = await auth();`:
let avatarVersion = 0;
if (session?.user?.id) {
  const row = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { avatarVersion: true },
  });
  avatarVersion = row?.avatarVersion ?? 0;
}

// …render:
<TopNav
  isAdmin={session.user.isAdmin}
  name={session.user.name}
  playerId={session.user.id}
  avatarVersion={avatarVersion}
/>
```

If `src/app/layout.tsx` does not match this shape, find the file that renders `<TopNav>` via `rg -n "<TopNav" src` and apply the same change there.

- [ ] **Step 4: Run full suite + typecheck**

```
pnpm tsc --noEmit
pnpm vitest run
```

Expected: all green. The `<Avatar>` unit tests and the rest of the suite must still pass.

- [ ] **Step 5: Commit**

```
git add src/components/user-menu.tsx src/components/top-nav.tsx src/app/layout.tsx
git commit -m "feat(nav): render Avatar in UserMenu with live avatarVersion"
```

---

### Task 9: Avatars on home page, ranking table, and finished summary

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/ranking-table.tsx`
- Modify: `src/lib/ranking/compute.ts`
- Modify: `src/app/game-day/finished-summary.tsx`
- Modify: `src/lib/game-day/summary.ts`

**Context:** Each surface that currently shows a player name gets a small Avatar next to it. Each surface needs `avatarVersion` in the data it already loads; extend the types and queries accordingly.

- [ ] **Step 1: Extend `RankingRow` and the ranking query**

In `src/lib/ranking/compute.ts`:

- Add `avatarVersion: number` to the `RankingRow` interface.
- In the raw SQL, add `p."avatarVersion"` to the inner `played` CTE's SELECT list — actually simpler: add it to the outer projection. Change the final SELECT/GROUP clause so `p."avatarVersion"` is selected and grouped, then mapped to `avatar_version`. The ORDER BY stays as-is.
- Add to the raw SQL's typed result shape: `avatar_version: number`.
- Map it out in the returned object: `avatarVersion: Number(r.avatar_version)`.

Exact edits:

Replace the raw-SQL result type:

```ts
const rows = await prisma.$queryRaw<
  Array<{
    player_id: string;
    player_name: string;
    avatar_version: number;
    games: bigint;
    points: number;
    jokers_used: bigint;
  }>
>`
```

Extend the SELECT list (both appearances):

```sql
SELECT
  p.id AS player_id,
  p.name AS player_name,
  p."avatarVersion" AS avatar_version,
  COALESCE(COUNT(played.points), 0)::bigint + COALESCE(j.games_credited, 0)::bigint AS games,
  ...
```

And in `GROUP BY`:

```sql
GROUP BY p.id, p.name, p."avatarVersion", j.games_credited, j.points_credited, j.jokers_used
```

Update the return mapping:

```ts
return rows.map((r, i) => {
  const games = Number(r.games);
  const points = Number(r.points);
  return {
    rank: i + 1,
    playerId: r.player_id,
    playerName: r.player_name,
    avatarVersion: Number(r.avatar_version),
    games,
    points,
    pointsPerGame: games === 0 ? 0 : points / games,
    jokersUsed: Number(r.jokers_used),
  };
});
```

- [ ] **Step 2: Render Avatar in `RankingTable`**

In `src/components/ranking-table.tsx`, update the grid template to insert an avatar column between the rank and the name, and wrap the list item:

```tsx
const GRID = "grid grid-cols-[2rem_2.5rem_1fr_3rem_3rem_2.25rem_2.25rem] items-center gap-2";
```

In the header row, add a blank cell between "Pos" and "Name":

```tsx
<span className="text-center">Pos</span>
<span aria-hidden="true" />
<span>Name</span>
```

In the list item, inject the avatar before the name span:

```tsx
import { Avatar } from "@/components/ui/avatar";

// inside the map:
<li key={r.playerId} className={`${GRID} px-3 py-3`}>
  <span className="text-center tabular-nums">…(existing rank/medal)…</span>
  <Avatar playerId={r.playerId} name={r.playerName} avatarVersion={r.avatarVersion} size={32} />
  <span className="truncate text-sm font-semibold text-foreground">{r.playerName}</span>
  …(rest unchanged)
</li>
```

- [ ] **Step 3: Extend `GameDaySummaryRow` + summary query**

In `src/lib/game-day/summary.ts`:

Add `avatarVersion: number` to `GameDaySummaryRow`. Extend the Player lookup to also select `avatarVersion`, and build a second map:

```ts
const players = playerIds.length
  ? await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { id: true, name: true, avatarVersion: true },
    })
  : [];
const nameById = new Map(players.map((p) => [p.id, p.name]));
const versionById = new Map(players.map((p) => [p.id, p.avatarVersion]));
```

Extend the row construction:

```ts
const rows: GameDaySummaryRow[] = playerIds.map((pid) => ({
  playerId: pid,
  playerName: nameById.get(pid) ?? "Unbekannt",
  avatarVersion: versionById.get(pid) ?? 0,
  points: totals.get(pid)!.points,
  matches: totals.get(pid)!.matches,
}));
```

- [ ] **Step 4: Render Avatars in `FinishedSummary`**

In `src/app/game-day/finished-summary.tsx`, import Avatar and insert it into each podium `<li>` and each table row (before the player name). Use `size={40}` for podium cards, `size={32}` for table rows. The summary already carries `avatarVersion` per row after Step 3.

Example podium change:

```tsx
<li key={row.playerId} className={`flex items-center gap-3 rounded-xl border border-border p-3 ${style.badge}`}>
  <span className="text-2xl" role="img" aria-label={style.rankLabel}>{style.medal}</span>
  <Avatar playerId={row.playerId} name={row.playerName} avatarVersion={row.avatarVersion} size={40} />
  <div className="min-w-0 flex-1">
    <div className="truncate text-sm font-semibold text-foreground">{row.playerName}</div>
    …
  </div>
  …
</li>
```

Table row change — add a cell before the name:

```tsx
<tr key={row.playerId} className="border-t border-border">
  <td className="py-1.5 pr-2 tabular-nums text-foreground-muted">…</td>
  <td className="py-1.5 pr-2 text-foreground">
    <span className="flex items-center gap-2">
      <Avatar playerId={row.playerId} name={row.playerName} avatarVersion={row.avatarVersion} size={32} />
      <span className="block truncate">{row.playerName}</span>
    </span>
  </td>
  …
</tr>
```

- [ ] **Step 5: Home page call sites**

In `src/app/page.tsx`:

(a) Add an Avatar next to the greeting. Query the session user's `avatarVersion` once at the top of the page (the page already doesn't know it — add a small Prisma read). Then render:

```tsx
import { Avatar } from "@/components/ui/avatar";
import { prisma } from "@/lib/db";

// inside DashboardPage, after `const session = await auth();` and before `Promise.all`:
const me = await prisma.player.findUnique({
  where: { id: session.user.id },
  select: { avatarVersion: true },
});
const meAvatarVersion = me?.avatarVersion ?? 0;

// Replace the existing header:
<header className="flex items-center gap-3">
  <Avatar
    playerId={session.user.id}
    name={session.user.name}
    avatarVersion={meAvatarVersion}
    size={48}
  />
  <div>
    <h1 className="text-2xl font-bold text-foreground">
      Hi{firstName ? `, ${firstName}` : ""}
    </h1>
    <p className="mt-0.5 text-sm text-foreground-muted">{subtitle}</p>
  </div>
</header>
```

(b) Top-3 ranking list: each `<li>` gets a 32-px Avatar between the rank number and the name span:

```tsx
<li key={r.playerId} className="flex items-center gap-3 py-1 text-sm">
  <span className="w-5 text-right font-extrabold text-primary">{r.rank}</span>
  <Avatar playerId={r.playerId} name={r.playerName} avatarVersion={r.avatarVersion} size={32} />
  <span className="flex-1 font-semibold text-foreground">{r.playerName}</span>
  <span className="font-semibold tabular-nums text-foreground-muted">
    {r.pointsPerGame.toFixed(2)}
  </span>
</li>
```

(c) Teamwork cards: `bestPartner` / `worstPartner`. These currently show only a name string; we need the partner's `playerId` + `avatarVersion`. Extend `PartnerStat` in `src/lib/player/season-stats.ts`:

```ts
export interface PartnerStat {
  playerId: string;
  name: string;
  avatarVersion: number;
  pointsTogether: number;
  matches: number;
}
```

Update the `partnerNames` select to include `avatarVersion`, populate a `versionById` map, and include `playerId` + `avatarVersion` in the constructed `partners` rows. Strip only nothing extra from the returned stat — the page consumes the full shape now.

In `src/app/page.tsx` teamwork block, add an Avatar before the name:

```tsx
<div className="mt-1 flex items-center gap-2">
  <Avatar
    playerId={stats.bestPartner.playerId}
    name={stats.bestPartner.name}
    avatarVersion={stats.bestPartner.avatarVersion}
    size={32}
  />
  <span className="font-bold text-foreground">{stats.bestPartner.name}</span>
</div>
```

Same treatment for `worstPartner`.

- [ ] **Step 6: Full typecheck + tests**

```
pnpm tsc --noEmit
pnpm vitest run
```

Expected: all green. If a test for `computePlayerSeasonStats` or `computeRanking` fails because of the shape change, add `avatarVersion` / `playerId` to the expected fixtures in that test — the fields are now part of the public contract.

- [ ] **Step 7: Commit**

```
git add src/app/page.tsx src/components/ranking-table.tsx src/lib/ranking/compute.ts src/app/game-day/finished-summary.tsx src/lib/game-day/summary.ts src/lib/player/season-stats.ts
git commit -m "feat(ui): render Avatar in home, ranking, podium, teamwork"
```

---

### Task 10: `/profil` uploader + admin dialog

**Files:**
- Create: `src/app/profil/avatar-uploader.tsx`
- Create: `src/app/admin/avatar-dialog.tsx`
- Modify: `src/app/profil/page.tsx`
- Modify: `src/app/admin/players-section.tsx`

**Context:** Two client forms, both wrap a file input and hit the matching POST/DELETE endpoint. They share no logic beyond being simple forms — keep them separate per YAGNI.

- [ ] **Step 1: Create `<AvatarUploader>` (self-service)**

Create `src/app/profil/avatar-uploader.tsx`:

```tsx
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function AvatarUploader({
  playerId,
  name,
  avatarVersion,
}: {
  playerId: string;
  name: string;
  avatarVersion: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setStatus({ kind: "error", message: "Datei ist größer als 5 MB." });
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setStatus({ kind: "idle" });
  }

  async function onUpload() {
    if (!file) return;
    setStatus({ kind: "submitting" });
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/profile/avatar", { method: "POST", body });
    if (res.ok) {
      setStatus({ kind: "success" });
      setFile(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
      return;
    }
    const errBody = (await res.json().catch(() => ({}))) as { error?: string };
    if (errBody.error === "file_too_large") {
      setStatus({ kind: "error", message: "Datei ist größer als 5 MB." });
    } else if (errBody.error === "invalid_image") {
      setStatus({ kind: "error", message: "Kein gültiges Bild." });
    } else {
      setStatus({ kind: "error", message: "Hochladen fehlgeschlagen." });
    }
  }

  async function onRemove() {
    setStatus({ kind: "submitting" });
    const res = await fetch("/api/profile/avatar", { method: "DELETE" });
    if (res.ok) {
      setStatus({ kind: "success" });
      router.refresh();
      return;
    }
    setStatus({ kind: "error", message: "Entfernen fehlgeschlagen." });
  }

  const submitting = status.kind === "submitting";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="Vorschau"
            className="h-24 w-24 shrink-0 rounded-full object-cover"
          />
        ) : (
          <Avatar playerId={playerId} name={name} avatarVersion={avatarVersion} size={96} />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPick}
          className="text-sm text-foreground-muted file:mr-3 file:rounded-xl file:border file:border-border-strong file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:text-foreground"
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
          Gespeichert.
        </p>
      )}
      <div className="flex justify-end gap-2">
        {avatarVersion > 0 && !file && (
          <Button variant="ghost" onClick={onRemove} disabled={submitting}>
            Entfernen
          </Button>
        )}
        <Button onClick={onUpload} disabled={!file} loading={submitting}>
          Speichern
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mount the uploader on `/profil`**

Edit `src/app/profil/page.tsx`:

```tsx
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { Card, CardBody } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";
import { AvatarUploader } from "./avatar-uploader";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session) redirect("/login");

  const me = await prisma.player.findUnique({
    where: { id: session.user.id },
    select: { avatarVersion: true },
  });
  const avatarVersion = me?.avatarVersion ?? 0;

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
          <h2 className="text-base font-semibold text-foreground">Avatar</h2>
          <AvatarUploader
            playerId={session.user.id}
            name={session.user.name}
            avatarVersion={avatarVersion}
          />
        </CardBody>
      </Card>

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

- [ ] **Step 3: Create `<AvatarDialog>` (admin override)**

Create `src/app/admin/avatar-dialog.tsx`:

```tsx
"use client";
import { useRef, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";

export function AvatarDialog({
  open,
  onClose,
  playerId,
  playerName,
  avatarVersion,
}: {
  open: boolean;
  onClose: () => void;
  playerId: string | null;
  playerName: string | null;
  avatarVersion: number;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setError(null);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [open, previewUrl]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (!f) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Datei ist größer als 5 MB.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setError(null);
  }

  async function onUpload() {
    if (!file || !playerId) return;
    setLoading(true);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    const res = await fetch(`/api/players/${playerId}/avatar`, { method: "PUT", body });
    setLoading(false);
    if (!res.ok) {
      setError("Hochladen fehlgeschlagen.");
      return;
    }
    onClose();
    router.refresh();
  }

  async function onRemove() {
    if (!playerId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/players/${playerId}/avatar`, { method: "DELETE" });
    setLoading(false);
    if (!res.ok) {
      setError("Entfernen fehlgeschlagen.");
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Avatar — ${playerName ?? ""}`}
    >
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Vorschau"
              className="h-24 w-24 shrink-0 rounded-full object-cover"
            />
          ) : playerId ? (
            <Avatar
              playerId={playerId}
              name={playerName ?? ""}
              avatarVersion={avatarVersion}
              size={96}
            />
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPick}
            className="text-sm text-foreground-muted file:mr-3 file:rounded-xl file:border file:border-border-strong file:bg-surface-muted file:px-3 file:py-2 file:text-sm file:text-foreground"
          />
        </div>
        {error && (
          <p className="rounded-xl bg-surface-muted px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {avatarVersion > 0 && !file && (
            <Button variant="ghost" onClick={onRemove} disabled={loading}>
              Entfernen
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
            Abbrechen
          </Button>
          <Button onClick={onUpload} disabled={!file} loading={loading}>
            Speichern
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
```

- [ ] **Step 4: Wire the "Avatar" button into `PlayersSection`**

In `src/app/admin/players-section.tsx`:

Extend `PlayerRow`:

```ts
export interface PlayerRow {
  id: string;
  name: string;
  email: string;
  username: string | null;
  isAdmin: boolean;
  hasPassword: boolean;
  avatarVersion: number;
}
```

Add state + button + dialog. Import: `import { AvatarDialog } from "./avatar-dialog";`. Add next to the existing state:

```tsx
const [avatarFor, setAvatarFor] = useState<PlayerRow | null>(null);
```

Add a button to the row's action cluster (near the "Passwort" button):

```tsx
<Button variant="ghost" size="sm" onClick={() => setAvatarFor(p)}>
  Avatar
</Button>
```

Mount the dialog at the bottom of the Card (next to `ResetPasswordDialog`):

```tsx
<AvatarDialog
  open={avatarFor !== null}
  onClose={() => setAvatarFor(null)}
  playerId={avatarFor?.id ?? null}
  playerName={avatarFor?.name ?? null}
  avatarVersion={avatarFor?.avatarVersion ?? 0}
/>
```

In `src/app/admin/page.tsx`, extend the `playersForUi` projection to include `avatarVersion`:

```tsx
const playersForUi = players.map((p) => ({
  id: p.id,
  name: p.name,
  email: p.email,
  username: p.username,
  isAdmin: p.isAdmin,
  hasPassword: p.passwordHash !== null,
  avatarVersion: p.avatarVersion,
}));
```

And add `avatarVersion: true` to the `select` of the `prisma.player.findMany` at the top of the file.

- [ ] **Step 5: Run full suite + typecheck**

```
pnpm tsc --noEmit
pnpm vitest run
```

Expected: all green.

- [ ] **Step 6: Commit**

```
git add src/app/profil/avatar-uploader.tsx src/app/profil/page.tsx src/app/admin/avatar-dialog.tsx src/app/admin/players-section.tsx src/app/admin/page.tsx
git commit -m "feat(avatar): add upload UX on /profil and admin override dialog"
```

---

## Final Verification Gate

Parallel fan-out on the full branch diff:

- `reviewer` — auth/session correctness on all four endpoints, upload-path security (MIME sniffing, sharp behaviour on malformed inputs, EXIF stripping, bytea size runaway), caching headers and etag safety, no leaking of internal error details
- `test-engineer` — coverage around the 5 MB cap edges, caching headers, admin-vs-self permission boundaries, transaction rollback on audit-log failure
- `refactor-cleanup` — duplication between the self-service and admin routes, duplication between uploader and dialog, opportunity to extract a shared upload helper — flag but mark "opportunistic" unless it crosses a threshold
- `commit-guard` — secret/debug/leftover sweep across all 10 commits

Fix critical/important findings (skip opportunistic ones per CLAUDE.md), then open PR C.

---

## Self-review notes (author)

- All 10 tasks cover every requirement in the spec: migration, sharp install, service, four API routes (POST/DELETE self, PUT/DELETE/GET admin), `<Avatar>` component with initials fallback, initials extraction, session-independent `avatarVersion` plumbing, five UI call sites, `/profil` form, admin dialog, audit log with admin actorId.
- Types stay consistent: `RankingRow` and `GameDaySummaryRow` both gain `avatarVersion: number`; `PartnerStat` gains `playerId` + `avatarVersion`. The `<Avatar>` prop shape (`playerId`, `name`, `avatarVersion`) is used identically at every call site.
- The session is NOT augmented with `avatarVersion` (contrary to an earlier thought in the spec) because JWT caching would lag uploads; each server-component surface reads `avatarVersion` from Prisma. The spec mentioned a session path in its "Frontend" section — that path is superseded here. Noted for post-merge docs cleanup: tighten the spec paragraph referencing `session.user.avatarVersion` to match this approach.
