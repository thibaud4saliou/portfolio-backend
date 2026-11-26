import express, { type NextFunction, type Request, type Response, type Router } from 'express';
import type { AppConfig } from './config';
import { createSessionToken, parseCookies, verifyPassword, verifySessionToken } from './lib/auth';
import { buildContactEmail, type ContactRequest, type Mailer } from './lib/email';
import { createRateLimiter, type RateLimiter } from './lib/rateLimit';
import type { Storage } from './lib/storage';
import { buildUploadKey, checkUpload, publicUrlFor } from './lib/uploads';
import {
  contactSchema,
  equipmentSchema,
  loginSchema,
  projectSchema,
  reviewSchema,
  settingsSchema,
  validate,
  type Schema,
} from './lib/validation';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Delegate {
  findMany(args?: any): Promise<any[]>;
  findUnique(args: any): Promise<any | null>;
  create(args: any): Promise<any>;
  update(args: any): Promise<any>;
  delete(args: any): Promise<any>;
}

export interface Db {
  project: Delegate;
  review: Delegate;
  equipment: Delegate;
  siteSettings: {
    findUnique(args: any): Promise<any | null>;
    upsert(args: any): Promise<any>;
  };
  contactRequest: Delegate & { deleteMany(args: any): Promise<{ count: number }> };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface AppDeps {
  db: Db;
  config: AppConfig;
  mailer: Mailer | null;
  storage?: Storage | null;
  loginLimiter?: RateLimiter;
  contactLimiter?: RateLimiter;
  logger?: Pick<Console, 'error' | 'warn'>;
}

export const SESSION_COOKIE = 'admin_session';
const SETTINGS_ID = 1;

export function createApp(deps: AppDeps) {
  const { db, config, mailer } = deps;
  const storage = deps.storage ?? null;
  const logger = deps.logger ?? console;
  const loginLimiter = deps.loginLimiter ?? createRateLimiter({ windowMs: 15 * 60_000, max: 5 });
  const contactLimiter = deps.contactLimiter ?? createRateLimiter({ windowMs: 60 * 60_000, max: 5 });

  const app = express();
  app.disable('x-powered-by');

  // Tâches en arrière-plan (envoi de mails) : attendues à l'arrêt du serveur et dans les tests.
  const pending = new Set<Promise<void>>();
  const track = (task: Promise<void>) => {
    pending.add(task);
    task.finally(() => pending.delete(task));
  };
  app.locals.idle = async () => {
    await Promise.all([...pending]);
  };
  // Derrière nginx / Vercel / Render : req.ip = vraie IP du visiteur.
  app.set('trust proxy', config.trustProxy);
  app.use(express.json({ limit: '100kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Protection CSRF complémentaire au cookie SameSite=Strict : on refuse les
  // requêtes d'écriture venant d'une autre origine que le site.
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin && config.allowedOrigins.length > 0 && !config.allowedOrigins.includes(origin)) {
      res.status(403).json({ error: 'Origine non autorisée' });
      return;
    }
    next();
  });

  const isAuthenticated = (req: Request) =>
    verifySessionToken(parseCookies(req.headers.cookie)[SESSION_COOKIE], config.sessionSecret);

  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    if (!isAuthenticated(req)) {
      res.status(401).json({ error: 'Authentification requise' });
      return;
    }
    next();
  };

