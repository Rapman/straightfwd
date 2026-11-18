import postgres from 'postgres';

const URL =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.STORAGE_URL ||
  process.env.NEON_DATABASE_URL ||
  '';

let _sql = null;
export function db() {
  if (!URL) return null;
  if (!_sql) {
    const local = /@(localhost|127\.0\.0\.1)|host=\/tmp/.test(URL);
    _sql = postgres(URL, {
      max: 5,
      idle_timeout: 20,
      connect_timeout: 10,
      prepare: false, // works behind pgbouncer / Neon pooler
      ssl: local ? false : 'require',
      onnotice: () => {},
      transform: { undefined: null },
    });
  }
  return _sql;
}

let _ready = null;
export function ensureSchema() {
  const sql = db();
  if (!sql) return Promise.reject(new Error('NO_DATABASE'));
  if (!_ready) {
    _ready = (async () => {
      await sql`
        create table if not exists events (
          id bigserial primary key,
          ts timestamptz not null default now(),
          site text not null,
          type text not null,
          name text,
          path text,
          title text,
          pv text,
          sid text not null,
          vid text not null,
          is_new boolean,
          consent boolean,
          ref text,
          channel text,
          utm_source text,
          utm_medium text,
          utm_campaign text,
          utm_content text,
          utm_term text,
          landing text,
          country text,
          region text,
          city text,
          device text,
          browser text,
          os text,
          screen text,
          lang text,
          pgroup text,
          goal text,
          val double precision,
          label text,
          meta jsonb
        )`;
      await sql`create index if not exists events_site_ts on events (site, ts)`;
      await sql`create index if not exists events_sid on events (sid)`;
      await sql`create index if not exists events_goal on events (site, ts) where goal is not null`;
      await sql`create index if not exists events_path on events (site, path, ts)`;
      await sql`
        create table if not exists notes (
          id bigserial primary key,
          site text not null,
          day date not null,
          text text not null,
          created timestamptz not null default now()
        )`;
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}
