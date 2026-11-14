/**
 * Zustand, Normalisierung und Sitzungsformat. Reine Funktionen (kein DOM, kein Storage).
 */
import defaultCriteria from '../config/criteria.json';
import { activeCriteria } from './util.js';

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
  }
  return s;
}

let idCounter = 0;
export function newId() {
  idCounter += 1;
  return 'c' + Date.now().toString(36) + idCounter.toString(36);
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const str = (v) => (typeof v === 'string' ? v : '');

function normalizeCriteria(list) {
  return list.filter(isObj).map((c) => ({ id: str(c.id) || newId(), name: str(c.name), hint: str(c.hint), on: !!c.on }));
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
  };
}

/** Tabelle aus dem Parser -> Bewertungszeilen (Gewicht 3, noch keine Punkte). */
export function rowsFromTable(table) {
  return table.rows.map((r) => ({
    name: r.name,
    weight: DEFAULT_WEIGHT,
    cells: r.cells.slice(),
    scores: table.cols.map(() => null),
  }));
}

/** „Ohne Antwort bewerten“: leere Beschreibungen für die gewählten Kriterien. */
export function blankRows(state) {
  const cols = state.products.slice();
  const rows = activeCriteria(state.criteria).map((c) => ({
    name: c.name.trim(),
    weight: DEFAULT_WEIGHT,
    cells: cols.map(() => ''),
    scores: cols.map(() => null),
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
