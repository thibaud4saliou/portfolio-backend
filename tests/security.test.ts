import { describe, expect, it } from 'vitest';
import { escapeHtml, isEmail, isSafeUrl, stripControlChars } from '../src/lib/security';

describe('isSafeUrl', () => {
  it('accepte http et https', () => {
    expect(isSafeUrl('https://youtube.com/watch?v=abc')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('refuse les schémas dangereux (XSS)', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl(' JavaScript:alert(1)')).toBe(false);
    expect(isSafeUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeUrl('vbscript:msgbox(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
  });

  it('refuse les valeurs vides ou invalides', () => {
    expect(isSafeUrl('')).toBe(false);
    expect(isSafeUrl('   ')).toBe(false);
    expect(isSafeUrl('pas une url')).toBe(false);
  });

  it('accepte les chemins internes seulement si demandé', () => {
    expect(isSafeUrl('/realisation/123')).toBe(false);
    expect(isSafeUrl('/realisation/123', { allowRelative: true })).toBe(true);
    expect(isSafeUrl('//evil.com', { allowRelative: true })).toBe(false);
    expect(isSafeUrl('/\\evil.com', { allowRelative: true })).toBe(false);
  });
});

describe('isEmail', () => {
  it('valide les emails courants', () => {
    expect(isEmail('thibaud.saliou@gmail.com')).toBe(true);
    expect(isEmail('a+b@sub.domaine.fr')).toBe(true);
  });
  it('refuse les emails invalides ou piégés', () => {
    expect(isEmail('pas-un-email')).toBe(false);
    expect(isEmail('a@b')).toBe(false);
    expect(isEmail('a@b.c')).toBe(false);
    expect(isEmail('x@y.com\nBcc: victime@z.com')).toBe(false);
    expect(isEmail('<script>@x.com')).toBe(false);
    expect(isEmail(`${'a'.repeat(250)}@x.com`)).toBe(false);
  });
});

describe('stripControlChars', () => {
  it("supprime les retours ligne (injection d'en-têtes)", () => {
    expect(stripControlChars('Jean\r\nBcc: spam@x.com')).toBe('Jean Bcc: spam@x.com');
    expect(stripControlChars('  ok\t ')).toBe('ok');
  });
});

describe('escapeHtml', () => {
  it('échappe les caractères HTML', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;',
    );
  });
});
