/* Straightfwd Analytics — dashboard */
(function () {
  'use strict';
  const C = window.SFC, el = C.el;
  const $ = (q, r = document) => r.querySelector(q);

  // ---------------------------------------------------------------- formatting
  const nf = new Intl.NumberFormat('nl-NL');
  const fmt = {
    n: (v) => nf.format(Math.round(v || 0)),
    pct: (v, d = 1) => (v === null || v === undefined || !isFinite(v) ? '–' : (v * 100).toLocaleString('nl-NL', { maximumFractionDigits: d, minimumFractionDigits: d }) + '%'),
    dur: (ms) => {
      if (!ms || ms < 1000) return ms ? '<1s' : '0s';
      const s = Math.round(ms / 1000), m = Math.floor(s / 60), r = s % 60;
      if (m >= 60) return Math.floor(m / 60) + 'u ' + (m % 60) + 'm';
      return m ? m + 'm ' + String(r).padStart(2, '0') + 's' : r + 's';
    },
    compact: (v) => (v >= 10000 ? (v / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + 'K' : nf.format(Math.round(v || 0))),
    ms: (v) => (v >= 1000 ? (v / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 2 }) + ' s' : Math.round(v) + ' ms'),
  };
  const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
  const DAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  const tz = 'Europe/Amsterdam';
  function ymdLocal(d = new Date()) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
  function addDays(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d) + n * 864e5).toISOString().slice(0, 10); }
  function dayDiff(a, b) { const [y1, m1, d1] = a.split('-').map(Number), [y2, m2, d2] = b.split('-').map(Number); return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5); }
  function dLabel(ymd, long) { const [y, m, d] = ymd.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + (long ? ' ' + y : ''); }
  function timeAgo(ts) {
    const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
    if (s < 60) return 'zojuist';
    if (s < 3600) return Math.floor(s / 60) + ' min geleden';
    if (s < 86400) return Math.floor(s / 3600) + ' uur geleden';
    return new Intl.DateTimeFormat('nl-NL', { timeZone: tz, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts));
  }
  function clock(ts) { return new Intl.DateTimeFormat('nl-NL', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }

  const PROVINCES = { DR: 'Drenthe', FL: 'Flevoland', FR: 'Friesland', GE: 'Gelderland', GR: 'Groningen', LI: 'Limburg', NB: 'Noord-Brabant', NH: 'Noord-Holland', OV: 'Overijssel', UT: 'Utrecht', ZE: 'Zeeland', ZH: 'Zuid-Holland' };
  const COUNTRIES = (() => { try { return new Intl.DisplayNames(['nl'], { type: 'region' }); } catch (e) { return { of: (c) => c }; } })();
  const LANGS = (() => { try { return new Intl.DisplayNames(['nl'], { type: 'language' }); } catch (e) { return { of: (c) => c }; } })();
  const DIM_LABEL = { path: 'Pagina', pgroup: 'Paginagroep', channel: 'Kanaal', ref: 'Verwijzer', country: 'Land', region: 'Regio', city: 'Stad', device: 'Apparaat', browser: 'Browser', os: 'Besturingssysteem', screen: 'Scherm', lang: 'Taal', utm_source: 'UTM-bron', utm_medium: 'UTM-medium', utm_campaign: 'Campagne', landing: 'Landingspagina', is_new: 'Bezoeker', consent: 'Toestemming' };
  function dimValue(dim, k) {
    if (k === null || k === undefined || k === '') return '(geen)';
    if (dim === 'country') return COUNTRIES.of(k) || k;
    if (dim === 'region') { const [c, r] = k.split('-'); return c === 'NL' && PROVINCES[r] ? PROVINCES[r] : (COUNTRIES.of(c) || c) + ' · ' + r; }
    if (dim === 'lang') { try { return LANGS.of(k) || k; } catch (e) { return k; } }
    if (dim === 'is_new') return k === 'true' ? 'Nieuwe bezoeker' : 'Terugkerende bezoeker';
    if (dim === 'consent') return k === 'true' ? 'Met toestemming' : 'Zonder toestemming';
    return k;
  }
  const CH_ICON = { Direct: '↗', Zoekmachine: '⌕', LinkedIn: 'in', 'AI-assistent': '✦', 'Social (overig)': '◎', Jobboards: '▤', 'E-mail': '✉', Betaald: '€', 'Eigen sites': '⌂', Verwijzing: '⇢' };

  // ---------------------------------------------------------------- state
  const S = {
    tab: 'overzicht', preset: '30d', from: null, to: null, compare: true, filters: {}, site: 'straightfwd.nl',
    metric: 'visitors', data: null, live: null, theme: null, dataKey: null,
    hm: { path: null, vb: 'd', mode: 'click', layer: 'all', data: null, pages: null, key: null },
    ses: { kind: 'all', rows: [], total: 0, open: null, detail: {}, key: null },
  };
  const PRESETS = [
    ['today', 'Vandaag'], ['yesterday', 'Gisteren'], ['7d', '7 dagen'], ['30d', '30 dagen'], ['90d', '90 dagen'],
    ['12m', '12 maanden'], ['mtd', 'Deze maand'], ['ytd', 'Dit jaar'], ['custom', 'Aangepast'],
  ];
  const TABS = [
    ['overzicht', 'Overzicht'], ['acquisitie', 'Acquisitie'], ['content', 'Content & gedrag'], ['heatmaps', 'Heatmaps'], ['leads', 'Leads & formulieren'],
    ['sessies', 'Sessies'], ['vacatures', 'Vacatures'], ['publiek', 'Publiek'], ['techniek', 'Techniek'], ['live', 'Live'], ['info', 'Instellingen'],
  ];
  function presetRange(p) {
    const t = ymdLocal();
    switch (p) {
      case 'today': return [t, t];
      case 'yesterday': return [addDays(t, -1), addDays(t, -1)];
      case '7d': return [addDays(t, -6), t];
      case '90d': return [addDays(t, -89), t];
      case '12m': return [addDays(t, -364), t];
      case 'mtd': return [t.slice(0, 8) + '01', t];
      case 'ytd': return [t.slice(0, 5) + '01-01', t];
      default: return [addDays(t, -29), t];
    }
  }

  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get('tab')) S.tab = h.get('tab');
    if (h.get('p')) S.preset = h.get('p');
    if (h.get('from')) S.from = h.get('from');
    if (h.get('to')) S.to = h.get('to');
    if (h.get('cmp')) S.compare = h.get('cmp') !== '0';
    if (h.get('site')) S.site = h.get('site');
    if (h.get('m')) S.metric = h.get('m');
    if (h.get('hp')) S.hm.path = h.get('hp');
    if (h.get('hv')) S.hm.vb = h.get('hv');
    if (h.get('hm')) S.hm.mode = h.get('hm');
    if (h.get('sk')) S.ses.kind = h.get('sk');
    S.filters = {};
    for (const [k, v] of h) if (k.startsWith('f_')) S.filters[k.slice(2)] = v;
    if (S.preset !== 'custom' || !S.from) [S.from, S.to] = presetRange(S.preset);
  }
  function writeHash() {
    const h = new URLSearchParams();
    h.set('tab', S.tab); h.set('p', S.preset);
    if (S.preset === 'custom') { h.set('from', S.from); h.set('to', S.to); }
    if (!S.compare) h.set('cmp', '0');
    if (S.site !== 'straightfwd.nl') h.set('site', S.site);
    if (S.metric !== 'visitors') h.set('m', S.metric);
    if (S.tab === 'heatmaps') { if (S.hm.path) h.set('hp', S.hm.path); if (S.hm.vb !== 'd') h.set('hv', S.hm.vb); if (S.hm.mode !== 'click') h.set('hm', S.hm.mode); }
    if (S.tab === 'sessies' && S.ses.kind !== 'all') h.set('sk', S.ses.kind);
    for (const [k, v] of Object.entries(S.filters)) h.set('f_' + k, v);
    history.replaceState(null, '', '#' + h.toString());
  }

  // ---------------------------------------------------------------- data
  let reqId = 0;
  async function load() {
    const id = ++reqId;
    writeHash();
    renderControls();
    if (S.tab === 'live' || S.tab === 'info') { render(); if (S.tab === 'live') loadLive(); return; }
    if (S.tab === 'heatmaps') { loadHeatmap(); return; }
    if (S.tab === 'sessies') { loadSessions(false); return; }
    const view = $('#view');
    view.classList.add('loading');
    const q = baseQuery();
    const key = q.toString();
    try {
      const r = await fetch('/api/stats?' + q.toString(), { credentials: 'same-origin' });
      if (r.status === 401) { location.href = '/login'; return; }
      const d = await r.json();
      if (id !== reqId) return;
      S.data = d; S.dataKey = key;
    } catch (e) {
      if (id !== reqId) return;
      S.data = { error: 'network', message: String(e) };
    }
    view.classList.remove('loading');
    render();
  }

  function baseQuery(extra) {
    const q = new URLSearchParams({ site: S.site, from: S.from, to: S.to });
    for (const [k, v] of Object.entries(S.filters)) q.set('f_' + k, v);
    for (const [k, v] of Object.entries(extra || {})) if (v !== null && v !== undefined) q.set(k, v);
    return q;
  }
  async function api(q) {
    const r = await fetch('/api/stats?' + q.toString(), { credentials: 'same-origin' });
    if (r.status === 401) { location.href = '/login'; throw new Error('auth'); }
    return r.json();
  }

  let liveTimer = null;
  async function loadLive() {
    clearTimeout(liveTimer);
    try {
      const r = await fetch('/api/stats?mode=live&site=' + encodeURIComponent(S.site), { credentials: 'same-origin' });
      if (r.status === 401) { location.href = '/login'; return; }
      S.live = await r.json();
    } catch (e) { /* keep last */ }
    renderLivePill();
    if (S.tab === 'live') render();
    liveTimer = setTimeout(loadLive, S.tab === 'live' ? 10000 : 45000);
  }

  function setFilter(dim, value) {
    if (value === null || value === undefined || value === '') value = '(geen)';
    S.filters[dim] = String(value);
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------- shell
  function renderControls() {
    const seg = $('#presets');
    seg.replaceChildren(...PRESETS.map(([k, label]) => el('button', {
      type: 'button', 'aria-pressed': String(S.preset === k), text: label,
      onclick: () => {
        S.preset = k;
        if (k !== 'custom') [S.from, S.to] = presetRange(k);
        $('#custom').classList.toggle('on', k === 'custom');
        if (k !== 'custom') load(); else renderControls();
      },
    })));
    $('#custom').classList.toggle('on', S.preset === 'custom');
    $('#from').value = S.from; $('#to').value = S.to;
    const cmp = $('#compare'); cmp.setAttribute('aria-pressed', String(S.compare));
    const days = dayDiff(S.from, S.to) + 1;
    $('#rangeLabel').textContent = (S.from === S.to ? dLabel(S.from, true) : dLabel(S.from) + ' – ' + dLabel(S.to, true)) + (days > 1 ? ' · ' + days + ' dagen' : '');
    const chips = $('#chips');
    chips.replaceChildren(...Object.entries(S.filters).map(([k, v]) => el('span', { class: 'chip' },
      el('span', { class: 'k', text: (DIM_LABEL[k] || k) + ':' }), dimValue(k, v === '(geen)' ? null : v),
      el('button', { type: 'button', 'aria-label': 'Filter verwijderen', text: '×', onclick: () => { delete S.filters[k]; load(); } }))));
    if (Object.keys(S.filters).length > 1) chips.append(el('button', { class: 'mini-btn', type: 'button', text: 'Wis filters', onclick: () => { S.filters = {}; load(); } }));
    const tabs = $('#tabs');
    tabs.replaceChildren(...TABS.map(([k, label]) => el('button', {
      role: 'tab', type: 'button', 'aria-selected': String(S.tab === k), text: label,
      onclick: () => {
        S.tab = k;
        if (k === 'live') { writeHash(); renderControls(); render(); loadLive(); }
        else if (k === 'heatmaps' || k === 'sessies' || k === 'info') load();
        else if (S.data && !S.data.error && S.dataKey === baseQuery().toString()) { writeHash(); renderControls(); render(); }
        else load();
      },
    })));
    $('#siteSel').value = S.site;
  }
  function renderLivePill() {
    const n = S.live ? S.live.now : null;
    $('#liveN').replaceChildren(n === null ? '–' : fmt.n(n), el('span', { class: 'lt', text: n === 1 ? ' bezoeker nu' : ' bezoekers nu' }));
    $('#liveDot').classList.toggle('off', !n);
  }

  // ---------------------------------------------------------------- components
  function card(title, opts = {}, ...body) {
    const act = el('div', { class: 'act' }, ...(opts.actions || []));
    const head = el('div', { class: 'card-h' }, el('div', null, el('h3', { text: title }), opts.sub ? el('div', { class: 'sub', text: opts.sub }) : null), act);
    return el('section', { class: 'card ' + (opts.cls || '') + (opts.span ? ' span-' + opts.span : '') }, head, ...body);
  }
  function delta(cur, prev, upGood = true, isRate = false) {
    if (!S.compare || prev === null || prev === undefined) return null;
    let d, txt;
    if (isRate) { d = cur - prev; txt = (d >= 0 ? '+' : '−') + Math.abs(d * 100).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' pp'; }
    else {
      if (!prev) return cur ? el('span', { class: 'delta ' + (upGood ? 'up' : 'down'), text: '▲ nieuw', title: 'Vorige periode: 0' }) : el('span', { class: 'delta flat', text: '— 0%' });
      d = (cur - prev) / prev; txt = (d >= 0 ? '+' : '−') + Math.abs(d * 100).toLocaleString('nl-NL', { maximumFractionDigits: Math.abs(d) < 0.1 ? 1 : 0 }) + '%';
    }
    if (Math.abs(d) < 1e-9) return el('span', { class: 'delta flat', text: '— 0%', title: 'Gelijk aan vorige periode' });
    const good = (d > 0) === upGood;
    return el('span', { class: 'delta ' + (good ? 'up' : 'down'), title: 't.o.v. vorige periode' }, (d > 0 ? '▲ ' : '▼ ') + txt);
  }
  function tile(label, value, dlt, spark, info) {
    return el('div', { class: 'tile' },
      el('div', { class: 'lbl' }, label, info ? el('span', { class: 'info', title: info, text: 'i' }) : null),
      el('div', { class: 'row' }, el('div', null, el('div', { class: 'val', text: value }), dlt), spark || null));
  }
  // rows: [{k, label, sub, vals:[...], bar}] cols: [{name, strong}]
  function barList(rows, cols, opts = {}) {
    if (!rows.length) return el('div', { class: 'empty', text: opts.empty || 'Nog geen data in deze periode.' });
    const max = Math.max(...rows.map((r) => r.bar || 0), 1);
    const list = el('div', { class: 'blist', role: 'list' });
    const head = el('div', { class: 'bhead' }, el('span', { text: opts.head || '' }), el('div', { class: 'vals' }, ...cols.map((c) => el('span', { text: c.name }))));
    const limit = opts.limit || 8;
    const draw = (all) => {
      list.replaceChildren(head);
      rows.slice(0, all ? rows.length : limit).forEach((r) => {
        const row = el('div', {
          class: 'brow' + (opts.onClick ? '' : ' static'), role: 'listitem', tabindex: opts.onClick ? 0 : null,
          title: opts.onClick ? 'Klik om te filteren op ' + r.label : r.title || null,
          onclick: opts.onClick ? () => opts.onClick(r) : null,
          onkeydown: opts.onClick ? (e) => { if (e.key === 'Enter') opts.onClick(r); } : null,
        },
        el('div', { class: 'nm' }, r.icon ? el('span', { class: 'muted', style: { display: 'inline-block', width: '20px' }, text: r.icon }) : null, r.label, r.sub ? el('small', { text: r.sub }) : null),
        el('div', { class: 'vals' }, ...r.vals.map((v, i) => el('span', { class: cols[i] && cols[i].strong ? 'strong' : '', text: v }))),
        el('div', { class: 'bar' }, el('i', { style: { width: Math.max(0.5, (r.bar / max) * 100) + '%', background: r.color || 'var(--s1)' } })));
        list.append(row);
      });
      if (rows.length > limit) list.append(el('button', { class: 'mini-btn', style: { alignSelf: 'flex-start', marginTop: '8px' }, type: 'button', text: all ? 'Toon minder' : 'Toon alle ' + rows.length, onclick: () => draw(!all) }));
    };
    draw(false);
    return list;
  }
  // cols: [{key, name, num, fmt, cls, render, sort}]
  function table(rows, cols, opts = {}) {
    if (!rows.length) return el('div', { class: 'empty', text: opts.empty || 'Nog geen data in deze periode.' });
    let sortKey = opts.sort || null, dir = -1;
    const wrap = el('div', { class: 'tbl-wrap' });
    const limit = opts.limit || 25; let all = false;
    function draw() {
      let data = [...rows];
      if (sortKey) {
        const c = cols.find((x) => x.key === sortKey);
        const val = (r) => (c.sort ? c.sort(r) : r[sortKey]);
        data.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === 'string' ? String(x).localeCompare(String(y), 'nl') : (x ?? -Infinity) - (y ?? -Infinity)) * dir; });
      }
      const t = el('table', { class: 'tbl' });
      t.append(el('thead', null, el('tr', null, ...cols.map((c) => el('th', {
        class: c.num ? 'num' : '', scope: 'col', 'aria-sort': sortKey === c.key ? (dir < 0 ? 'descending' : 'ascending') : null, text: c.name,
        onclick: () => { if (sortKey === c.key) dir = -dir; else { sortKey = c.key; dir = c.num ? -1 : 1; } draw(); },
      })))));
      const tb = el('tbody');
      data.slice(0, all ? data.length : limit).forEach((r) => {
        tb.append(el('tr', null, ...cols.map((c) => {
          const v = c.render ? c.render(r) : c.fmt ? c.fmt(r[c.key], r) : r[c.key] ?? '–';
          const td = el('td', { class: (c.num ? 'num ' : '') + (c.onClick ? 'click' : ''), onclick: c.onClick ? () => c.onClick(r) : null, title: c.onClick ? 'Klik om te filteren' : null });
          if (v && v.nodeType) td.append(v); else td.textContent = v;
          return td;
        })));
      });
      t.append(tb);
      wrap.replaceChildren(t);
      if (data.length > limit) wrap.append(el('button', { class: 'mini-btn', style: { margin: '10px 4px 0' }, type: 'button', text: all ? 'Toon minder' : 'Toon alle ' + data.length + ' rijen', onclick: () => { all = !all; draw(); } }));
    }
    draw();
    wrap.__rows = rows; wrap.__cols = cols;
    return wrap;
  }
  function csvBtn(name, getRows) {
    return el('button', {
      class: 'mini-btn', type: 'button', text: 'CSV', title: 'Download als CSV',
      onclick: () => {
        const { rows, cols } = getRows();
        const esc = (v) => { v = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v); return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        const csv = '﻿' + [cols.map((c) => c.name).join(';')].concat(rows.map((r) => cols.map((c) => esc(c.raw ? c.raw(r) : r[c.key])).join(';'))).join('\n');
        const a = el('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'straightfwd-' + name + '-' + S.from + '_' + S.to + '.csv' });
        document.body.append(a); a.click(); a.remove();
      },
    });
  }
  function tableCard(title, sub, rows, cols, opts = {}) {
    const t = table(rows, cols, opts);
    return card(title, { sub, span: opts.span || 12, actions: rows.length ? [csvBtn(opts.file || title.toLowerCase().replace(/\W+/g, '-'), () => ({ rows, cols }))] : [] }, t);
  }
  function segBar(parts, opts = {}) {
    const total = parts.reduce((a, p) => a + p.v, 0) || 1;
    const bar = el('div', { class: 'segbar' + (opts.thin ? ' thin' : ''), role: 'img', 'aria-label': parts.map((p) => p.label + ' ' + fmt.pct(p.v / total)).join(', ') });
    parts.forEach((p) => {
      if (!p.v) return;
      const share = p.v / total;
      const d = el('div', { class: p.dark ? 'dark-text' : '', style: { flex: String(p.v), background: p.color } });
      if (!opts.thin && share > 0.12) d.textContent = fmt.pct(share, 0);
      d.addEventListener('pointermove', (e) => C.showTip(e.clientX, e.clientY, p.label, [{ label: fmt.n(p.v), value: fmt.pct(share) }]));
      d.addEventListener('pointerleave', C.hideTip);
      bar.append(d);
    });
    if (opts.noLegend) return bar;
    const legend = el('div', { class: 'legend' }, ...parts.map((p) => el('span', null, el('i', { class: 'key', style: { background: p.color } }), p.label + (opts.thin || opts.legendValues ? ' · ' + fmt.pct(p.v / total, 0) : ''))));
    return el('div', null, bar, legend);
  }
  function emptyState(msg) { return el('div', { class: 'empty', text: msg }); }
  const rate = (a, b) => (b ? a / b : null);

  // ---------------------------------------------------------------- time axis
  function buckets(d) {
    const { from, to, bucket } = d.range;
    const out = [];
    if (bucket === 'hour') {
      const today = ymdLocal();
      const nowH = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
      for (let day = from; dayDiff(day, to) >= 0; day = addDays(day, 1)) {
        for (let h = 0; h < 24; h++) {
          if (day === today && h > nowH) break;
          out.push({ key: day + 'T' + String(h).padStart(2, '0') + ':00', label: String(h).padStart(2, '0') + ':00', tip: dLabel(day) + ' ' + String(h).padStart(2, '0') + ':00' });
        }
      }
    } else if (bucket === 'day') {
      for (let day = from; dayDiff(day, to) >= 0; day = addDays(day, 1)) {
        const dow = DAYS[(new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7];
        out.push({ key: day + 'T00:00', label: dLabel(day), tip: dow + ' ' + dLabel(day, true) });
      }
    } else if (bucket === 'week') {
      let d0 = from; const dow = (new Date(from + 'T12:00:00Z').getUTCDay() + 6) % 7; d0 = addDays(from, -dow);
      for (let day = d0; dayDiff(day, to) >= 0; day = addDays(day, 7)) out.push({ key: day + 'T00:00', label: dLabel(day), tip: 'Week van ' + dLabel(day, true) });
    } else {
      let [y, m] = from.split('-').map(Number);
      const [ty, tm] = to.split('-').map(Number);
      while (y < ty || (y === ty && m <= tm)) { const k = y + '-' + String(m).padStart(2, '0') + '-01'; out.push({ key: k + 'T00:00', label: MONTHS[m - 1] + " '" + String(y).slice(2), tip: MONTHS[m - 1] + ' ' + y }); m++; if (m > 12) { m = 1; y++; } }
    }
    return out;
  }
  function align(bk, rows, key) { const map = new Map(rows.map((r) => [r.b, r])); return bk.map((b) => { const r = map.get(b.key); return r ? r[key] : 0; }); }
  function alignPrev(bk, prevRows, key) {
    // previous period: same number of buckets, matched by position
    const vals = prevRows.map((r) => r[key]);
    if (!prevRows.length) return bk.map(() => 0);
    // rebuild prev bucket list to place values correctly
    const d = S.data; const fake = { range: { from: d.range.prev.from, to: d.range.prev.to, bucket: d.range.bucket } };
    const pb = buckets(fake);
    const map = new Map(prevRows.map((r) => [r.b, r[key]]));
    const out = pb.map((b) => map.get(b.key) || 0);
    return bk.map((_, i) => (i < out.length ? out[i] : null));
  }

  // ---------------------------------------------------------------- views
  const METRICS = [
    ['visitors', 'Bezoekers', (v) => fmt.n(v)], ['sessions', 'Sessies', (v) => fmt.n(v)],
    ['pageviews', 'Paginaweergaven', (v) => fmt.n(v)], ['leads', 'Leads', (v) => fmt.n(v)],
  ];
  function mainChart(d) {
    const bk = buckets(d);
    const [mk, mname, mfmt] = METRICS.find((m) => m[0] === S.metric) || METRICS[0];
    const cur = align(bk, d.series, mk);
    const series = [{ name: mname, color: 'var(--s1)', values: cur, fill: true, fmt: mfmt }];
    if (S.compare) {
      const prevB = buckets({ range: { from: d.range.prev.from, to: d.range.prev.to, bucket: d.range.bucket } });
      series.push({ name: 'Vorige periode', color: 'var(--prev)', values: alignPrev(bk, d.prevSeries, mk), muted: true, fmt: mfmt, tipName: (i) => 'Vorige periode' + (prevB[i] ? ' (' + prevB[i].tip + ')' : '') });
    }
    const noteIdx = (d.notes || []).map((n) => ({ i: bk.findIndex((b) => b.key.slice(0, 10) === n.day || (d.range.bucket !== 'day' && b.key.slice(0, 10) <= n.day && (bk[bk.indexOf(b) + 1] ? bk[bk.indexOf(b) + 1].key.slice(0, 10) > n.day : true))), text: n.text }));
    let showTable = false;
    const body = el('div');
    const draw = () => {
      if (!showTable) body.replaceChildren(C.line({ labels: bk.map((b) => b.label), tipLabels: bk.map((b) => b.tip), series, height: 270, notes: noteIdx, aria: mname + ' per ' + d.range.bucket }));
      else body.replaceChildren(table(bk.map((b, i) => ({ t: b.tip, v: cur[i], p: series[1] ? series[1].values[i] : null })), [{ key: 't', name: 'Periode' }, { key: 'v', name: mname, num: true, fmt: mfmt }].concat(S.compare ? [{ key: 'p', name: 'Vorige periode', num: true, fmt: (v) => (v === null ? '–' : mfmt(v)) }] : []), { limit: 400 }));
    };
    draw();
    const sw = el('div', { class: 'metric-switch' }, ...METRICS.map(([k, label]) => el('button', { class: 'mini-btn', type: 'button', 'aria-pressed': String(S.metric === k), text: label, onclick: () => { S.metric = k; writeHash(); render(); } })));
    const tbl = el('button', { class: 'mini-btn', type: 'button', text: 'Tabel', 'aria-pressed': 'false', onclick: (e) => { showTable = !showTable; e.target.setAttribute('aria-pressed', String(showTable)); draw(); } });
    const noteBtn = el('button', { class: 'mini-btn', type: 'button', text: '+ Notitie', title: 'Markeer een moment, bv. een LinkedIn-post of nieuwe vacature' });
    const form = el('form', { class: 'note-form' },
      el('input', { type: 'date', name: 'day', value: ymdLocal(), required: true }),
      el('input', { type: 'text', name: 'text', placeholder: 'Bijv. LinkedIn-post over sourcing', maxlength: 140, required: true }),
      el('button', { class: 'pill-btn', type: 'submit', text: 'Opslaan' }));
    noteBtn.onclick = () => form.classList.toggle('on');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      await fetch('/api/notes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ site: S.site, day: fd.get('day'), text: fd.get('text') }) });
      load();
    };
    const notes = el('div', { class: 'notes-list' }, ...(d.notes || []).map((n) => el('span', { class: 'note-chip' }, el('b', { text: dLabel(n.day) }), ' ' + n.text,
      el('button', { type: 'button', title: 'Verwijder notitie', text: '×', onclick: async () => { await fetch('/api/notes?id=' + n.id, { method: 'DELETE' }); load(); } }))));
    const legend = el('div', { class: 'legend' }, el('span', null, el('i', { class: 'key line', style: { background: 'var(--s1)' } }), mname + ' (' + dLabel(d.range.from) + ' – ' + dLabel(d.range.to) + ')'),
      S.compare ? el('span', null, el('i', { class: 'key line', style: { background: 'var(--prev)' } }), 'Vorige periode (' + dLabel(d.range.prev.from) + ' – ' + dLabel(d.range.prev.to) + ')') : null,
      (d.notes || []).length ? el('span', null, el('i', { class: 'key', style: { background: 'var(--s2)', borderRadius: '50%' } }), 'Notitie') : null);
    return card('Verloop', { span: 12, sub: 'Per ' + ({ hour: 'uur', day: 'dag', week: 'week', month: 'maand' })[d.range.bucket], actions: [sw, tbl, noteBtn] }, body, legend, form, notes);
  }

  function leadsTotal(g) { return ((g.lead_opdrachtgever || {}).n || 0) + ((g.lead_kandidaat || {}).n || 0); }

  function viewOverzicht(d) {
    const k = d.kpis, p = d.prev, g = d.goals, gp = d.prevGoals;
    const bk = buckets(d);
    const sp = (key) => C.spark(align(bk, d.series, key), 'var(--s1)');
    const ssp = (key) => C.spark(align(bk, d.sessionSeries, key), 'var(--s1)');
    const lo = (g.lead_opdrachtgever || {}).n || 0, lk = (g.lead_kandidaat || {}).n || 0;
    const total = lo + lk;
    const cr = rate(k.conv_sessions, k.sessions), crp = rate(p.conv_sessions, p.sessions);
    const hero = el('section', { class: 'card grad hero span-4' },
      el('div', null, el('div', { class: 'lbl', text: 'Leads via de website' }),
        el('div', { class: 'big', text: fmt.n(total) }), delta(total, leadsTotal(gp))),
      el('div', null,
        segBar([{ label: 'Opdrachtgevers', v: lo, color: 'var(--s1)' }, { label: 'Kandidaten', v: lk, color: 'var(--s2)' }], { thin: true, noLegend: true }),
        el('div', { class: 'split' },
          el('div', null, el('b', { text: fmt.n(lo) }), el('span', null, el('i', { class: 'key', style: { background: 'var(--s1)' } }), 'Opdrachtgevers'), ' ', delta(lo, (gp.lead_opdrachtgever || {}).n || 0)),
          el('div', null, el('b', { text: fmt.n(lk) }), el('span', null, el('i', { class: 'key', style: { background: 'var(--s2)' } }), 'Kandidaten'), ' ', delta(lk, (gp.lead_kandidaat || {}).n || 0)))));
    const tiles = el('div', { class: 'tiles span-8' },
      tile('Bezoekers', fmt.n(k.visitors), delta(k.visitors, p.visitors), sp('visitors'), 'Unieke bezoekers (anoniem). Zonder statistiek-toestemming telt elk tabblad als nieuwe bezoeker.'),
      tile('Sessies', fmt.n(k.sessions), delta(k.sessions, p.sessions), sp('sessions'), 'Een bezoek eindigt na 30 minuten zonder activiteit.'),
      tile('Paginaweergaven', fmt.n(k.pageviews), delta(k.pageviews, p.pageviews), sp('pageviews')),
      tile('Gem. actieve tijd per sessie', fmt.dur(k.avg_dur), delta(k.avg_dur, p.avg_dur), ssp('dur'), 'Tijd dat het tabblad zichtbaar was en de bezoeker actief was.'),
      tile('Bouncepercentage', fmt.pct(k.bounce), delta(k.bounce, p.bounce, false, true), ssp('bounce'), 'Sessies met één pagina, minder dan 10 seconden en geen interactie.'),
      tile('Conversieratio', fmt.pct(cr), delta(cr || 0, crp || 0, true, true), sp('leads'), 'Aandeel sessies met minstens één lead (opdrachtgever of kandidaat).'));

    const ch = (d.dims.channel || []);
    const channels = card('Kanalen', { span: 4, sub: 'Sessies · leads · conversie' }, barList(ch.map((r) => ({ label: r.k || 'Direct', icon: CH_ICON[r.k] || '•', vals: [fmt.n(r.s), fmt.n(r.l), fmt.pct(rate(r.cs, r.s), 1)], bar: r.s, k: r.k })),
      [{ name: 'Sessies', strong: true }, { name: 'Leads' }, { name: 'Conv.' }], { onClick: (r) => setFilter('channel', r.k), head: 'Kanaal' }));
    const pages = card('Populairste pagina’s', { span: 4, sub: 'Weergaven · bezoekers' }, barList(d.pages.map((r) => ({ label: r.k, vals: [fmt.n(r.views), fmt.n(r.visitors)], bar: r.views, k: r.k, title: r.title })),
      [{ name: 'Weerg.', strong: true }, { name: 'Bez.' }], { onClick: (r) => setFilter('path', r.k), head: 'Pagina' }));
    const svcRows = d.serviceGroups.map((sg) => { const r = d.groups.find((x) => x.k === sg) || { views: 0, visitors: 0, leads: 0, t: 0 }; return { label: sg, vals: [fmt.n(r.visitors), fmt.n(r.leads)], bar: r.visitors, k: sg }; }).sort((a, b) => b.bar - a.bar);
    const services = card('Interesse per dienst', { span: 4, sub: 'Bezoekers op de dienstpagina · leads' }, barList(svcRows, [{ name: 'Bez.', strong: true }, { name: 'Leads' }], { onClick: (r) => setFilter('pgroup', r.k), head: 'Dienst' }));

    const f = d.funnels.opdrachtgever;
    const funnelCard = card('Funnel opdrachtgevers', { span: 6, sub: 'Sessies die elke stap haalden' }, funnel(f, ['Bezoek', 'Dienst- of contactpagina', 'Formulier in beeld', 'Formulier gestart', 'Formulier verstuurd', 'Lead ontvangen']));
    const recent = card('Laatste conversies', { span: 6, sub: 'Leads en belangrijke acties, anoniem' }, conversionFeed(d.attribution.recent.slice(0, 8), d));

    const goalsCard = card('Doelen', { span: 12, sub: 'Acties die op interesse wijzen' }, goalTiles(d));
    return [el('div', { class: 'grid g-12' }, hero, tiles), el('div', { style: { height: '16px' } }), el('div', { class: 'grid g-12' }, mainChart(d), channels, pages, services, funnelCard, recent, goalsCard)];
  }

  function goalTiles(d) {
    const keys = ['kennismaking_klik', 'vacature_voorleggen_klik', 'mail', 'bellen', 'onepager', 'linkedin', 'gedeeld', 'software', 'download', 'form_fout'];
    const t = el('div', { class: 'tiles', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' } });
    keys.forEach((k) => {
      const c = (d.goals[k] || {}).n || 0, pv = (d.prevGoals[k] || {}).n || 0;
      if (!c && !pv && ['bellen', 'download', 'form_fout'].includes(k)) return;
      t.append(tile(d.goalLabels[k] || k, fmt.n(c), delta(c, pv, k !== 'form_fout')));
    });
    return t;
  }

  function funnel(vals, names) {
    const top = vals[0] || 0;
    if (!top) return emptyState('Nog geen sessies in deze periode.');
    const wrap = el('div', { class: 'funnel' });
    names.forEach((nm, i) => {
      const v = vals[i] || 0, pr = i ? vals[i - 1] || 0 : null;
      wrap.append(el('div', { class: 'fstep' },
        el('div', { class: 'fl' }, el('span', { text: nm }), el('span', null, el('span', { class: 'n', text: fmt.n(v) }), el('span', { class: 'muted', text: ' · ' + fmt.pct(v / top) }))),
        el('div', { class: 'ftrack' }, el('i', { style: { width: (v / top) * 100 + '%' } })),
        i ? el('div', { class: 'drop', text: pr ? fmt.pct(v / pr) + ' van de vorige stap' + (pr - v > 0 ? ' · ' + fmt.n(pr - v) + ' afgehaakt' : '') : '' }) : null));
    });
    return wrap;
  }

  const GOAL_ICON = { lead_opdrachtgever: '★', lead_kandidaat: '✎', form_fout: '!', mail: '✉', bellen: '☎', onepager: '⤓', download: '⤓', linkedin: 'in', gedeeld: '⇪', kennismaking_klik: '☕', vacature_voorleggen_klik: '↳', software: '</>' };
  function conversionFeed(rows, d) {
    if (!rows.length) return emptyState('Nog geen conversies in deze periode.');
    const feed = el('div', { class: 'feed' });
    rows.forEach((r) => {
      const cls = r.goal === 'lead_opdrachtgever' ? 'lo' : r.goal === 'lead_kandidaat' ? 'lk' : r.goal === 'form_fout' ? 'bad' : '';
      const choice = r.c && typeof r.c === 'object' ? Object.values(r.c).filter(Boolean).join(', ') : '';
      const where = [r.city, r.region && r.country === 'NL' ? PROVINCES[r.region] : null].filter(Boolean).join(', ');
      const extra = [r.path, choice, r.channel && 'via ' + r.channel, r.ftc && r.ftc !== r.channel ? 'eerst via ' + r.ftc : null, r.vc ? r.vc + 'e bezoek' : null, r.device, where].filter(Boolean).join(' · ');
      feed.append(el('div', { class: 'fi' }, el('div', { class: 'ic ' + cls, text: GOAL_ICON[r.goal] || '•' }),
        el('div', { class: 'tx' }, el('b', { text: (d.goalLabels[r.goal] || r.goal) + (r.goal === 'form_fout' && r.st ? ' (status ' + r.st + ')' : '') }), el('div', { class: 'd', text: extra, title: extra })),
        el('div', { class: 'tm', text: timeAgo(r.ts) })));
    });
    return feed;
  }

  function viewAcquisitie(d) {
    const dm = d.dims;
    const ch = dm.channel || [];
    const chTotal = ch.reduce((a, r) => a + r.s, 0);
    const out = [];
    out.push(el('div', { class: 'grid g-12' },
      tableCard('Kanalen', 'Waar je bezoekers vandaan komen en wat ze opleveren', ch.map((r) => ({ ...r, share: chTotal ? r.s / chTotal : 0, conv: rate(r.cs, r.s), k: r.k || 'Direct' })), [
        { key: 'k', name: 'Kanaal', onClick: (r) => setFilter('channel', r.k), render: (r) => el('span', null, el('span', { class: 'muted', style: { display: 'inline-block', width: '22px' }, text: CH_ICON[r.k] || '•' }), r.k) },
        { key: 's', name: 'Sessies', num: true, fmt: fmt.n }, { key: 'share', name: 'Aandeel', num: true, render: (r) => el('span', null, el('i', { class: 'inline-bar', style: { width: Math.round(r.share * 60) + 'px' } }), fmt.pct(r.share, 0)) },
        { key: 'v', name: 'Bezoekers', num: true, fmt: fmt.n }, { key: 'pv', name: 'Weergaven', num: true, fmt: fmt.n },
        { key: 'l', name: 'Leads', num: true, fmt: fmt.n }, { key: 'conv', name: 'Conversie', num: true, fmt: (v) => fmt.pct(v) },
      ], { sort: 's', span: 12, file: 'kanalen' })));
    out.push(el('div', { style: { height: '16px' } }));
    // LinkedIn impact
    const li = ch.find((r) => r.k === 'LinkedIn') || { s: 0, v: 0, l: 0, cs: 0 };
    const liLanding = d.flows.channelLanding.filter((r) => r.k === 'LinkedIn').sort((a, b) => b.s - a.s);
    const liCamp = (dm.utm_campaign || []).filter((r) => r.k);
    const ai = ch.find((r) => r.k === 'AI-assistent') || { s: 0, l: 0 };
    const refs = (dm.ref || []).filter((r) => r.k);
    const aiRefs = d.flows.channelLanding.filter((r) => r.k === 'AI-assistent');
    const search = refs.filter((r) => /^(www\.)?(google\.[a-z.]+|bing\.com|duckduckgo\.com|ecosia\.org|([a-z]+\.)?search\.yahoo\.com|yahoo\.com|startpage\.com|search\.brave\.com|qwant\.com|kagi\.com)$/.test(r.k || ''));
    out.push(el('div', { class: 'grid g-12' },
      card('LinkedIn-impact', { span: 6, sub: 'Je posts en bedrijfspagina als bron' },
        el('div', { class: 'tiles', style: { gridTemplateColumns: 'repeat(3, minmax(0,1fr))', marginBottom: '14px' } },
          tile('Sessies', fmt.n(li.s)), tile('Leads', fmt.n(li.l)), tile('Conversie', fmt.pct(rate(li.cs, li.s)))),
        el('div', { class: 'muted', style: { fontSize: '12.5px', fontWeight: 600, margin: '4px 0 6px' }, text: 'Landingspagina’s vanaf LinkedIn' }),
        barList(liLanding.map((r) => ({ label: r.landing || '/', vals: [fmt.n(r.s), fmt.n(r.l)], bar: r.s, k: r.landing })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }], { onClick: (r) => { S.filters.channel = 'LinkedIn'; setFilter('landing', r.k); }, limit: 5, empty: 'Nog geen bezoek vanaf LinkedIn.' }),
        el('div', { class: 'note', text: 'Tip: zet UTM-tags in je LinkedIn-links (bijv. ?utm_source=linkedin&utm_medium=social&utm_campaign=post-sourcing) om per post te zien wat het oplevert.' })),
      card('Campagnes (UTM)', { span: 6, sub: 'utm_campaign · sessies · leads' }, barList(liCamp.map((r) => ({ label: r.k || '(geen)', vals: [fmt.n(r.s), fmt.n(r.l)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }], { onClick: (r) => setFilter('utm_campaign', r.k), empty: 'Nog geen campagnelinks gebruikt.' }),
        (dm.utm_source || []).filter((r) => r.k).length ? el('div', { style: { marginTop: '14px' } }, el('div', { class: 'muted', style: { fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }, text: 'Per bron (utm_source)' }),
          barList((dm.utm_source || []).filter((r) => r.k).map((r) => ({ label: r.k, vals: [fmt.n(r.s), fmt.n(r.l)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }], { onClick: (r) => setFilter('utm_source', r.k), limit: 5 })) : null),
      card('Verwijzende websites', { span: 4, sub: 'Sessies · leads' }, barList(refs.map((r) => ({ label: r.k || '(geen)', vals: [fmt.n(r.s), fmt.n(r.l)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }], { onClick: (r) => setFilter('ref', r.k) })),
      card('AI-assistenten (GEO)', { span: 4, sub: 'Bezoek via ChatGPT, Perplexity, Gemini, Copilot, Claude' },
        el('div', { class: 'tiles', style: { gridTemplateColumns: 'repeat(2, minmax(0,1fr))', marginBottom: '12px' } }, tile('Sessies', fmt.n(ai.s)), tile('Leads', fmt.n(ai.l))),
        barList(refs.filter((r) => /chatgpt|openai|perplexity|gemini|copilot|claude|you\.com|phind|mistral|deepseek|grok/.test(r.k || '')).map((r) => ({ label: r.k, vals: [fmt.n(r.s)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }], { onClick: (r) => setFilter('ref', r.k), empty: 'Nog geen bezoek vanuit AI-assistenten.' })),
      card('Zoekmachines', { span: 4, sub: 'Organisch zoekverkeer per zoekmachine' }, barList(search.map((r) => ({ label: r.k, vals: [fmt.n(r.s), fmt.n(r.l)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }], { onClick: (r) => setFilter('ref', r.k), empty: 'Nog geen zoekverkeer.' }),
        el('div', { class: 'note', text: 'Zoekwoorden zie je in Google Search Console; die geeft Google niet door aan websites.' }))));
    out.push(el('div', { style: { height: '16px' } }));
    out.push(el('div', { class: 'grid g-12' }, tableCard('Landingspagina’s', 'De eerste pagina van een bezoek', (dm.landing || []).map((r) => ({ ...r, conv: rate(r.cs, r.s) })), [
      { key: 'k', name: 'Landingspagina', onClick: (r) => setFilter('landing', r.k) }, { key: 's', name: 'Sessies', num: true, fmt: fmt.n }, { key: 'v', name: 'Bezoekers', num: true, fmt: fmt.n },
      { key: 'pv', name: 'Weergaven', num: true, fmt: fmt.n }, { key: 'l', name: 'Leads', num: true, fmt: fmt.n }, { key: 'conv', name: 'Conversie', num: true, fmt: (v) => fmt.pct(v) },
    ], { sort: 's', file: 'landingspaginas' })));
    return out;
  }

  function viewContent(d) {
    const out = [];
    const grp = d.groups.map((r) => ({ ...r, exitRate: rate(r.exits, r.views) }));
    out.push(el('div', { class: 'grid g-12' }, tableCard('Paginagroepen', 'Diensten, vacatures, Fwd Match en meer', grp, [
      { key: 'k', name: 'Groep', onClick: (r) => setFilter('pgroup', r.k) }, { key: 'views', name: 'Weergaven', num: true, fmt: fmt.n }, { key: 'visitors', name: 'Bezoekers', num: true, fmt: fmt.n },
      { key: 't', name: 'Actieve tijd', num: true, fmt: fmt.dur }, { key: 'sc', name: 'Scrolldiepte', num: true, fmt: (v) => (v ? Math.round(v) + '%' : '–') },
      { key: 'entries', name: 'Instappen', num: true, fmt: fmt.n }, { key: 'exitRate', name: 'Uitstap', num: true, fmt: (v) => fmt.pct(v, 0) }, { key: 'leads', name: 'Leads', num: true, fmt: fmt.n },
    ], { sort: 'views', file: 'paginagroepen' })));
    out.push(el('div', { style: { height: '16px' } }));
    const pg = d.pages.map((r) => ({ ...r, exitRate: rate(r.exits, r.views) }));
    out.push(el('div', { class: 'grid g-12' }, tableCard('Alle pagina’s', 'Klik op een pagina om het hele dashboard daarop te filteren', pg, [
      { key: 'k', name: 'Pagina', onClick: (r) => setFilter('path', r.k), render: (r) => el('span', null, r.k, el('span', { class: 't2', text: r.title || '' })) },
      { key: 'views', name: 'Weergaven', num: true, fmt: fmt.n }, { key: 'visitors', name: 'Bezoekers', num: true, fmt: fmt.n },
      { key: 't', name: 'Actieve tijd', num: true, fmt: fmt.dur }, { key: 'sc', name: 'Scroll', num: true, fmt: (v) => (v ? Math.round(v) + '%' : '–') },
      { key: 'entries', name: 'Instappen', num: true, fmt: fmt.n }, { key: 'exitRate', name: 'Uitstap', num: true, fmt: (v) => fmt.pct(v, 0) }, { key: 'leads', name: 'Leads', num: true, fmt: fmt.n },
      { key: 'hm', name: '', render: (r) => el('button', { class: 'mini-btn', type: 'button', text: 'Heatmap', title: 'Bekijk de heatmap van deze pagina', onclick: (e) => { e.stopPropagation(); openHeatmap(r.k); } }) },
    ], { sort: 'views', file: 'paginas' })));
    out.push(el('div', { style: { height: '16px' } }));
    const sLabels = ['0–25%', '25–50%', '50–75%', '75–90%', '90–100%'];
    const tLabels = ['< 10 s', '10–30 s', '30–60 s', '1–3 min', '3–10 min', '> 10 min'];
    const sv = sLabels.map((_, i) => ((d.engagement.scroll.find((x) => x.b === i) || {}).n || 0));
    const tv = tLabels.map((_, i) => ((d.engagement.time.find((x) => x.b === i) || {}).n || 0));
    const sTot = sv.reduce((a, b) => a + b, 0) || 1, tTot = tv.reduce((a, b) => a + b, 0) || 1;
    out.push(el('div', { class: 'grid g-12' },
      card('Scrolldiepte', { span: 6, sub: 'Hoe ver bezoekers per pagina scrollen' }, C.columns({ values: sv, labels: sLabels, name: 'Paginaweergaven', fmt: (v) => fmt.n(v) + ' (' + fmt.pct(v / sTot, 0) + ')', aria: 'Scrolldiepte' })),
      card('Actieve tijd per sessie', { span: 6, sub: 'Verdeling van sessies' }, C.columns({ values: tv, labels: tLabels, name: 'Sessies', fmt: (v) => fmt.n(v) + ' (' + fmt.pct(v / tTot, 0) + ')', aria: 'Actieve tijd' })),
      card('Populaire routes', { span: 6, sub: 'Van pagina → naar pagina' }, barList(d.flows.routes.map((r) => ({ label: r.from + '  →  ' + r.to, vals: [fmt.n(r.n)], bar: r.n })), [{ name: 'Keer', strong: true }], { limit: 10 })),
      card('Uitstappagina’s', { span: 6, sub: 'Laatste pagina van een bezoek' }, barList([...d.pages].sort((a, b) => b.exits - a.exits).filter((r) => r.exits).map((r) => ({ label: r.k, vals: [fmt.n(r.exits), fmt.pct(rate(r.exits, r.views), 0)], bar: r.exits, k: r.k })), [{ name: 'Uitstappen', strong: true }, { name: 'Ratio' }], { onClick: (r) => setFilter('path', r.k) }))));
    out.push(el('div', { style: { height: '16px' } }));
    // clicks
    const cl = d.clicks.list;
    const by = (fn) => cl.filter(fn);
    const ctas = by((r) => (r.k === 'link' || r.k === 'button' || r.k === 'anker') && (r.a === 'main' || r.a === 'form'));
    const outb = by((r) => r.k === 'outbound' || r.k === 'social');
    const contact = by((r) => r.k === 'mailto' || r.k === 'tel');
    const dls = by((r) => r.k === 'download');
    const nav = by((r) => (r.a === 'header' || r.a === 'nav' || r.a === 'footer') && (r.k === 'link' || r.k === 'button' || r.k === 'anker'));
    const mk = (rows) => rows.map((r) => ({ label: r.label || r.h || '(zonder tekst)', sub: r.h && r.h !== r.label ? r.h : '', vals: [fmt.n(r.n), fmt.n(r.v)], bar: r.n }));
    const cols = [{ name: 'Klikken', strong: true }, { name: 'Bez.' }];
    out.push(el('div', { class: 'grid g-12' },
      card('Knoppen & links (CTA’s)', { span: 6, sub: 'Waar wordt op geklikt in de pagina’s' }, barList(mk(ctas), cols, { limit: 10 })),
      card('Menu & footer', { span: 6, sub: 'Klikken in header, navigatie en footer' }, barList(mk(nav), cols, { limit: 10 })),
      card('Uitgaande links', { span: 4, sub: 'LinkedIn, Software-site, partners' }, barList(mk(outb), cols)),
      card('Contact-acties', { span: 4, sub: 'E-mail en telefoon' }, barList(mk(contact), cols),
        d.clicks.copies.length ? el('div', { style: { marginTop: '12px' } }, el('div', { class: 'muted', style: { fontSize: '12.5px', fontWeight: 600, marginBottom: '6px' }, text: 'Gekopieerd' }), barList(d.clicks.copies.map((r) => ({ label: r.label, vals: [fmt.n(r.n)], bar: r.n })), [{ name: 'Keer', strong: true }])) : null),
      card('Downloads', { span: 4, sub: 'Onepager en andere bestanden' }, barList(mk(dls), cols, { empty: 'Nog geen downloads.' })),
      d.clicks.custom.length ? card('Eigen events', { span: 12, sub: 'Via data-sf-event of sfTrack()' }, barList(d.clicks.custom.map((r) => ({ label: r.name, sub: r.label || '', vals: [fmt.n(r.n)], bar: r.n })), [{ name: 'Keer', strong: true }])) : null));
    return out;
  }

  function viewLeads(d) {
    const out = [];
    const g = d.goals, gp = d.prevGoals;
    const lo = (g.lead_opdrachtgever || {}).n || 0, lk = (g.lead_kandidaat || {}).n || 0, fail = (g.form_fout || {}).n || 0;
    const subm = d.forms.list.reduce((a, r) => a + r.submits, 0), starts = d.forms.list.reduce((a, r) => a + r.starts, 0), views = d.forms.list.reduce((a, r) => a + r.views, 0);
    const ft = d.attribution.firstTouch;
    const avg = (key) => { let n = 0, s = 0; ft.forEach((r) => { if (r[key] !== null) { s += r[key] * r.n; n += r.n; } }); return n ? s / n : null; };
    out.push(el('div', { class: 'tiles', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))' } },
      tile('Leads opdrachtgevers', fmt.n(lo), delta(lo, (gp.lead_opdrachtgever || {}).n || 0)),
      tile('Leads kandidaten', fmt.n(lk), delta(lk, (gp.lead_kandidaat || {}).n || 0), null, 'Sollicitaties op vacatures, Fwd Match-uploads en "Werken bij Straightfwd".'),
      tile('Formulier gestart → verstuurd', fmt.pct(rate(subm, starts)), null, null, 'Van de mensen die een formulier begonnen in te vullen.'),
      tile('Formulier gezien → gestart', fmt.pct(rate(starts, views))),
      tile('Gem. dagen tot lead', avg('days') === null ? '–' : avg('days').toLocaleString('nl-NL', { maximumFractionDigits: 1 }), null, null, 'Tussen eerste bezoek en lead (alleen bezoekers met statistiek-toestemming).'),
      tile('Gem. bezoeken tot lead', avg('visits') === null ? '–' : avg('visits').toLocaleString('nl-NL', { maximumFractionDigits: 1 })),
      tile('Mislukte verzendingen', fmt.n(fail), delta(fail, (gp.form_fout || {}).n || 0, false), null, 'Het formulier gaf een foutmelding. Elke mislukte verzending is mogelijk een gemiste lead.')));
    out.push(el('div', { style: { height: '16px' } }));
    out.push(el('div', { class: 'grid g-12' },
      card('Funnel opdrachtgevers', { span: 6, sub: 'Sessies die elke stap haalden' }, funnel(d.funnels.opdrachtgever, ['Bezoek', 'Dienst- of contactpagina', 'Formulier in beeld', 'Formulier gestart', 'Formulier verstuurd', 'Lead ontvangen'])),
      card('Funnel kandidaten', { span: 6, sub: 'Vacatures en Fwd Match' }, funnel(d.funnels.kandidaat, ['Bezoek', 'Vacature of Fwd Match', 'Formulier in beeld', 'Formulier gestart', 'Formulier verstuurd', 'Lead ontvangen']))));
    out.push(el('div', { style: { height: '16px' } }));
    const fl = d.forms.list.map((r) => ({ ...r, sr: rate(r.starts, r.views), cr: rate(r.ok || r.submits, r.starts) }));
    out.push(el('div', { class: 'grid g-12' }, tableCard('Formulieren', 'Per pagina en formulier', fl, [
      { key: 'path', name: 'Pagina', onClick: (r) => setFilter('path', r.path), render: (r) => el('span', null, r.path, el('span', { class: 't2', text: r.k })) },
      { key: 'views', name: 'In beeld', num: true, fmt: fmt.n }, { key: 'starts', name: 'Gestart', num: true, fmt: fmt.n }, { key: 'sr', name: 'Startratio', num: true, fmt: (v) => fmt.pct(v, 0) },
      { key: 'submits', name: 'Verstuurd', num: true, fmt: fmt.n }, { key: 'ok', name: 'Gelukt', num: true, fmt: fmt.n },
      { key: 'fail', name: 'Mislukt', num: true, render: (r) => (r.fail ? el('span', { class: 'badge bad', text: '! ' + fmt.n(r.fail) }) : '0') },
      { key: 'abandons', name: 'Afgehaakt', num: true, fmt: fmt.n }, { key: 'cr', name: 'Afronding', num: true, fmt: (v) => fmt.pct(v, 0) },
      { key: 'dur', name: 'Invultijd', num: true, fmt: (v) => (v ? fmt.dur(v * 1000) : '–') },
    ], { sort: 'starts', file: 'formulieren' })));
    out.push(el('div', { style: { height: '16px' } }));
    const abBy = {}; d.forms.fields.forEach((r) => { abBy[r.k + '|' + r.f] = r.n; });
    const fs = (d.forms.fieldStats || []).map((r) => ({ ...r, backRate: rate(r.back, r.n), lastHere: abBy[r.k + '|' + r.f] || 0 }));
    out.push(el('div', { class: 'grid g-12' }, tableCard('Veldanalyse', 'Per invulveld: hoe lang mensen erover doen, hoe vaak ze terugkeren en waar ze afhaken', fs, [
      { key: 'k', name: 'Formulier' }, { key: 'f', name: 'Veld', render: (r) => el('b', { text: r.f }) },
      { key: 'n', name: 'Gebruikt', num: true, fmt: fmt.n },
      { key: 't', name: 'Gem. tijd in veld', num: true, fmt: (v) => (v ? v.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + ' s' : '–') },
      { key: 'backRate', name: 'Opnieuw aangeklikt', num: true, render: (r) => (r.backRate > 0.3 ? el('span', { class: 'badge warn', text: fmt.pct(r.backRate, 0) }) : fmt.pct(r.backRate, 0)), sort: (r) => r.backRate },
      { key: 'lastHere', name: 'Laatste veld bij afhaken', num: true, render: (r) => (r.lastHere ? el('span', { class: 'badge bad', text: fmt.n(r.lastHere) + '×' }) : '0') },
    ], { sort: 'n', file: 'veldanalyse', empty: 'Nog geen veldmetingen. Die verschijnen zodra bezoekers een formulier invullen.' })));
    out.push(el('div', { style: { height: '16px' } }));
    const firstCh = {}; ft.forEach((r) => { (firstCh[r.k] ||= { k: r.k, lo: 0, lk: 0 })[r.goal === 'lead_opdrachtgever' ? 'lo' : 'lk'] += r.n; });
    const lastCh = {}; d.attribution.lastTouch.forEach((r) => { (lastCh[r.k] ||= { k: r.k, lo: 0, lk: 0 })[r.goal === 'lead_opdrachtgever' ? 'lo' : 'lk'] += r.n; });
    const attrRows = (o) => Object.values(o).map((r) => ({ label: r.k, vals: [fmt.n(r.lo), fmt.n(r.lk)], bar: r.lo + r.lk, k: r.k })).sort((a, b) => b.bar - a.bar);
    out.push(el('div', { class: 'grid g-12' },
      card('Leads naar eerste bron', { span: 4, sub: 'Hoe kende de lead je als eerste? (first touch)' }, barList(attrRows(firstCh), [{ name: 'Opdr.', strong: true }, { name: 'Kand.' }], { empty: 'Nog geen leads.' })),
      card('Leads naar laatste bron', { span: 4, sub: 'Via welk kanaal kwam het bezoek met de lead? (last touch)' }, barList(attrRows(lastCh), [{ name: 'Opdr.', strong: true }, { name: 'Kand.' }], { onClick: (r) => setFilter('channel', r.k), empty: 'Nog geen leads.' })),
      card('Eerste landingspagina van leads', { span: 4, sub: 'Waar de reis van een lead begon' }, barList(d.attribution.firstLanding.map((r) => ({ label: r.k || '/', vals: [fmt.n(r.n)], bar: r.n })), [{ name: 'Leads', strong: true }], { empty: 'Nog geen leads.' })),
      card('Gekozen onderwerp', { span: 4, sub: 'Keuzes in verstuurde formulieren' }, barList(d.forms.choices.map((r) => ({ label: r.v, sub: r.k, vals: [fmt.n(r.n)], bar: r.n })), [{ name: 'Leads', strong: true }], { empty: 'Nog geen keuzes geregistreerd.' })),
      card('Waar haken mensen af?', { span: 4, sub: 'Laatst aangeraakte veld bij afhaken' }, barList(d.forms.fields.map((r) => ({ label: r.f || '(onbekend)', sub: r.k, vals: [fmt.n(r.n)], bar: r.n })), [{ name: 'Keer', strong: true }], { empty: 'Niemand afgehaakt.' })),
      card('Campagnes die leads brachten', { span: 4, sub: 'utm_campaign van het eerste bezoek' }, barList(d.attribution.firstCampaign.map((r) => ({ label: r.k, vals: [fmt.n(r.n)], bar: r.n })), [{ name: 'Leads', strong: true }], { empty: 'Nog geen leads uit campagnelinks.' })),
      card('Alle leads', { span: 12, sub: 'Nieuwste eerst · anoniem: je ziet nooit wat er is ingevuld' }, conversionFeed(d.attribution.recent.filter((r) => /^lead_|form_fout/.test(r.goal)), d))));
    return out;
  }

  function viewVacatures(d) {
    const v = d.vacancies.list.filter((r) => r.path.startsWith('/vacatures/'));
    const overview = d.vacancies.list.find((r) => r.path === '/vacatures');
    const views = v.reduce((a, r) => a + r.views, 0), applies = v.reduce((a, r) => a + r.applies, 0), shares = v.reduce((a, r) => a + r.shares, 0);
    const fm = d.groups.find((g) => g.k === 'Fwd Match') || { views: 0, leads: 0, visitors: 0 };
    const out = [];
    out.push(el('div', { class: 'tiles', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))' } },
      tile('Vacatureweergaven', fmt.n(views)), tile('Overzichtspagina', fmt.n(overview ? overview.views : 0)),
      tile('Sollicitaties', fmt.n(applies + (overview ? overview.applies : 0))), tile('Conversie vacature', fmt.pct(rate(applies, views))),
      tile('Gedeeld', fmt.n(shares)), tile('Fwd Match-bezoekers', fmt.n(fm.visitors)), tile('Fwd Match-uploads', fmt.n(fm.leads))));
    out.push(el('div', { style: { height: '16px' } }));
    const rows = v.map((r) => ({ ...r, conv: rate(r.applies, r.views), name: (r.title || r.path).replace(/\s*\|.*$/, '') }));
    out.push(el('div', { class: 'grid g-12' }, tableCard('Per vacature', 'Elke vacature heeft een eigen URL om te delen', rows, [
      { key: 'name', name: 'Vacature', onClick: (r) => setFilter('path', r.path), render: (r) => el('span', null, r.name, el('span', { class: 't2', text: r.path })) },
      { key: 'views', name: 'Weergaven', num: true, fmt: fmt.n }, { key: 'visitors', name: 'Bezoekers', num: true, fmt: fmt.n },
      { key: 't', name: 'Actieve tijd', num: true, fmt: fmt.dur }, { key: 'fviews', name: 'Form. gezien', num: true, fmt: fmt.n }, { key: 'starts', name: 'Gestart', num: true, fmt: fmt.n },
      { key: 'applies', name: 'Sollicitaties', num: true, fmt: fmt.n }, { key: 'conv', name: 'Conversie', num: true, fmt: (x) => fmt.pct(x) },
      { key: 'shares', name: 'Gedeeld', num: true, fmt: fmt.n }, { key: 'top', name: 'Grootste bron' },
    ], { sort: 'views', file: 'vacatures', empty: 'Nog geen vacatureweergaven in deze periode.' })));
    out.push(el('div', { style: { height: '16px' } }));
    out.push(el('div', { class: 'grid g-12' },
      card('Waar kandidaten vandaan komen', { span: 6, sub: 'Sessies op vacatures en Fwd Match · sollicitaties' }, barList(d.vacancies.sources.map((r) => ({ label: r.k || 'Direct', icon: CH_ICON[r.k] || '•', vals: [fmt.n(r.s), fmt.n(r.l)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }, { name: 'Soll.' }], { onClick: (r) => setFilter('channel', r.k) })),
      card('Funnel kandidaten', { span: 6, sub: 'Sessies die elke stap haalden' }, funnel(d.funnels.kandidaat, ['Bezoek', 'Vacature of Fwd Match', 'Formulier in beeld', 'Formulier gestart', 'Formulier verstuurd', 'Lead ontvangen']))));
    return out;
  }

  function viewPubliek(d) {
    const dm = d.dims, out = [];
    const dev = dm.device || [], isNew = dm.is_new || [], cons = dm.consent || [];
    const devColor = { Desktop: 'var(--s1)', Mobiel: 'var(--s2)', Tablet: 'var(--s3)' };
    const nw = (isNew.find((r) => r.k === 'true') || {}).s || 0, rt = (isNew.find((r) => r.k === 'false') || {}).s || 0;
    const cy = (cons.find((r) => r.k === 'true') || {}).s || 0, cn = (cons.find((r) => r.k === 'false') || {}).s || 0;
    out.push(el('div', { class: 'grid g-12' },
      card('Apparaten', { span: 4, sub: 'Sessies' }, segBar(dev.map((r) => ({ label: r.k, v: r.s, color: devColor[r.k] || 'var(--prev)', dark: r.k === 'Tablet' })), { legendValues: true }),
        el('div', { style: { marginTop: '10px' } }, barList(dev.map((r) => ({ label: r.k, vals: [fmt.n(r.s), fmt.n(r.l), fmt.pct(rate(r.cs, r.s))], bar: r.s, k: r.k, color: devColor[r.k] })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }, { name: 'Conv.' }], { onClick: (r) => setFilter('device', r.k) }))),
      card('Nieuw of terugkerend', { span: 4, sub: 'Sessies (alleen met toestemming herkenbaar)' }, segBar([{ label: 'Nieuw', v: nw, color: 'var(--s1)' }, { label: 'Terugkerend', v: rt, color: 'var(--s2)' }], { legendValues: true }),
        el('div', { style: { marginTop: '10px' } }, barList(isNew.map((r) => ({ label: dimValue('is_new', r.k), vals: [fmt.n(r.s), fmt.n(r.l), fmt.pct(rate(r.cs, r.s))], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }, { name: 'Conv.' }], { onClick: (r) => setFilter('is_new', r.k) }))),
      card('Statistiek-toestemming', { span: 4, sub: 'Cookiebot-keuze van bezoekers' }, segBar([{ label: 'Met toestemming', v: cy, color: 'var(--s1)' }, { label: 'Zonder (anoniem per tabblad)', v: cn, color: 'var(--prev)', dark: true }], { legendValues: true }),
        el('div', { class: 'note', text: 'Zonder toestemming meten we wel het bezoek, maar zonder blijvende bezoekers-ID. Terugkerende bezoekers en dagen-tot-lead zijn dan niet herkenbaar.' }))));
    out.push(el('div', { style: { height: '16px' } }));
    const reg = (dm.region || []).filter((r) => (r.k || '').startsWith('NL-'));
    out.push(el('div', { class: 'grid g-12' },
      card('Provincies', { span: 5, sub: 'Sessies uit Nederland' }, tileMap(reg)),
      card('Steden', { span: 4, sub: 'Sessies · leads' }, barList((dm.city || []).map((r) => ({ label: r.k || '(onbekend)', vals: [fmt.n(r.s), fmt.n(r.l)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }, { name: 'Leads' }], { onClick: (r) => setFilter('city', r.k), limit: 10 })),
      card('Landen', { span: 3, sub: 'Sessies' }, barList((dm.country || []).map((r) => ({ label: dimValue('country', r.k), vals: [fmt.n(r.s)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }], { onClick: (r) => setFilter('country', r.k) }))));
    out.push(el('div', { style: { height: '16px' } }));
    out.push(el('div', { class: 'grid g-12' }, card('Wanneer bezoekers komen', { span: 12, sub: 'Start van sessies per weekdag en uur — handig om je LinkedIn-posts te timen' }, heatmap(d.heatmap))));
    out.push(el('div', { style: { height: '16px' } }));
    const simple = (dim, title, sub, span = 3) => card(title, { span, sub }, barList((dm[dim] || []).map((r) => ({ label: dimValue(dim, r.k), vals: [fmt.n(r.s)], bar: r.s, k: r.k })), [{ name: 'Sessies', strong: true }], { onClick: (r) => setFilter(dim, r.k) }));
    out.push(el('div', { class: 'grid g-12' }, simple('browser', 'Browsers', 'Incl. LinkedIn-app'), simple('os', 'Besturingssystemen', 'Sessies'), simple('screen', 'Schermformaten', 'Breedte × hoogte'), simple('lang', 'Taal van de browser', 'Sessies')));
    out.push(el('div', { style: { height: '16px' } }));
    out.push(el('div', { class: 'grid g-12' }, card('Terugkeer per week', { span: 12, sub: 'Van de bezoekers die in een week voor het eerst kwamen: welk deel kwam in de weken erna terug (laatste 12 weken, alleen met statistiek-toestemming)' }, cohort(d.retention || []))));
    return out;
  }

  function tileMap(rows) {
    const POS = { FR: [0, 2], GR: [0, 3], NH: [1, 1], FL: [1, 2], DR: [1, 3], ZH: [2, 1], UT: [2, 2], OV: [2, 3], ZE: [3, 0], NB: [3, 2], GE: [3, 3], LI: [4, 3] };
    const val = {}; rows.forEach((r) => { val[r.k.split('-')[1]] = r; });
    const max = Math.max(1, ...rows.map((r) => r.s));
    const grid = el('div', { class: 'tilemap', role: 'img', 'aria-label': 'Sessies per provincie' });
    const cells = Array.from({ length: 20 }, () => null);
    for (const [code, [r, c]] of Object.entries(POS)) cells[r * 4 + c] = code;
    cells.forEach((code) => {
      if (!code) { grid.append(el('div', { class: 'pt empty' })); return; }
      const r = val[code] || { s: 0, l: 0 };
      const lvl = r.s ? Math.min(7, 1 + Math.floor((r.s / max) * 6.999)) : 0;
      const dark = lvl >= 4;
      const b = el('button', { class: 'pt', type: 'button', style: { background: 'var(--seq-' + lvl + ')', color: dark ? '#fff' : 'var(--ink)' }, onclick: () => setFilter('region', 'NL-' + code), 'aria-label': PROVINCES[code] + ': ' + r.s + ' sessies' },
        el('span', { text: code, style: { opacity: 0.85, fontWeight: 600 } }), el('b', { text: fmt.compact(r.s) }));
      b.addEventListener('pointermove', (e) => C.showTip(e.clientX, e.clientY, PROVINCES[code], [{ label: 'sessies', value: fmt.n(r.s) }, { label: 'leads', value: fmt.n(r.l) }]));
      b.addEventListener('pointerleave', C.hideTip);
      grid.append(b);
    });
    return el('div', null, grid, el('div', { class: 'scale', style: { justifyContent: 'center' } }, 'minder', ...[1, 2, 3, 4, 5, 6, 7].map((i) => el('i', { style: { background: 'var(--seq-' + i + ')' } })), 'meer'));
  }

  function heatmap(cells) {
    const map = {}; let max = 1;
    cells.forEach((c) => { map[c.dow + '-' + c.h] = c.n; max = Math.max(max, c.n); });
    if (!cells.length) return emptyState('Nog geen sessies in deze periode.');
    const g = el('div', { class: 'heat', role: 'img', 'aria-label': 'Sessies per weekdag en uur' });
    g.append(el('div'));
    for (let h = 0; h < 24; h++) g.append(el('div', { class: 'hh', text: h % 3 === 0 ? String(h) : '' }));
    for (let dw = 1; dw <= 7; dw++) {
      g.append(el('div', { class: 'hl', text: DAYS[dw - 1] }));
      for (let h = 0; h < 24; h++) {
        const v = map[dw + '-' + h] || 0;
        const lvl = v ? Math.min(7, 1 + Math.floor((v / max) * 6.999)) : 0;
        const c = el('div', { class: 'c', style: { background: 'var(--seq-' + lvl + ')' }, tabindex: 0 });
        const show = (e) => { const r = c.getBoundingClientRect(); C.showTip(e?.clientX ?? r.left + r.width / 2, e?.clientY ?? r.top, DAYS[dw - 1] + ' ' + String(h).padStart(2, '0') + ':00–' + String(h + 1).padStart(2, '0') + ':00', [{ label: 'sessies', value: fmt.n(v) }]); };
        c.addEventListener('pointermove', show); c.addEventListener('focus', () => show()); c.addEventListener('pointerleave', C.hideTip); c.addEventListener('blur', C.hideTip);
        g.append(c);
      }
    }
    // best slots
    const top = [...cells].sort((a, b) => b.n - a.n).slice(0, 3).map((c) => DAYS[c.dow - 1] + ' ' + String(c.h).padStart(2, '0') + ':00');
    return el('div', null, g, el('div', { class: 'scale' }, 'minder', ...[1, 2, 3, 4, 5, 6, 7].map((i) => el('i', { style: { background: 'var(--seq-' + i + ')' } })), 'meer', el('span', { style: { marginLeft: 'auto' }, text: 'Drukste momenten: ' + top.join(' · ') })));
  }

  const VINFO = {
    LCP: ['Largest Contentful Paint', 'Hoe snel het grootste element (vaak de hero) zichtbaar is', [2500, 4000], fmt.ms],
    INP: ['Interaction to Next Paint', 'Hoe snel de pagina reageert op klikken en tikken', [200, 500], fmt.ms],
    CLS: ['Cumulative Layout Shift', 'Hoeveel de layout verspringt tijdens het laden', [0.1, 0.25], (v) => v.toLocaleString('nl-NL', { maximumFractionDigits: 3 })],
    FCP: ['First Contentful Paint', 'Eerste tekst of beeld op het scherm', [1800, 3000], fmt.ms],
    TTFB: ['Time to First Byte', 'Reactietijd van de server', [800, 1800], fmt.ms],
  };
  function status(v, [g, p]) {
    if (v <= g) return el('span', { class: 'status good' }, el('i', { text: '✓' }), 'Goed');
    if (v <= p) return el('span', { class: 'status warn' }, el('i', { text: '!' }), 'Kan beter');
    return el('span', { class: 'status bad' }, el('i', { text: '✕' }), 'Slecht');
  }
  function viewTechniek(d) {
    const out = [];
    const ov = d.vitals.overall;
    const cards = Object.entries(VINFO).map(([k, [full, desc, th, f]]) => {
      const all = ov.find((r) => r.name === k && !r.device);
      if (!all) return card(k, { span: 4, sub: full }, emptyState('Nog geen metingen.'));
      const mob = ov.find((r) => r.name === k && r.device === 'Mobiel'), desk = ov.find((r) => r.name === k && r.device === 'Desktop');
      const ni = all.n - all.good - all.poor;
      return card(k, { span: 4, sub: full },
        el('div', { class: 'vital' },
          el('div', { class: 'vn' }, el('span', { class: 'vv', text: f(all.p75) }), status(all.p75, th)),
          el('div', { class: 'muted', style: { fontSize: '12.5px' }, text: desc + ' · 75e percentiel van ' + fmt.n(all.n) + ' metingen' }),
          segBar([{ label: 'Goed', v: all.good, color: 'var(--good)' }, { label: 'Kan beter', v: ni, color: 'var(--warn)', dark: true }, { label: 'Slecht', v: all.poor, color: 'var(--bad)' }], { thin: true }),
          el('div', { style: { display: 'flex', gap: '16px', fontSize: '13px', marginTop: '4px' } },
            mob ? el('span', null, el('span', { class: 'muted', text: 'Mobiel ' }), el('b', { text: f(mob.p75) })) : null,
            desk ? el('span', null, el('span', { class: 'muted', text: 'Desktop ' }), el('b', { text: f(desk.p75) })) : null)));
    });
    out.push(el('div', { class: 'grid g-12' }, ...cards,
      card('Hoe lees je dit?', { span: 4, sub: 'Core Web Vitals' }, el('div', { class: 'muted', style: { fontSize: '13px' } },
        'Google gebruikt LCP, INP en CLS als rankingsignaal. Ze worden gemeten bij echte bezoekers op hun eigen apparaat. "Goed" betekent: 75% van de bezoeken haalt de norm. Klik in andere tabs op een pagina om per pagina te filteren.'))));
    out.push(el('div', { style: { height: '16px' } }));
    const pages = {};
    d.vitals.byPage.forEach((r) => { (pages[r.path] ||= { path: r.path })[r.name] = r.p75; pages[r.path]['n_' + r.name] = r.n; });
    const prow = Object.values(pages).map((r) => ({ ...r, n: r.n_LCP || r.n_CLS || 0 }));
    const vcell = (k) => (r) => (r[k] === undefined ? '–' : el('span', null, VINFO[k][3](r[k]), ' ', r[k] <= VINFO[k][2][0] ? el('span', { style: { color: 'var(--good)' }, title: 'Goed', text: '✓' }) : r[k] <= VINFO[k][2][1] ? el('span', { style: { color: '#B07A00' }, title: 'Kan beter', text: '!' }) : el('span', { style: { color: 'var(--bad)' }, title: 'Slecht', text: '✕' })));
    out.push(el('div', { class: 'grid g-12' }, tableCard('Snelheid per pagina', '75e percentiel per pagina (min. 2 metingen)', prow, [
      { key: 'path', name: 'Pagina', onClick: (r) => setFilter('path', r.path) }, { key: 'n', name: 'Metingen', num: true, fmt: fmt.n },
      { key: 'LCP', name: 'LCP', num: true, render: vcell('LCP') }, { key: 'INP', name: 'INP', num: true, render: vcell('INP') },
      { key: 'CLS', name: 'CLS', num: true, render: vcell('CLS') }, { key: 'FCP', name: 'FCP', num: true, render: vcell('FCP') }, { key: 'TTFB', name: 'TTFB', num: true, render: vcell('TTFB') },
    ], { sort: 'n', file: 'snelheid' })));
    out.push(el('div', { style: { height: '16px' } }));
    const q = d.quality;
    out.push(el('div', { class: 'grid g-12' },
      tableCard('JavaScript- en laadfouten', 'Fouten die bezoekers in hun browser kregen', q.errors, [
        { key: 'label', name: 'Fout', render: (r) => el('span', null, el('span', { class: 'badge' + (r.name === 'js_error' ? ' bad' : ''), text: r.name === 'js_error' ? 'Script' : 'Bestand' }), ' ', r.label) },
        { key: 'path', name: 'Pagina' }, { key: 'n', name: 'Keer', num: true, fmt: fmt.n }, { key: 's', name: 'Sessies', num: true, fmt: fmt.n }, { key: 'last', name: 'Laatst', fmt: (v) => timeAgo(v) },
      ], { sort: 'n', span: 12, file: 'fouten', empty: 'Geen fouten gemeten. 👌' }),
      tableCard('Pagina’s die niet bestaan (404)', 'Met de site die ernaar verwees — repareer of redirect deze links', q.notFound, [
        { key: 'path', name: 'URL' }, { key: 'ref', name: 'Verwezen vanaf', fmt: (v) => v || 'direct / onbekend' }, { key: 'n', name: 'Keer', num: true, fmt: fmt.n }, { key: 'last', name: 'Laatst', fmt: (v) => timeAgo(v) },
      ], { sort: 'n', span: 6, file: '404', empty: 'Geen 404-pagina’s bezocht.' }),
      tableCard('Frustratieklikken', 'Drie of meer snelle klikken op dezelfde plek', q.rage, [
        { key: 'label', name: 'Element' }, { key: 'path', name: 'Pagina', onClick: (r) => openHeatmap(r.path, 'rage') }, { key: 'n', name: 'Keer', num: true, fmt: fmt.n }, { key: 's', name: 'Sessies', num: true, fmt: fmt.n },
      ], { sort: 'n', span: 6, file: 'frustratieklikken', empty: 'Geen frustratieklikken gemeten.' }),
      tableCard('Dode klikken', 'Klikken op iets dat klikbaar lijkt maar niets doet — maak het een link of haal de suggestie weg', q.dead || [], [
        { key: 'label', name: 'Element' }, { key: 'path', name: 'Pagina', onClick: (r) => openHeatmap(r.path, 'dead') }, { key: 'n', name: 'Keer', num: true, fmt: fmt.n }, { key: 's', name: 'Sessies', num: true, fmt: fmt.n },
      ], { sort: 'n', span: 6, file: 'dode-klikken', empty: 'Geen dode klikken gemeten.' })));
    return out;
  }

  function viewLive() {
    const L = S.live;
    if (!L) return [emptyState('Live-gegevens laden…')];
    if (L.error) return [errorBox(L)];
    const mins = [];
    const now = new Date(L.serverTime);
    const map = new Map(L.perMin.map((r) => [new Date(r.m).toISOString().slice(0, 16), r.pv]));
    for (let i = 29; i >= 0; i--) { const t = new Date(now.getTime() - i * 60000); const k = t.toISOString().slice(0, 16); mins.push({ k, label: i === 0 ? 'nu' : '−' + i + 'm', tip: clock(t), v: map.get(k) || 0 }); }
    const hero = el('section', { class: 'card grad hero span-4' },
      el('div', null, el('div', { class: 'lbl' }, el('span', { class: 'live-dot' + (L.now ? '' : ' off'), style: { display: 'inline-block', marginRight: '8px' } }), 'Nu op de site'),
        el('div', { class: 'big', text: fmt.n(L.now) }), el('div', { class: 'muted', text: 'unieke bezoekers in de laatste 5 minuten' })),
      el('div', { class: 'muted', style: { fontSize: '12px' }, text: 'Ververst elke 10 seconden · ' + clock(L.serverTime) }));
    const chart = card('Paginaweergaven per minuut', { span: 8, sub: 'Laatste 30 minuten' }, C.columns({ values: mins.map((m) => m.v), labels: mins.map((m) => m.label), tipLabels: mins.map((m) => m.tip), name: 'weergaven', fmt: fmt.n, height: 190 }));
    const pages = card('Wie is er nu?', { span: 5, sub: 'Huidige pagina per bezoeker', cls: 'self-start' }, L.pages.length ? el('div', { class: 'feed', style: { maxHeight: '620px', overflowY: 'auto' } }, ...L.pages.map((p) => el('div', { class: 'fi' }, el('div', { class: 'ic', text: p.device === 'Mobiel' ? '📱' : p.device === 'Tablet' ? '▭' : '🖥' }),
      el('div', { class: 'tx' }, el('b', { text: p.path }), el('div', { class: 'd', text: [p.channel && 'via ' + p.channel, p.city, p.country].filter(Boolean).join(' · ') })), el('div', { class: 'tm', text: timeAgo(p.ts) })))) : emptyState('Op dit moment geen bezoekers.'));
    const ICON = { pageview: '👁', click: '↗', form_view: '▢', form_start: '✎', form_submit: '➤', form_result: '★', form_abandon: '↩', share: '⇪', copy: '⧉', rage_click: '⚡', js_error: '!', resource_error: '!' };
    const NAME = { pageview: 'Bekeek', click: 'Klikte op', form_view: 'Zag formulier', form_start: 'Begon formulier', form_submit: 'Verstuurde formulier', form_result: 'Formulier-resultaat', form_abandon: 'Haakte af bij formulier', share: 'Deelde', copy: 'Kopieerde', rage_click: 'Frustratieklik op', js_error: 'Fout', resource_error: 'Laadfout' };
    const feed = card('Live activiteit', { span: 7, sub: 'Laatste gebeurtenissen (24 uur)' }, L.feed.length ? el('div', { class: 'feed', style: { maxHeight: '620px', overflowY: 'auto' } }, ...L.feed.map((e) => {
      const key = e.type === 'pageview' ? 'pageview' : e.name;
      const cls = e.goal === 'lead_opdrachtgever' ? 'lo' : e.goal === 'lead_kandidaat' ? 'lk' : e.goal === 'form_fout' || key === 'js_error' ? 'bad' : '';
      const what = e.goal && /^lead|form_fout/.test(e.goal) ? (S.data && S.data.goalLabels ? S.data.goalLabels[e.goal] : e.goal) : (NAME[key] || key) + ' ' + (e.type === 'pageview' ? e.path : (e.label || ''));
      return el('div', { class: 'fi' }, el('div', { class: 'ic ' + cls, text: ICON[key] || '•' }),
        el('div', { class: 'tx' }, el('b', { text: what }), el('div', { class: 'd', text: [e.type !== 'pageview' ? e.path : null, e.channel, e.device, e.city].filter(Boolean).join(' · ') })),
        el('div', { class: 'tm', text: clock(e.ts) }));
    })) : emptyState('Nog geen activiteit in de afgelopen 24 uur.'));
    return [el('div', { class: 'grid g-12' }, hero, chart, pages, feed)];
  }

  function viewInfo() {
    const snippet = '<script defer src="/api/sfa" data-api="/api/sfa" data-cookieconsent="ignore"></script>';
    return [el('div', { class: 'grid g-12' },
      card('Trackingcode', { span: 7, sub: 'Wordt bij elke build automatisch in alle pagina’s van straightfwd.nl gezet' }, el('div', { class: 'code', text: snippet }),
        el('div', { class: 'note', text: 'Script en metingen lopen via straightfwd.nl zelf (/api/sfa): dat past binnen de beveiligingsregels (CSP) van de site en adblockers zien het niet als derde partij. data-cookieconsent="ignore" voorkomt dat Cookiebot het blokkeert; het script regelt zelf de toestemming.' })),
      card('Jezelf uitsluiten', { span: 5, sub: 'Zodat je eigen bezoeken niet meetellen' },
        el('p', { style: { margin: '0 0 12px' }, text: 'Open deze link één keer op elk apparaat en in elke browser die je gebruikt:' }),
        el('a', { class: 'pill-btn', href: 'https://straightfwd.nl/?sf_ignore=1', target: '_blank', rel: 'noopener', text: 'Sluit dit apparaat uit' }),
        el('div', { class: 'note', text: 'Weer meetellen? Gebruik ?sf_ignore=0.' })),
      card('Wat wordt er gemeten?', { span: 7 }, el('dl', { class: 'kv' },
        el('dt', { text: 'Bezoek' }), el('dd', { text: 'Paginaweergaven, sessies, actieve tijd, scrolldiepte, instap- en uitstappagina’s, routes.' }),
        el('dt', { text: 'Bron' }), el('dd', { text: 'Verwijzende site, kanaal (LinkedIn, zoekmachines, AI-assistenten, jobboards …), UTM-campagnes, eerste en laatste bron van leads.' }),
        el('dt', { text: 'Leads' }), el('dd', { text: 'Formulier in beeld, gestart, verstuurd, gelukt of mislukt (via /api/formulier en /api/cv), afhaakveld, gekozen onderwerp. Nooit de ingevulde tekst.' }),
        el('dt', { text: 'Interesse' }), el('dd', { text: 'Klikken op knoppen, kennismaking, e-mail, telefoon, LinkedIn, onepager-download, vacature delen, kopiëren.' }),
        el('dt', { text: 'Heatmaps' }), el('dd', { text: 'Klikposities (verankerd aan het element), scrolldiepte, de vouw, aandacht per sectie, dode klikken en frustratieklikken. Geen schermopnames en geen toetsaanslagen.' }),
        el('dt', { text: 'Sessies' }), el('dd', { text: 'Per bezoek de volgorde van pagina’s, klikken en formulierstappen, met tijd per stap. Anoniem.' }),
        el('dt', { text: 'Techniek' }), el('dd', { text: 'Core Web Vitals (LCP, INP, CLS, FCP, TTFB), JavaScript- en laadfouten, 404-pagina’s, frustratieklikken.' }),
        el('dt', { text: 'Publiek' }), el('dd', { text: 'Apparaat, browser, besturingssysteem, scherm, taal, land, provincie en stad (afgeleid van het IP-adres door Vercel; het IP-adres zelf wordt niet opgeslagen).' }))),
      card('Privacy', { span: 5 }, el('div', { style: { fontSize: '13.5px' } },
        el('p', { style: { marginTop: 0 }, text: 'Geen cookies, geen IP-adressen, geen gegevens naar derden. Met statistiek-toestemming in Cookiebot bewaart het script een willekeurige, anonieme bezoekers-ID in localStorage; zonder toestemming alleen voor dat ene tabblad (sessionStorage).' }),
        el('p', { text: 'Tip: noem "Straightfwd Analytics (eigen, first-party statistieken)" in je privacyverklaring en categoriseer de localStorage-sleutels sf_v, sf_s, sf_c en sf_f in Cookiebot als Statistieken.' }))),
      utmBuilder(),
      card('Eigen events toevoegen', { span: 12, sub: 'Voor als je later iets extra wilt meten' }, el('div', { class: 'code', text: '<!-- elk klikbaar element -->\n<a href="/sourcing" data-sf-event="banner_sourcing">Bekijk sourcing</a>\n\n<!-- of vanuit JavaScript -->\nsfTrack(\'video_bekeken\', { label: \'Intro-video\' });' })),
      card('Export', { span: 12, sub: 'Alle ruwe events in de gekozen periode en filters' }, el('a', { class: 'pill-btn', href: '#', text: 'Download CSV', onclick: (e) => { e.preventDefault(); const q = new URLSearchParams({ mode: 'export', site: S.site, from: S.from, to: S.to }); for (const [k, v] of Object.entries(S.filters)) q.set('f_' + k, v); location.href = '/api/stats?' + q; } }))) ];
  }

  // ---------------------------------------------------------------- heatmaps
  const HM_W = { d: 1280, t: 820, m: 390 };
  const VB_LABEL = { d: 'Desktop', t: 'Tablet', m: 'Mobiel' };
  const HM_VIEW_H = 760;
  let hmFrame = null, hmOrigin = null, hmReady = false, hmTimer = null, hmReq = 0;

  function openHeatmap(path, layer) {
    S.tab = 'heatmaps'; S.hm.path = path; S.hm.mode = 'click'; S.hm.layer = layer || 'all';
    load();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  async function loadHeatmap() {
    const id = ++hmReq;
    const view = $('#view');
    view.classList.add('loading');
    if (!S.hm.path && S.filters.path) S.hm.path = S.filters.path;
    try {
      let d = await api(baseQuery({ mode: 'heatmap', path: S.hm.path, vb: S.hm.vb }));
      if (id !== hmReq) return;
      if (!d.error && !S.hm.path && d.pages && d.pages.length) {
        S.hm.path = d.pages[0].path; writeHash();
        d = await api(baseQuery({ mode: 'heatmap', path: S.hm.path, vb: S.hm.vb }));
        if (id !== hmReq) return;
      }
      S.hm.data = d;
    } catch (e) {
      if (id !== hmReq) return;
      S.hm.data = { error: 'network', message: String(e) };
    }
    view.classList.remove('loading');
    render();
  }
  function hmSrc(path) {
    if (/^(localhost|127\.)/.test(location.hostname)) return location.origin + path + '?sf_hm=1';
    return 'https://' + S.site + (path || '/') + '?sf_hm=1';
  }
  function sendHm() {
    const H = S.hm.data && S.hm.data.heatmap;
    if (!hmReady || !hmFrame || !H) return;
    try {
      hmFrame.contentWindow.postMessage({ type: 'sfa:data', mode: S.hm.mode, layer: S.hm.layer, vb: S.hm.vb, points: H.points, scroll: H.scroll, fold: H.fold, sections: H.sections }, hmOrigin);
    } catch (e) { /* frame weg */ }
  }
  function hmFocus(sel) { if (hmReady && hmFrame && sel) { try { hmFrame.contentWindow.postMessage({ type: 'sfa:focus', s: sel }, hmOrigin); } catch (e) {} } }
  function hmStatus(text) { const st = $('#hm-status'); if (!st) return; st.textContent = text || ''; st.classList.toggle('on', !!text); }
  window.addEventListener('message', (e) => {
    if (!hmFrame || e.source !== hmFrame.contentWindow) return;
    const m = e.data || {};
    if (m.type === 'sfa:loaded') { hmOrigin = e.origin; hmFrame.contentWindow.postMessage({ type: 'sfa:hello' }, hmOrigin); }
    else if (m.type === 'sfa:ready') { hmReady = true; clearTimeout(hmTimer); hmStatus(''); sendHm(); }
  });
  function setHm(patch) {
    Object.assign(S.hm, patch);
    writeHash();
    const side = $('#hm-side'), legend = $('#hm-legend'), ctl = $('#hm-modes');
    if (side) side.replaceChildren(...hmSide());
    if (legend) legend.replaceChildren(...hmLegend());
    if (ctl) ctl.replaceChildren(...hmModeControls());
    sendHm();
  }
  function hmModeControls() {
    const H = S.hm.data.heatmap || { totals: {} };
    const seg = (items, cur, on) => el('div', { class: 'seg' }, ...items.map(([k, label, n]) => el('button', { type: 'button', 'aria-pressed': String(cur === k), onclick: () => on(k) }, label, n !== undefined ? el('span', { class: 'cnt', text: fmt.n(n) }) : null)));
    return [
      seg([['click', 'Klikken'], ['scroll', 'Scrollen'], ['attention', 'Aandacht']], S.hm.mode, (k) => setHm({ mode: k })),
      S.hm.mode === 'click' ? seg([['all', 'Alle klikken', H.totals.clicks], ['rage', 'Frustratie', H.totals.rage], ['dead', 'Dode klikken', H.totals.dead]], S.hm.layer, (k) => setHm({ layer: k })) : null,
    ];
  }
  function hmLegend() {
    const ramp = el('i', { class: 'ramp' });
    if (S.hm.mode === 'click') return [el('span', { text: 'minder klikken' }), ramp, el('span', { text: 'meer klikken' }), S.hm.layer !== 'all' ? el('span', { class: 'muted', style: { marginLeft: '12px' }, text: '○ = één plek met ' + (S.hm.layer === 'rage' ? 'frustratieklikken' : 'dode klikken') }) : null];
    if (S.hm.mode === 'scroll') return [el('span', { text: 'iedereen ziet dit' }), el('i', { class: 'ramp fog' }), el('span', { text: 'bijna niemand komt hier' })];
    return [el('span', { text: 'kort bekeken' }), ramp, el('span', { text: 'lang bekeken' })];
  }
  function hmSide() {
    const H = S.hm.data.heatmap;
    if (!H) return [];
    if (S.hm.mode === 'scroll') {
      const marks = [10, 25, 50, 75, 90, 100];
      const rows = H.scroll.length ? marks.map((p) => ({ label: p === 100 ? 'Onderkant van de pagina' : p + '% van de pagina', vals: [fmt.pct(H.scroll[Math.round(p / 5)], 0)], bar: H.scroll[Math.round(p / 5)] || 0 })) : [];
      return [card('Hoe ver wordt er gescrold?', { sub: 'Aandeel van de weergaven dat dit punt haalde' },
        barList(rows, [{ name: 'Bereikt', strong: true }], { empty: 'Nog geen scrollmetingen voor deze pagina.' }),
        H.fold !== null ? el('div', { class: 'note', text: 'Zonder te scrollen zien bezoekers gemiddeld de bovenste ' + fmt.pct(H.fold, 0) + ' van deze pagina (de "vouw").' }) : null)];
    }
    if (S.hm.mode === 'attention') {
      const rows = [...H.sections].sort((a, b) => b.reach - a.reach || b.avg - a.avg).map((r) => ({ label: r.k, vals: [Math.round(r.avg) + ' s', fmt.pct(r.reach, 0)], bar: r.avg }));
      return [card('Aandacht per sectie', { sub: 'Gemiddelde kijktijd (als in beeld) · deel dat de sectie zag' },
        barList(rows, [{ name: 'Tijd', strong: true }, { name: 'Zag het' }], { limit: 12, empty: 'Nog geen aandachtsmetingen voor deze pagina.' }),
        el('div', { class: 'note', text: 'Een sectie telt als "gezien" als hij minstens een seconde grotendeels in beeld was terwijl de bezoeker actief was.' }))];
    }
    const els = H.elements.filter((r) => (S.hm.layer === 'rage' ? r.rage : S.hm.layer === 'dead' ? r.dead : r.n));
    const tot = H.totals.clicks || 1;
    const list = el('div', { class: 'hm-list' });
    if (!els.length) list.append(emptyState(S.hm.layer === 'all' ? 'Nog geen klikken gemeten op deze pagina.' : 'Niets gevonden. 👌'));
    els.slice(0, 14).forEach((r) => {
      const v = S.hm.layer === 'rage' ? r.rage : S.hm.layer === 'dead' ? r.dead : r.n;
      const row = el('button', { class: 'hm-item', type: 'button', title: 'Toon in de heatmap', onclick: () => hmFocus(r.s), onmouseenter: () => hmFocus(r.s) },
        el('span', { class: 'hm-k', text: r.inter ? (r.h && /^(mailto|tel)/.test(r.h) ? '✉' : '↗') : '·' }),
        el('span', { class: 'hm-t' }, el('b', { text: r.label || '(zonder tekst)' }), el('small', { text: r.inter ? (r.h || 'knop') : 'geen link of knop' })),
        el('span', { class: 'hm-n' }, el('b', { text: fmt.n(v) }), S.hm.layer === 'all' ? el('small', { text: fmt.pct(v / tot, 0) }) : null),
        r.dead && S.hm.layer !== 'dead' ? el('span', { class: 'badge warn', title: 'Dode klikken', text: '○ ' + r.dead }) : null,
        r.rage && S.hm.layer !== 'rage' ? el('span', { class: 'badge bad', title: 'Frustratieklikken', text: '⚡' + r.rage }) : null);
      list.append(row);
    });
    return [card(S.hm.layer === 'rage' ? 'Frustratieklikken' : S.hm.layer === 'dead' ? 'Dode klikken' : 'Meest geklikt', { sub: 'Beweeg erover om het element in de pagina aan te wijzen' }, list)];
  }
  function viewHeatmaps() {
    const D = S.hm.data;
    if (!D) return [emptyState('Heatmap laden…')];
    if (D.error) return [errorBox(D)];
    const pages = D.pages || [];
    if (!pages.length && !S.hm.path) return [el('div', { class: 'banner' }, el('div', null, el('b', { text: 'Nog geen paginaweergaven in deze periode' }), 'Kies een langere periode. Klikposities, scrolldiepte en aandacht worden gemeten vanaf het moment dat de nieuwe meetcode live staat.'))];
    const H = D.heatmap || { totals: {}, scroll: [], points: [], elements: [], sections: [] };
    const cur = pages.find((p) => p.path === S.hm.path) || { path: S.hm.path, views: 0, vd: 0, vt: 0, vm: 0, title: '' };
    const sel = el('select', { class: 'hm-select', 'aria-label': 'Pagina', onchange: (e) => { S.hm.path = e.target.value; writeHash(); loadHeatmap(); } },
      ...(pages.some((p) => p.path === S.hm.path) ? [] : [el('option', { value: S.hm.path, text: S.hm.path })]),
      ...pages.map((p) => el('option', { value: p.path, text: p.path + '   ·   ' + fmt.n(p.views) + ' weergaven' })));
    sel.value = S.hm.path;
    const devSeg = el('div', { class: 'seg' }, ...['d', 't', 'm'].map((k) => el('button', {
      type: 'button', 'aria-pressed': String(S.hm.vb === k),
      onclick: () => { if (S.hm.vb !== k) { S.hm.vb = k; writeHash(); loadHeatmap(); } },
    }, VB_LABEL[k], el('span', { class: 'cnt', text: fmt.n(cur['v' + k]) }))));
    const controls = el('div', { class: 'hm-controls' },
      el('div', { class: 'hm-row' }, el('label', { class: 'hm-lbl', text: 'Pagina' }), sel, devSeg,
        el('a', { class: 'mini-btn', href: hmSrc(S.hm.path).replace(/\?sf_hm=1$/, ''), target: '_blank', rel: 'noopener', text: 'Open pagina ↗' })),
      el('div', { class: 'hm-row', id: 'hm-modes' }, ...hmModeControls()));
    const t = H.totals;
    const bottom = H.scroll && H.scroll.length ? H.scroll[H.scroll.length - 1] : null;
    const tiles = el('div', { class: 'tiles', style: { gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' } },
      tile('Weergaven', fmt.n(t.pv), null, null, 'Weergaven van deze pagina op ' + VB_LABEL[S.hm.vb].toLowerCase() + ' in de gekozen periode.'),
      tile('Klikken', fmt.n(t.clicks)), tile('Klikken per weergave', t.pv ? (t.clicks / t.pv).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '–'),
      tile('Gem. scrolldiepte', H.avgScroll !== null && H.avgScroll !== undefined ? Math.round(H.avgScroll) + '%' : '–'),
      tile('Haalt de onderkant', bottom === null ? '–' : fmt.pct(bottom, 0)),
      tile('Frustratieklikken', fmt.n(t.rage), null, null, 'Drie of meer snelle klikken op dezelfde plek.'),
      tile('Dode klikken', fmt.n(t.dead), null, null, 'Klik op iets dat klikbaar lijkt (handje, kaart, afbeelding) maar waarna er niets gebeurt.'));
    // viewer
    const vw = HM_W[S.hm.vb];
    const src = hmSrc(S.hm.path);
    const frame = el('iframe', { class: 'hm-frame', src, title: 'Heatmap van ' + S.hm.path, sandbox: 'allow-scripts allow-same-origin', referrerpolicy: 'no-referrer' });
    const stage = el('div', { class: 'hm-stage' + (S.hm.vb !== 'd' ? ' narrow' : ''), style: { maxWidth: S.hm.vb !== 'd' ? vw + 'px' : null } }, frame, el('div', { class: 'hm-status on', id: 'hm-status', text: 'Pagina laden…' }));
    const fit = () => {
      const w = stage.clientWidth; if (!w) return;
      const sc = Math.min(1, w / vw);
      frame.style.width = vw + 'px'; frame.style.height = Math.round(HM_VIEW_H / sc) + 'px'; frame.style.transform = 'scale(' + sc + ')';
    };
    try { new ResizeObserver(fit).observe(stage); } catch (e) { /* oude browser */ }
    requestAnimationFrame(fit);
    hmFrame = frame; hmReady = false; hmOrigin = null;
    clearTimeout(hmTimer);
    hmTimer = setTimeout(() => { if (!hmReady) hmStatus('De pagina laat zich hier (nog) niet tonen. Staat de nieuwste meetcode al live op ' + S.site + '? De cijfers hiernaast kloppen wel.'); }, 12000);
    const noData = !t.pv;
    const viewer = card(cur.title ? cur.title.replace(/\s*\|.*$/, '') : S.hm.path, { span: 8, sub: S.hm.path + ' · ' + VB_LABEL[S.hm.vb] + ' · ' + HM_W[S.hm.vb] + ' px breed' },
      noData ? el('div', { class: 'banner', style: { marginBottom: '12px' } }, el('div', null, el('b', { text: 'Geen metingen voor deze pagina op ' + VB_LABEL[S.hm.vb].toLowerCase() }), 'Kies een ander apparaat of een langere periode.')) : null,
      stage,
      el('div', { class: 'hm-legend', id: 'hm-legend' }, ...hmLegend()),
      el('div', { class: 'note', text: 'Je ziet de huidige versie van de pagina met de metingen uit de gekozen periode. Klikken zijn verankerd aan het element waarop geklikt is, dus ze schuiven mee als de layout verandert. In deze weergave doen links en formulieren niets en wordt er niet gemeten.' }));
    return [
      card('Heatmap', { span: 12, cls: 'hm-head' }, controls),
      el('div', { style: { height: '16px' } }),
      tiles,
      el('div', { style: { height: '16px' } }),
      el('div', { class: 'grid g-12' }, viewer, el('div', { class: 'span-4 hm-side', id: 'hm-side' }, ...hmSide())),
    ];
  }

  // ---------------------------------------------------------------- sessions
  let sesReq = 0;
  const SES_KINDS = [['all', 'Alle sessies'], ['lead', 'Met lead'], ['form', 'Met formulier'], ['return', 'Terugkerend'], ['long', '3+ pagina’s']];
  async function loadSessions(more) {
    const id = ++sesReq;
    const view = $('#view');
    if (!more) { view.classList.add('loading'); S.ses.open = null; }
    try {
      const d = await api(baseQuery({ mode: 'sessions', kind: S.ses.kind, offset: more ? S.ses.rows.length : 0 }));
      if (id !== sesReq) return;
      if (d.error) S.ses.error = d;
      else { S.ses.error = null; S.ses.rows = more ? S.ses.rows.concat(d.rows) : d.rows; S.ses.total = d.total; S.ses.goalLabels = d.goalLabels; S.ses.loaded = true; }
    } catch (e) { if (id !== sesReq) return; S.ses.error = { error: 'network', message: String(e) }; }
    view.classList.remove('loading');
    render();
  }
  async function toggleSession(sid) {
    S.ses.open = S.ses.open === sid ? null : sid;
    if (S.ses.open && !S.ses.detail[sid]) {
      render();
      try { const d = await api(baseQuery({ mode: 'session', sid })); S.ses.detail[sid] = d.events || []; }
      catch (e) { S.ses.detail[sid] = []; }
    }
    render();
  }
  function fmtOff(ms) { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); return '+' + m + ':' + String(s % 60).padStart(2, '0'); }
  function dayTime(ts) { return new Intl.DateTimeFormat('nl-NL', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); }
  function goalBadge(g) {
    const lbl = (S.ses.goalLabels || {})[g] || g;
    const cls = g === 'lead_opdrachtgever' ? 'lo' : g === 'lead_kandidaat' ? 'lk' : g === 'form_fout' ? 'bad' : '';
    return el('span', { class: 'badge ' + cls, text: lbl });
  }
  function timeline(evs) {
    if (!evs) return emptyState('Laden…');
    if (!evs.length) return emptyState('Geen details gevonden.');
    const t0 = new Date(evs[0].ts).getTime();
    const eng = {};
    evs.forEach((e) => { if (e.type === 'engage' && e.pv) { const x = eng[e.pv] || (eng[e.pv] = { t: 0, sc: 0 }); x.t = Math.max(x.t, e.val || 0); x.sc = Math.max(x.sc, e.sc || 0); } });
    const steps = [];
    const q = (s) => '“' + (s || '…') + '”';
    evs.forEach((e) => {
      const off = fmtOff(new Date(e.ts).getTime() - t0);
      if (e.type === 'pageview') {
        const g = eng[e.pv] || {};
        steps.push({ off, ic: '👁', cls: 'pv', t: 'Bekeek ' + e.path, d: [e.title && e.title.replace(/\s*\|.*$/, ''), g.t ? fmt.dur(g.t) + ' actief' : null, g.sc ? g.sc + '% gescrold' : null].filter(Boolean).join(' · ') });
        return;
      }
      if (e.type !== 'event') return;
      if (e.name === 'form_result') {
        if (e.ok === '1') steps.push({ off, ic: '★', cls: e.goal === 'lead_kandidaat' ? 'lk' : 'lo', t: (S.ses.goalLabels || {})[e.goal] || 'Formulier verstuurd', d: e.label ? 'formulier ' + e.label : '' });
        else steps.push({ off, ic: '!', cls: 'bad', t: 'Versturen mislukt', d: e.label ? 'formulier ' + e.label : '' });
        return;
      }
      const map = {
        click: ['↗', 'Klikte op ' + q(e.label), e.h || ''],
        rage_click: ['⚡', 'Frustratieklik op ' + q(e.label), 'drie keer of vaker snel achter elkaar', 'bad'],
        form_view: ['▢', 'Zag het formulier', e.label || ''],
        form_start: ['✎', 'Begon met invullen', e.f ? 'eerste veld: ' + e.f : ''],
        form_submit: ['➤', 'Drukte op versturen', e.label || ''],
        form_abandon: ['↩', 'Haakte af bij het formulier', e.last ? 'laatste veld: ' + e.last : '', 'bad'],
        share: ['⇪', 'Deelde de pagina', e.label || ''],
        copy: ['⧉', 'Kopieerde ' + (e.label || 'tekst'), ''],
        js_error: ['!', 'Kreeg een foutmelding', e.label || '', 'bad'],
        resource_error: ['!', 'Iets laadde niet', e.label || '', 'bad'],
      };
      let m = map[e.name];
      if (e.name === 'tap') { if (e.dc !== '1') return; m = ['○', 'Klikte op iets dat niets deed: ' + q(e.label), '', 'bad']; }
      if (!m) m = ['•', 'Event ' + e.name, e.label || ''];
      steps.push({ off, ic: m[0], t: m[1], d: m[2], cls: m[3] || '' });
    });
    const f = evs.find((e) => e.type === 'pageview') || evs[0];
    const src = f.utm_campaign ? 'campagne ' + f.utm_campaign : f.ref ? f.ref : (f.channel || 'Direct');
    const facts = [
      ['Bron', (f.channel || 'Direct') + (src && src !== f.channel ? ' · ' + src : '')],
      ['Bezoeker', f.is_new === false ? 'Terugkerend' : f.is_new ? 'Eerste bezoek' : 'Onbekend (zonder toestemming)'],
      ['Apparaat', [f.device, f.browser, f.os].filter(Boolean).join(' · ')],
      ['Plaats', [f.city, f.region && f.country === 'NL' ? PROVINCES[f.region] : null, f.country ? dimValue('country', f.country) : null].filter(Boolean).join(', ')],
    ];
    return el('div', { class: 'tl-wrap' },
      el('dl', { class: 'kv tl-facts' }, ...facts.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v || '–' })])),
      el('ol', { class: 'tl' }, ...steps.map((s) => el('li', { class: s.cls }, el('span', { class: 'tl-off', text: s.off }), el('span', { class: 'tl-ic', text: s.ic }), el('div', null, el('b', { text: s.t }), s.d ? el('small', { text: s.d }) : null)))));
  }
  function viewSessions() {
    const st = S.ses;
    if (st.error) return [errorBox(st.error)];
    if (!st.loaded) return [emptyState('Sessies laden…')];
    const seg = el('div', { class: 'seg' }, ...SES_KINDS.map(([k, label]) => el('button', { type: 'button', 'aria-pressed': String(st.kind === k), text: label, onclick: () => { if (st.kind !== k) { st.kind = k; writeHash(); loadSessions(false); } } })));
    const list = el('div', { class: 'ses-list' });
    if (!st.rows.length) list.append(emptyState('Geen sessies gevonden met deze filters en periode.'));
    st.rows.forEach((r) => {
      const open = st.open === r.sid;
      const route = r.pvs > 1 ? r.landing + '  →  ' + r.exit : r.landing;
      const row = el('button', { class: 'ses-row' + (open ? ' open' : ''), type: 'button', 'aria-expanded': String(open), onclick: () => toggleSession(r.sid) },
        el('span', { class: 'ses-when' }, el('b', { text: dayTime(r.t0) }), el('small', { text: r.isNew === false ? 'terugkerend' : 'nieuw' })),
        el('span', { class: 'ses-src' }, el('span', { class: 'muted', text: (CH_ICON[r.channel] || '•') + ' ' }), r.channel || 'Direct', el('small', { text: r.camp || r.ref || '' })),
        el('span', { class: 'ses-route' }, el('b', { text: route }), el('small', { text: r.pvs + (r.pvs === 1 ? ' pagina' : ' pagina’s') + ' · ' + fmt.dur(r.dur) + (r.clicks ? ' · ' + r.clicks + ' klik' + (r.clicks === 1 ? '' : 'ken') : '') })),
        el('span', { class: 'ses-dev' }, el('span', { text: r.device === 'Mobiel' ? '📱' : r.device === 'Tablet' ? '▭' : '🖥' }), el('small', { text: [r.city, r.browser].filter(Boolean).join(' · ') })),
        el('span', { class: 'ses-goals' }, ...r.goals.filter((g) => /^lead_|form_fout|kennismaking|vacature_voorleggen|mail|bellen/.test(g)).map(goalBadge)));
      list.append(row);
      if (open) list.append(el('div', { class: 'ses-detail' }, timeline(st.detail[r.sid])));
    });
    const more = st.rows.length < st.total ? el('button', { class: 'pill-btn ghost', type: 'button', style: { marginTop: '12px' }, text: 'Meer sessies laden (' + fmt.n(st.total - st.rows.length) + ' over)', onclick: () => loadSessions(true) }) : null;
    return [
      el('div', { class: 'controls', style: { marginBottom: '12px' } }, seg, el('span', { class: 'range-label', text: fmt.n(st.total) + (st.total === 1 ? ' sessie' : ' sessies') })),
      card('Bezoekersreizen', { span: 12, sub: 'Elke sessie stap voor stap: waar iemand vandaan kwam, wat hij bekeek en aanklikte, en waar hij afhaakte of converteerde. Anoniem: je ziet nooit wat er is ingevuld.' }, list, more),
    ];
  }

  // ---------------------------------------------------------------- retention
  function cohort(rows) {
    if (!rows.length) return emptyState('Nog te weinig bezoekers met statistiek-toestemming om terugkeer te tonen.');
    const by = {}; rows.forEach((r) => { (by[r.c] ||= {})[r.k] = r.n; });
    const cs = Object.keys(by).sort();
    const K = 8, today = ymdLocal();
    const t = el('table', { class: 'tbl cohort' });
    t.append(el('thead', null, el('tr', null, el('th', { text: 'Eerste bezoek in week van' }), el('th', { class: 'num', text: 'Nieuwe bezoekers' }),
      ...Array.from({ length: K - 1 }, (_, i) => el('th', { class: 'num', text: 'Week +' + (i + 1) })))));
    const tb = el('tbody');
    cs.forEach((c) => {
      const size = by[c][0] || 0, weeks = Math.floor(dayDiff(c, today) / 7);
      tb.append(el('tr', null, el('td', { text: dLabel(c, true) }), el('td', { class: 'num', text: fmt.n(size) }),
        ...Array.from({ length: K - 1 }, (_, j) => {
          const i = j + 1;
          if (i > weeks) return el('td', { class: 'num muted', text: '' });
          const v = by[c][i] || 0, p = size ? v / size : 0;
          const lvl = v ? Math.min(7, 1 + Math.floor(p * 12)) : 0;
          const td = el('td', { class: 'num cell', style: { background: 'var(--seq-' + lvl + ')', color: lvl >= 4 ? '#fff' : 'var(--ink)' }, text: fmt.pct(p, 0) });
          td.addEventListener('pointermove', (e) => C.showTip(e.clientX, e.clientY, 'Week van ' + dLabel(c, true) + ' · week +' + i, [{ label: 'terug', value: fmt.n(v) + ' van ' + fmt.n(size) }]));
          td.addEventListener('pointerleave', C.hideTip);
          return td;
        })));
    });
    t.append(tb);
    return el('div', { class: 'tbl-wrap' }, t);
  }

  // ---------------------------------------------------------------- UTM builder
  function utmBuilder() {
    const pagesList = ['/', '/werving-en-selectie', '/freelance', '/sourcing', '/employer-branding', '/recruitment-marketing', '/vacatures', '/cv-uploaden', '/over-ons', '/contact'];
    const f = { page: el('input', { class: 'inp', list: 'utm-pages', value: 'https://straightfwd.nl/', 'aria-label': 'Pagina' }),
      source: el('input', { class: 'inp', value: 'linkedin', 'aria-label': 'Bron' }),
      medium: el('input', { class: 'inp', value: 'social', 'aria-label': 'Medium' }),
      campaign: el('input', { class: 'inp', placeholder: 'bijv. post-sourcing-nov', 'aria-label': 'Campagne' }),
      content: el('input', { class: 'inp', placeholder: 'optioneel, bijv. carrousel', 'aria-label': 'Inhoud' }) };
    const out = el('div', { class: 'code', style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } });
    const copy = el('button', { class: 'pill-btn', type: 'button', text: 'Kopieer link' });
    const update = () => {
      let u; try { u = new URL(f.page.value.trim() || 'https://straightfwd.nl/', 'https://straightfwd.nl'); } catch (e) { out.textContent = 'Ongeldige pagina-URL'; return; }
      const slug = (v) => v.trim().toLowerCase().replace(/\s+/g, '-');
      [['utm_source', f.source], ['utm_medium', f.medium], ['utm_campaign', f.campaign], ['utm_content', f.content]].forEach(([k, i]) => { const v = slug(i.value); if (v) u.searchParams.set(k, v); else u.searchParams.delete(k); });
      out.textContent = u.toString();
    };
    Object.values(f).forEach((i) => i.addEventListener('input', update));
    copy.onclick = async () => { try { await navigator.clipboard.writeText(out.textContent); copy.textContent = 'Gekopieerd ✓'; setTimeout(() => { copy.textContent = 'Kopieer link'; }, 1600); } catch (e) { /* geen klembord */ } };
    update();
    const fld = (label, input) => el('label', { class: 'fld' }, el('span', { text: label }), input);
    return card('Campagnelink maken', { span: 12, sub: 'Zet deze link in je LinkedIn-post, nieuwsbrief of vacature: dan zie je per post precies wat het oplevert (Acquisitie → Campagnes)' },
      el('datalist', { id: 'utm-pages' }, ...pagesList.map((p) => el('option', { value: 'https://straightfwd.nl' + p }))),
      el('div', { class: 'utm-grid' }, fld('Pagina', f.page), fld('Bron (utm_source)', f.source), fld('Medium (utm_medium)', f.medium), fld('Campagne (utm_campaign)', f.campaign), fld('Inhoud (utm_content)', f.content)),
      el('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap' } }, el('div', { style: { flex: '1', minWidth: '260px' } }, out), copy));
  }

  function errorBox(d) {
    if (d.error === 'no_database') return el('div', { class: 'banner' }, el('div', null, el('b', { text: 'Nog geen database gekoppeld' }), 'Koppel een Postgres-database (Neon) aan het Vercel-project straightfwd-analytics. Daarna verschijnen de eerste bezoeken hier automatisch.'));
    return el('div', { class: 'banner' }, el('div', null, el('b', { text: 'Er ging iets mis bij het laden' }), d.message || d.error));
  }

  function render() {
    const view = $('#view');
    const d = S.data;
    C.hideTip();
    if (S.tab === 'live') { view.replaceChildren(...viewLive()); return; }
    if (S.tab === 'info') { view.replaceChildren(...viewInfo()); return; }
    if (S.tab === 'heatmaps') { view.replaceChildren(...viewHeatmaps()); return; }
    if (S.tab === 'sessies') { view.replaceChildren(...viewSessions()); return; }
    if (!d) { view.replaceChildren(emptyState('Laden…')); return; }
    if (d.error) { view.replaceChildren(errorBox(d)); return; }
    const noData = !d.kpis.pageviews && !Object.keys(d.goals).length;
    const fn = { overzicht: viewOverzicht, acquisitie: viewAcquisitie, content: viewContent, leads: viewLeads, vacatures: viewVacatures, publiek: viewPubliek, techniek: viewTechniek }[S.tab] || viewOverzicht;
    const nodes = fn(d);
    if (noData) nodes.unshift(el('div', { class: 'banner' }, el('div', null, el('b', { text: 'Nog geen bezoeken in deze periode' }), Object.keys(S.filters).length ? 'Probeer een filter te verwijderen of kies een langere periode.' : 'Zodra iemand straightfwd.nl bezoekt, verschijnt het hier (live tab: binnen enkele seconden).')));
    view.replaceChildren(...nodes);
  }

  // ---------------------------------------------------------------- init
  function initTheme() {
    let t = null; try { t = localStorage.getItem('sfa_theme'); } catch (e) {}
    if (!t) t = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    S.theme = t; document.documentElement.setAttribute('data-theme', t);
  }
  function init() {
    initTheme();
    readHash();
    $('#compare').onclick = () => { S.compare = !S.compare; writeHash(); renderControls(); render(); };
    $('#applyRange').onclick = () => { const f = $('#from').value, t = $('#to').value; if (f && t) { S.from = f <= t ? f : t; S.to = f <= t ? t : f; load(); } };
    $('#theme').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; document.documentElement.setAttribute('data-theme', S.theme); try { localStorage.setItem('sfa_theme', S.theme); } catch (e) {} render(); };
    $('#logout').onclick = async () => { await fetch('/api/login', { method: 'DELETE' }); location.href = '/login'; };
    $('#livePill').onclick = () => { S.tab = 'live'; writeHash(); renderControls(); render(); loadLive(); };
    $('#refresh').onclick = () => load();
    $('#siteSel').onchange = (e) => { S.site = e.target.value; S.filters = {}; load(); loadLive(); };
    window.addEventListener('hashchange', () => { const before = JSON.stringify([S.tab, S.from, S.to, S.filters, S.site]); readHash(); if (JSON.stringify([S.tab, S.from, S.to, S.filters, S.site]) !== before) load(); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') loadLive(); });
    load();
    loadLive();
  }
  init();
})();
