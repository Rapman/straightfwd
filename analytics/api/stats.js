// Dashboard data: GET /api/stats?site=&from=&to=&f_<dim>=   (auth required)
//   mode=live    -> realtime snapshot
//   mode=export  -> CSV of raw events in range
import { db, ensureSchema } from './_lib/db.js';
import { isAuthed } from './_lib/auth.js';
import { CANDIDATE_GROUPS, SERVICE_GROUPS, SITES, TZ, GOAL_LABELS, VITALS, normPath } from './_lib/config.js';
import { resolveRange } from './_lib/range.js';

const LEADS = ['lead_opdrachtgever', 'lead_kandidaat'];
const RECENT_GOALS = ['lead_opdrachtgever', 'lead_kandidaat', 'form_fout', 'mail', 'bellen', 'onepager', 'linkedin', 'gedeeld'];
const INTERACT = ['click', 'form_start', 'form_submit', 'share', 'copy'];
const BUILTIN = ['click', 'form_view', 'form_start', 'form_submit', 'form_result', 'form_abandon',
  'share', 'copy', 'rage_click', 'js_error', 'resource_error', 'tap'];

const FILTERS = {
  path: 'path', pgroup: 'pgroup', channel: 'channel', ref: 'ref', country: 'country', region: 'region',
  city: 'city', device: 'device', browser: 'browser', os: 'os', screen: 'screen', lang: 'lang',
  utm_source: 'utm_source', utm_medium: 'utm_medium', utm_campaign: 'utm_campaign', landing: 'landing',
  is_new: 'is_new', consent: 'consent',
};
const DIMS = ['channel', 'ref', 'utm_source', 'utm_medium', 'utm_campaign', 'landing', 'country', 'region',
  'city', 'device', 'browser', 'os', 'screen', 'lang', 'is_new', 'consent'];

const n = (v) => (v === null || v === undefined ? 0 : Number(v));

function buildWhere(sql, q, site, start, end) {
  let w = sql`site = ${site} and ts >= ${start} and ts < ${end}`;
  for (const [key, col] of Object.entries(FILTERS)) {
    const v = q['f_' + key];
    if (v === undefined || v === '') continue;
    if (v === '(geen)') w = sql`${w} and ${sql(col)} is null`;
    else if (col === 'is_new' || col === 'consent') w = sql`${w} and ${sql(col)} = ${v === 'true'}`;
    else if (col === 'region' && v.includes('-')) {
      const [c, r] = v.split('-');
      w = sql`${w} and country = ${c} and region = ${r}`;
    } else w = sql`${w} and ${sql(col)} = ${v}`;
  }
  return w;
}

// ---------------------------------------------------------------------------
async function kpis(sql, W) {
  const [r] = await sql`
    with e as materialized (select sid, vid, type, name, pv, val, is_new, consent, goal from events where ${W}),
    s as (
      select sid, min(vid) vid,
        count(*) filter (where type = 'pageview') n_pv,
        count(*) filter (where type = 'event' and name = any(${INTERACT})) n_int,
        bool_or(goal = any(${LEADS})) conv,
        bool_or(is_new) is_new,
        bool_or(consent) cm
      from e group by sid),
    eng as (select sid, sum(t) t from (select sid, pv, max(val) t from e where type = 'engage' group by sid, pv) x group by sid)
    select
      count(distinct s.vid) filter (where n_pv > 0) visitors,
      count(distinct s.vid) filter (where n_pv > 0 and is_new) new_visitors,
      count(*) filter (where n_pv > 0) sessions,
      coalesce(sum(n_pv), 0) pageviews,
      avg(coalesce(eng.t, 0)) filter (where n_pv > 0) avg_dur,
      avg(case when n_pv = 1 and coalesce(eng.t, 0) < 10000 and n_int = 0 then 1.0 else 0 end) filter (where n_pv > 0) bounce,
      count(*) filter (where conv) conv_sessions,
      count(*) filter (where cm and n_pv > 0) consent_sessions
    from s left join eng using (sid)`;
  const out = {};
  for (const [k, v] of Object.entries(r || {})) out[k] = n(v);
  return out;
}

async function goals(sql, W) {
  const rows = await sql`
    select goal, count(distinct (pv, coalesce(label, ''))) n, count(distinct sid) s
    from events where ${W} and goal is not null group by goal`;
  const out = {};
  for (const r of rows) out[r.goal] = { n: n(r.n), s: n(r.s) };
  return out;
}

async function series(sql, W, bucket) {
  const rows = await sql`
    with e as materialized (select ts, sid, vid, type, pv, label, goal from events where ${W})
    select to_char(date_trunc(${bucket}, ts at time zone ${TZ}), 'YYYY-MM-DD"T"HH24:MI') b,
      count(distinct vid) filter (where type = 'pageview') visitors,
      count(distinct sid) filter (where type = 'pageview') sessions,
      count(*) filter (where type = 'pageview') pageviews,
      count(distinct (pv, coalesce(label, ''))) filter (where goal = 'lead_opdrachtgever') lo,
      count(distinct (pv, coalesce(label, ''))) filter (where goal = 'lead_kandidaat') lk
    from e group by 1 order by 1`;
  return rows.map((r) => ({
    b: fmtLocal(r.b), visitors: n(r.visitors), sessions: n(r.sessions), pageviews: n(r.pageviews),
    lo: n(r.lo), lk: n(r.lk), leads: n(r.lo) + n(r.lk),
  }));
}

