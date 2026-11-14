# Anpassen ohne Eingriff in die Logik

## Kriterien-Set

- **In der Oberfläche:** Schritt 1, „Kriterien anpassen“. Name, Hinweis, Vorauswahl und Reihenfolge ändern, Kriterien löschen oder ergänzen. „Kriterien-Set speichern“ legt das Set als JSON ab, „Kriterien-Set laden“ liest es wieder ein (auch aus einer kompletten Sitzungsdatei). So lässt sich ein Team-Standard verteilen.
- **Als Standard in der App:** `src/config/criteria.json` bearbeiten (Felder `id`, `name`, `hint`, `on`) und neu bauen.

## Prompt-Vorlage

`src/config/prompt-template.json` enthält alle festen Textbausteine: Einleitung, Überschriften, Recherche-Vorgaben, Ausgabeformat und Schlusssatz. `{products}` wird durch die Produktliste ersetzt. Varianten: `output`/`closing` (ohne Modellvorschlag), `outputSuggest`/`closingSuggest` (mit Bewertungsvorschlag), `reformat` (Folge-Prompt) und `crosscheck` (Gegenprüfung durch ein zweites Modell, inklusive der vier Prüf-Tags `[OK]`, `[KORRIGIERT]`, `[VERALTET]`, `[NICHT BELEGT]`, die der Parser erkennt: ändere sie nur gemeinsam mit `splitCheck` in `src/core/parser.js`). Nach einer Änderung `npm test` laufen lassen. Die Snapshot-Tests zeigen dir den Diff, mit `npx vitest run -u` übernimmst du ihn.

## Texte und Sprache

Alle Oberflächentexte stehen in `src/strings.js` (Objekt `de`). Statische Texte aus `src/index.html` werden beim Build über `{{pfad.zum.schluessel}}` eingesetzt. Für Englisch ein zweites Objekt `en` mit denselben Schlüsseln anlegen und den Import in `scripts/build.mjs` und `src/ui/main.js` umstellen (oder pro Sprache einen eigenen Build erzeugen). Prompt-Vorlage und Markdown-Beschriftungen entsprechend mitführen.

## Dateiformate

Sitzung (`tradeoff-desk-sitzung-….json`): `{ app: "tradeoff-desk", type: "session", version: 1, savedAt, state }`.
Kriterien-Set (`tradeoff-desk-kriterien-….json`): `{ app: "tradeoff-desk", type: "criteria", version: 1, criteria: [...] }`.
Geladene Dateien werden normalisiert: ungültige Werte (Gewicht außerhalb 1 bis 5, Punkte außerhalb 0 bis 5) werden korrigiert oder verworfen.
