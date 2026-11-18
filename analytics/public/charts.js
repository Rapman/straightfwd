/* Straightfwd Analytics — tiny SVG chart kit (no dependencies). */
(function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const C = {};

  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else if (k === 'text') e.textContent = v;
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
    return e;
  }
  function s(tag, attrs) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
    return e;
  }
  C.el = el; C.s = s;

  // ---- tooltip -------------------------------------------------------------------
  let tip;
  function tipEl() { if (!tip) { tip = el('div', { class: 'tip', role: 'status' }); document.body.append(tip); } return tip; }
  C.showTip = function (x, y, title, rows) {
    const t = tipEl();
    t.replaceChildren();
    if (title) t.append(el('div', { class: 'tt', text: title }));
    for (const r of rows || []) {
      const k = el('span', { class: 'k' });
      if (r.color) k.append(el('i', { class: 'key line', style: { background: r.color } }));
      k.append(document.createTextNode(r.label || ''));
      t.append(el('div', { class: 'tr' }, el('b', { text: r.value }), k));
    }
    t.classList.add('on');
    const w = t.offsetWidth, h = t.offsetHeight;
    let left = x + 14, top = y - h - 12;
    if (left + w > window.innerWidth - 8) left = x - w - 14;
    if (top < 8) top = y + 16;
    t.style.left = left + 'px'; t.style.top = top + 'px';
  };
  C.hideTip = function () { if (tip) tip.classList.remove('on'); };

  // ---- scales -----------------------------------------------------------------------
  function niceMax(v, ticks = 4) {
    if (!v || v <= 0) return { max: ticks, step: 1 };
    const raw = v / ticks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    return { max: Math.ceil(v / step) * step, step };
  }
  C.niceMax = niceMax;
  const fmtAxis = (v) => (v >= 10000 ? (v / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) + 'K' : v.toLocaleString('nl-NL', { maximumFractionDigits: 2 }));

  // ---- line chart -------------------------------------------------------------------
  // opts: { labels:[], tipLabels:[], series:[{name,color,values,fill,muted}], height, fmt, notes:[{i,text}], xEvery }
  C.line = function (opts) {
    const wrap = el('div', { class: 'chart' });
    const H = opts.height || 260;
    const M = { l: 44, r: 12, t: 12, b: 26 };
    function draw() {
      const W = Math.max(280, wrap.clientWidth || 600);
      wrap.replaceChildren();
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': opts.aria || 'Lijngrafiek' });
      const n = opts.labels.length;
      const all = opts.series.flatMap((x) => x.values.filter((v) => v !== null && v !== undefined));
      const { max, step } = niceMax(Math.max(1, ...all));
      const iw = W - M.l - M.r, ih = H - M.t - M.b;
      const X = (i) => M.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
      const Y = (v) => M.t + ih - (v / max) * ih;
      for (let v = 0; v <= max + 1e-9; v += step) {
        svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'gridline' }));
        const t = s('text', { x: M.l - 8, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = (opts.fmtAxis || fmtAxis)(v); svg.append(t);
      }
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 70))));
      opts.labels.forEach((lb, i) => {
        if (i % every !== 0 && i !== n - 1) return;
        if (i === n - 1 && i % every !== 0 && (n - 1) % every < every * 0.6) return;
        const t = s('text', { x: X(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle' }); t.textContent = lb; svg.append(t);
      });
      // notes markers
      (opts.notes || []).forEach((nt) => {
        if (nt.i < 0 || nt.i >= n) return;
        const g = s('g', { tabindex: 0, style: 'cursor:help' });
        g.append(s('line', { x1: X(nt.i), x2: X(nt.i), y1: M.t, y2: M.t + ih, stroke: 'var(--blush)', 'stroke-width': 2 }));
        g.append(s('circle', { cx: X(nt.i), cy: M.t + 2, r: 5, fill: 'var(--s2)', stroke: 'var(--surface)', 'stroke-width': 2 }));
        g.addEventListener('pointerenter', (e) => C.showTip(e.clientX, e.clientY, 'Notitie · ' + (opts.tipLabels || opts.labels)[nt.i], [{ label: '', value: nt.text }]));
        g.addEventListener('pointerleave', C.hideTip);
        svg.append(g);
      });
      // series (muted first)
      const ordered = [...opts.series].sort((a, b) => (b.muted ? 1 : 0) - (a.muted ? 1 : 0));
      for (const se of ordered) {
        let d = '', started = false, area = '', firstX = null, lastX = null;
        se.values.forEach((v, i) => {
          if (v === null || v === undefined) { started = false; return; }
          d += (started ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1);
          if (firstX === null) firstX = X(i); lastX = X(i);
          started = true;
        });
        if (se.fill && firstX !== null) {
          area = d + `L${lastX.toFixed(1)} ${Y(0)}L${firstX.toFixed(1)} ${Y(0)}Z`;
          svg.append(s('path', { d: area, fill: se.color, 'fill-opacity': 0.1, stroke: 'none' }));
        }
        svg.append(s('path', { d, fill: 'none', stroke: se.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
        // end dot for the main series
        if (!se.muted) {
          let li = -1; se.values.forEach((v, i) => { if (v !== null && v !== undefined) li = i; });
          if (li >= 0) svg.append(s('circle', { cx: X(li), cy: Y(se.values[li]), r: 4, fill: se.color, stroke: 'var(--surface)', 'stroke-width': 2 }));
        }
      }
      // crosshair
      const cross = s('line', { y1: M.t, y2: M.t + ih, stroke: 'var(--axis)', 'stroke-width': 1, visibility: 'hidden' });
      const dots = opts.series.map((se) => s('circle', { r: 4, fill: se.color, stroke: 'var(--surface)', 'stroke-width': 2, visibility: 'hidden' }));
      svg.append(cross, ...dots);
      const hit = s('rect', { x: M.l, y: 0, width: iw, height: H, fill: 'transparent', tabindex: 0, 'aria-label': 'Verken waarden' });
      let focusI = n - 1;
      function at(i, cx, cy) {
        i = Math.max(0, Math.min(n - 1, i));
        cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i)); cross.setAttribute('visibility', 'visible');
        const rows = [];
        opts.series.forEach((se, k) => {
          const v = se.values[i];
          if (v === null || v === undefined) { dots[k].setAttribute('visibility', 'hidden'); return; }
          dots[k].setAttribute('cx', X(i)); dots[k].setAttribute('cy', Y(v)); dots[k].setAttribute('visibility', 'visible');
          rows.push({ label: se.tipName ? se.tipName(i) : se.name, value: (se.fmt || opts.fmt || String)(v), color: se.color });
        });
        const r = svg.getBoundingClientRect();
        C.showTip(cx ?? r.left + (X(i) / W) * r.width, cy ?? r.top + 30, (opts.tipLabels || opts.labels)[i], rows);
      }
      hit.addEventListener('pointermove', (e) => {
        const r = svg.getBoundingClientRect();
        const x = ((e.clientX - r.left) / r.width) * W;
        focusI = n <= 1 ? 0 : Math.round(((x - M.l) / iw) * (n - 1));
        at(focusI, e.clientX, e.clientY);
      });
      const out = () => { cross.setAttribute('visibility', 'hidden'); dots.forEach((d) => d.setAttribute('visibility', 'hidden')); C.hideTip(); };
      hit.addEventListener('pointerleave', out);
      hit.addEventListener('blur', out);
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') { focusI = Math.max(0, focusI - 1); at(focusI); e.preventDefault(); }
        if (e.key === 'ArrowRight') { focusI = Math.min(n - 1, focusI + 1); at(focusI); e.preventDefault(); }
      });
      hit.addEventListener('focus', () => at(focusI));
      svg.insertBefore(hit, cross);
      wrap.append(svg);
    }
    C.onResize(wrap, draw);
    return wrap;
  };

  // ---- column chart (single series) ----------------------------------------------
  C.columns = function (opts) {
    const wrap = el('div', { class: 'chart' });
    const H = opts.height || 180;
    const M = { l: 36, r: 8, t: 10, b: 24 };
    function draw() {
      const W = Math.max(240, wrap.clientWidth || 400);
      wrap.replaceChildren();
      const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, height: H, role: 'img', 'aria-label': opts.aria || 'Staafgrafiek' });
      const n = opts.values.length;
      const { max, step } = niceMax(Math.max(1, ...opts.values));
      const iw = W - M.l - M.r, ih = H - M.t - M.b;
      const band = iw / n, bw = Math.min(24, band - 2);
      const Y = (v) => M.t + ih - (v / max) * ih;
      for (let v = 0; v <= max + 1e-9; v += step) {
        svg.append(s('line', { x1: M.l, x2: W - M.r, y1: Y(v), y2: Y(v), class: v === 0 ? 'axis' : 'gridline' }));
        const t = s('text', { x: M.l - 6, y: Y(v) + 4, 'text-anchor': 'end' }); t.textContent = fmtAxis(v); svg.append(t);
      }
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 46))));
      opts.values.forEach((v, i) => {
        const x = M.l + band * i + (band - bw) / 2;
        const y = Y(v), h = Math.max(0, Y(0) - y);
        const r = Math.min(4, h, bw / 2);
        const p = h > 0 ? `M${x} ${Y(0)}V${y + r}Q${x} ${y} ${x + r} ${y}H${x + bw - r}Q${x + bw} ${y} ${x + bw} ${y + r}V${Y(0)}Z` : '';
        if (p) svg.append(s('path', { d: p, fill: opts.color || 'var(--s1)' }));
        const hit = s('rect', { x: M.l + band * i, y: M.t, width: band, height: ih, fill: 'transparent', tabindex: 0 });
        const show = (e) => { const rr = svg.getBoundingClientRect(); C.showTip(e?.clientX ?? rr.left + ((x + bw / 2) / W) * rr.width, e?.clientY ?? rr.top + (y / H) * rr.height, opts.tipLabels ? opts.tipLabels[i] : opts.labels[i], [{ label: opts.name || '', value: (opts.fmt || String)(v) }]); };
        hit.addEventListener('pointermove', show); hit.addEventListener('focus', () => show()); hit.addEventListener('pointerleave', C.hideTip); hit.addEventListener('blur', C.hideTip);
        svg.append(hit);
        if (i % every === 0) { const t = s('text', { x: x + bw / 2, y: H - 6, 'text-anchor': 'middle' }); t.textContent = opts.labels[i]; svg.append(t); }
      });
      wrap.append(svg);
    }
    C.onResize(wrap, draw);
    return wrap;
  };

  // ---- sparkline ---------------------------------------------------------------------
  C.spark = function (values, color, w = 96, h = 30) {
    const svg = s('svg', { class: 'spark', width: w, height: h, viewBox: `0 0 ${w} ${h}`, 'aria-hidden': 'true' });
    const v = values.filter((x) => x !== null && x !== undefined);
    if (v.length < 2) return svg;
    const max = Math.max(...v), min = Math.min(0, ...v);
    const X = (i) => 2 + (i / (values.length - 1)) * (w - 4);
    const Y = (x) => h - 3 - ((x - min) / (max - min || 1)) * (h - 6);
    let d = '';
    values.forEach((x, i) => { if (x === null || x === undefined) return; d += (d ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x).toFixed(1); });
    svg.append(s('path', { d, fill: 'none', stroke: 'var(--prev)', 'stroke-width': 1.5, 'stroke-linejoin': 'round' }));
    let li = values.length - 1; while (li > 0 && (values[li] === null || values[li] === undefined)) li--;
    svg.append(s('circle', { cx: X(li), cy: Y(values[li]), r: 3, fill: color || 'var(--s1)' }));
    return svg;
  };

  // ---- resize helper -------------------------------------------------------------------
  const ro = 'ResizeObserver' in window ? new ResizeObserver((entries) => {
    for (const en of entries) { const f = en.target.__draw; const w = Math.round(en.contentRect.width); if (f && w && w !== en.target.__w) { en.target.__w = w; f(); } }
  }) : null;
  C.onResize = function (node, draw) {
    node.__draw = draw;
    if (ro) ro.observe(node);
    requestAnimationFrame(() => { node.__w = Math.round(node.clientWidth); draw(); });
  };

  window.SFC = C;
})();
