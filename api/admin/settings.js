/* /api/admin/settings — GET (load) and PUT (save). */
const lib = require('../_lib/admin.js');

module.exports = async function handler(req, res) {
  try {
    const ctx = lib.makeCtxOrReject(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const s = await lib.readJSON(ctx, 'data/settings.json');
      return lib.send(res, 200, s || {});
    }

    if (req.method === 'PUT') {
      const body = await lib.readBody(req);
      if (!body || typeof body !== 'object') return lib.send(res, 400, { error: 'invalid body' });
      await lib.commitFiles(ctx, 'admin: update site settings', [
        { path: 'data/settings.json', content: JSON.stringify(body, null, 2) + '\n' }
      ]);
      return lib.send(res, 200, { settings: body });
    }

    lib.send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    lib.reportError(res, e);
  }
};
