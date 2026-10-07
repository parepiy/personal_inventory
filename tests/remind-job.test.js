import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { run } from '../app/js/remind-job.mjs';
import { todayISO } from '../app/js/dates.js';

function repo({ items = [], subs = [], vapid = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'paw-'));
  for (const dir of ['data', 'config', 'push']) mkdirSync(join(root, dir));
  const today = todayISO('UTC');
  writeFileSync(join(root, 'data/items.json'), JSON.stringify({
    items: items.map((it, i) => ({ id: `i${i}`, ...it, exp: it.exp === 'today' ? today : it.exp })),
    settings: { timezone: 'UTC', defaultRemindDays: [7] },
  }));
  if (vapid) writeFileSync(join(root, 'config/vapid.json'), JSON.stringify({ publicKey: 'pub', privateKey: 'priv', subject: 'mailto:x@y.z' }));
  writeFileSync(join(root, 'push/subscriptions.json'), JSON.stringify({ subscriptions: subs }));
  return root;
}

const sub = (n) => ({ endpoint: `https://push.example/${n}`, keys: { p256dh: 'k', auth: 'a' } });

test('sends today\'s reminder to every device and forgets unsubscribed ones', async () => {
  const root = repo({ items: [{ name: 'Milk', exp: 'today' }], subs: [sub(1), sub(2), sub(3)] });
  const sent = [];
  const result = await run({
    root,
    send: async (s, payload) => {
      if (s.endpoint.endsWith('/2')) throw Object.assign(new Error('gone'), { statusCode: 410 });
      sent.push([s.endpoint, JSON.parse(payload)]);
    },
  });
  assert.deepEqual(result, { sent: 2, failed: 0, removed: 1 });
  assert.equal(sent[0][1].title, 'Milk expires today');
  assert.equal(sent[0][1].badge, 1);
  const left = JSON.parse(readFileSync(join(root, 'push/subscriptions.json'), 'utf8')).subscriptions;
  assert.deepEqual(left.map((s) => s.endpoint), ['https://push.example/1', 'https://push.example/3']);
});

test('keeps devices after a temporary failure', async () => {
  const root = repo({ items: [{ name: 'Milk', exp: 'today' }], subs: [sub(1)] });
  const result = await run({ root, send: async () => { throw Object.assign(new Error('busy'), { statusCode: 503 }); } });
  assert.deepEqual(result, { sent: 0, failed: 1, removed: 0 });
});

test('quiet days, test mode, and missing setup', async () => {
  const quiet = repo({ items: [{ name: 'Lamp', exp: null }], subs: [sub(1)] });
  let calls = 0;
  assert.deepEqual(await run({ root: quiet, send: async () => { calls += 1; } }), { note: 'Nothing due today' });
  assert.equal(calls, 0);

  let payload;
  await run({ root: quiet, test: true, send: async (s, p) => { payload = JSON.parse(p); } });
  assert.equal(payload.title, 'Woof! Notifications work');

  assert.deepEqual(await run({ root: repo({ vapid: false, subs: [sub(1)] }) }), { note: 'No push keys yet' });
  assert.deepEqual(await run({ root: repo() }), { note: 'No devices have notifications turned on' });
});
