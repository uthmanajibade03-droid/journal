/* Single catch-all handler for the dashboard API.
   Reads/writes JSON files in the journal repo via the GitHub API.
   All multi-file updates use the Git Trees API so each save produces
   exactly one commit (and therefore one Vercel deploy).

   Auth model: the user pastes their own GitHub PAT into the dashboard.
   We forward it as the Authorization header on every request. The
   function uses that same PAT to call GitHub — there is no server-side
   GH_TOKEN env var. The repo and branch are inferred from Vercel's
   built-in VERCEL_GIT_* env vars, with hardcoded fallbacks. */

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

// ─── HTTP utilities ───────────────────────────────────────────────
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

// ─── Reading files from GitHub ────────────────────────────────────
async function readJSON(ctx, path) {
  try {
    const r = await ctx.gh('/repos/' + ctx.repo + '/contents/' + path + '?ref=' + ctx.branch);
    return r && r.content ? JSON.parse(b64decode(r.content.replace(/\n/g, ''))) : null;
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// ─── Committing multiple files in a single commit ────────────────
async function commitFiles(ctx, message, files) {
  // files: [{ path: 'data/foo.json', content: '...' | null }] (null = delete)
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
// 6 positional slots around the centre node, in a 1024×600 stage.
const SLOTS = [
  // 0: bottom-left  · label right-aligned, arrow goes down-left
  { x:  20, y: 430, w: 360, align: 'left',
    arrowStart: [445, 340], arrowEnd: [380, 446] },
  // 1: bottom-right · label left-aligned, arrow goes down-right
  { x: 645, y: 430, w: 360, align: 'right',
    arrowStart: [580, 340], arrowEnd: [640, 446] },
  // 2: top-right    · label left-aligned, arrow goes up-right
  { x: 645, y:  70, w: 360, align: 'right',
    arrowStart: [580, 260], arrowEnd: [640, 124] },
  // 3: top-left     · label right-aligned, arrow goes up-left
  { x:  20, y:  70, w: 360, align: 'left',
    arrowStart: [445, 260], arrowEnd: [380, 124] },
  // 4: middle-left  · label right-aligned, arrow goes left
  { x:   0, y: 268, w: 290, align: 'left',
    arrowStart: [400, 300], arrowEnd: [296, 286] },
  // 5: middle-right · label left-aligned, arrow goes right
  { x: 735, y: 268, w: 290, align: 'right',
    arrowStart: [624, 300], arrowEnd: [728, 286] }
];

// For N branches, pick slot indices so the layout looks balanced.
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
  // Any branches beyond slot 6 just don't render — keep them in data
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

// ─── Manifest helpers ─────────────────────────────────────────────
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

// ─── Validation ───────────────────────────────────────────────────
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
function validateEntry(data) {
  if (!data || typeof data !== 'object') return 'invalid body';
  if (!data.title) return 'title required';
  if (!SLUG.test(data.id || '')) return 'slug must be lowercase a-z, 0-9, dashes';
  if (!Array.isArray(data.branches) || !data.branches.length) return 'at least one branch required';
  if (data.branches.length > 6) return 'maximum 6 branches (auto-layout has 6 slots)';
  return null;
}

// ─── Route handlers ───────────────────────────────────────────────
async function listEntries(ctx, req, res) {
  const manifest = await readManifest(ctx);
  send(res, 200, { entries: manifest.entries });
}

async function getEntry(ctx, req, res, id) {
  const entry = await readJSON(ctx, 'data/' + id + '.json');
  if (!entry) return send(res, 404, { error: 'not found' });
  const manifest = await readManifest(ctx);
  const row = manifest.entries.find(function (e) { return e.id === id; }) || {};
  // Merge manifest metadata back onto the entry shape used by the editor
  send(res, 200, Object.assign({
    n: row.n,
    date: row.date,
    dateLabel: row.dateLabel,
    readMin: row.readMin,
    teaser: row.teaser,
    published: row.published !== false
  }, entry));
}

async function upsertEntry(ctx, req, res, body, isNew, existingId) {
  const err = validateEntry(body);
  if (err) return send(res, 400, { error: err });

  const manifest = await readManifest(ctx);
  let existing = null;
  if (!isNew && existingId) {
    existing = await readJSON(ctx, 'data/' + existingId + '.json');
  }

  // If editing and slug changed, treat as rename: delete old, create new
  const isRename = !isNew && existingId && existingId !== body.id;

  // Preserve existing branch layout by index, auto-fill any missing
  let branches = body.branches;
  let arrows = null;
  let center = (existing && existing.center) || null;

  const allHaveLayout = branches.every(function (b) {
    return typeof b.x === 'number' && typeof b.y === 'number';
  });

  if (existing && Array.isArray(existing.branches) && !allHaveLayout) {
    // Merge: copy x/y/w/align from existing[i] into new branches[i]
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
      const out = {
        label: b.label,
        detail: b.detail,
        align: b.align,
        x: b.x,
        y: b.y,
        w: b.w
      };
      if (b.focused) out.focused = true;
      return out;
    }),
    arrows: arrows || [],
    footer: body.footer || ''
  };

  // Update manifest
  const oldRow = manifest.entries.find(function (e) { return e.id === (isRename ? existingId : body.id); });
  const newRow = entryToManifestRow(entry, oldRow);
  if (oldRow) {
    manifest.entries = manifest.entries.map(function (e) { return e.id === oldRow.id ? newRow : e; });
  } else {
    manifest.entries.unshift(newRow);
  }
  manifest.entries.sort(function (a, b) { return (b.n || 0) - (a.n || 0); });

  // Build commit
  const files = [
    { path: 'data/' + entry.id + '.json', content: JSON.stringify(entry, null, 2) + '\n' },
    { path: 'data/index.json', content: JSON.stringify(manifest, null, 2) + '\n' }
  ];
  if (isRename) files.push({ path: 'data/' + existingId + '.json', content: null });

  const msg = isNew ? 'admin: add entry "' + entry.title + '"' :
              isRename ? 'admin: rename entry to "' + entry.title + '"' :
              'admin: update entry "' + entry.title + '"';
  await commitFiles(ctx, msg, files);

  // Also drop the renamed row from manifest if we renamed
  if (isRename) {
    manifest.entries = manifest.entries.filter(function (e) { return e.id !== existingId; });
  }

  send(res, 200, { entry: entry, entries: manifest.entries });
}

async function deleteEntry(ctx, req, res, id) {
  const manifest = await readManifest(ctx);
  const exists = manifest.entries.find(function (e) { return e.id === id; });
  if (!exists) return send(res, 404, { error: 'not found' });
  manifest.entries = manifest.entries.filter(function (e) { return e.id !== id; });

  const files = [
    { path: 'data/' + id + '.json', content: null },
    { path: 'data/index.json', content: JSON.stringify(manifest, null, 2) + '\n' }
  ];
  await commitFiles(ctx, 'admin: delete entry "' + exists.title + '"', files);
  send(res, 200, { entries: manifest.entries });
}

async function getSettings(ctx, req, res) {
  const s = await readJSON(ctx, 'data/settings.json');
  send(res, 200, s || {});
}

async function putSettings(ctx, req, res, body) {
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'invalid body' });
  await commitFiles(ctx, 'admin: update site settings', [
    { path: 'data/settings.json', content: JSON.stringify(body, null, 2) + '\n' }
  ]);
  send(res, 200, { settings: body });
}

