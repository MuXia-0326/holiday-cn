import { holidays, schema } from './generated/data.mjs';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(request, data, status = 200, extra = {}) {
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(data), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': status === 200 ? 'public, max-age=300' : 'no-store',
      ...extra,
    },
  });
}

export default {
  fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }
    if (!['GET', 'HEAD'].includes(request.method)) {
      return json(request, { error: 'Method not allowed' }, 405, { Allow: 'GET, HEAD, OPTIONS' });
    }
    const path = new URL(request.url).pathname;
    const years = Object.keys(holidays).map(Number).sort((a, b) => a - b);
    if (path === '/' || path === '/api/years') {
      return json(request, { years, endpoints: ['/YYYY.json', '/api/holidays/YYYY', '/schema.json'] });
    }
    if (path === '/schema.json') return json(request, schema);
    const match = /^(?:\/(\d{4})\.json|\/api\/holidays\/(\d{4}))$/.exec(path);
    const year = match?.[1] ?? match?.[2];
    if (year && Object.hasOwn(holidays, year)) return json(request, holidays[year]);
    return json(request, { error: 'Not found' }, 404);
  },
};