async function sessionSeries(sql, W, bucket) {
  const rows = await sql`
    with e as materialized (select ts, sid, type, name, pv, val from events where ${W}),
    s as (select sid, min(ts) t0,
            count(*) filter (where type = 'pageview') n_pv,
            count(*) filter (where type = 'event' and name = any(${INTERACT})) n_int
          from e group by sid),
    eng as (select sid, sum(t) t from (select sid, pv, max(val) t from e where type = 'engage' group by sid, pv) x group by sid)
    select to_char(date_trunc(${bucket}, t0 at time zone ${TZ}), 'YYYY-MM-DD"T"HH24:MI') b,
      avg(coalesce(eng.t, 0)) dur,
      avg(case when n_pv = 1 and coalesce(eng.t, 0) < 10000 and n_int = 0 then 1.0 else 0 end) bounce
    from s left join eng using (sid) where n_pv > 0 group by 1 order by 1`;
  return rows.map((r) => ({ b: fmtLocal(r.b), dur: n(r.dur), bounce: n(r.bounce) }));
}

function fmtLocal(d) {
  return d == null ? null : String(d);
}

async function dims(sql, W) {
  const parts = DIMS.map((d) => {
    const key = d === 'region' ? sql`case when region is null then null else country || '-' || region end`
      : d === 'is_new' || d === 'consent' ? sql`${sql(d)}::text` : sql`${sql(d)}`;
    return sql`
      select ${d}::text d, ${key} k,
        count(distinct sid) filter (where type = 'pageview') s,
        count(distinct vid) filter (where type = 'pageview') v,
        count(*) filter (where type = 'pageview') pv,
        count(distinct (pv, coalesce(label, ''))) filter (where goal = any(${LEADS})) l,
        count(distinct sid) filter (where goal = any(${LEADS})) cs
      from e group by 2`;
  });
  const union = parts.reduce((acc, p) => (acc ? sql`${acc} union all ${p}` : p), null);
  const rows = await sql`
    with e as materialized (select sid, vid, type, pv, label, goal, ${sql(DIMS)} from events where ${W})
    select * from (
      select u.*, row_number() over (partition by d order by s desc, l desc) rn from (${union}) u
    ) z where rn <= 60 and (s > 0 or l > 0)`;
  const out = {};
  for (const r of rows) {
    (out[r.d] ||= []).push({ k: r.k, s: n(r.s), v: n(r.v), pv: n(r.pv), l: n(r.l), cs: n(r.cs) });
  }
  return out;
}

async function pages(sql, W, col) {
  const c = sql(col);
  const rows = await sql`
    with e as materialized (select ts, sid, vid, type, path, title, pgroup, pv, val, meta, goal, label from events where ${W}),
    pvx as (select pv, ${c} g, title, sid, vid, ts from e where type = 'pageview'),
    eng as (select pv, max(val) t, max((meta->>'sc')::numeric) sc from e where type = 'engage' group by pv),
    lastpv as (select distinct on (sid) pv from pvx order by sid, ts desc),
    firstpv as (select distinct on (sid) pv from pvx order by sid, ts asc),
    leads as (select ${c} g, count(distinct (pv, coalesce(label, ''))) n from e where goal = any(${LEADS}) group by 1)
    select pvx.g, max(pvx.title) title, count(*) views, count(distinct pvx.vid) visitors,
      avg(eng.t) t, avg(eng.sc) sc, count(lastpv.pv) exits, count(firstpv.pv) entries,
      coalesce(max(leads.n), 0) leads
    from pvx
      left join eng using (pv)
      left join lastpv on lastpv.pv = pvx.pv
      left join firstpv on firstpv.pv = pvx.pv
      left join leads on leads.g is not distinct from pvx.g
    group by pvx.g order by views desc limit 150`;
  return rows.map((r) => ({
    k: r.g, title: r.title, views: n(r.views), visitors: n(r.visitors), t: n(r.t), sc: n(r.sc),
    exits: n(r.exits), entries: n(r.entries), leads: n(r.leads),
  }));
}

async function engagementDist(sql, W) {
  const [scroll, time] = await Promise.all([
    sql`
      with eng as (select pv, max((meta->>'sc')::numeric) sc from events where ${W} and type = 'engage' group by pv)
      select case when sc < 25 then 0 when sc < 50 then 1 when sc < 75 then 2 when sc < 90 then 3 else 4 end b, count(*) n
      from eng where sc is not null group by 1 order by 1`,
    sql`
      with e as materialized (select sid, type, pv, val from events where ${W}),
      s as (select sid from e where type = 'pageview' group by sid),
      eng as (select sid, sum(t) t from (select sid, pv, max(val) t from e where type = 'engage' group by sid, pv) x group by sid)
      select case when coalesce(t,0) < 10000 then 0 when t < 30000 then 1 when t < 60000 then 2
                  when t < 180000 then 3 when t < 600000 then 4 else 5 end b, count(*) n
      from s left join eng using (sid) group by 1 order by 1`,
  ]);
  return {
    scroll: scroll.map((r) => ({ b: n(r.b), n: n(r.n) })),
    time: time.map((r) => ({ b: n(r.b), n: n(r.n) })),
  };
}

