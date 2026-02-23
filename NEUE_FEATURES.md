# Neue Features

## 📧 EML-Datei Import

Du kannst jetzt EML-Dateien direkt hochladen und importieren! Das System extrahiert automatisch:

- ✅ **Betreff** - wird automatisch ins Betreff-Feld übernommen
- ✅ **HTML-Inhalt** - der komplette Email-Body wird in den Editor geladen
- ✅ **Inline-Bilder** - alle eingebetteten Bilder werden automatisch konvertiert und eingebunden

### So funktioniert's:

1. Klicke auf den Button **"EML-Datei hochladen"** unter dem Email-Editor
2. Wähle deine EML-Datei aus
3. Fertig! Betreff, Inhalt und Bilder werden automatisch übernommen

Die hochgeladene EML-Datei "Ryder Cup 2027..." ist bereits im System und kann als Vorlage verwendet werden.

---

## 🖼️ Bilder einfügen per Copy & Paste

Du kannst jetzt Bilder direkt in den Email-Editor einfügen:

### So funktioniert's:

1. Kopiere ein Bild (z.B. aus einer anderen Email, Website oder Screenshot)
2. Klicke in den Email-Editor
3. Drücke **Strg + V** (oder Cmd + V auf Mac)
4. Das Bild wird automatisch als Base64 eingebettet und ist sofort sichtbar

Die Bilder werden direkt in der Email eingebettet, sodass keine externen Links nötig sind.

---

## 🚀 Vorteile

- **Schneller Workflow**: EML-Dateien können als Vorlagen verwendet werden
- **Keine manuellen Anpassungen**: Bilder werden automatisch konvertiert
- **Flexibilität**: Kombiniere EML-Import mit eigenen Anpassungen
- **Professionell**: Alle Bilder werden embedded, keine broken images beim Empfänger

---

## ⚠️ Wichtige Hinweise

- **EML-Format**: Unterstützt werden Standard EML-Dateien (wie von Outlook, Gmail, etc. exportiert)
- **Bildgröße**: Große Bilder werden als Base64 eingebettet - achte auf die Dateigröße der Email
- **Browser-Support**: Image Paste funktioniert in allen modernen Browsern (Chrome, Firefox, Edge, Safari)

---

## 🔧 Technische Details

### Server-seitige Verarbeitung:
- EML-Dateien werden mit `mailparser` geparst
- Inline-Bilder (Content-ID) werden erkannt und extrahiert
- Bilder werden in Base64 konvertiert
- CID-Referenzen im HTML werden durch Base64-Data-URIs ersetzt

### Client-seitige Features:
- Clipboard API erkennt eingefügte Bilder automatisch
- FileReader API konvertiert Bilder zu Base64
- Quill Editor unterstützt embedded images nativ
