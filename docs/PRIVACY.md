# Datenschutzerklärung & DSGVO-Hinweise (German)

**Gogure Do** („Do") — entwickelt von Gogure Interactive Labs.
Kurzfassung: **Local-first.** Die App erhebt und überträgt personenbezogene Daten nur, wenn Sie es ausdrücklich selbst veranlassen.

## 1. Verantwortlicher & anwendbares Recht
Verantwortlich im Sinne von Art. 4 Nr. 7 DSGVO: Gogure Interactive Labs. Es gilt die EU-Datenschutz-Grundverordnung (DSGVO) sowie das BDSG.

## 2. Grundsatz: Datenminimierung & Speicherort (Art. 5, 25 DSGVO)
- Alle Inhalte (Aufgaben, Projekte, Ideen, Memos, Termine, Einladungen, Fokus-Statistiken, Einstellungen) werden **ausschließlich lokal im Browser** des Nutzers gespeichert (`localStorage`, Schlüssel `gogure-do-store-v1`).
- Es gibt **keine Konten, keine Cookies zu Tracking-Zwecken, keine Analysen, keine Werbenetzwerke, keine Drittanbieter-Skripte**. Der Quellcode enthält keine Telemetrie.
- Das Frontend wird statisch ausgeliefert (GitHub Pages). Dabei fallen lediglich die für den HTTP-Abruf technisch notwendigen Server-Logs beim Hosting-Anbieter an (IP, User-Agent; Rechtsgrundlage Art. 6 Abs. 1 lit. f DSGVO — bereitgestellter Dienst).

## 3. Personenbezogene Daten in der Nutzung
Beim Anlegen von **Einladungen** speichern Sie E-Mail-Adressen Dritter; bei **Delegation/@Mentionen** Namen. Diese Daten:
- verbleiben standardmäßig in Ihrem Browser (Sie sind dann Verantwortlicher i.S.d. DSGVO für diese Daten),
- werden **nur** an Ihren eigenen, optional konfigurierten Sync-Backend übertragen, wenn Sie unter „Einstellungen" eine Backend-URL hinterlegen (opt-in, Art. 6 Abs. 1 lit. a/b DSGVO).

## 4. Optionales Sync-Backend (self-hosted)
- Betrieb auf eigener Infrastruktur empfohlen (EU-Rechenzentrum/Home-Server); Auftragsverarbeitung (Art. 28) bzw. gemeinsame Verantwortung ist selbst herzustellen.
- Verarbeitet werden ausschließlich: E-Mail-Adressen von Eingeladenen, Rolle/Status der Einladung, ein opakes Workspace-JSON des Nutzers.
- Sicherheit: Bearer-Token-Authentifizierung (`GOGURE_DO_TOKEN`), Größenlimit 2 MB, keine Request-Body-Logs, atomare Schreibvorgänge.
- Löschung: `DELETE /api/invites/:id` und `DELETE /api/workspace` löschen hard; alternativ Datenverzeichnis entfernen.

## 5. Betroffenenrechte (Art. 15–21 DSGVO)
Die App unterstützt Rechte direkt über die UI:
- **Auskunft & Datenübertragbarkeit (Art. 15, 20):** „Export" erzeugt das vollständige JSON Ihres Workspaces.
- **Berichtigung/Löschung (Art. 16, 17):** Bearbeiten/Löschen einzelner Einträge oder „Alle Daten löschen" setzt den lokalen Speicher zurück.
- Bei Nutzung des Backends gelten die gleichen Endpunkte (s. o.).

## 6. Benachrichtigungen
Browser-Benachrichtigungen bei Timer-Ende sind optional und erteilen Ihre ausdrückliche Einwilligung über die Browser-Permission-API (Art. 6 Abs. 1 lit. a DSGVO); sie verlassen das Gerät nicht.

## 7. Kinderdatenschutz
Die App richtet sich nicht an Kinder unter 16 Jahren; es werden keine Mechanismen zur Erhebung von Kinderdaten bereitgestellt.

## 8. Änderungen dieser Erklärung
Änderungen werden im Repository als Commit mit Tag veröffentlicht. Stand: 26.09.2026.