async function funnels(sql, W) {
  const OPD = [...SERVICE_GROUPS, 'Contact'];
  const [r] = await sql`
    with e as materialized (select sid, type, name, pgroup, goal from events where ${W}),
    s as (select sid,
      bool_or(type = 'pageview') v,
      bool_or(type = 'pageview' and pgroup = any(${OPD})) o1,
      bool_or(name = 'form_view' and not (pgroup = any(${CANDIDATE_GROUPS}))) o2,
      bool_or(name = 'form_start' and not (pgroup = any(${CANDIDATE_GROUPS}))) o3,
      bool_or(name = 'form_submit' and not (pgroup = any(${CANDIDATE_GROUPS}))) o4,
      bool_or(goal = 'lead_opdrachtgever') o5,
      bool_or(type = 'pageview' and pgroup = any(${CANDIDATE_GROUPS})) k1,
      bool_or(name = 'form_view' and pgroup = any(${CANDIDATE_GROUPS})) k2,
      bool_or(name = 'form_start' and pgroup = any(${CANDIDATE_GROUPS})) k3,
      bool_or(name = 'form_submit' and pgroup = any(${CANDIDATE_GROUPS})) k4,
      bool_or(goal = 'lead_kandidaat') k5
      from e group by sid)
    select count(*) filter (where v) v,
      count(*) filter (where v and o1) o1, count(*) filter (where v and o1 and o2) o2,
      count(*) filter (where v and o1 and o2 and o3) o3, count(*) filter (where v and o1 and o2 and o3 and o4) o4,
      count(*) filter (where v and o1 and o2 and o3 and o4 and o5) o5,
      count(*) filter (where v and k1) k1, count(*) filter (where v and k1 and k2) k2,
      count(*) filter (where v and k1 and k2 and k3) k3, count(*) filter (where v and k1 and k2 and k3 and k4) k4,
      count(*) filter (where v and k1 and k2 and k3 and k4 and k5) k5
    from s`;
  const o = {};
  for (const [k, v] of Object.entries(r || {})) o[k] = n(v);
  return {
    opdrachtgever: [o.v, o.o1, o.o2, o.o3, o.o4, o.o5],
    kandidaat: [o.v, o.k1, o.k2, o.k3, o.k4, o.k5],
  };
}

async function forms(sql, W) {
  const [list, fields, choices, fieldStats] = await Promise.all([
    sql`
      select path, label k,
        count(distinct pv) filter (where name = 'form_view') views,
        count(distinct pv) filter (where name = 'form_start') starts,
        count(distinct pv) filter (where name = 'form_submit') submits,
        count(*) filter (where name = 'form_result' and meta->>'ok' = '1') ok,
        count(*) filter (where name = 'form_result' and meta->>'ok' = '0') fail,
        count(*) filter (where name = 'form_abandon') abandons,
        avg((meta->>'dur')::numeric) filter (where name = 'form_result' and meta->>'ok' = '1') dur
      from events where ${W} and type = 'event' and name like 'form\\_%'
      group by path, label order by starts desc, views desc limit 80`,
    sql`
      select label k, meta->>'last' f, count(*) n from events
      where ${W} and type = 'event' and name = 'form_abandon' group by 1, 2 order by n desc limit 40`,
    sql`
      select x.key k, x.value v, count(*) n
      from events, jsonb_each_text(coalesce(meta->'c', '{}'::jsonb)) x
      where ${W} and type = 'event' and name = 'form_result' and meta->>'ok' = '1'
      group by 1, 2 order by n desc limit 60`,
    sql`
      select label k, x.key f, count(*) n,
        count(*) filter (where name = 'form_abandon') ab,
        avg(x.value::numeric) t,
        avg(coalesce((meta->'fx'->>x.key)::numeric, 1)) fx,
        count(*) filter (where coalesce((meta->'fx'->>x.key)::numeric, 1) > 1) back
      from events, jsonb_each_text(coalesce(meta->'fd', '{}'::jsonb)) x
      where ${W} and type = 'event' and name in ('form_submit', 'form_abandon')
      group by 1, 2 order by n desc limit 120`,
  ]);
  return {
    list: list.map((r) => ({ path: r.path, k: r.k, views: n(r.views), starts: n(r.starts), submits: n(r.submits), ok: n(r.ok), fail: n(r.fail), abandons: n(r.abandons), dur: r.dur == null ? null : n(r.dur) })),
    fields: fields.map((r) => ({ k: r.k, f: r.f, n: n(r.n) })),
    choices: choices.map((r) => ({ k: r.k, v: r.v, n: n(r.n) })),
    fieldStats: fieldStats.map((r) => ({ k: r.k, f: r.f, n: n(r.n), ab: n(r.ab), t: n(r.t), fx: n(r.fx), back: n(r.back) })),
  };
}

