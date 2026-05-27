/* /api/admin/entry?id=slug — GET, PUT, DELETE for a single entry. */
const lib = require('../_lib/admin.js');

module.exports = async function handler(req, res) {
  try {
    const ctx = lib.makeCtxOrReject(req, res);
    if (!ctx) return;

    const id = (req.query && req.query.id) || '';
    if (!id) return lib.send(res, 400, { error: 'missing ?id=' });

    if (req.method === 'GET') {
      const entry = await lib.readJSON(ctx, 'data/' + id + '.json');
      if (!entry) return lib.send(res, 404, { error: 'not found' });
      const manifest = await lib.readManifest(ctx);
      const row = manifest.entries.find(function (e) { return e.id === id; }) || {};
      return lib.send(res, 200, Object.assign({
        n: row.n,
        date: row.date,
        dateLabel: row.dateLabel,
        readMin: row.readMin,
        teaser: row.teaser,
        published: row.published !== false
      }, entry));
    }

    if (req.method === 'PUT') {
      const body = await lib.readBody(req);
      const result = await lib.upsertEntry(ctx, body, false, id);
      return lib.send(res, 200, result);
    }

    if (req.method === 'DELETE') {
      const manifest = await lib.readManifest(ctx);
      const exists = manifest.entries.find(function (e) { return e.id === id; });
      if (!exists) return lib.send(res, 404, { error: 'not found' });
      manifest.entries = manifest.entries.filter(function (e) { return e.id !== id; });
      await lib.commitFiles(ctx, 'admin: delete entry "' + exists.title + '"', [
        { path: 'data/' + id + '.json', content: null },
        { path: 'data/index.json', content: JSON.stringify(manifest, null, 2) + '\n' }
      ]);
      return lib.send(res, 200, { entries: manifest.entries });
    }

    lib.send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    lib.reportError(res, e);
  }
};
