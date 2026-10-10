// Drives the real app in Chromium against an in-memory fake of the GitHub API.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { serve } from '../../tools/serve.js';

const PHOTO = readFileSync(new URL('../../app/icons/icon-192.png', import.meta.url));
const NOW = new Date('2026-10-06T03:00:00Z'); // 10:00 in Bangkok

let server;
let browser;
let base;

before(async () => {
  server = await serve(new URL('../../app', import.meta.url).pathname);
  base = `http://127.0.0.1:${server.address().port}/`;
  browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
});

after(async () => {
  await browser?.close();
  server?.close();
});

function fakeGitHub(login = 'pawtester') {
  const files = new Map(); // path -> Buffer
  const sha = (buf) => createHash('sha1').update(buf).digest('hex');
  const gh = { files, repo: null, dispatches: [], text: (p) => files.get(p)?.toString('utf8') };
  gh.handler = async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const method = req.method();
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/user') return json(200, { login });
    if (url.pathname === '/user/repos' && method === 'POST') {
      gh.repo = { name: 'pawventory-data', private: JSON.parse(req.postData()).private, default_branch: 'main' };
      return json(201, gh.repo);
    }
    if (url.pathname === `/repos/${login}/pawventory-data`) return gh.repo ? json(200, gh.repo) : json(404, { message: 'Not Found' });
    const m = url.pathname.match(new RegExp(`^/repos/${login}/pawventory-data/contents/(.+)$`));
    if (m) {
      const path = decodeURIComponent(m[1]);
      const existing = files.get(path);
      if (method === 'GET') {
        if (!existing) return json(404, { message: 'Not Found' });
        if ((req.headers().accept || '').includes('raw')) return route.fulfill({ status: 200, body: existing });
        return json(200, { sha: sha(existing), content: existing.toString('base64') });
      }
      const body = JSON.parse(req.postData());
      if (method === 'PUT') {
        if (existing && body.sha !== sha(existing)) return json(existing && !body.sha ? 422 : 409, { message: 'sha mismatch' });
        const buf = Buffer.from(body.content, 'base64');
        files.set(path, buf);
        return json(existing ? 200 : 201, { content: { sha: sha(buf) } });
      }
      if (method === 'DELETE') {
        if (!existing || body.sha !== sha(existing)) return json(409, { message: 'sha mismatch' });
        files.delete(path);
        return json(200, {});
      }
    }
    if (url.pathname.endsWith('/dispatches') && method === 'POST') {
      gh.dispatches.push(JSON.parse(req.postData()));
      return route.fulfill({ status: 204 });
    }
    return json(404, { message: `fake GitHub: no route for ${method} ${url.pathname}` });
  };
  return gh;
}

async function openApp(gh) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Bangkok', serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await context.route('https://fonts.gstatic.com/**', (r) => r.abort());
  if (gh) await context.route('https://api.github.com/**', gh.handler);
  await page.goto(base);
  return { page, context, errors };
}

async function until(fn, what, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`Timed out waiting for ${what}`);
}

