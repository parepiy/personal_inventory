// Which items deserve a notification today, and what it says.
// Shared by the app (to preview) and the daily GitHub Action (to send).

import { daysBetween, formatShort, itemStatus } from './dates.js';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * Items to remind about on `today`:
 * - on each chosen "days before" (item.remindDays, else the default from settings)
 * - on the expiry day itself
 * - the day after expiring, then weekly, while it stays expired (if nagExpired)
 */
export function dueReminders(data, today) {
  const settings = data.settings || {};
  const fallback = Array.isArray(settings.defaultRemindDays) ? settings.defaultRemindDays : [7];
  const out = [];
  for (const it of data.items || []) {
    if (it.deleted || !it.exp) continue;
    const days = daysBetween(today, it.exp);
    const remind = Array.isArray(it.remindDays) ? it.remindDays : fallback;
    const due = days === 0
      || (days > 0 && remind.includes(days))
      || (days < 0 && settings.nagExpired !== false && (-days - 1) % 7 === 0);
    if (due) out.push({ id: it.id, name: it.name || 'Something', exp: it.exp, days });
  }
  return out.sort((a, b) => a.days - b.days);
}

export function phrase(days) {
  if (days === 0) return 'expires today';
  if (days === 1) return 'expires tomorrow';
  if (days > 0) return `expires in ${days} days`;
  return `expired ${plural(-days, 'day', 'days')} ago`;
}

/** One notification for the day: a specific one for a single item, a summary otherwise. */
export function reminderMessage(hits) {
  if (!hits.length) return null;
  if (hits.length === 1) {
    const h = hits[0];
    return {
      title: `${h.name} ${phrase(h.days)}`,
      body: h.days < 0
        ? `Time to replace it! It expired on ${formatShort(h.exp)}.`
        : `Time to fetch a new one. Expires ${formatShort(h.exp)}.`,
      url: `./#/item/${encodeURIComponent(h.id)}`,
    };
  }
  const shown = hits.slice(0, 4).map((h) => `${h.name} ${phrase(h.days)}`);
  if (hits.length > 4) shown.push(`+${hits.length - 4} more`);
  return {
    title: `${hits.length} things need attention`,
    body: shown.join(' · '),
    url: './#/reminders',
  };
}

/** Number shown on the app icon badge: expired + expiring soon. */
export function attentionCount(data, today) {
  const soon = data.settings?.soonDays ?? 30;
  return (data.items || []).filter((it) => {
    if (it.deleted) return false;
    const k = itemStatus(it, today, soon).kind;
    return k === 'expired' || k === 'soon';
  }).length;
}
