# UI Relaunch (Dark Premium) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Liefere einen sichtbar „neuen" Padel Tracker: Dark-Premium-Farbsystem, neues Dashboard als Startseite, 4-Tab-Navigation, Timeline-basierter Spieltag-Bildschirm mit Inline-Stepper-Matchscores.

**Architecture:** Reine Frontend-Änderung. Neue CSS-Tokens in `globals.css`, erweiterte UI-Primitives, vier neue Komponenten (`Timeline`, `Stepper`, `StatTile`, `AvatarStack`), neue Dashboard-Seite unter `/`, restrukturierte Spieltag-Seite mit Phasen-Sektionen. Keine API-, DB- oder Business-Logik-Änderungen.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript 6 strict, Tailwind v4 (`@theme inline`), Prisma 6, `lucide-react` für Icons, `@dnd-kit/core` (bereits integriert), Vitest + `@testing-library/react` für Unit-Tests.

**Spec:** [`docs/superpowers/specs/2026-04-21-ui-relaunch-dark-premium-design.md`](../specs/2026-04-21-ui-relaunch-dark-premium-design.md)

**Konventionen:**
- Tests liegen unter `tests/unit/components/*.test.tsx`.
- Commit-Nachrichten in Englisch, Präfix passend zur Art (`feat:`, `refactor:`, `style:`).
- Nach jedem abgeschlossenen Task: `pnpm tsc --noEmit` und `pnpm vitest run` grün.
- Nie `--no-verify` verwenden; wenn ein Hook scheitert, Ursache fixen.

---

## Task 1: Design-Tokens (Dark Premium)

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Tokens ersetzen**

Ersetze den Inhalt von `src/app/globals.css` vollständig durch:

```css
@import "tailwindcss";

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-foreground-muted: var(--foreground-muted);
  --color-foreground-dim: var(--foreground-dim);
  --color-surface: var(--surface);
  --color-surface-muted: var(--surface-muted);
  --color-surface-elevated: var(--surface-elevated);
  --color-border: var(--border);
  --color-border-strong: var(--border-strong);
  --color-primary: var(--primary);
  --color-primary-strong: var(--primary-strong);
  --color-primary-soft: var(--primary-soft);
  --color-muted-foreground: var(--foreground-muted);
  --color-destructive: var(--destructive);
  --color-destructive-soft: var(--destructive-soft);
  --color-success: var(--success);
  --color-success-soft: var(--success-soft);
}

:root {
  --background: #0b1220;
  --foreground: #f1f5f9;
  --foreground-muted: #94a3b8;
  --foreground-dim: #64748b;
  --surface: #111a2e;
  --surface-muted: #0f1a2f;
  --surface-elevated: #1a2440;
  --border: #1e293b;
  --border-strong: #334155;
  --primary: #22d3ee;
  --primary-strong: #06b6d4;
  --primary-soft: rgba(34, 211, 238, 0.15);
  --destructive: #f43f5e;
  --destructive-soft: rgba(244, 63, 94, 0.15);
  --success: #bef264;
  --success-soft: rgba(163, 230, 53, 0.15);
  --hero-gradient: linear-gradient(135deg, #0e7490 0%, #134e4a 100%);
  --cta-gradient: linear-gradient(90deg, #06b6d4, #22d3ee);
  color-scheme: dark;
}

body {
  background: var(--background);
  color: var(--foreground);
  font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
  font-feature-settings: "cv11", "ss01";
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

Der alte `--primary-hover` und `--primary-border` entfallen; dafür kommen `--primary-strong` und `--primary-soft` dazu. `--muted-foreground` bleibt als Alias auf `--foreground-muted`, damit bestehende `text-muted-foreground`-Verwendungen weiterhin kompilieren.

- [ ] **Step 2: TypeScript + Build prüfen**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm build`
Expected: Build ist erfolgreich. Warnungen zu nicht mehr existierenden Tokens (`primary-hover`, `primary-border`) sind möglich, werden aber in Task 2/3 beseitigt.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(theme): switch to dark premium design tokens"
```

---

## Task 2: Button — Dark-Premium-Varianten

**Files:**
- Modify: `src/components/ui/button.tsx`

- [ ] **Step 1: VARIANTS-Map ersetzen**

Öffne `src/components/ui/button.tsx` und ersetze den gesamten Inhalt durch:

```tsx
"use client";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "destructive";
type Size = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

