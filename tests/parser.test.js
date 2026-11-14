import { describe, it, expect } from 'vitest';
import { parseTable, parseSuggestions, parseSuggestCell, splitCheck, splitRow, cleanCell } from '../src/core/parser.js';

const basic = `| Kriterium | A | B |
|---|---|---|
| Funktion | a1 | b1 |
| Kosten | a2 | b2 |`;

describe('parseTable', () => {
  it('liest eine einfache Tabelle', () => {
    const r = parseTable(basic);
    expect(r.ok).toBe(true);
    expect(r.cols).toEqual(['A', 'B']);
    expect(r.rows).toEqual([
      { name: 'Funktion', cells: ['a1', 'b1'] },
      { name: 'Kosten', cells: ['a2', 'b2'] },
    ]);
  });

  it('behandelt escaped Pipes als Zellinhalt', () => {
    const r = parseTable('| K | A | B |\n|---|---|---|\n| X | a \\| b | c |');
    expect(r.rows[0].cells).toEqual(['a | b', 'c']);
  });

  it('wandelt <br> in Zeilenumbrüche', () => {
    const r = parseTable('| K | A | B |\n|---|---|---|\n| X | eins<br>zwei<br/>drei | c<BR />d |');
    expect(r.rows[0].cells).toEqual(['eins\nzwei\ndrei', 'c\nd']);
  });

  it('entfernt **Fettdruck**', () => {
    const r = parseTable('| **Kriterium** | **A** | B |\n|---|---|---|\n| **X** | **ja**, mit **Haken** | c |');
    expect(r.cols).toEqual(['A', 'B']);
    expect(r.rows[0]).toEqual({ name: 'X', cells: ['ja, mit Haken', 'c'] });
  });

  it('findet die Tabelle in einem ```-Codeblock', () => {
    const r = parseTable('Hier:\n```markdown\n' + basic + '\n```\nEnde');
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(2);
  });

  it('akzeptiert Trennzeilen mit Doppelpunkten und Leerzeichen', () => {
    const r = parseTable('| K | A | B |\n| :--- | :---: | ---: |\n| X | a | b |');
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([{ name: 'X', cells: ['a', 'b'] }]);
  });

  it('füllt fehlende Zellen mit leerem Text', () => {
    const r = parseTable('| K | A | B |\n|---|---|---|\n| X | nur a |\n| Y |');
    expect(r.rows[0].cells).toEqual(['nur a', '']);
    expect(r.rows[1].cells).toEqual(['', '']);
  });

  it('ignoriert überzählige Zellen', () => {
    const r = parseTable('| K | A | B |\n|---|---|---|\n| X | a | b | zu viel |');
    expect(r.rows[0].cells).toEqual(['a', 'b']);
  });

  it('nimmt bei mehreren Tabellen die erste', () => {
    const second = '| K | C | D |\n|---|---|---|\n| Z | c | d |';
    const r = parseTable(basic + '\n\nZwischentext\n\n' + second);
    expect(r.cols).toEqual(['A', 'B']);
    expect(r.rows.map((x) => x.name)).toEqual(['Funktion', 'Kosten']);
  });

  it('kommt mit Text vor und nach der Tabelle klar', () => {
    const r = parseTable('Hier die Antwort.\nEin Satz | mit Pipe im Text.\n\n' + basic + '\n\n**Quellen**\n1. https://example.org (Stand 2026-01-01)\n');
    expect(r.ok).toBe(true);
    expect(r.cols).toEqual(['A', 'B']);
    expect(r.rows).toHaveLength(2);
  });

  it('kommt mit Windows-Zeilenenden klar', () => {
    const r = parseTable(basic.replace(/\n/g, '\r\n'));
    expect(r.ok).toBe(true);
    expect(r.rows).toHaveLength(2);
  });

  it('liefert einen sauberen Fehler bei Kopfzeile mit weniger als 3 Spalten', () => {
    expect(parseTable('| Kriterium | A |\n|---|---|\n| X | a |')).toEqual({ ok: false, error: 'too-few-columns' });
  });

  it('liefert no-table, wenn keine Tabelle da ist', () => {
    expect(parseTable('Nur Text ohne Tabelle.')).toEqual({ ok: false, error: 'no-table' });
    expect(parseTable('')).toEqual({ ok: false, error: 'no-table' });
    expect(parseTable(undefined)).toEqual({ ok: false, error: 'no-table' });
  });

  it('liefert no-rows, wenn nur Kopf und Trennzeile da sind', () => {
    expect(parseTable('| K | A | B |\n|---|---|---|')).toEqual({ ok: false, error: 'no-rows' });
  });

  it('funktioniert auch ohne Trennzeile', () => {
    const r = parseTable('| K | A | B |\n| X | a | b |');
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([{ name: 'X', cells: ['a', 'b'] }]);
  });

  it('funktioniert ohne äußere Pipes', () => {
    const r = parseTable('K | A | B\n--- | --- | ---\nX | a | b');
    expect(r.ok).toBe(true);
    expect(r.cols).toEqual(['A', 'B']);
  });
});

