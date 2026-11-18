import { checkPassword, sessionCookie, clearCookie, hasPassword } from './_lib/auth.js';

const fails = new Map(); // best-effort throttle per instance

function ip(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || '').split(',')[0].trim();
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearCookie());
    return res.status(200).json({ ok: true });
  }
  if (req.method !== 'POST') return res.status(405).end();
  if (!hasPassword()) return res.status(503).json({ error: 'no_password' });

  const key = ip(req);
  const f = fails.get(key) || { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 15 * 60 * 1000) {
    return res.status(429).json({ error: 'te_veel_pogingen' });
  }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
  const pw = body && body.password;
  if (!checkPassword(pw)) {
    fails.set(key, { n: f.n + 1, t: Date.now() });
    await new Promise((r) => setTimeout(r, 700));
    return res.status(401).json({ error: 'onjuist' });
  }
  fails.delete(key);
  res.setHeader('Set-Cookie', sessionCookie());
  return res.status(200).json({ ok: true });
}
