# App Store: Eintrag für Padelmaestro

Alles, was in App Store Connect einzutragen ist. Version 1.0.0, Sprache Deutsch, Verfügbarkeit Deutschland, Österreich, Schweiz.

## App-Informationen

| Feld | Wert |
|---|---|
| Name (max. 30) | Padelmaestro – Padel Tracker |
| Untertitel (max. 30) | Spieltage, Rangliste, Duos |
| Primäre Kategorie | Sport |
| Sekundäre Kategorie | Soziale Netze (optional, sonst leer) |
| Inhaltsrechte | Enthält keine Inhalte Dritter |
| Altersfreigabe | 4+ (alle Fragen mit „Nein“ bzw. „Keine“ beantworten) |

## Version 1.0.0

**Werbetext (max. 170, jederzeit ohne Prüfung änderbar)**

> Neu: Teile dein Spieltag-Ergebnis als Bild, trage Punkte direkt am Platz ein und verfolge die Saison im Verlauf.

**Beschreibung**

> Padelmaestro organisiert eure Padel-Runde. Spieltage planen, Zusagen sammeln, Ergebnisse direkt am Platz eintragen und die Saison-Rangliste immer aktuell im Blick behalten.
>
> SPIELTAGE OHNE CHAOS
> • Spieltag anlegen, alle bekommen eine Benachrichtigung
> • Zusagen, Absagen oder Joker mit einem Tipp
> • Faire Paarungen für 4, 5 oder 6 Spieler werden automatisch erstellt
>
> ERGEBNISSE AM PLATZ
> • Große Anzeigetafel: Tippen zählt einen Punkt, Haptik bestätigt jeden Tipp
> • Eindeutige Ergebnisse speichern sich von selbst
> • Alle sehen jeden Punkt live auf ihrem Handy
>
> RANGLISTE UND STATISTIK
> • Saison-Tabelle mit Podium und Bewegung seit dem letzten Spieltag
> • Saisonverlauf nach Platz oder Punkten, mit Vergleich
> • Deine besten Duos und deine Form auf einen Blick
>
> TEILEN
> • Dein Spieltag als fertiges Bild für WhatsApp oder Instagram
>
> FÜR ADMINS
> • Spieler einladen, Spieltage verwalten, Wertung je Spielerzahl einstellen
>
> Melde dich in Sekunden mit Apple oder per E-Mail an, gründe deine eigene Runde oder tritt per Einladungslink einer bestehenden Gruppe bei. Gruppen sind privat: Nur eingeladene Mitglieder sehen Spieltage und Ergebnisse.

**Schlüsselwörter (max. 100, kommagetrennt ohne Leerzeichen)**

```
padel,spieltag,rangliste,liga,tabelle,ergebnis,doppel,verein,gruppe,saison,punkte,tennis,court,match
```

| Feld | Wert |
|---|---|
| Support-URL | https://padelmaestro.de/support |
| Marketing-URL | https://padelmaestro.de |
| Datenschutz-URL | https://padelmaestro.de/datenschutz |
| Copyright | 2026 Patrick Kowalik |
| Preis | Kostenlos |
| Verfügbarkeit | Deutschland, Österreich, Schweiz |

## App-Datenschutz (Fragebogen „Datenschutzpraktiken“)

„Erfassen Sie Daten von dieser App?“ → **Ja**. Für jeden Typ: *mit der Identität verknüpft: Ja*, *Tracking: Nein*, *Zweck: App-Funktionalität*. Muss zum Privacy-Manifest (`ios/App/App/PrivacyInfo.xcprivacy`) passen.

| Kategorie | Datentyp | Wofür |
|---|---|---|
| Kontaktinformationen | Name | Anzeige in Gruppe und Rangliste |
| Kontaktinformationen | E-Mail-Adresse | Anmeldung (auch Apple-Weiterleitungsadresse), Passwort zurücksetzen |
| Kennungen | Benutzer-ID | Konto (inkl. Apple-Benutzerkennung bei „Mit Apple anmelden“) |
| Nutzerinhalte | Fotos oder Videos | Profilbild (freiwillig) |
| Nutzerinhalte | Andere Nutzerinhalte | Spielergebnisse, Zusagen |

