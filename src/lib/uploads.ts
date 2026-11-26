import { randomUUID } from 'node:crypto';

/**
 * Règles d'upload (pures, testées). Le fichier ne transite jamais par l'API :
 * le navigateur l'envoie directement au bucket via une URL présignée
 * valable 5 minutes, limitée à UN fichier, UN type et UNE taille.
 */
export const UPLOAD_TYPES: Record<string, { ext: string; maxBytes: number }> = {
  'image/jpeg': { ext: 'jpg', maxBytes: 15 * 1024 * 1024 },
  'image/png': { ext: 'png', maxBytes: 15 * 1024 * 1024 },
  'image/webp': { ext: 'webp', maxBytes: 15 * 1024 * 1024 },
  'image/avif': { ext: 'avif', maxBytes: 15 * 1024 * 1024 },
  'image/gif': { ext: 'gif', maxBytes: 15 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', maxBytes: 300 * 1024 * 1024 },
  'video/webm': { ext: 'webm', maxBytes: 300 * 1024 * 1024 },
};

export type UploadCheck =
  | { ok: true; contentType: string; size: number; ext: string }
  | { ok: false; error: string };

export function checkUpload(body: unknown): UploadCheck {
  const b = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown>;
  const contentType = typeof b.contentType === 'string' ? b.contentType.toLowerCase() : '';
  const size = typeof b.size === 'number' ? b.size : Number.NaN;
  const rule = UPLOAD_TYPES[contentType];
  if (!rule) return { ok: false, error: 'Format non accepté (JPG, PNG, WebP, AVIF, GIF, MP4, WebM)' };
  if (!Number.isInteger(size) || size <= 0) return { ok: false, error: 'Taille de fichier invalide' };
  if (size > rule.maxBytes) {
    return { ok: false, error: `Fichier trop lourd (max ${Math.round(rule.maxBytes / 1024 / 1024)} Mo)` };
  }
  return { ok: true, contentType, size, ext: rule.ext };
}

/** Nom de fichier généré côté serveur : jamais celui du client (pas de traversée de chemin). */
export function buildUploadKey(ext: string, now: Date = new Date(), id: string = randomUUID()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `uploads/${yyyy}/${mm}/${id}.${ext}`;
}

export function publicUrlFor(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${key}`;
}
