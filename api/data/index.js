/* /api/data/index — public read of the entries manifest.
   Reads from Vercel KV first; falls back to the static /data/index.json
   in the repo if KV is empty (first run, before any admin save). */
const kv = require('../_lib/kv.js');

const FALLBACK_BASE = process.env.JOURNAL_FALLBACK_URL ||
  (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000');

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json');

    let data = null;
    if (kv.configured()) data = await kv.get('journal:manifest');
    if (!data) {
      // Fallback: fetch the static file shipped with this deployment.
      try {
        const r = await fetch(FALLBACK_BASE + '/data/index.json', { cache: 'no-store' });
        if (r.ok) data = await r.json();
      } catch (e) { /* swallow; will return empty */ }
    }
    res.statusCode = 200;
    res.end(JSON.stringify(data || { entries: [] }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
