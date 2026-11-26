import { isEmail, isSafeUrl } from './security';

/**
 * Validation par liste blanche : seuls les champs déclarés sont conservés.
 * Les clés inconnues (id, createdAt, champs inventés…) sont ignorées, ce qui
 * empêche à la fois l'assignation de masse et les erreurs Prisma « Unknown arg ».
 */

type StringField = {
  kind: 'string';
  required?: boolean;
  max: number;
  min?: number;
  format?: 'url' | 'url-or-path' | 'email' | 'percent';
  oneOf?: readonly string[];
};
type IntField = { kind: 'int'; min: number; max: number; default: number };
type UrlListField = { kind: 'urlList'; maxItems: number };
export type Field = StringField | IntField | UrlListField;
export type Schema = Record<string, Field>;

export type ValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; errors: Record<string, string> };

function validateString(f: StringField, raw: unknown): { value?: string | null; error?: string } {
  // L'admin envoie les champs numériques (opacité) en nombre : on les accepte.
  if (typeof raw === 'number' && f.format === 'percent') raw = String(raw);
  if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) {
    return f.required ? { error: 'Champ obligatoire' } : { value: null };
  }
  if (typeof raw !== 'string') return { error: 'Doit être un texte' };
  const v = raw.trim();
  if (v.length > f.max) return { error: `${f.max} caractères maximum` };
  if (f.min !== undefined && v.length < f.min) return { error: `${f.min} caractères minimum` };
  if (f.oneOf && !f.oneOf.includes(v)) return { error: 'Valeur non autorisée' };
  switch (f.format) {
    case 'url':
      if (!isSafeUrl(v)) return { error: 'URL invalide (http:// ou https:// requis)' };
      break;
    case 'url-or-path':
      if (!isSafeUrl(v, { allowRelative: true })) return { error: 'URL ou chemin (/page) invalide' };
      break;
    case 'email':
      if (!isEmail(v)) return { error: 'Email invalide' };
      break;
    case 'percent': {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0 || n > 100) return { error: 'Nombre entre 0 et 100' };
      break;
    }
  }
  return { value: v };
}

function validateInt(f: IntField, raw: unknown): { value?: number; error?: string } {
  if (raw === undefined || raw === null || raw === '') return { value: f.default };
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(n)) return { error: 'Nombre entier attendu' };
  if (n < f.min || n > f.max) return { error: `Entre ${f.min} et ${f.max}` };
  return { value: n };
}

function validateUrlList(f: UrlListField, raw: unknown): { value?: string[]; error?: string } {
  if (raw === undefined || raw === null || raw === '') return { value: [] };
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\n,]/) : null;
  if (!list) return { error: 'Liste attendue' };
  const cleaned = list.map((s) => (typeof s === 'string' ? s.trim() : '')).filter((s) => s !== '');
  if (cleaned.length > f.maxItems) return { error: `${f.maxItems} éléments maximum` };
  const bad = cleaned.find((u) => !isSafeUrl(u));
  if (bad) return { error: `URL invalide : ${bad.slice(0, 80)}` };
  return { value: cleaned };
}

export function validate(schema: Schema, input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return { ok: false, errors: { _: 'Objet JSON attendu' } };
  }
  const body = input as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const [key, field] of Object.entries(schema)) {
    const r =
      field.kind === 'string'
        ? validateString(field, body[key])
        : field.kind === 'int'
          ? validateInt(field, body[key])
          : validateUrlList(field, body[key]);
    if (r.error) errors[key] = r.error;
    else data[key] = r.value;
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, data };
}

// ---------------------------------------------------------------------------
// Schémas métier
// ---------------------------------------------------------------------------

export const PROJECT_CATEGORIES = ['clip', 'realisation', 'directeur-photo'] as const;
export const EQUIPMENT_CATEGORIES = ['Caméras', 'Optiques', 'Lumière / Machinerie'] as const;
export const CONTACT_TYPES = ['clip', 'court-metrage', 'publicite', 'photo', 'autre'] as const;

const order: IntField = { kind: 'int', min: 0, max: 100000, default: 0 };
const longText = (max = 20000): StringField => ({ kind: 'string', max });
const url: StringField = { kind: 'string', max: 2048, format: 'url' };

export const projectSchema: Schema = {
  title: { kind: 'string', required: true, max: 200 },
  category: { kind: 'string', required: true, max: 50, oneOf: PROJECT_CATEGORIES },
  role: { kind: 'string', required: true, max: 120 },
  year: { kind: 'string', required: true, max: 20 },
  synopsis: longText(5000),
  videoUrl: url,
  coverImageUrl: url,
  credits: longText(5000),
  stills: { kind: 'urlList', maxItems: 50 },
  order,
};

export const reviewSchema: Schema = {
  text: { kind: 'string', required: true, max: 3000 },
  author: { kind: 'string', required: true, max: 200 },
  order,
};

export const equipmentSchema: Schema = {
  category: { kind: 'string', required: true, max: 50, oneOf: EQUIPMENT_CATEGORIES },
  name: { kind: 'string', required: true, max: 200 },
  order,
};

export const settingsSchema: Schema = {
  home_video_url: url,
  home_video_opacity: { kind: 'string', max: 3, format: 'percent' },
  home_subtitle: { kind: 'string', max: 200 },
  profile_photo_url: url,
  history_text: longText(),
  expertise_text: longText(),
  clips_text: longText(),
  demo_reel_image_url: url,
  demo_reel_link: { kind: 'string', max: 2048, format: 'url-or-path' },
  youtube_url: url,
  linkedin_url: url,
  malt_url: url,
  instagram_url: url,
  vimeo_url: url,
  contact_email: { kind: 'string', max: 254, format: 'email' },
  devis_text: longText(),
  mentions_legales_text: longText(50000),
  rgpd_text: longText(50000),
};

export const contactSchema: Schema = {
  name: { kind: 'string', required: true, max: 120 },
  email: { kind: 'string', required: true, max: 254, format: 'email' },
  type: { kind: 'string', required: true, max: 30, oneOf: CONTACT_TYPES },
  message: { kind: 'string', required: true, min: 10, max: 5000 },
};

export const loginSchema: Schema = {
  password: { kind: 'string', required: true, max: 200 },
};
