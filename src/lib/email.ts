import { escapeHtml, stripControlChars } from './security';

export interface MailMessage {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export interface ContactRequest {
  name: string;
  email: string;
  type: string;
  message: string;
}

const TYPE_LABELS: Record<string, string> = {
  clip: 'Clip vidéo',
  'court-metrage': 'Court-métrage',
  publicite: 'Publicité / Brand content',
  photo: 'Photographie',
  autre: 'Autre',
};

/**
 * Construit le mail envoyé à Thibaud.
 * - "from" = l'adresse du compte SMTP (sinon Gmail/OVH rejettent ou classent en spam),
 * - "replyTo" = l'adresse du client, pour répondre directement depuis sa boîte mail,
 * - le sujet est nettoyé (pas de retour ligne → pas d'injection d'en-têtes),
 * - le HTML est échappé (pas d'injection de balises dans le mail).
 */
export function buildContactEmail(req: ContactRequest, opts: { from: string; to: string }): MailMessage {
  const name = stripControlChars(req.name);
  const email = stripControlChars(req.email);
  const typeLabel = TYPE_LABELS[req.type] ?? req.type;

  const text = [
    `Nom / Structure : ${name}`,
    `Email : ${email}`,
    `Type de projet : ${typeLabel}`,
    '',
    'Message :',
    req.message,
    '',
    '— Envoyé depuis le formulaire de devis du site.',
  ].join('\n');

  const html = `
<h2 style="font-family:sans-serif">Nouvelle demande de devis</h2>
<table style="font-family:sans-serif;font-size:14px">
  <tr><td><b>Nom / Structure</b></td><td>${escapeHtml(name)}</td></tr>
  <tr><td><b>Email</b></td><td><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></td></tr>
  <tr><td><b>Type de projet</b></td><td>${escapeHtml(typeLabel)}</td></tr>
</table>
<p style="font-family:sans-serif;white-space:pre-wrap;font-size:14px">${escapeHtml(req.message)}</p>
<p style="font-family:sans-serif;color:#888;font-size:12px">Répondez directement à ce mail pour contacter le client.</p>`.trim();

  return {
    from: opts.from,
    to: opts.to,
    replyTo: email,
    subject: stripControlChars(`Nouvelle demande (${typeLabel}) : ${name}`).slice(0, 200),
    text,
    html,
  };
}
