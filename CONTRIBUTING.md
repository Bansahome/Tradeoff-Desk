# Mitwirken

Kurz und pragmatisch:

1. `npm ci`, dann `npm test` und `npm run build`. Beides muss grün sein, bevor du einen Pull Request öffnest.
2. Logik gehört in `src/core/` als reine Funktion mit Test in `tests/`. Das DOM bleibt in `src/ui/`.
3. Texte nur in `src/strings.js`, Kriterien in `src/config/criteria.json`, Prompt-Vorlage in `src/config/prompt-template.json`.
4. Keine Laufzeit-Abhängigkeiten, keine externen Requests (Fonts, CDN, Tracking). Der Build bricht ab, wenn die Einzeldatei etwas Externes referenziert.
5. Beispieldaten neutral halten: keine Kundennamen, Firmennamen oder E-Mail-Adressen in Code, Tests oder Commits.
6. Änderungen an Prompt-Text oder Export-Format ändern Snapshots. Mit `npx vitest run -u` aktualisieren und den Diff bewusst prüfen.

Vor größeren Änderungen am Ablauf der drei Schritte bitte kurz ein Issue aufmachen.
