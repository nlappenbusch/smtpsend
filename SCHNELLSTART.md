# 🚀 Schnellstart-Anleitung

## Installation & Start (3 Schritte)

### 1. Abhängigkeiten installieren
```bash
npm install
```

### 2. Server starten
```bash
npm start
```

### 3. Browser öffnen
Öffnen Sie: **http://localhost:3000**

---

## Erste Schritte

### ✅ CSV-Datei hochladen
1. Ziehen Sie Ihre CSV-Datei in die Upload-Zone
2. Oder klicken Sie auf die Zone zum Auswählen
3. ✓ Empfänger werden automatisch geladen

### ✅ Email erstellen
1. **Betreff** eingeben
2. **WYSIWYG-Editor** nutzen:
   - Formatierung: Fett, Kursiv, Unterstrichen
   - Überschriften (H1, H2, H3)
   - Farben und Hintergründe
   - Listen und Ausrichtung
   - Links und Bilder einfügen

### ✅ Testen (empfohlen!)
1. Klick auf "Test-Email senden"
2. Ihre Email-Adresse eingeben
3. Email prüfen

### ✅ Massenversand
1. **Verzögerung** einstellen (empfohlen: 1-2 Sek.)
2. **Batch-Größe** festlegen (empfohlen: 50)
3. "Massenversand starten" klicken
4. Fortschritt beobachten

---

## ⚡ Tipps für optimalen Versand

### Verzögerungen
- **Kleine Listen (<100):** 1 Sekunde
- **Mittlere Listen (100-500):** 2 Sekunden  
- **Große Listen (>500):** 2-3 Sekunden

### Batch-Größen
- **Standard:** 50 Emails pro Batch
- **Große Listen:** 25 Emails pro Batch
- Nach jedem Batch: Automatische 5 Sekunden Pause

### Spam-Vermeidung
✓ Angemessene Verzögerungen verwenden  
✓ Kleinere Batches bei großen Listen  
✓ Immer Test-Email zuerst senden  
✓ Nur an Empfänger mit Einwilligung senden

---

## 🎨 Editor-Funktionen

### Toolbar-Übersicht
- **Überschriften:** H1, H2, H3
- **Text:** Fett, Kursiv, Unterstrichen, Durchgestrichen
- **Farben:** Text- und Hintergrundfarben
- **Listen:** Nummeriert, Aufzählungen
- **Ausrichtung:** Links, Zentriert, Rechts
- **Medien:** Links, Bilder
- **Bereinigen:** Formatierung entfernen

### HTML-Vorschau
Klicken Sie auf "Vorschau", um zu sehen, wie Ihre Email aussieht.

---

## 📊 Fortschrittsüberwachung

Während des Versands sehen Sie:
- **Fortschrittsbalken** mit Prozentanzeige
- **Erfolgreich** gesendete Emails (grün)
- **Fehlgeschlagen** (rot)
- **Verbleibend** zu sendende Emails
- **Live-Log** mit allen Aktivitäten

---

## 🛑 Versand stoppen

Klicken Sie auf "Versand stoppen", um den Prozess zu unterbrechen.  
Der Versand stoppt nach der aktuell versendeten Email.

---

## ❓ Häufige Fragen

**Q: Welches CSV-Format wird benötigt?**  
A: Semikolon-getrennt (;) mit Spalten: EMAIL;ADDED_TIME;MODIFIED_TIME

**Q: Kann ich HTML-Code direkt einfügen?**  
A: Ja, der Editor unterstützt HTML-Formatierung

**Q: Wie viele Emails kann ich versenden?**  
A: Unbegrenzt, aber beachten Sie die SMTP-Limits Ihres Providers

**Q: Werden die Emails personalisiert?**  
A: Aktuell nicht, aber alle Empfänger erhalten dieselbe Email

**Q: Ist der Versand sicher?**  
A: Ja, alle Daten bleiben lokal auf Ihrem Computer

---

## 📞 Support

Bei Problemen:
1. Prüfen Sie das Server-Log im Terminal
2. Schauen Sie in den Browser-Log (F12)
3. Lesen Sie die vollständige README.md

---

**Viel Erfolg mit Ihrem Email-Versand! 🎉**
