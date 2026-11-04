# iOS PR 1: Hüllen-Erkennung in der Web-App – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Web-App erkennt, dass sie in der Padelmaestro-iOS-Hülle läuft, blendet dort den PWA-Installationshinweis aus und meldet der Hülle, wann der Splash weg darf.

**Architecture:** Eine reine Hilfsfunktion `isNativeApp()` prüft `window.Capacitor?.isNativePlatform?.()` und als Fallback den User-Agent-Zusatz der Hülle. `InstallHint` fragt sie vor allem anderen ab. Eine kleine Client-Komponente im Root-Layout ruft nach dem ersten Rendern `window.Capacitor.Plugins.SplashScreen.hide()` auf, wenn die Bridge da ist. Keine neue npm-Abhängigkeit, Browser-Nutzer merken nichts.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Vitest + Testing Library (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-04-capacitor-shell-design.md` (Entscheidungen 2, 3, 10)

## Global Constraints

- User-Agent-Zusatz der Hülle exakt: `PadelmaestroApp/1.0 (iOS)`; erkannt wird das Präfix `PadelmaestroApp/`.
- Keine Capacitor-npm-Pakete in diesem PR; die Bridge wird nur über `window.Capacitor` angesprochen.
- Browser-Verhalten unverändert: alle bestehenden InstallHint-Tests bleiben grün.
- Kommentare knapp, keine Erzählprosa; Commit-Messages deutsch, kurz.
- Tests laufen mit `set -a; . ./.env; set +a; node node_modules/vitest/vitest.mjs run <file>` (pnpm-Shim ist lokal defekt).

## Review Focus

- **Server-Rendern:** `isNativeApp()` wird beim SSR ohne `window` aufgerufen und muss `false` liefern, ohne zu werfen. Test in Task 1.
- **Bridge ohne Methode:** `window.Capacitor` existiert, aber `isNativePlatform` fehlt oder wirft. Erwartung: Fallback auf den User-Agent, kein Absturz. Test in Task 1.
- **Hülle mit iPhone-User-Agent:** Der WKWebView-UA enthält `iPhone` und kein `CriOS`, sieht also wie iOS Safari aus. Ohne Vorrang der Hüllen-Prüfung erschiene der Hinweis. Test in Task 2.
- **Splash-Plugin fehlt:** Hülle ohne SplashScreen-Plugin oder normaler Browser. `hide` darf nicht aufgerufen werden und nichts darf werfen. Test in Task 3.
- **Splash nur einmal:** Navigation zwischen Seiten darf `hide` nicht wiederholt auslösen, weil die Komponente im Root-Layout nur einmal mountet. Test in Task 3.

---

### Task 1: `isNativeApp()`

**Files:**
- Create: `src/lib/platform.ts`
- Test: `tests/unit/lib/platform.test.ts`

**Interfaces:**
- Produces: `export const NATIVE_UA_MARKER = "PadelmaestroApp/"`, `export function isNativeApp(): boolean`

- [ ] **Step 1: Write the failing tests** in `tests/unit/lib/platform.test.ts`. Vor jedem Test `delete (window as any).Capacitor` und den UA zurücksetzen (Muster `setUserAgent` aus `tests/unit/components/install-hint.test.tsx`).
  - `"returns false in a plain browser"`: Safari-iPhone-UA, kein `window.Capacitor` → `false`.
  - `"returns true when the Capacitor bridge reports a native platform"`: `window.Capacitor = { isNativePlatform: () => true }` → `true`.
  - `"returns false when the bridge reports web"`: `isNativePlatform: () => false`, normaler UA → `false`.
  - `"falls back to the user agent marker"`: kein Capacitor, UA = Safari-iPhone-UA + `" PadelmaestroApp/1.0 (iOS)"` → `true`.
  - `"falls back to the user agent when isNativePlatform throws"`: `isNativePlatform: () => { throw new Error() }`, UA mit Marker → `true`; ohne Marker → `false`.
  - `"returns false without window (SSR)"`: `vi.stubGlobal("window", undefined)` → `false`, danach `vi.unstubAllGlobals()`.

- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/unit/lib/platform.test.ts` — Expected: FAIL, Modul nicht gefunden.

- [ ] **Step 3: Implement `isNativeApp(): boolean` in `src/lib/platform.ts`.** Reihenfolge: kein `window` → `false`; Bridge-Ergebnis in try/catch, `true` gewinnt; sonst `navigator.userAgent.includes(NATIVE_UA_MARKER)`. Typ für `window.Capacitor` lokal als optionales `{ isNativePlatform?: () => boolean; Plugins?: Record<string, unknown> }` deklarieren (per `declare global`), damit Task 3 ihn mitnutzt.

- [ ] **Step 4: Run** dieselbe Datei — Expected: 6 passed.

- [ ] **Step 5: Commit** `git add src/lib/platform.ts tests/unit/lib/platform.test.ts && git commit -m "Hüllen-Erkennung für die iOS-App"`

### Task 2: InstallHint in der Hülle ausblenden

**Files:**
- Modify: `src/components/install-hint.tsx` (Effekt-Anfang, Zeile mit `if (isStandalone()) return;`)
- Test: `tests/unit/components/install-hint.test.tsx`

**Interfaces:**
- Consumes: `isNativeApp()` aus `@/lib/platform`

- [ ] **Step 1: Write the failing tests** in der bestehenden Datei:
  - `"stays hidden inside the iOS app shell (user agent marker)"`: UA = `IPHONE_SAFARI + " PadelmaestroApp/1.0 (iOS)"`, render → `queryByRole("region", { name: "App auf dem Home-Bildschirm hinzufügen" })` ist `null`.
  - `"stays hidden inside the iOS app shell even after beforeinstallprompt"`: `window.Capacitor = { isNativePlatform: () => true }`, Chromium-UA, `beforeinstallprompt` feuern → Region bleibt `null`.
  - Im `afterEach` `delete (window as any).Capacitor`.

- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/unit/components/install-hint.test.tsx` — Expected: die zwei neuen FAIL, die alten PASS.

- [ ] **Step 3: Implement:** im Effekt `if (isStandalone() || isNativeApp()) return;`. Kein Listener wird registriert, `dismissed` bleibt beim Startwert `true`.

- [ ] **Step 4: Run** dieselbe Datei — Expected: alle grün.

- [ ] **Step 5: Commit** `git commit -am "Installationshinweis in der iOS-App ausblenden"`

### Task 3: Splash ausblenden, sobald die Seite steht

**Files:**
- Create: `src/components/native-splash-hide.tsx` (`"use client"`)
- Modify: `src/app/layout.tsx` (in `<body>` vor `<AppShell>`)
- Test: `tests/unit/components/native-splash-hide.test.tsx`

**Interfaces:**
- Consumes: `isNativeApp()`, globaler `window.Capacitor`-Typ aus Task 1
- Produces: `export function NativeSplashHide(): null`

- [ ] **Step 1: Write the failing tests:**
  - `"hides the native splash once after mount inside the app"`: `const hide = vi.fn(); window.Capacitor = { isNativePlatform: () => true, Plugins: { SplashScreen: { hide } } }`; render, rerender → `hide` genau einmal aufgerufen.
  - `"does nothing in a plain browser"`: kein `window.Capacitor` → render wirft nicht, rendert nichts (`container` leer).
  - `"does nothing when the SplashScreen plugin is missing"`: `window.Capacitor = { isNativePlatform: () => true, Plugins: {} }` → wirft nicht.
  - `"ignores a rejected hide()"`: `hide = vi.fn(() => Promise.reject(new Error("x")))` → kein unhandled rejection (Test endet grün, `await Promise.resolve()` nach render).

- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/unit/components/native-splash-hide.test.tsx` — Expected: FAIL, Modul fehlt.

- [ ] **Step 3: Implement `NativeSplashHide(): null`:** `useEffect(..., [])`; nur wenn `isNativeApp()`, `Plugins?.SplashScreen` als `{ hide?: () => Promise<void> | void }` lesen, `hide` aufrufen, Rückgabe per `Promise.resolve(...).catch(() => {})` schlucken. In `layout.tsx` als `<NativeSplashHide />` vor `<AppShell>` einhängen, damit es auch auf `/login` ohne Session läuft.

- [ ] **Step 4: Run** die Testdatei und `tests/components/public-pages.test.tsx` — Expected: grün.

- [ ] **Step 5: Full verification:** `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` (keine Ausgabe) und volle Suite `node node_modules/vitest/vitest.mjs run` (alle grün).

- [ ] **Step 6: Commit** `git add src/components/native-splash-hide.tsx src/app/layout.tsx tests/unit/components/native-splash-hide.test.tsx && git commit -m "Splash der iOS-App nach dem Laden ausblenden"`
