import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import worker from '../src/index.mjs';

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
