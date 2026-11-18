// Annotations on the timeline: POST {site, day, text}  DELETE ?id=
import { db, ensureSchema } from './_lib/db.js';
import { isAuthed } from './_lib/auth.js';
import { SITES } from './_lib/config.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthed(req)) return res.status(401).json({ error: 'auth' });
  const sql = db();
  if (!sql) return res.status(200).json({ error: 'no_database' });
  await ensureSchema();
  if (req.method === 'POST') {
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { b = {}; } }
    const site = SITES[b.site] ? b.site : 'straightfwd.nl';
    const day = /^\d{4}-\d{2}-\d{2}$/.test(b.day || '') ? b.day : null;
    const text = typeof b.text === 'string' ? b.text.trim().slice(0, 140) : '';
    if (!day || !text) return res.status(400).json({ error: 'invalid' });
    const [r] = await sql`insert into notes (site, day, text) values (${site}, ${day}, ${text}) returning id`;
    return res.status(200).json({ id: Number(r.id) });
  }
  if (req.method === 'DELETE') {
    const id = parseInt((req.query || {}).id, 10);
    if (!id) return res.status(400).json({ error: 'invalid' });
    await sql`delete from notes where id = ${id}`;
    return res.status(200).json({ ok: true });
  }
  return res.status(405).end();
}
