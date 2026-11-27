import { describe, expect, it } from 'vitest';
import { migratedKey, remapProject, remapSettings } from '../src/lib/migration';

const map = { 'https://old/a.png': 'https://new/a.webp', 'https://old/b.png': 'https://new/b.webp' };

describe('migratedKey', () => {
  it('produit une clé propre et stable', () => {
    expect(migratedKey('012_Still 2026-08-18 Écho.png', 'webp')).toBe('migrated/012-still-2026-08-18-echo.webp');
    expect(migratedKey('001_WhatsApp_Image_2026-09-15_at_10.21.30.png', 'webp')).toBe(
      'migrated/001-whatsapp-image-2026-09-15-at-10-21-30.webp',
    );
    expect(migratedKey('___.gif', 'gif')).toBe('migrated/image.gif');
    expect(migratedKey(`${'a'.repeat(200)}.png`, 'webp')).toBe(`migrated/${'a'.repeat(80)}.webp`);
  });
});

describe('remapProject', () => {
  it('remplace la miniature et les stills connus', () => {
    expect(
      remapProject({ coverImageUrl: 'https://old/a.png', stills: ['https://old/b.png', 'https://autre/c.jpg'] }, map),
    ).toEqual({ coverImageUrl: 'https://new/a.webp', stills: ['https://new/b.webp', 'https://autre/c.jpg'] });
  });

  it('renvoie null si rien à changer', () => {
    expect(remapProject({ coverImageUrl: 'https://autre/x.jpg', stills: [] }, map)).toBeNull();
    expect(remapProject({ coverImageUrl: null, stills: ['https://autre/y.jpg'] }, map)).toBeNull();
  });

  it('détecte un changement uniquement dans les stills', () => {
    expect(remapProject({ coverImageUrl: null, stills: ['https://old/a.png'] }, map)).toEqual({
      coverImageUrl: null,
      stills: ['https://new/a.webp'],
    });
  });
});

describe('remapSettings', () => {
  it('ne touche que les champs dont l’URL est migrée', () => {
    expect(
      remapSettings({ id: 1, profile_photo_url: 'https://old/a.png', home_subtitle: 'Rennes', demo_reel_image_url: null }, map),
    ).toEqual({ profile_photo_url: 'https://new/a.webp' });
    expect(remapSettings({ home_subtitle: 'Rennes' }, map)).toBeNull();
    expect(remapSettings(null, map)).toBeNull();
  });
});
