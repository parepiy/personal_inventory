import { test } from 'node:test';
import assert from 'node:assert/strict';
import { brandsOf, emptyData, merge, normalize, referencedPhotos, sameData } from '../app/js/model.js';

const item = (id, fields) => ({ id, name: id, createdAt: 1, updatedAt: 1, deleted: false, ...fields });

test('merge keeps the newest version of each item from either device', () => {
  const phone = { ...emptyData('UTC'), items: [item('a', { name: 'Toothbrush (phone)', updatedAt: 5 }), item('b')] };
  const mac = { ...emptyData('UTC'), items: [item('a', { name: 'Toothbrush (mac)', updatedAt: 3 }), item('c', { createdAt: 2 })] };
  const m = merge(phone, mac);
  assert.deepEqual(m.items.map((i) => [i.id, i.name]), [['a', 'Toothbrush (phone)'], ['b', 'b'], ['c', 'c']]);
  assert.ok(sameData(merge(phone, mac), merge(mac, phone)));
});

test('a delete on one device wins over an older edit on another', () => {
  const phone = { ...emptyData('UTC'), items: [{ id: 'a', deleted: true, createdAt: 1, updatedAt: 9 }] };
  const mac = { ...emptyData('UTC'), items: [item('a', { name: 'Old', updatedAt: 4 })] };
  assert.equal(merge(mac, phone).items[0].deleted, true);
  assert.equal(merge(phone, mac).items[0].deleted, true);
});

test('settings and categories take the newest copy', () => {
  const a = emptyData('UTC');
  const b = emptyData('UTC');
  b.settings = { ...b.settings, notifyTime: '07:30', updatedAt: 10 };
  a.categories = { list: ['Pet'], updatedAt: 20 };
  const m = merge(a, b);
  assert.equal(m.settings.notifyTime, '07:30');
  assert.deepEqual(m.categories.list, ['Pet']);
});

test('normalize repairs partial or odd files', () => {
  const n = normalize({ items: [{ id: 'x', name: 'Lamp' }, null, { name: 'no id' }], settings: { notifyTime: '08:00' } }, 'Asia/Bangkok');
  assert.equal(n.items.length, 1);
  assert.equal(n.items[0].exp, null);
  assert.deepEqual(n.items[0].history, []);
  assert.equal(n.settings.notifyTime, '08:00');
  assert.equal(n.settings.timezone, 'Asia/Bangkok');
  assert.ok(n.categories.list.includes('Documents'));
  assert.deepEqual(normalize(null, 'UTC').items, []);
});

test('only live items keep their photos', () => {
  const d = { ...emptyData('UTC'), items: [item('a', { photo: 'photos/a.jpg' }), item('b', { photo: 'photos/b.jpg', deleted: true })] };
  assert.deepEqual([...referencedPhotos(d)], ['photos/a.jpg']);
});

test('brands are listed once each, A to Z, ignoring case and blanks', () => {
  const items = [{ brand: 'oral-B' }, { brand: 'Apple' }, { brand: ' Oral-B ' }, { brand: '' }, {}];
  assert.deepEqual(brandsOf(items), ['Apple', 'oral-B']);
  assert.equal(normalize({ items: [{ id: 'x' }] }, 'UTC').items[0].brand, '');
});

test('sub-categories: defaults for older files, kept per category, items get an empty one', async () => {
  const { DEFAULT_SUBCATEGORIES, subsOf } = await import('../app/js/model.js');
  const old = normalize({ items: [{ id: 'x' }], categories: { list: ['Personal care', 'Garden'], updatedAt: 5 } }, 'UTC');
  assert.deepEqual(subsOf(old.categories, 'Personal care'), DEFAULT_SUBCATEGORIES['Personal care']);
  assert.deepEqual(subsOf(old.categories, 'Garden'), []);
  assert.equal(old.items[0].subcategory, '');
  const saved = normalize({ categories: { list: ['Pet'], subs: { Pet: ['Food', 7, ''] }, updatedAt: 9 } }, 'UTC');
  assert.deepEqual(saved.categories.subs, { Pet: ['Food'] });
  assert.deepEqual(subsOf(saved.categories, ''), []);
});
