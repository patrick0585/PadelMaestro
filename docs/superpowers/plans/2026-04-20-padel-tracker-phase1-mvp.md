# Padel Tracker — Phase 1 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user Padel tracking web application that replaces the group's paper scoresheets and XLSX ranking. MVP is the full webapp without Telegram integration: invitation-based login, attendance coordination, balanced pairing generation for 4/5/6 players, match score entry, Joker mechanic, and live season ranking.

**Architecture:** Single Next.js 15 monolith (App Router) serving UI and REST API. PostgreSQL 16 for persistence via Prisma. Auth.js v5 with credentials provider. Deployed later to Ubuntu VPS via Docker Compose.

**Tech Stack:**
- Next.js 15 + React 19 + TypeScript (strict)
- Tailwind CSS 4 + shadcn/ui
- Prisma 6 + PostgreSQL 16
- Auth.js v5 (next-auth@beta) + bcryptjs
- Vitest 2 for unit/integration tests
- pnpm as package manager
- Docker Compose for local Postgres

**Reference:** see `docs/superpowers/specs/2026-04-20-padel-tracker-design.md` for the design spec.

---

## File Structure (end state of Phase 1)

```
padel-tracker/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── vitest.config.ts
├── .env.example
├── .env                          # gitignored
├── docker-compose.dev.yml
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx              # redirect to /ranking or /login
│   │   ├── login/page.tsx
│   │   ├── invite/[token]/page.tsx
│   │   ├── ranking/page.tsx
│   │   ├── game-day/page.tsx
│   │   ├── admin/page.tsx
│   │   ├── globals.css
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── invitations/route.ts
│   │       ├── invitations/[token]/route.ts
│   │       ├── game-days/route.ts
│   │       ├── game-days/[id]/attendance/route.ts
│   │       ├── game-days/[id]/start/route.ts
│   │       ├── matches/[id]/route.ts
│   │       ├── matches/[id]/undo/route.ts
│   │       ├── jokers/route.ts
│   │       └── ranking/route.ts
│   ├── auth.ts                   # Auth.js v5 config
│   ├── middleware.ts
│   ├── lib/
│   │   ├── db.ts                 # Prisma client singleton
│   │   ├── auth/
│   │   │   ├── hash.ts
│   │   │   └── token.ts
│   │   ├── pairings/
│   │   │   ├── templates/
│   │   │   │   ├── 4-players.json
│   │   │   │   ├── 5-players.json
│   │   │   │   └── 6-players.json
│   │   │   ├── load.ts
│   │   │   ├── shuffle.ts
│   │   │   └── assign.ts
│   │   ├── season.ts
│   │   ├── game-day/
│   │   │   ├── create.ts
│   │   │   └── lock.ts
│   │   ├── match/
│   │   │   ├── validate.ts
│   │   │   └── enter-score.ts
│   │   ├── joker/use.ts
│   │   └── ranking/compute.ts
│   └── components/
│       ├── ui/                   # shadcn generated components
│       ├── ranking-table.tsx
│       ├── match-card.tsx
│       ├── score-input-dialog.tsx
│       └── attendance-widget.tsx
├── tests/
│   ├── unit/
│   │   ├── pairings/
│   │   ├── match/
│   │   ├── joker/
│   │   ├── ranking/
│   │   └── auth/
│   └── integration/
│       └── game-day-lifecycle.test.ts
└── scripts/
    └── import-historical.ts
```

---

## Conventions

- **pnpm** for all package operations
- **Imports**: use `@/` alias for `src/`
- **Test location**: `tests/unit/...` mirrors `src/lib/...`
- **Commit style**: conventional commits (`feat:`, `test:`, `chore:`, `fix:`, `docs:`)
- **After every task**: `pnpm test` must pass before the commit

---

## Task 1: Project scaffolding + dependencies

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `.gitignore` (already exists; extend if needed)

- [ ] **Step 1: Initialize package.json**

Run:
```bash
pnpm init
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
pnpm add next@15 react@19 react-dom@19
pnpm add @prisma/client@6
pnpm add next-auth@beta @auth/prisma-adapter
pnpm add bcryptjs
pnpm add zod
pnpm add date-fns
pnpm add clsx tailwind-merge class-variance-authority
pnpm add lucide-react

pnpm add -D typescript @types/react @types/react-dom @types/node @types/bcryptjs
pnpm add -D prisma@6
pnpm add -D vitest @vitest/ui @vitejs/plugin-react
pnpm add -D @testing-library/react @testing-library/jest-dom jsdom
pnpm add -D tsx
pnpm add -D eslint eslint-config-next
pnpm add -D prettier
pnpm add -D tailwindcss@latest postcss autoprefixer
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `next.config.ts`**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "1mb",
    },
  },
};

export default nextConfig;
```

- [ ] **Step 5: Update `package.json` scripts**

Edit `package.json` scripts section to:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:reset": "prisma migrate reset"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml tsconfig.json next.config.ts
git commit -m "chore: initialize Next.js 15 + TypeScript project with core dependencies"
```

---

## Task 2: Vitest + ESLint + Prettier setup

**Files:**
- Create: `vitest.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `tests/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Create `eslint.config.mjs`**

```javascript
import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
];
```

- [ ] **Step 4: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 5: Verify test infrastructure**

Create `tests/unit/sanity.test.ts`:
```typescript
import { describe, it, expect } from "vitest";

