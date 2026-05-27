/* Shared helpers for the dashboard's serverless endpoints.
   Lives under /api/_lib/ — the leading underscore tells Vercel not to
   deploy this as its own function. The other files in /api/admin/
   require it for GitHub access and entry processing. */

const REPO_FALLBACK = 'uthmanajibade03-droid/journal';
const BRANCH_FALLBACK = 'main';

function getRepo() {
  if (process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG) {
    return process.env.VERCEL_GIT_REPO_OWNER + '/' + process.env.VERCEL_GIT_REPO_SLUG;
  }
  return process.env.GH_REPO || REPO_FALLBACK;
}
function getBranch() {
  return process.env.GH_BRANCH || process.env.VERCEL_GIT_COMMIT_REF || BRANCH_FALLBACK;
}

const GH = 'https://api.github.com';

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

function makeGh(token) {
  return async function gh(path, init) {
    init = init || {};
    init.headers = Object.assign({
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'journal-dashboard'
    }, init.headers || {});
    if (init.body && typeof init.body !== 'string') init.body = JSON.stringify(init.body);
    const r = await fetch(GH + path, init);
    const text = await r.text();
    if (!r.ok) {
      let msg;
      try { msg = JSON.parse(text).message || text; } catch (e) { msg = text; }
      const err = new Error('GitHub ' + r.status + ': ' + msg);
      err.status = r.status;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  };
}

function b64decode(s) { return Buffer.from(s, 'base64').toString('utf8'); }

async function readJSON(ctx, path) {
  try {
    const r = await ctx.gh('/repos/' + ctx.repo + '/contents/' + path + '?ref=' + ctx.branch);
    return r && r.content ? JSON.parse(b64decode(r.content.replace(/\n/g, ''))) : null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

async function commitFiles(ctx, message, files) {
  const refData = await ctx.gh('/repos/' + ctx.repo + '/git/refs/heads/' + ctx.branch);
  const parentSha = refData.object.sha;
  const parentCommit = await ctx.gh('/repos/' + ctx.repo + '/git/commits/' + parentSha);
  const baseTreeSha = parentCommit.tree.sha;

  const tree = [];
  for (const f of files) {
    if (f.content === null || f.content === undefined) {
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
    } else {
      const blob = await ctx.gh('/repos/' + ctx.repo + '/git/blobs', {
        method: 'POST',
        body: { content: f.content, encoding: 'utf-8' }
      });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
  }

  const newTree = await ctx.gh('/repos/' + ctx.repo + '/git/trees', {
    method: 'POST',
    body: { base_tree: baseTreeSha, tree: tree }
  });

  const commit = await ctx.gh('/repos/' + ctx.repo + '/git/commits', {
    method: 'POST',
    body: { message: message, tree: newTree.sha, parents: [parentSha] }
  });

  await ctx.gh('/repos/' + ctx.repo + '/git/refs/heads/' + ctx.branch, {
    method: 'PATCH',
    body: { sha: commit.sha, force: false }
  });
}

// ─── Auto-layout for branches and arrows ──────────────────────────
const SLOTS = [
  { x:  20, y: 430, w: 360, align: 'left',  arrowStart: [445, 340], arrowEnd: [380, 446] },
  { x: 645, y: 430, w: 360, align: 'right', arrowStart: [580, 340], arrowEnd: [640, 446] },
  { x: 645, y:  70, w: 360, align: 'right', arrowStart: [580, 260], arrowEnd: [640, 124] },
  { x:  20, y:  70, w: 360, align: 'left',  arrowStart: [445, 260], arrowEnd: [380, 124] },
  { x:   0, y: 268, w: 290, align: 'left',  arrowStart: [400, 300], arrowEnd: [296, 286] },
  { x: 735, y: 268, w: 290, align: 'right', arrowStart: [624, 300], arrowEnd: [728, 286] }
];
const SLOT_ORDER = {
  1: [2],
  2: [3, 1],
  3: [3, 2, 0],
  4: [3, 2, 0, 1],
  5: [3, 2, 0, 1, 5],
  6: [3, 2, 0, 1, 5, 4]
};

function arrowHeadPoints(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len;
  const baseX = x2 - ux * 10, baseY = y2 - uy * 10;
  const px = -uy * 5, py = ux * 5;
  return [
    x2.toFixed(1) + ',' + y2.toFixed(1),
    (baseX + px).toFixed(1) + ',' + (baseY + py).toFixed(1),
    (baseX - px).toFixed(1) + ',' + (baseY - py).toFixed(1)
  ].join(' ');
}

function autoLayout(branches) {
  const n = Math.min(branches.length, 6);
  const order = SLOT_ORDER[n] || [];
  const positioned = [];
  const arrows = [];
  for (let i = 0; i < n; i++) {
    const slot = SLOTS[order[i]];
    const b = branches[i] || {};
    positioned.push({
      label: b.label || '',
      detail: b.detail || '',
      align: slot.align,
      x: slot.x,
      y: slot.y,
      w: slot.w,
      focused: !!b.focused
    });
    const [x1, y1] = slot.arrowStart;
    const [x2, y2] = slot.arrowEnd;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2 + (y2 > y1 ? 20 : -20);
    arrows.push({
      d: 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1) +
         ' Q ' + mx.toFixed(1) + ' ' + my.toFixed(1) +
         ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1),
      head: arrowHeadPoints(x1, y1, x2, y2)
    });
  }
  for (let i = n; i < branches.length; i++) positioned.push(branches[i]);
  return { branches: positioned, arrows: arrows };
}

function defaultCenterShape(text) {
  const charW = 16;
  const w = Math.max(160, String(text || '').length * charW + 60);
  const h = 74;
  const p = function (x, y) { return x.toFixed(1) + ' ' + y.toFixed(1); };
  const path =
    'M ' + p(w * 0.06, h * 0.50) +
    ' C ' + p(w * 0.06, h * 0.18) + ', ' + p(w * 0.26, h * 0.06) + ', ' + p(w * 0.50, h * 0.06) +
    ' C ' + p(w * 0.74, h * 0.06) + ', ' + p(w * 0.94, h * 0.18) + ', ' + p(w * 0.94, h * 0.50) +
    ' C ' + p(w * 0.94, h * 0.82) + ', ' + p(w * 0.74, h * 0.94) + ', ' + p(w * 0.50, h * 0.94) +
    ' C ' + p(w * 0.26, h * 0.94) + ', ' + p(w * 0.06, h * 0.82) + ', ' + p(w * 0.06, h * 0.50) +
    ' Z';
  return { viewBox: '0 0 ' + w + ' ' + h, paths: [path] };
}

function manifestScribble(text) {
  const shape = defaultCenterShape(text);
  return { scribbleViewBox: shape.viewBox, scribblePath: shape.paths[0] };
}

function entryToManifestRow(entry, existingRow) {
  const row = Object.assign({}, existingRow || {}, {
    id: entry.id,
    n: entry.n,
    title: entry.title,
    date: entry.date,
    dateLabel: entry.dateLabel,
    readMin: entry.readMin,
    teaser: entry.teaser,
    published: entry.published !== false
  });
  if (!row.scribbleViewBox || !row.scribblePath) {
    const sc = manifestScribble(entry.title);
    row.scribbleViewBox = sc.scribbleViewBox;
    row.scribblePath = sc.scribblePath;
  }
  return row;
}

async function readManifest(ctx) {
  const m = await readJSON(ctx, 'data/index.json');
  return m || { entries: [] };
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
function validateEntry(data) {
  if (!data || typeof data !== 'object') return 'invalid body';
  if (!data.title) return 'title required';
  if (!SLUG.test(data.id || '')) return 'slug must be lowercase a-z, 0-9, dashes';
  if (!Array.isArray(data.branches) || !data.branches.length) return 'at least one branch required';
  if (data.branches.length > 6) return 'maximum 6 branches (auto-layout has 6 slots)';
  return null;
}

function readBody(req) {
  return new Promise(function (resolve, reject) {
    if (req.body) return resolve(req.body);
    let data = '';
    req.on('data', function (c) { data += c; });
    req.on('end', function () {
      if (!data) return resolve(null);
      try { resolve(JSON.parse(data)); }
      catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

// ─── Common request bootstrap ────────────────────────────────────
function makeCtxOrReject(req, res) {
  const auth = req.headers['authorization'] || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    send(res, 401, { error: 'missing GitHub token' });
    return null;
  }
  return { gh: makeGh(token), repo: getRepo(), branch: getBranch() };
}

function reportError(res, e) {
  console.error('admin api error:', e);
  const status = e.status === 401 ? 401 :
                 e.status === 403 ? 403 :
                 e.status === 404 ? 404 : 500;
  send(res, status, { error: e.message || 'internal error' });
}

// ─── Entry write logic, shared by entries.js and entry.js ────────
async function upsertEntry(ctx, body, isNew, existingId) {
  const err = validateEntry(body);
  if (err) { const e = new Error(err); e.status = 400; throw e; }

  const manifest = await readManifest(ctx);
  let existing = null;
  if (!isNew && existingId) {
    existing = await readJSON(ctx, 'data/' + existingId + '.json');
  }

  const isRename = !isNew && existingId && existingId !== body.id;

  let branches = body.branches;
  let arrows = null;
  let center = (existing && existing.center) || null;

  const allHaveLayout = branches.every(function (b) {
    return typeof b.x === 'number' && typeof b.y === 'number';
  });

  if (existing && Array.isArray(existing.branches) && !allHaveLayout) {
    branches = branches.map(function (b, i) {
      const prev = existing.branches[i];
      if (prev && typeof prev.x === 'number') {
        return Object.assign({}, b, { x: prev.x, y: prev.y, w: prev.w, align: prev.align });
      }
      return b;
    });
    const stillMissing = branches.some(function (b) { return typeof b.x !== 'number'; });
    if (stillMissing || branches.length !== existing.branches.length) {
      const laid = autoLayout(branches);
      branches = laid.branches;
      arrows = laid.arrows;
    } else {
      arrows = existing.arrows || autoLayout(branches).arrows;
    }
  } else if (!allHaveLayout) {
    const laid = autoLayout(branches);
    branches = laid.branches;
    arrows = laid.arrows;
  } else {
    arrows = existing && existing.arrows;
  }

  if (!center) center = defaultCenterShape(body.centerText || body.title);
  if (body.centerText) center = Object.assign({}, center, { text: body.centerText });
  else center = Object.assign({}, center, { text: body.title });

  const entry = {
    id: body.id,
    title: body.title,
    titleLong: body.title,
    date: body.date,
    dateLabel: body.dateLabel,
    readMin: body.readMin,
    teaser: body.teaser,
    intro: body.intro,
    center: center,
    branches: branches.map(function (b) {
      const out = { label: b.label, detail: b.detail, align: b.align, x: b.x, y: b.y, w: b.w };
      if (b.focused) out.focused = true;
      return out;
    }),
    arrows: arrows || [],
    footer: body.footer || ''
  };

  const oldRow = manifest.entries.find(function (e) { return e.id === (isRename ? existingId : body.id); });
  const newRow = entryToManifestRow(entry, oldRow);
  if (oldRow) {
    manifest.entries = manifest.entries.map(function (e) { return e.id === oldRow.id ? newRow : e; });
  } else {
    manifest.entries.unshift(newRow);
  }
  manifest.entries.sort(function (a, b) { return (b.n || 0) - (a.n || 0); });

  const files = [
    { path: 'data/' + entry.id + '.json', content: JSON.stringify(entry, null, 2) + '\n' },
    { path: 'data/index.json', content: JSON.stringify(manifest, null, 2) + '\n' }
  ];
  if (isRename) files.push({ path: 'data/' + existingId + '.json', content: null });

  const msg = isNew ? 'admin: add entry "' + entry.title + '"' :
              isRename ? 'admin: rename entry to "' + entry.title + '"' :
              'admin: update entry "' + entry.title + '"';
  await commitFiles(ctx, msg, files);

  if (isRename) {
    manifest.entries = manifest.entries.filter(function (e) { return e.id !== existingId; });
  }

  return { entry: entry, entries: manifest.entries };
}

module.exports = {
  send,
  readJSON,
  readManifest,
  commitFiles,
  readBody,
  makeCtxOrReject,
  reportError,
  validateEntry,
  upsertEntry,
  entryToManifestRow
};
