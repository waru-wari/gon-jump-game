/**
 * lib/email.js
 * Email validation, censoring, and disposable-domain blocklist.
 * PDPA requirement: never display raw email publicly.
 */

/**
 * Disposable / throwaway email domains to block.
 * Extend this list as new services appear.
 */
const BLOCKLIST = new Set([
  'mailinator.com',
  '10minutemail.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'guerrillamail.info',
  'yopmail.com',
  'throwaway.email',
  'sharklasers.com',
  'trashmail.com',
  'trashmail.net',
  'trashmail.me',
  'fakeinbox.com',
  'mailnull.com',
  'spamgourmet.com',
  'dispostable.com',
  'maildrop.cc',
  'getairmail.com',
  'mailexpire.com',
  'wegwerfmail.de',
  'filzmail.com',
  'spambox.us',
  'spamoff.de',
  'tempr.email',
  'discard.email',
  'anonbox.net',
  'spam4.me',
  'binkmail.com',
  'bobmail.info',
  'dayrep.com',
  'einrot.com',
  'fleckens.hu',
  'spamgob.com',
  'spamherelots.com',
]);

/**
 * Validate an email address:
 *  - basic format check
 *  - not from a known disposable domain
 *
 * @param {string} email
 * @returns {boolean}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const lower = email.toLowerCase().trim();
  // RFC-lightweight check — good enough for a game leaderboard
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!re.test(lower)) return false;
  const domain = lower.split('@')[1];
  return !BLOCKLIST.has(domain);
}

/**
 * Censor an email for public display (PDPA-compliant).
 *
 * Rules (from spec):
 *   local.length ≤ 2  →  "{first}*@{domain}"
 *   local.length > 2  →  "{first}{'*'×(len-2)}{last}@{domain}"
 *
 * Examples:
 *   "john@gofive.co.th"     → "j**n@gofive.co.th"
 *   "creative@gofive.co.th" → "c******e@gofive.co.th"
 *   "jo@gofive.co.th"       → "j*@gofive.co.th"
 *
 * @param {string} email
 * @returns {string}
 */
export function censorEmail(email) {
  if (!email || typeof email !== 'string') return '****';
  const parts = email.toLowerCase().trim().split('@');
  if (parts.length !== 2 || !parts[1]) return '****';
  const [local, domain] = parts;
  if (local.length <= 1) return `${local}*@${domain}`;
  if (local.length <= 2) return `${local[0]}*@${domain}`;
  return `${local[0]}${'*'.repeat(local.length - 2)}${local[local.length - 1]}@${domain}`;
}
