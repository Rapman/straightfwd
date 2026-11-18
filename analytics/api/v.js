// Beacon collector: POST /api/v  (text/plain JSON, sent by /s.js)
import { db, ensureSchema } from './_lib/db.js';
import { isBot, parseUA } from './_lib/ua.js';
import { allowedHost, classifyChannel, goalFor, normPath, pageGroup } from './_lib/config.js';

const TYPES = new Set(['pageview', 'event', 'engage', 'vital']);
const VITALS = new Set(['LCP', 'INP', 'CLS', 'FCP', 'TTFB']);
const ID = /^[a-z0-9-]{6,40}$/i;

const str = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

function cleanUtm(u) {
  if (!u || typeof u !== 'object') return {};
  const o = {};
  for (const k of ['source', 'medium', 'campaign', 'content', 'term']) {
    const v = str(u[k], 100);
    if (v) o[k] = v.toLowerCase();
  }
  if (u.gclid) o.gclid = 1;
  if (u.li) o.li = 1;
  if (u.fb) o.fb = 1;
  return o;
}

function cleanMeta(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null;
  const out = {};
  for (const [k, v] of Object.entries(m).slice(0, 20)) {
    if (typeof v === 'string') out[k.slice(0, 20)] = v.slice(0, 200);
    else if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 20)] = v;
    else if (typeof v === 'boolean') out[k.slice(0, 20)] = v ? 1 : 0;
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      const inner = {};
      for (const [k2, v2] of Object.entries(v).slice(0, 24)) {
        if (typeof v2 === 'string' || typeof v2 === 'number') inner[k2.slice(0, 30)] = String(v2).slice(0, 80);
        else if (v2 && typeof v2 === 'object') inner[k2.slice(0, 30)] = JSON.stringify(v2).slice(0, 120);
      }
      out[k.slice(0, 20)] = inner;
    }
  }
  return Object.keys(out).length ? out : null;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && allowedHost(hostOf(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Max-Age', '86400');
}

async function rawBody(req) {
  if (typeof req.body === 'string') return req.body;
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8');
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 64000) req.destroy(); });
    req.on('end', () => resolve(data));
    req.on('error', () => resolve(''));
  });
}

export default async function handler(req, res) {
  cors(req, res);
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Via de first-party proxy op straightfwd.nl/api/sfa: vertrouw de doorgegeven headers alleen met het gedeelde geheim
  const viaProxy = !!process.env.SFA_PROXY_SECRET && req.headers['x-sfa-proxy'] === process.env.SFA_PROXY_SECRET;
  const H = (k) => (viaProxy ? req.headers['x-sfa-' + k] : null);
  const ua = (viaProxy ? H('ua') : req.headers['user-agent']) || '';
  const src = viaProxy ? hostOf(H('origin') || '') : (hostOf(req.headers.origin || '') || hostOf(req.headers.referer || ''));
  if (!allowedHost(src) || isBot(ua)) return res.status(204).end();

  let body;
  try { body = JSON.parse(await rawBody(req)); } catch { return res.status(400).end(); }
  let site = String(body.s || '').replace(/^www\./, '').toLowerCase();
  if (process.env.SFA_ALLOW_LOCAL === '1' && /^(localhost|127\.0\.0\.1)$/.test(site)) site = process.env.SFA_DEV_SITE || 'straightfwd.nl';
  if (site !== src && !(process.env.SFA_ALLOW_LOCAL === '1' && /^(localhost|127)/.test(src))) {
    return res.status(204).end();
  }
  const list = Array.isArray(body.e) ? body.e.slice(0, 40) : [];
  if (!list.length) return res.status(204).end();

  const { device, browser, os } = parseUA(ua);
  const country = str(viaProxy ? H('country') : req.headers['x-vercel-ip-country'], 4);
  const region = str(viaProxy ? H('region') : req.headers['x-vercel-ip-country-region'], 8);
  let city = (viaProxy ? H('city') : req.headers['x-vercel-ip-city']) || null;
  try { city = city ? decodeURIComponent(city).slice(0, 60) : null; } catch { city = null; }

  const rows = [];
  for (const e of list) {
    if (!e || !TYPES.has(e.t)) continue;
    if (!ID.test(String(e.si || '')) || !ID.test(String(e.v || ''))) continue;
    const name = str(e.n, 40);
    if ((e.t === 'event' || e.t === 'vital') && !name) continue;
    if (e.t === 'vital' && !VITALS.has(name)) continue;

    const meta = cleanMeta(e.m) || {};
    const utm = cleanUtm(e.u);
    const ref = str(e.r, 100)?.toLowerCase().replace(/^www\./, '') || null;
    const path = normPath(e.p);
    const notFound = e.t === 'pageview' && meta.nf === 1;
    const pgroup = pageGroup(path, notFound);

    // First-touch attribution for conversions
    if (meta.ft && typeof meta.ft === 'object') {
      const f = meta.ft;
      meta.ftc = classifyChannel(String(f.r || ''), { source: f.us, medium: f.um, campaign: f.uc });
      meta.ftl = normPath(f.p);
      if (f.uc) meta.ftk = String(f.uc).slice(0, 80);
      delete meta.ft;
    }

    const ev = {
      type: e.t, name, label: str(e.lb, 160), meta,
    };
    const goal = goalFor(ev, pgroup);

    rows.push({
      site,
      type: e.t,
      name,
      path,
      title: str(e.ti, 150),
      pv: ID.test(String(e.pv || '')) ? e.pv : null,
      sid: e.si,
      vid: e.v,
      is_new: e.nw === 1 ? true : e.nw === 0 ? false : null,
      consent: e.cm === 1 ? true : e.cm === 0 ? false : null,
      ref,
      channel: classifyChannel(ref, utm),
      utm_source: utm.source || null,
      utm_medium: utm.medium || null,
      utm_campaign: utm.campaign || null,
      utm_content: utm.content || null,
      utm_term: utm.term || null,
      landing: e.lp ? normPath(e.lp) : null,
      country,
      region,
      city,
      device,
      browser,
      os,
      screen: str(e.sc, 12),
      lang: str(e.la, 10)?.toLowerCase() || null,
      pgroup,
      goal,
      val: num(e.val),
      label: ev.label,
      meta: Object.keys(meta).length ? meta : null,
    });
  }
  if (!rows.length) return res.status(204).end();

  const sql = db();
  if (!sql) return res.status(204).end();
  try {
    await ensureSchema();
    await sql`insert into events ${sql(rows,
      'site', 'type', 'name', 'path', 'title', 'pv', 'sid', 'vid', 'is_new', 'consent', 'ref', 'channel',
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'landing',
      'country', 'region', 'city', 'device', 'browser', 'os', 'screen', 'lang',
      'pgroup', 'goal', 'val', 'label', 'meta')}`;
  } catch (err) {
    console.error('collect failed', err.message);
    return res.status(500).end();
  }
  return res.status(204).end();
}