async function vacancies(sql, W) {
  const [list, src] = await Promise.all([
    sql`
      with e as materialized (select sid, vid, type, name, path, title, pv, val, goal, label, channel from events
                              where ${W} and pgroup in ('Vacature', 'Vacatures')),
      eng as (select pv, max(val) t from e where type = 'engage' group by pv)
      select path, max(title) filter (where type = 'pageview') title,
        count(*) filter (where type = 'pageview') views,
        count(distinct vid) filter (where type = 'pageview') visitors,
        count(distinct pv) filter (where name = 'form_view') fviews,
        count(distinct pv) filter (where name = 'form_start') starts,
        count(distinct (pv, coalesce(label, ''))) filter (where goal = 'lead_kandidaat') applies,
        count(*) filter (where goal = 'gedeeld') shares,
        avg(eng.t) filter (where type = 'pageview') t,
        mode() within group (order by channel) filter (where type = 'pageview') top_channel
      from e left join eng using (pv) group by path order by views desc limit 100`,
    sql`
      select channel k, count(distinct sid) filter (where type = 'pageview') s,
        count(distinct (pv, coalesce(label, ''))) filter (where goal = 'lead_kandidaat') l
      from events where ${W} and pgroup = any(${CANDIDATE_GROUPS}) group by 1 order by s desc`,
  ]);
  return {
    list: list.map((r) => ({ path: r.path, title: r.title, views: n(r.views), visitors: n(r.visitors), fviews: n(r.fviews), starts: n(r.starts), applies: n(r.applies), shares: n(r.shares), t: n(r.t), top: r.top_channel })),
    sources: src.map((r) => ({ k: r.k, s: n(r.s), l: n(r.l) })),
  };
}

async function clicks(sql, W) {
  const [list, custom, copies] = await Promise.all([
    sql`
      select meta->>'k' k, label, meta->>'h' h, meta->>'a' a, count(*) n, count(distinct vid) v, max(goal) goal
      from events where ${W} and type = 'event' and name = 'click'
      group by 1, 2, 3, 4 order by n desc limit 300`,
    sql`
      select name, label, count(*) n from events
      where ${W} and type = 'event' and not (name = any(${BUILTIN}))
      group by 1, 2 order by n desc limit 60`,
    sql`
      select label, count(*) n from events where ${W} and type = 'event' and name = 'copy'
      group by 1 order by n desc`,
  ]);
  return {
    list: list.map((r) => ({ k: r.k, label: r.label, h: r.h, a: r.a, n: n(r.n), v: n(r.v), goal: r.goal })),
    custom: custom.map((r) => ({ name: r.name, label: r.label, n: n(r.n) })),
    copies: copies.map((r) => ({ label: r.label, n: n(r.n) })),
  };
}

async function quality(sql, W) {
  const [errors, rage, nf, dead] = await Promise.all([
    sql`
      select name, label, path, count(*) n, count(distinct sid) s, max(ts) last
      from events where ${W} and type = 'event' and name in ('js_error', 'resource_error')
      group by 1, 2, 3 order by n desc limit 60`,
    sql`
      select path, label, count(*) n, count(distinct sid) s from events
      where ${W} and type = 'event' and name = 'rage_click' group by 1, 2 order by n desc limit 40`,
    sql`
      select path, coalesce(ref, '') ref, count(*) n, max(ts) last from events
      where ${W} and type = 'pageview' and pgroup = 'Niet gevonden' group by 1, 2 order by n desc limit 40`,
    sql`
      select path, label, count(*) n, count(distinct sid) s from events
      where ${W} and type = 'event' and name = 'tap' and meta->>'dc' = '1' group by 1, 2 order by n desc limit 40`,
  ]);
  return {
    errors: errors.map((r) => ({ name: r.name, label: r.label, path: r.path, n: n(r.n), s: n(r.s), last: r.last })),
    rage: rage.map((r) => ({ path: r.path, label: r.label, n: n(r.n), s: n(r.s) })),
    notFound: nf.map((r) => ({ path: r.path, ref: r.ref, n: n(r.n), last: r.last })),
    dead: dead.map((r) => ({ path: r.path, label: r.label, n: n(r.n), s: n(r.s) })),
  };
}

function vcase(sql, idx) {
  return sql`case name ${Object.entries(VITALS).reduce((acc, [k, v]) => sql`${acc} when ${k} then ${v[idx]}::double precision`, sql``)} end`;
}

