import { describe, expect, it } from 'vitest';
import {
  contactSchema,
  equipmentSchema,
  projectSchema,
  settingsSchema,
  validate,
} from '../src/lib/validation';

const validProject = {
  title: 'Mon clip',
  category: 'clip',
  role: 'Réalisateur',
  year: '2025',
  videoUrl: 'https://youtu.be/abc',
};

describe('validate', () => {
  it('refuse ce qui n’est pas un objet', () => {
    expect(validate(projectSchema, null).ok).toBe(false);
    expect(validate(projectSchema, [1]).ok).toBe(false);
    expect(validate(projectSchema, 'x').ok).toBe(false);
  });

  it('ne garde que les champs déclarés (anti assignation de masse)', () => {
    const r = validate(projectSchema, { ...validProject, id: 'pirate', createdAt: 'x', isAdmin: true });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.id).toBeUndefined();
      expect(r.data.isAdmin).toBeUndefined();
      expect(r.data.title).toBe('Mon clip');
      expect(r.data.synopsis).toBeNull();
      expect(r.data.order).toBe(0);
      expect(r.data.stills).toEqual([]);
    }
  });

  it('signale les champs obligatoires manquants', () => {
    const r = validate(projectSchema, {});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(['category', 'role', 'title', 'year']);
  });

  it('refuse une catégorie inconnue, un type incorrect, un texte trop long', () => {
    const r = validate(projectSchema, { ...validProject, category: 'photo', role: 42, title: 'x'.repeat(201) });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.category).toBeTruthy();
      expect(r.errors.role).toBeTruthy();
      expect(r.errors.title).toBeTruthy();
    }
  });

  it('refuse les URL javascript: (XSS)', () => {
    const r = validate(projectSchema, { ...validProject, coverImageUrl: 'javascript:alert(1)' });
    expect(r.ok).toBe(false);
  });

  it('accepte les stills en liste ou en texte séparé par virgules/retours ligne', () => {
    const r1 = validate(projectSchema, { ...validProject, stills: 'https://a.com/1.jpg, https://a.com/2.jpg\nhttps://a.com/3.jpg' });
    expect(r1.ok && r1.data.stills).toEqual(['https://a.com/1.jpg', 'https://a.com/2.jpg', 'https://a.com/3.jpg']);
    const r2 = validate(projectSchema, { ...validProject, stills: ['https://a.com/1.jpg', ''] });
    expect(r2.ok && r2.data.stills).toEqual(['https://a.com/1.jpg']);
  });

  it('refuse des stills invalides', () => {
    expect(validate(projectSchema, { ...validProject, stills: ['javascript:x'] }).ok).toBe(false);
    expect(validate(projectSchema, { ...validProject, stills: 12 }).ok).toBe(false);
    const many = Array.from({ length: 51 }, (_, i) => `https://a.com/${i}.jpg`);
    expect(validate(projectSchema, { ...validProject, stills: many }).ok).toBe(false);
  });

  it("valide l'ordre (entier borné)", () => {
    expect(validate(projectSchema, { ...validProject, order: '3' }).ok).toBe(true);
    expect(validate(projectSchema, { ...validProject, order: 1.5 }).ok).toBe(false);
    expect(validate(projectSchema, { ...validProject, order: -1 }).ok).toBe(false);
  });

  it('valide les catégories de matériel', () => {
    expect(validate(equipmentSchema, { category: 'Optiques', name: '50mm' }).ok).toBe(true);
    expect(validate(equipmentSchema, { category: 'Drones', name: 'x' }).ok).toBe(false);
  });
});

describe('settingsSchema', () => {
  it('accepte une configuration complète et ignore les anciens champs', () => {
    const r = validate(settingsSchema, {
      id: 1,
      home_video_url: 'https://cdn.example.com/v.mp4',
      home_video_opacity: '60',
      home_subtitle: 'Basé à Rennes',
      demo_reel_link: '/realisation/abc',
      contact_email: 'thibaud.saliou@gmail.com',
      prix_image_url: 'https://legacy',
      video_opacity: '50',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.prix_image_url).toBeUndefined();
      expect(r.data.id).toBeUndefined();
      expect(r.data.instagram_url).toBeNull();
    }
  });

  it("refuse une opacité hors bornes, un email ou un lien invalide", () => {
    const r = validate(settingsSchema, {
      home_video_opacity: '150',
      contact_email: 'pas-un-email',
      demo_reel_link: '//evil.com',
      instagram_url: 'javascript:alert(document.cookie)',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(Object.keys(r.errors).sort()).toEqual([
        'contact_email',
        'demo_reel_link',
        'home_video_opacity',
        'instagram_url',
      ]);
    }
  });

  it("accepte l'opacité envoyée en nombre par l'admin", () => {
    const r = validate(settingsSchema, { home_video_opacity: 10 });
    expect(r.ok && r.data.home_video_opacity).toBe('10');
    expect(validate(settingsSchema, { home_video_opacity: 0 }).ok).toBe(true);
    expect(validate(settingsSchema, { home_video_opacity: 150 }).ok).toBe(false);
    expect(validate(settingsSchema, { home_video_opacity: 12.5 }).ok).toBe(false);
  });

  it('refuse une opacité non numérique', () => {
    expect(validate(settingsSchema, { home_video_opacity: 'abc' }).ok).toBe(false);
  });
});

describe('contactSchema', () => {
  const ok = { name: 'Jean', email: 'jean@exemple.fr', type: 'clip', message: 'Bonjour, un projet de clip.' };
  it('accepte une demande valide', () => {
    expect(validate(contactSchema, ok).ok).toBe(true);
  });
  it('refuse un message trop court ou un type inconnu', () => {
    expect(validate(contactSchema, { ...ok, message: 'court' }).ok).toBe(false);
    expect(validate(contactSchema, { ...ok, type: 'hack' }).ok).toBe(false);
  });
});
