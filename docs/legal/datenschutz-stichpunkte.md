# Datenschutz: Stichpunkte

Rohmaterial für die Datenschutzerklärung, keine Datenschutzerklärung. Nicht juristisch geprüft.

## Hosting und Dienstleister

- Hosting auf einem IONOS-VPS in Deutschland
- Resend als Auftragsverarbeiter für den Mailversand (US-Unternehmen; EU-Region, falls gewählt)
- Nur Transaktionsmails: Adressbestätigung, Passwort zurücksetzen, Änderungshinweis

## Gespeicherte Daten pro Account

- Name, E-Mail-Adresse, optional Benutzername
- Passwort-Hash (kein Klartext)
- Optional Avatar
- Mitgliedschaft und Rolle pro Gruppe
- Spielergebnisse, Joker-Nutzung
- Audit-Log-Einträge mit Zeitstempel

## Cookies, Tracking

- Nur Session-Cookie (HttpOnly, 30 Tage)
- Keine Analyse- oder Tracking-Tools

## E-Mail-Tokens

- Tokens werden nur gehasht gespeichert
- Ablauf: 24 h (Bestätigung), 1 h (Passwort zurücksetzen)

## Löschung und Export

- Export (Profil, `GET /api/profile/export`): JSON mit Konto, Mitgliedschaften, Teilnahmen, Matches mit Mitspieler-Namen, Joker, eigenen Audit-Einträgen inkl. Payload und Avatar
- Der Export kann IDs anderer Konten aus eigenen Aktionen enthalten
- Löschung (Profil, Passwort erforderlich): Anonymisierung statt Löschung der Spielergebnisse
- Name wird „Gelöschter Spieler", E-Mail `geloescht-<id>@anonym.invalid`; Passwort, Avatar und Benutzername werden entfernt
- Mitgliedschaften werden beendet, Teilnahmen an geplanten Spieltagen entfernt; abgeschlossene Ergebnisse bleiben anonym erhalten
- Eigene Audit-Einträge als Actor bleiben mit ID erhalten; Einträge über die Person werden anonymisiert
- Gesperrt, solange die Person Besitzer einer Gruppe ist
- Konten ohne Passwort entfernt ein Admin aus der Gruppe

## Offene Punkte

- Drittlandtransfer (Resend, USA): SCC / EU-Region prüfen

## Kontakt

- Siehe Impressum
