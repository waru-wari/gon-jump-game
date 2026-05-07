/**
 * lib/crypto.js
 * HMAC-SHA256 sign/verify + sha256 email hashing.
 * Uses the Web Crypto API (available in Node 20+ and Vercel Edge/Serverless).
 * NEVER logs plaintext email — all hashing happens here and the hash is what
 * gets stored in KV.
 */

/**
 * Convert a string to an ArrayBuffer.
 * @param {string} str
 * @returns {ArrayBuffer}
 */
function enc(str) {
  return new TextEncoder().encode(str);
}

/**
 * Convert an ArrayBuffer to a lowercase hex string.
 * @param {ArrayBuffer} buf
 * @returns {string}
 */
function hex(buf) {
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Import a raw key string as an HMAC-SHA256 CryptoKey.
 * @param {string} secret
 * @returns {Promise<CryptoKey>}
 */
async function importHmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    enc(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * Produce an HMAC-SHA256 hex signature for `data` using `secret`.
 * Used by the client to sign score submissions, and by the server to verify.
 *
 * @param {string} data   — pipe-delimited payload, e.g. "2450|3|tok_abc123"
 * @param {string} secret — SESSION_HMAC_SECRET env var
 * @returns {Promise<string>} hex signature
 */
export async function hmacSign(data, secret) {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc(data));
  return hex(sig);
}

/**
 * Verify an HMAC-SHA256 signature. Returns true only if valid.
 * Uses subtle.verify (constant-time) to prevent timing attacks.
 *
 * @param {string} data
 * @param {string} signature  hex string from client
 * @param {string} secret
 * @returns {Promise<boolean>}
 */
export async function hmacVerify(data, signature, secret) {
  try {
    const key = await importHmacKey(secret);
    const sigBuf = Uint8Array.from(
      signature.match(/.{2}/g).map(b => parseInt(b, 16)),
    );
    return crypto.subtle.verify('HMAC', key, sigBuf, enc(data));
  } catch {
    return false;
  }
}

/**
 * sha256 hash of a normalised email address.
 * Normalise = lowercase + trim. Plaintext email is never stored.
 *
 * @param {string} email
 * @returns {Promise<string>} 64-char hex string
 */
export async function emailHash(email) {
  const normalised = email.toLowerCase().trim();
  const buf = await crypto.subtle.digest('SHA-256', enc(normalised));
  return hex(buf);
}

/**
 * Generate a cryptographically random token string (URL-safe base64, no padding).
 * Used for session tokens.
 *
 * @param {number} [bytes=32]
 * @returns {string}
 */
export function randomToken(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}