test('connects to GitHub, syncs items with photos, and installs the reminder job', async () => {
  const gh = fakeGitHub();
  const { page, context, errors } = await openApp(gh);

  await page.waitForURL(/#\/setup$/);
  await page.fill('#token', 'ghp_test');
  await page.click('#connect');
  await page.waitForURL(/#\/$/);

  assert.equal(gh.repo.private, true);
  assert.ok(gh.text('data/items.json'));
  const vapid = JSON.parse(gh.text('config/vapid.json'));
  assert.equal(vapid.publicKey.length, 87); // 65-byte P-256 point, base64url
  assert.match(gh.text('.github/workflows/reminders.yml'), /cron: '0 2 \* \* \*'/); // 09:00 Bangkok
  assert.equal(gh.text('scripts/package.json').includes('"type": "module"'), true);
  for (const f of ['dates.js', 'model.js', 'reminders.js', 'remind-job.mjs']) assert.ok(gh.text(`scripts/${f}`), f);

  // Add an item with a photo.
  await page.click('.fab');
  await page.waitForURL(/#\/add$/);
  await page.setInputFiles('#lib', { name: 'brush.png', mimeType: 'image/png', buffer: PHOTO });
  await page.waitForSelector('.photo-preview[src^="blob:"]');
  await page.fill('#name', 'Toothbrush');
  await page.selectOption('#brand', '__new__');
  await page.fill('dialog input', 'Oral-B');
  await page.click('dialog button[value="ok"]');
  await page.waitForFunction(() => document.querySelector('#brand')?.value === 'Oral-B');
  await page.click('[data-cat="Personal care"]');
  await page.click('[data-sub="Toothbrush"]');
  await page.fill('#got', '2026-07-01');
  await page.click('[data-quick="3"]');
  assert.equal(await page.inputValue('#exp'), '2026-10-01');
  await page.click('#save');
  await page.waitForURL(/#\/item\//);
  await page.getByText('Expired 5 days ago').first().waitFor();
  await page.getByText('3 mos', { exact: true }).waitFor();
  await page.getByText('Personal care › Toothbrush').waitFor();

  await until(() => [...gh.files.keys()].some((p) => p.startsWith('photos/')) && gh.text('data/items.json').includes('Toothbrush'), 'item + photo upload');
  const photoPath = [...gh.files.keys()].find((p) => p.startsWith('photos/'));
  assert.equal(gh.files.get(photoPath).subarray(0, 3).toString('hex'), 'ffd8ff'); // stored as JPEG

  // Home shows the card with its age and status.
  await page.click('.detail-bar a[href="#/"]');
  const card = page.locator('.item-card', { hasText: 'Toothbrush' });
  await card.getByText('3 mos old').waitFor();
  await card.getByText('Expired 5 days ago').waitFor();
  await card.getByText('Oral-B').waitFor();
  assert.equal(JSON.parse(gh.text('data/items.json')).items[0].brand, 'Oral-B');
  await page.getByText('1 thing needs your attention').waitFor();
  await card.locator('img.photo-img').waitFor();

  // Another device adds something; syncing brings it in.
  const remote = JSON.parse(gh.text('data/items.json'));
  remote.items.push({
    id: 'mac1', name: 'Passport', category: 'Documents', got: '2019-03-12', exp: '2026-10-20', createdAt: 2, updatedAt: Date.now(), deleted: false,
  });
  gh.files.set('data/items.json', Buffer.from(JSON.stringify(remote)));
  await page.goto(`${base}#/settings`);
  await page.click('[data-act="sync"]');
  await page.goto(`${base}#/`);
  await page.locator('.item-card', { hasText: 'Passport' }).getByText('7 yrs 6 mos old').waitFor();
  await page.getByText('2 things need your attention').waitFor();

  // Brand filter shows only that brand's things.
  await page.selectOption('#brand-filter', 'Oral-B');
  assert.equal(await page.locator('#grid .item-card').count(), 1);
  await page.locator('#grid .item-card', { hasText: 'Toothbrush' }).waitFor();
  await page.selectOption('#brand-filter', '');
  assert.equal(await page.locator('#grid .item-card').count(), 2);

  // Picking a category shows its sub-categories in use; picking one filters the grid.
  await page.click('[data-cat="Personal care"]');
  await page.click('.chips-sub [data-sub="Toothbrush"]');
  assert.equal(await page.locator('#grid .item-card').count(), 1);
  await page.click('[data-cat="All"]');
  assert.equal(await page.locator('.chips-sub').count(), 0);

  // The brand dropdown offers brands already used, and reuses their spelling.
  await page.click('.fab');
  await page.waitForSelector('#brand');
  assert.deepEqual(await page.locator('#brand option').allTextContents(), ['No brand', 'Oral-B', '+ New brand…']);
  await page.selectOption('#brand', '__new__');
  await page.fill('dialog input', 'oral-b');
  await page.click('dialog button[value="ok"]');
  await page.waitForFunction(() => document.querySelector('#brand')?.value === 'Oral-B');
  await page.goto(`${base}#/`);

  // "I replaced it" restarts the same 3-month lifespan from today.
  await page.locator('.item-card', { hasText: 'Toothbrush' }).click();
  await page.click('[data-act="replace"]');
  await page.click('dialog button[value="ok"]');
  await page.getByText('Jan 6, 2027').waitFor();
  await page.getByText('Replaced 1 time').waitFor();

  // Calendar shows the passport on Oct 20.
  await page.goto(`${base}#/calendar`);
  await page.getByRole('heading', { name: 'October 2026' }).waitFor();
  await page.click('[data-day="2026-10-20"]');
  await page.locator('.list-row', { hasText: 'Passport' }).first().waitFor();

  // Changing the daily time reschedules the job.
  await page.goto(`${base}#/reminders`);
  await page.fill('#notify-time', '07:30');
  await page.dispatchEvent('#notify-time', 'change');
  await until(() => /cron: '30 0 \* \* \*'/.test(gh.text('.github/workflows/reminders.yml')), 'workflow reschedule');

  // Theme toggle.
  await page.click('[data-action="toggle-theme"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');

  // Deleting removes it everywhere, photo included.
  await page.goto(`${base}#/`);
  await page.locator('.item-card', { hasText: 'Toothbrush' }).click();
  await page.click('[data-act="delete"]');
  await page.click('dialog button[value="ok"]');
  await page.waitForURL(/#\/$/);
  await until(() => !gh.files.has(photoPath), 'photo removal');
  const final = JSON.parse(gh.text('data/items.json'));
  assert.equal(final.items.find((i) => i.name === 'Passport').deleted, false);
  assert.equal(final.items.filter((i) => i.deleted).length, 1);

  assert.deepEqual(errors, []);
  await context.close();
});

test('works on this device only, without GitHub', async () => {
  const { page, context, errors } = await openApp(null);
  await page.waitForURL(/#\/setup$/);
  await page.click('[data-act="local"]');
  await page.getByText("Let's sniff out your first thing").waitFor();
  await page.click('.fab');
  await page.fill('#name', 'Laptop');
  await page.click('#expires');
  await page.click('#save');
  await page.waitForURL(/#\/item\//);
  await page.getByText('Never').waitFor();
  await page.goto(`${base}#/reminders`);
  await page.getByText('Notifications need sync').waitFor();
  await page.goto(`${base}#/settings`);
  await page.getByText('Only on this device').waitFor();
  await page.click('[data-theme-mode="dark"]');
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await page.reload();
  await page.goto(`${base}#/`);
  await page.locator('.item-card', { hasText: 'Laptop' }).getByText('new today').waitFor();
  assert.deepEqual(errors, []);
  await context.close();
});
