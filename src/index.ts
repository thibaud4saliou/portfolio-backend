import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { createApp, type Db } from './app';
import { loadConfig } from './config';
import { createSmtpMailer } from './lib/mailer';
import { createS3Storage } from './lib/storage';

const config = loadConfig();
const prisma = new PrismaClient();

if (!config.smtp) {
  console.warn('[mail] SMTP non configuré : les demandes de devis seront seulement enregistrées en base.');
}
if (!config.storage) {
  console.warn('[upload] Stockage S3/R2 non configuré : upload désactivé dans l\'admin (les URL restent possibles).');
}

const app = createApp({
  db: prisma as unknown as Db,
  config,
  mailer: config.smtp ? createSmtpMailer(config.smtp) : null,
  storage: config.storage ? createS3Storage(config.storage) : null,
});

const server = app.listen(config.port, () => {
  console.log(`API démarrée sur le port ${config.port}`);
});

async function shutdown() {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
