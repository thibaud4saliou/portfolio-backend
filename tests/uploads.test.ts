import { describe, expect, it } from 'vitest';
import { buildUploadKey, checkUpload, publicUrlFor } from '../src/lib/uploads';

describe('checkUpload', () => {
  it('accepte images et vidéos dans les limites', () => {
    expect(checkUpload({ contentType: 'image/jpeg', size: 1000 })).toEqual({ ok: true, contentType: 'image/jpeg', size: 1000, ext: 'jpg' });
    expect(checkUpload({ contentType: 'VIDEO/MP4', size: 100 * 1024 * 1024 }).ok).toBe(true);
  });

  it('refuse les types dangereux ou inconnus', () => {
    for (const t of ['text/html', 'image/svg+xml', 'application/javascript', '', undefined]) {
      expect(checkUpload({ contentType: t, size: 10 }).ok).toBe(false);
    }
    expect(checkUpload(null).ok).toBe(false);
  });

  it('refuse les tailles invalides ou trop grandes', () => {
    expect(checkUpload({ contentType: 'image/png', size: 0 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'image/png', size: 1.5 }).ok).toBe(false);
    expect(checkUpload({ contentType: 'image/png', size: '10' }).ok).toBe(false);
    const big = checkUpload({ contentType: 'image/png', size: 16 * 1024 * 1024 });
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error).toMatch(/15 Mo/);
  });
});

describe('buildUploadKey / publicUrlFor', () => {
  it('génère une clé datée et unique, sans le nom du client', () => {
    expect(buildUploadKey('jpg', new Date('2026-03-05T10:00:00Z'), 'abc')).toBe('uploads/2026/03/abc.jpg');
    expect(buildUploadKey('png')).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
  });
  it('construit l’URL publique', () => {
    expect(publicUrlFor('https://cdn.fr//', 'uploads/a.jpg')).toBe('https://cdn.fr/uploads/a.jpg');
  });
});
