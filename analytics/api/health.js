import { db, ensureSchema } from './_lib/db.js';
import { hasPassword } from './_lib/auth.js';
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const out = { database: false, password: hasPassword() };
  try { if (db()) { await ensureSchema(); out.database = true; } } catch (e) { out.dbError = String(e.message).slice(0, 120); }
  res.status(200).json(out);
}
