/**
 * Logique (pure, testée) de la migration des images Cloudinary → R2 :
 * nommage des fichiers et remplacement des URL dans les données.
 */
export type UrlMap = Record<string, string>;

/**
 * Clé R2 stable pour un fichier de sauvegarde "012_Mon Image.png" :
 * "migrated/012-mon-image.webp". Stable = relancer la migration ne crée pas de doublons.
 */
export function migratedKey(fileName: string, ext: string): string {
  const base = fileName
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return `migrated/${base || 'image'}.${ext}`;
}

/** Nouvelles valeurs d'un projet, ou null si rien ne change. */
export function remapProject(
  project: { coverImageUrl: string | null; stills: string[] },
  map: UrlMap,
): { coverImageUrl: string | null; stills: string[] } | null {
  const coverImageUrl = project.coverImageUrl ? (map[project.coverImageUrl] ?? project.coverImageUrl) : null;
  const stills = project.stills.map((s) => map[s] ?? s);
  const changed = coverImageUrl !== project.coverImageUrl || stills.some((s, i) => s !== project.stills[i]);
  return changed ? { coverImageUrl, stills } : null;
}

/** Champs des paramètres du site à modifier, ou null si rien ne change. */
export function remapSettings(settings: Record<string, unknown> | null, map: UrlMap): Record<string, string> | null {
  if (!settings) return null;
  const update: Record<string, string> = {};
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === 'string' && map[value]) update[key] = map[value];
  }
  return Object.keys(update).length > 0 ? update : null;
}
