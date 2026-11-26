export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}

export interface StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
}

export interface AppConfig {
  port: number;
  isProduction: boolean;
  sessionSecret: string;
  sessionTtlMs: number;
  adminPasswordHash: string;
  cookieSecure: boolean;
  allowedOrigins: string[];
  trustProxy: number;
  smtp: SmtpConfig | null;
  /** Clé API Resend : prioritaire sur SMTP (fonctionne sur Render gratuit). */
  resendApiKey: string | null;
  mailFrom: string;
  contactTo: string;
  contactRetentionDays: number;
  storage: StorageConfig | null;
}

/**
 * Lit et vérifie la configuration. En production, l'API refuse de démarrer
 * sans secret de session ni mot de passe admin : mieux vaut un serveur qui
 * plante au démarrage qu'une API ouverte à tous.
 */
export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const errors: string[] = [];

  let sessionSecret = env.SESSION_SECRET ?? '';
  if (sessionSecret.length < 32) {
    if (isProduction) errors.push('SESSION_SECRET doit faire au moins 32 caractères');
    else sessionSecret = 'dev-only-insecure-secret-change-me-please!!';
  }

  const adminPasswordHash = env.ADMIN_PASSWORD_HASH ?? '';
  if (!adminPasswordHash.startsWith('scrypt:')) {
    errors.push('ADMIN_PASSWORD_HASH manquant ou invalide (générez-le avec `npm run hash-password`)');
  }

  // Compatibilité avec l'ancienne config Gmail (EMAIL_USER / EMAIL_PASS).
  const smtpUser = env.SMTP_USER || env.EMAIL_USER;
  const smtpPass = env.SMTP_PASS || env.EMAIL_PASS;
  const smtpHost = env.SMTP_HOST || (env.EMAIL_USER ? 'smtp.gmail.com' : undefined);
  let smtp: SmtpConfig | null = null;
  if (smtpHost && smtpUser && smtpPass) {
    const port = Number(env.SMTP_PORT ?? 465);
    smtp = {
      host: smtpHost,
      port,
      secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
      user: smtpUser,
      pass: smtpPass,
    };
  }

  let storage: StorageConfig | null = null;
  const s3Keys = ['S3_ENDPOINT', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY', 'S3_PUBLIC_URL'] as const;
  const s3Present = s3Keys.filter((k) => env[k]);
  if (s3Present.length === s3Keys.length) {
    storage = {
      endpoint: env.S3_ENDPOINT as string,
      region: env.S3_REGION || 'auto',
      bucket: env.S3_BUCKET as string,
      accessKeyId: env.S3_ACCESS_KEY_ID as string,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY as string,
      publicUrl: env.S3_PUBLIC_URL as string,
    };
  } else if (s3Present.length > 0) {
    errors.push(`Stockage incomplet, il manque : ${s3Keys.filter((k) => !env[k]).join(', ')}`);
  }

  if (errors.length > 0) {
    throw new Error(`Configuration invalide :\n - ${errors.join('\n - ')}`);
  }

  return {
    port: Number(env.PORT ?? 5000),
    isProduction,
    sessionSecret,
    sessionTtlMs: Number(env.SESSION_TTL_HOURS ?? 8) * 3600 * 1000,
    adminPasswordHash,
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE !== 'false' : isProduction,
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    trustProxy: Number(env.TRUST_PROXY ?? 1),
    smtp,
    resendApiKey: env.RESEND_API_KEY || null,
    mailFrom:
      env.MAIL_FROM ||
      (env.RESEND_API_KEY
        ? 'Site Thibaud Saliou <onboarding@resend.dev>'
        : smtp
          ? `"Site Thibaud Saliou" <${smtp.user}>`
          : ''),
    contactTo: env.CONTACT_TO ?? '',
    contactRetentionDays: Number(env.CONTACT_RETENTION_DAYS ?? 365),
    storage,
  };
}
