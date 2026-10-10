import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import worker from '../src/index.mjs';
import { createDateLookup } from '../src/date.mjs';

const request = (path, method = 'GET') => worker.fetch(new Request(`https://example.com${path}`, { method }));

test('every yearly endpoint preserves the complete source JSON', async () => {
  const root = new URL('../../', import.meta.url);
  for (const file of (await readdir(root)).filter((file) => /^\d{4}\.json$/.test(file))) {
    const expected = JSON.parse(await readFile(new URL(file, root), 'utf8'));
    for (const path of [`/${file}`, `/api/holidays/${expected.year}`]) {
      const response = request(path);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), expected);
      assert.equal(response.headers.get('Access-Control-Allow-Origin'), '*');
    }
  }
});

test('index includes all available years and schema is preserved', async () => {
  const files = (await readdir(new URL('../../', import.meta.url))).filter((file) => /^\d{4}\.json$/.test(file));
  assert.deepEqual((await request('/api/years').json()).years, files.map((file) => Number(file.slice(0, 4))).sort());
  assert.deepEqual(await request('/schema.json').json(), JSON.parse(await readFile(new URL('../../schema.json', import.meta.url), 'utf8')));
});

test('unknown years and paths return uncached JSON 404', async () => {
  for (const path of ['/9999.json', '/api/holidays/9999', '/foo', '/schema.json/extra']) {
    const response = request(path);
    assert.equal(response.status, 404);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
});

test('HEAD, preflight and unsupported methods follow HTTP semantics', async () => {
  assert.equal(request('/2026.json', 'HEAD').status, 200);
  assert.equal(await request('/2026.json', 'HEAD').text(), '');
  assert.equal(request('/2026.json', 'OPTIONS').status, 204);
  assert.equal(request('/2026.json', 'POST').status, 405);
  assert.equal(request('/2026.json', 'POST').headers.get('Allow'), 'GET, HEAD, OPTIONS');
});

test('date API distinguishes holidays, adjusted workdays, weekends and ordinary workdays', async () => {
  for (const [date, expected] of [
    ['2026-01-01', { isHoliday: true, isOffDay: true, isWorkday: false, isAdjustedWorkday: false, name: '元旦' }],
    ['2026-01-04', { isHoliday: false, isOffDay: false, isWorkday: true, isAdjustedWorkday: true, name: '元旦' }],
    ['2026-01-10', { isHoliday: false, isOffDay: true, isWorkday: false, isAdjustedWorkday: false, name: null }],
    ['2026-01-12', { isHoliday: false, isOffDay: false, isWorkday: true, isAdjustedWorkday: false, name: null }],
  ]) {
    const response = request(`/api/holiday?date=${date}`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.date, date);
    assert.equal(data.dataAvailable, true);
    for (const [key, value] of Object.entries(expected)) assert.equal(data[key], value, `${date}: ${key}`);
  }
  assert.equal(await request('/api/holiday?date=2026-01-01', 'HEAD').text(), '');
});

test('date API rejects impossible dates, missing dates and ambiguous input', () => {
  for (const query of ['', '?date=', '?date=2026-2-01', '?date=2026-02-29', '?date=2026-04-31',
    '?date=2026-13-01', '?date=2026-00-01', '?date=2026-01-00', '?date=2026-01-01T00:00:00Z',
    '?date=2026-01-01&date=2026-01-02']) {
    assert.equal(request(`/api/holiday${query}`).status, 400, query);
  }
  assert.equal(request('/api/holiday?date=2024-02-29').status, 200);
});

test('unpublished or missing years have unknown holiday and workday status', async () => {
  const lookup = createDateLookup({ '2027': { papers: [], days: [] } });
  for (const date of ['2027-01-01', '2099-01-01']) {
    const data = lookup(date);
    assert.equal(data.dataAvailable, false);
    for (const key of ['isHoliday', 'isOffDay', 'isWorkday', 'isAdjustedWorkday']) assert.equal(data[key], null);
  }
  const response = request('/api/holiday?date=2099-01-01');
  assert.equal(response.status, 200);
  assert.equal((await response.json()).isHoliday, null);
});

test('cross-year records and newer announcements override weekend defaults and older records', () => {
  const lookup = createDateLookup({
    '2025': { papers: ['older'], days: [{ date: '2025-12-28', name: '旧安排', isOffDay: true }] },
    '2026': { papers: ['newer'], days: [{ date: '2025-12-28', name: '新安排', isOffDay: false }] },
  });
  const data = lookup('2025-12-28');
  assert.equal(data.isWeekend, true);
  assert.equal(data.isOffDay, false);
  assert.equal(data.isAdjustedWorkday, true);
  assert.equal(data.name, '新安排');
  assert.equal(data.sourceYear, 2026);
});
