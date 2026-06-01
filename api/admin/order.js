/* /api/admin/order — POST { order: [id1, id2, ...] } reorders entries
   and renumbers them so id1 becomes the highest n. */
const lib = require('../_lib/admin.js');

module.exports = async function handler(req, res) {
  try {
    const ctx = lib.makeCtxOrReject(req, res);
    if (!ctx) return;
    if (req.method !== 'POST' && req.method !== 'PUT') {
      return lib.send(res, 405, { error: 'method not allowed' });
    }
    const body = await lib.readBody(req);
    const order = (body && body.order) || [];
    const result = await lib.reorderEntries(ctx, order);
    return lib.send(res, 200, result);
  } catch (e) {
    lib.reportError(res, e);
  }
};