describe("sanity", () => {
  it("adds 1 + 1", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run:
```bash
pnpm test
```

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts eslint.config.mjs .prettierrc.json tests/setup.ts tests/unit/sanity.test.ts
git commit -m "chore: add Vitest, ESLint, Prettier configuration"
```

---

## Task 3: Tailwind CSS 4 + shadcn/ui setup

**Files:**
- Create: `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Install Tailwind PostCSS plugin**

Run:
```bash
pnpm add -D @tailwindcss/postcss
```

- [ ] **Step 2: Create `postcss.config.mjs`**

```javascript
const config = {
  plugins: ["@tailwindcss/postcss"],
};
export default config;
```

- [ ] **Step 3: Create `tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 4: Create `src/app/globals.css`**

```css
@import "tailwindcss";

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --primary: 240 5.9% 10%;
  --primary-foreground: 0 0% 98%;
  --destructive: 0 84.2% 60.2%;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --border: 240 3.7% 15.9%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --destructive: 0 62.8% 30.6%;
  }
}

body {
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
```

- [ ] **Step 5: Create `src/app/layout.tsx`**

```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Padel Tracker",
  description: "Paarungen und Rangliste für unsere Padel-Gruppe",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: Create `src/app/page.tsx`**

```typescript
export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <h1 className="text-2xl font-semibold">Padel Tracker</h1>
    </main>
  );
}
```

- [ ] **Step 7: Verify build**

Run:
```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add tailwind.config.ts postcss.config.mjs src/
git commit -m "feat: add Tailwind CSS and root layout scaffolding"
```

---

## Task 4: Docker Compose for local Postgres

**Files:**
- Create: `docker-compose.dev.yml`, `.env.example`, `.env`

- [ ] **Step 1: Create `docker-compose.dev.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: padel-tracker-db
    restart: unless-stopped
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: padel
      POSTGRES_PASSWORD: padel_dev_password
      POSTGRES_DB: padel_tracker
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U padel"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
```

- [ ] **Step 2: Create `.env.example`**

```bash
DATABASE_URL="postgresql://padel:padel_dev_password@localhost:5433/padel_tracker?schema=public"
AUTH_SECRET="replace-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"
```

- [ ] **Step 3: Create `.env` (gitignored)**

```bash
DATABASE_URL="postgresql://padel:padel_dev_password@localhost:5433/padel_tracker?schema=public"
AUTH_SECRET="dev-secret-replace-me-with-openssl-rand-base64-32"
AUTH_URL="http://localhost:3000"
```

- [ ] **Step 4: Start DB and verify**

Run:
```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml ps
```

Expected: `padel-tracker-db` status is `healthy`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.dev.yml .env.example
git commit -m "chore: add Docker Compose for local Postgres"
```

---

## Task 5: Prisma schema (all entities)

**Files:**
- Create: `prisma/schema.prisma`

- [ ] **Step 1: Initialize Prisma**

Run:
```bash
pnpm prisma init --datasource-provider postgresql
```

This creates `prisma/schema.prisma` and updates `.env` (reconfirm DATABASE_URL if overwritten).

- [ ] **Step 2: Replace `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Player {
  id             String    @id @default(uuid())
  name           String
  email          String    @unique
  passwordHash   String?
  telegramId     BigInt?   @unique
  isAdmin        Boolean   @default(false)
  invitedAt      DateTime  @default(now())
  deletedAt      DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  invitationsSent Invitation[] @relation("InvitedBy")
  participations  GameDayParticipant[]
  matchesScored   Match[]      @relation("ScoredBy")
  jokersUsed      JokerUse[]
  auditLogs       AuditLog[]

  // All four player slots of a Match can reference a Player
  matchT1A Match[] @relation("MatchT1A")
  matchT1B Match[] @relation("MatchT1B")
  matchT2A Match[] @relation("MatchT2A")
  matchT2B Match[] @relation("MatchT2B")

  @@index([email])
  @@index([deletedAt])
}

model Season {
  id        String   @id @default(uuid())
  year      Int      @unique
  startDate DateTime @db.Date
  endDate   DateTime @db.Date
  isActive  Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  gameDays   GameDay[]
  jokerUses  JokerUse[]
}

enum GameDayStatus {
  planned
  roster_locked
  in_progress
  finished
}

model GameDay {
  id           String        @id @default(uuid())
  seasonId     String
  date         DateTime      @db.Date
  playerCount  Int?
  status       GameDayStatus @default(planned)
  seed         String?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  season       Season        @relation(fields: [seasonId], references: [id])
  participants GameDayParticipant[]
  matches      Match[]
  jokers       JokerUse[]

  @@index([seasonId, date])
}

enum AttendanceStatus {
  pending
  confirmed
  declined
  joker
}

model GameDayParticipant {
  id          String            @id @default(uuid())
  gameDayId   String
  playerId    String
  attendance  AttendanceStatus  @default(pending)
  respondedAt DateTime?
  createdAt   DateTime          @default(now())

  gameDay GameDay @relation(fields: [gameDayId], references: [id], onDelete: Cascade)
  player  Player  @relation(fields: [playerId], references: [id])

  @@unique([gameDayId, playerId])
  @@index([playerId])
}

model Match {
  id            String    @id @default(uuid())
  gameDayId     String
  matchNumber   Int
  team1PlayerAId String
  team1PlayerBId String
  team2PlayerAId String
  team2PlayerBId String
  team1Score    Int?
  team2Score    Int?
  scoredById    String?
  scoredAt      DateTime?
  version       Int       @default(0)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  gameDay      GameDay @relation(fields: [gameDayId], references: [id], onDelete: Cascade)
  team1PlayerA Player  @relation("MatchT1A", fields: [team1PlayerAId], references: [id])
  team1PlayerB Player  @relation("MatchT1B", fields: [team1PlayerBId], references: [id])
  team2PlayerA Player  @relation("MatchT2A", fields: [team2PlayerAId], references: [id])
  team2PlayerB Player  @relation("MatchT2B", fields: [team2PlayerBId], references: [id])
  scoredBy     Player? @relation("ScoredBy", fields: [scoredById], references: [id])

  @@unique([gameDayId, matchNumber])
  @@index([gameDayId])
}

model JokerUse {
  id             String   @id @default(uuid())
  playerId       String
  seasonId       String
  gameDayId      String
  ppgAtUse       Decimal  @db.Decimal(5, 3)
  gamesCredited  Int      @default(10)
  pointsCredited Decimal  @db.Decimal(6, 2)
  createdAt      DateTime @default(now())

  player  Player  @relation(fields: [playerId], references: [id])
  season  Season  @relation(fields: [seasonId], references: [id])
  gameDay GameDay @relation(fields: [gameDayId], references: [id])

  @@unique([playerId, seasonId, gameDayId])
  @@index([seasonId, playerId])
}

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

model AuditLog {
  id         String   @id @default(uuid())
  actorId    String
  action     String
  entityType String
  entityId   String
  payload    Json?
  createdAt  DateTime @default(now())

  actor Player @relation(fields: [actorId], references: [id])

  @@index([actorId])
  @@index([entityType, entityId])
}
```

- [ ] **Step 3: Run first migration**

Run:
```bash
pnpm prisma migrate dev --name init
```

Expected: migration applies successfully, Prisma client is generated.

- [ ] **Step 4: Commit**

```bash
git add prisma/ .env.example
git commit -m "feat(db): add Prisma schema with all core entities"
```

---

## Task 6: Prisma client singleton + DB health check

**Files:**
- Create: `src/lib/db.ts`
- Create: `tests/unit/db.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/db.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/db";

describe("db client", () => {
  it("exports a singleton Prisma client", async () => {
    expect(prisma).toBeDefined();
    expect(typeof prisma.$connect).toBe("function");
  });
});
```

Run: `pnpm test tests/unit/db.test.ts`

Expected: fails with `Cannot find module '@/lib/db'`.

- [ ] **Step 2: Create `src/lib/db.ts`**

```typescript
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaGlobal = prisma;
}
```

- [ ] **Step 3: Verify test passes**

Run: `pnpm test tests/unit/db.test.ts`

Expected: test passes.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts tests/unit/db.test.ts
git commit -m "feat(db): add Prisma client singleton"
```

---

## Task 7: Password hashing utility

**Files:**
- Create: `src/lib/auth/hash.ts`
- Create: `tests/unit/auth/hash.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/auth/hash.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/hash";

describe("password hashing", () => {
  it("hashes a password to a non-empty string distinct from the input", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toBeTruthy();
    expect(hash).not.toBe("correct horse battery staple");
    expect(hash.length).toBeGreaterThan(20);
  });

  it("produces different hashes for the same password (salt)", async () => {
    const a = await hashPassword("same");
    const b = await hashPassword("same");
    expect(a).not.toBe(b);
  });

  it("verifies a correct password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("secret123", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("secret123");
    expect(await verifyPassword("wrong", hash)).toBe(false);
  });
});
```

Run: `pnpm test tests/unit/auth/hash.test.ts`

Expected: fails with missing module.

- [ ] **Step 2: Implement `src/lib/auth/hash.ts`**

```typescript
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/auth/hash.test.ts`

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/hash.ts tests/unit/auth/hash.test.ts
git commit -m "feat(auth): add bcrypt password hashing utility"
```

---

## Task 8: Invitation token utility

**Files:**
- Create: `src/lib/auth/token.ts`
- Create: `tests/unit/auth/token.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/auth/token.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { generateInvitationToken, isTokenExpired } from "@/lib/auth/token";

describe("invitation token", () => {
  it("generates a URL-safe token of at least 32 characters", () => {
    const token = generateInvitationToken();
    expect(token.length).toBeGreaterThanOrEqual(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates unique tokens", () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) tokens.add(generateInvitationToken());
    expect(tokens.size).toBe(100);
  });

  it("treats future expiration as not expired", () => {
    const future = new Date(Date.now() + 60_000);
    expect(isTokenExpired(future)).toBe(false);
  });

  it("treats past expiration as expired", () => {
    const past = new Date(Date.now() - 60_000);
    expect(isTokenExpired(past)).toBe(true);
  });
});
```

- [ ] **Step 2: Implement `src/lib/auth/token.ts`**

```typescript
import { randomBytes } from "node:crypto";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isTokenExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now();
}

export const INVITATION_TTL_DAYS = 7;

export function invitationExpiryFromNow(): Date {
  return new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/auth/token.test.ts`

Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/auth/token.ts tests/unit/auth/token.test.ts
git commit -m "feat(auth): add invitation token generation utility"
```

---

## Task 9: Pairing template types and validation schema

**Files:**
- Create: `src/lib/pairings/types.ts`
- Create: `tests/unit/pairings/types.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/pairings/types.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { TemplateSchema } from "@/lib/pairings/types";

describe("pairing template schema", () => {
  it("accepts a valid template", () => {
    const valid = {
      playerCount: 4,
      format: "first-to-6" as const,
      totalMatches: 3,
      matches: [
        { matchNumber: 1, team1: [1, 2], team2: [3, 4], sitting: [] },
        { matchNumber: 2, team1: [1, 3], team2: [2, 4], sitting: [] },
        { matchNumber: 3, team1: [1, 4], team2: [2, 3], sitting: [] },
      ],
    };
    expect(TemplateSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a template where totalMatches differs from matches.length", () => {
    const invalid = {
      playerCount: 4,
      format: "first-to-6" as const,
      totalMatches: 5,
      matches: [{ matchNumber: 1, team1: [1, 2], team2: [3, 4], sitting: [] }],
    };
    expect(TemplateSchema.safeParse(invalid).success).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `src/lib/pairings/types.ts`**

```typescript
import { z } from "zod";

export const MatchFormatSchema = z.enum(["first-to-3", "first-to-6"]);
export type MatchFormat = z.infer<typeof MatchFormatSchema>;

export const MatchSlotSchema = z.object({
  matchNumber: z.number().int().positive(),
  team1: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  team2: z.tuple([z.number().int().positive(), z.number().int().positive()]),
  sitting: z.array(z.number().int().positive()),
});
export type MatchSlot = z.infer<typeof MatchSlotSchema>;

export const TemplateSchema = z
  .object({
    playerCount: z.number().int().min(4).max(6),
    format: MatchFormatSchema,
    totalMatches: z.number().int().positive(),
    matches: z.array(MatchSlotSchema).min(1),
  })
  .refine((t) => t.matches.length === t.totalMatches, {
    message: "matches.length must equal totalMatches",
  });
export type Template = z.infer<typeof TemplateSchema>;
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/pairings/types.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/pairings/types.ts tests/unit/pairings/types.test.ts
git commit -m "feat(pairings): add template type schema with Zod validation"
```

---

## Task 10: 4-player template + balance tests

**Files:**
- Create: `src/lib/pairings/templates/4-players.json`
- Create: `tests/unit/pairings/4-players.test.ts`

- [ ] **Step 1: Write failing balance test**

Create `tests/unit/pairings/4-players.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import template from "@/lib/pairings/templates/4-players.json";
import { TemplateSchema } from "@/lib/pairings/types";

describe("4-player template", () => {
  it("parses against schema", () => {
    expect(TemplateSchema.safeParse(template).success).toBe(true);
  });

  it("has 3 matches", () => {
    expect(template.matches).toHaveLength(3);
  });

  it("every player plays every match (no one sits)", () => {
    for (const m of template.matches) {
      expect(m.sitting).toHaveLength(0);
    }
  });

  it("each pair partners exactly once", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const team of [m.team1, m.team2] as const) {
        const key = team.slice().sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const expectedPairs = ["1-2", "1-3", "1-4", "2-3", "2-4", "3-4"];
    expect(Array.from(counts.keys()).sort()).toEqual(expectedPairs.sort());
    for (const [, c] of counts) expect(c).toBe(1);
  });
});
```

- [ ] **Step 2: Create `src/lib/pairings/templates/4-players.json`**

```json
{
  "playerCount": 4,
  "format": "first-to-6",
  "totalMatches": 3,
  "matches": [
    { "matchNumber": 1, "team1": [1, 2], "team2": [3, 4], "sitting": [] },
    { "matchNumber": 2, "team1": [1, 3], "team2": [2, 4], "sitting": [] },
    { "matchNumber": 3, "team1": [1, 4], "team2": [2, 3], "sitting": [] }
  ]
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/pairings/4-players.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/pairings/templates/4-players.json tests/unit/pairings/4-players.test.ts
git commit -m "feat(pairings): add 4-player template with balance tests"
```

---

## Task 11: 5-player template (group's exact schedule) + balance tests

**Files:**
- Create: `src/lib/pairings/templates/5-players.json`
- Create: `tests/unit/pairings/5-players.test.ts`

- [ ] **Step 1: Write failing balance tests**

Create `tests/unit/pairings/5-players.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import template from "@/lib/pairings/templates/5-players.json";
import { TemplateSchema } from "@/lib/pairings/types";

describe("5-player template", () => {
  it("parses against schema", () => {
    expect(TemplateSchema.safeParse(template).success).toBe(true);
  });

  it("has 15 matches", () => {
    expect(template.matches).toHaveLength(15);
  });

  it("each player sits exactly 3 times", () => {
    const sits = new Map<number, number>();
    for (const m of template.matches) {
      for (const p of m.sitting) sits.set(p, (sits.get(p) ?? 0) + 1);
    }
    for (let p = 1; p <= 5; p++) expect(sits.get(p)).toBe(3);
  });

  it("each player plays exactly 12 matches", () => {
    const plays = new Map<number, number>();
    for (const m of template.matches) {
      for (const p of [...m.team1, ...m.team2]) plays.set(p, (plays.get(p) ?? 0) + 1);
    }
    for (let p = 1; p <= 5; p++) expect(plays.get(p)).toBe(12);
  });

  it("each pair partners exactly 3 times", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const team of [m.team1, m.team2] as const) {
        const key = team.slice().sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(10);
    for (const [, c] of counts) expect(c).toBe(3);
  });

  it("each pair opposes exactly 6 times", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const a of m.team1) for (const b of m.team2) {
        const key = [a, b].sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    for (const [, c] of counts) expect(c).toBe(6);
  });
});
```

- [ ] **Step 2: Create `src/lib/pairings/templates/5-players.json`**

```json
{
  "playerCount": 5,
  "format": "first-to-3",
  "totalMatches": 15,
  "matches": [
    { "matchNumber": 1,  "team1": [3, 5], "team2": [2, 4], "sitting": [1] },
    { "matchNumber": 2,  "team1": [4, 5], "team2": [1, 3], "sitting": [2] },
    { "matchNumber": 3,  "team1": [2, 5], "team2": [1, 4], "sitting": [3] },
    { "matchNumber": 4,  "team1": [1, 2], "team2": [3, 5], "sitting": [4] },
    { "matchNumber": 5,  "team1": [1, 3], "team2": [2, 4], "sitting": [5] },
    { "matchNumber": 6,  "team1": [2, 5], "team2": [3, 4], "sitting": [1] },
    { "matchNumber": 7,  "team1": [3, 4], "team2": [1, 5], "sitting": [2] },
    { "matchNumber": 8,  "team1": [4, 5], "team2": [1, 2], "sitting": [3] },
    { "matchNumber": 9,  "team1": [1, 5], "team2": [2, 3], "sitting": [4] },
    { "matchNumber": 10, "team1": [1, 4], "team2": [2, 3], "sitting": [5] },
    { "matchNumber": 11, "team1": [2, 3], "team2": [4, 5], "sitting": [1] },
    { "matchNumber": 12, "team1": [1, 4], "team2": [3, 5], "sitting": [2] },
    { "matchNumber": 13, "team1": [1, 5], "team2": [2, 4], "sitting": [3] },
    { "matchNumber": 14, "team1": [1, 3], "team2": [2, 5], "sitting": [4] },
    { "matchNumber": 15, "team1": [1, 2], "team2": [3, 4], "sitting": [5] }
  ]
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/pairings/5-players.test.ts`

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pairings/templates/5-players.json tests/unit/pairings/5-players.test.ts
git commit -m "feat(pairings): add 5-player template matching group's paper schedule"
```

---

## Task 12: 6-player template (Whist schedule) + balance tests

**Files:**
- Create: `src/lib/pairings/templates/6-players.json`
- Create: `tests/unit/pairings/6-players.test.ts`

**Mathematical note:** Each of the 15 pair combinations C(6,2) partners exactly twice in 15 matches. Each player plays 10, sits 5. Each pair opposes 4 times. Schedule derived from a 5-round round-robin where each round has 3 disjoint pairs giving 3 matches.

- [ ] **Step 1: Write failing balance tests**

Create `tests/unit/pairings/6-players.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import template from "@/lib/pairings/templates/6-players.json";
import { TemplateSchema } from "@/lib/pairings/types";

describe("6-player template", () => {
  it("parses against schema", () => {
    expect(TemplateSchema.safeParse(template).success).toBe(true);
  });

  it("has 15 matches", () => {
    expect(template.matches).toHaveLength(15);
  });

  it("each player sits exactly 5 times", () => {
    const sits = new Map<number, number>();
    for (const m of template.matches) {
      for (const p of m.sitting) sits.set(p, (sits.get(p) ?? 0) + 1);
    }
    for (let p = 1; p <= 6; p++) expect(sits.get(p)).toBe(5);
  });

  it("each player plays exactly 10 matches", () => {
    const plays = new Map<number, number>();
    for (const m of template.matches) {
      for (const p of [...m.team1, ...m.team2]) plays.set(p, (plays.get(p) ?? 0) + 1);
    }
    for (let p = 1; p <= 6; p++) expect(plays.get(p)).toBe(10);
  });

  it("each pair partners exactly 2 times", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const team of [m.team1, m.team2] as const) {
        const key = team.slice().sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    expect(counts.size).toBe(15);
    for (const [, c] of counts) expect(c).toBe(2);
  });

  it("each pair opposes exactly 4 times", () => {
    const counts = new Map<string, number>();
    for (const m of template.matches) {
      for (const a of m.team1) for (const b of m.team2) {
        const key = [a, b].sort().join("-");
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    for (const [, c] of counts) expect(c).toBe(4);
  });
});
```

- [ ] **Step 2: Create `src/lib/pairings/templates/6-players.json`**

```json
{
  "playerCount": 6,
  "format": "first-to-3",
  "totalMatches": 15,
  "matches": [
    { "matchNumber": 1,  "team1": [1, 2], "team2": [3, 4], "sitting": [5, 6] },
    { "matchNumber": 2,  "team1": [1, 2], "team2": [5, 6], "sitting": [3, 4] },
    { "matchNumber": 3,  "team1": [3, 4], "team2": [5, 6], "sitting": [1, 2] },
    { "matchNumber": 4,  "team1": [1, 3], "team2": [2, 5], "sitting": [4, 6] },
    { "matchNumber": 5,  "team1": [1, 3], "team2": [4, 6], "sitting": [2, 5] },
    { "matchNumber": 6,  "team1": [2, 5], "team2": [4, 6], "sitting": [1, 3] },
    { "matchNumber": 7,  "team1": [1, 4], "team2": [2, 6], "sitting": [3, 5] },
    { "matchNumber": 8,  "team1": [1, 4], "team2": [3, 5], "sitting": [2, 6] },
    { "matchNumber": 9,  "team1": [2, 6], "team2": [3, 5], "sitting": [1, 4] },
    { "matchNumber": 10, "team1": [1, 5], "team2": [2, 4], "sitting": [3, 6] },
    { "matchNumber": 11, "team1": [1, 5], "team2": [3, 6], "sitting": [2, 4] },
    { "matchNumber": 12, "team1": [2, 4], "team2": [3, 6], "sitting": [1, 5] },
    { "matchNumber": 13, "team1": [1, 6], "team2": [2, 3], "sitting": [4, 5] },
    { "matchNumber": 14, "team1": [1, 6], "team2": [4, 5], "sitting": [2, 3] },
    { "matchNumber": 15, "team1": [2, 3], "team2": [4, 5], "sitting": [1, 6] }
  ]
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/pairings/6-players.test.ts`

Expected: 5 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pairings/templates/6-players.json tests/unit/pairings/6-players.test.ts
git commit -m "feat(pairings): add 6-player Whist schedule template"
```

---

## Task 13: Template loader

**Files:**
- Create: `src/lib/pairings/load.ts`
- Create: `tests/unit/pairings/load.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/pairings/load.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { loadTemplate } from "@/lib/pairings/load";

describe("loadTemplate", () => {
  it("loads 4-player template", () => {
    const t = loadTemplate(4);
    expect(t.playerCount).toBe(4);
    expect(t.matches).toHaveLength(3);
  });

  it("loads 5-player template", () => {
    const t = loadTemplate(5);
    expect(t.playerCount).toBe(5);
    expect(t.matches).toHaveLength(15);
  });

  it("loads 6-player template", () => {
    const t = loadTemplate(6);
    expect(t.playerCount).toBe(6);
    expect(t.matches).toHaveLength(15);
  });

  it("throws for unsupported player counts", () => {
    expect(() => loadTemplate(3)).toThrow(/unsupported/i);
    expect(() => loadTemplate(7)).toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Implement `src/lib/pairings/load.ts`**

```typescript
import fourPlayers from "./templates/4-players.json";
import fivePlayers from "./templates/5-players.json";
import sixPlayers from "./templates/6-players.json";
import { TemplateSchema, type Template } from "./types";

const TEMPLATES: Record<number, unknown> = {
  4: fourPlayers,
  5: fivePlayers,
  6: sixPlayers,
};

export function loadTemplate(playerCount: number): Template {
  const raw = TEMPLATES[playerCount];
  if (!raw) {
    throw new Error(`unsupported player count: ${playerCount} (supported: 4, 5, 6)`);
  }
  return TemplateSchema.parse(raw);
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/pairings/load.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/pairings/load.ts tests/unit/pairings/load.test.ts
git commit -m "feat(pairings): add template loader with unsupported-count guard"
```

---

## Task 14: Deterministic shuffle with seed

**Files:**
- Create: `src/lib/pairings/shuffle.ts`
- Create: `tests/unit/pairings/shuffle.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/pairings/shuffle.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { seededShuffle, generateSeed } from "@/lib/pairings/shuffle";

describe("seededShuffle", () => {
  it("returns a new array with the same elements", () => {
    const input = [1, 2, 3, 4, 5];
    const out = seededShuffle(input, "seed-abc");
    expect(out).toHaveLength(5);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(input).toEqual([1, 2, 3, 4, 5]);
  });

  it("is deterministic with the same seed", () => {
    const a = seededShuffle([1, 2, 3, 4, 5], "seed-1");
    const b = seededShuffle([1, 2, 3, 4, 5], "seed-1");
    expect(a).toEqual(b);
  });

  it("produces different orderings for different seeds", () => {
    const a = seededShuffle([1, 2, 3, 4, 5], "seed-1");
    const b = seededShuffle([1, 2, 3, 4, 5], "seed-2");
    expect(a).not.toEqual(b);
  });

  it("generateSeed returns a URL-safe string of reasonable length", () => {
    const s = generateSeed();
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(s.length).toBeGreaterThanOrEqual(16);
  });
});
```

- [ ] **Step 2: Implement `src/lib/pairings/shuffle.ts`**

```typescript
import { createHash, randomBytes } from "node:crypto";

export function generateSeed(): string {
  return randomBytes(16).toString("base64url");
}

// Mulberry32-style PRNG seeded via SHA-256 of the seed string,
// used to drive a Fisher–Yates shuffle.
export function seededShuffle<T>(input: readonly T[], seed: string): T[] {
  const result = input.slice();
  const rng = prngFromSeed(seed);
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function prngFromSeed(seed: string): () => number {
  const hash = createHash("sha256").update(seed).digest();
  let state = hash.readUInt32BE(0) || 1;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/pairings/shuffle.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/pairings/shuffle.ts tests/unit/pairings/shuffle.test.ts
git commit -m "feat(pairings): add deterministic seeded shuffle utility"
```

---

## Task 15: Assign players to template positions

**Files:**
- Create: `src/lib/pairings/assign.ts`
- Create: `tests/unit/pairings/assign.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/pairings/assign.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { assignPlayersToTemplate } from "@/lib/pairings/assign";
import { loadTemplate } from "@/lib/pairings/load";

describe("assignPlayersToTemplate", () => {
  const players = [
    { id: "p1", name: "Paul" },
    { id: "p2", name: "Werner" },
    { id: "p3", name: "Rene" },
    { id: "p4", name: "Thomas" },
    { id: "p5", name: "Michael" },
  ];

  it("produces 15 match plans for 5 players", () => {
    const plans = assignPlayersToTemplate(players, "seed-x");
    expect(plans).toHaveLength(15);
  });

  it("every plan has 2 distinct players in each team and matches the template sitting-count", () => {
    const plans = assignPlayersToTemplate(players, "seed-x");
    const template = loadTemplate(5);
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const tmpl = template.matches[i];
      expect(p.team1.map((x) => x.id).sort()).not.toEqual(p.team2.map((x) => x.id).sort());
      expect(p.sitting).toHaveLength(tmpl.sitting.length);
      const all = new Set([
        ...p.team1.map((x) => x.id),
        ...p.team2.map((x) => x.id),
        ...p.sitting.map((x) => x.id),
      ]);
      expect(all.size).toBe(5);
    }
  });

  it("is deterministic with the same seed", () => {
    const a = assignPlayersToTemplate(players, "seed-1");
    const b = assignPlayersToTemplate(players, "seed-1");
    expect(a).toEqual(b);
  });

  it("throws for unsupported player count", () => {
    expect(() => assignPlayersToTemplate(players.slice(0, 3), "seed")).toThrow(/unsupported/i);
  });
});
```

- [ ] **Step 2: Implement `src/lib/pairings/assign.ts`**

```typescript
import { loadTemplate } from "./load";
import { seededShuffle } from "./shuffle";

export interface PlayerRef {
  id: string;
  name: string;
}

export interface MatchPlan {
  matchNumber: number;
  team1: [PlayerRef, PlayerRef];
  team2: [PlayerRef, PlayerRef];
  sitting: PlayerRef[];
}

export function assignPlayersToTemplate(players: PlayerRef[], seed: string): MatchPlan[] {
  const template = loadTemplate(players.length);
  const ordered = seededShuffle(players, seed);

  return template.matches.map<MatchPlan>((m) => ({
    matchNumber: m.matchNumber,
    team1: [ordered[m.team1[0] - 1], ordered[m.team1[1] - 1]],
    team2: [ordered[m.team2[0] - 1], ordered[m.team2[1] - 1]],
    sitting: m.sitting.map((i) => ordered[i - 1]),
  }));
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/pairings/`

Expected: all pairing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/pairings/assign.ts tests/unit/pairings/assign.test.ts
git commit -m "feat(pairings): add player-to-template assignment with seeded shuffle"
```

---

## Task 16: Score validation

**Files:**
- Create: `src/lib/match/validate.ts`
- Create: `tests/unit/match/validate.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/match/validate.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { validateScore } from "@/lib/match/validate";

describe("validateScore", () => {
  describe("first-to-3 format", () => {
    it.each([
      [3, 0],
      [3, 1],
      [3, 2],
      [0, 3],
      [1, 3],
      [2, 3],
    ])("accepts %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-3").ok).toBe(true);
    });

    it.each([
      [3, 3],
      [4, 0],
      [2, 2],
      [-1, 3],
      [3, 4],
    ])("rejects %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-3").ok).toBe(false);
    });
  });

  describe("first-to-6 format", () => {
    it.each([
      [6, 0],
      [6, 4],
      [6, 5],
      [0, 6],
      [4, 6],
    ])("accepts %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-6").ok).toBe(true);
    });

    it.each([
      [6, 6],
      [5, 5],
      [7, 4],
      [-1, 6],
    ])("rejects %i:%i", (a, b) => {
      expect(validateScore(a, b, "first-to-6").ok).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Implement `src/lib/match/validate.ts`**

```typescript
import type { MatchFormat } from "@/lib/pairings/types";

export type ValidationResult = { ok: true } | { ok: false; reason: string };

export function validateScore(a: number, b: number, format: MatchFormat): ValidationResult {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
    return { ok: false, reason: "Scores must be non-negative integers" };
  }
  if (a === b) {
    return { ok: false, reason: "Ties are not allowed" };
  }
  const target = format === "first-to-3" ? 3 : 6;
  const winner = Math.max(a, b);
  const loser = Math.min(a, b);
  if (winner !== target) {
    return { ok: false, reason: `Winning score must be ${target}` };
  }
  if (loser >= target) {
    return { ok: false, reason: `Losing score must be less than ${target}` };
  }
  return { ok: true };
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/unit/match/validate.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/match/validate.ts tests/unit/match/validate.test.ts
git commit -m "feat(match): add score validation for first-to-3 and first-to-6 formats"
```

---

## Task 17: Season helpers

**Files:**
- Create: `src/lib/season.ts`
- Create: `tests/integration/season.test.ts`

- [ ] **Step 1: Write failing integration test**

Create `tests/integration/season.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";

describe("getOrCreateActiveSeason", () => {
  beforeEach(async () => {
    await prisma.auditLog.deleteMany();
    await prisma.jokerUse.deleteMany();
    await prisma.match.deleteMany();
    await prisma.gameDayParticipant.deleteMany();
    await prisma.gameDay.deleteMany();
    await prisma.season.deleteMany();
  });

  it("creates the current-year season if none exists", async () => {
    const year = new Date().getFullYear();
    const s = await getOrCreateActiveSeason();
    expect(s.year).toBe(year);
    expect(s.isActive).toBe(true);
  });

  it("returns the existing active season on subsequent calls", async () => {
    const first = await getOrCreateActiveSeason();
    const second = await getOrCreateActiveSeason();
    expect(second.id).toBe(first.id);
  });
});
```

- [ ] **Step 2: Implement `src/lib/season.ts`**

```typescript
import { prisma } from "./db";

export async function getOrCreateActiveSeason() {
  const year = new Date().getFullYear();
  const existing = await prisma.season.findFirst({ where: { isActive: true } });
  if (existing) return existing;

  return prisma.season.create({
    data: {
      year,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31),
      isActive: true,
    },
  });
}

export async function closeSeason(id: string) {
  return prisma.season.update({ where: { id }, data: { isActive: false } });
}
```

- [ ] **Step 3: Ensure test DB is running, then verify**

```bash
docker compose -f docker-compose.dev.yml up -d
pnpm prisma migrate deploy
pnpm test tests/integration/season.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/season.ts tests/integration/season.test.ts
git commit -m "feat(season): add active season helper"
```

---

## Task 18: Game Day creation

**Files:**
- Create: `src/lib/game-day/create.ts`
- Create: `tests/integration/game-day-create.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/game-day-create.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

describe("createGameDay", () => {
  beforeEach(resetDb);

  it("creates a game day with pending participants for all active players", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    await prisma.player.create({ data: { name: "B", email: "b@x", passwordHash: "x" } });

    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    expect(day.status).toBe("planned");
    const parts = await prisma.gameDayParticipant.findMany({ where: { gameDayId: day.id } });
    expect(parts).toHaveLength(2);
    expect(parts.every((p) => p.attendance === "pending")).toBe(true);
  });

  it("does not include soft-deleted players", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    await prisma.player.create({
      data: { name: "Gone", email: "gone@x", passwordHash: "x", deletedAt: new Date() },
    });

    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    const parts = await prisma.gameDayParticipant.findMany({ where: { gameDayId: day.id } });
    expect(parts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement `src/lib/game-day/create.ts`**

```typescript
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";

export async function createGameDay(date: Date, actorId: string) {
  const season = await getOrCreateActiveSeason();
  const players = await prisma.player.findMany({ where: { deletedAt: null } });

  return prisma.$transaction(async (tx) => {
    const day = await tx.gameDay.create({
      data: {
        seasonId: season.id,
        date,
        status: "planned",
        participants: {
          create: players.map((p) => ({ playerId: p.id })),
        },
      },
      include: { participants: true },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.create",
        entityType: "GameDay",
        entityId: day.id,
        payload: { date: date.toISOString() },
      },
    });

    return day;
  });
}
```

- [ ] **Step 3: Verify test passes**

Run: `pnpm test tests/integration/game-day-create.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-day/create.ts tests/integration/game-day-create.test.ts
git commit -m "feat(game-day): add creation with pending-participant seeding"
```

---

## Task 19: Attendance update

**Files:**
- Create: `src/lib/game-day/attendance.ts`
- Create: `tests/integration/attendance.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/attendance.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

describe("setAttendance", () => {
  beforeEach(resetDb);

  it("updates attendance from pending to confirmed", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);

    await setAttendance(day.id, admin.id, "confirmed");

    const p = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: day.id, playerId: admin.id } },
    });
    expect(p.attendance).toBe("confirmed");
    expect(p.respondedAt).toBeInstanceOf(Date);
  });

  it("rejects updates after roster is locked", async () => {
    const admin = await prisma.player.create({
      data: { name: "A", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const day = await createGameDay(new Date("2026-04-21"), admin.id);
    await prisma.gameDay.update({ where: { id: day.id }, data: { status: "roster_locked" } });

    await expect(setAttendance(day.id, admin.id, "confirmed")).rejects.toThrow(/locked/i);
  });
});
```

- [ ] **Step 2: Implement `src/lib/game-day/attendance.ts`**

```typescript
import { prisma } from "@/lib/db";
import type { AttendanceStatus } from "@prisma/client";

export async function setAttendance(
  gameDayId: string,
  playerId: string,
  attendance: AttendanceStatus,
) {
  const day = await prisma.gameDay.findUniqueOrThrow({ where: { id: gameDayId } });
  if (day.status !== "planned") {
    throw new Error("Game day is locked; attendance can no longer be changed");
  }

  return prisma.gameDayParticipant.update({
    where: { gameDayId_playerId: { gameDayId, playerId } },
    data: { attendance, respondedAt: new Date() },
  });
}
```

- [ ] **Step 3: Verify test passes**

Run: `pnpm test tests/integration/attendance.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-day/attendance.ts tests/integration/attendance.test.ts
git commit -m "feat(game-day): add attendance update with locked-status guard"
```

---

## Task 20: Lock roster + generate matches

**Files:**
- Create: `src/lib/game-day/lock.ts`
- Create: `tests/integration/lock.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/lock.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

async function seedSixPlayers() {
  const players = [];
  for (let i = 1; i <= 6; i++) {
    const p = await prisma.player.create({
      data: {
        name: `P${i}`,
        email: `p${i}@x`,
        passwordHash: "x",
        isAdmin: i === 1,
      },
    });
    players.push(p);
  }
  return players;
}

describe("lockRoster", () => {
  beforeEach(resetDb);

  it("generates 15 matches for 5 confirmed players and locks the game day", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    for (let i = 0; i < 5; i++) {
      await setAttendance(day.id, players[i].id, "confirmed");
    }

    await lockRoster(day.id, players[0].id);

    const updated = await prisma.gameDay.findUniqueOrThrow({ where: { id: day.id } });
    expect(updated.status).toBe("roster_locked");
    expect(updated.playerCount).toBe(5);
    expect(updated.seed).toBeTruthy();

    const matches = await prisma.match.findMany({ where: { gameDayId: day.id } });
    expect(matches).toHaveLength(15);
  });

  it("rejects locking with fewer than 4 confirmed players", async () => {
    const players = await seedSixPlayers();
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    await setAttendance(day.id, players[0].id, "confirmed");

    await expect(lockRoster(day.id, players[0].id)).rejects.toThrow(/at least 4/i);
  });

  it("rejects locking with more than 6 confirmed players", async () => {
    const players = await seedSixPlayers();
    await prisma.player.create({ data: { name: "P7", email: "p7@x", passwordHash: "x" } });
    const day = await createGameDay(new Date("2026-04-21"), players[0].id);
    const allPlayers = await prisma.player.findMany();
    for (const p of allPlayers) await setAttendance(day.id, p.id, "confirmed");

    await expect(lockRoster(day.id, players[0].id)).rejects.toThrow(/at most 6/i);
  });
});
```

- [ ] **Step 2: Implement `src/lib/game-day/lock.ts`**

```typescript
import { prisma } from "@/lib/db";
import { assignPlayersToTemplate } from "@/lib/pairings/assign";
import { generateSeed } from "@/lib/pairings/shuffle";

