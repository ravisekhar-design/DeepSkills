import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH  = 12; // 96-bit IV recommended for GCM
const SALT       = 'nexus-api-keys-v1';
const ENC_PREFIX = 'enc:';

function deriveKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.ENCRYPTION_KEY ?? '';
  // scryptSync is synchronous and deterministic — safe to call per-encrypt/decrypt
  return scryptSync(secret || 'dev-insecure-placeholder', SALT, 32);
}

/**
 * Encrypt a plain-text API key with AES-256-GCM.
 * Output format: `enc:<iv_hex>:<tag_hex>:<ciphertext_hex>`
 */
export function encryptApiKey(plaintext: string): string {
  if (!plaintext) return '';
  const key       = deriveKey();
  const iv        = randomBytes(IV_LENGTH);
  const cipher    = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag       = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an API key encrypted by encryptApiKey.
 * Gracefully handles legacy plain-text values by returning them as-is.
 */
export function decryptApiKey(value: string): string {
  if (!value) return '';
  if (!value.startsWith(ENC_PREFIX)) return value; // legacy plain text — pass through
  try {
    const rest      = value.slice(ENC_PREFIX.length);
    const [ivHex, tagHex, encHex] = rest.split(':');
    const key       = deriveKey();
    const iv        = Buffer.from(ivHex, 'hex');
    const tag       = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher  = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  } catch {
    return ''; // decryption failed — treat as unset (avoids crashes on tampered/rotated keys)
  }
}

/**
 * Sentinel value returned to the browser when a key is already saved.
 * The real key is never sent over the wire — only this opaque marker.
 */
export const CONFIGURED_SENTINEL = '__CONFIGURED__';