const VARIANTS: Record<Variant, string> = {
  primary:
    "text-background bg-[image:var(--cta-gradient)] shadow-[0_6px_14px_-4px_rgba(34,211,238,0.35)] hover:brightness-110",
  secondary:
    "bg-surface text-foreground border border-border-strong hover:bg-surface-muted",
  ghost:
    "bg-transparent text-foreground border border-border-strong hover:bg-surface-muted",
  destructive:
    "bg-destructive-soft text-destructive border border-destructive/40 hover:bg-destructive/20",
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

`primary` nutzt jetzt das Cyan-Gradient als CTA. `ghost` bekommt einen dezenten Rahmen. `destructive` wird softer (nicht mehr voll rot), passend zum dunklen Hintergrund.

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/button.tsx
git commit -m "style(button): dark premium variants with CTA gradient"
```

---

## Task 3: Card — Hero- und Inset-Variante

**Files:**
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Card erweitern**

Ersetze `src/components/ui/card.tsx` durch:

```tsx
import type { HTMLAttributes } from "react";

type Variant = "default" | "hero" | "inset";

const VARIANTS: Record<Variant, string> = {
  default: "rounded-2xl bg-surface border border-border shadow-[0_2px_8px_-4px_rgba(0,0,0,0.5)]",
  hero: "rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)]",
  inset: "rounded-xl bg-surface-muted border border-border",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: Variant;
}

export function Card({ variant = "default", className = "", ...rest }: CardProps) {
  return <div {...rest} className={`${VARIANTS[variant]} ${className}`.trim()} />;
}

export function CardHeader({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`px-5 pt-5 ${className}`.trim()} />;
}

export function CardBody({ className = "", ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={`p-5 ${className}`.trim()} />;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler. `Card`-Verwendungen ohne `variant` funktionieren weiterhin (Default bleibt).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/card.tsx
git commit -m "style(card): add hero and inset variants"
```

---

## Task 4: Badge — Chip-Varianten

**Files:**
- Modify: `src/components/ui/badge.tsx`

- [ ] **Step 1: VARIANTS-Map austauschen**

Ersetze `src/components/ui/badge.tsx` durch:

```tsx
import type { HTMLAttributes } from "react";

type Variant = "primary" | "neutral" | "success" | "destructive" | "soft" | "lime";

const BASE =
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tracking-wide";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary-soft text-primary border border-primary/30",
  neutral: "bg-surface-muted text-foreground-muted border border-border",
  success: "bg-success-soft text-success border border-success/40",
  destructive: "bg-destructive-soft text-destructive border border-destructive/40",
  soft: "bg-surface-muted text-foreground-muted",
  lime: "bg-success-soft text-success border border-success/40",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
}

export function Badge({ variant = "primary", className = "", ...rest }: BadgeProps) {
  return <span {...rest} className={`${BASE} ${VARIANTS[variant]} ${className}`.trim()} />;
}
```

`lime` ist ein Alias auf `success` für semantisch "bestätigt"-Kontexte. `soft` ist ein neutraler, rahmenloser Chip.

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/badge.tsx
git commit -m "style(badge): dark premium chip variants"
```

---

## Task 5: Input & Dialog Dark-Politur

**Files:**
- Read: `src/components/ui/input.tsx`, `src/components/ui/dialog.tsx`
- Modify: dieselben Dateien

- [ ] **Step 1: Input-Stile setzen**

Öffne `src/components/ui/input.tsx` und stelle sicher, dass der Input diese Klassen nutzt. Ersetze die Datei durch:

```tsx
"use client";
import type { InputHTMLAttributes } from "react";

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={`w-full rounded-xl border border-border-strong bg-surface-muted px-3 py-2 text-sm text-foreground placeholder:text-foreground-dim focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background ${className}`.trim()}
    />
  );
}

export function Label({ className = "", ...rest }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label {...rest} className={`text-sm font-medium text-foreground ${className}`.trim()} />;
}
```

- [ ] **Step 2: Dialog-Backdrop dunkler**

Öffne `src/components/ui/dialog.tsx`. Suche die Backdrop-Klasse (vermutlich `bg-black/50` oder `bg-slate-900/50`) und ändere sie zu `bg-black/70`. Suche die Panel-Klasse (`bg-white`, `bg-surface` o. ä.) und ersetze sie durch `bg-surface-elevated border border-border-strong text-foreground`.

Falls der Dialog bereits einen Props-basierten Class-Aufbau hat, passe nur die Default-Klassen an. Die Interaktion (Escape, Backdrop-Click) bleibt unverändert.

- [ ] **Step 3: Typecheck + visueller Smoke-Test**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm dev`
Öffne `http://localhost:3000/login`. Erwartet: dunkler Hintergrund, Inputs mit dunkler Fläche und Cyan-Fokusring.
Stoppe den Dev-Server.

- [ ] **Step 4: Commit**

```bash
git add src/components/ui/input.tsx src/components/ui/dialog.tsx
git commit -m "style(input,dialog): dark premium surface"
```

---

## Task 6: Neue Primitive — Timeline

**Files:**
- Create: `src/components/ui/timeline.tsx`
- Create: `tests/unit/components/timeline.test.tsx`

- [ ] **Step 1: Failing Test schreiben**

Erzeuge `tests/unit/components/timeline.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Timeline } from "@/components/ui/timeline";

describe("Timeline", () => {
  const steps = [
    { id: "a", label: "Geplant", status: "done" as const },
    { id: "b", label: "Roster", status: "current" as const },
    { id: "c", label: "Matches", status: "upcoming" as const },
    { id: "d", label: "Fertig", status: "upcoming" as const },
  ];

  it("renders a label for each step", () => {
    render(<Timeline steps={steps} />);
    expect(screen.getByText("Geplant")).toBeInTheDocument();
    expect(screen.getByText("Roster")).toBeInTheDocument();
    expect(screen.getByText("Matches")).toBeInTheDocument();
    expect(screen.getByText("Fertig")).toBeInTheDocument();
  });

  it("marks the current step with aria-current", () => {
    render(<Timeline steps={steps} />);
    const current = screen.getByText("Roster").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-current", "step");
  });

  it("sets aria-label describing position and status", () => {
    render(<Timeline steps={steps} />);
    const current = screen.getByText("Roster").closest("[aria-current]");
    expect(current).toHaveAttribute("aria-label", "Schritt 2 von 4, Roster, aktuell");
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `pnpm vitest run tests/unit/components/timeline.test.tsx`
Expected: FAIL — „Cannot find module '@/components/ui/timeline'".

- [ ] **Step 3: Komponente implementieren**

Erzeuge `src/components/ui/timeline.tsx`:

```tsx
import type { HTMLAttributes } from "react";

export type TimelineStepStatus = "done" | "current" | "upcoming";

export interface TimelineStep {
  id: string;
  label: string;
  status: TimelineStepStatus;
}

const STATUS_LABEL: Record<TimelineStepStatus, string> = {
  done: "erledigt",
  current: "aktuell",
  upcoming: "kommend",
};

const DOT_CLASS: Record<TimelineStepStatus, string> = {
  done: "bg-primary border-primary",
  current: "bg-primary border-primary shadow-[0_0_0_4px_rgba(34,211,238,0.25)]",
  upcoming: "bg-surface-muted border-border-strong",
};

const LABEL_CLASS: Record<TimelineStepStatus, string> = {
  done: "text-primary",
  current: "text-primary",
  upcoming: "text-foreground-dim",
};

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  steps: TimelineStep[];
}

export function Timeline({ steps, className = "", ...rest }: TimelineProps) {
  return (
    <ol
      {...rest}
      className={`flex items-start gap-1 ${className}`.trim()}
      aria-label="Fortschritt"
    >
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const nextDone = !isLast && steps[index + 1]!.status !== "upcoming";
        return (
          <li
            key={step.id}
            className="flex flex-1 items-start"
            aria-current={step.status === "current" ? "step" : undefined}
            aria-label={`Schritt ${index + 1} von ${steps.length}, ${step.label}, ${STATUS_LABEL[step.status]}`}
          >
            <div className="flex flex-1 flex-col items-center gap-1">
              <span
                className={`h-3 w-3 rounded-full border-2 ${DOT_CLASS[step.status]}`}
                aria-hidden="true"
              />
              <span
                className={`text-[0.65rem] font-semibold uppercase tracking-wider ${LABEL_CLASS[step.status]}`}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <span
                aria-hidden="true"
                className={`mt-[5px] h-[2px] w-4 ${nextDone ? "bg-primary" : "bg-border-strong"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
```

- [ ] **Step 4: Test grün**

Run: `pnpm vitest run tests/unit/components/timeline.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/timeline.tsx tests/unit/components/timeline.test.tsx
git commit -m "feat(ui): add Timeline primitive with aria-current"
```

---

## Task 7: Neue Primitive — Stepper

**Files:**
- Create: `src/components/ui/stepper.tsx`
- Create: `tests/unit/components/stepper.test.tsx`

- [ ] **Step 1: Failing Test schreiben**

Erzeuge `tests/unit/components/stepper.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Stepper } from "@/components/ui/stepper";

describe("Stepper", () => {
  it("renders the current value", () => {
    render(<Stepper value={4} onChange={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("4");
  });

  it("calls onChange with value+1 on plus", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={4} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /erhöhen/i }));
    expect(handleChange).toHaveBeenCalledWith(5);
  });

  it("calls onChange with value-1 on minus", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={4} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /verringern/i }));
    expect(handleChange).toHaveBeenCalledWith(3);
  });

  it("clamps to max", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={9} max={9} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /erhöhen/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });

  it("clamps to min", async () => {
    const handleChange = vi.fn();
    render(<Stepper value={0} min={0} onChange={handleChange} />);
    await userEvent.click(screen.getByRole("button", { name: /verringern/i }));
    expect(handleChange).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `pnpm vitest run tests/unit/components/stepper.test.tsx`
Expected: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Komponente implementieren**

Erzeuge `src/components/ui/stepper.tsx`:

```tsx
"use client";

export interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  label?: string;
}

export function Stepper({ value, min = 0, max = 9, onChange, label }: StepperProps) {
  const canDec = value > min;
  const canInc = value < max;
  return (
    <div className="inline-flex items-center gap-1.5" role="group" aria-label={label ?? "Wert"}>
      <button
        type="button"
        aria-label="Wert verringern"
        disabled={!canDec}
        onClick={() => canDec && onChange(value - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border-strong bg-surface-muted text-base font-bold text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <span
        role="status"
        aria-live="polite"
        className="min-w-[38px] rounded-md border border-primary bg-surface-muted px-2 py-0.5 text-center text-base font-extrabold tabular-nums text-primary"
      >
        {value}
      </span>
      <button
        type="button"
        aria-label="Wert erhöhen"
        disabled={!canInc}
        onClick={() => canInc && onChange(value + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-md border border-border-strong bg-surface-muted text-base font-bold text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
      >
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Test grün**

Run: `pnpm vitest run tests/unit/components/stepper.test.tsx`
Expected: PASS (5/5).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/stepper.tsx tests/unit/components/stepper.test.tsx
git commit -m "feat(ui): add Stepper primitive"
```

---

## Task 8: Neue Primitive — StatTile

**Files:**
- Create: `src/components/ui/stat-tile.tsx`
- Create: `tests/unit/components/stat-tile.test.tsx`

- [ ] **Step 1: Failing Test schreiben**

Erzeuge `tests/unit/components/stat-tile.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatTile } from "@/components/ui/stat-tile";

describe("StatTile", () => {
  it("renders label and value", () => {
    render(<StatTile label="Dein PPG" value="1.95" />);
    expect(screen.getByText("Dein PPG")).toBeInTheDocument();
    expect(screen.getByText("1.95")).toBeInTheDocument();
  });

  it("renders hint text when provided", () => {
    render(<StatTile label="Rang" value="#3" hint="von 8 Spielern" />);
    expect(screen.getByText("von 8 Spielern")).toBeInTheDocument();
  });

  it("renders dash when value is null", () => {
    render(<StatTile label="Dein PPG" value={null} />);
    expect(screen.getByText("–")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `pnpm vitest run tests/unit/components/stat-tile.test.tsx`
Expected: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Komponente implementieren**

Erzeuge `src/components/ui/stat-tile.tsx`:

```tsx
export type StatTileTone = "primary" | "lime";

export interface StatTileProps {
  label: string;
  value: string | null;
  hint?: string;
  tone?: StatTileTone;
}

const TONE_CLASS: Record<StatTileTone, string> = {
  primary: "text-primary",
  lime: "text-success",
};

export function StatTile({ label, value, hint, tone = "primary" }: StatTileProps) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <div className={`text-2xl font-extrabold tabular-nums ${TONE_CLASS[tone]}`}>
        {value ?? "–"}
      </div>
      <div className="mt-1 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        {label}
      </div>
      {hint && <div className="mt-0.5 text-xs text-foreground-dim">{hint}</div>}
    </div>
  );
}
```

- [ ] **Step 4: Test grün**

Run: `pnpm vitest run tests/unit/components/stat-tile.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/stat-tile.tsx tests/unit/components/stat-tile.test.tsx
git commit -m "feat(ui): add StatTile primitive"
```

---

## Task 9: Neue Primitive — AvatarStack

**Files:**
- Create: `src/components/ui/avatar-stack.tsx`
- Create: `tests/unit/components/avatar-stack.test.tsx`

- [ ] **Step 1: Failing Test schreiben**

Erzeuge `tests/unit/components/avatar-stack.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AvatarStack } from "@/components/ui/avatar-stack";

describe("AvatarStack", () => {
  it("renders initials for each name up to max", () => {
    render(<AvatarStack names={["Anna", "Ben", "Clara"]} max={5} />);
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
  });

  it("shows a +N overflow chip when names exceed max", () => {
    render(<AvatarStack names={["Anna", "Ben", "Clara", "Daniel", "Eva", "Franz", "Greta"]} max={4} />);
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("uses names in aria-label", () => {
    render(<AvatarStack names={["Anna", "Ben"]} max={5} />);
    expect(screen.getByLabelText("Anna, Ben")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `pnpm vitest run tests/unit/components/avatar-stack.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Komponente implementieren**

Erzeuge `src/components/ui/avatar-stack.tsx`:

```tsx
export interface AvatarStackProps {
  names: string[];
  max?: number;
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

export function AvatarStack({ names, max = 5 }: AvatarStackProps) {
  const visible = names.slice(0, max);
  const overflow = Math.max(0, names.length - max);
  return (
    <div className="flex items-center" aria-label={names.join(", ")}>
      {visible.map((name, index) => (
        <span
          key={`${name}-${index}`}
          aria-hidden="true"
          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-surface-elevated text-[0.65rem] font-extrabold text-primary ${
            index === 0 ? "" : "-ml-1.5"
          }`}
        >
          {initial(name)}
        </span>
      ))}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          className="-ml-1.5 flex h-6 min-w-[1.5rem] items-center justify-center rounded-full border-2 border-background bg-surface-muted px-1 text-[0.65rem] font-extrabold text-foreground-muted"
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Test grün**

Run: `pnpm vitest run tests/unit/components/avatar-stack.test.tsx`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/avatar-stack.tsx tests/unit/components/avatar-stack.test.tsx
git commit -m "feat(ui): add AvatarStack primitive"
```

---

## Task 10: BottomTabs — 4 Tabs, Lucide-Icons

**Files:**
- Modify: `src/components/bottom-tabs.tsx`

- [ ] **Step 1: Komponente neu schreiben**

Ersetze `src/components/bottom-tabs.tsx` durch:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Trophy, CircleDot, Settings } from "lucide-react";
import type { ComponentType, SVGProps } from "react";

type Tab = { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };

const USER_TABS: Tab[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/ranking", label: "Rangliste", icon: Trophy },
  { href: "/game-day", label: "Spieltag", icon: CircleDot },
];

const ADMIN_TAB: Tab = { href: "/admin", label: "Admin", icon: Settings };

export function BottomTabs({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = isAdmin ? [...USER_TABS, ADMIN_TAB] : USER_TABS;

  return (
    <nav
      aria-label="Hauptnavigation"
      className="sticky bottom-0 z-40 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {tabs.map((t) => {
        const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-semibold transition-colors ${
              active ? "text-primary" : "text-foreground-muted"
            }`}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/bottom-tabs.tsx
git commit -m "refactor(shell): 4-tab bottom nav with lucide icons"
```

---

## Task 11: TopNav + UserMenu — Home-Link und Dark-Styling

**Files:**
- Modify: `src/components/top-nav.tsx`
- Modify: `src/components/user-menu.tsx`

- [ ] **Step 1: TopNav neu schreiben**

Ersetze `src/components/top-nav.tsx` durch:

```tsx
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserMenu } from "./user-menu";

type Item = { href: string; label: string };

const USER_ITEMS: Item[] = [
  { href: "/", label: "Home" },
  { href: "/ranking", label: "Rangliste" },
  { href: "/game-day", label: "Spieltag" },
];

const ADMIN_ITEM: Item = { href: "/admin", label: "Admin" };

export function TopNav({ isAdmin, name }: { isAdmin: boolean; name: string }) {
  const pathname = usePathname();
  const items = isAdmin ? [...USER_ITEMS, ADMIN_ITEM] : USER_ITEMS;

  return (
    <header className="hidden md:block sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-extrabold tracking-tight text-foreground">
          Padel Tracker
        </Link>
        <nav aria-label="Hauptnavigation" className="flex items-center gap-5">
          {items.map((i) => {
            const active = i.href === "/" ? pathname === "/" : pathname.startsWith(i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                aria-current={active ? "page" : undefined}
                className={`text-sm font-semibold transition-colors ${
                  active ? "text-primary" : "text-foreground-muted hover:text-foreground"
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

- [ ] **Step 2: UserMenu Dark-Styling**

Öffne `src/components/user-menu.tsx`. Finde die Avatar-Klasse (vermutlich `bg-primary text-white`) und ersetze sie durch `bg-surface-elevated text-primary border border-border-strong`. Finde die Dropdown-Panel-Klasse (vermutlich `bg-white` oder `bg-surface`) und ersetze sie durch `bg-surface-elevated border border-border-strong text-foreground`. Die „Abmelden"-Zeile soll `text-foreground hover:bg-surface-muted` nutzen.

Wenn die Struktur abweicht: Initialen sind oben links, Dropdown öffnet nach unten, enthält nur „Abmelden". Alles andere bleibt funktional (Click-outside, signOut).

- [ ] **Step 3: Typecheck**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/top-nav.tsx src/components/user-menu.tsx
git commit -m "refactor(shell): add Home link, dark premium header"
```

---

## Task 12: Dashboard — neue Startseite unter `/`

**Files:**
- Modify: `src/app/page.tsx`
- Create: `src/app/dashboard-hero.tsx`

- [ ] **Step 1: Hero-Client-Komponente anlegen**

Erzeuge `src/app/dashboard-hero.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type HeroState =
  | { kind: "none" }
  | { kind: "not-member"; gameDayId: string; date: string; time: string; confirmed: number; total: number }
  | {
      kind: "member";
      gameDayId: string;
      date: string;
      time: string;
      confirmed: number;
      total: number;
      attendance: "pending" | "confirmed" | "declined";
    };

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long" });
}

export function DashboardHero({ state, isAdmin }: { state: HeroState; isAdmin: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (state.kind === "none") {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Nächster Spieltag
        </div>
        <div className="mt-1 text-lg font-bold text-foreground">Noch kein Spieltag geplant</div>
        {isAdmin && (
          <Link
            href="/admin"
            className="mt-3 inline-block rounded-xl border border-border-strong px-3 py-2 text-sm font-semibold text-foreground hover:bg-surface-muted"
          >
            Spieltag anlegen
          </Link>
        )}
      </div>
    );
  }

  const confirmedChip = (
    <span className="text-[0.7rem] font-semibold text-primary-strong">
      {state.confirmed} / {state.total} bestätigt
    </span>
  );

  async function join() {
    if (state.kind !== "not-member") return;
    setBusy(true);
    const res = await fetch(`/api/game-days/${state.gameDayId}/join`, { method: "POST" });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  async function setStatus(next: "confirmed" | "declined" | "pending") {
    if (state.kind !== "member") return;
    setBusy(true);
    const res = await fetch(`/api/game-days/${state.gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
  }

  return (
    <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-5 shadow-[0_14px_30px_-12px_rgba(0,0,0,0.6)]">
      <div className="flex items-center justify-between">
        <Badge variant="primary">Nächster Spieltag</Badge>
        <span className="text-[0.7rem] font-semibold text-primary-strong">{state.time}</span>
      </div>
      <div className="mt-2 text-xl font-extrabold text-foreground">{formatDate(state.date)}</div>
      <div className="mt-1">{confirmedChip}</div>
      {state.kind === "not-member" ? (
        <Button className="mt-3 w-full" disabled={busy} onClick={join}>
          Teilnehmen
        </Button>
      ) : state.attendance === "confirmed" ? (
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" disabled>
            Dabei ✓
          </Button>
          <Button className="flex-1" variant="ghost" disabled={busy} onClick={() => setStatus("declined")}>
            Absagen
          </Button>
        </div>
      ) : (
        <Button className="mt-3 w-full" disabled={busy} onClick={() => setStatus("confirmed")}>
          Dabei sein
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Dashboard-Seite schreiben**

Ersetze `src/app/page.tsx` vollständig durch:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateActiveSeason } from "@/lib/season";
import { computeRanking } from "@/lib/ranking/compute";
import { StatTile } from "@/components/ui/stat-tile";
import { DashboardHero, type HeroState } from "./dashboard-hero";

export const dynamic = "force-dynamic";

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const season = await getOrCreateActiveSeason();
  const [ranking, plannedDay] = await Promise.all([
    computeRanking(season.id),
    prisma.gameDay.findFirst({
      where: { status: "planned" },
      orderBy: { date: "asc" },
      include: { participants: { select: { playerId: true, attendance: true } } },
    }),
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "";

  let heroState: HeroState;
  if (!plannedDay) {
    heroState = { kind: "none" };
  } else {
    const confirmed = plannedDay.participants.filter((p) => p.attendance === "confirmed").length;
    const total = plannedDay.participants.length;
    const date = plannedDay.date.toISOString();
    const time = formatTime(plannedDay.date.toISOString());
    const me = plannedDay.participants.find((p) => p.playerId === session.user.id);
    if (!me) {
      heroState = { kind: "not-member", gameDayId: plannedDay.id, date, time, confirmed, total };
    } else {
      const attendance =
        me.attendance === "confirmed" || me.attendance === "declined" ? me.attendance : "pending";
      heroState = {
        kind: "member",
        gameDayId: plannedDay.id,
        date,
        time,
        confirmed,
        total,
        attendance,
      };
    }
  }

  const myRow = ranking.find((r) => r.playerId === session.user.id);
  const myPpg = myRow ? myRow.ppg.toFixed(2) : null;
  const myRank = myRow ? `#${myRow.rank}` : null;

  const top3 = ranking.slice(0, 3);

  return (
    <div className="space-y-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
          Hi{firstName ? `, ${firstName}` : ""}
        </p>
        <h1 className="text-2xl font-bold text-foreground">Dein Padel</h1>
      </header>

      <DashboardHero state={heroState} isAdmin={session.user.isAdmin} />

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Dein PPG" value={myPpg} tone="primary" />
        <StatTile label="Rang" value={myRank} tone="lime" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
            Top 3
          </span>
          <Link href="/ranking" className="text-xs font-semibold text-primary">
            ansehen →
          </Link>
        </div>
        <ul className="mt-2 space-y-1">
          {top3.length === 0 && (
            <li className="py-2 text-sm text-foreground-dim">Noch keine Spieler mit Matches.</li>
          )}
          {top3.map((r) => (
            <li key={r.playerId} className="flex items-center gap-3 py-1 text-sm">
              <span className="w-5 text-right font-extrabold text-primary">{r.rank}</span>
              <span className="flex-1 font-semibold text-foreground">{r.name}</span>
              <span className="font-semibold tabular-nums text-foreground-muted">
                {r.ppg.toFixed(2)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {session.user.isAdmin && (
        <Link
          href="/admin"
          className="block rounded-2xl border border-border bg-surface p-4 text-sm text-foreground-muted hover:border-border-strong"
        >
          <span className="font-semibold text-foreground">Admin</span>
          <span className="ml-1">— Spieltag, Roster und Spielerverwaltung</span>
        </Link>
      )}
    </div>
  );
}
```

Hinweis: `computeRanking` gibt Objekte mit `playerId`, `rank`, `name`, `ppg` zurück. Falls dein lib eine abweichende Shape hat, passe `myRow` und `top3` an die tatsächlichen Felder an — die lib-Datei liegt unter `src/lib/ranking/compute.ts`.

- [ ] **Step 3: Typecheck + Build**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler. Bei Typkonflikten wegen Ranking-Shape diese entsprechend anpassen.

Run: `pnpm vitest run`
Expected: alle bestehenden Tests bestehen weiterhin.

- [ ] **Step 4: Commit**

```bash
git add src/app/page.tsx src/app/dashboard-hero.tsx
git commit -m "feat(dashboard): new home screen with hero, stats and top 3"
```

---

## Task 13: Login-Redirect auf `/` und Dark-Politur

**Files:**
- Modify: `src/app/login/login-form.tsx`
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Redirect-Ziel anpassen**

Öffne `src/app/login/login-form.tsx`. Finde die Zeile `window.location.assign("/ranking")` und ersetze sie durch `window.location.assign("/")`.

- [ ] **Step 2: Login-Seite restylen**

Öffne `src/app/login/page.tsx` und stelle sicher, dass der Wrapper diesen Stil hat:

```tsx
export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[image:var(--cta-gradient)] text-xl font-extrabold text-background">
            P
          </div>
          <h1 className="text-2xl font-extrabold text-foreground">Willkommen zurück</h1>
          <p className="mt-1 text-sm text-foreground-muted">Bitte melde dich an.</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
```

(Den `import { LoginForm }`-Namen belassen. Falls das Login-Form bereits in einen anderen Wrapper verpackt ist, nur die Hero-Sektion und die umschließenden Klassen ersetzen.)

Öffne `src/app/login/login-form.tsx`. Stelle sicher, dass das Formular in `<div className="rounded-2xl border border-border bg-surface p-5 space-y-3">` sitzt; dass die Fehlermeldung `className="text-sm text-destructive"` trägt; und dass der Submit-Button `<Button className="w-full">Anmelden</Button>` ist.

- [ ] **Step 3: Smoke-Test**

Run: `pnpm dev`
Gehe auf `http://localhost:3000/login`. Erwartet: dunkler Hintergrund, zentrierte Karte, Cyan-Gradient-Logo-Quadrat. Nach erfolgreichem Login Redirect auf `/` (Dashboard).
Stoppe den Dev-Server.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/login-form.tsx src/app/login/page.tsx
git commit -m "style(login): dark premium card + redirect to dashboard"
```

---

## Task 14: Ranking — Dark-Premium-Restyle

**Files:**
- Read: `src/components/ranking-table.tsx`
- Modify: `src/components/ranking-table.tsx`, `src/app/ranking/page.tsx`

- [ ] **Step 1: RankingTable lesen und restylen**

Öffne `src/components/ranking-table.tsx`. Ersetze die Wurzel-`<Card>` durch einen inset-styled Container und aktualisiere die Zeilen:

```tsx
import type { RankingRow } from "@/lib/ranking/compute";

export function RankingTable({ ranking }: { ranking: RankingRow[] }) {
  if (ranking.length === 0) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <p className="text-sm text-foreground-muted">Noch keine Spieler mit Matches.</p>
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-surface">
      <ul className="divide-y divide-border">
        {ranking.map((r) => (
          <li key={r.playerId} className="flex items-center gap-4 px-4 py-3">
            <span className="w-6 text-right text-base font-extrabold text-primary tabular-nums">
              {r.rank}
            </span>
            <span className="flex-1 text-sm font-semibold text-foreground">{r.name}</span>
            <span className="text-sm font-semibold tabular-nums text-foreground-muted">
              {r.ppg.toFixed(2)}
            </span>
            <span className="min-w-[3rem] rounded-full bg-surface-muted px-2 py-0.5 text-right text-[0.65rem] font-semibold tabular-nums text-foreground-muted">
              {(r.winRate * 100).toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Falls `RankingRow` andere Felder hat, den Import und die Render-Zeilen entsprechend anpassen. Die bestehenden Felder können durch `console.log(ranking[0])` in Dev-Zeit ermittelt werden; wahrscheinlich sind die Felder `rank`, `playerId`, `name`, `ppg`, `winRate`.

- [ ] **Step 2: Header der Ranking-Seite anpassen**

Öffne `src/app/ranking/page.tsx`. Ersetze den Header-Block durch:

```tsx
<header>
  <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">
    Saison {season.year}
  </p>
  <h1 className="text-2xl font-bold text-foreground">Rangliste</h1>
</header>
```

Das Emoji-Icon-Kästchen rechts oben entfernen.

- [ ] **Step 3: Typecheck + Build**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm build`
Expected: Erfolg.

- [ ] **Step 4: Commit**

```bash
git add src/components/ranking-table.tsx src/app/ranking/page.tsx
git commit -m "style(ranking): dark premium refresh"
```

---

## Task 15: Spieltag — Phasen-Helper und Timeline-Integration

**Files:**
- Create: `src/app/game-day/phase.ts`
- Create: `tests/unit/game-day/phase.test.ts`
- Modify: `src/app/game-day/page.tsx` (nur Header + Timeline; Phase-Inhalt folgt in Task 16–18)

- [ ] **Step 1: Failing Test für Phase-Derivation**

Erzeuge `tests/unit/game-day/phase.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { timelineForStatus } from "@/app/game-day/phase";

describe("timelineForStatus", () => {
  it("returns 4 steps with correct current and done flags", () => {
    const steps = timelineForStatus("roster_locked");
    expect(steps).toHaveLength(4);
    expect(steps.map((s) => s.status)).toEqual(["done", "current", "upcoming", "upcoming"]);
  });

  it("marks everything done when finished", () => {
    const steps = timelineForStatus("finished");
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "done", "done"]);
  });

  it("marks step 1 as current for planned", () => {
    const steps = timelineForStatus("planned");
    expect(steps.map((s) => s.status)).toEqual(["current", "upcoming", "upcoming", "upcoming"]);
  });

  it("marks step 3 as current for in_progress", () => {
    const steps = timelineForStatus("in_progress");
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "current", "upcoming"]);
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `pnpm vitest run tests/unit/game-day/phase.test.ts`
Expected: FAIL — Modul nicht gefunden.

- [ ] **Step 3: Helper implementieren**

Erzeuge `src/app/game-day/phase.ts`:

```ts
import type { TimelineStep } from "@/components/ui/timeline";

export type GameDayStatus = "planned" | "roster_locked" | "in_progress" | "finished";

const LABELS = ["Geplant", "Roster", "Matches", "Fertig"];
const ORDER: GameDayStatus[] = ["planned", "roster_locked", "in_progress", "finished"];

export function timelineForStatus(status: GameDayStatus): TimelineStep[] {
  const currentIndex = ORDER.indexOf(status);
  return LABELS.map((label, index) => {
    let stepStatus: TimelineStep["status"];
    if (status === "finished") {
      stepStatus = "done";
    } else if (index < currentIndex) {
      stepStatus = "done";
    } else if (index === currentIndex) {
      stepStatus = "current";
    } else {
      stepStatus = "upcoming";
    }
    return { id: ORDER[index]!, label, status: stepStatus };
  });
}
```

- [ ] **Step 4: Test grün**

Run: `pnpm vitest run tests/unit/game-day/phase.test.ts`
Expected: PASS (4/4).

- [ ] **Step 5: Game-Day-Header auf Timeline umstellen**

Öffne `src/app/game-day/page.tsx`. Ersetze den bisherigen Header-Block (Card mit Datum + Status-Badge) durch:

```tsx
import { Timeline } from "@/components/ui/timeline";
import { timelineForStatus, type GameDayStatus } from "./phase";

// ... innerhalb der Komponente, an Stelle des alten Headers:

const steps = timelineForStatus(day.status as GameDayStatus);
const dateText = new Date(day.date).toLocaleDateString("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "long",
});
const timeText = new Date(day.date).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

return (
  <div className="space-y-4">
    <header>
      <p className="text-xs font-semibold uppercase tracking-wider text-foreground-muted">Spieltag</p>
      <h1 className="text-2xl font-bold text-foreground">
        {dateText} · {timeText}
      </h1>
    </header>
    <Timeline steps={steps} />
    {/* ... bestehende Sektionen bleiben zunächst und werden in Task 16–18 ersetzt ... */}
  </div>
);
```

Die anderen Sektionen (Attendance-Widget, Teilnehmerliste, MatchList) bleiben in diesem Task unverändert — sie werden in Task 16–18 restrukturiert.

- [ ] **Step 6: Typecheck + Build**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm vitest run`
Expected: alle Tests grün (inkl. 4 neue phase-Tests).

- [ ] **Step 7: Commit**

```bash
git add src/app/game-day/phase.ts src/app/game-day/page.tsx tests/unit/game-day/phase.test.ts
git commit -m "feat(game-day): timeline header with phase derivation"
```

---

## Task 16: Spieltag — Planned-Phase (Hero, Chip-Cluster, Join)

**Files:**
- Create: `src/app/game-day/planned-section.tsx`
- Modify: `src/app/game-day/page.tsx`
- (Die bestehende `attendance-widget.tsx` und `join-button.tsx` werden nicht mehr direkt von `page.tsx` verwendet; ihre Imports werden entfernt.)

- [ ] **Step 1: PlannedSection anlegen**

Erzeuge `src/app/game-day/planned-section.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type MemberAttendance = "pending" | "confirmed" | "declined";

export interface PlannedParticipant {
  playerId: string;
  name: string;
  attendance: MemberAttendance;
}

export function PlannedSection({
  gameDayId,
  me,
  participants,
}: {
  gameDayId: string;
  me: PlannedParticipant | null;
  participants: PlannedParticipant[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = participants.filter((p) => p.attendance === "confirmed");
  const pending = participants.filter((p) => p.attendance === "pending");
  const declined = participants.filter((p) => p.attendance === "declined");

  async function setStatus(next: MemberAttendance) {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/attendance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    setBusy(false);
    if (!res.ok) {
      setError("Konnte Status nicht speichern");
      return;
    }
    router.refresh();
  }

  async function join() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/game-days/${gameDayId}/join`, { method: "POST" });
    setBusy(false);
    if (!res.ok) {
      setError("Konnte dich nicht hinzufügen");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {me ? (
        <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-4">
          <div className="flex items-center justify-between">
            <Badge variant={me.attendance === "confirmed" ? "lime" : "primary"}>
              {me.attendance === "confirmed"
                ? "Dabei ✓"
                : me.attendance === "declined"
                  ? "Abgesagt"
                  : "Noch offen"}
            </Badge>
            <span className="text-[0.7rem] font-semibold text-primary-strong">
              {confirmed.length} / {participants.length} bestätigt
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant={me.attendance === "confirmed" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("confirmed")}>
              Dabei
            </Button>
            <Button size="sm" variant={me.attendance === "declined" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("declined")}>
              Nicht dabei
            </Button>
            <Button size="sm" variant={me.attendance === "pending" ? "primary" : "secondary"} disabled={busy} onClick={() => setStatus("pending")}>
              Weiß nicht
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <div className="text-sm font-semibold text-foreground">Du bist noch nicht dabei</div>
          <p className="mt-1 text-sm text-foreground-muted">
            Du bist kein Teilnehmer dieses Spieltags. Trete bei, um mitzuspielen.
          </p>
          <Button className="mt-3 w-full" disabled={busy} onClick={join}>
            Teilnehmen
          </Button>
        </div>
      )}

      {error && (
        <p className="rounded-xl bg-destructive-soft px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
        <ChipRow title="Dabei" count={confirmed.length} names={confirmed.map((p) => p.name)} tone="lime" />
        <ChipRow title="Offen" count={pending.length} names={pending.map((p) => p.name)} tone="primary" />
        <ChipRow title="Abgesagt" count={declined.length} names={declined.map((p) => p.name)} tone="soft" />
      </div>
    </div>
  );
}

function ChipRow({
  title,
  count,
  names,
  tone,
}: {
  title: string;
  count: number;
  names: string[];
  tone: "lime" | "primary" | "soft";
}) {
  return (
    <div>
      <div className="mb-1.5 text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
        {title} · {count}
      </div>
      {names.length === 0 ? (
        <div className="text-xs text-foreground-dim">—</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {names.map((n) => (
            <span
              key={n}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                tone === "lime"
                  ? "bg-success-soft text-success border border-success/40"
                  : tone === "primary"
                    ? "bg-primary-soft text-primary border border-primary/30"
                    : "bg-surface-muted text-foreground-muted"
              }`}
            >
              {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `src/app/game-day/page.tsx` auf neue Sektion umstellen**

Ersetze im `return` die bisherigen Attendance- und Teilnehmer-Cards (zwischen Timeline und MatchList) durch einen bedingten Block:

```tsx
{day.status === "planned" && (
  <PlannedSection
    gameDayId={day.id}
    me={me ? { playerId: me.playerId, name: me.player.name, attendance: (me.attendance === "confirmed" || me.attendance === "declined") ? me.attendance : "pending" } : null}
    participants={day.participants.map((p) => ({
      playerId: p.playerId,
      name: p.player.name,
      attendance: (p.attendance === "confirmed" || p.attendance === "declined") ? p.attendance : "pending",
    }))}
  />
)}
```

Importiere am Kopf der Datei: `import { PlannedSection } from "./planned-section";`.

Entferne die nun unbenutzten Imports `AttendanceWidget`, `JoinButton` und die `Badge`-Nutzung aus dem Header (die Badge ist jetzt innerhalb `PlannedSection`).

- [ ] **Step 3: Typecheck + Build**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm vitest run`
Expected: alle Tests grün.

- [ ] **Step 4: Commit**

```bash
git add src/app/game-day/planned-section.tsx src/app/game-day/page.tsx
git commit -m "feat(game-day): planned phase hero with chip clusters"
```

---

## Task 17: Spieltag — In-Progress-Phase (Inline-Stepper-Matches)

**Files:**
- Create: `src/app/game-day/match-inline-card.tsx`
- Modify: `src/app/game-day/page.tsx`
- Delete: `src/app/game-day/match-list.tsx`
- Delete: `src/app/game-day/score-dialog.tsx`

- [ ] **Step 1: Inline-Card-Komponente anlegen**

Erzeuge `src/app/game-day/match-inline-card.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/ui/stepper";

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

export function MatchInlineCard({
  match,
  maxScore,
}: {
  match: MatchRow;
  maxScore: number;
}) {
  const router = useRouter();
  const hasScore = match.team1Score !== null && match.team2Score !== null;
  const [editing, setEditing] = useState(!hasScore ? false : false);
  const [t1, setT1] = useState(match.team1Score ?? 0);
  const [t2, setT2] = useState(match.team2Score ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const winner =
    hasScore && !editing
      ? match.team1Score! > match.team2Score!
        ? "team1"
        : match.team2Score! > match.team1Score!
          ? "team2"
          : null
      : null;

  function startEdit() {
    setT1(match.team1Score ?? 0);
    setT2(match.team2Score ?? 0);
    setError(null);
    setEditing(true);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/matches/${match.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ team1Score: t1, team2Score: t2, version: match.version }),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.status === 409 ? "Zwischenzeitlich geändert – Seite neu laden" : "Konnte Score nicht speichern");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        editing ? "border-primary bg-surface shadow-[0_0_0_4px_rgba(34,211,238,0.1)]" : "border-border bg-surface-muted"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
          Match {match.matchNumber}
          {editing ? " · Eingabe läuft" : hasScore ? " · beendet" : " · offen"}
        </span>
        {winner && (
          <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[0.6rem] font-bold text-success">
            {winner === "team1" ? "Team A gewinnt" : "Team B gewinnt"}
          </span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-[1fr_auto_auto_auto_1fr] items-center gap-2">
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team1A} / {match.team1B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team A</div>
        </div>
        {editing ? (
          <Stepper value={t1} min={0} max={maxScore} onChange={setT1} label="Team A Score" />
        ) : (
          <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
            {match.team1Score ?? "–"}
          </span>
        )}
        <span className="text-xs font-semibold text-foreground-dim">:</span>
        {editing ? (
          <Stepper value={t2} min={0} max={maxScore} onChange={setT2} label="Team B Score" />
        ) : (
          <span className="min-w-[28px] text-center text-2xl font-extrabold tabular-nums text-primary">
            {match.team2Score ?? "–"}
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {match.team2A} / {match.team2B}
          </div>
          <div className="text-[0.65rem] text-foreground-dim">Team B</div>
        </div>
      </div>

      {editing ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(false)}
            className="rounded-lg border border-border-strong px-2 py-1.5 text-xs font-semibold text-foreground hover:bg-surface-muted disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-lg bg-[image:var(--cta-gradient)] px-2 py-1.5 text-xs font-extrabold text-background disabled:opacity-40"
          >
            Speichern
          </button>
        </div>
      ) : (
        <div className="mt-2 text-right">
          <button
            type="button"
            onClick={startEdit}
            className="text-[0.72rem] font-semibold text-primary hover:underline"
          >
            {hasScore ? "✎ bearbeiten" : "Tap zum Eintragen"}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Alte Match-Liste und Score-Dialog entfernen und Page umstellen**

Lösche diese Dateien:

```bash
rm src/app/game-day/match-list.tsx src/app/game-day/score-dialog.tsx
```

Öffne `src/app/game-day/page.tsx` und ersetze den `MatchList`-Block durch:

```tsx
{day.matches.length > 0 && (day.status === "in_progress" || day.status === "finished") && (
  <section className="space-y-2">
    <h2 className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
      Matches
    </h2>
    <div className="space-y-2">
      {day.matches.map((m) => (
        <MatchInlineCard
          key={m.id}
          maxScore={day.playerCount === 4 ? 6 : 3}
          match={{
            id: m.id,
            matchNumber: m.matchNumber,
            team1A: m.team1PlayerA.name,
            team1B: m.team1PlayerB.name,
            team2A: m.team2PlayerA.name,
            team2B: m.team2PlayerB.name,
            team1Score: m.team1Score,
            team2Score: m.team2Score,
            version: m.version,
          }}
        />
      ))}
    </div>
  </section>
)}
```

Importiere am Dateikopf: `import { MatchInlineCard } from "./match-inline-card";`. Entferne den `MatchList`-Import und die `format`-Variable.

- [ ] **Step 3: Typecheck + Build**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm vitest run`
Expected: alle Tests grün. (Falls ein Test `match-list` oder `score-dialog` importiert, den Test entfernen — sie wurden durch die Inline-Card ersetzt und Backend-Tests für `PATCH /api/matches/:id` bleiben unverändert bestehen.)

- [ ] **Step 4: Commit**

```bash
git add src/app/game-day/match-inline-card.tsx src/app/game-day/page.tsx
git rm src/app/game-day/match-list.tsx src/app/game-day/score-dialog.tsx
git commit -m "feat(game-day): inline stepper match cards replace score dialog"
```

---

## Task 18: Spieltag — Roster-Locked- und Finished-Phasen

**Files:**
- Modify: `src/app/game-day/page.tsx`

- [ ] **Step 1: Roster-Locked-Block ergänzen**

Füge in `src/app/game-day/page.tsx` — zwischen `<Timeline ... />` und dem `{day.status === "planned" && ...}`-Block — ein:

```tsx
import { AvatarStack } from "@/components/ui/avatar-stack";

// ...

{day.status === "roster_locked" && (
  <div className="rounded-2xl border border-primary/50 bg-[image:var(--hero-gradient)] p-4">
    <div className="text-sm font-semibold text-foreground">Warten auf Start</div>
    <p className="mt-1 text-xs text-primary-strong">
      Der Roster ist gesperrt. Der Admin startet den Spieltag gleich.
    </p>
    <div className="mt-3">
      <AvatarStack
        names={day.participants.filter((p) => p.attendance === "confirmed").map((p) => p.player.name)}
      />
    </div>
  </div>
)}
```

- [ ] **Step 2: Finished-Block ergänzen**

Unter dem Matches-Block (siehe Task 17) — falls `day.status === "finished"` — soll eine Zusammenfassung erscheinen. Füge dies nach dem Matches-`<section>` ein:

```tsx
{day.status === "finished" && (
  <div className="rounded-2xl border border-border bg-surface p-4">
    <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-foreground-muted">
      Zusammenfassung
    </div>
    <div className="mt-2 text-sm text-foreground">
      Spieltag beendet · {day.matches.filter((m) => m.team1Score !== null && m.team2Score !== null).length}
      {" / "}
      {day.matches.length} Matches gewertet
    </div>
  </div>
)}
```

- [ ] **Step 3: Typecheck + Smoke-Check**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm dev`
Öffne `http://localhost:3000/game-day`. Teste gedanklich alle Phasen durch (DB-Status ggf. per Prisma Studio oder SQL setzen): `planned` zeigt Hero+Chips, `roster_locked` zeigt Warten-Hero+AvatarStack, `in_progress` zeigt Inline-Match-Karten, `finished` zeigt Zusammenfassung.
Stoppe den Dev-Server.

- [ ] **Step 4: Commit**

```bash
git add src/app/game-day/page.tsx
git commit -m "feat(game-day): roster-locked and finished phase tiles"
```

---

## Task 19: Admin — Dark-Premium-Restyle aller Sub-Files

**Files:**
- Modify: `src/app/admin/page.tsx`
- Modify: `src/app/admin/players-section.tsx`
- Modify: `src/app/admin/participants-roster.tsx`
- Modify: `src/app/admin/create-game-day-form.tsx`
- Modify: `src/app/admin/start-game-day-button.tsx`
- Modify: `src/app/admin/create-player-dialog.tsx`
- Modify: `src/app/admin/reset-password-dialog.tsx`

- [ ] **Step 1: Visuelle Verträglichkeit prüfen**

Die bestehenden Komponenten nutzen bereits `Card`, `Badge`, `Button` und `Input`. Durch Task 2–5 bekommen sie automatisch Dark-Premium-Look. Öffne `src/app/admin/page.tsx` und prüfe:

- Headlines: sind `text-base font-semibold text-foreground` — OK.
- `Badge variant="neutral"` im planned-day-Block: wird jetzt `bg-surface-muted text-foreground-muted border border-border` — OK.

Keine Änderung nötig, solange die Komponenten ausschließlich Token-Klassen verwenden.

- [ ] **Step 2: `participants-roster.tsx` an neue Chip-Farben anpassen**

Öffne `src/app/admin/participants-roster.tsx`. Die Datei verwendet eigene Farbklassen. Ersetze die `DropColumn`-Hintergrundfarben so, dass sie stärker mit dem neuen Dark-Theme kontrastieren. Suche die Klasse `border-border` im droppable und die `border-primary bg-primary/5` bei `isOver` — belasse sie. Suche `rounded-xl border border-border bg-surface p-3` im `PlayerCard` und ersetze sie durch `rounded-xl border border-border bg-surface-muted p-3`. Der Rest bleibt.

- [ ] **Step 3: `players-section.tsx` prüfen**

Öffne `src/app/admin/players-section.tsx`. Stelle sicher, dass Spieler-Zeilen `border border-border bg-surface` nutzen und sekundäre Aktionen `text-foreground-muted hover:text-foreground` verwenden. Wenn harte Farben wie `bg-white` oder `text-slate-…` auftauchen, durch Token-Klassen ersetzen.

- [ ] **Step 4: `create-game-day-form.tsx` und Dialog-Dateien**

Öffne `src/app/admin/create-game-day-form.tsx`, `create-player-dialog.tsx`, `reset-password-dialog.tsx`. Ersetze alle hardgecodeten Hintergrundfarben (`bg-white`, `bg-slate-*`) durch `bg-surface` bzw. `bg-surface-muted`. Text-Farben (`text-slate-*`, `text-gray-*`) werden zu `text-foreground` bzw. `text-foreground-muted`.

- [ ] **Step 5: Typecheck + Build + Smoke**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm build`
Expected: Erfolg.

Run: `pnpm dev`
Als Admin einloggen, `/admin` öffnen. Erwartet: alle Karten dunkel, Badges im neuen Chip-Look, Roster-DnD funktioniert weiterhin, Dialoge dunkel.
Stoppe den Dev-Server.

- [ ] **Step 6: Commit**

```bash
git add src/app/admin
git commit -m "style(admin): dark premium restyle across admin screens"
```

---

## Task 20: Abschluss — Test-Suite, Build, Smoke-Checkliste, Deploy-Notiz

**Files:** keine weiteren Änderungen.

- [ ] **Step 1: Gesamtsuite grün**

Run: `pnpm tsc --noEmit`
Expected: keine Fehler.

Run: `pnpm vitest run`
Expected: alle Tests grün. Erwartet sind die bisherigen 134 Tests plus die neu hinzugekommenen:
- 3 Timeline-Tests
- 5 Stepper-Tests
- 3 StatTile-Tests
- 3 AvatarStack-Tests
- 4 phase-Tests

= 152 Tests.

Run: `pnpm build`
Expected: Build erfolgreich, keine Warnings zu fehlenden Tokens.

- [ ] **Step 2: Manuelle Smoke-Checkliste**

Run: `pnpm dev`

1. `/login` — dunkel, zentriert, Cyan-Gradient-Logo, nach Login landet man auf `/`.
2. `/` (Dashboard) — Hero mit nächstem Spieltag, Stat-Tiles mit PPG und Rang, Top-3-Tile, Admin-Tile bei Admin.
3. BottomTabs (Handy-Breite) — 4 Tabs (3 für Nicht-Admin), Lucide-Icons, aktiver Tab cyan.
4. TopNav (Desktop) — 4 Links, Avatar im Header, Abmelden funktioniert.
5. `/ranking` — dunkle Tabelle, Ränge cyan, PPG tabular aligned, kein altes Emoji-Kästchen.
6. `/game-day` (mit planned-Day) — Timeline zeigt Schritt 1 als current, Hero mit eigenem Status, Chip-Cluster nach Status.
7. Attendance ändern via Button → Zähler aktualisiert sich.
8. Join-Flow (als Nicht-Teilnehmer) → funktioniert.
9. Game Day auf `in_progress` setzen (via Admin „Start") → Inline-Stepper-Karten erscheinen. Tap auf Score-Anzeige öffnet Stepper, Speichern schreibt Wert.
10. `/admin` — alle Karten dark, Roster-DnD unverändert, Dialoge dunkel.

Stoppe den Dev-Server.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Deploy-Notiz**

Auf dem VPS (217.154.83.37) ausführen lassen:

```bash
sudo -u padel /srv/padel/app/scripts/deploy.sh
```

Der Deploy installiert, buildet und restart't den Service. Nach Deploy auf `http://217.154.83.37:8080` einloggen und die Smoke-Liste (Step 2) gegen Produktion abfahren.

- [ ] **Step 5: Abschluss-Commit (falls Smoke-Funde)**

Falls beim Smoke-Test optische Ausreißer auftauchen (nicht migrierte Farben in einer Nebenkomponente etc.), Fix in einem kleinen Folgecommit:

```bash
git add <betroffene Datei>
git commit -m "style: cleanup leftover legacy colors after relaunch"
git push origin main
```

Ohne Funde: kein zusätzlicher Commit nötig.

---

## Self-Review Notes (nicht Teil der Umsetzung)

- **Spec-Abdeckung:** Alle Abschnitte der Spec sind durch mindestens eine Task adressiert: Tokens (Task 1), Primitives (Task 2–9), Shell (Task 10–11), Dashboard (Task 12), Login/Ranking/Game-Day/Admin (Task 13–19), Rollout (Task 20). Die „nicht in Scope"-Liste bleibt außen vor.
- **Keine Placeholder:** Jede Task zeigt den konkreten neuen Code. Dort, wo der Engineer existierenden Code modifiziert (Dialog-Backdrop, Ranking-Table-Shape), ist die Anweisung zum Nachfassen präzise.
- **Typkonsistenz:** `TimelineStep` (Task 6) wird in Task 15 (`phase.ts`) und in Tasks 15/18 (Game-Day) korrekt verwendet. `MemberAttendance` in Task 16 matcht das, was `attendance-widget.tsx` historisch nutzt. `MatchRow` in Task 17 behält dieselbe Shape wie die alte `MatchList` — nur das Bereitstellungs-Muster ändert sich.
- **TDD:** Logik-Komponenten (Timeline, Stepper, StatTile, AvatarStack) und die Phase-Herleitung haben Tests. Rein visuelle Tasks (Button/Card/Badge/Input/Dialog-Varianten, Shell-Restyle, Admin-Restyle, Login-Restyle, Ranking-Restyle) werden per Typecheck + Build + manueller Smoke abgesichert — Unit-Tests für CSS-Klassen würden nur doppelte Arbeit schaffen.
