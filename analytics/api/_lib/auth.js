import crypto from 'node:crypto';

const COOKIE = 'sfa_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function password() {
  return process.env.ANALYTICS_PASSWORD || '';
}

// The signing secret is derived from the password unless AUTH_SECRET is set,
// so changing the password signs everybody out.
function secret() {
  return process.env.AUTH_SECRET ||
    crypto.createHash('sha256').update('sfa:' + password()).digest('hex');
}

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return body + '.' + mac;
}

function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const want = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  const a = Buffer.from(mac || '');
  const b = Buffer.from(want);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}

function cookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > 0) out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}

export function isAuthed(req) {
  if (!password()) return false;
  return !!verify(cookies(req)[COOKIE]);
}

export function checkPassword(input) {
  const pw = password();
  if (!pw || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(pw).digest();
  return crypto.timingSafeEqual(a, b);
}

export function sessionCookie() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const secure = process.env.SFA_ALLOW_LOCAL === '1' ? '' : ' Secure;';
  return `${COOKIE}=${encodeURIComponent(sign({ exp }))}; Path=/; HttpOnly;${secure} SameSite=Strict; Max-Age=${MAX_AGE}`;
}

export function clearCookie() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function hasPassword() {
  return !!password();
}