async function vitals(sql, W) {
  const good = vcase(sql, 0), poor = vcase(sql, 1);
  const [overall, byPage, trend] = await Promise.all([
    sql`
      with v as (select name, device, val from events where ${W} and type = 'vital' and val is not null)
      select name, null::text device, percentile_cont(0.75) within group (order by val) p75, count(*) n,
        count(*) filter (where val <= ${good}) good, count(*) filter (where val > ${poor}) poor
      from v group by name
      union all
      select name, device, percentile_cont(0.75) within group (order by val) p75, count(*) n,
        count(*) filter (where val <= ${good}) good, count(*) filter (where val > ${poor}) poor
      from v group by name, device`,
    sql`
      select path, name, percentile_cont(0.75) within group (order by val) p75, count(*) n
      from events where ${W} and type = 'vital' and val is not null
      group by 1, 2 having count(*) >= 2 order by n desc limit 200`,
    sql`
      select to_char(date_trunc('day', ts at time zone ${TZ}), 'YYYY-MM-DD') b, name, percentile_cont(0.75) within group (order by val) p75
      from events where ${W} and type = 'vital' and name in ('LCP', 'INP', 'CLS') group by 1, 2 order by 1`,
  ]);
  return {
    overall: overall.map((r) => ({ name: r.name, device: r.device, p75: n(r.p75), n: n(r.n), good: n(r.good), poor: n(r.poor) })),
    byPage: byPage.map((r) => ({ path: r.path, name: r.name, p75: n(r.p75), n: n(r.n) })),
    trend: trend.map((r) => ({ b: fmtLocal(r.b), name: r.name, p75: n(r.p75) })),
  };
}

async function heatmap(sql, W) {
  const rows = await sql`
    select extract(isodow from t0 at time zone ${TZ})::int dow, extract(hour from t0 at time zone ${TZ})::int h, count(*) n
    from (select sid, min(ts) t0 from events where ${W} and type = 'pageview' group by sid) s
    group by 1, 2`;
  return rows.map((r) => ({ dow: n(r.dow), h: n(r.h), n: n(r.n) }));
}

async function attribution(sql, W) {
  const [ft, lt, ftl, ftk, recent] = await Promise.all([
    sql`
      select coalesce(meta->>'ftc', 'Onbekend') k, goal, count(*) n,
        avg((meta->>'dfv')::numeric) days, avg((meta->>'vc')::numeric) visits
      from events where ${W} and goal = any(${LEADS}) group by 1, 2`,
    sql`
      select channel k, goal, count(*) n from events where ${W} and goal = any(${LEADS}) group by 1, 2`,
    sql`
      select coalesce(meta->>'ftl', landing) k, count(*) n from events where ${W} and goal = any(${LEADS})
      group by 1 order by n desc limit 20`,
    sql`
      select meta->>'ftk' k, count(*) n from events where ${W} and goal = any(${LEADS}) and meta ? 'ftk'
      group by 1 order by n desc limit 20`,
    sql`
      select ts, goal, path, title, channel, device, city, region, country, label,
        meta->'c' c, meta->>'ftc' ftc, meta->>'dfv' dfv, meta->>'vc' vc, meta->>'st' st
      from events where ${W} and goal = any(${RECENT_GOALS})
      order by ts desc limit 80`,
  ]);
  return {
    firstTouch: ft.map((r) => ({ k: r.k, goal: r.goal, n: n(r.n), days: r.days == null ? null : n(r.days), visits: r.visits == null ? null : n(r.visits) })),
    lastTouch: lt.map((r) => ({ k: r.k, goal: r.goal, n: n(r.n) })),
    firstLanding: ftl.map((r) => ({ k: r.k, n: n(r.n) })),
    firstCampaign: ftk.map((r) => ({ k: r.k, n: n(r.n) })),
    recent: recent.map((r) => ({ ts: r.ts, goal: r.goal, path: r.path, title: r.title, channel: r.channel, device: r.device, city: r.city, region: r.region, country: r.country, label: r.label, c: r.c, ftc: r.ftc, dfv: r.dfv == null ? null : n(r.dfv), vc: r.vc == null ? null : n(r.vc), st: r.st })),
  };
}

async function flows(sql, W) {
  const [routes, chLanding] = await Promise.all([
    sql`
      with p as (select sid, path, ts, lag(path) over (partition by sid order by ts) prev
                 from events where ${W} and type = 'pageview')
      select prev, path, count(*) n from p where prev is not null and prev <> path
      group by 1, 2 order by n desc limit 60`,
    sql`
      select channel k, landing, count(distinct sid) s,
        count(distinct (pv, coalesce(label, ''))) filter (where goal = any(${LEADS})) l
      from events where ${W} group by 1, 2 order by s desc limit 250`,
  ]);
  return {
    routes: routes.map((r) => ({ from: r.prev, to: r.path, n: n(r.n) })),
    channelLanding: chLanding.map((r) => ({ k: r.k, landing: r.landing, s: n(r.s), l: n(r.l) })),
  };
}

async function notes(sql, site, from, to) {
  const rows = await sql`select id, to_char(day, 'YYYY-MM-DD') as d, text from notes where site = ${site} and day >= ${from} and day <= ${to} order by day`;
  return rows.map((r) => ({ id: n(r.id), day: r.d, text: r.text }));
}