  const api: Router = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  // --- Authentification admin ------------------------------------------------
  api.post('/auth/login', (req, res) => {
    const limit = loginLimiter.hit(req.ip ?? 'unknown');
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
      return;
    }
    const parsed = validate(loginSchema, req.body);
    if (!parsed.ok || !verifyPassword(String(parsed.data.password), config.adminPasswordHash)) {
      res.status(401).json({ error: 'Mot de passe incorrect' });
      return;
    }
    loginLimiter.reset(req.ip ?? 'unknown');
    res.cookie(SESSION_COOKIE, createSessionToken(config.sessionSecret, config.sessionTtlMs), {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'strict',
      path: '/',
      maxAge: config.sessionTtlMs,
    });
    res.json({ authenticated: true });
  });

  api.post('/auth/logout', (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.json({ authenticated: false });
  });

  api.get('/auth/session', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ authenticated: isAuthenticated(req) });
  });

  // --- CRUD générique -------------------------------------------------------
  function crud(path: string, delegate: Delegate, schema: Schema) {
    api.get(path, async (_req, res) => {
      res.json(await delegate.findMany({ orderBy: [{ order: 'asc' }] }));
    });

    api.get(`${path}/:id`, async (req, res) => {
      const item = await delegate.findUnique({ where: { id: req.params.id } });
      if (!item) {
      res.status(404).json({ error: 'Introuvable' });
      return;
    }
      res.json(item);
    });

    api.post(path, requireAuth, async (req, res) => {
      const parsed = validate(schema, req.body);
      if (!parsed.ok) {
      res.status(400).json({ error: 'Données invalides', fields: parsed.errors });
      return;
    }
      res.status(201).json(await delegate.create({ data: parsed.data }));
    });

    api.put(`${path}/:id`, requireAuth, async (req, res) => {
      const parsed = validate(schema, req.body);
      if (!parsed.ok) {
      res.status(400).json({ error: 'Données invalides', fields: parsed.errors });
      return;
    }
      res.json(await delegate.update({ where: { id: req.params.id }, data: parsed.data }));
    });

    api.delete(`${path}/:id`, requireAuth, async (req, res) => {
      await delegate.delete({ where: { id: req.params.id } });
      res.status(204).end();
    });
  }

  crud('/projects', db.project, projectSchema);
  crud('/reviews', db.review, reviewSchema);
  crud('/equipment', db.equipment, equipmentSchema);

  // --- Paramètres du site (ligne unique id=1) --------------------------------
  api.get('/settings', async (_req, res) => {
    const settings = await db.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
    res.json(settings ?? {});
  });

  api.put('/settings', requireAuth, async (req, res) => {
    const parsed = validate(settingsSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'Données invalides', fields: parsed.errors });
      return;
    }
    const settings = await db.siteSettings.upsert({
      where: { id: SETTINGS_ID },
      update: parsed.data,
      create: { id: SETTINGS_ID, ...parsed.data },
    });
    res.json(settings);
  });

  // --- Formulaire de devis : enregistré en base PUIS envoyé par mail ----------
  // La demande est d'abord sauvegardée : si le SMTP tombe, aucun prospect
  // n'est perdu (elle reste visible dans l'admin, onglet « Demandes »).
  api.post('/contact', async (req, res) => {
    // Champ piège invisible : un humain le laisse vide, un robot le remplit.
    if (typeof req.body?.website === 'string' && req.body.website !== '') {
      res.json({ success: true });
      return;
    }

    const parsed = validate(contactSchema, req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: 'Données invalides', fields: parsed.errors });
      return;
    }

    const limit = contactLimiter.hit(req.ip ?? 'unknown');
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      res.status(429).json({ error: 'Trop de demandes, réessayez plus tard' });
      return;
    }

    const contact = parsed.data as unknown as ContactRequest;

    let savedId: string | null = null;
    try {
      const saved = await db.contactRequest.create({
        data: { name: contact.name, email: contact.email, type: contact.type, message: contact.message },
      });
      savedId = saved.id;
    } catch (err) {
      logger.error('[contact] Enregistrement en base impossible :', err);
    }

    const deliver = async (): Promise<string | null> => {
      try {
        const settings = await db.siteSettings.findUnique({ where: { id: SETTINGS_ID } });
        const to: string = settings?.contact_email || config.contactTo;
        if (!mailer || !to || !config.mailFrom) throw new Error('Envoi de mail non configuré');
        await mailer.send(buildContactEmail(contact, { from: config.mailFrom, to }));
        return null;
      } catch (err) {
        const message = (err as Error).message?.slice(0, 500) || 'Erreur inconnue';
        logger.error('[contact] Email non envoyé :', message);
        return message;
      }
    };

    if (savedId) {
      // Demande en sécurité en base : on répond tout de suite au visiteur,
      // le mail part en arrière-plan (il n'attend plus la réponse du serveur mail).
      const id = savedId;
      track(
        deliver().then((emailError) =>
          db.contactRequest
            .update({ where: { id }, data: { emailSent: emailError === null, emailError } })
            .then(() => undefined)
            .catch((err: unknown) => logger.error('[contact] Mise à jour du statut impossible :', err)),
        ),
      );
      res.json({ success: true });
      return;
    }

    // Base indisponible : le mail est le seul moyen de ne pas perdre la demande.
    if (await deliver()) {
      res.status(502).json({ error: "La demande n'a pas pu être transmise" });
      return;
    }
    res.json({ success: true });
  });

  // --- Demandes reçues (admin) ---------------------------------------------
  const CONTACT_STATUSES = ['new', 'read', 'archived'];

  api.get('/contact-requests', requireAuth, async (_req, res) => {
    // RGPD : suppression automatique au-delà de la durée de conservation.
    const cutoff = new Date(Date.now() - config.contactRetentionDays * 24 * 3600 * 1000);
    await db.contactRequest.deleteMany({ where: { createdAt: { lt: cutoff } } });
    res.setHeader('Cache-Control', 'no-store');
    res.json(await db.contactRequest.findMany({ orderBy: [{ createdAt: 'desc' }], take: 500 }));
  });

  api.patch('/contact-requests/:id', requireAuth, async (req, res) => {
    const status = req.body?.status;
    if (!CONTACT_STATUSES.includes(status)) {
      res.status(400).json({ error: 'Statut invalide', fields: { status: 'new, read ou archived' } });
      return;
    }
    res.json(await db.contactRequest.update({ where: { id: req.params.id }, data: { status } }));
  });

  api.delete('/contact-requests/:id', requireAuth, async (req, res) => {
    await db.contactRequest.delete({ where: { id: req.params.id } });
    res.status(204).end();
  });

  // --- Upload direct vers le stockage (R2 / S3) -----------------------------
  api.post('/uploads/presign', requireAuth, async (req, res) => {
    if (!storage) {
      res.status(503).json({ error: "Téléversement pas encore activé : collez un lien (URL) en attendant." });
      return;
    }
    const check = checkUpload(req.body);
    if (!check.ok) {
      res.status(400).json({ error: check.error });
      return;
    }
    const key = buildUploadKey(check.ext);
    const uploadUrl = await storage.presignUpload({ key, contentType: check.contentType, contentLength: check.size });
    res.json({
      uploadUrl,
      publicUrl: publicUrlFor(storage.publicBaseUrl, key),
      headers: { 'Content-Type': check.contentType },
    });
  });

  app.use('/api', api);

  app.use((_req, res) => {
    res.status(404).json({ error: 'Route inconnue' });
  });

  // Gestionnaire d'erreurs global : plus aucune erreur ne fait tomber le serveur.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.code === 'P2025') {
      res.status(404).json({ error: 'Introuvable' });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'JSON invalide' });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'Requête trop volumineuse' });
      return;
    }
    logger.error('[api] Erreur inattendue :', err);
    res.status(500).json({ error: 'Erreur serveur' });
  });

  return app;
}
