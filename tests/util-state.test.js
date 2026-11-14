import { describe, it, expect } from 'vitest';
import { slugify, formatDate, activeCriteria } from '../src/core/util.js';
import {
  freshState, emptyState, normalizeState, rowsFromTable, blankRows, hasScores,
  serializeSession, parseSession, serializeCriteriaSet, parseCriteriaSet,
} from '../src/core/state.js';

describe('util', () => {
  it('slugify', () => {
    expect(slugify('Patch-Management für Windows-Clients')).toBe('patch-management-fuer-windows-clients');
    expect(slugify('  !!! ')).toBe('');
    expect(slugify('x'.repeat(80)).length).toBe(40);
  });
  it('formatDate', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('activeCriteria ignoriert abgewählte und namenlose', () => {
    const l = [{ name: 'A', on: true }, { name: 'B', on: false }, { name: '  ', on: true }];
    expect(activeCriteria(l)).toEqual([{ name: 'A', on: true }]);
  });
});

describe('state', () => {
  it('freshState hat 3 Beispielprodukte und 10 Kriterien, 5 davon vorausgewählt', () => {
    const s = freshState();
    expect(s.products).toEqual(['Intune', 'WSUS', 'baramundi']);
    expect(s.criteria).toHaveLength(10);
    expect(s.criteria.filter((c) => c.on)).toHaveLength(5);
  });

  it('emptyState leert Eingaben, behält Kriterien-Set und Export-Optionen', () => {
    const s = freshState();
    s.criteria[0].name = 'Anders';
    s.frontmatter = false;
    const e = emptyState(s);
    expect(e.products).toEqual([]);
    expect(e.zweck).toBe('');
    expect(e.criteria[0].name).toBe('Anders');
    expect(e.frontmatter).toBe(false);
  });

  it('normalizeState lehnt Müll ab und repariert Werte', () => {
    expect(normalizeState(null)).toBeNull();
    expect(normalizeState({ products: [] })).toBeNull();
    const s = normalizeState({
      products: ['A', 'a', ' B ', 5], criteria: [{ name: 'K', on: 1 }, 'x'], cols: ['A', 'B'],
      rows: [{ name: 'R', weight: 99, cells: ['x'], scores: [7, 3] }, { name: '', weight: 1 }],
    });
    expect(s.products).toEqual(['A', 'B']);
    expect(s.criteria).toHaveLength(1);
    expect(s.criteria[0].on).toBe(true);
    expect(s.rows).toEqual([{ name: 'R', weight: 5, cells: ['x', ''], scores: [null, 3] }]);
    expect(s.frontmatter).toBe(true);
  });

  it('rowsFromTable und blankRows setzen Gewicht 3 und keine Punkte', () => {
    const t = { cols: ['A', 'B'], rows: [{ name: 'K', cells: ['x', 'y'] }] };
    expect(rowsFromTable(t)).toEqual([{ name: 'K', weight: 3, cells: ['x', 'y'], scores: [null, null] }]);
    const b = blankRows(freshState());
    expect(b.cols).toEqual(['Intune', 'WSUS', 'baramundi']);
    expect(b.rows).toHaveLength(5);
    expect(b.rows[0]).toMatchObject({ weight: 3, cells: ['', '', ''], scores: [null, null, null] });
  });

  it('hasScores', () => {
    const s = freshState();
    expect(hasScores(s)).toBe(false);
    s.rows = [{ name: 'K', weight: 3, cells: [''], scores: [0] }];
    expect(hasScores(s)).toBe(true);
  });
});

describe('Sitzung und Kriterien-Vorlage', () => {
  it('Roundtrip der Sitzung', () => {
    const s = freshState();
    s.cols = ['A', 'B']; s.rows = [{ name: 'K', weight: 4, cells: ['x', 'y'], scores: [5, null] }];
    const res = parseSession(serializeSession(s, new Date('2026-01-01T00:00:00Z')));
    expect(res.ok).toBe(true);
    expect(res.state).toEqual(s);
  });
  it('Fehlerfälle der Sitzung', () => {
    expect(parseSession('kein json')).toEqual({ ok: false, error: 'json' });
    expect(parseSession('{"foo":1}')).toEqual({ ok: false, error: 'format' });
    expect(parseSession('{"app":"tradeoff-desk","state":{"products":1}}')).toEqual({ ok: false, error: 'state' });
  });
  it('Kriterien-Vorlage Roundtrip, auch aus einer Sitzungsdatei', () => {
    const s = freshState();
    const set = parseCriteriaSet(serializeCriteriaSet(s.criteria));
    expect(set.ok).toBe(true);
    expect(set.criteria).toEqual(s.criteria);
    const fromSession = parseCriteriaSet(serializeSession(s));
    expect(fromSession.ok).toBe(true);
    expect(fromSession.criteria).toHaveLength(10);
  });
  it('Kriterien-Vorlage Fehlerfälle', () => {
    expect(parseCriteriaSet('{')).toEqual({ ok: false, error: 'json' });
    expect(parseCriteriaSet('{"app":"x"}')).toEqual({ ok: false, error: 'format' });
    expect(parseCriteriaSet('{"app":"tradeoff-desk","criteria":[]}')).toEqual({ ok: false, error: 'format' });
  });
});
