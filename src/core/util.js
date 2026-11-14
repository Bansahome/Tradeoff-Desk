/** Kleine, reine Hilfsfunktionen ohne DOM-Bezug. */

/** Aktive Kriterien: angekreuzt und mit Namen. */
export function activeCriteria(criteria) {
  return criteria.filter((c) => c.on && String(c.name).trim() !== '');
}

/** Datum als YYYY-MM-DD in lokaler Zeit. */
export function formatDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/** Dateinamen-tauglicher Text (Umlaute umgesetzt, max. 40 Zeichen). */
export function slugify(s) {
  const map = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'ae', Ö: 'oe', Ü: 'ue', ß: 'ss' };
  return String(s)
    .replace(/[äöüÄÖÜß]/g, (c) => map[c])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '');
}