describe('parseTable mit Produkt-Hinweisen', () => {
  const summary = '| Thema | Fazit |\n|---|---|\n| Gesamt | gut |\n\n| Kriterium | Alpha | Beta |\n|---|---|---|\n| K1 | a | b |';
  it('ignoriert eine vorangestellte Zusammenfassungstabelle, wenn Produkte bekannt sind', () => {
    const r = parseTable('| Bereich | Hinweis | Quelle |\n|---|---|---|\n| x | y | z |\n\n' + '| Kriterium | Alpha | Beta |\n|---|---|---|\n| K1 | a | b |', { products: ['Alpha', 'Beta'] });
    expect(r.cols).toEqual(['Alpha', 'Beta']);
    expect(r.rows[0].name).toBe('K1');
  });
  it('überspringt zu schmale Tabellen, wenn eine brauchbare folgt', () => {
    const r = parseTable(summary, { products: ['Alpha', 'Beta'] });
    expect(r.ok).toBe(true);
    expect(r.cols).toEqual(['Alpha', 'Beta']);
  });
  it('stellt eine gedrehte Tabelle (Produkte in Zeilen) um', () => {
    const t = '| Produkt | Funktion | Kosten |\n|---|---|---|\n| Alpha | f-a | k-a |\n| Beta | f-b | k-b |';
    const r = parseTable(t, { products: ['Alpha', 'Beta'] });
    expect(r.transposed).toBe(true);
    expect(r.cols).toEqual(['Alpha', 'Beta']);
    expect(r.rows).toEqual([
      { name: 'Funktion', cells: ['f-a', 'f-b'] },
      { name: 'Kosten', cells: ['k-a', 'k-b'] },
    ]);
  });
  it('erkennt Produktnamen auch mit Zusätzen wie „Microsoft Intune“', () => {
    const r = parseTable('| Kriterium | Microsoft Intune (Cloud) | WSUS |\n|---|---|---|\n| K | a | b |', { products: ['Intune', 'WSUS'] });
    expect(r.transposed).toBeUndefined();
    expect(r.cols).toHaveLength(2);
  });
  it('fällt ohne Treffer auf die erste Tabelle zurück', () => {
    const r = parseTable(basic, { products: ['Gamma', 'Delta'] });
    expect(r.cols).toEqual(['A', 'B']);
  });
});

describe('Tabulatorgetrennte Kopie', () => {
  it('liest eine aus der gerenderten Ansicht kopierte Tabelle (Tabs statt Pipes)', () => {
    const t = 'Kriterium\tIntune\tWSUS\nFunktion\tCloud [1]\tNur Updates\nKosten\tin M365\tkostenlos';
    const r = parseTable(t, { products: ['Intune', 'WSUS'] });
    expect(r.ok).toBe(true);
    expect(r.cols).toEqual(['Intune', 'WSUS']);
    expect(r.rows[1]).toEqual({ name: 'Kosten', cells: ['in M365', 'kostenlos'] });
  });
  it('bevorzugt Pipe-Tabellen, wenn beides vorkommt', () => {
    expect(parseTable(basic + '\n\na\tb\tc\nd\te\tf').cols).toEqual(['A', 'B']);
  });
});

const MAIN = '| Kriterium | Alpha | Beta |\n|---|---|---|\n| Funktion | fa | fb |\n| Kosten | ka | kb |';
const SUG = '| Kriterium | Gewicht | Alpha | Beta |\n|---|---|---|---|\n| Funktion | 5 – wichtig für den Kunden | 4 – deckt ab [1] | 2 – Lücken |\n| Kosten | 3 – mittel | 5/5: günstig | 1 nicht belegt |';

