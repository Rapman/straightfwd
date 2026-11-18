import { TZ } from './config.js';

const DAY = 86400000;

function tzOffsetMinutes(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(date);
  const g = (t) => +parts.find((p) => p.type === t).value;
  const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
  return Math.round((asUTC - date.getTime()) / 60000);
}

// Amsterdam midnight of YYYY-MM-DD as a UTC Date
export function localMidnight(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - tzOffsetMinutes(new Date(guess)) * 60000;
  const off2 = tzOffsetMinutes(new Date(t));
  t = guess - off2 * 60000;
  return new Date(t);
}

export function todayLocal() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return p; // YYYY-MM-DD
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * DAY);
  return t.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY);
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(q) {
  const today = todayLocal();
  let to = YMD.test(q.to || '') ? q.to : today;
  let from = YMD.test(q.from || '') ? q.from : addDays(to, -29);
  if (daysBetween(from, to) < 0) [from, to] = [to, from];
  if (daysBetween(from, to) > 800) from = addDays(to, -800);
  const days = daysBetween(from, to) + 1;
  const pTo = addDays(from, -1);
  const pFrom = addDays(pTo, -(days - 1));
  const bucket = days <= 2 ? 'hour' : days <= 92 ? 'day' : days <= 400 ? 'week' : 'month';
  return {
    from, to, days, bucket,
    start: localMidnight(from), end: localMidnight(addDays(to, 1)),
    prev: { from: pFrom, to: pTo, start: localMidnight(pFrom), end: localMidnight(from) },
  };
}
