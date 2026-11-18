/*! Straightfwd Analytics — first-party, geen cookies, geen IP-opslag. */
(function () {
  'use strict';
  var w = window, d = document, n = navigator, L = location;
  if (w.__sfa) return;
  w.__sfa = 1;
  w.sfTrack = function () {};

  var cs = d.currentScript;
  var attr = function (k) { return cs && cs.getAttribute(k); };
  var API = attr('data-api') || 'https://analytics.straightfwd.nl/api/v';
  var DEBUG = cs && cs.hasAttribute('data-debug');
  var REQUIRE_CONSENT = cs && cs.hasAttribute('data-require-consent');
  var host = L.hostname.replace(/^www\./, '').toLowerCase();

  // ---- gedeelde helpers (meten én heatmap-weergave) ----------------------------
  function docSize() {
    var de = d.documentElement, b = d.body;
    return {
      w: Math.max(de.scrollWidth, b ? b.scrollWidth : 0, w.innerWidth) || 1,
      h: Math.max(de.scrollHeight, b ? b.scrollHeight : 0, w.innerHeight) || 1
    };
  }
  function r3(v, p) { var f = Math.pow(10, p || 3); return Math.round(v * f) / f; }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  // Stabiele CSS-selector voor een element (id of nth-of-type-pad vanaf body)
  function selOf(el) {
    var parts = [], cur = el, guard = 0;
    while (cur && cur.nodeType === 1 && guard++ < 16) {
      if (cur === d.body) { parts.unshift('body'); break; }
      if (cur.id && /^[A-Za-z][\w-]{0,40}$/.test(cur.id)) { parts.unshift('#' + cur.id); break; }
      var tag = cur.tagName.toLowerCase(), i = 1, sb = cur;
      while ((sb = sb.previousElementSibling)) if (sb.tagName === cur.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
      cur = cur.parentElement;
    }
    var s = parts.join('>');
    return s.length <= 200 ? s : '';
  }
  function txt(el, max) { return ((el && (el.innerText || el.textContent)) || '').replace(/\s+/g, ' ').trim().slice(0, max); }
  // Inhoudsblokken van de pagina (voor aandacht per sectie)
  function sections() {
    var all = Array.prototype.slice.call(d.querySelectorAll('[data-sf-section],section,footer'));
    var top = all.filter(function (s) { return !all.some(function (o) { return o !== s && o.contains(s); }); });
    if (top.length < 2) {
      var m = d.querySelector('main') || d.body;
      top = Array.prototype.slice.call(m ? m.children : []);
    }
    var seen = {}, out = [];
    top.forEach(function (s, i) {
      if (!s.getBoundingClientRect || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|HEADER|NAV)$/.test(s.tagName) || /^sfa-/.test(s.id || '')) return;
      var r = s.getBoundingClientRect();
      if (r.height < 100) return;
      try { var cp = getComputedStyle(s).position; if (cp === 'fixed' || cp === 'sticky') return; } catch (e) {}
      var h = s.querySelector('h1,h2,h3');
      var k = s.getAttribute('data-sf-section') || txt(h, 28) || (s.tagName === 'FOOTER' ? 'Footer' : s.id ? '#' + s.id : 'Blok ' + (out.length + 1));
      k = k.slice(0, 30);
      if (seen[k]) k = (k.slice(0, 26) + ' ' + (++seen[k])); else seen[k] = 1;
      out.push({ k: k, el: s });
    });
    return out.slice(0, 22);
  }

  // ---- heatmap-weergave: deze pagina staat in het dashboard (iframe) -----------
  var framed = false;
  try { framed = w.top !== w; } catch (e) { framed = true; }
  if (framed) { if (/[?&]sf_hm=/.test(L.search)) overlay(); return; }

  function store(persist) { try { return persist ? w.localStorage : w.sessionStorage; } catch (e) { return null; } }
  function get(k, persist) { try { return store(persist).getItem(k); } catch (e) { return null; } }
  function set(k, v, persist) { try { if (v === null) store(persist).removeItem(k); else store(persist).setItem(k, v); } catch (e) {} }

  // ---- opt-out (sf_ignore=1 in de URL sluit dit apparaat uit) ---------------
  var qs;
  try { qs = new URLSearchParams(L.search); } catch (e) { qs = { get: function () { return null; }, has: function () { return false; } }; }
  if (qs.has('sf_ignore')) set('sf_ignore', qs.get('sf_ignore') === '0' ? null : '1', true);
  if (get('sf_ignore', true) === '1') { if (DEBUG) console.log('[sfa] uitgesloten'); return; }
  if (!DEBUG && (n.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|gtmetrix|preview/i.test(n.userAgent || ''))) return;
  if (!DEBUG && L.protocol !== 'https:') return;

  // ---- toestemming (Cookiebot): met statistiek-toestemming bewaren we een
  // anonieme bezoekers-ID in localStorage, zonder alleen voor dit tabblad. ----
  function consent() {
    var cb = w.Cookiebot;
    if (cb && cb.consent) return !!cb.consent.statistics;
    if (cb) return false;
    return true; // geen consent-tool aanwezig
  }
  var CM = consent();
  if (REQUIRE_CONSENT && !CM) return;

  function rid() {
    try { if (w.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '').slice(0, 20); } catch (e) {}
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).slice(0, 20);
  }
  function normPath(p) {
    p = (p || '/').replace(/\/index(\.html?)?$/i, '/').replace(/\.html?$/i, '');
    if (p.length > 1) p = p.replace(/\/+$/, '');
    return p || '/';
  }
  function path() { return normPath(L.pathname); }
  function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return ''; } }
  function short(u) { try { var x = new URL(u, L.href); return (x.hostname.replace(/^www\./, '') === host ? '' : x.hostname.replace(/^www\./, '')) + x.pathname; } catch (e) { return String(u || '').slice(0, 120); } }
  function jget(k, p) { try { return JSON.parse(get(k, p) || 'null'); } catch (e) { return null; } }

  var now = Date.now();
  var P = CM; // persistent?

  // ---- bezoeker ---------------------------------------------------------------
  var vid = get('sf_v', P);
  if (!vid) { vid = rid(); set('sf_v', vid, P); }

  // ---- bron van dit bezoek ----------------------------------------------------
  var ref = '';
  try { var rh = d.referrer ? hostOf(d.referrer) : ''; if (rh && rh !== host) ref = rh; } catch (e) {}
  var utm = {};
  ['source', 'medium', 'campaign', 'content', 'term'].forEach(function (k) { var v = qs.get('utm_' + k); if (v) utm[k] = v.slice(0, 100); });
  if (qs.get('gclid')) utm.gclid = 1;
  if (qs.get('li_fat_id')) utm.li = 1;
  if (qs.get('fbclid')) utm.fb = 1;

  // ---- sessie (30 min inactiviteit, of nieuwe campagne/bron) ------------------
  var S = jget('sf_s', P);
  var expired = !S || now - S.l > 30 * 60 * 1000 ||
    (utm.campaign && (!S.u || S.u.campaign !== utm.campaign)) ||
    (ref && S.r !== ref && now - S.l > 60 * 1000);
  if (expired) {
    var c = parseInt(get('sf_c', P) || '0', 10) + 1;
    set('sf_c', String(c), P);
    S = { i: rid(), s: now, l: now, r: ref, u: utm, p: path(), c: c };
  }
  S.l = now;
  function saveS() { set('sf_s', JSON.stringify(S), P); }
  saveS();

  // ---- first touch (voor lead-attributie) -------------------------------------
  var FT = jget('sf_f', P);
  if (!FT) { FT = { r: S.r || '', us: (S.u && S.u.source) || '', um: (S.u && S.u.medium) || '', uc: (S.u && S.u.campaign) || '', p: S.p, t: S.s }; set('sf_f', JSON.stringify(FT), P); }

  // ---- verzenden --------------------------------------------------------------
  var Q = [], timer = null;
  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    while (Q.length) {
      var body = JSON.stringify({ s: host, e: Q.splice(0, 25) });
      if (DEBUG) console.log('[sfa]', JSON.parse(body));
      var ok = false;
      try { if (n.sendBeacon) ok = n.sendBeacon(API, new Blob([body], { type: 'text/plain' })); } catch (e) {}
      if (!ok) { try { origFetch(API, { method: 'POST', body: body, keepalive: true, mode: 'no-cors', headers: { 'Content-Type': 'text/plain' } }); } catch (e) {} }
    }
  }
  function send(ev, immediate) {
    Q.push(ev);
    S.l = Date.now(); saveS();
    if (immediate) flush();
    else if (!timer) timer = setTimeout(flush, 1500);
  }

  var pvId, curPath, active, lastAct = Date.now(), maxScroll, vSent, prevPath = '';
  function base(type, name) {
    return {
      t: type, n: name || null, p: curPath, ti: (d.title || '').slice(0, 140), pv: pvId,
      si: S.i, v: vid, nw: S.c === 1 ? 1 : 0, cm: CM ? 1 : 0, r: S.r || '', u: S.u, lp: S.p,
      sc: (w.screen ? screen.width + 'x' + screen.height : ''), la: (n.language || '').slice(0, 10)
    };
  }

  // ---- paginaweergave ---------------------------------------------------------
  var SEC = [], AT = {};
  function pageview() {
    curPath = path(); pvId = rid(); active = 0; lastEng = -1; maxScroll = 0; vSent = 0; FS = {}; AT = {}; SEC = [];
    scrollCalc();
    var ev = base('pageview');
    ev.m = { vw: w.innerWidth, vh: w.innerHeight };
    if (/niet gevonden|not found|(^|\D)404(\D|$)/i.test(d.title || '') || d.querySelector('meta[name="sf-404"]')) ev.m.nf = 1;
    if (prevPath) ev.m.prev = prevPath;
    send(ev, true);
    setTimeout(observeForms, 600);
    setTimeout(function () { try { SEC = sections(); } catch (e) { SEC = []; } }, 1200);
  }

  // ---- betrokkenheid: actieve tijd, scrolldiepte en aandacht per sectie --------
  ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'wheel'].forEach(function (t) {
    addEventListener(t, function () { lastAct = Date.now(); }, { passive: true, capture: true });
  });
  function attention() {
    var vh = w.innerHeight;
    for (var i = 0; i < SEC.length; i++) {
      var r = SEC[i].el.getBoundingClientRect();
      var vis = Math.min(r.bottom, vh) - Math.max(r.top, 0);
      if (vis > 0 && vis >= Math.min(r.height * 0.5, vh * 0.5)) AT[SEC[i].k] = (AT[SEC[i].k] || 0) + 1;
    }
  }
  setInterval(function () {
    if (d.visibilityState === 'visible' && Date.now() - lastAct < 30000) {
      active += 1000;
      try { attention(); } catch (e) {}
      // hartslag na 15 s en daarna elke minuut (vangt afgebroken sessies op mobiel op)
      if (active === 15000 || active % 60000 === 0) engage();
    }
  }, 1000);
  function scrollCalc() {
    var de = d.documentElement, h = docSize().h, vh = w.innerHeight;
    var pct = h <= vh ? 100 : Math.round(((w.scrollY || de.scrollTop) + vh) / h * 100);
    if (pct > maxScroll) maxScroll = Math.min(100, pct);
  }
  var st = 0;
  addEventListener('scroll', function () { if (!st) st = setTimeout(function () { st = 0; scrollCalc(); }, 250); }, { passive: true });

  var lastEng = -1;
  function engage(force) {
    if (!force && active === lastEng) return;
    lastEng = active;
    var ev = base('engage');
    ev.val = active;
    ev.m = { sc: maxScroll, vw: w.innerWidth, vh: w.innerHeight, dh: docSize().h };
    var ks = Object.keys(AT);
    if (ks.length) { var at = {}; ks.slice(0, 22).forEach(function (k) { at[k] = AT[k]; }); ev.m.at = at; }
    send(ev);
  }

  // ---- klikken (incl. posities voor de heatmap) --------------------------------
  var SOCIAL = /(linkedin\.com|lnkd\.in|instagram\.com|facebook\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|wa\.me|whatsapp\.com|threads\.net)$/i;
  function label(el) {
    if (!el) return '';
    var t = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('data-sf-label'));
    if (!t) {
      t = (el.innerText || el.textContent || el.value || el.title || '').replace(/\s+/g, ' ').trim();
      var m = t.match(/^(.+?)\s*\1$/); // knoppen met dubbele tekst-animatie
      if (m) t = m[1];
      if (!t) { var img = el.querySelector && el.querySelector('img[alt]'); if (img) t = img.alt; }
      if (!t && el.alt) t = el.alt;
      if (!t && el.tagName) t = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : '');
    }
    return (t || '').slice(0, 80);
  }
  function area(el) {
    if (el.closest('header')) return 'header';
    if (el.closest('footer')) return 'footer';
    if (el.closest('nav')) return 'nav';
    if (el.closest('form')) return 'form';
    return 'main';
  }
  // Positie van een klik: verankerd aan het element (overleeft layoutverschillen)
  // plus een terugval op paginacoördinaten.
  function pos(e, anchor) {
    if (!e.detail && !e.clientX && !e.clientY) return null; // toetsenbord-klik
    var ds = docSize();
    var m = { vw: w.innerWidth, px: r3(e.pageX / ds.w, 4), py: r3(e.pageY / ds.h, 4) };
    var r = anchor.getBoundingClientRect(), s = selOf(anchor);
    if (s && r.width > 0 && r.height > 0) { m.s = s; m.rx = clamp(r3((e.clientX - r.left) / r.width)); m.ry = clamp(r3((e.clientY - r.top) / r.height)); }
    return m;
  }
  function merge(a, b) { if (b) for (var k in b) a[k] = b[k]; return a; }
  function looksClickable(el) {
    try { if (getComputedStyle(el).cursor === 'pointer') return true; } catch (e) {}
    return /^(IMG|SVG|PICTURE)$/i.test(el.tagName) || !!el.closest('[class*="card"],[class*="btn"],[class*="button"],[class*="arrow"]');
  }
  // "Dode klik": het element lijkt klikbaar, maar er verandert niets.
  function deadCheck(cb) {
    var changed = false, url = L.href, sy = w.scrollY, mo = null;
    try { mo = new MutationObserver(function () { changed = true; }); mo.observe(d.body, { childList: true, subtree: true, attributes: true, characterData: true }); } catch (e) {}
    setTimeout(function () { if (mo) mo.disconnect(); cb(!changed && L.href === url && Math.abs(w.scrollY - sy) < 5); }, 700);
  }
  var rc = [];
  d.addEventListener('click', function (e) {
    var tgt = e.target && e.target.closest ? e.target : (e.target && e.target.parentElement);
    if (!tgt || !tgt.closest) return;
    if (tgt.ownerSVGElement) tgt = tgt.ownerSVGElement;
    var el = tgt.closest('a,button,[role="button"],input[type="submit"],input[type="button"],summary,[data-sf-event]');
    var anchor = el || tgt;
    var P0 = pos(e, anchor);
    // rage clicks: 3 klikken binnen 800 ms op dezelfde plek
    var t = Date.now();
    rc = rc.filter(function (c) { return t - c.t < 800 && Math.abs(c.x - e.clientX) < 40 && Math.abs(c.y - e.clientY) < 40; });
    rc.push({ t: t, x: e.clientX, y: e.clientY });
    if (rc.length === 3) { var rv = base('event', 'rage_click'); rv.lb = label(tgt.closest('a,button,label,input,[role=button]') || tgt); rv.m = merge({}, P0); send(rv); }

    if (!el) {
      // klik op iets dat geen link of knop is: alleen voor de heatmap (+ dode klikken)
      if (!P0 || tgt.closest('input,select,textarea,label,[contenteditable]')) return;
      var tv = base('event', 'tap'); tv.lb = label(tgt); tv.m = merge({ a: area(tgt) }, P0);
      var maybeDead = looksClickable(tgt);
      if (!maybeDead) { send(tv); return; }
      deadCheck(function (dead) {
        try { if (String(w.getSelection ? w.getSelection() : '').trim()) dead = false; } catch (x) {}
        if (dead) tv.m.dc = 1;
        send(tv);
      });
      return;
    }
    var a = el.closest('a');
    var href = a && a.getAttribute('href') ? a.href : '';
    var raw = a ? (a.getAttribute('href') || '') : '';
    var kind = el.tagName === 'A' ? 'link' : 'button', h = '';
    if (raw) {
      if (/^mailto:/i.test(raw)) { kind = 'mailto'; h = raw.slice(7).split('?')[0]; }
      else if (/^tel:/i.test(raw)) { kind = 'tel'; h = raw.slice(4); }
      else if (/^#/.test(raw)) { kind = 'anker'; h = raw; }
      else {
        try {
          var u = new URL(href), hh = u.hostname.replace(/^www\./, '').toLowerCase();
          if (/\.(pdf|docx?|xlsx?|pptx?|zip|csv|txt)$/i.test(u.pathname) || a.hasAttribute('download')) { kind = 'download'; h = (hh === host ? '' : hh) + u.pathname; }
          else if (hh !== host) { kind = SOCIAL.test(hh) ? 'social' : 'outbound'; h = hh + (u.pathname.length > 1 ? u.pathname : ''); }
          else if (normPath(u.pathname) === curPath && u.hash) { kind = 'anker'; h = u.hash; }
          else { kind = 'link'; h = normPath(u.pathname) + (u.hash || ''); }
        } catch (x) {}
      }
    }
    var cls = typeof el.className === 'string' ? el.className : '';
    var custom = el.getAttribute('data-sf-event');
    var ev = base('event', custom ? String(custom).slice(0, 40) : 'click');
    ev.lb = label(el);
    ev.m = merge({ k: kind, h: h.slice(0, 180), a: area(el), c: (/btn|button|cta|pill/i.test(cls) || el.tagName === 'BUTTON') ? 1 : 0 }, P0);
    if (kind === 'link' || kind === 'download') { scrollCalc(); engage(true); vitals(); }
    send(ev, kind !== 'button' && kind !== 'anker');
  }, true);

  // ---- formulieren -----------------------------------------------------------
  var FS = {}, lastSubmit = null;
  function fkey(f) {
    return (f.getAttribute('id') || f.getAttribute('name') || f.getAttribute('data-form') ||
      (curPath.indexOf('/cv-uploaden') === 0 ? 'cv-upload' : '') ||
      'form-' + Array.prototype.indexOf.call(d.forms, f)).slice(0, 40);
  }
  function fname(el) { return String(el.name || el.id || el.getAttribute('aria-label') || el.type || el.tagName).slice(0, 30); }
  function fst(f) { var k = fkey(f); return FS[k] || (FS[k] = { k: k, fd: {}, fx: {} }); }
  function fieldMeta(s) {
    var fd = {}, fx = {}, ks = Object.keys(s.fd || {}).slice(0, 18);
    ks.forEach(function (k) { fd[k] = Math.round(s.fd[k] / 100) / 10; fx[k] = s.fx[k] || 1; });
    return ks.length ? { fd: fd, fx: fx } : {};
  }
  var io = null;
  function observeForms() {
    if (!('IntersectionObserver' in w)) return;
    if (io) io.disconnect();
    io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var need = Math.min(220, en.boundingClientRect.height * 0.5);
        if (en.intersectionRect.height < need) return;
        var s = fst(en.target);
        if (!s.view) { s.view = 1; var ev = base('event', 'form_view'); ev.lb = s.k; send(ev); }
        io.unobserve(en.target);
      });
    }, { threshold: [0, 0.1, 0.25, 0.5, 0.75] });
    Array.prototype.forEach.call(d.forms, function (f) { if (!f.closest('[data-sf-ignore]') && f.elements.length > 2) io.observe(f); });
  }
  function isField(el) { return el && el.form && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && !/^(hidden|submit|button|reset)$/i.test(el.type || ''); }
  var focusT = null;
  d.addEventListener('focusin', function (e) {
    var el = e.target; if (!isField(el)) return;
    var s = fst(el.form), nm = fname(el); s.last = nm;
    s.fx[nm] = (s.fx[nm] || 0) + 1; focusT = { s: s, nm: nm, t: Date.now() };
    if (!s.start) { s.start = 1; s.t0 = Date.now(); var ev = base('event', 'form_start'); ev.lb = s.k; ev.m = { f: s.last }; send(ev); }
  }, true);
  function blurField() { if (focusT) { var f = focusT; f.s.fd[f.nm] = (f.s.fd[f.nm] || 0) + Math.min(600000, Date.now() - f.t); focusT = null; } }
  d.addEventListener('focusout', function (e) { if (isField(e.target)) blurField(); }, true);
  d.addEventListener('change', function (e) {
    var el = e.target; if (!isField(el)) return;
    var s = fst(el.form); s.last = fname(el); (s.filled = s.filled || {})[fname(el)] = 1;
  }, true);
  d.addEventListener('submit', function (e) {
    var f = e.target; if (!f || f.tagName !== 'FORM') return;
    blurField();
    var s = fst(f);
    if (s.sub && Date.now() - s.sub < 2500) return;
    s.sub = Date.now();
    var c = {}, nf = 0, file = 0;
    Array.prototype.forEach.call(f.elements, function (el) {
      var t = (el.type || '').toLowerCase();
      if (t === 'file') { if (el.files && el.files.length) file = 1; return; }
      if (/^(hidden|submit|button|reset|password)$/.test(t)) return;
      if (el.name === 'website') return; // honeypot
      if (el.tagName === 'SELECT') {
        if (el.value) { var o = el.options[el.selectedIndex]; c[fname(el)] = (o ? o.text : el.value).slice(0, 60); nf++; }
        return;
      }
      if (t === 'radio' || t === 'checkbox') {
        if (el.checked) { var lab = ((el.labels && el.labels[0] && el.labels[0].innerText) || el.value || 'ja').replace(/\s+/g, ' ').trim().slice(0, 50); var nm = fname(el); c[nm] = c[nm] ? (c[nm] + ', ' + lab).slice(0, 80) : lab; }
        return;
      }
      if ((el.value || '').trim()) nf++;
    });
    lastSubmit = { k: s.k, c: c, file: file, t: Date.now(), dur: s.t0 ? Math.round((Date.now() - s.t0) / 1000) : null };
    var ev = base('event', 'form_submit'); ev.lb = s.k;
    ev.m = merge({ c: c, nf: nf, file: file, dur: lastSubmit.dur }, fieldMeta(s));
    send(ev, true);
  }, true);
  function abandon() {
    blurField();
    Object.keys(FS).forEach(function (k) {
      var s = FS[k];
      if (s.start && !s.sub && !s.ab) { s.ab = 1; var ev = base('event', 'form_abandon'); ev.lb = k; ev.m = merge({ last: s.last || '', n: s.filled ? Object.keys(s.filled).length : 0 }, fieldMeta(s)); send(ev); }
    });
  }

  // Resultaat van het verzenden (fetch/XHR naar bv. /api/formulier of /api/cv)
  function result(url, ok, status) {
    if (!lastSubmit || Date.now() - lastSubmit.t > 30000) return;
    var ls = lastSubmit; lastSubmit = null;
    var ev = base('event', 'form_result'); ev.lb = ls.k;
    ev.m = {
      ok: ok ? 1 : 0, st: status || 0, u: short(url).slice(0, 80), c: ls.c, file: ls.file, dur: ls.dur,
      ft: FT, vc: S.c, dfv: Math.max(0, Math.round((Date.now() - (FT.t || Date.now())) / 86400000))
    };
    send(ev, true);
  }
  var origFetch = w.fetch ? w.fetch.bind(w) : null;
  if (origFetch) {
    w.fetch = function (input, init) {
      var p = origFetch.apply(w, arguments);
      try {
        var method = (init && init.method) || (input && typeof input === 'object' && input.method) || 'GET';
        var url = typeof input === 'string' ? input : (input && input.url) || String(input);
        if (/^post$/i.test(method) && url.indexOf(API) !== 0 && lastSubmit) {
          p.then(function (r) { result(url, r.ok, r.status); }, function () { result(url, false, 0); });
        }
      } catch (e) {}
      return p;
    };
  }
  try {
    var XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (m, u) { this.__sf = { m: m, u: u }; return XO.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function () {
      var x = this;
      if (x.__sf && /^post$/i.test(x.__sf.m) && lastSubmit) {
        x.addEventListener('loadend', function () { result(x.__sf.u, x.status >= 200 && x.status < 400, x.status); });
      }
      return XS.apply(this, arguments);
    };
  } catch (e) {}

  // ---- delen & kopiëren --------------------------------------------------------
  try {
    if (n.share) {
      var osh = n.share.bind(n);
      n.share = function (data) { var ev = base('event', 'share'); ev.lb = 'native delen'; ev.m = { h: short((data && data.url) || L.href) }; send(ev, true); return osh(data); };
    }
  } catch (e) {}
  try {
    if (n.clipboard && n.clipboard.writeText) {
      var owt = n.clipboard.writeText.bind(n.clipboard);
      n.clipboard.writeText = function (txt) { var ev = base('event', 'share'); ev.lb = /^https?:\/\//.test(String(txt)) ? 'link gekopieerd' : 'tekst gekopieerd'; send(ev, true); return owt(txt); };
    }
  } catch (e) {}
  d.addEventListener('copy', function () {
    var s = (w.getSelection && String(w.getSelection())) || '';
    if (!s.trim()) return;
    var ev = base('event', 'copy');
    ev.lb = /@/.test(s) ? 'e-mailadres' : /\+?\d[\d\s-]{8,}/.test(s) ? 'telefoonnummer' : 'tekst';
    send(ev);
  });

  // ---- fouten ----------------------------------------------------------------
  var errN = 0;
  addEventListener('error', function (e) {
    if (errN++ > 6) return;
    var t = e.target;
    if (t && t !== w && (t.src || t.href)) {
      var rv = base('event', 'resource_error'); rv.lb = (t.tagName || '').toLowerCase() + ' ' + short(t.src || t.href); send(rv); return;
    }
    var ev = base('event', 'js_error'); ev.lb = String(e.message || 'Error').slice(0, 160);
    ev.m = { f: short(e.filename || ''), l: e.lineno || 0 }; send(ev);
  }, true);
  addEventListener('unhandledrejection', function (e) {
    if (errN++ > 6) return;
    var r = e.reason; var ev = base('event', 'js_error');
    ev.lb = ('Promise: ' + ((r && r.message) || r)).slice(0, 160); send(ev);
  });

  // ---- Core Web Vitals -------------------------------------------------------
  var V = {};
  function po(type, cb, opts) {
    try {
      var o = new PerformanceObserver(function (l) { l.getEntries().forEach(cb); });
      var cfg = { type: type, buffered: true }; for (var k in (opts || {})) cfg[k] = opts[k];
      o.observe(cfg);
    } catch (e) {}
  }
  po('paint', function (en) { if (en.name === 'first-contentful-paint') V.FCP = en.startTime; });
  po('largest-contentful-paint', function (en) { V.LCP = en.startTime; });
  var cS = 0, cMax = 0, cLast = 0, cFirst = 0;
  po('layout-shift', function (en) {
    if (en.hadRecentInput) return;
    if (cS && en.startTime - cLast < 1000 && en.startTime - cFirst < 5000) cS += en.value; else { cS = en.value; cFirst = en.startTime; }
    cLast = en.startTime; if (cS > cMax) { cMax = cS; V.CLS = cMax; }
  });
  po('event', function (en) { if (en.interactionId && (!V.INP || en.duration > V.INP)) V.INP = en.duration; }, { durationThreshold: 16 });
  po('first-input', function (en) { if (!V.INP) V.INP = en.duration; });
  try { var nav = performance.getEntriesByType('navigation')[0]; if (nav && nav.responseStart > 0) V.TTFB = nav.responseStart; } catch (e) {}
  if (!('CLS' in V)) { try { if (PerformanceObserver.supportedEntryTypes.indexOf('layout-shift') > -1) V.CLS = 0; } catch (e) {} }
  function vitals() {
    if (vSent) return; vSent = 1;
    Object.keys(V).forEach(function (k) {
      var ev = base('vital', k); ev.val = k === 'CLS' ? Math.round(V[k] * 10000) / 10000 : Math.round(V[k]); send(ev);
    });
  }

  // ---- vertrek -----------------------------------------------------------------
  function hide() { scrollCalc(); engage(true); vitals(); abandon(); flush(); }
  d.addEventListener('visibilitychange', function () { if (d.visibilityState === 'hidden') hide(); });
  addEventListener('pagehide', hide);

  // ---- SPA-navigatie ---------------------------------------------------------
  function route() { var p = path(); if (p !== curPath) { engage(true); vitals(); abandon(); prevPath = curPath; pageview(); } }
  try {
    var ps = history.pushState;
    history.pushState = function () { var r = ps.apply(this, arguments); setTimeout(route, 0); return r; };
    addEventListener('popstate', route);
  } catch (e) {}

  // ---- toestemming later gegeven/ingetrokken ---------------------------------
  addEventListener('CookiebotOnAccept', function () {
    if (!P && consent()) {
      P = CM = true;
      set('sf_v', vid, true); set('sf_c', String(S.c), true); set('sf_f', JSON.stringify(FT), true); saveS();
    }
  });
  addEventListener('CookiebotOnDecline', function () {
    if (P && !consent()) { ['sf_v', 'sf_c', 'sf_f', 'sf_s'].forEach(function (k) { set(k, null, true); }); P = CM = false; saveS(); }
  });

  // ---- publieke API ----------------------------------------------------------
  w.sfTrack = function (name, props) {
    var ev = base('event', String(name || 'custom').slice(0, 40));
    if (props && props.label) ev.lb = String(props.label).slice(0, 80);
    ev.m = props || {}; send(ev);
  };

  pageview();

  // ===========================================================================
  // Heatmap-weergave. Draait alleen als de pagina met ?sf_hm=1 in het dashboard
  // (analytics.straightfwd.nl) wordt geladen; er wordt dan niets gemeten.
  // ===========================================================================
  function overlay() {
    var local = /^(localhost|127\.0\.0\.1)$/.test(L.hostname);
    var okOrigin = function (o) { return o === 'https://analytics.straightfwd.nl' || (local && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)); };
    var parentOrigin = null, data = null, layer = null, ramp = null, redrawT = 0;
    function post(m) { if (parentOrigin) { try { w.parent.postMessage(m, parentOrigin); } catch (e) {} } }

    // Pagina "bevriezen": links en formulieren doen niets in de heatmap.
    d.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('a,button,[role=button],input,select,textarea,label,summary')) { e.preventDefault(); e.stopPropagation(); } }, true);
    d.addEventListener('submit', function (e) { e.preventDefault(); e.stopPropagation(); }, true);
    function hideBanners() {
      ['CybotCookiebotDialog', 'CybotCookiebotDialogBodyUnderlay', 'CookiebotWidget'].forEach(function (id) { var x = d.getElementById(id); if (x) x.style.setProperty('display', 'none', 'important'); });
    }
    setInterval(hideBanners, 400);

    function mkRamp() {
      var c = d.createElement('canvas'); c.width = 256; c.height = 1;
      var g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
      gr.addColorStop(0, 'rgba(122,30,90,0)');
      gr.addColorStop(0.12, 'rgba(122,30,90,0.55)');
      gr.addColorStop(0.4, 'rgba(224,85,156,0.85)');
      gr.addColorStop(0.72, 'rgba(255,184,224,0.95)');
      gr.addColorStop(1, 'rgba(255,246,251,1)');
      g.fillStyle = gr; g.fillRect(0, 0, 256, 1);
      return g.getImageData(0, 0, 256, 1).data;
    }
    function el(tag, css, text) { var x = d.createElement(tag); if (css) x.style.cssText = css; if (text) x.textContent = text; return x; }
    function pill(text, css) { return el('span', 'position:absolute;background:#070B24;color:#fff;font:600 12px/1.25 Montserrat,system-ui,sans-serif;padding:5px 11px;border-radius:999px;white-space:nowrap;box-shadow:0 4px 14px rgba(0,0,0,.35);' + (css || ''), text); }
    function resolve(p, ds) {
      if (p.s) {
        var t = null; try { t = d.querySelector(p.s); } catch (e) {}
        if (t) { var r = t.getBoundingClientRect(); if (r.width > 0 && r.height > 0) return { x: r.left + w.scrollX + p.rx * r.width, y: r.top + w.scrollY + p.ry * r.height }; }
      }
      return { x: p.px * ds.w, y: p.py * ds.h };
    }

    function draw() {
      if (!data) return;
      var ds = docSize(), W = Math.min(ds.w, 4000), H = Math.min(ds.h, 30000);
      if (layer) layer.remove();
      layer = el('div', 'position:absolute;left:0;top:0;width:' + W + 'px;height:' + H + 'px;pointer-events:none;z-index:2147483646');
      layer.id = 'sfa-layer';
      var cv = el('canvas', 'position:absolute;left:0;top:0'); cv.width = W; cv.height = H;
      layer.appendChild(cv);
      var g = cv.getContext('2d');
      var mode = data.mode;
      if (mode === 'click') {
        g.fillStyle = 'rgba(7,11,36,0.5)'; g.fillRect(0, 0, W, H);
        var pts = (data.points || []).filter(function (p) { return data.layer === 'all' ? p.t !== 'r' : data.layer === 'rage' ? p.t === 'r' : p.t === 'd'; });
        var max = 1; pts.forEach(function (p) { if (p.n > max) max = p.n; });
        var R = data.vb === 'm' ? 22 : 30;
        var heat = el('canvas'); heat.width = W; heat.height = H;
        var hg = heat.getContext('2d');
        var minY = H, maxY = 0;
        pts.forEach(function (p) {
          var c = resolve(p, ds);
          if (c.y < -R || c.y > H + R) return;
          var a = Math.max(0.08, Math.min(1, Math.sqrt(p.n / max)));
          var gr = hg.createRadialGradient(c.x, c.y, 0, c.x, c.y, R);
          gr.addColorStop(0, 'rgba(0,0,0,' + a + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          hg.fillStyle = gr; hg.fillRect(c.x - R, c.y - R, R * 2, R * 2);
          minY = Math.min(minY, c.y - R); maxY = Math.max(maxY, c.y + R);
        });
        if (maxY > minY) {
          ramp = ramp || mkRamp();
          var y0 = Math.max(0, Math.floor(minY)), hh = Math.min(H, Math.ceil(maxY)) - y0;
          if (hh > 0) {
            var img = hg.getImageData(0, y0, W, hh), px = img.data;
            for (var i = 0; i < px.length; i += 4) {
              var al = px[i + 3]; if (!al) continue;
              var o = al * 4; px[i] = ramp[o]; px[i + 1] = ramp[o + 1]; px[i + 2] = ramp[o + 2]; px[i + 3] = ramp[o + 3];
            }
            g.clearRect(0, y0, W, hh); g.fillStyle = 'rgba(7,11,36,0.5)'; g.fillRect(0, y0, W, hh);
            hg.putImageData(img, 0, y0);
            g.drawImage(heat, 0, y0, W, hh, 0, y0, W, hh);
          }
        }
        if (data.layer !== 'all') {
          pts.forEach(function (p) {
            var c = resolve(p, ds);
            g.beginPath(); g.arc(c.x, c.y, 7, 0, Math.PI * 2); g.lineWidth = 2.5; g.strokeStyle = '#fff'; g.stroke();
          });
        }
      } else if (mode === 'scroll') {
        var reach = data.scroll || [], fold = data.fold;
        var at = function (pct) { // aandeel dat tot pct% van de pagina kwam
          var i = Math.min(reach.length - 1, Math.floor(pct / 5)), f = (pct - i * 5) / 5;
          var a0 = reach[i] == null ? 0 : reach[i], a1 = reach[Math.min(reach.length - 1, i + 1)]; a1 = a1 == null ? a0 : a1;
          return a0 + (a1 - a0) * f;
        };
        for (var y = 0; y < H; y += 4) {
          var v = at(Math.min(100, (y / ds.h) * 100));
          g.fillStyle = 'rgba(7,11,36,' + (0.08 + (1 - v) * 0.72).toFixed(3) + ')';
          g.fillRect(0, y, W, 4);
        }
        [0.75, 0.5, 0.25].forEach(function (q) {
          for (var p = 0; p <= 100; p += 0.5) {
            if (at(p) < q) {
              var yy = Math.round((p / 100) * ds.h);
              var ln = el('div', 'position:absolute;left:0;right:0;top:' + yy + 'px;border-top:2px dashed rgba(255,255,255,.9)');
              ln.appendChild(pill(Math.round(q * 100) + '% van de bezoekers komt tot hier', 'right:16px;top:-14px'));
              layer.appendChild(ln); break;
            }
          }
        });
        if (fold) {
          var fy = Math.round(fold * ds.h);
          var fl = el('div', 'position:absolute;left:0;right:0;top:' + fy + 'px;border-top:3px solid #FFB8E0');
          fl.appendChild(pill('Gemiddelde vouw: dit ziet men zonder scrollen', 'left:16px;top:-15px;background:#FFB8E0;color:#070B24'));
          layer.appendChild(fl);
        }
      } else if (mode === 'attention') {
        g.fillStyle = 'rgba(7,11,36,0.35)'; g.fillRect(0, 0, W, H);
        var rows = data.sections || [], byK = {}, mx = 1;
        rows.forEach(function (r) { byK[r.k] = r; if (r.avg > mx) mx = r.avg; });
        ramp = ramp || mkRamp();
        sections().forEach(function (s) {
          var r = byK[s.k]; var b = s.el.getBoundingClientRect();
          var top = b.top + w.scrollY, left = b.left + w.scrollX;
          if (!r) { g.fillStyle = 'rgba(7,11,36,0.45)'; g.fillRect(left, top, b.width, b.height); return; }
          var lvl = Math.round(Math.min(1, r.avg / mx) * 255), o = lvl * 4;
          g.clearRect(left, top, b.width, b.height);
          g.fillStyle = 'rgba(' + ramp[o] + ',' + ramp[o + 1] + ',' + ramp[o + 2] + ',' + (0.12 + 0.38 * lvl / 255).toFixed(2) + ')';
          g.fillRect(left, top, b.width, b.height);
          var box = el('div', 'position:absolute;left:' + left + 'px;top:' + top + 'px;width:' + b.width + 'px;height:' + b.height + 'px;box-shadow:inset 0 0 0 3px rgba(255,184,224,' + (0.25 + 0.6 * lvl / 255).toFixed(2) + ')');
          box.appendChild(pill(Math.round(r.avg) + ' s gem. · ' + Math.round(r.reach * 100) + '% zag dit', 'left:16px;top:14px'));
          layer.appendChild(box);
        });
      }
      d.body.appendChild(layer);
      post({ type: 'sfa:drawn', h: ds.h, w: ds.w });
    }
    function focusEl(s) {
      var t = null; try { t = d.querySelector(s); } catch (e) {}
      if (!t || !layer) return;
      t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      var old = d.getElementById('sfa-focus'); if (old) old.remove();
      var b = t.getBoundingClientRect();
      var f = el('div', 'position:absolute;pointer-events:none;z-index:2147483647;border:3px solid #FFB8E0;border-radius:10px;box-shadow:0 0 0 4000px rgba(7,11,36,.25);left:' + (b.left + w.scrollX - 6) + 'px;top:' + (b.top + w.scrollY - 6) + 'px;width:' + (b.width + 12) + 'px;height:' + (b.height + 12) + 'px');
      f.id = 'sfa-focus'; d.body.appendChild(f);
      setTimeout(function () { f.remove(); }, 2600);
    }
    addEventListener('message', function (e) {
      if (!okOrigin(e.origin)) return;
      var m = e.data || {};
      if (m.type === 'sfa:hello') { parentOrigin = e.origin; post({ type: 'sfa:ready', h: docSize().h }); }
      else if (m.type === 'sfa:data') { data = m; draw(); }
      else if (m.type === 'sfa:focus') focusEl(m.s);
    });
    function redraw() { clearTimeout(redrawT); redrawT = setTimeout(draw, 250); }
    addEventListener('resize', redraw);
    addEventListener('load', function () { redraw(); setTimeout(redraw, 1500); });
    try { w.parent.postMessage({ type: 'sfa:loaded' }, '*'); } catch (e) {}
  }
})();
