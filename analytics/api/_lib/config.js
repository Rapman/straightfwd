// Straightfwd Analytics — site configuration.
// Page groups, channels and goals are classified at write time so the
// dashboard queries stay simple and fast.

export const SITES = {
  'straightfwd.nl': { label: 'straightfwd.nl' },
  'software.straightfwd.nl': { label: 'software.straightfwd.nl' },
};

// Hosts a beacon may come from (Origin / Referer). localhost only in dev.
export function allowedHost(h) {
  if (!h) return false;
  if (SITES[h]) return true;
  if (process.env.SFA_ALLOW_LOCAL === '1' && /^(localhost|127\.0\.0\.1)$/.test(h)) return true;
  return false;
}

export const TZ = 'Europe/Amsterdam';

// ---- Page groups -----------------------------------------------------------
export const SERVICE_GROUPS = [
  'Werving & selectie',
  'Freelance recruiter',
  'Sourcing',
  'Employer branding',
  'Recruitment marketing',
];
export const CANDIDATE_GROUPS = ['Vacatures', 'Vacature', 'Fwd Match'];

const GROUP_RULES = [
  [/^\/$/, 'Home'],
  [/^\/werving-en-selectie/, 'Werving & selectie'],
  [/^\/freelance/, 'Freelance recruiter'],
  [/^\/sourcing/, 'Sourcing'],
  [/^\/employer-branding/, 'Employer branding'],
  [/^\/recruitment-marketing/, 'Recruitment marketing'],
  [/^\/vacatures\/?$/, 'Vacatures'],
  [/^\/vacatures\/.+/, 'Vacature'],
  [/^\/(cv-uploaden|fwd-match)/, 'Fwd Match'],
  [/^\/over-ons/, 'Over ons'],
  [/^\/contact/, 'Contact'],
  [/^\/(privacy|voorwaarden|cookie)/, 'Juridisch'],
];

export function pageGroup(path, notFound) {
  if (notFound) return 'Niet gevonden';
  for (const [re, g] of GROUP_RULES) if (re.test(path || '')) return g;
  return 'Overig';
}

export function normPath(p) {
  if (!p || typeof p !== 'string') return '/';
  p = p.split('?')[0].split('#')[0];
  try { p = decodeURIComponent(p); } catch {}
  p = p.replace(/\/index(\.html?)?$/i, '/').replace(/\.html?$/i, '');
  if (p.length > 1) p = p.replace(/\/+$/, '');
  if (!p.startsWith('/')) p = '/' + p;
  return p.toLowerCase().slice(0, 200);
}

// ---- Channels --------------------------------------------------------------
const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|yahoo\.[a-z.]+|startpage\.com|search\.brave\.com|qwant\.com|baidu\.com|yandex\.[a-z.]+|kagi\.com)$/i;
const AI = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|gemini\.google\.com|bard\.google\.com|copilot\.microsoft\.com|claude\.ai|you\.com|phind\.com|poe\.com|meta\.ai|mistral\.ai|chat\.mistral\.ai|deepseek\.com|grok\.com)$/i;
const LINKEDIN = /(^|\.)(linkedin\.com|lnkd\.in|linkedin\.android|com\.linkedin\.android)$/i;
const SOCIAL = /(^|\.)(facebook\.com|fb\.com|m\.facebook\.com|l\.facebook\.com|instagram\.com|l\.instagram\.com|t\.co|x\.com|twitter\.com|tiktok\.com|youtube\.com|youtu\.be|whatsapp\.com|wa\.me|reddit\.com|pinterest\.[a-z.]+|threads\.net|bsky\.app|snapchat\.com|com\.whatsapp)$/i;
const JOBBOARD = /(^|\.)(indeed\.[a-z.]+|nationalevacaturebank\.nl|werkzoeken\.nl|jobbird\.com|monsterboard\.nl|glassdoor\.[a-z.]+|werk\.nl|intermediair\.nl|jobat\.be|stepstone\.[a-z.]+|jooble\.org|careerjet\.[a-z.]+|vacatures\.nl|jobrapido\.com|werkenbijdeoverheid\.nl|tweakers\.net)$/i;
const EMAIL = /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|outlook\.office365\.com|mail\.yahoo\.com|webmail\.|mail\.)/i;
const OWN = /(^|\.)(straightfwd\.nl|join-irl\.com|schoolplein\.io)$/i;

