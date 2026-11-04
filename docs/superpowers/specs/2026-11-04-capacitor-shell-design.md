# Phase 3, PR 1: Capacitor-Hülle für iOS (Design)

Stand 2026-11-04, freigegeben von Patrick. Baut auf der Roadmap
(`2026-11-02-app-store-roadmap.md`, Phase 3) und dem Spike
(`2026-11-02-capacitor-spike-findings.md`) auf.

## Absicht

Padelmaestro soll als iOS-App im App Store erscheinen. Dieser erste
Schritt bringt die native Hülle ins Repo, so dass die bestehende Web-App
im echten WKWebView läuft, sich wie eine App anfühlt (Statusleiste,
Safe-Area, Icon, Splash, Offline-Seite) und per Xcode auf Simulator und
Gerät startet. Push, Haptik und Teilen folgen in eigenen PRs; der
App-Store-Review braucht sie, dieser PR nicht.

## Ziele

- `ios/`-Projekt im Repo, reproduzierbar per `pnpm cap:sync` und Xcode.
- Remote-URL-Modus: die Hülle lädt `https://padelmaestro.de`. Kein
  gebündeltes Frontend, keine Änderung an Auth, Cookies oder CSRF.
- Dunkle Statusleiste mit hellen Symbolen, Inhalt respektiert die
  Safe-Area (das `viewport-fit=cover` der Web-App greift bereits).
- App-Icon und Splash aus dem vorhandenen `src/app/icon.svg`.
- Offline-/Fehlerseite, wenn der Server nicht erreichbar ist, mit
  „Erneut versuchen".
- Die Web-App erkennt die Hülle und blendet den PWA-Installationshinweis
  aus.
- Entwicklerdoku: Voraussetzungen, Build, Simulator, Gerät, Signing.

## Nicht-Ziele

- Push-Benachrichtigungen, Haptik, natives Teilen (PR 2 und 3).
- Android-Projekt (Phase 4).
- Gebündelte Web-Assets oder Offline-Betrieb der App-Funktionen.
- TestFlight-Upload und App-Store-Connect-Metadaten (PR 4 und 5).
- Änderungen an Login, Session oder Sign in with Apple.

## Anti-Ziele

- Die Web-App darf für Browser-Nutzer nicht anders aussehen oder sich
  anders verhalten. Alles Hüllen-spezifische ist an die Erkennung der
  Hülle gebunden.
- Keine Abhängigkeit des Server-Deploys vom iOS-Projekt: `deploy.sh`,
  CI-Jobs und `next build` bleiben unberührt. Der iOS-Build ist ein
  eigener, optionaler Pfad.

## Rahmenbedingungen

- Capacitor 8 mit Swift Package Manager, wie im Spike. Xcode 27.2 und
  iPhone-17-Simulator sind auf dem Mac vorhanden. Node 22.
- `capacitor.config.json` statt `.ts` (Node-22-Stolperstein aus dem
  Spike).
- Plugins nur, wenn sie SPM unterstützen: `@capacitor/status-bar`,
  `@capacitor/splash-screen`. `@capacitor/browser` bleibt draußen,
  externe Links öffnen weiterhin in Safari.
- Patricks Zeitbudget: ein PR pro Sitzung. Dieser PR soll in einer
  Sitzung baubar und im Simulator prüfbar sein.

## Entscheidungen

Von Patrick (2026-11-02, Roadmap): iOS zuerst, Remote-URL-Modus, keine
Sign-in-Änderung, deutsch.

Meine Festlegungen in diesem Dokument (Patrick kann sie kippen):

1. **Bundle-ID `de.padelmaestro.app`**, Anzeigename „Padelmaestro".
   Patrick (2026-11-04): noch keine App-ID angelegt, Developer-Account
   bezahlt und in Prüfung. Die ID wird beim ersten TestFlight-Upload
   registriert und ist ab dann dauerhaft.
1a. **Nur iPhone, nur Hochformat** (`TARGETED_DEVICE_FAMILY = 1`,
   Portrait wie im Web-Manifest). Entschieden von Patrick 2026-11-04.
2. **Hüllen-Erkennung über den User-Agent**: `ios.appendUserAgent:
   "PadelmaestroApp/1.0 (iOS)"`. Der Server kann so später App-Anfragen
   unterscheiden (Push-Registrierung, Statistik), die Web-App prüft
   `window.Capacitor?.isNativePlatform?.()` und als Fallback den
   User-Agent. Eine Hilfsfunktion `isNativeApp()` in `src/lib/platform.ts`
   kapselt beides.
