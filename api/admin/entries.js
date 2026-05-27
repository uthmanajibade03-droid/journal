/* /api/admin/entries — list (GET) and create (POST). */
const lib = require('../_lib/admin.js');

module.exports = async function handler(req, res) {
  try {
    const ctx = lib.makeCtxOrReject(req, res);
    if (!ctx) return;

    if (req.method === 'GET') {
      const manifest = await lib.readManifest(ctx);
      return lib.send(res, 200, { entries: manifest.entries });
    }

    if (req.method === 'POST') {
      const body = await lib.readBody(req);
      const result = await lib.upsertEntry(ctx, body, true, null);
      return lib.send(res, 200, result);
    }

    lib.send(res, 405, { error: 'method not allowed' });
  } catch (e) {
    lib.reportError(res, e);
  }
};
