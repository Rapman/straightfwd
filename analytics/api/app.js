// Serves the dashboard shell only to signed-in users.
import fs from 'node:fs';
import path from 'node:path';
import { isAuthed } from './_lib/auth.js';

let html = null;
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthed(req)) {
    res.setHeader('Location', '/login');
    return res.status(302).end();
  }
  if (!html) html = fs.readFileSync(path.join(process.cwd(), 'private', 'dashboard.html'), 'utf8');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(html);
}