export async function lockRoster(gameDayId: string, actorId: string) {
  const day = await prisma.gameDay.findUniqueOrThrow({
    where: { id: gameDayId },
    include: { participants: { include: { player: true } } },
  });

  if (day.status !== "planned") {
    throw new Error("Game day is already locked or finished");
  }

  const confirmed = day.participants.filter((p) => p.attendance === "confirmed");
  if (confirmed.length < 4) throw new Error("Need at least 4 confirmed players");
  if (confirmed.length > 6) throw new Error("At most 6 confirmed players allowed");

  const players = confirmed.map((p) => ({ id: p.player.id, name: p.player.name }));
  const seed = generateSeed();
  const plans = assignPlayersToTemplate(players, seed);

  return prisma.$transaction(async (tx) => {
    await tx.gameDay.update({
      where: { id: gameDayId },
      data: {
        status: "roster_locked",
        playerCount: players.length,
        seed,
      },
    });

    for (const plan of plans) {
      await tx.match.create({
        data: {
          gameDayId,
          matchNumber: plan.matchNumber,
          team1PlayerAId: plan.team1[0].id,
          team1PlayerBId: plan.team1[1].id,
          team2PlayerAId: plan.team2[0].id,
          team2PlayerBId: plan.team2[1].id,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        actorId,
        action: "game_day.lock",
        entityType: "GameDay",
        entityId: gameDayId,
        payload: { playerCount: players.length, seed, matches: plans.length },
      },
    });

    return tx.gameDay.findUniqueOrThrow({
      where: { id: gameDayId },
      include: { matches: { orderBy: { matchNumber: "asc" } } },
    });
  });
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/integration/lock.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/game-day/lock.ts tests/integration/lock.test.ts
git commit -m "feat(game-day): add roster locking with pairing generation"
```

---

## Task 21: Match score entry with optimistic locking

**Files:**
- Create: `src/lib/match/enter-score.ts`
- Create: `tests/integration/enter-score.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/enter-score.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";
import { enterScore, ScoreConflictError } from "@/lib/match/enter-score";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

async function setupFivePlayerGame() {
  const players = [];
  for (let i = 1; i <= 5; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await lockRoster(day.id, players[0].id);
  const matches = await prisma.match.findMany({
    where: { gameDayId: day.id },
    orderBy: { matchNumber: "asc" },
  });
  return { players, day, matches };
}

describe("enterScore", () => {
  beforeEach(resetDb);

  it("saves a valid score and increments version", async () => {
    const { players, matches } = await setupFivePlayerGame();
    const match = matches[0];

    const updated = await enterScore({
      matchId: match.id,
      team1Score: 3,
      team2Score: 1,
      scoredBy: players[0].id,
      expectedVersion: 0,
    });
    expect(updated.team1Score).toBe(3);
    expect(updated.team2Score).toBe(1);
    expect(updated.version).toBe(1);
  });

  it("rejects invalid scores with clear error", async () => {
    const { players, matches } = await setupFivePlayerGame();
    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 4,
        team2Score: 0,
        scoredBy: players[0].id,
        expectedVersion: 0,
      }),
    ).rejects.toThrow(/winning score/i);
  });

  it("rejects a concurrent write with stale version", async () => {
    const { players, matches } = await setupFivePlayerGame();
    await enterScore({
      matchId: matches[0].id,
      team1Score: 3,
      team2Score: 0,
      scoredBy: players[0].id,
      expectedVersion: 0,
    });
    await expect(
      enterScore({
        matchId: matches[0].id,
        team1Score: 0,
        team2Score: 3,
        scoredBy: players[1].id,
        expectedVersion: 0,
      }),
    ).rejects.toThrow(ScoreConflictError);
  });
});
```

- [ ] **Step 2: Implement `src/lib/match/enter-score.ts`**

```typescript
import { prisma } from "@/lib/db";
import { validateScore } from "./validate";
import type { MatchFormat } from "@/lib/pairings/types";

