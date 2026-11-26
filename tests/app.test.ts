import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, SESSION_COOKIE, type Db, type Delegate } from '../src/app';
import type { AppConfig } from '../src/config';
import { hashPassword } from '../src/lib/auth';
import type { Mailer } from '../src/lib/email';

const PASSWORD = 'mot-de-passe-de-test';
const HASH = hashPassword(PASSWORD);

/* eslint-disable @typescript-eslint/no-explicit-any */
function memoryDelegate(): Delegate & { rows: any[]; deleteMany(args: any): Promise<{ count: number }> } {
  const rows: any[] = [];
  let seq = 0;
  const notFound = () => Object.assign(new Error('not found'), { code: 'P2025' });
  return {
    rows,
    async findMany() {
      return [...rows].sort((a, b) => a.order - b.order);
    },
    async findUnique({ where }) {
      return rows.find((r) => r.id === where.id) ?? null;
    },
    async create({ data }) {
      const row = { id: `id-${++seq}`, ...data };
      rows.push(row);
      return row;
    },
    async update({ where, data }) {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw notFound();
      Object.assign(row, data);
      return row;
    },
    async delete({ where }) {
      const i = rows.findIndex((r) => r.id === where.id);
      if (i === -1) throw notFound();
      return rows.splice(i, 1)[0];
    },
    async deleteMany({ where }) {
      const before = rows.length;
      const keep = rows.filter((r) => !(r.createdAt < where.createdAt.lt));
      rows.splice(0, rows.length, ...keep);
      return { count: before - rows.length };
    },
  };
}

function makeDb() {
  let settings: any = null;
  return {
    project: memoryDelegate(),
    review: memoryDelegate(),
    equipment: memoryDelegate(),
    contactRequest: (() => {
      const d = memoryDelegate();
      const create = d.create;
      d.create = async ({ data }) =>
        create({ data: { status: 'new', emailSent: false, emailError: null, createdAt: new Date(), ...data } });
      return d;
    })(),
    siteSettings: {
      async findUnique() {
        return settings;
      },
      async upsert({ update, create }: any) {
        settings = settings ? { ...settings, ...update } : create;
        return settings;
      },
    },
  } satisfies Db;
}

function makeConfig(over: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    isProduction: false,
    sessionSecret: 's'.repeat(40),
    sessionTtlMs: 3600_000,
    adminPasswordHash: HASH,
    cookieSecure: false,
    allowedOrigins: ['https://site.fr'],
    smtp: null,
    mailFrom: 'site@gmail.com',
    contactTo: 'fallback@exemple.fr',
    trustProxy: 1,
    resendApiKey: null,
    contactRetentionDays: 365,
    storage: null,
    ...over,
  };
}

const project = { title: 'Clip', category: 'clip', role: 'Réal', year: '2025' };
const contact = { name: 'Client', email: 'client@exemple.fr', type: 'clip', message: 'Bonjour, projet de clip.' };
const silentLogger = { error: vi.fn(), warn: vi.fn() };

