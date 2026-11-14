/**
 * Zustand, Normalisierung und Sitzungsformat. Reine Funktionen (kein DOM, kein Storage).
 */
import defaultCriteria from '../config/criteria.json';
import { activeCriteria } from './util.js';
import { splitCheck } from './parser.js';

export const APP_ID = 'tradeoff-desk';
export const SESSION_VERSION = 1;
export const DEFAULT_WEIGHT = 3;

export function cloneCriteria(list = defaultCriteria) {
  return list.map((c) => ({ id: c.id, name: c.name, hint: c.hint || '', on: !!c.on }));
}

/** Startzustand mit neutralen Beispieldaten. */
export function freshState() {
  return {
    products: ['Intune', 'WSUS', 'baramundi'],
    zweck: 'Patch-Management für Windows-Clients',
    kontext: '',
    hinweise: '',
    criteria: cloneCriteria(),
    pasted: '',
    cols: [],
    rows: [],
    frontmatter: true,
    details: true,
    suggest: false,
    sugExport: true,
    sensExport: true,
    note: { decision: '', assumptions: '', risks: '' },
  };
}

/** „Alles leeren“: Eingaben und Bewertung weg, Kriterien-Set und Export-Optionen bleiben. */
export function emptyState(prev) {
  const s = freshState();
  s.products = [];
  s.zweck = '';
  if (prev) {
    s.criteria = cloneCriteria(prev.criteria);
    s.frontmatter = prev.frontmatter;
    s.details = prev.details;
    s.sugExport = prev.sugExport;
    s.sensExport = prev.sensExport;
  }
  return s;
}

let idCounter = 0;
export function newId() {
  idCounter += 1;
  return 'c' + Date.now().toString(36) + idCounter.toString(36);
}

export const CHECKS = ['ok', 'fix', 'old', 'unproven'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

function normalizeCriteria(list) {
  return list.filter(isObj).map((c) => ({ id: str(c.id) || newId(), name: str(c.name), hint: str(c.hint), on: !!c.on }));
}

function normSugItem(v, min) {
  return isObj(v) && Number.isInteger(v.value) && v.value >= min && v.value <= 5 ? { value: v.value, why: str(v.why) } : null;
}
function normSug(raw, n) {
  if (!isObj(raw)) return null;
  const weight = normSugItem(raw.weight, 1);
  const scores = Array.from({ length: n }, (_, j) => normSugItem(Array.isArray(raw.scores) ? raw.scores[j] : null, 0));
  return weight || scores.some(Boolean) ? { weight, scores } : null;
}

/** Macht aus beliebigem (z. B. geladenem) JSON einen gültigen Zustand oder null. */
export function normalizeState(raw) {
  if (!isObj(raw)) return null;
  if (!Array.isArray(raw.products) || !Array.isArray(raw.criteria) || !Array.isArray(raw.rows) || !Array.isArray(raw.cols)) return null;
  const seen = new Set();
  const products = raw.products
    .map((p) => str(p).trim())
    .filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
  const cols = raw.cols.map(str);
  const rows = raw.rows
    .filter(isObj)
    .map((r) => {
      const w = Math.round(Number(r.weight));
      return {
        name: str(r.name),
        weight: Number.isFinite(w) ? Math.min(5, Math.max(1, w)) : DEFAULT_WEIGHT,
        cells: cols.map((_, j) => str(Array.isArray(r.cells) ? r.cells[j] : '')),
        scores: cols.map((_, j) => {
          const s = Array.isArray(r.scores) ? r.scores[j] : null;
          return Number.isInteger(s) && s >= 0 && s <= 5 ? s : null;
        }),
        sug: normSug(r.sug, cols.length),
        weightSet: !!r.weightSet,
        ko: !!r.ko,
        koMin: Math.min(5, Math.max(1, Math.round(Number(r.koMin)) || 1)),
        checks: cols.map((_, j) => (Array.isArray(r.checks) && CHECKS.includes(r.checks[j]) ? r.checks[j] : null)),
      };
    })
    .filter((r) => r.name);
  return {
    products,
    zweck: str(raw.zweck),
    kontext: str(raw.kontext),
    hinweise: str(raw.hinweise),
    criteria: normalizeCriteria(raw.criteria),
    pasted: str(raw.pasted),
    cols,
    rows,
    frontmatter: raw.frontmatter === undefined ? true : !!raw.frontmatter,
    details: raw.details === undefined ? true : !!raw.details,
    suggest: !!raw.suggest,
    sugExport: raw.sugExport === undefined ? true : !!raw.sugExport,
    sensExport: raw.sensExport === undefined ? true : !!raw.sensExport,
    note: {
      decision: str(isObj(raw.note) ? raw.note.decision : ''),
      assumptions: str(isObj(raw.note) ? raw.note.assumptions : ''),
      risks: str(isObj(raw.note) ? raw.note.risks : ''),
    },
  };
}

/** Tabelle aus dem Parser -> Bewertungszeilen (Gewicht 3, noch keine Punkte). */
export function rowsFromTable(table, sugs = null) {
  return table.rows.map((r, i) => {
    const parts = r.cells.map(splitCheck);
    return {
      name: r.name,
      weight: DEFAULT_WEIGHT,
      cells: parts.map((x) => x.text),
      scores: table.cols.map(() => null),
      sug: normSug(sugs && sugs[i], table.cols.length),
      weightSet: false,
      ko: false,
      koMin: 1,
      checks: parts.map((x) => x.check),
    };
  });
}

const key = (s) => String(s).trim().toLowerCase();

/**
 * Übernimmt Bewertung (Gewicht, Punkte, K.-o., Vorschläge) aus dem bisherigen Zustand in neu eingelesene Zeilen,
 * wenn Kriterium und Produkt gleich heißen. -> true, wenn dabei nichts verloren geht.
 */
export function carryOver(prev, newCols, newRows) {
  let lost = false;
  const oldIdx = (name) => prev.cols.findIndex((c) => key(c) === key(name));
  prev.rows.forEach((old) => {
    if (!newRows.some((r) => key(r.name) === key(old.name))) {
      if (old.scores.some((x) => x !== null)) lost = true;
    }
  });
  prev.cols.forEach((c, j) => {
    if (!newCols.some((n) => key(n) === key(c)) && prev.rows.some((r) => r.scores[j] !== null)) lost = true;
  });
  newRows.forEach((r) => {
    const old = prev.rows.find((o) => key(o.name) === key(r.name));
    if (!old) return;
    r.weight = old.weight; r.weightSet = old.weightSet; r.ko = old.ko; r.koMin = old.koMin;
    newCols.forEach((c, j) => {
      const k = oldIdx(c);
      if (k >= 0) r.scores[j] = old.scores[k];
    });
    if (!r.sug && old.sug) {
      r.sug = normSug({
        weight: old.sug.weight,
        scores: newCols.map((c) => { const k = oldIdx(c); return k >= 0 ? old.sug.scores[k] : null; }),
      }, newCols.length);
    }
  });
  return !lost;
}

/** „Ohne Antwort bewerten“: leere Beschreibungen für die gewählten Kriterien. */
export function blankRows(state) {
  const cols = state.products.slice();
  const rows = activeCriteria(state.criteria).map((c) => ({
    name: c.name.trim(),
    weight: DEFAULT_WEIGHT,
    cells: cols.map(() => ''),
    scores: cols.map(() => null),
    sug: null,
    weightSet: false,
    ko: false,
    koMin: 1,
    checks: cols.map(() => null),
  }));
  return { cols, rows };
}

export function hasScores(state) {
  return state.rows.some((r) => r.scores.some((s) => s !== null));
}

/* ---------- Sitzungsdatei ---------- */

export function serializeSession(state, now = new Date()) {
  return JSON.stringify({ app: APP_ID, type: 'session', version: SESSION_VERSION, savedAt: now.toISOString(), state }, null, 2);
}

/** -> { ok:true, state } | { ok:false, error:'json'|'format'|'state' } */
export function parseSession(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'json' }; }
  if (!isObj(data) || data.app !== APP_ID || !isObj(data.state)) return { ok: false, error: 'format' };
  const state = normalizeState(data.state);
  if (!state) return { ok: false, error: 'state' };
  return { ok: true, state };
}