export class ScoreConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScoreConflictError";
  }
}

export interface EnterScoreInput {
  matchId: string;
  team1Score: number;
  team2Score: number;
  scoredBy: string;
  expectedVersion: number;
}

export async function enterScore(input: EnterScoreInput) {
  const match = await prisma.match.findUniqueOrThrow({
    where: { id: input.matchId },
    include: { gameDay: true },
  });

  const format: MatchFormat = match.gameDay.playerCount === 4 ? "first-to-6" : "first-to-3";
  const v = validateScore(input.team1Score, input.team2Score, format);
  if (!v.ok) throw new Error(v.reason);

  const result = await prisma.match.updateMany({
    where: { id: input.matchId, version: input.expectedVersion },
    data: {
      team1Score: input.team1Score,
      team2Score: input.team2Score,
      scoredById: input.scoredBy,
      scoredAt: new Date(),
      version: { increment: 1 },
    },
  });

  if (result.count === 0) {
    throw new ScoreConflictError(`Match ${input.matchId} was already updated by someone else`);
  }

  await prisma.gameDay.updateMany({
    where: { id: match.gameDayId, status: "roster_locked" },
    data: { status: "in_progress" },
  });

  return prisma.match.findUniqueOrThrow({ where: { id: input.matchId } });
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/integration/enter-score.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/match/enter-score.ts tests/integration/enter-score.test.ts
git commit -m "feat(match): add score entry with optimistic locking"
```

---

## Task 22: Match undo (within 2 minutes)

**Files:**
- Create: `src/lib/match/undo.ts`
- Create: `tests/integration/undo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/undo.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";
import { setAttendance } from "@/lib/game-day/attendance";
import { lockRoster } from "@/lib/game-day/lock";
import { enterScore } from "@/lib/match/enter-score";
import { undoScore } from "@/lib/match/undo";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

async function setupAndEnter() {
  const players = [];
  for (let i = 1; i <= 5; i++) {
    players.push(
      await prisma.player.create({
        data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x", isAdmin: i === 1 },
      }),
    );
  }
  const day = await createGameDay(new Date("2026-04-21"), players[0].id);
  for (const p of players) await setAttendance(day.id, p.id, "confirmed");
  await lockRoster(day.id, players[0].id);
  const matches = await prisma.match.findMany({
    where: { gameDayId: day.id },
    orderBy: { matchNumber: "asc" },
  });
  await enterScore({
    matchId: matches[0].id,
    team1Score: 3,
    team2Score: 1,
    scoredBy: players[0].id,
    expectedVersion: 0,
  });
  return { players, day, matchId: matches[0].id };
}

describe("undoScore", () => {
  beforeEach(resetDb);

  it("clears the score when called by the same scorer within 2 minutes", async () => {
    const { players, matchId } = await setupAndEnter();
    await undoScore({ matchId, actorId: players[0].id });
    const m = await prisma.match.findUniqueOrThrow({ where: { id: matchId } });
    expect(m.team1Score).toBeNull();
    expect(m.team2Score).toBeNull();
  });

  it("rejects undo after 2-minute window", async () => {
    const { players, matchId } = await setupAndEnter();
    await prisma.match.update({
      where: { id: matchId },
      data: { scoredAt: new Date(Date.now() - 3 * 60 * 1000) },
    });
    await expect(undoScore({ matchId, actorId: players[0].id })).rejects.toThrow(/window/i);
  });

  it("rejects undo by a different non-admin user", async () => {
    const { players, matchId } = await setupAndEnter();
    await expect(undoScore({ matchId, actorId: players[1].id })).rejects.toThrow(/permission/i);
  });
});
```

- [ ] **Step 2: Implement `src/lib/match/undo.ts`**

```typescript
import { prisma } from "@/lib/db";

const UNDO_WINDOW_MS = 2 * 60 * 1000;

export async function undoScore(args: { matchId: string; actorId: string }) {
  const match = await prisma.match.findUniqueOrThrow({ where: { id: args.matchId } });
  const actor = await prisma.player.findUniqueOrThrow({ where: { id: args.actorId } });

  if (match.team1Score === null) {
    throw new Error("Match has no score to undo");
  }

  const isOriginalScorer = match.scoredById === args.actorId;
  if (!isOriginalScorer && !actor.isAdmin) {
    throw new Error("No permission to undo this score");
  }

  if (!actor.isAdmin && match.scoredAt) {
    const age = Date.now() - match.scoredAt.getTime();
    if (age > UNDO_WINDOW_MS) {
      throw new Error("Undo window (2 minutes) has passed");
    }
  }

  return prisma.match.update({
    where: { id: args.matchId },
    data: {
      team1Score: null,
      team2Score: null,
      scoredById: null,
      scoredAt: null,
      version: { increment: 1 },
    },
  });
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/integration/undo.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/match/undo.ts tests/integration/undo.test.ts
git commit -m "feat(match): add score undo within 2-minute window"
```

---

## Task 23: Ranking computation

**Files:**
- Create: `src/lib/ranking/compute.ts`
- Create: `tests/integration/ranking.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/ranking.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { computeRanking } from "@/lib/ranking/compute";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

describe("computeRanking", () => {
  beforeEach(resetDb);

  it("returns empty list when no matches exist", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const ranking = await computeRanking(season.id);
    expect(ranking).toEqual([]);
  });

  it("aggregates points and games from completed matches", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const [p1, p2, p3, p4] = await Promise.all(
      [1, 2, 3, 4].map((i) =>
        prisma.player.create({ data: { name: `P${i}`, email: `p${i}@x`, passwordHash: "x" } }),
      ),
    );
    const gd = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 4 },
    });
    await prisma.match.create({
      data: {
        gameDayId: gd.id,
        matchNumber: 1,
        team1PlayerAId: p1.id,
        team1PlayerBId: p2.id,
        team2PlayerAId: p3.id,
        team2PlayerBId: p4.id,
        team1Score: 3,
        team2Score: 1,
      },
    });

    const ranking = await computeRanking(season.id);
    expect(ranking).toHaveLength(4);
    const paul = ranking.find((r) => r.playerId === p1.id)!;
    expect(paul.games).toBe(1);
    expect(paul.points).toBe(3);
    expect(paul.pointsPerGame).toBeCloseTo(3);

    const thomas = ranking.find((r) => r.playerId === p3.id)!;
    expect(thomas.games).toBe(1);
    expect(thomas.points).toBe(1);
  });

  it("includes joker uses in ranking totals", async () => {
    const year = new Date().getFullYear();
    const season = await prisma.season.create({
      data: {
        year,
        startDate: new Date(year, 0, 1),
        endDate: new Date(year, 11, 31),
        isActive: true,
      },
    });
    const player = await prisma.player.create({
      data: { name: "Joker User", email: "j@x", passwordHash: "x" },
    });
    const gd = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-21"), playerCount: 5 },
    });
    await prisma.jokerUse.create({
      data: {
        playerId: player.id,
        seasonId: season.id,
        gameDayId: gd.id,
        ppgAtUse: "1.5",
        gamesCredited: 10,
        pointsCredited: "15.00",
      },
    });

    const ranking = await computeRanking(season.id);
    expect(ranking).toHaveLength(1);
    expect(ranking[0].games).toBe(10);
    expect(ranking[0].points).toBeCloseTo(15);
    expect(ranking[0].pointsPerGame).toBeCloseTo(1.5);
    expect(ranking[0].jokersUsed).toBe(1);
  });
});
```

- [ ] **Step 2: Implement `src/lib/ranking/compute.ts`**

```typescript
import { prisma } from "@/lib/db";

