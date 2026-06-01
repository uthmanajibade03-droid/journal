/* /api/data/settings — public read of site settings. */
const kv = require('../_lib/kv.js');

const FALLBACK_BASE = process.env.JOURNAL_FALLBACK_URL ||
  (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000');

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');

    let data = null;
    if (kv.configured()) data = await kv.get('journal:settings');
    if (!data) {
      try {
        const r = await fetch(FALLBACK_BASE + '/data/settings.json', { cache: 'no-store' });
        if (r.ok) data = await r.json();
      } catch (e) { /* swallow */ }
    }
    res.statusCode = 200;
    res.end(JSON.stringify(data || {}));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
