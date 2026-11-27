/**
 * Migration des images Cloudinary (sauvegardées par backup-cloudinary.mjs) vers R2.
 *
 *   npm run migrate-images              → SIMULATION : convertit, affiche le bilan, n'écrit rien
 *   npm run migrate-images -- --apply   → envoie sur R2 et met à jour les URL en base
 *
 * Options : --dir <dossier>  (par défaut ../backup-images, à côté de backend/)
 * Pré-requis : .env avec DATABASE_URL, ADMIN_PASSWORD_HASH et les variables S3_*.
 * Relançable sans risque : mêmes noms de fichiers, URL déjà migrées ignorées.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { PrismaClient, type Prisma } from '@prisma/client';
import sharp from 'sharp';
import { loadConfig } from '../src/config';
import { migratedKey, remapProject, remapSettings, type UrlMap } from '../src/lib/migration';
import { createS3Client } from '../src/lib/storage';
import { publicUrlFor } from '../src/lib/uploads';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const dirArg = args.indexOf('--dir');
const dir = resolve(dirArg !== -1 ? args[dirArg + 1] : join(__dirname, '..', '..', 'backup-images'));

const MAX_WIDTH = 2560; // largeur max : nette en plein écran, sans pixels inutiles
const fmt = (n: number) => `${(n / 1024 / 1024).toFixed(1)} Mo`;

async function main() {
  const config = loadConfig();
  if (!config.storage) throw new Error('Variables S3_* manquantes dans .env : impossible de joindre R2.');
  const storage = config.storage;
  const s3 = createS3Client(storage);
  const prisma = new PrismaClient();

  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as Record<string, string>;
  const entries = Object.entries(manifest);
  console.log(`${apply ? '🚀 MIGRATION' : '🔎 SIMULATION (rien ne sera écrit)'} — ${entries.length} images depuis ${dir}\n`);

  const map: UrlMap = {};
  let before = 0;
  let after = 0;

  for (const [i, [oldUrl, fileName]] of entries.entries()) {
    const input = await readFile(join(dir, fileName));
    const isGif = fileName.toLowerCase().endsWith('.gif');
    // GIF conservés tels quels (animations) ; le reste → WebP qualité 82.
    const output = isGif
      ? input
      : await sharp(input).rotate().resize({ width: MAX_WIDTH, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const key = migratedKey(fileName, isGif ? 'gif' : 'webp');
    before += input.length;
    after += output.length;

    if (apply) {
      await s3.send(
        new PutObjectCommand({
          Bucket: storage.bucket,
          Key: key,
          Body: output,
          ContentType: isGif ? 'image/gif' : 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    }
    map[oldUrl] = publicUrlFor(storage.publicUrl, key);
    console.log(`${String(i + 1).padStart(3)}/${entries.length}  ${fmt(input.length)} → ${fmt(output.length)}  ${key}`);
  }

  console.log(`\nPoids total : ${fmt(before)} → ${fmt(after)} (−${Math.round((1 - after / before) * 100)} %)`);

  // --- Mise à jour des URL en base ---------------------------------------
  const projects = await prisma.project.findMany({ select: { id: true, title: true, coverImageUrl: true, stills: true } });
  let projectUpdates = 0;
  for (const p of projects) {
    const data = remapProject(p, map);
    if (!data) continue;
    projectUpdates++;
    if (apply) await prisma.project.update({ where: { id: p.id }, data });
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  const settingsUpdate = remapSettings(settings as Record<string, unknown> | null, map);
  if (apply && settingsUpdate) await prisma.siteSettings.update({ where: { id: 1 }, data: settingsUpdate as Prisma.SiteSettingsUpdateInput });

  console.log(
    `Base : ${projectUpdates}/${projects.length} projets et ${settingsUpdate ? Object.keys(settingsUpdate).length : 0} champ(s) de configuration ${apply ? 'mis à jour ✅' : 'seraient mis à jour'}.`,
  );
  if (!apply) console.log('\nTout est bon ? Relancez avec :  npm run migrate-images -- --apply');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('❌', err.message);
  process.exit(1);
});