Nicht erfasst: Standort, Kontakte, Zahlungen, Browserverlauf, Nutzungsdaten, Diagnosedaten, Werbe-IDs. Kein Tracking, keine Werbung, keine Analyse-Dienste.

## Händlerstatus (EU, Digital Services Act)

**Kein Händler.** Die App ist kostenlos und ohne Käufe. Ändert sich das später (In-App-Kauf), muss der Status auf „Händler“ wechseln, dann werden Adresse und Kontakt im Store öffentlich angezeigt.

## App-Review: Anmeldeinformationen und Notizen

**Anmeldung erforderlich:** Ja

| Feld | Wert |
|---|---|
| Benutzername | `frankthetank` |
| Passwort | *(aktuelles Passwort des Demo-Kontos eintragen)* |

Demo-Konto prüfen, bevor du einreichst: Login klappt, das Konto ist Admin in der Gruppe „Donnerstagsrunde Münster“, es gibt abgeschlossene Spieltage und ideal einen geplanten.

**Notizen für das Review-Team (Englisch):**

> Padelmaestro is a tool for recreational padel groups in Germany, Austria and Switzerland. Groups are private: members organise game days, confirm attendance, enter match scores on court and follow a season ranking.
>
> Demo account: on the start screen tap "Mit E-Mail anmelden" and sign in as "frankthetank". This user is the admin of the demo group "Donnerstagsrunde Münster" with several finished game days. You can also create a new account ("Neu hier? Konto erstellen") or use "Mit Apple fortfahren" and found your own group.
>
> Native features beyond the website:
> - Sign in with Apple (native sheet)
> - Push notifications for new game days, reminders and results (APNs)
> - Haptic feedback on the court scoreboard (Spieltag tab while a game day is running)
> - Native share sheet to share a generated result image (Archiv > any game day > "Ergebnis teilen")
> - Offline screen with retry when there is no connection
>
> Account deletion: Profil > Konto > "Konto löschen". If the account owns a group, the app first asks to transfer ownership (Verwaltung > Einstellungen) or delete the group, so the other members keep their data. Deleting an Apple account also revokes the Apple token. Data export: Profil > Konto > "Daten exportieren".
>
> The app is free, has no ads, no tracking and no in-app purchases.

## Einreichen, Schritt für Schritt

1. Build 5 (oder neuer, enthält das native Apple-Login-Plugin) ist hochgeladen und in TestFlight getestet.
2. App Store Connect › Meine Apps › Padelmaestro › **App Store** › Version 1.0.0.
3. Screenshots hochladen, Reihenfolge 01 bis 06. Der Reiter „iPhone mit Dynamic Island (mittleres Display)“ nimmt nur `screenshots/6.3-zoll/` (1206×2622); die 1320×2868-Bilder sind für das große Display.
4. Texte, URLs, Schlüsselwörter, Copyright aus diesem Dokument eintragen.
5. Unter **Build** den getesteten Build auswählen.
6. **App-Datenschutz** ausfüllen (Tabelle oben) und veröffentlichen.
7. **Preise und Verfügbarkeit:** Kostenlos, Länder DE, AT, CH.
8. **App-Review-Informationen:** Demo-Zugang und Notizen von oben, Kontakt (Name, Telefon, E-Mail).
9. **Version freigeben:** „Manuell freigeben“ wählen, damit du den Starttag selbst bestimmst.
10. Auf dem Server `PUBLIC_SIGNUP=true` in `/srv/padel/app/.env` setzen und den Dienst neu starten, **bevor** du einreichst (das Review-Team soll die Registrierung testen können).
11. **Zur Prüfung einreichen.** Antwort meist innerhalb von 1 bis 2 Tagen.
