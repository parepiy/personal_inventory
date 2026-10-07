// Date helpers. Every date is a calendar-day string 'YYYY-MM-DD' (no time, no zone),
// so ages and countdowns never drift with time zones or daylight saving.
// This file has no DOM access: the daily reminder job imports it in Node too.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const DAY_MS = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export function isISODate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = parts(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m - 1);
}

export function parts(s) {
  return s.split('-').map(Number);
}

export function toUTC(s) {
  const [y, m, d] = parts(s);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Today's date in the given IANA time zone (default: the runtime's own zone). */
export function todayISO(timeZone, now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Minutes the zone is ahead of UTC at `date` (e.g. +420 for Bangkok). */
export function tzOffsetMinutes(timeZone, date = new Date()) {
  const at = new Date(Math.floor(date.getTime() / 60000) * 60000);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  }).formatToParts(at).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** GitHub Actions cron (always UTC) for a local "HH:MM" in the given zone. */
export function cronFor(time, timeZone, now = new Date()) {
  const [h, m] = String(time || '09:00').split(':').map(Number);
  const utc = ((((h * 60 + m) - tzOffsetMinutes(timeZone, now)) % 1440) + 1440) % 1440;
  return `${utc % 60} ${Math.floor(utc / 60)} * * *`;
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function addDays(s, n) {
  return fromUTC(toUTC(s) + n * DAY_MS);
}

/** Adds calendar months, clamping to the end of shorter months (Jan 31 + 1 mo = Feb 28). */
export function addMonths(s, n) {
  const [y, m, d] = parts(s);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total - ny * 12;
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** Whole calendar months from a to b (b >= a), plus the leftover days. */
export function monthsBetween(a, b) {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  let months = (by - ay) * 12 + (bm - am);
  if (bd < ad) months -= 1;
  if (months < 0) months = 0;
  return { months, days: daysBetween(addMonths(a, months), b) };
}

export function formatDate(s) {
  if (!s) return '';
  const [y, m, d] = parts(s);
  return `${MONTHS_SHORT[m - 1]} ${d}, ${y}`;
}

export function formatShort(s) {
  const [, m, d] = parts(s);
  return `${MONTHS_SHORT[m - 1]} ${d}`;
}

export function formatMonthYear(s) {
  const [y, m] = parts(s);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

export function formatWeekday(s) {
  return WEEKDAYS_SHORT[new Date(toUTC(s)).getUTCDay()];
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** Human age of something you got on `got`, e.g. "7 yrs 6 mos", "3 mos", "12 days". */
export function ageLabel(got, today) {
  if (!got) return '';
  const diff = daysBetween(got, today);
  if (diff < 0) return `arrives in ${plural(-diff, 'day', 'days')}`;
  if (diff === 0) return 'new today';
  const { months } = monthsBetween(got, today);
  if (months < 1) return plural(diff, 'day', 'days');
  const y = Math.floor(months / 12);
  const m = months % 12;
  const out = [];
  if (y) out.push(plural(y, 'yr', 'yrs'));
  if (m) out.push(plural(m, 'mo', 'mos'));
  return out.join(' ');
}

/** "7 yrs 6 mos old" / "new today". */
export function ageText(got, today) {
  const a = ageLabel(got, today);
  return /^(new|arrives)/.test(a) ? a : `${a} old`;
}

/**
 * Where an item stands today.
 * kind: 'expired' | 'soon' | 'ok' | 'none' (no expiry date)
 */
export function itemStatus(item, today, soonDays = 30) {
  if (!item.exp) return { kind: 'none', days: Infinity, label: 'No expiry' };
  const days = daysBetween(today, item.exp);
  if (days < 0) {
    return { kind: 'expired', days, label: `Expired ${plural(-days, 'day', 'days')} ago` };
  }
  if (days === 0) return { kind: 'soon', days, label: 'Expires today' };
  const label = days === 1 ? 'Tomorrow' : `${days} days left`;
  return { kind: days <= soonDays ? 'soon' : 'ok', days, label };
}

/** Share of the item's life already used, 0..1 (null without an expiry). */
export function lifespanUsed(got, exp, today) {
  if (!got || !exp) return null;
  const total = daysBetween(got, exp);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, daysBetween(got, today) / total));
}

/**
 * New dates after replacing an item today: same lifespan, starting today.
 * A lifespan of whole months (3 months, 1 year...) stays whole months.
 */
export function renewedDates(item, today) {
  if (!item.exp || !item.got) return { got: today, exp: item.exp || null };
  const { months, days } = monthsBetween(item.got, item.exp);
  const exp = days === 0 && months > 0
    ? addMonths(today, months)
    : addDays(today, Math.max(1, daysBetween(item.got, item.exp)));
  return { got: today, exp };
}
