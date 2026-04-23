# Avatar Upload + Header Integration — Design

**Status:** Approved 2026-04-23. Supersedes the PR-C sketch in the Home v2 roadmap.

**Goal:** Let any player (self-service) and any admin (override) upload, replace, or remove a player's avatar. Display the avatar everywhere a player is shown, with initials as the fallback.

**Non-goals:** client-side cropping UI, user-selectable crop position, animated image formats, WebP fallback for legacy browsers, bulk import/backfill of avatars.

## Architecture

Multipart upload → size/content sniff → `sharp` center-crop to 256×256 WebP (EXIF stripped) → store as bytea on `Player` → serve through a route handler with an `avatarVersion` cache-bust → render through a shared `<Avatar>` component that falls back to initials.

Single moving part beyond the existing stack: add `sharp` as a dependency. Storage reuses the existing nightly `pg_dump`; no systemd or ops changes.

## Data Model

Prisma migration on `Player`:

```prisma
model Player {
  // existing fields
  avatarData      Bytes?
  avatarMimeType  String?
  avatarVersion   Int      @default(0)
}
```

- `avatarData` — canonical WebP bytes (~10–25 KB per player). Null when no avatar is set.
- `avatarMimeType` — always `"image/webp"` post-processing; explicit for forward flexibility and to avoid hard-coding the response header.
- `avatarVersion` — monotonic counter, incremented on every `setPlayerAvatar` and `deletePlayerAvatar`. Starts at `0`. Used as the cache-bust query parameter. Presence of an avatar is decided by `avatarData !== null` alone; the version says "this is a new URL", not "an avatar exists".

Audit log: new action `player.avatar_change`, payload `{ action: "upload" | "delete" }`. Admin overrides use `actorId = session.user.id` (admin), `entityId = targetPlayerId`. Self-service uses `actorId === entityId === session.user.id`.

## Service Layer

`src/lib/players/avatar.ts` exports three pure, DB-only functions:

```ts
setPlayerAvatar(input: { playerId: string; file: Buffer }): Promise<void>
deletePlayerAvatar(input: { playerId: string }): Promise<void>
getPlayerAvatar(playerId: string): Promise<{
  data: Buffer;
  mimeType: string;
  version: number;
} | null>
```

Typed errors (same pattern as `change-password.ts`): `PlayerNotFoundError`, `FileTooLargeError`, `InvalidImageError`.

### `setPlayerAvatar` flow

1. Guard: reject buffer larger than 5 MB with `FileTooLargeError`.
2. `sharp(buffer).metadata()` — throws if the bytes are not a real image; caught and re-thrown as `InvalidImageError`. This is a content sniff, not a MIME-header check; clients cannot bypass it by lying about `Content-Type`.
3. Process: `sharp(buffer).rotate().resize(256, 256, { fit: "cover", position: "centre" }).webp({ quality: 85 }).toBuffer()`. `.rotate()` normalises EXIF orientation so portrait-mode phone photos display upright. `fit: "cover"` center-crops. EXIF is stripped by sharp's WebP encoder.
4. Resolve the target: `prisma.player.findUnique({ where: { id: playerId }, select: { id: true, deletedAt: true } })`. If the row is missing or `deletedAt` is set, throw `PlayerNotFoundError` (same pre-check pattern as `change-password.ts`).
5. Single transaction: `player.update({ where: { id: playerId }, data: { avatarData, avatarMimeType: "image/webp", avatarVersion: { increment: 1 } } })` + `auditLog.create({ action: "player.avatar_change", payload: { action: "upload" } })`.

### `deletePlayerAvatar` flow