/* ---------- Kriterien-Vorlage ---------- */

export function serializeCriteriaSet(criteria) {
  return JSON.stringify({ app: APP_ID, type: 'criteria', version: SESSION_VERSION, criteria: normalizeCriteria(criteria) }, null, 2);
}

/** Akzeptiert eine Kriterien-Vorlage oder eine komplette Sitzungsdatei. */
export function parseCriteriaSet(text) {
  let data;
  try { data = JSON.parse(text); } catch (e) { return { ok: false, error: 'json' }; }
  if (!isObj(data) || data.app !== APP_ID) return { ok: false, error: 'format' };
  const list = Array.isArray(data.criteria) ? data.criteria : isObj(data.state) && Array.isArray(data.state.criteria) ? data.state.criteria : null;
  if (!list) return { ok: false, error: 'format' };
  const criteria = normalizeCriteria(list);
  if (!criteria.length) return { ok: false, error: 'format' };
  return { ok: true, criteria };
}

export function countSuggestions(state) {
  return state.rows.reduce((n, r) => n + (r.sug ? r.sug.scores.filter(Boolean).length + (r.sug.weight ? 1 : 0) : 0), 0);
}

/** Übernimmt Vorschläge für noch unbewertete Punkte und für Gewichte, die du nicht selbst gesetzt hast. */
export function applyOpenSuggestions(state) {
  let n = 0;
  state.rows.forEach((r) => {
    if (!r.sug) return;
    if (r.sug.weight && !r.weightSet) { r.weight = r.sug.weight.value; r.weightSet = true; n++; }
    r.sug.scores.forEach((sg, j) => {
      if (sg && (r.scores[j] === null || r.scores[j] === undefined)) { r.scores[j] = sg.value; n++; }
    });
  });
  return n;
}

/** Anzahl je Ergebnis der Gegenprüfung. */
export function checkCounts(state) {
  const c = { ok: 0, fix: 0, old: 0, unproven: 0 };
  state.rows.forEach((r) => (r.checks || []).forEach((x) => { if (x) c[x]++; }));
  return c;
}
