import { describe, it, expect } from 'vitest';
import { sensitivity, sensitivityLines } from '../src/core/sensitivity.js';
import { de } from '../src/strings.js';

const row = (name, weight, scores, extra = {}) => ({ name, weight, scores, ...extra });

describe('sensitivity', () => {
  it('liefert ok:false bei zu wenig Daten', () => {
    expect(sensitivity([], ['A', 'B'])).toEqual({ ok: false });
    expect(sensitivity([row('K', 3, [3])], ['A'])).toEqual({ ok: false });
    // nur ein Produkt im Rennen
    expect(sensitivity([row('K', 3, [0, 3], { ko: true })], ['A', 'B'])).toEqual({ ok: false });
  });

  it('erkennt Gleichstand', () => {
    const s = sensitivity([row('K', 3, [3, 3, 1])], ['A', 'B', 'C']);
    expect(s).toMatchObject({ ok: true, verdict: 'tie', tied: ['A', 'B'], gap: 0 });
  });

  it('dominant: Platz 1 ist in keinem Kriterium schlechter, egal wie gewichtet', () => {
    const s = sensitivity([row('K1', 3, [5, 3]), row('K2', 2, [4, 4])], ['A', 'B']);
    expect(s.verdict).toBe('dominant');
    expect(s.winner).toBe('A');
    expect(s.weightFlips).toEqual([]);
  });

  it('stabil: großer Abstand, aber nicht dominant', () => {
    const rows = [row('K1', 5, [5, 0]), row('K2', 1, [0, 3]), row('K3', 3, [5, 1])];
    const s = sensitivity(rows, ['A', 'B']);
    expect(s.verdict).toBe('stable');
    expect(s.gap).toBe(25 + 0 + 15 - (0 + 3 + 3));
    expect(s.scoreFlips).toEqual([]);
  });

  it('knapp: eine Gewichtsänderung um einen Punkt kippt Platz 1', () => {
    const rows = [row('K1', 3, [5, 2]), row('K2', 3, [1, 5])];
    // A: 15+3=18, B: 6+15=21 -> B führt, bei K2 Gewicht 2: A 17, B 16 -> A
    const s = sensitivity(rows, ['A', 'B']);
    expect(s.winner).toBe('B');
    expect(s.verdict).toBe('fragile');
    const f = s.weightFlips.find((x) => x.rowName === 'K2' && x.to === 2);
    expect(f).toMatchObject({ from: 3, delta: 1, newLeader: 'A' });
  });

  it('knapp: ein Punkt bei einer einzelnen Bewertung kippt Platz 1', () => {
    const rows = [row('K1', 4, [4, 3]), row('K2', 1, [0, 5])];
    // A 16, B 12+5=17 -> B; B bei K1 um einen Punkt weniger: 8+5=13... A führt
    const s = sensitivity(rows, ['A', 'B']);
    expect(s.winner).toBe('B');
    expect(s.scoreFlips.length).toBeGreaterThan(0);
    expect(s.scoreFlips[0]).toMatchObject({ rowName: 'K1' });
    expect(s.verdict).toBe('fragile');
  });

  it('Gleichstand durch eine Änderung wird als Flip ohne neuen Spitzenreiter gemeldet', () => {
    const rows = [row('K1', 3, [4, 3])];
    const s = sensitivity(rows, ['A', 'B']);
    const tie = s.scoreFlips.find((f) => f.delta === -1 && f.product === 'A');
    expect(tie).toMatchObject({ newLeader: null });
  });

  it('ausgeschiedene Produkte zählen nicht für Platz 1 und den Abstand', () => {
    const rows = [row('K', 5, [5, 5, 2], { ko: true, koMin: 1 }), row('F', 5, [0, 5, 3])];
    rows[0].scores = [0, 5, 2]; // A scheidet aus
    const s = sensitivity(rows, ['A', 'B', 'C']);
    expect(s.winner).toBe('B');
    expect(s.runnerUp).toBe('C');
  });

  it('meldet unbewertete und offene K.-o.-Felder', () => {
    const rows = [row('K1', 3, [5, null], { ko: true })];
    const s = sensitivity(rows, ['A', 'B']);
    expect(s).toMatchObject({ missing: 1, koOpen: 1 });
  });
});

describe('sensitivityLines', () => {
  it('formuliert Überschrift und Details, Texte kommen aus den Strings', () => {
    const rows = [row('K1', 3, [5, 2]), row('K2', 3, [1, 5])];
    const ln = sensitivityLines(sensitivity(rows, ['A', 'B']), de.sens);
    expect(ln.headline).toMatch(/^Knapp: Platz 1 \(B\)/);
    expect(ln.details.some((d) => d.startsWith('Gewicht „K2“ von 3 auf 2: A liegt vorn.'))).toBe(true);
    expect(sensitivityLines({ ok: false }, de.sens).headline).toBe(de.sens.noData);
  });
  it('begrenzt die Details', () => {
    const rows = Array.from({ length: 6 }, (_, i) => row('K' + i, 3, [3, 3 + (i % 2 ? 1 : 0)]));
    const ln = sensitivityLines(sensitivity(rows, ['A', 'B']), de.sens);
    expect(ln.details.length).toBeLessThanOrEqual(5 + 2);
  });
});
