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

export function parseTable(text) {
  const blocks = findBlocks(String(text || ''));
  // Erste Tabelle mit Trennzeile an zweiter Stelle, sonst erster Block mit >= 2 Zeilen.
  let block = blocks.find((b) => b.length >= 2 && isSeparator(splitRow(b[1]), true));
  if (!block) block = blocks.find((b) => b.length >= 2 && pipeCount(b[0]) >= 2);
  if (!block) return { ok: false, error: 'no-table' };

  const all = block.map(splitRow);
  const header = all[0];
  if (header.length < 3) return { ok: false, error: 'too-few-columns' };

  const body = all.slice(1).filter((cells, i) => !(isSeparator(cells, i === 0) ));
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
