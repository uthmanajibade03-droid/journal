/* /api/data/entry?id=<slug> — public read of one journal entry. */
const kv = require('../_lib/kv.js');
const fs = require('fs');
const path = require('path');

// Read the bundled static fallback synchronously at function load time.
// vercel.json's `includeFiles` ensures the data/ folder ships with the
// function so this works without any runtime self-fetch.
function readStatic(id) {
  try {
    const p = path.join(process.cwd(), 'data', id + '.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return null;
  }
}

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
    if (kv.configured()) {
      try { data = await kv.get('journal:entry:' + id); }
      catch (e) { console.warn('kv.get entry failed:', e.message); }
    }
    if (!data) data = readStatic(id);

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
