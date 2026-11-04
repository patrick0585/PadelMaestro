# iOS-App (Capacitor-Hülle)

Die App `de.padelmaestro.app` ist eine dünne Capacitor-Hülle, die https://padelmaestro.de im WebView lädt (Remote-URL-Modus). Die App bündelt nur die Offline-Seite (`capacitor-web/offline.html`) und eine Platzhalter-`index.html`.

## Voraussetzungen

- macOS mit Xcode (inkl. iOS-Simulator)
- Node 22, pnpm (notfalls `corepack pnpm`)

## Einrichten

```bash
pnpm install
pnpm cap:sync
```

`pnpm cap:sync` ist nach **jedem** `pnpm install` und jeder Capacitor-Versionsänderung nötig, bevor gebaut wird: Die generierte Datei `ios/App/CapApp-SPM/Package.swift` enthält pnpm-Store-Pfade. Nie von Hand bearbeiten.

Änderungen an `capacitor.config.json` werden ebenfalls erst durch `pnpm cap:sync` übernommen.

## Simulator

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath ios/DerivedData build
xcrun simctl boot "iPhone 17"   # "already booted" ignorieren
xcrun simctl install booted ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch booted de.padelmaestro.app
xcrun simctl io booted screenshot /pfad/zum/shot.png
```

„iPhone 17“ oder ein anderes Gerät aus `xcrun simctl list devices available`.

Alternativ `pnpm cap:open` und in Xcode starten.

Icon/Splash neu erzeugen: `node scripts/generate-pwa-icons.mjs` (schreibt PWA- und iOS-Assets)

## Echtes Gerät

In Xcode unter Signing & Capabilities das eigene Team wählen („Automatically manage signing" bleibt an). `DEVELOPMENT_TEAM` nie committen.

## Push-Benachrichtigungen

Plugin `@capacitor/push-notifications`; `AppDelegate.swift` reicht das Geräte-Token an Capacitor weiter, `App/App.entitlements` setzt `aps-environment = development`. Nach dem Login fragt die App einmal nach der Erlaubnis und meldet das Token an `/api/push/devices`; beim Abmelden wird es wieder entfernt. Ein Tipp auf die Nachricht wechselt bei Bedarf die Gruppe und öffnet `/game-day`.

Sobald das Apple-Team existiert: in Xcode unter Signing & Capabilities „Push Notifications" hinzufügen (die Entitlements-Datei ist schon eingetragen). Ohne Team baut der Simulator weiterhin, echte Tokens gibt es aber erst auf dem Gerät.

Simulator-Test: Datei `test.apns` anlegen und auf das Simulator-Fenster ziehen (oder `xcrun simctl push booted de.padelmaestro.app test.apns`):

```json
{
  "Simulator Target Bundle": "de.padelmaestro.app",
  "aps": { "alert": { "title": "Neuer Spieltag", "body": "Donnerstagsrunde: Do, 12.11. – bist du dabei?" }, "sound": "default" },
  "gameDayId": "<Spieltag-ID>",
  "groupId": "<Gruppen-ID>"
}
```

Tipp auf die Nachricht öffnet den Spieltag der Gruppe.

## Bekannte Grenzen

- Links in Mails (Verifizierung, Passwort-Reset, Einladungen) öffnen in Safari, nicht in der App.
- Nur iPhone, nur Hochformat.
- Ohne Netz erscheint die Offline-Seite mit „Erneut versuchen".

## Manuelle Abnahme (Gerät)

- [ ] Login mit Beta-Konto Jonas
- [ ] Spieltag öffnen
- [ ] Gruppe wechseln
- [ ] Flugmodus an: Offline-Seite erscheint
- [ ] Flugmodus aus, „Erneut versuchen": App lädt wieder

**Flugmodus → Offline-Seite → Erneut versuchen** ist die einzige Prüfung, die die Simulator-Abnahme nicht abdeckt.
