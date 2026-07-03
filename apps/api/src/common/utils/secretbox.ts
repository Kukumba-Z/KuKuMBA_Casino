import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * At-rest encryption for third-party credentials (aggregator API keys, webhook
 * secrets). AES-256-GCM with a key from the PROVIDER_SECRETS_KEY env var
 * (32 random bytes, base64). Fails closed: without a valid key nothing is ever
 * stored in plaintext — writes throw instead.
 *
 * Box format: `v1:<iv b64>:<auth tag b64>:<ciphertext b64>`.
 */
const VERSION = 'v1';

function loadKey(): Buffer {
  const raw = process.env.PROVIDER_SECRETS_KEY;
  if (!raw) throw new Error('PROVIDER_SECRETS_KEY_MISSING');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PROVIDER_SECRETS_KEY_INVALID');
  return key;
}

export function encryptSecret(plain: string): string {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptSecret(box: string): string {
  const key = loadKey();
  const [version, ivB64, tagB64, ctB64] = box.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || !ctB64) throw new Error('SECRET_BOX_MALFORMED');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/** Non-reversible display form: last 4 characters, rest hidden. */
export function maskSecret(plain: string): string {
  return plain.length <= 4 ? '••••' : `••••${plain.slice(-4)}`;
}