export interface RankingRow {
  rank: number;
  playerId: string;
  playerName: string;
  games: number;
  points: number;
  pointsPerGame: number;
  jokersUsed: number;
}

export async function computeRanking(seasonId: string): Promise<RankingRow[]> {
  const rows = await prisma.$queryRaw<
    Array<{
      player_id: string;
      player_name: string;
      games: bigint;
      points: number;
      jokers_used: bigint;
    }>
  >`
    WITH played AS (
      SELECT p.id AS player_id, p.name AS player_name,
        CASE
          WHEN p.id IN (m."team1PlayerAId", m."team1PlayerBId")
            THEN m."team1Score"
          ELSE m."team2Score"
        END AS points
      FROM "Player" p
      JOIN "Match" m
        ON p.id IN (m."team1PlayerAId", m."team1PlayerBId",
                    m."team2PlayerAId", m."team2PlayerBId")
      JOIN "GameDay" gd ON gd.id = m."gameDayId"
      WHERE gd."seasonId" = ${seasonId}
        AND m."team1Score" IS NOT NULL
        AND p."deletedAt" IS NULL
    ),
    jokers AS (
      SELECT j."playerId" AS player_id,
             SUM(j."gamesCredited")::int AS games_credited,
             SUM(j."pointsCredited")::float AS points_credited,
             COUNT(*)::bigint AS jokers_used
      FROM "JokerUse" j
      WHERE j."seasonId" = ${seasonId}
      GROUP BY j."playerId"
    )
    SELECT
      p.id AS player_id,
      p.name AS player_name,
      COALESCE(COUNT(played.points), 0)::bigint + COALESCE(j.games_credited, 0)::bigint AS games,
      COALESCE(SUM(played.points), 0)::float + COALESCE(j.points_credited, 0)::float AS points,
      COALESCE(j.jokers_used, 0)::bigint AS jokers_used
    FROM "Player" p
    LEFT JOIN played ON played.player_id = p.id
    LEFT JOIN jokers j ON j.player_id = p.id
    WHERE p."deletedAt" IS NULL
      AND (played.points IS NOT NULL OR j.jokers_used IS NOT NULL)
    GROUP BY p.id, p.name, j.games_credited, j.points_credited, j.jokers_used
    ORDER BY (
      (COALESCE(SUM(played.points), 0)::float + COALESCE(j.points_credited, 0)::float)
      / NULLIF(
          COALESCE(COUNT(played.points), 0)::float + COALESCE(j.games_credited, 0)::float,
          0
        )
    ) DESC NULLS LAST,
    points DESC
  `;

  return rows.map((r, i) => {
    const games = Number(r.games);
    const points = Number(r.points);
    return {
      rank: i + 1,
      playerId: r.player_id,
      playerName: r.player_name,
      games,
      points,
      pointsPerGame: games === 0 ? 0 : points / games,
      jokersUsed: Number(r.jokers_used),
    };
  });
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/integration/ranking.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/ranking/compute.ts tests/integration/ranking.test.ts
git commit -m "feat(ranking): add season ranking computation with Joker credits"
```

---

## Task 24: Joker use

**Files:**
- Create: `src/lib/joker/use.ts`
- Create: `tests/integration/joker.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/joker.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { useJoker, JOKER_GAMES_CREDITED, MAX_JOKERS_PER_SEASON } from "@/lib/joker/use";

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.jokerUse.deleteMany();
  await prisma.match.deleteMany();
  await prisma.gameDayParticipant.deleteMany();
  await prisma.gameDay.deleteMany();
  await prisma.season.deleteMany();
  await prisma.player.deleteMany();
}

async function setup() {
  const year = new Date().getFullYear();
  const season = await prisma.season.create({
    data: {
      year,
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31),
      isActive: true,
    },
  });
  const player = await prisma.player.create({
    data: { name: "X", email: "x@x", passwordHash: "x" },
  });
  const gameDay = await prisma.gameDay.create({
    data: { seasonId: season.id, date: new Date("2026-04-21"), status: "planned" },
  });
  await prisma.gameDayParticipant.create({
    data: { gameDayId: gameDay.id, playerId: player.id, attendance: "pending" },
  });
  return { season, player, gameDay };
}

