import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDeployment } from '../deploy-config.mjs';

test('retains repository routes when no override is supplied', () => {
  const base = { routes: [{ pattern: 'api.example.com', custom_domain: true }], workers_dev: false };
  assert.deepEqual(configureDeployment(base, {}), base);
});

test('combines configured routes and custom domains and controls workers.dev', () => {
  const result = configureDeployment({ workers_dev: true }, {
    CLOUDFLARE_ROUTES: '[{"pattern":"example.com/api/*","zone_name":"example.com"}]',
    CLOUDFLARE_CUSTOM_DOMAINS: 'holiday.example.com, api.example.com',
    CLOUDFLARE_WORKERS_DEV: 'false',
  });
  assert.deepEqual(result.routes, [
    { pattern: 'example.com/api/*', zone_name: 'example.com' },
    { pattern: 'holiday.example.com', custom_domain: true },
    { pattern: 'api.example.com', custom_domain: true },
  ]);
  assert.equal(result.workers_dev, false);
});

test('invalid deployment settings stop before publication', () => {
  for (const env of [
    { CLOUDFLARE_CUSTOM_DOMAINS: 'https://example.com' },
    { CLOUDFLARE_ROUTES: '{}' },
    { CLOUDFLARE_ROUTES: '[{}]' },
    { CLOUDFLARE_WORKERS_DEV: 'no' },
  ]) assert.throws(() => configureDeployment({}, env));
});
