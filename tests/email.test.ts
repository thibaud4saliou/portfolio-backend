import { describe, expect, it } from 'vitest';
import { buildContactEmail } from '../src/lib/email';

describe('buildContactEmail', () => {
  const opts = { from: '"Site" <site@gmail.com>', to: 'thibaud@exemple.fr' };

  it("envoie depuis le compte SMTP et met le client en Reply-To", () => {
    const mail = buildContactEmail(
      { name: 'Studio X', email: 'client@exemple.fr', type: 'clip', message: 'Un clip svp' },
      opts,
    );
    expect(mail.from).toBe(opts.from);
    expect(mail.to).toBe(opts.to);
    expect(mail.replyTo).toBe('client@exemple.fr');
    expect(mail.subject).toBe('Nouvelle demande (Clip vidéo) : Studio X');
    expect(mail.text).toContain('Un clip svp');
  });

  it("neutralise l'injection d'en-têtes et de HTML", () => {
    const mail = buildContactEmail(
      { name: 'Evil\r\nBcc: spam@x.com', email: 'a@b.fr', type: 'autre', message: '<script>alert(1)</script>' },
      opts,
    );
    expect(mail.subject).not.toMatch(/[\r\n]/);
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('garde le type brut si inconnu et tronque le sujet', () => {
    const mail = buildContactEmail({ name: 'n'.repeat(300), email: 'a@b.fr', type: 'xyz', message: 'm' }, opts);
    expect(mail.subject.length).toBeLessThanOrEqual(200);
    expect(mail.text).toContain('Type de projet : xyz');
  });
});
