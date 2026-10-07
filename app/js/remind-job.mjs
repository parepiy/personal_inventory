// Daily reminder job. The Pawventory app copies this file (with dates.js, model.js and
// reminders.js) into your private data repo, where a scheduled GitHub Action runs it.
// It reads your items, sends today's notification to every subscribed device, and
// drops subscriptions the push service says are gone.
// Logs only print counts, never item names.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { todayISO } from './dates.js';
import { normalize } from './model.js';
import { attentionCount, dueReminders, reminderMessage } from './reminders.js';

export const SUBSCRIPTIONS_PATH = 'push/subscriptions.json';

function readJSON(root, path, fallback) {
  const file = `${root}/${path}`;
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : fallback;
}

export function todaysMessage(data, { test = false, now = new Date() } = {}) {
  const today = todayISO(data.settings.timezone, now);
  const msg = test
    ? {
      title: 'Woof! Notifications work',
      body: 'This is how Pawventory will remind you before things expire.',
      url: './#/reminders',
    }
    : reminderMessage(dueReminders(data, today));
  return msg && { ...msg, badge: attentionCount(data, today) };
}

export async function run({ root = '.', test = false, send } = {}) {
  const data = normalize(readJSON(root, 'data/items.json', null));
  const vapid = readJSON(root, 'config/vapid.json', null);
  const doc = readJSON(root, SUBSCRIPTIONS_PATH, { subscriptions: [] });
  const subs = Array.isArray(doc.subscriptions) ? doc.subscriptions : [];

  if (!vapid) return { note: 'No push keys yet' };
  if (!subs.length) return { note: 'No devices have notifications turned on' };
  const msg = todaysMessage(data, { test });
  if (!msg) return { note: 'Nothing due today' };

  if (!send) {
    const { default: webpush } = await import('web-push');
    webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);
    send = (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 86400, urgency: 'normal' });
  }

  const payload = JSON.stringify(msg);
  const keep = [];
  let sent = 0;
  let failed = 0;
  let removed = 0;
  for (const sub of subs) {
    try {
      await send(sub, payload);
      sent += 1;
      keep.push(sub);
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        removed += 1;
      } else {
        failed += 1;
        keep.push(sub);
        console.log(`A push failed (status ${err.statusCode ?? 'unknown'})`);
      }
    }
  }
  if (removed) {
    writeFileSync(`${root}/${SUBSCRIPTIONS_PATH}`, `${JSON.stringify({ ...doc, subscriptions: keep }, null, 2)}\n`);
  }
  return { sent, failed, removed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await run({ root: process.env.PAW_ROOT || '.', test: process.env.PAW_TEST === 'true' });
  console.log(JSON.stringify(result));
  if (result.failed && !result.sent) process.exitCode = 1;
}