Transaction: clear `avatarData` and `avatarMimeType` to null, increment `avatarVersion`, write audit log with `payload.action = "delete"`. Raising `avatarVersion` on delete keeps any cached image URL from serving the old bytes (the client won't ask for the incremented version once it learns the avatar is gone, but the bump is cheap insurance against races).

### `getPlayerAvatar`

Plain read. Returns `null` when `avatarData` is null or the player is soft-deleted.

## API Routes

### Self-service

- `POST /api/profile/avatar` — `multipart/form-data` with one field `file`. Reads `session.user.id`, delegates to `setPlayerAvatar`.
- `DELETE /api/profile/avatar` — delegates to `deletePlayerAvatar` with `session.user.id`.

### Admin override

- `PUT /api/players/[id]/avatar` — admin-only (`session.user.isAdmin` check). Same multipart shape. Delegates with the URL-provided `playerId`.
- `DELETE /api/players/[id]/avatar` — admin-only. Delegates.

### Serving

- `GET /api/players/[id]/avatar` — auth required (middleware already gates `/api/*` for logged-in users). Returns `avatarData` with:
  - `Content-Type: image/webp`
  - `Cache-Control: public, max-age=31536000, immutable`
  - `ETag: "{playerId}-{avatarVersion}"`
  - `404` if the player has no avatar.

### Error → HTTP

| Error                     | Status | Response body                    |
|---------------------------|--------|----------------------------------|
| No session                | 401    | `{ error: "unauthorized" }`      |
| Non-admin on admin route  | 403    | `{ error: "forbidden" }`         |
| `PlayerNotFoundError`     | 404    | `{ error: "not_found" }`         |
| Missing / malformed file  | 400    | `{ error: "invalid" }`           |
| `InvalidImageError`       | 400    | `{ error: "invalid_image" }`     |
| `FileTooLargeError`       | 413    | `{ error: "file_too_large" }`    |

The `1 MB` server-action body limit in `next.config.ts` does not apply to route handlers; the 5 MB guard lives in the service. The route also inspects `Content-Length` before buffering the body and returns 413 early when it exceeds 5 MB, but the service-level check is the source of truth since `Content-Length` is client-supplied and can lie.

## Frontend

### `<Avatar>` component

`src/components/ui/avatar.tsx` — one shared component, used by every call site:

```tsx
<Avatar
  playerId={string}
  name={string}
  avatarVersion={number}
  size={32 | 40 | 48 | 64 | 96}
/>
```

- When `avatarVersion === 0` or missing, render the existing initials circle (same colour tokens as the current `UserMenu`).
- Otherwise, render `<img src={\`/api/players/${playerId}/avatar?v=${avatarVersion}\`} alt={name} loading="lazy" />` inside the rounded-full frame, sized per the `size` prop.
- The `initials()` helper currently inline in `src/components/user-menu.tsx` moves to `src/lib/player/initials.ts` so `<Avatar>` and `UserMenu` share one implementation.

### Call sites wired in this PR

1. `src/components/user-menu.tsx` — the always-visible dropdown trigger.
2. Home page header next to "Hi, {firstName}" (`src/app/page.tsx`).
3. Ranking list rows (`src/app/ranking/*`).
4. Podium cards in `src/app/game-day/finished-summary.tsx`.
5. Teamwork/chemistry pair cards on the home page.

Each call site already has the player object in scope; it needs `avatarVersion` added to the Prisma select.

The home header's Avatar reads `session.user.avatarVersion`, which is added to the existing `Session.user` module augmentation in `src/auth.ts` and populated in the NextAuth session callback.

### `/profil` upload UX

Expanded below the existing password-change card:

- Large `<Avatar size={96}>` preview of the current state.
- File input `<input type="file" accept="image/*">`. On change, client validates size (< 5 MB) and previews via `URL.createObjectURL`.
- "Speichern" submits `FormData` to `POST /api/profile/avatar`. Success returns `200 { version }`; the client calls `router.refresh()` so the server components pick up the new `avatarVersion` (including the session).
- "Entfernen" shows only when the current `avatarVersion > 0`; sends `DELETE`.
- Status messages use the same role="alert" / role="status" pattern as the password form.

### Admin override UX

Each admin player row gets an "Avatar" button next to the existing password-reset action. Opens the inline `/profil`-style upload inside the row (or a small dialog; matches whatever pattern the existing admin actions use).

## Testing

`tests/integration/players-avatar.test.ts` covers:

- **Service:** set happy path + version increments, set rejects >5 MB, set rejects non-image buffer, delete clears data + bumps version, delete writes audit log with `action: "delete"`, set writes audit log with `action: "upload"`, soft-deleted player throws `PlayerNotFoundError`.
- **Self-service API:** 401 without session, 400 when file is missing or malformed, 413 on >5 MB, 400 on non-image, 200 on happy path with stored bytes WebP-valid, DELETE clears the row.
- **Admin API:** 401 / 403 boundaries, 404 for unknown player, happy path updates target player's avatar, actor vs. entity split recorded correctly in audit log.
- **Serving:** returns correct bytes, correct `Content-Type`, 404 when unset, `Cache-Control` header present.

Unit test: `initials()` after extraction to `src/lib/player/initials.ts`.

Skip: RTL component tests for the form — consistent with the existing project pattern (integration-test heavy, no client-fetch component tests).

## Dependencies

Add `sharp` (`^0.33.x` or current). It ships prebuilt native binaries for Linux x64 (matches the Debian VPS); no compile step on the server. The `deploy.sh` / `pnpm install --frozen-lockfile` path picks it up automatically. `node_modules` size grows by ~50 MB.

## Migration Path

Single Prisma migration `add_player_avatar`. All existing players start with `avatarVersion = 0`, `avatarData = null`, `avatarMimeType = null` — equivalent to "no avatar", so every current surface keeps rendering initials until someone uploads.

## Rollout

This is PR C. Merged → deployed by the standard `deploy.sh` runbook. Users see the new upload UI on `/profil` immediately; no config toggle.
