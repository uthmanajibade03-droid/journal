(function () {
  var main = document.getElementById('entry-main');
  if (!main) return;

  // 1024x600 is the original layout coordinate space. Branches are positioned
  // with absolute px values that we convert to percentages so the whole
  // diagram scales with its container.
  var VW = 1024;
  var VH = 600;

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function escapeHTML(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function centerSVG(c) {
    if (!c) return '';
    var paths = (c.paths || []).map(function (d) {
      return '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>';
    }).join('');
    return '<svg class="center-shape" preserveAspectRatio="none" viewBox="' + (c.viewBox || '0 0 200 74') + '" aria-hidden="true">' + paths + '</svg>';
  }

  function arrowsSVG(arrows) {
    var parts = (arrows || []).map(function (a) {
      var head = a.head ? '<polygon points="' + a.head + '" />' : '';
      return '<path class="arrow-path" d="' + a.d + '" fill="none" />' + head;
    }).join('');
    return '<svg class="arrows-svg" viewBox="0 0 ' + VW + ' ' + VH + '" preserveAspectRatio="none" aria-hidden="true">' + parts + '</svg>';
  }

  function branchHTML(b, i) {
    var leftPct = (b.x / VW) * 100;
    var topPct = (b.y / VH) * 100;
    var widthPct = (b.w / VW) * 100;
    var cls = 'branch align-' + (b.align || 'right') + (b.focused ? ' focused' : '');
    return (
      '<div class="' + cls + '" style="left:' + leftPct.toFixed(3) + '%;top:' + topPct.toFixed(3) + '%;width:' + widthPct.toFixed(3) + '%;--i:' + i + '">' +
        '<div class="branch-label">' + escapeHTML(b.label) + '</div>' +
        '<div class="branch-detail">' + escapeHTML(b.detail) + '</div>' +
      '</div>'
    );
  }

  function renderAside(currentId, manifest) {
    if (!manifest || !manifest.entries) return '';
    var items = manifest.entries.map(function (e) {
      var cur = e.id === currentId ? ' class="is-current"' : '';
      return '<li><a href="journal.html?id=' + e.id + '"' + cur + '>' +
        '<span class="aside-num">— ' + pad(e.n) + '</span>' +
        '<span>' + escapeHTML(e.title) + '</span>' +
      '</a></li>';
    }).join('');
    return (
      '<aside class="entry-aside">' +
        '<p class="entry-aside-label">More entries</p>' +
        '<ul>' + items + '</ul>' +
      '</aside>'
    );
  }

  function renderEntry(entry, manifest) {
    var meta = manifest && manifest.entries
      ? manifest.entries.find(function (e) { return e.id === entry.id; })
      : null;
    var n = meta ? meta.n : 0;
    var readMin = meta ? meta.readMin : (entry.readMin || 0);
    var dateLabel = (meta && meta.dateLabel) || entry.dateLabel || '';
    var title = entry.titleLong || entry.title;

    document.title = title + ' — uthman';

    // For mobile (stacked) view, put the focused branch first so it leads.
    // For desktop, source order is fine since branches are absolutely positioned.
    var branchList = (entry.branches || []).slice();
    var focusedIdx = branchList.findIndex(function (b) { return b.focused; });
    if (focusedIdx > 0) {
      var focused = branchList.splice(focusedIdx, 1)[0];
      branchList.unshift(focused);
    }
    var branchesHTML = branchList.map(branchHTML).join('');

    main.innerHTML =
      '<div class="entry-head">' +
        '<p class="entry-eyebrow">No. ' + pad(n) + ' — ' + escapeHTML(entry.title) + '</p>' +
        '<h1 class="entry-title">' + escapeHTML(title) + '</h1>' +
        '<p class="entry-meta-row">' + readMin + ' min read · ' + escapeHTML(dateLabel) + '</p>' +
      '</div>' +
      '<div class="mindmap" id="mindmap">' +
        '<div class="mindmap-stage">' +
          '<div class="intro-card">' + escapeHTML(entry.intro || '') + '</div>' +
          arrowsSVG(entry.arrows) +
          '<div class="center-node">' +
            centerSVG(entry.center) +
            '<span class="center-text">' + escapeHTML((entry.center && entry.center.text) || entry.title) + '</span>' +
          '</div>' +
          '<div class="branches">' + branchesHTML + '</div>' +
          '<div class="footer-card">' + escapeHTML(entry.footer || '') + '</div>' +
        '</div>' +
      '</div>' +
      renderAside(entry.id, manifest);

    // Trigger the staggered fade-in
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var mm = document.getElementById('mindmap');
        if (mm) mm.classList.add('is-ready');
      });
    });
  }

  function renderError(msg, sub) {
    main.innerHTML =
      '<div class="entry-head">' +
        '<p class="entry-eyebrow">' + escapeHTML(sub || '') + '</p>' +
        '<h1 class="entry-title">' + escapeHTML(msg) + '</h1>' +
        '<p class="entry-meta-row"><a href="/" style="color:var(--accent);text-decoration:underline;text-underline-offset:4px">Back to the index</a></p>' +
      '</div>';
  }

  var id = param('id');
  if (!id) { renderError('Missing entry id', '404'); return; }

  // Runtime endpoints with static-file fallback AND localStorage cache.
  // The cache lets repeat visits render instantly — the live fetch runs
  // in the background and refreshes the cache for the next visit.
  function fetchEntry(slug) {
    var cacheKey = 'journal.cache.entry:' + slug;
    var live = fetch('/api/data/entry?id=' + encodeURIComponent(slug), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (data && data.id) {
          try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
          return data;
        }
        return fetch('data/' + encodeURIComponent(slug) + '.json').then(function (r) {
          if (!r.ok) throw new Error('entry ' + r.status);
          return r.json();
        });
      });
    try {
      var cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && cached.id) {
        // Render with cached data immediately. Live fetch still runs and
        // updates the cache for next time.
        live.catch(function () {});
        return Promise.resolve(cached);
      }
    } catch (e) {}
    return live;
  }
  function fetchManifest() {
    var cacheKey = 'journal.cache.manifest';
    var live = fetch('/api/data/index', { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (data && Array.isArray(data.entries) && data.entries.length) {
          try { localStorage.setItem(cacheKey, JSON.stringify(data)); } catch (e) {}
          return data;
        }
        return fetch('data/index.json')
          .then(function (r) { return r.ok ? r.json() : { entries: [] }; })
          .catch(function () { return { entries: [] }; });
      });
    try {
      var cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (cached && Array.isArray(cached.entries) && cached.entries.length) {
        live.catch(function () {});
        return Promise.resolve(cached);
      }
    } catch (e) {}
    return live;
  }

  Promise.all([fetchEntry(id), fetchManifest()]).then(function (results) {
    renderEntry(results[0], results[1]);
  }).catch(function (err) {
    console.error('Failed to load entry:', err);
    renderError('Not found', '404');
  });
})();