export const CHANNELS = [
  'Direct', 'Zoekmachine', 'LinkedIn', 'AI-assistent', 'Social (overig)',
  'Jobboards', 'E-mail', 'Betaald', 'Eigen sites', 'Verwijzing',
];

export function classifyChannel(ref, utm) {
  const u = utm || {};
  const src = (u.source || '').toLowerCase();
  const med = (u.medium || '').toLowerCase();
  const r = (ref || '').toLowerCase();
  if (/^(cpc|ppc|paid|paidsearch|paid_social|paidsocial|display|ads?|sponsored|cpm)$/.test(med) || u.gclid || u.li) return 'Betaald';
  if (/^(e-?mail|newsletter|nieuwsbrief|mailing)$/.test(med) || /^(e-?mail|newsletter|nieuwsbrief|gmail|outlook)$/.test(src)) return 'E-mail';
  if (/linkedin|lnkd/.test(src) || LINKEDIN.test(r)) return 'LinkedIn';
  if (/chatgpt|openai|perplexity|gemini|copilot|claude/.test(src) || AI.test(r)) return 'AI-assistent';
  if (/indeed|jobbird|nationalevacaturebank|werkzoeken|monsterboard|glassdoor|stepstone|jooble/.test(src) || JOBBOARD.test(r)) return 'Jobboards';
  if (/^(social|social-media|socialmedia|organic_social)$/.test(med) || /facebook|instagram|tiktok|twitter|whatsapp|youtube/.test(src) || SOCIAL.test(r)) return 'Social (overig)';
  if (SEARCH.test(r) || /^(organic|seo)$/.test(med) || /^(google|bing)$/.test(src)) return 'Zoekmachine';
  if (EMAIL.test(r)) return 'E-mail';
  if (OWN.test(r)) return 'Eigen sites';
  if (r || src) return 'Verwijzing';
  return 'Direct';
}

// ---- Goals -----------------------------------------------------------------
// Returns a goal key (or null) for an incoming event.
export function goalFor(ev, pgroup) {
  const { type, name, label = '', meta = {} } = ev;
  if (type !== 'event') return null;
  const lb = String(label || '');
  if (name === 'form_result') {
    if (String(meta.ok) !== '1') return 'form_fout';
    return isCandidateLead(ev, pgroup) ? 'lead_kandidaat' : 'lead_opdrachtgever';
  }
  if (name === 'click') {
    const k = meta.k, h = String(meta.h || '');
    if (k === 'mailto') return 'mail';
    if (k === 'tel') return 'bellen';
    if (k === 'download') return /diensten|onepager/i.test(h) ? 'onepager' : 'download';
    if ((k === 'social' || k === 'outbound') && /linkedin\.com|lnkd\.in/i.test(h)) return 'linkedin';
    if (k === 'outbound' && /software\.straightfwd\.nl/i.test(h)) return 'software';
    if (/deel deze vacature|delen|share/i.test(lb)) return 'gedeeld';
    if (/kennismak|plan een gesprek|afspraak/i.test(lb)) return 'kennismaking_klik';
    if (/leg je vacature voor|vacature voorleggen/i.test(lb)) return 'vacature_voorleggen_klik';
  }
  return null;
}

function isCandidateLead(ev, pgroup) {
  const m = ev.meta || {};
  const u = String(m.u || '');
  if (/\/api\/cv/i.test(u)) return true;
  if (CANDIDATE_GROUPS.includes(pgroup)) return true;
  if (/vac/i.test(String(ev.label || ''))) return true;
  const choices = m.c && typeof m.c === 'object' ? Object.values(m.c).join(' ') : '';
  if (/werken bij straightfwd|kandidaat|sollicit/i.test(choices)) return true;
  if (String(m.file) === '1') return true;
  return false;
}

export const GOAL_LABELS = {
  lead_opdrachtgever: 'Lead opdrachtgever',
  lead_kandidaat: 'Lead kandidaat',
  form_fout: 'Formulier mislukt',
  kennismaking_klik: 'Klik op kennismaking',
  vacature_voorleggen_klik: 'Klik op vacature voorleggen',
  mail: 'Klik op e-mailadres',
  bellen: 'Klik op telefoonnummer',
  onepager: 'Onepager gedownload',
  download: 'Download',
  linkedin: 'Klik naar LinkedIn',
  software: 'Klik naar Straightfwd Software',
  gedeeld: 'Vacature/pagina gedeeld',
};

// Web Vitals thresholds (good, poor) — web.dev
export const VITALS = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  FCP: [1800, 3000],
  TTFB: [800, 1800],
};