describe("useJoker", () => {
  beforeEach(resetDb);

  it("creates a JokerUse with a ppg snapshot and marks attendance=joker", async () => {
    const { player, gameDay } = await setup();
    const use = await useJoker({ playerId: player.id, gameDayId: gameDay.id });

    expect(use.gamesCredited).toBe(JOKER_GAMES_CREDITED);
    expect(Number(use.ppgAtUse)).toBe(0);
    expect(Number(use.pointsCredited)).toBe(0);

    const part = await prisma.gameDayParticipant.findUniqueOrThrow({
      where: { gameDayId_playerId: { gameDayId: gameDay.id, playerId: player.id } },
    });
    expect(part.attendance).toBe("joker");
  });

  it("snapshots current ppg when player has prior matches", async () => {
    const { season, player, gameDay } = await setup();
    const partner = await prisma.player.create({
      data: { name: "Y", email: "y@x", passwordHash: "x" },
    });
    const opp1 = await prisma.player.create({
      data: { name: "O1", email: "o1@x", passwordHash: "x" },
    });
    const opp2 = await prisma.player.create({
      data: { name: "O2", email: "o2@x", passwordHash: "x" },
    });
    const earlier = await prisma.gameDay.create({
      data: { seasonId: season.id, date: new Date("2026-04-14"), playerCount: 4 },
    });
    await prisma.match.create({
      data: {
        gameDayId: earlier.id,
        matchNumber: 1,
        team1PlayerAId: player.id,
        team1PlayerBId: partner.id,
        team2PlayerAId: opp1.id,
        team2PlayerBId: opp2.id,
        team1Score: 3,
        team2Score: 1,
      },
    });

    const use = await useJoker({ playerId: player.id, gameDayId: gameDay.id });
    expect(Number(use.ppgAtUse)).toBeCloseTo(3);
    expect(Number(use.pointsCredited)).toBeCloseTo(3 * JOKER_GAMES_CREDITED);
  });

  it("rejects a third Joker in same season", async () => {
    const { season, player, gameDay } = await setup();
    for (let i = 0; i < MAX_JOKERS_PER_SEASON; i++) {
      const g = await prisma.gameDay.create({
        data: { seasonId: season.id, date: new Date(2026, 3, 21 + i) },
      });
      await prisma.gameDayParticipant.create({
        data: { gameDayId: g.id, playerId: player.id },
      });
      await useJoker({ playerId: player.id, gameDayId: g.id });
    }

    await expect(useJoker({ playerId: player.id, gameDayId: gameDay.id })).rejects.toThrow(
      /max/i,
    );
  });

  it("rejects using a Joker on a locked game day", async () => {
    const { player, gameDay } = await setup();
    await prisma.gameDay.update({
      where: { id: gameDay.id },
      data: { status: "roster_locked" },
    });
    await expect(useJoker({ playerId: player.id, gameDayId: gameDay.id })).rejects.toThrow(
      /locked/i,
    );
  });
});
```

- [ ] **Step 2: Implement `src/lib/joker/use.ts`**

```typescript
import { prisma } from "@/lib/db";

export const MAX_JOKERS_PER_SEASON = 2;
export const JOKER_GAMES_CREDITED = 10;

async function snapshotPpg(playerId: string, seasonId: string): Promise<number> {
  const rows = await prisma.$queryRaw<
    Array<{ games: bigint; points: number | null }>
  >`
    SELECT
      COUNT(*)::bigint AS games,
      COALESCE(SUM(
        CASE
          WHEN ${playerId} IN (m."team1PlayerAId", m."team1PlayerBId")
            THEN m."team1Score"
          ELSE m."team2Score"
        END
      ), 0)::float AS points
    FROM "Match" m
    JOIN "GameDay" gd ON gd.id = m."gameDayId"
    WHERE gd."seasonId" = ${seasonId}
      AND m."team1Score" IS NOT NULL
      AND ${playerId} IN (m."team1PlayerAId", m."team1PlayerBId",
                          m."team2PlayerAId", m."team2PlayerBId")
  `;
  const games = Number(rows[0]?.games ?? 0);
  const points = Number(rows[0]?.points ?? 0);
  return games === 0 ? 0 : points / games;
}

export async function useJoker(args: { playerId: string; gameDayId: string }) {
  const gameDay = await prisma.gameDay.findUniqueOrThrow({
    where: { id: args.gameDayId },
    include: { season: true },
  });
  if (gameDay.status !== "planned") {
    throw new Error("Game day is locked; Joker can no longer be used");
  }

  const existing = await prisma.jokerUse.count({
    where: { playerId: args.playerId, seasonId: gameDay.seasonId },
  });
  if (existing >= MAX_JOKERS_PER_SEASON) {
    throw new Error(`Max ${MAX_JOKERS_PER_SEASON} Jokers per season already used`);
  }

  const ppg = await snapshotPpg(args.playerId, gameDay.seasonId);
  const points = ppg * JOKER_GAMES_CREDITED;

  return prisma.$transaction(async (tx) => {
    const use = await tx.jokerUse.create({
      data: {
        playerId: args.playerId,
        seasonId: gameDay.seasonId,
        gameDayId: args.gameDayId,
        ppgAtUse: ppg.toFixed(3),
        gamesCredited: JOKER_GAMES_CREDITED,
        pointsCredited: points.toFixed(2),
      },
    });
    await tx.gameDayParticipant.update({
      where: {
        gameDayId_playerId: { gameDayId: args.gameDayId, playerId: args.playerId },
      },
      data: { attendance: "joker", respondedAt: new Date() },
    });
    await tx.auditLog.create({
      data: {
        actorId: args.playerId,
        action: "joker.use",
        entityType: "JokerUse",
        entityId: use.id,
        payload: { ppg, points, gameDayId: args.gameDayId },
      },
    });
    return use;
  });
}
```

- [ ] **Step 3: Verify tests pass**

Run: `pnpm test tests/integration/joker.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/lib/joker/use.ts tests/integration/joker.test.ts
git commit -m "feat(joker): add Joker use with ppg snapshot and season cap"
```

---

## Task 25: Auth.js v5 configuration

**Files:**
- Create: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`

- [ ] **Step 1: Create `src/auth.ts`**

```typescript
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/hash";

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = CredentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.player.findFirst({
          where: { email: parsed.data.email, deletedAt: null },
        });
        if (!user?.passwordHash) return null;
        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.isAdmin = (user as { isAdmin: boolean }).isAdmin;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id: string }).id = token.id as string;
        (session.user as { isAdmin: boolean }).isAdmin = token.isAdmin as boolean;
      }
      return session;
    },
  },
});

declare module "next-auth" {
  interface User {
    isAdmin?: boolean;
  }
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isAdmin: boolean;
    };
  }
}
```

- [ ] **Step 2: Create `src/app/api/auth/[...nextauth]/route.ts`**

```typescript
export { GET, POST } from "@/auth";

export const { handlers } = await import("@/auth");
```

Correct version (handlers exports GET/POST):
```typescript
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

- [ ] **Step 3: Create `src/middleware.ts`**

```typescript
export { auth as middleware } from "@/auth";

