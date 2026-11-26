import { describe, expect, it } from 'vitest';
import {
  createSessionToken,
  hashPassword,
  parseCookies,
  verifyPassword,
  verifySessionToken,
} from '../src/lib/auth';

const SECRET = 'x'.repeat(40);

describe('hashPassword / verifyPassword', () => {
  it('vérifie le bon mot de passe et refuse le mauvais', () => {
    const hash = hashPassword('motdepasse-solide');
    expect(hash.startsWith('scrypt:')).toBe(true);
    expect(verifyPassword('motdepasse-solide', hash)).toBe(true);
    expect(verifyPassword('mauvais', hash)).toBe(false);
  });

  it('produit un sel différent à chaque fois', () => {
    expect(hashPassword('abc')).not.toBe(hashPassword('abc'));
  });

  it('refuse un hash mal formé', () => {
    expect(verifyPassword('x', '')).toBe(false);
    expect(verifyPassword('x', 'bcrypt:aa:bb')).toBe(false);
    expect(verifyPassword('x', 'scrypt::')).toBe(false);
    expect(verifyPassword('x', 'scrypt:aa')).toBe(false);
  });
});

describe('jeton de session', () => {
  it('accepte un jeton valide non expiré', () => {
    const token = createSessionToken(SECRET, 1000, 0);
    expect(verifySessionToken(token, SECRET, 500)).toBe(true);
  });

  it('refuse un jeton expiré', () => {
    const token = createSessionToken(SECRET, 1000, 0);
    expect(verifySessionToken(token, SECRET, 1001)).toBe(false);
  });

  it('refuse un jeton signé avec un autre secret', () => {
    const token = createSessionToken('y'.repeat(40), 1000, 0);
    expect(verifySessionToken(token, SECRET, 1)).toBe(false);
  });

  it('refuse un jeton falsifié', () => {
    const token = createSessionToken(SECRET, 1000, 0);
    const [, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'admin', exp: 9e15 })).toString('base64url');
    expect(verifySessionToken(`${forged}.${sig}`, SECRET, 1)).toBe(false);
  });

  it('refuse les valeurs absentes ou mal formées', () => {
    expect(verifySessionToken(undefined, SECRET)).toBe(false);
    expect(verifySessionToken('', SECRET)).toBe(false);
    expect(verifySessionToken('abc', SECRET)).toBe(false);
    expect(verifySessionToken('a.b.c', SECRET)).toBe(false);
  });

  it('refuse une charge utile non JSON même correctement signée', async () => {
    const { createHmac } = await import('node:crypto');
    const payload = Buffer.from('pas du json').toString('base64url');
    const sig = createHmac('sha256', SECRET).update(payload).digest('base64url');
    expect(verifySessionToken(`${payload}.${sig}`, SECRET)).toBe(false);
  });
});

describe('parseCookies', () => {
  it('lit les cookies', () => {
    expect(parseCookies('a=1; admin_session=xyz%3D; vide=')).toEqual({ a: '1', admin_session: 'xyz=', vide: '' });
  });
  it('gère les cas limites', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('sansvaleur; =x; b=%E0%A4%A')).toEqual({ b: '%E0%A4%A' });
  });
});
