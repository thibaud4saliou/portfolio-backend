/**
 * Petites fonctions de sécurité sans dépendance (testées unitairement).
 */

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * Vrai si la valeur est une URL http(s) absolue, ou (optionnellement) un chemin
 * relatif interne au site ("/realisation/abc"). Refuse javascript:, data:, //evil.com…
 */
export function isSafeUrl(value: string, options: { allowRelative?: boolean } = {}): boolean {
  const v = value.trim();
  if (v === '') return false;
  if (options.allowRelative && v.startsWith('/') && !v.startsWith('//') && !v.startsWith('/\\')) {
    return true;
  }
  try {
    const url = new URL(v);
    return SAFE_PROTOCOLS.has(url.protocol) && url.hostname !== '';
  } catch {
    return false;
  }
}

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:"]{2,}$/;

export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Supprime retours à la ligne et caractères de contrôle (anti injection d'en-têtes mail). */
export function stripControlChars(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}
