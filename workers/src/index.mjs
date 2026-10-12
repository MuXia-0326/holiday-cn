import { holidays, schema } from './generated/data.mjs';
import { createDateLookup } from './date.mjs';

const lookupDate = createDateLookup(holidays);

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
    const url = new URL(request.url);
    const path = url.pathname;
    const years = Object.keys(holidays).map(Number).sort((a, b) => a - b);
    if (path === '/' || path === '/api/years') {
      return json(request, { years, endpoints: ['/YYYY.json', '/api/holidays/YYYY', '/api/holiday?date=YYYY-MM-DD', '/api/holidays?date=YYYY-MM-DD&date=YYYY-MM-DD', '/schema.json'] });
    }
    if (path === '/api/holiday') {
      const dates = url.searchParams.getAll('date');
      const result = dates.length === 1 ? lookupDate(dates[0]) : null;
      if (!result) return json(request, { error: 'Provide exactly one valid date in YYYY-MM-DD format' }, 400);
      return json(request, result);
    }
    if (path === '/api/holidays') {
      const dates = url.searchParams.getAll('date').flatMap((value) => value.split(',').map((date) => date.trim()));
      const results = dates.map(lookupDate);
      if (!dates.length || results.some((result) => !result)) {
        return json(request, { error: 'Provide one or more valid dates using comma-separated or repeated date parameters in YYYY-MM-DD format' }, 400);
      }
      return json(request, results);
    }
    if (path === '/schema.json') return json(request, schema);
    const match = /^(?:\/(\d{4})\.json|\/api\/holidays\/(\d{4}))$/.exec(path);
    const year = match?.[1] ?? match?.[2];
    if (year && Object.hasOwn(holidays, year)) return json(request, holidays[year]);
    return json(request, { error: 'Not found' }, 404);
  },
};
