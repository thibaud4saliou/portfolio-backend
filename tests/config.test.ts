import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const HASH = 'scrypt:aa:bb';

describe('loadConfig', () => {
  it('refuse de démarrer en production sans secrets', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(32) })).toThrow(
      /ADMIN_PASSWORD_HASH/,
    );
  });

  it('exige le hash admin même en dev', () => {
    expect(() => loadConfig({})).toThrow(/ADMIN_PASSWORD_HASH/);
  });

  it('utilise des valeurs par défaut sûres en dev', () => {
    const c = loadConfig({ ADMIN_PASSWORD_HASH: HASH });
    expect(c.isProduction).toBe(false);
    expect(c.sessionSecret.length).toBeGreaterThan(31);
    expect(c.cookieSecure).toBe(false);
    expect(c.smtp).toBeNull();
    expect(c.mailFrom).toBe('');
    expect(c.port).toBe(5000);
    expect(c.sessionTtlMs).toBe(8 * 3600 * 1000);
  });

  it('lit la configuration de production complète', () => {
    const c = loadConfig({
      NODE_ENV: 'production',
      PORT: '5001',
      SESSION_SECRET: 's'.repeat(40),
      ADMIN_PASSWORD_HASH: HASH,
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_USER: 'site@gmail.com',
      SMTP_PASS: 'app-password',
      CONTACT_TO: 'thibaud@exemple.fr',
      ALLOWED_ORIGINS: 'https://thibaudsaliou.fr, https://www.thibaudsaliou.fr',
      SESSION_TTL_HOURS: '2',
    });
    expect(c.cookieSecure).toBe(true);
    expect(c.smtp).toEqual({ host: 'smtp.gmail.com', port: 465, secure: true, user: 'site@gmail.com', pass: 'app-password' });
    expect(c.mailFrom).toBe('"Site Thibaud Saliou" <site@gmail.com>');
    expect(c.allowedOrigins).toEqual(['https://thibaudsaliou.fr', 'https://www.thibaudsaliou.fr']);
    expect(c.sessionTtlMs).toBe(2 * 3600 * 1000);
    expect(c.port).toBe(5001);
  });

  it('respecte SMTP_PORT, SMTP_SECURE, MAIL_FROM et COOKIE_SECURE', () => {
    const c = loadConfig({
      ADMIN_PASSWORD_HASH: HASH,
      SMTP_HOST: 'smtp.ovh.net',
      SMTP_PORT: '587',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      MAIL_FROM: 'contact@site.fr',
      COOKIE_SECURE: 'true',
    });
    expect(c.smtp?.port).toBe(587);
    expect(c.smtp?.secure).toBe(false);
    expect(c.mailFrom).toBe('contact@site.fr');
    expect(c.cookieSecure).toBe(true);

    const c2 = loadConfig({ ADMIN_PASSWORD_HASH: HASH, SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p', SMTP_SECURE: 'true', SMTP_PORT: '2525' });
    expect(c2.smtp?.secure).toBe(true);
  });

  it('reprend EMAIL_USER / EMAIL_PASS (ancienne config Gmail)', () => {
    const c = loadConfig({ ADMIN_PASSWORD_HASH: HASH, EMAIL_USER: 'site@gmail.com', EMAIL_PASS: 'app' });
    expect(c.smtp).toEqual({ host: 'smtp.gmail.com', port: 465, secure: true, user: 'site@gmail.com', pass: 'app' });
  });

  it('lit le stockage S3/R2 complet, refuse un stockage incomplet', () => {
    const s3 = {
      S3_ENDPOINT: 'https://acc.r2.cloudflarestorage.com',
      S3_BUCKET: 'portfolio',
      S3_ACCESS_KEY_ID: 'k',
      S3_SECRET_ACCESS_KEY: 's',
      S3_PUBLIC_URL: 'https://media.site.fr',
    };
    const c = loadConfig({ ADMIN_PASSWORD_HASH: HASH, ...s3 });
    expect(c.storage).toEqual({
      endpoint: s3.S3_ENDPOINT,
      region: 'auto',
      bucket: 'portfolio',
      accessKeyId: 'k',
      secretAccessKey: 's',
      publicUrl: s3.S3_PUBLIC_URL,
    });
    expect(loadConfig({ ADMIN_PASSWORD_HASH: HASH, ...s3, S3_REGION: 'eu-west-3' }).storage?.region).toBe('eu-west-3');
    expect(() => loadConfig({ ADMIN_PASSWORD_HASH: HASH, S3_BUCKET: 'x' })).toThrow(/S3_ENDPOINT/);
  });

  it('lit TRUST_PROXY et CONTACT_RETENTION_DAYS', () => {
    const c = loadConfig({ ADMIN_PASSWORD_HASH: HASH, TRUST_PROXY: '2', CONTACT_RETENTION_DAYS: '90' });
    expect(c.trustProxy).toBe(2);
    expect(c.contactRetentionDays).toBe(90);
    expect(c.storage).toBeNull();
  });
});