3. **InstallHint**: rendert nichts, wenn `isNativeApp()` wahr ist.
4. **Offline-Seite**: statische HTML-Datei in `ios/App/App/public/`
   (Capacitor `server.errorPath`), dunkles Design wie die App, ein
   Button lädt `server.url` neu. Keine Next-Route, damit sie ohne
   Server funktioniert.
5. **www und Weiterleitungen**: `server.allowNavigation` enthält
   `padelmaestro.de` und `www.padelmaestro.de`; der Caddy-Redirect bleibt.
   Mail-Links (Verifizierung, Passwort-Reset, Einladungen) zeigen auf
   `https://padelmaestro.de/...` und öffnen damit in Safari, nicht in der
   App. Das ist für PR 1 akzeptiert; Universal Links kommen mit Push
   oder später, wenn sie stören.
6. **Icon und Splash**: Erweiterung von `scripts/generate-pwa-icons.mjs`
   um die iOS-Größen (1024er App-Icon, Splash 2732×2732 mit Logo auf
   `#0b1220`); erzeugte PNGs werden committet, wie heute die PWA-Icons.
7. **Versionierung**: `CFBundleShortVersionString` 1.0.0, Build-Nummer
   1; wird erst mit TestFlight automatisiert.
8. **Signing**: im Repo kein Team eingetragen. Simulator-Builds laufen
   ohne Apple-Account; Geräte-Builds brauchen Patricks Team in Xcode
   (Doku beschreibt den Schritt). Das Projekt nutzt „Automatically manage
   signing".
9. **Repo-Hygiene**: `ios/App/Pods` existiert nicht (SPM);
   `ios/App/App.xcodeproj/xcuserdata` und `ios/DerivedData` in
   `.gitignore`. `pnpm cap:sync` ist der einzige Generierschritt.
10. **Zwei PRs statt einem**: Zuerst ein kleiner Web-PR (`isNativeApp()`,
    InstallHint aus, Splash-Ausblenden per Plugin-Aufruf aus der Seite),
    gemergt und deployt. Danach der Hüllen-PR mit `ios/`, Config, Icons und
    Offline-Seite, abgenommen im Simulator gegen Produktion mit einem
    Beta-Konto (z. B. Jonas), nicht mit echten Gruppendaten. Kein
    Localhost-Modus und keine ATS-Ausnahme.
11. **Tests**: Unit-Tests für `isNativeApp()` und das InstallHint-Verhalten
    in der Hülle. Der iOS-Build selbst läuft nicht in CI (kein macOS-Runner
    nötig für diesen PR); Nachweis ist ein manueller Simulator-Lauf mit
    Screenshots im PR.

## Was der Builder entscheidet

- Genaues Layout und Text der Offline-Seite (deutsch, kurz).
- Aufteilung der Capacitor-Pakete in `dependencies` vs.
  `devDependencies` und die `cap:*`-Skripte.
- Ob der Splash per Plugin ausgeblendet wird, sobald die Seite geladen
  ist, oder nach fester Zeit (Vorgabe: sobald geladen, Fallback 3 s).
- Wie die Doku heißt und wo sie liegt (Vorschlag `docs/IOS.md`).

## Abnahme

- `pnpm cap:sync && xcodebuild -scheme App -destination 'platform=iOS
  Simulator,name=iPhone 17' build` läuft fehlerfrei.
- Im Simulator: Login, Dashboard, Spieltag öffnen; Statusleiste hell auf
  dunkel; kein Install-Banner; Flugmodus → Offline-Seite → „Erneut
  versuchen" lädt die App.
- Browser-Nutzer sehen keinen Unterschied (Install-Banner weiterhin in
  Safari sichtbar).
- Splash verschwindet, sobald die Seite geladen ist, nicht erst nach dem
  Timeout. Prüft, dass `window.Capacitor.Plugins.SplashScreen` im
  Remote-URL-Modus erreichbar ist (vom Spike nicht abgedeckt).
  `capacitor.config.json` setzt zusätzlich `launchAutoHide` mit
  `launchShowDuration` ≈ 3000 als nativen Fallback.

## Hinweise aus dem Review des Web-PRs

- Die Web-App deklariert `Window.Capacitor` selbst (`src/lib/platform.ts`).
  Wird je `@capacitor/core` in `src/` importiert, diese Deklaration
  entfernen.
- Der User-Agent-Marker `PadelmaestroApp/` ist frei fälschbar. Serverseitig
  (Push-Registrierung, Statistik) nie als Beweis behandeln.