async function live(sql, site) {
  const [[c], pagesNow, perMin, feed] = await Promise.all([
    sql`select count(distinct vid) n from events where site = ${site} and ts > now() - interval '5 minutes'`,
    sql`
      select * from (
        select distinct on (vid) vid, path, title, channel, device, city, country, ts
        from events where site = ${site} and type = 'pageview' and ts > now() - interval '5 minutes'
        order by vid, ts desc) x order by ts desc limit 40`,
    sql`
      select date_trunc('minute', ts) m, count(*) filter (where type = 'pageview') pv, count(distinct vid) v
      from events where site = ${site} and ts > now() - interval '30 minutes' group by 1 order by 1`,
    sql`
      select ts, type, name, path, title, label, channel, device, city, country, goal, val
      from events where site = ${site} and ts > now() - interval '24 hours' and type in ('pageview', 'event')
        and coalesce(name, '') not in ('form_view', 'tap')
      order by ts desc limit 50`,
  ]);
  return {
    now: n(c.n),
    pages: pagesNow.map((r) => ({ path: r.path, title: r.title, channel: r.channel, device: r.device, city: r.city, country: r.country, ts: r.ts })),
    perMin: perMin.map((r) => ({ m: r.m, pv: n(r.pv), v: n(r.v) })),
    feed: feed.map((r) => ({ ts: r.ts, type: r.type, name: r.name, path: r.path, title: r.title, label: r.label, channel: r.channel, device: r.device, city: r.city, country: r.country, goal: r.goal })),
    serverTime: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------- retention
async function retention(sql, site) {
  const rows = await sql`
    with f as (select vid, min(ts) f from events where site = ${site} and consent and type = 'pageview' group by vid),
    c as (select vid, date_trunc('week', f at time zone ${TZ}) cw from f where f >= now() - interval '12 weeks'),
    a as (select distinct e.vid, date_trunc('week', e.ts at time zone ${TZ}) w
          from events e join c using (vid) where e.site = ${site} and e.type = 'pageview' and e.ts >= now() - interval '13 weeks')
    select to_char(c.cw, 'YYYY-MM-DD') c, floor(extract(epoch from (a.w - c.cw)) / 604800)::int k, count(distinct a.vid) n
    from c join a using (vid) where a.w >= c.cw group by 1, 2 order by 1, 2`;
  return rows.map((r) => ({ c: r.c, k: n(r.k), n: n(r.n) }));
}

// ---------------------------------------------------------------- heatmaps
// Weergave-bucket voor heatmaps: m(obiel) en t(ablet) op apparaat, desktopvensters smaller dan 1024 px als tablet
function vbExpr(sql) {
  return sql`(case when device = 'Mobiel' then 'm' when device = 'Tablet' then 't'
    when meta->>'vw' ~ '^[0-9]+$' and (meta->>'vw')::int < 1024 then 't' else 'd' end)`;
}

async function hmPages(sql, W) {
  const VB = vbExpr(sql);
  const rows = await sql`
    select path, max(title) filter (where type = 'pageview') title,
      count(*) filter (where type = 'pageview') views,
      count(*) filter (where type = 'pageview' and ${VB} = 'd') vd,
      count(*) filter (where type = 'pageview' and ${VB} = 't') vt,
      count(*) filter (where type = 'pageview' and ${VB} = 'm') vm,
      count(*) filter (where type = 'event' and name in ('click', 'tap') and meta ? 'px') clicks
    from events where ${W} and type in ('pageview', 'event') and coalesce(pgroup, '') <> 'Niet gevonden'
    group by path order by views desc limit 100`;
  return rows.map((r) => ({ path: r.path, title: r.title, views: n(r.views), vd: n(r.vd), vt: n(r.vt), vm: n(r.vm), clicks: n(r.clicks) }));
}

async function heatmapData(sql, W, path, vb) {
  const VB = vbExpr(sql);
  const WP = sql`${W} and path = ${path} and ${VB} = ${vb}`;
  const [pts, els, scroll, att, tot] = await Promise.all([
    sql`
      select meta->>'s' s,
        round((meta->>'rx')::numeric, 2)::float8 rx, round((meta->>'ry')::numeric, 2)::float8 ry,
        round((meta->>'px')::numeric, 3)::float8 px, round((meta->>'py')::numeric, 3)::float8 py,
        case when name = 'rage_click' then 'r' when name = 'tap' and meta->>'dc' = '1' then 'd' when name = 'tap' then 't' else 'c' end t,
        count(*) n
      from events where ${WP} and type = 'event' and name in ('click', 'tap', 'rage_click') and meta ? 'px'
      group by 1, 2, 3, 4, 5, 6 order by n desc limit 5000`,
    sql`
      select meta->>'s' s, max(label) label, count(*) filter (where name <> 'rage_click') n, count(distinct sid) ss,
        count(*) filter (where name = 'rage_click') rage, count(*) filter (where meta->>'dc' = '1') dead,
        bool_or(name = 'click') inter, max(meta->>'h') h
      from events where ${WP} and type = 'event' and name in ('click', 'tap', 'rage_click') and meta ? 's'
      group by 1 order by n desc limit 40`,
    sql`
      with e as (select distinct on (pv) pv, (meta->>'sc')::numeric sc, (meta->>'vh')::numeric vh, (meta->>'dh')::numeric dh
                 from events where ${WP} and type = 'engage' and meta ? 'sc' order by pv, val desc nulls last)
      select t, count(*) filter (where sc >= t) reach, count(*) total,
        (select avg(vh / dh) from e where vh > 0 and dh > 0) fold, (select avg(sc) from e) avg
      from e, generate_series(0, 100, 5) t group by t order by t`,
    sql`
      with e as (select distinct on (pv) pv, meta->'at' att from events
                 where ${WP} and type = 'engage' and meta ? 'at' order by pv, val desc nulls last)
      select x.key k, count(*) filter (where x.value::numeric >= 1) seen,
        avg(x.value::numeric) filter (where x.value::numeric >= 1) avg, (select count(*) from e) total
      from e, jsonb_each_text(e.att) x group by 1`,
    sql`
      select count(*) filter (where type = 'pageview') pv, count(distinct sid) filter (where type = 'pageview') s,
        count(*) filter (where type = 'event' and name in ('click', 'tap')) clicks,
        count(*) filter (where type = 'event' and name = 'rage_click') rage,
        count(*) filter (where type = 'event' and name = 'tap' and meta->>'dc' = '1') dead
      from events where ${WP}`,
  ]);
  const total = scroll.length ? n(scroll[0].total) : 0;
  const t = tot[0] || {};
  return {
    path, vb,
    totals: { pv: n(t.pv), s: n(t.s), clicks: n(t.clicks), rage: n(t.rage), dead: n(t.dead), scrolled: total },
    points: pts.map((r) => ({ s: r.s, rx: r.rx, ry: r.ry, px: r.px, py: r.py, t: r.t, n: n(r.n) })),
    elements: els.map((r) => ({ s: r.s, label: r.label, n: n(r.n), ss: n(r.ss), rage: n(r.rage), dead: n(r.dead), inter: !!r.inter, h: r.h })),
    scroll: total ? scroll.map((r) => n(r.reach) / total) : [],
    fold: scroll.length && scroll[0].fold != null ? n(scroll[0].fold) : null,
    avgScroll: scroll.length && scroll[0].avg != null ? n(scroll[0].avg) : null,
    sections: att.map((r) => ({ k: r.k, seen: n(r.seen), avg: n(r.avg), reach: n(r.total) ? n(r.seen) / n(r.total) : 0 })),
  };
}

// ---------------------------------------------------------------- sessions
async function sessionList(sql, W, kind, offset) {
  const cond = kind === 'lead' ? sql`and goals && ${['lead_opdrachtgever', 'lead_kandidaat']}::text[]`
    : kind === 'form' ? sql`and fstart`
      : kind === 'return' ? sql`and not coalesce(is_new, true)`
        : kind === 'long' ? sql`and pvs >= 3`
          : sql``;
  const rows = await sql`
    with s as (
      select sid, min(ts) t0, max(ts) t1, min(vid) vid,
        count(*) filter (where type = 'pageview') pvs,
        (array_agg(path order by ts) filter (where type = 'pageview'))[1] landing,
        (array_agg(path order by ts desc) filter (where type = 'pageview'))[1] exitp,
        (array_agg(channel order by ts) filter (where type = 'pageview'))[1] channel,
        (array_agg(ref order by ts) filter (where type = 'pageview'))[1] ref,
        max(utm_campaign) camp, max(device) device, max(browser) browser, max(city) city, max(country) country,
        bool_or(is_new) is_new, bool_or(name = 'form_start') fstart,
        coalesce(array_remove(array_agg(distinct goal), null), '{}') goals,
        count(*) filter (where name in ('click')) nclick
      from events where ${W} group by sid),
    eng as (select sid, sum(t) t from (select sid, pv, max(val) t from events where ${W} and type = 'engage' group by sid, pv) x group by sid)
    select s.*, coalesce(eng.t, 0) dur, count(*) over () total
    from s left join eng using (sid) where pvs > 0 ${cond}
    order by t0 desc limit 40 offset ${offset}`;
  return {
    total: rows.length ? n(rows[0].total) : 0,
    rows: rows.map((r) => ({
      sid: r.sid, t0: r.t0, t1: r.t1, pvs: n(r.pvs), landing: r.landing, exit: r.exitp, channel: r.channel, ref: r.ref,
      camp: r.camp, device: r.device, browser: r.browser, city: r.city, country: r.country, isNew: r.is_new,
      goals: r.goals || [], clicks: n(r.nclick), dur: n(r.dur),
    })),
  };
}

async function sessionDetail(sql, site, sid) {
  const rows = await sql`
    select ts, type, name, path, title, label, goal, val, pv,
      meta->>'k' k, meta->>'h' h, meta->>'sc' sc, meta->>'last' last, meta->>'ok' ok, meta->>'dc' dc, meta->>'f' f,
      channel, ref, device, browser, os, city, region, country, utm_source, utm_campaign, is_new, consent
    from events where site = ${site} and sid = ${sid} order by ts limit 600`;
  return rows.map((r) => ({
    ts: r.ts, type: r.type, name: r.name, path: r.path, title: r.title, label: r.label, goal: r.goal, val: r.val == null ? null : n(r.val), pv: r.pv,
    k: r.k, h: r.h, sc: r.sc == null ? null : n(r.sc), last: r.last, ok: r.ok, dc: r.dc, f: r.f,
    channel: r.channel, ref: r.ref, device: r.device, browser: r.browser, os: r.os, city: r.city, region: r.region, country: r.country,
    utm_source: r.utm_source, utm_campaign: r.utm_campaign, is_new: r.is_new, consent: r.consent,
  }));
}

async function exportCsv(sql, W, res) {
  const rows = await sql`
    select ts, type, name, path, title, label, goal, channel, ref, utm_source, utm_medium, utm_campaign,
      landing, country, region, city, device, browser, os, screen, lang, is_new, consent, val, sid, vid, meta
    from events where ${W} order by ts limit 100000`;
  const cols = ['ts', 'type', 'name', 'path', 'title', 'label', 'goal', 'channel', 'ref', 'utm_source', 'utm_medium', 'utm_campaign',
    'landing', 'country', 'region', 'city', 'device', 'browser', 'os', 'screen', 'lang', 'is_new', 'consent', 'val', 'sid', 'vid', 'meta'];
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) v = v.toISOString();
    else if (typeof v === 'object') v = JSON.stringify(v);
    v = String(v);
    return /[",;\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  };
  const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => esc(r[c])).join(',')));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="straightfwd-analytics.csv"');
  return res.status(200).send('﻿' + lines.join('\n'));
}

// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!isAuthed(req)) return res.status(401).json({ error: 'auth' });
  const sql = db();
  if (!sql) return res.status(200).json({ error: 'no_database' });

  const q = req.query || {};
  const site = SITES[q.site] ? q.site : 'straightfwd.nl';
  try {
    await ensureSchema();
    if (q.mode === 'live') return res.status(200).json(await live(sql, site));

    const R = resolveRange(q);
    if (q.mode === 'session') {
      if (!/^[a-z0-9-]{6,40}$/i.test(String(q.sid || ''))) return res.status(400).json({ error: 'invalid' });
      return res.status(200).json({ events: await sessionDetail(sql, site, q.sid), goalLabels: GOAL_LABELS });
    }
    if (q.mode === 'heatmap') {
      const vb = ['d', 't', 'm'].includes(q.vb) ? q.vb : 'd';
      const Wh = buildWhere(sql, { ...q, f_path: undefined }, site, R.start, R.end);
      const [pages, hm] = await Promise.all([hmPages(sql, Wh), q.path ? heatmapData(sql, Wh, normPath(q.path), vb) : null]);
      return res.status(200).json({ pages, heatmap: hm, range: { from: R.from, to: R.to } });
    }
    const W = buildWhere(sql, q, site, R.start, R.end);
    if (q.mode === 'export') return exportCsv(sql, W, res);
    if (q.mode === 'sessions') {
      const kind = ['lead', 'form', 'return', 'long'].includes(q.kind) ? q.kind : 'all';
      const offset = Math.max(0, Math.min(5000, parseInt(q.offset, 10) || 0));
      return res.status(200).json({ ...(await sessionList(sql, W, kind, offset)), goalLabels: GOAL_LABELS });
    }
    const WP = buildWhere(sql, q, site, R.prev.start, R.prev.end);

    const t0 = Date.now();
    const [k, kp, g, gp, s, sp, ss, d, pg, grp, eng, fun, fm, vac, clk, qual, vit, hm, attr, fl, nts, ret] = await Promise.all([
      kpis(sql, W), kpis(sql, WP), goals(sql, W), goals(sql, WP),
      series(sql, W, R.bucket), series(sql, WP, R.bucket), sessionSeries(sql, W, R.bucket),
      dims(sql, W), pages(sql, W, 'path'), pages(sql, W, 'pgroup'), engagementDist(sql, W),
      funnels(sql, W), forms(sql, W), vacancies(sql, W), clicks(sql, W), quality(sql, W),
      vitals(sql, W), heatmap(sql, W), attribution(sql, W), flows(sql, W),
      notes(sql, site, R.from, R.to), retention(sql, site),
    ]);
    return res.status(200).json({
      site, range: { from: R.from, to: R.to, days: R.days, bucket: R.bucket, prev: { from: R.prev.from, to: R.prev.to } },
      kpis: k, prev: kp, goals: g, prevGoals: gp, series: s, prevSeries: sp, sessionSeries: ss,
      dims: d, pages: pg, groups: grp, engagement: eng, funnels: fun, forms: fm, vacancies: vac,
      clicks: clk, quality: qual, vitals: vit, heatmap: hm, attribution: attr, flows: fl, notes: nts, retention: ret,
      goalLabels: GOAL_LABELS, serviceGroups: SERVICE_GROUPS, candidateGroups: CANDIDATE_GROUPS,
      ms: Date.now() - t0,
    });
  } catch (err) {
    console.error('stats failed', err);
    return res.status(500).json({ error: 'query', message: err.message });
  }
}