describe('API', () => {
  let db: ReturnType<typeof makeDb>;
  let mailer: Mailer & { send: ReturnType<typeof vi.fn> };
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = makeDb();
    mailer = { send: vi.fn().mockResolvedValue(undefined) };
    app = createApp({ db, config: makeConfig(), mailer, logger: silentLogger });
  });

  async function login(): Promise<string> {
    const res = await request(app).post('/api/auth/login').send({ password: PASSWORD });
    expect(res.status).toBe(200);
    const cookie = ([] as string[]).concat(res.headers['set-cookie'])[0];
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\//);
    return cookie.split(';')[0];
  }

  describe('santé et erreurs', () => {
    it('GET /api/health', async () => {
      const res = await request(app).get('/api/health');
      expect(res.body).toEqual({ ok: true });
      expect(res.headers['x-powered-by']).toBeUndefined();
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('404 sur route inconnue', async () => {
      expect((await request(app).get('/api/nope')).status).toBe(404);
    });

    it('400 sur JSON invalide, sans faire tomber le serveur', async () => {
      const res = await request(app).post('/api/contact').set('Content-Type', 'application/json').send('{oops');
      await app.locals.idle();
      expect(res.status).toBe(400);
    });

    it('413 sur requête trop grosse', async () => {
      const res = await request(app).post('/api/contact').send({ message: 'x'.repeat(200_000) });
      await app.locals.idle();
      expect(res.status).toBe(413);
    });

    it('500 propre si la base plante', async () => {
      db.review.findMany = async () => {
        throw new Error('db down');
      };
      const res = await request(app).get('/api/reviews');
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: 'Erreur serveur' });
    });
  });

  describe('authentification', () => {
    it('refuse un mauvais mot de passe', async () => {
      const res = await request(app).post('/api/auth/login').send({ password: 'faux' });
      expect(res.status).toBe(401);
      expect(res.headers['set-cookie']).toBeUndefined();
    });

    it('refuse un corps vide', async () => {
      expect((await request(app).post('/api/auth/login').send({})).status).toBe(401);
    });

    it('limite les tentatives (anti force brute)', async () => {
      for (let i = 0; i < 5; i++) await request(app).post('/api/auth/login').send({ password: 'faux' });
      const res = await request(app).post('/api/auth/login').send({ password: PASSWORD });
      expect(res.status).toBe(429);
      expect(res.headers['retry-after']).toBeDefined();
    });

    it('session / logout', async () => {
      expect((await request(app).get('/api/auth/session')).body).toEqual({ authenticated: false });
      const cookie = await login();
      expect((await request(app).get('/api/auth/session').set('Cookie', cookie)).body).toEqual({ authenticated: true });
      const out = await request(app).post('/api/auth/logout');
      expect(out.body).toEqual({ authenticated: false });
    });

    it('pose un cookie Secure quand configuré', async () => {
      app = createApp({ db, config: makeConfig({ cookieSecure: true }), mailer, logger: silentLogger });
      const res = await request(app).post('/api/auth/login').send({ password: PASSWORD });
      expect(String(res.headers['set-cookie'])).toMatch(/Secure/);
    });
  });

  describe('routes protégées', () => {
    it.each([
      ['post', '/api/projects'],
      ['put', '/api/projects/x'],
      ['delete', '/api/projects/x'],
      ['post', '/api/reviews'],
      ['post', '/api/equipment'],
      ['put', '/api/settings'],
    ] as const)('%s %s → 401 sans session', async (method: 'post' | 'put' | 'delete', path: string) => {
      const res = await request(app)[method](path).send(project);
      expect(res.status).toBe(401);
    });

    it('refuse un cookie falsifié', async () => {
      const res = await request(app).post('/api/projects').set('Cookie', `${SESSION_COOKIE}=abc.def`).send(project);
      expect(res.status).toBe(401);
    });

    it("refuse une écriture venant d'une autre origine (CSRF)", async () => {
      const cookie = await login();
      const res = await request(app)
        .post('/api/projects')
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.com')
        .send(project);
      expect(res.status).toBe(403);
    });

    it("accepte une écriture depuis l'origine du site", async () => {
      const cookie = await login();
      const res = await request(app).post('/api/projects').set('Cookie', cookie).set('Origin', 'https://site.fr').send(project);
      expect(res.status).toBe(201);
    });
  });

  describe('CRUD projets', () => {
    it('cycle complet créer → lire → modifier → supprimer', async () => {
      const cookie = await login();

      const created = await request(app)
        .post('/api/projects')
        .set('Cookie', cookie)
        .send({ ...project, id: 'force', stills: 'https://a.com/1.jpg' });
      expect(created.status).toBe(201);
      expect(created.body.id).not.toBe('force');
      expect(created.body.stills).toEqual(['https://a.com/1.jpg']);
      const id = created.body.id;

      expect((await request(app).get('/api/projects')).body).toHaveLength(1);
      expect((await request(app).get(`/api/projects/${id}`)).body.title).toBe('Clip');

      const updated = await request(app)
        .put(`/api/projects/${id}`)
        .set('Cookie', cookie)
        .send({ ...created.body, title: 'Nouveau titre', createdAt: 'x', updatedAt: 'y' });
      expect(updated.status).toBe(200);
      expect(updated.body.title).toBe('Nouveau titre');

      expect((await request(app).delete(`/api/projects/${id}`).set('Cookie', cookie)).status).toBe(204);
      expect((await request(app).get(`/api/projects/${id}`)).status).toBe(404);
    });

    it('400 avec le détail des champs invalides', async () => {
      const cookie = await login();
      const res = await request(app).post('/api/projects').set('Cookie', cookie).send({ title: '' });
      expect(res.status).toBe(400);
      expect(res.body.fields.title).toBeDefined();
      const res2 = await request(app).put('/api/projects/x').set('Cookie', cookie).send({ title: '' });
      expect(res2.status).toBe(400);
    });

    it('404 en modification/suppression d’un id inexistant', async () => {
      const cookie = await login();
      expect((await request(app).put('/api/projects/inconnu').set('Cookie', cookie).send(project)).status).toBe(404);
      expect((await request(app).delete('/api/projects/inconnu').set('Cookie', cookie)).status).toBe(404);
    });
  });

  describe('paramètres', () => {
    it('GET renvoie {} si vide puis les valeurs sauvegardées', async () => {
      expect((await request(app).get('/api/settings')).body).toEqual({});
      const cookie = await login();
      const res = await request(app)
        .put('/api/settings')
        .set('Cookie', cookie)
        .send({ home_subtitle: 'Basé à Rennes', home_video_opacity: '60', champ_inconnu: 'x' });
      expect(res.status).toBe(200);
      const got = (await request(app).get('/api/settings')).body;
      expect(got.home_subtitle).toBe('Basé à Rennes');
      expect(got.champ_inconnu).toBeUndefined();
      await request(app).put('/api/settings').set('Cookie', cookie).send({ home_subtitle: 'Paris' });
      expect((await request(app).get('/api/settings')).body.home_subtitle).toBe('Paris');
    });

    it('refuse une URL javascript: dans les réseaux sociaux', async () => {
      const cookie = await login();
      const res = await request(app).put('/api/settings').set('Cookie', cookie).send({ instagram_url: 'javascript:alert(1)' });
      expect(res.status).toBe(400);
    });
  });

  describe('formulaire de contact', () => {
    it('envoie le mail au destinataire configuré dans l’admin', async () => {
      await db.siteSettings.upsert({ create: { id: 1, contact_email: 'thibaud@exemple.fr' } });
      const res = await request(app).post('/api/contact').send(contact);
      await app.locals.idle();
      expect(res.status).toBe(200);
      expect(mailer.send).toHaveBeenCalledTimes(1);
      const msg = mailer.send.mock.calls[0][0];
      expect(msg.to).toBe('thibaud@exemple.fr');
      expect(msg.from).toBe('site@gmail.com');
      expect(msg.replyTo).toBe('client@exemple.fr');
    });

    it('utilise CONTACT_TO à défaut', async () => {
      await request(app).post('/api/contact').send(contact);
      await app.locals.idle();
      expect(mailer.send.mock.calls[0][0].to).toBe('fallback@exemple.fr');
    });

    it('400 si données invalides, sans envoyer', async () => {
      const res = await request(app).post('/api/contact').send({ ...contact, email: 'nope' });
      await app.locals.idle();
      expect(res.status).toBe(400);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('ignore silencieusement les robots (honeypot)', async () => {
      const res = await request(app).post('/api/contact').send({ ...contact, website: 'http://spam' });
      await app.locals.idle();
      expect(res.status).toBe(200);
      expect(mailer.send).not.toHaveBeenCalled();
    });

    it('limite le nombre de demandes par IP', async () => {
      for (let i = 0; i < 5; i++) await request(app).post('/api/contact').send(contact);
      const res = await request(app).post('/api/contact').send(contact);
      await app.locals.idle();
      expect(res.status).toBe(429);
    });

    it('enregistre la demande en base avec le statut d’envoi', async () => {
      await request(app).post('/api/contact').send(contact);
      await app.locals.idle();
      expect(db.contactRequest.rows).toHaveLength(1);
      const row = db.contactRequest.rows[0];
      expect(row.email).toBe('client@exemple.fr');
      expect(row.emailSent).toBe(true);
      expect(row.emailError).toBeNull();
    });

    it('SMTP non configuré : la demande est quand même enregistrée (aucun prospect perdu)', async () => {
      app = createApp({ db, config: makeConfig(), mailer: null, logger: silentLogger });
      const res = await request(app).post('/api/contact').send(contact);
      await app.locals.idle();
      expect(res.status).toBe(200);
      expect(db.contactRequest.rows[0].emailSent).toBe(false);
      expect(db.contactRequest.rows[0].emailError).toMatch(/non configuré/);
    });

    it('aucun destinataire : enregistrée, mail en erreur', async () => {
      app = createApp({ db, config: makeConfig({ contactTo: '' }), mailer, logger: silentLogger });
      expect((await request(app).post('/api/contact').send(contact)).status).toBe(200);
      await app.locals.idle();
      expect(mailer.send).not.toHaveBeenCalled();
      expect(db.contactRequest.rows[0].emailSent).toBe(false);
    });

    it('SMTP en panne : 200 car la demande est sauvegardée', async () => {
      mailer.send.mockRejectedValueOnce(new Error('auth failed'));
      expect((await request(app).post('/api/contact').send(contact)).status).toBe(200);
      await app.locals.idle();
      expect(db.contactRequest.rows[0].emailError).toBe('auth failed');
    });

    it('base en panne mais mail envoyé : 200', async () => {
      db.contactRequest.create = async () => {
        throw new Error('db down');
      };
      expect((await request(app).post('/api/contact').send(contact)).status).toBe(200);
      await app.locals.idle();
      expect(mailer.send).toHaveBeenCalledTimes(1);
    });

    it('base ET mail en panne : 502', async () => {
      db.contactRequest.create = async () => {
        throw new Error('db down');
      };
      mailer.send.mockRejectedValueOnce(new Error('smtp down'));
      expect((await request(app).post('/api/contact').send(contact)).status).toBe(502);
      await app.locals.idle();
    });

    it('un échec de mise à jour du statut ne bloque pas la réponse', async () => {
      db.contactRequest.update = async () => {
        throw new Error('db hiccup');
      };
      expect((await request(app).post('/api/contact').send(contact)).status).toBe(200);
      await app.locals.idle();
    });
  });

  describe('demandes reçues (admin)', () => {
    it('exige une session', async () => {
      expect((await request(app).get('/api/contact-requests')).status).toBe(401);
      expect((await request(app).patch('/api/contact-requests/x').send({ status: 'read' })).status).toBe(401);
      expect((await request(app).delete('/api/contact-requests/x')).status).toBe(401);
    });

    it('liste, change le statut, supprime', async () => {
      await request(app).post('/api/contact').send(contact);
      await app.locals.idle();
      const cookie = await login();
      const list = await request(app).get('/api/contact-requests').set('Cookie', cookie);
      expect(list.status).toBe(200);
      expect(list.body).toHaveLength(1);
      const id = list.body[0].id;

      const upd = await request(app).patch(`/api/contact-requests/${id}`).set('Cookie', cookie).send({ status: 'read' });
      expect(upd.body.status).toBe('read');
      expect((await request(app).patch(`/api/contact-requests/${id}`).set('Cookie', cookie).send({ status: 'hack' })).status).toBe(400);

      expect((await request(app).delete(`/api/contact-requests/${id}`).set('Cookie', cookie)).status).toBe(204);
      expect(db.contactRequest.rows).toHaveLength(0);
    });

    it('purge les demandes plus vieilles que la durée de conservation (RGPD)', async () => {
      db.contactRequest.rows.push(
        { id: 'old', createdAt: new Date(Date.now() - 400 * 24 * 3600 * 1000) },
        { id: 'recent', createdAt: new Date() },
      );
      const cookie = await login();
      const list = await request(app).get('/api/contact-requests').set('Cookie', cookie);
      expect(list.body.map((r: any) => r.id)).toEqual(['recent']);
    });
  });

  describe('upload (URL présignée)', () => {
    const storage = { publicBaseUrl: 'https://cdn.exemple.fr/', presignUpload: vi.fn().mockResolvedValue('https://r2/signed') };

    it('exige une session', async () => {
      expect((await request(app).post('/api/uploads/presign').send({ contentType: 'image/jpeg', size: 10 })).status).toBe(401);
    });

    it('503 si le stockage n’est pas configuré', async () => {
      const cookie = await login();
      const res = await request(app).post('/api/uploads/presign').set('Cookie', cookie).send({ contentType: 'image/jpeg', size: 10 });
      expect(res.status).toBe(503);
    });

    it('400 sur un type ou une taille refusés', async () => {
      app = createApp({ db, config: makeConfig(), mailer, storage, logger: silentLogger });
      const cookie = await login();
      const bad = await request(app).post('/api/uploads/presign').set('Cookie', cookie).send({ contentType: 'text/html', size: 10 });
      expect(bad.status).toBe(400);
      const big = await request(app).post('/api/uploads/presign').set('Cookie', cookie).send({ contentType: 'image/png', size: 1e9 });
      expect(big.status).toBe(400);
    });

    it('renvoie une URL d’upload et l’URL publique finale', async () => {
      app = createApp({ db, config: makeConfig(), mailer, storage, logger: silentLogger });
      const cookie = await login();
      const res = await request(app)
        .post('/api/uploads/presign')
        .set('Cookie', cookie)
        .send({ contentType: 'image/webp', size: 2048, filename: '../../etc/passwd' });
      expect(res.status).toBe(200);
      expect(res.body.uploadUrl).toBe('https://r2/signed');
      expect(res.body.publicUrl).toMatch(/^https:\/\/cdn\.exemple\.fr\/uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.webp$/);
      expect(res.body.headers).toEqual({ 'Content-Type': 'image/webp' });
      const arg = storage.presignUpload.mock.calls[0][0];
      expect(arg.contentLength).toBe(2048);
      expect(arg.key).not.toContain('..');
    });
  });

  describe('avis et matériel', () => {
    it('crée un avis et un matériel', async () => {
      const cookie = await login();
      expect((await request(app).post('/api/reviews').set('Cookie', cookie).send({ text: 'Top', author: 'A' })).status).toBe(201);
      expect(
        (await request(app).post('/api/equipment').set('Cookie', cookie).send({ category: 'Caméras', name: 'FX3' })).status,
      ).toBe(201);
      expect((await request(app).get('/api/equipment')).body[0].name).toBe('FX3');
    });
  });
});
