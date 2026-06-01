/* /api/data/settings — public read of site settings. */
const kv = require('../_lib/kv.js');

let staticFallback = null;
try { staticFallback = require('../../data/settings.json'); } catch (e) {}

module.exports = async function handler(req, res) {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=60');

    let data = null;
    if (kv.configured()) {
      try { data = await kv.get('journal:settings'); }
      catch (e) { console.warn('kv.get settings failed:', e.message); }
    }
    if (!data) data = staticFallback;

    res.statusCode = 200;
    res.end(JSON.stringify(data || {}));
  } catch (e) {
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  }
};
