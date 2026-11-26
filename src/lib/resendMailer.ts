import type { Mailer } from './email';

/**
 * Envoi via l'API HTTPS de Resend (resend.com).
 * Pourquoi pas SMTP : les services gratuits Render bloquent les ports SMTP
 * (25, 465, 587) depuis septembre 2025 → "Connection timeout".
 * Une API HTTPS (port 443) n'est pas concernée.
 */
export function createResendMailer(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Mailer {
  return {
    async send(message) {
      const res = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: message.from,
          to: [message.to],
          reply_to: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend ${res.status} : ${body.slice(0, 300)}`);
      }
    },
  };
}
