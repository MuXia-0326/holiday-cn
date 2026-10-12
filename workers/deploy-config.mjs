import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function configureDeployment(base, env) {
  const config = structuredClone(base);
  // This configuration deploys the already validated artifact from CI.
  // The artifact contains generated data but not the repository's source JSON.
  delete config.build;
  if (env.CLOUDFLARE_ROUTES?.trim()) {
    const routes = JSON.parse(env.CLOUDFLARE_ROUTES);
    if (!Array.isArray(routes) || !routes.every((route) =>
      typeof route === 'string' ? route.length > 0 :
        route && typeof route.pattern === 'string' && route.pattern.length > 0 &&
        route.custom_domain !== true &&
        (typeof route.zone_name === 'string' || typeof route.zone_id === 'string'))) {
      throw new Error('CLOUDFLARE_ROUTES must contain ordinary Workers routes; custom domains are not supported');
    }
    config.routes = routes.map((route) => typeof route === 'string' ?
      { pattern: route, custom_domain: false } : { ...route, custom_domain: false });
    delete config.route;
  }
  if (config.routes || config.route) {
    const routes = config.routes ?? [config.route];
    if (routes.some((route) => route?.custom_domain === true)) {
      throw new Error('Custom domains are not supported; configure ordinary Workers routes in wrangler.jsonc');
    }
    config.routes = routes.map((route) => typeof route === 'string' ?
      { pattern: route, custom_domain: false } : { ...route, custom_domain: false });
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
  for (const route of config.routes ?? (config.route ? [config.route] : [])) {
    console.log(`Workers route: ${route.pattern}`);
  }
}
