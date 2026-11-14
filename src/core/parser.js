/**
 * Markdown-Tabellen-Parser. Reine Funktionen.
 * parseTable(text) -> { ok:true, cols, rows } | { ok:false, error }
 * Fehlercodes: 'no-table' | 'too-few-columns' | 'no-rows'
 */

const ESC_PIPE = '\u0001';

function hasPipe(line) {
  return line.replace(/\\\|/g, '').indexOf('|') !== -1;
}
function pipeCount(line) {
  return (line.replace(/\\\|/g, '').match(/\|/g) || []).length;
}

export function splitRow(line) {
  let t = line.trim().replace(/\\\|/g, ESC_PIPE);
  if (t.charAt(0) === '|') t = t.slice(1);
  if (t.charAt(t.length - 1) === '|') t = t.slice(0, -1);
  return t.split('|').map((c) => c.split(ESC_PIPE).join('|').trim());
}

export function cleanCell(s) {
  return String(s)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .trim();
}

function isSeparator(cells, lenient) {
  const re = lenient ? /^:?-+:?$/ : /^:?-{2,}:?$/;
  return cells.length > 0 && cells.every((c) => re.test(c));
}

/** Zusammenhängende Zeilen mit Pipe-Zeichen; Leerzeile oder Fließtext beendet den Block. */
function findBlocks(text) {
  const lines = text.split(/\r?\n/).filter((l) => !/^\s*(```|~~~)/.test(l));
  const blocks = [];
  let cur = null;
  for (const raw of lines) {
    const l = raw.trim();
    if (l !== '' && hasPipe(l)) {
      if (!cur) { cur = []; blocks.push(cur); }
      cur.push(l);
    } else {
      cur = null;
    }
  }
  return blocks;
}

function parseBlock(block) {
  const all = block.map(splitRow);
  const header = all[0];
  if (header.length < 3) return { ok: false, error: 'too-few-columns' };
  const body = all.slice(1).filter((cells, i) => !isSeparator(cells, i === 0));
  const cols = header.slice(1).map(cleanCell);
  const n = cols.length;
  const rows = body
    .map((r) => ({
      name: cleanCell(r[0] || ''),
      cells: Array.from({ length: n }, (_, j) => cleanCell(r[j + 1] || '')),
    }))
    .filter((r) => r.name);
  if (!rows.length) return { ok: false, error: 'no-rows' };
  return { ok: true, cols, rows };
}

const SUG_HEAD = /^gewicht\b/i;
const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9äöüß]+/g, ' ').trim();
function sameName(a, b) {
  a = norm(a); b = norm(b);
  return a !== '' && b !== '' && (a === b || a.includes(b) || b.includes(a));
}
function hits(names, products) {
  return names.filter((n) => products.some((p) => sameName(n, p))).length;
}
/** Kriterien als Zeilen, Produkte als Spalten (Chatbots liefern gern die Transponierte). */
function transpose(t) {
  return {
    ok: true,
    transposed: true,
    cols: t.rows.map((r) => r.name),
    rows: t.cols.map((name, j) => ({ name, cells: t.rows.map((r) => r.cells[j]) })).filter((r) => r.name),
  };
}

/**
 * Liest die passende Tabelle aus beliebigem Text.
 * Ohne `products` zählt die erste brauchbare Tabelle. Mit `products` gewinnt die Tabelle,
 * deren Spalten oder Zeilen am besten zu den Produktnamen passen; liegen die Produkte in den
 * Zeilen, wird transponiert. So stört eine vorangestellte Zusammenfassungstabelle nicht.
 */
/** Tabulatorgetrennte Zeilen (Kopie aus gerenderter Ansicht) in Pipe-Zeilen umschreiben. */
function tabsToPipes(text) {
  return text
    .split(/\r?\n/)
    .map((l) => (l.includes('\t') ? '| ' + l.split('\t').map((c) => c.trim()).join(' | ') + ' |' : l))
    .join('\n');
}
const qualifies = (b) => b.length >= 2 && (isSeparator(splitRow(b[1]), true) || pipeCount(b[0]) >= 2);

export function parseTable(text, { products = [] } = {}) {
  const src = String(text || '');
  let blocks = findBlocks(src).filter(qualifies);
  if (!blocks.length && src.includes('\t')) blocks = findBlocks(tabsToPipes(src)).filter(qualifies);
  if (!blocks.length) return { ok: false, error: 'no-table' };
  const results = blocks.map(parseBlock);
  const allValid = results.filter((r) => r.ok);
  if (!allValid.length) return results[0];
  // Die Bewertungsvorschlags-Tabelle (zweite Spalte „Gewicht“) ist nie die Hauptentabelle.
  const main = allValid.filter((t) => !SUG_HEAD.test(t.cols[0]));
  const valid = main.length ? main : allValid;
  if (!products.length) return valid[0];
  let best = null, bestScore = 0, bestTransposed = false;
  for (const t of valid) {
    const col = hits(t.cols, products), row = hits(t.rows.map((r) => r.name), products);
    const sc = Math.max(col, row);
    if (sc > bestScore) { best = t; bestScore = sc; bestTransposed = row > col && t.rows.length >= 2; }
  }
  if (!best) return valid[0];
  return bestTransposed ? transpose(best) : best;
}

/** Zelle des Bewertungsvorschlags: „4 – Begründung“ -> { value, why } oder null. */
export function parseSuggestCell(s) {
  const m = String(s).match(/^\s*([0-5])(?![\d.,])(?:\s*\/\s*5)?\s*(?:[-–—:]\s*)?([\s\S]*)$/);
  return m ? { value: Number(m[1]), why: m[2].trim() } : null;
}

function findName(rows, name) {
  const n = norm(name);
  return rows.find((r) => norm(r.name) === n) || rows.find((r) => sameName(r.name, name));
}

/**
 * Liest die optionale Vorschlagstabelle („Kriterium | Gewicht | Produkt …“) und ordnet sie
 * den Zeilen und Spalten der Haupttabelle zu. -> Array je Zeile oder null.
 * Zeile: { weight: {value,why}|null, scores: [{value,why}|null] } oder null.
 */
export function parseSuggestions(text, table) {
  const src = String(text || '');
  let blocks = findBlocks(src).filter(qualifies);
  if (!blocks.length && src.includes('\t')) blocks = findBlocks(tabsToPipes(src)).filter(qualifies);
  const sug = blocks.map(parseBlock).find((t) => t.ok && SUG_HEAD.test(t.cols[0]));
  if (!sug) return null;
  const colIdx = table.cols.map((c, j) => {
    let k = sug.cols.findIndex((x, i) => i > 0 && norm(x) === norm(c));
    if (k < 0) k = sug.cols.findIndex((x, i) => i > 0 && sameName(x, c));
    if (k < 0 && sug.cols.length - 1 === table.cols.length) k = j + 1;
    return k;
  });
  const out = table.rows.map((r) => {
    const row = findName(sug.rows, r.name);
    if (!row) return null;
    const w = parseSuggestCell(row.cells[0]);
    return {
      weight: w && w.value >= 1 ? w : null,
      scores: colIdx.map((k) => (k > 0 ? parseSuggestCell(row.cells[k]) : null)),
    };
  });
  return out.some(Boolean) ? out : null;
}
