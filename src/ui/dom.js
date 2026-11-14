/** DOM-Hilfen: Escaping, Download, Kopieren. Nur im Browser benutzt. */

export const $ = (id) => document.getElementById(id);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Download per Blob und Anker. Funktioniert auch über file://. */
export function download(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFile(file) {
  if (file.text) return file.text();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsText(file);
  });
}

export function flash(el, msg, kind) {
  el.className = 'status ' + (kind || '');
  el.textContent = msg;
  if (kind === 'ok') {
    setTimeout(() => {
      if (el.textContent === msg) { el.textContent = ''; el.className = 'status'; }
    }, 3000);
  }
}

/** Kopiert den Inhalt eines Textfelds. Fallback über Markieren + execCommand, wenn die Clipboard-API blockiert ist. */
export function copyFrom(textarea, statusEl, t) {
  const text = textarea.value;
  const fallback = () => {
    textarea.focus();
    textarea.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { /* geblockt */ }
    flash(statusEl, ok ? t.ok : t.blocked, ok ? 'ok' : 'warn');
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => flash(statusEl, t.ok, 'ok'), fallback);
  } else {
    fallback();
  }
}
