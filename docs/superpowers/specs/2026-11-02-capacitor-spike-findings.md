# Capacitor-Spike: Ergebnis (2026-11-02)

Wegwerf-Projekt, nicht im Repo. Capacitor 8.6.0 mit Swift Package
Manager, Xcode 27.2, iPhone-16-Simulator mit iOS 27.2. Die Hülle lud
die lokal laufende Web-App im Remote-URL-Modus (`server.url`).

## Ergebnis

Die Hülle funktioniert ohne Änderung am Web-Code. Geprüft im echten
WKWebView, Nachweis über Server-Logs und eine in die Seite injizierte
JS-Konsole:

| Prüfung | Ergebnis |
|---|---|
| Login per Formular | 200, Session-Cookie gesetzt (HttpOnly, SameSite=Lax, 30 Tage) |
| Mutation mit CSRF-Check (Anwesenheit bestätigen) | 200; WebView sendet `Origin` und `Referer` gleich der Seite. Kontrolle ohne Origin per curl: 403 |
| App beenden und neu starten | Cookie bleibt, Dashboard ohne Login |
| SSE `EventSource` auf Spieltag-Events | verbindet, bleibt über den 25-s-Keepalive hinaus offen |
| Statusleiste, Notch, Safe-Area | kein Überlappen; `viewport-fit=cover` greift |
| InstallHint-Banner | wird in der Hülle angezeigt, muss ausgeblendet werden |
| Externe Links | öffnen in Safari, Rücksprung-Link vorhanden |

## Anpassungen für die echte Umsetzung (Phase 3)

Web-App:
1. InstallHint ausblenden, wenn `window.Capacitor?.isNativePlatform?.()`
   wahr ist. Zusätzlich `ios.appendUserAgent` setzen, damit der Server
   die App erkennen kann.
2. CSRF-Allowlist unverändert lassen. `capacitor://localhost` nur
   aufnehmen, falls je auf gebündelte Assets gewechselt wird. Dann
   wären auch Cookies Third-Party und next-auth bräuchte die
   Capacitor-HTTP- und Cookie-Plugins. Deshalb: Remote-URL-Modus.

Capacitor:
3. `server.url` auf `https://padelmaestro.de`, `www` über
   `allowNavigation` oder den Caddy-Redirect abdecken.
4. `server.errorPath` für eine Offline-Seite, sonst bleibt die
   WebView bei fehlendem Netz leer.
5. `@capacitor/status-bar` für helle Symbole auf dunklem Hintergrund.
6. Optional `@capacitor/browser`, wenn externe Links als Sheet statt in
   Safari öffnen sollen.
7. Plugins vor dem Einbau auf SPM-Unterstützung prüfen.

Stolpersteine:
- `capacitor.config.ts` lädt unter Node 22.22 nicht
  („Unexpected token export“); `capacitor.config.json` verwenden.
- GUI-Automation des Simulators per AppleScript ist ohne
  Bedienungshilfen-Freigabe blockiert. Der Proxy-plus-JS-Konsole-Ansatz
  ist der brauchbare Ersatz.

## Für den App-Store-Review

Ein reiner Web-Wrapper riskiert eine Ablehnung nach Richtlinie 4.2.
Push, Statusleiste, Haptik und natives Teilen bleiben wie geplant
Bestandteil von Phase 3.
