/* /api/data/entry?id=<slug> — public read of one journal entry. */
const kv = require('../_lib/kv.js');

const FALLBACK_BASE = process.env.JOURNAL_FALLBACK_URL ||
  (process.env.VERCEL_URL ? 'https://' + process.env.VERCEL_URL : 'http://localhost:3000');

module.exports = async function handler(req, res) {
  try {
    const id = (req.query && req.query.id) || '';
    res.setHeader('Content-Type', 'application/json');
    if (!id || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid id' }));
      return;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');

    let data = null;
    if (kv.configured()) data = await kv.get('journal:entry:' + id);
    if (!data) {
      try {
        const r = await fetch(FALLBACK_BASE + '/data/' + id + '.json', { cache: 'no-store' });
        if (r.ok) data = await r.json();
      } catch (e) { /* swallow */ }
    }
    if (!data) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify(data));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