export const config = {
  matcher: [
    "/((?!api/auth|login|invite|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/auth.ts src/app/api/auth src/middleware.ts
git commit -m "feat(auth): configure Auth.js v5 with credentials provider and middleware"
```

---

## Task 26: Invitation API — create

**Files:**
- Create: `src/app/api/invitations/route.ts`
- Create: `tests/integration/invitations-api.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/invitations-api.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "@/lib/db";

async function resetDb() {
  await prisma.invitation.deleteMany();
  await prisma.player.deleteMany();
}

vi.mock("@/auth", async () => {
  const actual = await vi.importActual<typeof import("@/auth")>("@/auth");
  return { ...actual, auth: vi.fn() };
});

import { auth } from "@/auth";
import { POST } from "@/app/api/invitations/route";

describe("POST /api/invitations", () => {
  beforeEach(resetDb);

  it("creates an invitation when called by admin", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    vi.mocked(auth).mockResolvedValue({
      user: { id: admin.id, email: admin.email, name: admin.name, isAdmin: true },
    } as never);

    const req = new Request("http://localhost/api/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "new@x" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.url).toContain(body.token);
  });

  it("rejects a non-admin caller with 403", async () => {
    const user = await prisma.player.create({
      data: { name: "U", email: "u@x", passwordHash: "x" },
    });
    vi.mocked(auth).mockResolvedValue({
      user: { id: user.id, email: user.email, name: user.name, isAdmin: false },
    } as never);

    const req = new Request("http://localhost/api/invitations", {
      method: "POST",
      body: JSON.stringify({ email: "new@x" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Implement `src/app/api/invitations/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { generateInvitationToken, invitationExpiryFromNow } from "@/lib/auth/token";

const InviteSchema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = InviteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const token = generateInvitationToken();
  const invite = await prisma.invitation.create({
    data: {
      email: parsed.data.email,
      token,
      invitedById: session.user.id,
      expiresAt: invitationExpiryFromNow(),
    },
  });

  const base = process.env.AUTH_URL ?? "http://localhost:3000";
  return NextResponse.json(
    { token: invite.token, url: `${base}/invite/${invite.token}` },
    { status: 201 },
  );
}
```

- [ ] **Step 3: Verify test passes**

Run: `pnpm test tests/integration/invitations-api.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/invitations/route.ts tests/integration/invitations-api.test.ts
git commit -m "feat(api): add admin-only invitation creation endpoint"
```

---

## Task 27: Invitation API — redeem

**Files:**
- Create: `src/app/api/invitations/[token]/route.ts`
- Create: `tests/integration/invitation-redeem.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/integration/invitation-redeem.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/lib/db";
import { generateInvitationToken, invitationExpiryFromNow } from "@/lib/auth/token";
import { verifyPassword } from "@/lib/auth/hash";
import { POST } from "@/app/api/invitations/[token]/route";

async function resetDb() {
  await prisma.invitation.deleteMany();
  await prisma.player.deleteMany();
}

describe("POST /api/invitations/[token]", () => {
  beforeEach(resetDb);

  it("creates a player with hashed password and marks invitation used", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const token = generateInvitationToken();
    await prisma.invitation.create({
      data: {
        email: "new@x",
        token,
        invitedById: admin.id,
        expiresAt: invitationExpiryFromNow(),
      },
    });

    const req = new Request(`http://localhost/api/invitations/${token}`, {
      method: "POST",
      body: JSON.stringify({ name: "Newbie", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ token }) });
    expect(res.status).toBe(201);

    const newbie = await prisma.player.findUniqueOrThrow({ where: { email: "new@x" } });
    expect(newbie.name).toBe("Newbie");
    expect(await verifyPassword("hunter22extra", newbie.passwordHash!)).toBe(true);

    const inv = await prisma.invitation.findUniqueOrThrow({ where: { token } });
    expect(inv.usedAt).toBeInstanceOf(Date);
  });

  it("rejects expired invitations", async () => {
    const admin = await prisma.player.create({
      data: { name: "Admin", email: "a@x", isAdmin: true, passwordHash: "x" },
    });
    const token = generateInvitationToken();
    await prisma.invitation.create({
      data: {
        email: "late@x",
        token,
        invitedById: admin.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const req = new Request(`http://localhost/api/invitations/${token}`, {
      method: "POST",
      body: JSON.stringify({ name: "Late", password: "hunter22extra" }),
      headers: { "content-type": "application/json" },
    });
    const res = await POST(req, { params: Promise.resolve({ token }) });
    expect(res.status).toBe(410);
  });
});
```

- [ ] **Step 2: Implement `src/app/api/invitations/[token]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/hash";
import { isTokenExpired } from "@/lib/auth/token";

const RedeemSchema = z.object({
  name: z.string().min(1).max(100),
  password: z.string().min(10).max(200),
});

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const body = RedeemSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const invite = await prisma.invitation.findUnique({ where: { token } });
  if (!invite) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  if (invite.usedAt) return NextResponse.json({ error: "Already used" }, { status: 410 });
  if (isTokenExpired(invite.expiresAt)) {
    return NextResponse.json({ error: "Expired" }, { status: 410 });
  }

  const passwordHash = await hashPassword(body.data.password);

  const player = await prisma.$transaction(async (tx) => {
    const p = await tx.player.create({
      data: {
        name: body.data.name,
        email: invite.email,
        passwordHash,
        isAdmin: false,
      },
    });
    await tx.invitation.update({
      where: { token },
      data: { usedAt: new Date() },
    });
    return p;
  });

  return NextResponse.json({ id: player.id, email: player.email }, { status: 201 });
}
```

- [ ] **Step 3: Verify test passes**

Run: `pnpm test tests/integration/invitation-redeem.test.ts`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/invitations/\[token\]/route.ts tests/integration/invitation-redeem.test.ts
git commit -m "feat(api): add invitation redemption endpoint"
```

---

## Task 28: Game Day API — create/list/attendance/start

**Files:**
- Create: `src/app/api/game-days/route.ts`
- Create: `src/app/api/game-days/[id]/attendance/route.ts`
- Create: `src/app/api/game-days/[id]/start/route.ts`

- [ ] **Step 1: Create `src/app/api/game-days/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { createGameDay } from "@/lib/game-day/create";

const CreateSchema = z.object({ date: z.string() });

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const days = await prisma.gameDay.findMany({
    orderBy: { date: "desc" },
    include: {
      participants: { include: { player: { select: { id: true, name: true } } } },
    },
  });
  return NextResponse.json({ gameDays: days });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!session.user.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const day = await createGameDay(new Date(parsed.data.date), session.user.id);
  return NextResponse.json({ gameDay: day }, { status: 201 });
}
```

- [ ] **Step 2: Create `src/app/api/game-days/[id]/attendance/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { setAttendance } from "@/lib/game-day/attendance";

const Schema = z.object({ status: z.enum(["confirmed", "declined", "pending"]) });

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const updated = await setAttendance(id, session.user.id, parsed.data.status);
    return NextResponse.json({ participant: updated });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
```

- [ ] **Step 3: Create `src/app/api/game-days/[id]/start/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { lockRoster } from "@/lib/game-day/lock";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const day = await lockRoster(id, session.user.id);
    return NextResponse.json({ gameDay: day });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 409 });
  }
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/game-days
git commit -m "feat(api): add game-day list/create/attendance/start endpoints"
```

---

## Task 29: Match API — score, undo

**Files:**
- Create: `src/app/api/matches/[id]/route.ts`
- Create: `src/app/api/matches/[id]/undo/route.ts`

- [ ] **Step 1: Create `src/app/api/matches/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { enterScore, ScoreConflictError } from "@/lib/match/enter-score";

const Schema = z.object({
  team1Score: z.number().int().min(0),
  team2Score: z.number().int().min(0),
  expectedVersion: z.number().int().min(0),
});

export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const match = await enterScore({
      matchId: id,
      team1Score: body.data.team1Score,
      team2Score: body.data.team2Score,
      scoredBy: session.user.id,
      expectedVersion: body.data.expectedVersion,
    });
    return NextResponse.json({ match });
  } catch (err) {
    if (err instanceof ScoreConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 400 },
    );
  }
}
```

- [ ] **Step 2: Create `src/app/api/matches/[id]/undo/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { undoScore } from "@/lib/match/undo";

export async function POST(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { id } = await ctx.params;
  try {
    const match = await undoScore({ matchId: id, actorId: session.user.id });
    return NextResponse.json({ match });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 409 },
    );
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/matches
git commit -m "feat(api): add match score and undo endpoints"
```

---

## Task 30: Joker API + Ranking API

**Files:**
- Create: `src/app/api/jokers/route.ts`
- Create: `src/app/api/ranking/route.ts`

- [ ] **Step 1: Create `src/app/api/jokers/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { useJoker } from "@/lib/joker/use";

const Schema = z.object({ gameDayId: z.string().uuid() });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = Schema.safeParse(await req.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  try {
    const use = await useJoker({ playerId: session.user.id, gameDayId: body.data.gameDayId });
    return NextResponse.json({ jokerUse: use }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 409 },
    );
  }
}
```

- [ ] **Step 2: Create `src/app/api/ranking/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";

export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const season = await getOrCreateActiveSeason();
  const ranking = await computeRanking(season.id);
  return NextResponse.json({ season, ranking });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/jokers src/app/api/ranking
git commit -m "feat(api): add Joker use and season ranking endpoints"
```

---

## Task 31: Login page

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/login/login-form.tsx`

- [ ] **Step 1: Create `src/app/login/login-form.tsx`**

```typescript
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

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
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Login</h1>
      <label className="block">
        <span className="text-sm">E-Mail</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm">Passwort</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "..." : "Anmelden"}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Install next-auth/react helper**

Already installed via next-auth; verify `next-auth/react` is importable.

- [ ] **Step 3: Create `src/app/login/page.tsx`**

```typescript
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 4: Update `src/app/page.tsx` to redirect based on auth**

```typescript
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function HomePage() {
  const session = await auth();
  redirect(session ? "/ranking" : "/login");
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/login src/app/page.tsx
git commit -m "feat(ui): add login page with credentials form"
```

---

## Task 32: Invitation redemption page

**Files:**
- Create: `src/app/invite/[token]/page.tsx`
- Create: `src/app/invite/[token]/invite-form.tsx`

- [ ] **Step 1: Create `src/app/invite/[token]/invite-form.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function InviteForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/invitations/${token}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler beim Speichern");
      return;
    }
    router.push("/login");
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto max-w-sm space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Konto einrichten</h1>
      <label className="block">
        <span className="text-sm">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      <label className="block">
        <span className="text-sm">Passwort (min. 10 Zeichen)</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={10}
          autoComplete="new-password"
          className="mt-1 w-full rounded border px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" className="w-full rounded bg-black px-4 py-2 text-white">
        Konto erstellen
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Create `src/app/invite/[token]/page.tsx`**

```typescript
import { InviteForm } from "./invite-form";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main className="flex min-h-screen items-center justify-center">
      <InviteForm token={token} />
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/invite
git commit -m "feat(ui): add invitation redemption page"
```

---

## Task 33: Ranking page

**Files:**
- Create: `src/app/ranking/page.tsx`
- Create: `src/components/ranking-table.tsx`

- [ ] **Step 1: Create `src/components/ranking-table.tsx`**

```typescript
import type { RankingRow } from "@/lib/ranking/compute";

export function RankingTable({ ranking }: { ranking: RankingRow[] }) {
  if (ranking.length === 0) {
    return <p className="py-8 text-center text-muted-foreground">Noch keine Spiele in dieser Saison.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b text-left">
        <tr>
          <th className="py-2">#</th>
          <th>Spieler</th>
          <th className="text-right">Spiele</th>
          <th className="text-right">Punkte</th>
          <th className="text-right">ppS</th>
          <th className="text-right">Joker</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((r) => (
          <tr key={r.playerId} className="border-b last:border-b-0">
            <td className="py-2">{r.rank}</td>
            <td>{r.playerName}</td>
            <td className="text-right">{r.games}</td>
            <td className="text-right">{r.points.toFixed(0)}</td>
            <td className="text-right font-medium">{r.pointsPerGame.toFixed(2)}</td>
            <td className="text-right">{r.jokersUsed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Create `src/app/ranking/page.tsx`**

```typescript
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
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rangliste {season.year}</h1>
        <nav className="space-x-4 text-sm">
          <a href="/game-day">Spieltag</a>
          {session.user.isAdmin && <a href="/admin">Admin</a>}
        </nav>
      </div>
      <RankingTable ranking={ranking} />
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/ranking src/components/ranking-table.tsx
git commit -m "feat(ui): add ranking page"
```

---

## Task 34: Current Game Day page (attendance + matches)

**Files:**
- Create: `src/app/game-day/page.tsx`
- Create: `src/app/game-day/attendance-widget.tsx`
- Create: `src/app/game-day/match-list.tsx`
- Create: `src/app/game-day/score-dialog.tsx`

- [ ] **Step 1: Create `src/app/game-day/attendance-widget.tsx`**

```typescript
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AttendanceWidget({
  gameDayId,
  current,
}: {
  gameDayId: string;
  current: "pending" | "confirmed" | "declined" | "joker";
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function set(status: "confirmed" | "declined") {
    setLoading(true);
    await fetch(`/api/game-days/${gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="flex gap-2">
      <button
        onClick={() => set("confirmed")}
        disabled={loading || current === "confirmed"}
        className={`rounded border px-3 py-1 ${current === "confirmed" ? "bg-green-100" : ""}`}
      >
        Ich komme
      </button>
      <button
        onClick={() => set("declined")}
        disabled={loading || current === "declined"}
        className={`rounded border px-3 py-1 ${current === "declined" ? "bg-red-100" : ""}`}
      >
        Nein
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/game-day/score-dialog.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  matchId: string;
  format: "first-to-3" | "first-to-6";
  expectedVersion: number;
  onClose: () => void;
}

export function ScoreDialog({ matchId, format, expectedVersion, onClose }: Props) {
  const router = useRouter();
  const [team1, setTeam1] = useState(0);
  const [team2, setTeam2] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const presets =
    format === "first-to-3"
      ? [[3, 0], [3, 1], [3, 2], [2, 3], [1, 3], [0, 3]]
      : [];

  async function submit(t1: number, t2: number) {
    setError(null);
    const res = await fetch(`/api/matches/${matchId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team1Score: t1, team2Score: t2, expectedVersion }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler");
      return;
    }
    router.refresh();
    onClose();
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <div className="w-80 space-y-4 rounded bg-white p-6">
        <h3 className="text-lg font-semibold">Ergebnis eintragen</h3>
        {format === "first-to-3" ? (
          <div className="grid grid-cols-3 gap-2">
            {presets.map(([a, b]) => (
              <button
                key={`${a}-${b}`}
                onClick={() => submit(a, b)}
                className="rounded border px-2 py-2"
              >
                {a}:{b}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <input
              type="number"
              value={team1}
              onChange={(e) => setTeam1(Number(e.target.value))}
              className="w-16 rounded border px-2 py-1 text-center"
            />
            <span>:</span>
            <input
              type="number"
              value={team2}
              onChange={(e) => setTeam2(Number(e.target.value))}
              className="w-16 rounded border px-2 py-1 text-center"
            />
            <button
              onClick={() => submit(team1, team2)}
              className="rounded bg-black px-3 py-1 text-white"
            >
              OK
            </button>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button onClick={onClose} className="text-sm underline">
          Abbrechen
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/game-day/match-list.tsx`**

```typescript
"use client";
import { useState } from "react";

interface MatchView {
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

export function MatchList({ format, matches }: { format: "first-to-3" | "first-to-6"; matches: MatchView[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = matches.find((m) => m.id === openId);

  return (
    <ul className="divide-y">
      {matches.map((m) => {
        const hasScore = m.team1Score !== null;
        return (
          <li key={m.id} className="flex items-center justify-between py-3">
            <div>
              <span className="font-mono text-sm text-muted-foreground">#{m.matchNumber}</span>
              <span className="ml-3">
                {m.team1A} + {m.team1B} <span className="mx-2">vs</span> {m.team2A} + {m.team2B}
              </span>
            </div>
            {hasScore ? (
              <span className="font-semibold">
                {m.team1Score}:{m.team2Score}
              </span>
            ) : (
              <button
                onClick={() => setOpenId(m.id)}
                className="rounded border px-3 py-1 text-sm"
              >
                Eintragen
              </button>
            )}
          </li>
        );
      })}
      {open && (
        <ScoreDialog
          matchId={open.id}
          format={format}
          expectedVersion={open.version}
          onClose={() => setOpenId(null)}
        />
      )}
    </ul>
  );
}

import { ScoreDialog } from "./score-dialog";
```

- [ ] **Step 4: Create `src/app/game-day/page.tsx`**

```typescript
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { AttendanceWidget } from "./attendance-widget";
import { MatchList } from "./match-list";

export const dynamic = "force-dynamic";

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
      <main className="mx-auto max-w-3xl p-6">
        <h1 className="text-2xl font-semibold">Kein aktiver Spieltag</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Ein Admin muss zuerst einen Spieltag anlegen.
        </p>
      </main>
    );
  }

  const me = day.participants.find((p) => p.playerId === session.user.id);
  const format = day.playerCount === 4 ? "first-to-6" : "first-to-3";

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Spieltag {new Date(day.date).toLocaleDateString("de-DE")}
        </h1>
        <p className="text-sm text-muted-foreground">Status: {day.status}</p>
      </header>

      {day.status === "planned" && me && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Bist du dabei?</h2>
          <AttendanceWidget gameDayId={day.id} current={me.attendance} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-medium">Teilnehmer</h2>
        <ul className="text-sm">
          {day.participants.map((p) => (
            <li key={p.id}>
              {p.player.name} — {p.attendance}
            </li>
          ))}
        </ul>
      </section>

      {day.matches.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-medium">Spiele</h2>
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
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/game-day
git commit -m "feat(ui): add current game-day page with attendance and match list"
```

---

## Task 35: Admin page — players + invitations

**Files:**
- Create: `src/app/admin/page.tsx`
- Create: `src/app/admin/invite-form.tsx`
- Create: `src/app/admin/create-game-day-form.tsx`
- Create: `src/app/admin/start-game-day-button.tsx`

- [ ] **Step 1: Create `src/app/admin/invite-form.tsx`**

```typescript
"use client";
import { useState } from "react";

export function InviteForm() {
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setUrl(null);
    const res = await fetch("/api/invitations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error ?? "Fehler");
      return;
    }
    setUrl(body.url);
    setEmail("");
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="neue@email.de"
          required
          className="flex-1 rounded border px-3 py-2"
        />
        <button className="rounded bg-black px-4 py-2 text-white">Einladen</button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {url && (
        <p className="break-all rounded bg-muted p-2 text-xs">
          Einladungslink: <code>{url}</code>
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 2: Create `src/app/admin/create-game-day-form.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function CreateGameDayForm() {
  const router = useRouter();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/game-days", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        required
        className="rounded border px-3 py-2"
      />
      <button className="rounded bg-black px-4 py-2 text-white">Spieltag anlegen</button>
      {error && <span className="text-sm text-red-600">{error}</span>}
    </form>
  );
}
```

- [ ] **Step 3: Create `src/app/admin/start-game-day-button.tsx`**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export function StartGameDayButton({ gameDayId }: { gameDayId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function click() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/start`, { method: "POST" });
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? "Fehler");
      return;
    }
    router.push("/game-day");
  }

  return (
    <>
      <button
        onClick={click}
        disabled={loading}
        className="rounded bg-green-600 px-3 py-1 text-sm text-white"
      >
        {loading ? "..." : "Spieltag starten"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );
}
```

- [ ] **Step 4: Create `src/app/admin/page.tsx`**

```typescript
import { auth } from "@/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { InviteForm } from "./invite-form";
import { CreateGameDayForm } from "./create-game-day-form";
import { StartGameDayButton } from "./start-game-day-button";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!session.user.isAdmin) redirect("/ranking");

  const players = await prisma.player.findMany({ orderBy: { name: "asc" } });
  const openInvites = await prisma.invitation.findMany({
    where: { usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  const plannedDay = await prisma.gameDay.findFirst({
    where: { status: "planned" },
    orderBy: { date: "desc" },
  });

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <nav className="text-sm">
          <a href="/ranking" className="mr-4">Rangliste</a>
          <a href="/game-day">Spieltag</a>
        </nav>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Spieltag</h2>
        <CreateGameDayForm />
        {plannedDay && (
          <div className="flex items-center gap-3">
            <span className="text-sm">
              Offener Spieltag: {new Date(plannedDay.date).toLocaleDateString("de-DE")}
            </span>
            <StartGameDayButton gameDayId={plannedDay.id} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Spieler einladen</h2>
        <InviteForm />
        {openInvites.length > 0 && (
          <div>
            <h3 className="text-sm font-medium">Offene Einladungen</h3>
            <ul className="text-sm">
              {openInvites.map((i) => (
                <li key={i.id}>
                  {i.email} — läuft ab am {new Date(i.expiresAt).toLocaleDateString("de-DE")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-medium">Spielerliste</h2>
        <ul className="mt-2 text-sm">
          {players.map((p) => (
            <li key={p.id}>
              {p.name} ({p.email}) {p.isAdmin && <span className="text-xs">· Admin</span>}
              {p.deletedAt && <span className="text-xs"> · entfernt</span>}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/admin
git commit -m "feat(ui): add admin page with invite + game-day controls"
```

---

## Task 36: First-admin bootstrap via CLI

**Files:**
- Create: `scripts/bootstrap-admin.ts`
- Modify: `package.json` scripts

- [ ] **Step 1: Create `scripts/bootstrap-admin.ts`**

```typescript
import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth/hash";
import { randomBytes } from "node:crypto";

async function main() {
  const email = process.argv[2];
  const name = process.argv[3];
  if (!email || !name) {
    console.error("Usage: pnpm bootstrap:admin <email> <name>");
    process.exit(1);
  }
  const existing = await prisma.player.findUnique({ where: { email } });
  if (existing) {
    console.error(`Player with email ${email} already exists`);
    process.exit(1);
  }
  const password = randomBytes(12).toString("base64url");
  const hash = await hashPassword(password);
  await prisma.player.create({
    data: { name, email, passwordHash: hash, isAdmin: true },
  });
  console.log(`Created admin ${email}.`);
  console.log(`Temporary password: ${password}`);
  console.log(`Login at /login and change it later.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add script to `package.json`**

Add inside `scripts`:
```json
"bootstrap:admin": "tsx scripts/bootstrap-admin.ts"
```

- [ ] **Step 3: Test locally**

Run:
```bash
pnpm bootstrap:admin test@example.com "Test Admin"
```

Expected: prints temporary password. Verify player exists in DB.

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-admin.ts package.json
git commit -m "feat(scripts): add admin bootstrap CLI"
```

---

## Task 37: Historical import script skeleton

**Files:**
- Create: `scripts/import-historical.ts`, `docs/import-historical.md`

- [ ] **Step 1: Create `scripts/import-historical.ts`**

```typescript
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/db";
import { getOrCreateActiveSeason } from "../src/lib/season";

interface HistoricalGameDay {
  date: string;
  playerCount: 4 | 5 | 6;
  matches: Array<{
    matchNumber: number;
    team1: [string, string];
    team2: [string, string];
    team1Score: number;
    team2Score: number;
  }>;
}

interface HistoricalExport {
  players: Array<{ name: string; email: string }>;
  gameDays: HistoricalGameDay[];
}

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: pnpm import:historical <path-to-export.json>");
    process.exit(1);
  }
  const data = JSON.parse(readFileSync(path, "utf-8")) as HistoricalExport;
  const season = await getOrCreateActiveSeason();

  const playerByName = new Map<string, string>();
  for (const raw of data.players) {
    const p = await prisma.player.upsert({
      where: { email: raw.email },
      create: { name: raw.name, email: raw.email, passwordHash: null },
      update: { name: raw.name },
    });
    playerByName.set(raw.name, p.id);
  }

  for (const gd of data.gameDays) {
    const day = await prisma.gameDay.create({
      data: {
        seasonId: season.id,
        date: new Date(gd.date),
        playerCount: gd.playerCount,
        status: "finished",
      },
    });
    for (const m of gd.matches) {
      await prisma.match.create({
        data: {
          gameDayId: day.id,
          matchNumber: m.matchNumber,
          team1PlayerAId: must(playerByName.get(m.team1[0]), m.team1[0]),
          team1PlayerBId: must(playerByName.get(m.team1[1]), m.team1[1]),
          team2PlayerAId: must(playerByName.get(m.team2[0]), m.team2[0]),
          team2PlayerBId: must(playerByName.get(m.team2[1]), m.team2[1]),
          team1Score: m.team1Score,
          team2Score: m.team2Score,
        },
      });
    }
    console.log(`Imported ${gd.date}: ${gd.matches.length} matches`);
  }
}

function must(value: string | undefined, name: string): string {
  if (!value) throw new Error(`Unknown player: ${name}`);
  return value;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

- [ ] **Step 2: Add script to `package.json`**

Add:
```json
"import:historical": "tsx scripts/import-historical.ts"
```

- [ ] **Step 3: Create `docs/import-historical.md`**

```markdown
# Historical Data Import

Imports the pre-MVP spreadsheet data into the database.

## Expected Input Format

A JSON file with this shape:

```json
{
  "players": [
    { "name": "Paul", "email": "paul@example.com" },
    { "name": "Werner", "email": "werner@example.com" }
  ],
  "gameDays": [
    {
      "date": "2026-01-07",
      "playerCount": 5,
      "matches": [
        {
          "matchNumber": 1,
          "team1": ["Paul", "Werner"],
          "team2": ["Rene", "Thomas"],
          "team1Score": 3,
          "team2Score": 0
        }
      ]
    }
  ]
}
```

## Notes

- Imported players have `passwordHash = null`; invite them via the admin panel to let them log in.
- Import is idempotent on player email (upserts), but not on game days — reset the DB before re-running if needed.
- Match pairings are taken as-is. They do not have to match the template — this is historical data.

## Running

```bash
pnpm import:historical ./data/historical-export.json
```
```

- [ ] **Step 4: Commit**

```bash
git add scripts/import-historical.ts docs/import-historical.md package.json
git commit -m "feat(scripts): add historical data import skeleton + docs"
```

---

## Task 38: README + local-dev instructions

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# Padel Tracker

Webapp that replaces the group's paper scoresheets and XLSX ranking for Tuesday-night padel sessions. Supports 4, 5, or 6 players with balanced pairing schedules and a season-long ranking with Joker mechanics.

## Tech Stack

- Next.js 15 + React 19 + TypeScript
- Tailwind CSS 4
- Prisma + PostgreSQL 16
- Auth.js v5 (credentials)
- Vitest for unit + integration tests

## Prerequisites

- Node.js 22 LTS
- pnpm 9+
- Docker + Docker Compose

## Local Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Copy env template and fill in secrets:
   ```bash
   cp .env.example .env
   # Generate AUTH_SECRET: openssl rand -base64 32
   ```

3. Start local Postgres:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   ```

4. Run migrations:
   ```bash
   pnpm db:migrate
   ```

5. Create the first admin:
   ```bash
   pnpm bootstrap:admin you@example.com "Your Name"
   ```
   Note the printed password.

6. Start the dev server:
   ```bash
   pnpm dev
   ```

7. Open http://localhost:3000 and log in.

## Common Tasks

- Run all tests: `pnpm test`
- Watch tests: `pnpm test:watch`
- Reset DB: `pnpm db:reset`
- Regenerate Prisma client: `pnpm db:generate`
- Import historical data: `pnpm import:historical <path.json>` (see `docs/import-historical.md`)

## Project Layout

- `prisma/` — database schema + migrations
- `src/app/` — Next.js App Router pages + API routes
- `src/lib/` — pure logic (pairings, match, ranking, joker, auth helpers)
- `src/components/` — shared UI
- `tests/unit/` — pure-logic tests (Vitest)
- `tests/integration/` — DB-backed tests (Vitest + Docker Postgres)
- `scripts/` — one-off CLI scripts
- `docs/superpowers/` — design spec + implementation plans

## Phase 1 Scope (MVP)

- Invitation-based login, password auth
- Attendance coordination per game day
- Balanced pairing generation for 4/5/6 players
- Match score entry with optimistic locking + 2-minute undo
- Season ranking with points-per-game sort
- Joker mechanic (2 per season, ppg snapshot)
- Admin panel for player invitations + game-day lifecycle

Phase 2 (Telegram bot + realtime) and Phase 3 (PWA, extended stats, deployment) follow in separate plans.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup instructions and project overview"
```

---

## Completion Criteria

Phase 1 is complete when:

1. `pnpm test` runs green (all unit + integration tests pass)
2. `pnpm build` succeeds without errors or warnings
3. Local manual smoke test passes:
   - Bootstrap admin works
   - Admin logs in
   - Admin invites a second player; redemption works
   - Admin creates a game day
   - Both players confirm attendance
   - Admin starts the game day (5 players would need 3 more, so test with 4 invited players)
   - Scores are entered via UI; ranking updates
   - Undo works within the window
   - Joker can be used before the game day starts

## Out of Scope for Phase 1 (planned in later phases)

- Telegram bot integration
- SSE/real-time updates
- PWA manifest / offline handling
- Extended stats (head-to-head, partner matrix, profile graphs)
- Cron jobs (weekly polls, reminders, automated backups)
- Production deployment (Docker Compose + Caddy on VPS)
- Monitoring/health checks
