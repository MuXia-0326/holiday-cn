import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function configureDeployment(base, env) {
  const config = structuredClone(base);
  if (env.CLOUDFLARE_ROUTES?.trim()) {
    const routes = JSON.parse(env.CLOUDFLARE_ROUTES);
    if (!Array.isArray(routes) || !routes.every((route) =>
      typeof route === 'string' ? route.length > 0 :
        route && typeof route.pattern === 'string' && route.pattern.length > 0 &&
        (route.custom_domain === true || typeof route.zone_name === 'string' || typeof route.zone_id === 'string'))) {
      throw new Error('CLOUDFLARE_ROUTES must be a JSON array of route patterns or Wrangler route objects');
    }
    config.routes = routes;
    delete config.route;
  }
  if (env.CLOUDFLARE_CUSTOM_DOMAINS?.trim()) {
    const domains = env.CLOUDFLARE_CUSTOM_DOMAINS.split(',').map((domain) => domain.trim());
    if (!domains.every((domain) => /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(domain))) {
      throw new Error('CLOUDFLARE_CUSTOM_DOMAINS must contain comma-separated hostnames without protocol, path or wildcard');
    }
    config.routes = [...(config.routes ?? (config.route ? [config.route] : [])),
      ...domains.map((pattern) => ({ pattern, custom_domain: true }))];
    delete config.route;
  }
  if (env.CLOUDFLARE_WORKERS_DEV?.trim()) {
    if (!['true', 'false'].includes(env.CLOUDFLARE_WORKERS_DEV)) throw new Error('CLOUDFLARE_WORKERS_DEV must be true or false');
    config.workers_dev = env.CLOUDFLARE_WORKERS_DEV === 'true';
  }
  return config;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const base = JSON.parse(await readFile(new URL('wrangler.jsonc', import.meta.url), 'utf8'));
  const config = configureDeployment(base, process.env);
  // Generated config lives in a different directory, so resolve the entry explicitly.
  config.main = fileURLToPath(new URL(base.main, import.meta.url));
  delete config.$schema;
  await mkdir(new URL('.wrangler/', import.meta.url), { recursive: true });
  await writeFile(new URL('.wrangler/deploy.json', import.meta.url), JSON.stringify(config, null, 2));
  console.log('Deployment configuration generated.');
}
