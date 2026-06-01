/* /api/data/index — public read of the entries manifest.
   KV first; falls back to the static /data/index.json that's bundled
   alongside this function so we never depend on a runtime self-fetch. */
const kv = require('../_lib/kv.js');

let staticFallback = null;
try { staticFallback = require('../../data/index.json'); } catch (e) { /* bundle missed it */ }

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');
    res.setHeader('Content-Type', 'application/json');

    let data = null;
    if (kv.configured()) {
      try { data = await kv.get('journal:manifest'); }
      catch (e) { console.warn('kv.get manifest failed:', e.message); }
    }
    if (!data) data = staticFallback;

    res.statusCode = 200;
    res.end(JSON.stringify(data || { entries: [] }));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message, entries: [] }));
  }
};
