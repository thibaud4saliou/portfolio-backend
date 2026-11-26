import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/lib/rateLimit';

describe('createRateLimiter', () => {
  it('bloque au-delà du maximum puis se réinitialise après la fenêtre', () => {
    let t = 0;
    const rl = createRateLimiter({ windowMs: 1000, max: 2, now: () => t });
    expect(rl.hit('ip').allowed).toBe(true);
    expect(rl.hit('ip').allowed).toBe(true);
    const blocked = rl.hit('ip');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBe(1);
    expect(rl.hit('autre-ip').allowed).toBe(true);
    t = 1000;
    expect(rl.hit('ip').allowed).toBe(true);
  });

  it('reset efface le compteur', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 1, now: () => 0 });
    rl.hit('ip');
    expect(rl.hit('ip').allowed).toBe(false);
    rl.reset('ip');
    expect(rl.hit('ip').allowed).toBe(true);
  });

  it('purge les entrées expirées quand la table grossit', () => {
    let t = 0;
    const rl = createRateLimiter({ windowMs: 10, max: 1, now: () => t });
    for (let i = 0; i < 1001; i++) rl.hit(`ip${i}`);
    t = 100;
    expect(rl.hit('ip0').allowed).toBe(true);
  });

  it('utilise Date.now par défaut', () => {
    const rl = createRateLimiter({ windowMs: 1000, max: 1 });
    expect(rl.hit('x').allowed).toBe(true);
  });
});
