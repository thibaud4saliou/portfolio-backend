import nodemailer from 'nodemailer';
import type { SmtpConfig } from '../config';
import type { Mailer } from './email';

/** Adaptateur nodemailer (SMTP générique : Gmail, OVH, Brevo, Infomaniak…). */
export function createSmtpMailer(smtp: SmtpConfig): Mailer {
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });

  transporter.verify().then(
    () => console.log(`[mail] Connexion SMTP OK (${smtp.host})`),
    (err: Error) => console.error('[mail] Connexion SMTP impossible :', err.message),
  );

  return {
    async send(message) {
      await transporter.sendMail(message);
    },
  };
}
