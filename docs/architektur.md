# Architektur

```
src/
  core/        reine Funktionen, kein DOM, kein Storage
    parser.js    Markdown-Tabelle -> { ok, cols, rows } | { ok:false, error }
    calc.js      Nutzwert, Erfüllungsgrad, K.-o.-Ausscheiden, Ranking
    sensitivity.js  Belastbarkeit: Dominanz, Gewichts- und Punkte-Kipppunkte
    prompt.js    Prompt-Builder (Vorlage aus config/)
    markdown.js  Export der Nutzwertanalyse
    state.js     Startzustand, Normalisierung, Sitzungs- und Kriterien-Dateien
    util.js      slugify, formatDate, activeCriteria
  config/      criteria.json, prompt-template.json
  ui/          main.js (Verdrahtung), dom.js (Escaping, Download, Kopieren)
  strings.js   alle Texte
  index.html   Gerüst mit {{Text-Platzhaltern}}
  styles.css
scripts/build.mjs   esbuild + Inline-Skript
tests/              Vitest (Kernmodule), smoke/ (Playwright gegen dist/)
```

## Warum esbuild und kein Vite

Die App ist eine Seite ohne Framework. esbuild bündelt JS und minifiziert CSS, ein Skript von rund 80 Zeilen setzt beides in `src/index.html` ein. Das ist eine Entwicklungsabhängigkeit statt einer ganzen Vite-/Rollup-Kette mit Plugin. Vitest braucht für die Tests ohnehin Vite, es landet aber nie im Build.

## Build-Ausgaben

- `dist/tradeoff-desk.html`: eine Datei, alles inline, läuft per Doppelklick über `file://`. Der Build bricht ab, wenn darin `<link>`, `src`, `@import` oder `url()` auf externe Adressen zeigen.
- `dist/pages/`: dieselbe App plus `manifest.webmanifest`, `icon.svg` und `sw.js` (Cache-first, versioniert über einen Hash). Nur diese Variante registriert den Service Worker, und nur unter http(s). Die Einzeldatei hängt nicht davon ab.

## Datenfluss

`state` (ein Objekt in `ui/main.js`) -> Kernfunktionen -> DOM. Jede Änderung ruft `save()` (250 ms entprellt, zusätzlich beim Verlassen der Seite) und schreibt nach `localStorage['tradeoff-desk-v1']`. Alle Storage-Zugriffe laufen in `try/catch`. Ist der Speicher gesperrt, funktioniert die App weiter und weist auf „Sitzung speichern“ hin.
