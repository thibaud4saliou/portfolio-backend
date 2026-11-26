import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createApp, type Db } from './app';
import { loadConfig } from './config';
import { createSmtpMailer } from './lib/mailer';
import { createResendMailer } from './lib/resendMailer';
import { createS3Storage } from './lib/storage';

const config = loadConfig();
const prisma = new PrismaClient();

const mailer = config.resendApiKey
  ? createResendMailer(config.resendApiKey)
  : config.smtp
    ? createSmtpMailer(config.smtp)
    : null;
console.log(
  config.resendApiKey
    ? '[mail] Envoi via Resend (HTTPS)'
    : config.smtp
      ? `[mail] Envoi via SMTP (${config.smtp.host})`
      : '[mail] Aucun envoi configuré : les demandes de devis seront seulement enregistrées en base.',
);
if (!config.storage) {
  console.warn('[upload] Stockage S3/R2 non configuré : upload désactivé dans l\'admin (les URL restent possibles).');
}

const app = createApp({
  db: prisma as unknown as Db,
  config,
  mailer,
  storage: config.storage ? createS3Storage(config.storage) : null,
});

const server = app.listen(config.port, () => {
  console.log(`API démarrée sur le port ${config.port}`);
});

async function shutdown() {
  server.close();
  await app.locals.idle(); // laisse partir les mails en cours
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
