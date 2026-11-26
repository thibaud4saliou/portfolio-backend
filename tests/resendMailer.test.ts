import { describe, expect, it } from 'vitest';
import { createResendMailer } from '../src/lib/resendMailer';

const message = {
  from: 'Site <onboarding@resend.dev>',
  to: 'thibaud@exemple.fr',
  replyTo: 'client@exemple.fr',
  subject: 'Sujet',
  text: 'Texte',
  html: '<p>Texte</p>',
};

describe('createResendMailer', () => {
  it("appelle l'API Resend avec la clé et le bon format", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"id":"1"}', { status: 200 });
    }) as unknown as typeof fetch;

    await createResendMailer('re_test', fakeFetch).send(message);

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer re_test');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      from: message.from,
      to: ['thibaud@exemple.fr'],
      reply_to: 'client@exemple.fr',
      subject: 'Sujet',
      text: 'Texte',
      html: '<p>Texte</p>',
    });
    expect(calls[0].init.signal).toBeDefined();
  });

  it("lève une erreur lisible si l'API refuse", async () => {
    const fakeFetch = (async () => new Response('domain not verified', { status: 403 })) as unknown as typeof fetch;
    let err: Error | undefined;
    try {
      await createResendMailer('re_test', fakeFetch).send(message);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).toBe('Resend 403 : domain not verified');
  });

  it('gère une réponse illisible', async () => {
    const bad = { ok: false, status: 500, text: async () => { throw new Error('x'); } };
    const fakeFetch = (async () => bad) as unknown as typeof fetch;
    let err: Error | undefined;
    try {
      await createResendMailer('k', fakeFetch).send(message);
    } catch (e) {
      err = e as Error;
    }
    expect(err?.message).toBe('Resend 500 : ');
  });
});
