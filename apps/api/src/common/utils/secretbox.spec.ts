import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, maskSecret } from './secretbox';

describe('secretbox (provider credential encryption)', () => {
  const KEY = randomBytes(32).toString('base64');
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.PROVIDER_SECRETS_KEY;
    process.env.PROVIDER_SECRETS_KEY = KEY;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.PROVIDER_SECRETS_KEY;
    else process.env.PROVIDER_SECRETS_KEY = saved;
  });

  it('round-trips a secret', () => {
    const box = encryptSecret('sk_live_abc123');
    expect(box.startsWith('v1:')).toBe(true);
    expect(box).not.toContain('sk_live_abc123');
    expect(decryptSecret(box)).toBe('sk_live_abc123');
  });

  it('produces a different box each time (random IV) that still decrypts', () => {
    const a = encryptSecret('same-secret');
    const b = encryptSecret('same-secret');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe('same-secret');
    expect(decryptSecret(b)).toBe('same-secret');
  });

  it('fails closed when the key is missing', () => {
    delete process.env.PROVIDER_SECRETS_KEY;
    expect(() => encryptSecret('x')).toThrow('PROVIDER_SECRETS_KEY_MISSING');
    expect(() => decryptSecret('v1:a:b:c')).toThrow('PROVIDER_SECRETS_KEY_MISSING');
  });

  it('rejects a key of the wrong size', () => {
    process.env.PROVIDER_SECRETS_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptSecret('x')).toThrow('PROVIDER_SECRETS_KEY_INVALID');
  });

  it('rejects tampered ciphertext (GCM auth)', () => {
    const box = encryptSecret('secret');
    const parts = box.split(':');
    const ct = Buffer.from(parts[3], 'base64');
    ct[0] ^= 0xff;
    parts[3] = ct.toString('base64');
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('rejects a malformed box', () => {
    expect(() => decryptSecret('nonsense')).toThrow('SECRET_BOX_MALFORMED');
  });

  it('masks all but the last 4 characters', () => {
    expect(maskSecret('sk_live_abc123')).toBe('••••c123');
    expect(maskSecret('ab')).toBe('••••');
  });
});