describe('Bewertungsvorschläge', () => {
  it('parseSuggestCell liest Zahl und Begründung in gängigen Schreibweisen', () => {
    expect(parseSuggestCell('4 – gut')).toEqual({ value: 4, why: 'gut' });
    expect(parseSuggestCell('4 - gut')).toEqual({ value: 4, why: 'gut' });
    expect(parseSuggestCell('4: gut')).toEqual({ value: 4, why: 'gut' });
    expect(parseSuggestCell('5/5 – top')).toEqual({ value: 5, why: 'top' });
    expect(parseSuggestCell('0 nicht erfüllt')).toEqual({ value: 0, why: 'nicht erfüllt' });
    expect(parseSuggestCell('3')).toEqual({ value: 3, why: '' });
    expect(parseSuggestCell('10 – zu hoch')).toBeNull();
    expect(parseSuggestCell('gut')).toBeNull();
    expect(parseSuggestCell('')).toBeNull();
  });

  it('die Vorschlagstabelle wird nie als Haupttabelle gewählt, egal in welcher Reihenfolge', () => {
    for (const text of [MAIN + '\n\n' + SUG, SUG + '\n\n' + MAIN]) {
      const r = parseTable(text, { products: ['Alpha', 'Beta'] });
      expect(r.cols).toEqual(['Alpha', 'Beta']);
      expect(r.rows[0].cells).toEqual(['fa', 'fb']);
      const r2 = parseTable(text);
      expect(r2.rows[0].cells).toEqual(['fa', 'fb']);
    }
  });

  it('ordnet Gewicht und Punkte den Zeilen und Produkten zu', () => {
    const text = MAIN + '\n\n' + SUG;
    const t = parseTable(text, { products: ['Alpha', 'Beta'] });
    const s = parseSuggestions(text, t);
    expect(s[0].weight).toEqual({ value: 5, why: 'wichtig für den Kunden' });
    expect(s[0].scores).toEqual([{ value: 4, why: 'deckt ab [1]' }, { value: 2, why: 'Lücken' }]);
    expect(s[1].scores[0]).toEqual({ value: 5, why: 'günstig' });
    expect(s[1].scores[1]).toEqual({ value: 1, why: 'nicht belegt' });
  });

  it('ordnet auch bei abweichender Spaltenreihenfolge und Kriterien-Schreibweise zu', () => {
    const sug = '| Kriterium | Gewicht | Beta | Alpha |\n|---|---|---|---|\n| funktion | 2 – x | 1 – b | 5 – a |';
    const t = parseTable(MAIN, { products: ['Alpha', 'Beta'] });
    const s = parseSuggestions(sug, t);
    expect(s[0].scores.map((x) => x.value)).toEqual([5, 1]);
    expect(s[1]).toBeNull();
  });

  it('liefert null ohne Vorschlagstabelle', () => {
    expect(parseSuggestions(MAIN, parseTable(MAIN))).toBeNull();
  });

  it('funktioniert in einem Codeblock mit Quellen darunter', () => {
    const text = '```markdown\n' + MAIN + '\n\n' + SUG + '\n\nQuellen\n1. https://example.org\n```';
    const t = parseTable(text, { products: ['Alpha', 'Beta'] });
    expect(parseSuggestions(text, t)).toHaveLength(2);
  });
});

describe('Helfer', () => {
  it('splitRow trennt und trimmt', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b | c', 'd']);
  });
  it('cleanCell räumt Leerraum um Umbrüche auf', () => {
    expect(cleanCell('  a <br> b  ')).toBe('a\nb');
  });
});

describe('Prüf-Tags der Gegenprüfung', () => {
  it('splitCheck erkennt die vier Tags in gängigen Schreibweisen', () => {
    expect(splitCheck('[OK] bestätigt')).toEqual({ check: 'ok', text: 'bestätigt' });
    expect(splitCheck('[korrigiert]: richtig ist X')).toEqual({ check: 'fix', text: 'richtig ist X' });
    expect(splitCheck(' [ VERALTET ] – seit 2025 anders')).toEqual({ check: 'old', text: 'seit 2025 anders' });
    expect(splitCheck('[NICHT_BELEGT]')).toEqual({ check: 'unproven', text: '' });
    expect(splitCheck('[1] Quelle am Anfang')).toEqual({ check: null, text: '[1] Quelle am Anfang' });
    expect(splitCheck('ohne')).toEqual({ check: null, text: 'ohne' });
  });
  it('die geprüfte Tabelle lässt sich normal einlesen, Fettdruck um den Tag stört nicht', () => {
    const t = '```markdown\n| Kriterium | Alpha | Beta |\n|---|---|---|\n| K | **[OK]** passt [1] | [VERALTET] alt |\n```';
    const r = parseTable(t, { products: ['Alpha', 'Beta'] });
    expect(r.ok).toBe(true);
    expect(r.rows[0].cells).toEqual(['[OK] passt [1]', '[VERALTET] alt']);
  });
});
