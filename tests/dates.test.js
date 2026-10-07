import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths, ageLabel, ageText, cronFor, daysBetween, formatDate, isISODate, itemStatus,
  lifespanUsed, renewedDates, todayISO, tzOffsetMinutes,
} from '../app/js/dates.js';

const T = '2026-10-06';

test('ages read like a person would say them', () => {
  assert.equal(ageLabel('2019-03-12', T), '7 yrs 6 mos');
  assert.equal(ageLabel('2026-07-01', T), '3 mos');
  assert.equal(ageLabel('2026-08-15', T), '1 mo');
  assert.equal(ageLabel('2024-05-02', T), '2 yrs 5 mos');
  assert.equal(ageLabel('2025-10-06', T), '1 yr');
  assert.equal(ageLabel('2026-09-20', T), '16 days');
  assert.equal(ageLabel('2026-10-05', T), '1 day');
  assert.equal(ageLabel(T, T), 'new today');
  assert.equal(ageLabel('2026-10-09', T), 'arrives in 3 days');
  assert.equal(ageText('2026-07-01', T), '3 mos old');
  assert.equal(ageText(T, T), 'new today');
});

test('status: expired, soon, ok, none', () => {
  assert.deepEqual(itemStatus({ exp: '2026-10-01' }, T), { kind: 'expired', days: -5, label: 'Expired 5 days ago' });
  assert.equal(itemStatus({ exp: '2026-10-05' }, T).label, 'Expired 1 day ago');
  assert.deepEqual(itemStatus({ exp: T }, T), { kind: 'soon', days: 0, label: 'Expires today' });
  assert.equal(itemStatus({ exp: '2026-10-07' }, T).label, 'Tomorrow');
  assert.deepEqual(itemStatus({ exp: '2026-10-15' }, T), { kind: 'soon', days: 9, label: '9 days left' });
  assert.equal(itemStatus({ exp: '2026-11-05' }, T).kind, 'soon'); // 30 days
  assert.equal(itemStatus({ exp: '2026-11-06' }, T).kind, 'ok'); // 31 days
  assert.equal(itemStatus({ exp: '2026-11-06' }, T, 60).kind, 'soon');
  assert.equal(itemStatus({ exp: null }, T).kind, 'none');
});

test('month maths clamps to month ends and crosses years', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  assert.equal(addMonths('2026-03-10', -3), '2025-12-10');
  assert.equal(daysBetween('2026-12-31', '2027-01-01'), 1);
});

test('replacing keeps the same lifespan from today', () => {
  assert.deepEqual(renewedDates({ got: '2026-07-01', exp: '2026-10-01' }, '2026-10-07'), { got: '2026-10-07', exp: '2027-01-07' });
  assert.deepEqual(renewedDates({ got: '2026-08-15', exp: '2026-10-15' }, '2026-10-07'), { got: '2026-10-07', exp: '2026-12-07' });
  assert.deepEqual(renewedDates({ got: '2026-10-01', exp: '2026-10-11' }, '2026-10-07'), { got: '2026-10-07', exp: '2026-10-17' });
  assert.deepEqual(renewedDates({ got: '2020-01-01', exp: null }, '2026-10-07'), { got: '2026-10-07', exp: null });
});

test('lifespan used', () => {
  assert.equal(lifespanUsed('2026-01-01', '2026-01-11', '2026-01-06'), 0.5);
  assert.equal(lifespanUsed('2026-01-01', '2026-01-11', '2027-01-01'), 1);
  assert.equal(lifespanUsed('2026-01-01', null, '2026-01-06'), null);
});

test('date validation and formatting', () => {
  assert.ok(isISODate('2026-02-28'));
  assert.ok(!isISODate('2026-02-30'));
  assert.ok(!isISODate('26-2-3'));
  assert.equal(formatDate('2019-03-12'), 'Mar 12, 2019');
});

test('today and cron follow the chosen time zone', () => {
  const at = new Date('2026-10-06T20:30:00Z');
  assert.equal(todayISO('Asia/Bangkok', at), '2026-10-07');
  assert.equal(todayISO('America/Los_Angeles', at), '2026-10-06');
  assert.equal(tzOffsetMinutes('Asia/Bangkok', at), 420);
  assert.equal(cronFor('09:00', 'Asia/Bangkok', at), '0 2 * * *');
  assert.equal(cronFor('06:30', 'Asia/Bangkok', at), '30 23 * * *'); // previous UTC day
  assert.equal(cronFor('09:00', 'America/New_York', new Date('2026-07-01T12:00:00Z')), '0 13 * * *'); // EDT
  assert.equal(cronFor('09:00', 'America/New_York', new Date('2026-12-01T12:00:00Z')), '0 14 * * *'); // EST
  assert.equal(cronFor('09:15', 'Asia/Kolkata', at), '45 3 * * *');
});
