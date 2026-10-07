import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../app/js/model.js';
import { attentionCount, dueReminders, reminderMessage } from '../app/js/reminders.js';

const T = '2026-10-06';
const data = (items, settings = {}) => {
  const d = emptyData('UTC');
  d.settings = { ...d.settings, defaultRemindDays: [7, 30], ...settings };
  d.items = items.map((it, i) => ({ id: `i${i}`, name: `Item ${i}`, deleted: false, remindDays: null, ...it }));
  return d;
};

test('reminds on chosen days before, on the day, and weekly after expiry', () => {
  const d = data([
    { name: 'Passport', exp: '2026-11-05' }, // 30 days: default reminder
    { name: 'Dog food', exp: '2026-10-13' }, // 7 days
    { name: 'Milk', exp: T }, // today
    { name: 'Toothbrush', exp: '2026-10-05' }, // expired yesterday
    { name: 'Filter', exp: '2026-09-28' }, // expired 8 days ago: weekly nag
    { name: 'Shoes', exp: '2026-10-14' }, // 8 days: not a reminder day
    { name: 'Lamp', exp: null },
    { name: 'Gone', exp: T, deleted: true },
    { name: 'Custom', exp: '2026-10-09', remindDays: [3] },
    { name: 'Custom off', exp: '2026-10-13', remindDays: [] },
  ]);
  const due = dueReminders(d, T);
  assert.deepEqual(due.map((h) => [h.name, h.days]), [
    ['Filter', -8], ['Toothbrush', -1], ['Milk', 0], ['Custom', 3], ['Dog food', 7], ['Passport', 30],
  ]);
  d.settings.nagExpired = false;
  assert.ok(!dueReminders(d, T).some((h) => h.days < 0));
});

test('one item gets a specific message, several get a summary', () => {
  const one = reminderMessage([{ id: 'a b', name: 'Dog food', exp: '2026-10-15', days: 9 }]);
  assert.equal(one.title, 'Dog food expires in 9 days');
  assert.equal(one.body, 'Time to fetch a new one. Expires Oct 15.');
  assert.equal(one.url, './#/item/a%20b');

  const expired = reminderMessage([{ id: 'x', name: 'Toothbrush', exp: '2026-10-05', days: -1 }]);
  assert.equal(expired.title, 'Toothbrush expired 1 day ago');

  const many = reminderMessage([
    { name: 'A', days: -1 }, { name: 'B', days: 0 }, { name: 'C', days: 1 }, { name: 'D', days: 7 }, { name: 'E', days: 30 },
  ]);
  assert.equal(many.title, '5 things need attention');
  assert.equal(many.body, 'A expired 1 day ago · B expires today · C expires tomorrow · D expires in 7 days · +1 more');
  assert.equal(reminderMessage([]), null);
});

test('badge counts expired and soon items', () => {
  const d = data([{ exp: '2026-10-01' }, { exp: '2026-10-20' }, { exp: '2027-01-01' }, { exp: null }]);
  assert.equal(attentionCount(d, T), 2);
});