// ─── Body parsing ─────────────────────────────────────────────────
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

// ─── Main handler ─────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  try {
    const auth = req.headers['authorization'] || '';
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return send(res, 401, { error: 'missing GitHub token in Authorization header' });
    }

    const ctx = {
      gh: makeGh(token),
      repo: getRepo(),
      branch: getBranch()
    };

    const segments = (req.query && req.query.path) || [];
    const path = Array.isArray(segments) ? segments : [segments].filter(Boolean);
    const method = req.method;

    if (path[0] === 'entries' && !path[1]) {
      if (method === 'GET') return await listEntries(ctx, req, res);
      if (method === 'POST') {
        const body = await readBody(req);
        return await upsertEntry(ctx, req, res, body, true, null);
      }
    }
    if (path[0] === 'entries' && path[1]) {
      const id = path[1];
      if (method === 'GET') return await getEntry(ctx, req, res, id);
      if (method === 'PUT') {
        const body = await readBody(req);
        return await upsertEntry(ctx, req, res, body, false, id);
      }
      if (method === 'DELETE') return await deleteEntry(ctx, req, res, id);
    }
    if (path[0] === 'settings' && !path[1]) {
      if (method === 'GET') return await getSettings(ctx, req, res);
      if (method === 'PUT') {
        const body = await readBody(req);
        return await putSettings(ctx, req, res, body);
      }
    }

    send(res, 404, { error: 'no route for ' + method + ' /' + path.join('/') });
  } catch (e) {
    console.error('admin api error:', e);
    const status = e.status === 401 ? 401 :
                   e.status === 403 ? 403 :
                   e.status === 404 ? 404 : 500;
    send(res, status, { error: e.message || 'internal error' });
  }
};
