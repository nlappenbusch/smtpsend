# 📧 SMTP Massenversand Tool

Ein professionelles Web-Tool für den Versand von personalisierten HTML-E-Mails an große Empfängerlisten.

## 🎯 Hauptfunktionen

### E-Mail Editor
- **Rich-Text Editor** (Quill.js) für professionelle HTML-E-Mails
- Formatierung: Fett, Kursiv, Listen, Links, Farben
- **Bild-Upload** mit automatischer Einbettung
- **Dateianhänge** (PDF, Excel, etc.)
- **EML-Import**: Outlook-E-Mails direkt laden und versenden

### Empfängerverwaltung
- CSV-Import für Massenlisten (Drag & Drop)
- Manuelle Eingabe einzelner Adressen
- Duplikat-Erkennung
- Empfängerliste bearbeiten und löschen

### Versand-Features
- **Paralleler Versand**: 10 E-Mails gleichzeitig
- **Batch-Verarbeitung**: Konfigurierbare Gruppen (1-1000 Empfänger)
- **Verzögerungen**: Anpassbare Pausen zwischen E-Mails
- **Fortschrittsanzeige**: Echtzeit-Statistiken
- **Live-Logging**: Erfolge und Fehler pro E-Mail
- **Stopp-Funktion**: Versand jederzeit unterbrechbar

### SMTP-Konfiguration
- **Aktueller Server**: mail.pc4play.de:587 (STARTTLS)
- **Absender**: faltin@faltintravel.com
- **CID-Attachments**: Bilder werden korrekt als eingebettete Attachments versendet
- Sichere Authentifizierung

## 📊 Performance

- **Versandgeschwindigkeit**: ~10 E-Mails pro Sekunde
- **Batch-Größe**: Standard 100 (max 1000)
- **Parallele Threads**: 10 gleichzeitige Verbindungen
- **Pause zwischen Batches**: 3 Sekunden

## 🛡️ Datenschutz

- Jeder Empfänger erhält eine **separate, individuelle E-Mail**
- **Keine Sichtbarkeit** anderer Empfänger (kein CC/BCC)
- Server-seitige SMTP-Credentials (nicht im Browser)

## 🚀 Installation

1. **Node.js installieren** (falls noch nicht vorhanden)
   - Download: https://nodejs.org/

2. **Abhängigkeiten installieren**
   ```bash
   npm install
   ```

3. **Server starten**
   ```bash
   npm start
   ```

4. **Browser öffnen**
   - Öffnen Sie http://localhost:3000

## 📝 Verwendung

### 1. CSV-Datei vorbereiten
Ihre CSV-Datei sollte folgendes Format haben:
```
EMAIL;ADDED_TIME;MODIFIED_TIME
test@example.com;18-06-2024;28-01-2026
another@example.com;19-06-2024;28-01-2026
```

### 2. Empfänger laden
- Ziehen Sie Ihre CSV-Datei in die Upload-Zone
- Oder klicken Sie auf die Zone, um eine Datei auszuwählen
- Die Anzahl der geladenen Empfänger wird angezeigt

### 3. Email erstellen
- Geben Sie einen Betreff ein
- Nutzen Sie den WYSIWYG-Editor zum Formatieren
- Verwenden Sie die Toolbar für:
  - Überschriften
  - Fett, Kursiv, Unterstrichen
  - Farben und Hintergründe
  - Listen und Ausrichtung
  - Links und Bilder

### 4. Testen (optional)
- Klicken Sie auf "Test-Email senden"
- Geben Sie eine Test-Email-Adresse ein
- Überprüfen Sie das Ergebnis

### 5. Massenversand starten
- Konfigurieren Sie die Verzögerung (empfohlen: 0-1 Sekunden)
- Setzen Sie die Batch-Größe (empfohlen: 100)
- Klicken Sie auf "Massenversand starten"
- Überwachen Sie den Fortschritt in Echtzeit

## ⚙️ SMTP-Konfiguration

Das Tool ist für mail.pc4play.de konfiguriert:

- **Server:** mail.pc4play.de
- **Port:** 587 (STARTTLS)
- **Login:** faltin@faltintravel.com
- **Von:** "Faltin Travel" <faltin@faltintravel.com>
- **Antwort an:** kontakt@faltintravel.com

Um andere SMTP-Server zu verwenden, bearbeiten Sie die `SMTP_CONFIG` in `server.js`.

## 📊 Empfohlene Einstellungen

| Liste Größe | Verzögerung | Batch-Größe |
|-------------|-------------|-------------|
| < 500       | 0 Sekunden  | 100         |
| 500-1000    | 0 Sekunden  | 100         |
| > 1000      | 1 Sekunde   | 200         |

## 🔄 Updates & Änderungen

### 2026-01-29
- ✅ SMTP-Server auf mail.pc4play.de umgestellt
- ✅ Absenderadresse korrigiert (faltin@faltintravel.com)
- ✅ CID-Attachment-Konvertierung für korrekte Bilddarstellung
- ✅ Paralleler Versand implementiert (10 E-Mails gleichzeitig = 10x schneller)
- ✅ Batch-Größe auf max 1000 erhöht
- ✅ Pausen zwischen Batches auf 3 Sekunden reduziert

## 🛡️ Sicherheitshinweise

- **Datenschutz:** Jeder Empfänger erhält eine individuelle E-Mail
- **Test zuerst:** Senden Sie immer eine Test-Email vor dem Massenversand
- **Empfänger-Einwilligung:** Versenden Sie nur Emails an Empfänger mit Zustimmung

## 🐛 Fehlerbehebung

### Server startet nicht
- Prüfen Sie, ob Port 3000 bereits belegt ist
- Führen Sie `npm install` erneut aus

### Emails werden nicht gesendet
- Überprüfen Sie die SMTP-Zugangsdaten
- Prüfen Sie Ihre Internetverbindung
- Schauen Sie in das Server-Log für Details

### CSV wird nicht erkannt
- Stellen Sie sicher, dass die Datei das richtige Format hat
- Verwenden Sie Semikolon (;) als Trennzeichen
- Die erste Zeile sollte die Spaltenüberschriften enthalten

## 📦 Technologie-Stack

- **Frontend:** HTML5, CSS3, JavaScript (ES6+)
- **Editor:** Quill.js
- **Backend:** Node.js, Express
- **Email:** Nodemailer
- **Design:** Custom CSS mit modernem Dark Theme

## 📄 Lizenz

MIT License - Frei verwendbar für private und kommerzielle Projekte.

## 🤝 Support

Bei Fragen oder Problemen erstellen Sie ein Issue im Repository.

---

**Wichtig:** Dieses Tool ist für legitime Email-Kampagnen gedacht. Missbrauch für Spam ist illegal und wird nicht unterstützt.
