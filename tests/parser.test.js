import { describe, it, expect } from 'vitest';
import { parseTable, splitRow, cleanCell } from '../src/core/parser.js';

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

describe('Helfer', () => {
  it('splitRow trennt und trimmt', () => {
    expect(splitRow('| a | b \\| c | d |')).toEqual(['a', 'b | c', 'd']);
  });
  it('cleanCell räumt Leerraum um Umbrüche auf', () => {
    expect(cleanCell('  a <br> b  ')).toBe('a\nb');
  });
});
