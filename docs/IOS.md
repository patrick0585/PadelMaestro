# iOS-App (Capacitor-Hülle)

Die App `de.padelmaestro.app` ist eine dünne Capacitor-Hülle, die https://padelmaestro.de im WebView lädt (Remote-URL-Modus). Es gibt keinen lokal gebündelten Web-Code außer der Offline-Seite (`capacitor-web/offline.html`).

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

Alternativ `pnpm cap:open` und in Xcode starten.

## Echtes Gerät

In Xcode unter Signing & Capabilities das eigene Team wählen („Automatically manage signing" bleibt an). `DEVELOPMENT_TEAM` nie committen.

## Bekannte Grenzen

- Links in Mails (Verifizierung, Passwort-Reset, Einladungen) öffnen in Safari, nicht in der App.
- Kein Push.
- Nur iPhone, nur Hochformat.
- Ohne Netz erscheint die Offline-Seite mit „Erneut versuchen".

## Manuelle Abnahme (Gerät)

- [ ] Login mit Beta-Konto Jonas
- [ ] Spieltag öffnen
- [ ] Gruppe wechseln
- [ ] Flugmodus an: Offline-Seite erscheint
- [ ] Flugmodus aus, „Erneut versuchen": App lädt wieder
