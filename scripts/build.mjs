// Build: erzeugt dist/tradeoff-desk.html (eine Datei, alles inline) und
// dist/pages/ (dieselbe App als installierbare PWA für GitHub Pages).
import { build, transform } from 'esbuild';
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = (...a) => path.join(root, ...a);
const pkg = JSON.parse(await readFile(p('package.json'), 'utf8'));
const { de: strings } = await import(pathToFileURL(p('src/strings.js')).href);

const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '&#10;');

// JS bündeln (IIFE, minifiziert)
const js = await build({
  entryPoints: [p('src/ui/main.js')], bundle: true, minify: true, format: 'iife',
  target: ['es2020'], write: false, legalComments: 'none', charset: 'utf8',
});
const script = js.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

// CSS minifizieren
const css = (await transform(await readFile(p('src/styles.css'), 'utf8'), { loader: 'css', minify: true })).code.trim();

// Icon (als Data-URI in der Einzeldatei, als Datei für die PWA)
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1c5fa5"/><rect x="12" y="34" width="10" height="18" rx="2" fill="#fff"/><rect x="27" y="20" width="10" height="32" rx="2" fill="#fff"/><rect x="42" y="12" width="10" height="40" rx="2" fill="#9cc7f2"/></svg>`;
const iconUri = 'data:image/svg+xml,' + encodeURIComponent(icon);

// Texte einsetzen: {{pfad.im.strings.objekt}}
let tpl = await readFile(p('src/index.html'), 'utf8');
tpl = tpl.replace(/\{\{([a-z][\w.]*)\}\}/g, (_, key) => {
  const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), strings);
  if (typeof v !== 'string') throw new Error('Unbekannter Text-Schlüssel in index.html: ' + key);
  return escHtml(v);
});

function assemble({ headExtra = '', bodyEnd = '' }) {
  const specials = { ICON_DATA_URI: iconUri, HEAD_EXTRA: headExtra, STYLE: css, SCRIPT: script, BODY_END: bodyEnd };
  return tpl.replace(/\{\{([A-Z_]+)\}\}/g, (_, k) => {
    if (!(k in specials)) throw new Error('Unbekannter Platzhalter: ' + k);
    return specials[k];
  });
}

// Sicherheitsnetz: keine externen Ressourcen in der Einzeldatei
function assertSelfContained(html) {
  const bad = [
    /<(?:link|script|img|iframe|source|video|audio)\b[^>]*\s(?:href|src)=["']?(?:https?:)?\/\//i,
    /@import/i,
    /url\(\s*["']?(?:https?:)?\/\//i,
    /<link\b[^>]*rel=["']?(?:stylesheet|preconnect|manifest|prefetch)/i,
  ];
  for (const re of bad) if (re.test(html)) throw new Error('Einzeldatei enthält eine externe Ressource: ' + re);
}

await rm(p('dist'), { recursive: true, force: true });
await mkdir(p('dist/pages'), { recursive: true });

// 1) Einzeldatei
const single = assemble({});
assertSelfContained(single);
await writeFile(p('dist/tradeoff-desk.html'), single);

// 2) PWA-Variante (nur GitHub Pages, die Einzeldatei hängt nicht davon ab)
const pages = assemble({
  headExtra: '<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="#1c5fa5">',
  bodyEnd: `<script>if('serviceWorker' in navigator&&/^https?:$/.test(location.protocol)){navigator.serviceWorker.register('sw.js').catch(function(){});}</script>`,
});
const hash = createHash('sha256').update(pages).digest('hex').slice(0, 10);
await writeFile(p('dist/pages/index.html'), pages);
await writeFile(p('dist/pages/icon.svg'), icon);
await writeFile(p('dist/pages/manifest.webmanifest'), JSON.stringify({
  name: strings.app.name, short_name: strings.app.name, lang: strings.lang,
  start_url: './', scope: './', display: 'standalone',
  background_color: '#f2f5f9', theme_color: '#1c5fa5',
  icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
}, null, 2));
await writeFile(p('dist/pages/sw.js'), `// Cache-first, Version ${hash}
const CACHE = 'tradeoff-desk-${hash}';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
`);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log(`dist/tradeoff-desk.html  ${kb(single)}  (v${pkg.version})`);
console.log(`dist/pages/              PWA-Variante für GitHub Pages`);
