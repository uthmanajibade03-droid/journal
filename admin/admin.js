(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var TOKEN_KEY = 'admin.token';
  var COLOR_KEYS = ['bg', 'panel', 'fg', 'muted', 'accent'];
  var COLOR_DEFAULTS = {
    bg: '#0a0a0a',
    panel: '#111111',
    fg: '#f5f1e8',
    muted: '#8a8275',
    accent: '#f6c54a'
  };
  var PALETTE_PRESETS = {
    amber:   { bg:'#0a0a0a', panel:'#111111', fg:'#f5f1e8', muted:'#8a8275', accent:'#f6c54a' },
    crimson: { bg:'#0c0608', panel:'#160c0e', fg:'#f3e9e9', muted:'#9a8585', accent:'#e3535a' },
    forest:  { bg:'#0a0e0a', panel:'#101410', fg:'#eaf0e8', muted:'#8a948a', accent:'#7dc080' },
    steel:   { bg:'#0b0e12', panel:'#13171c', fg:'#e5edf3', muted:'#7d8a99', accent:'#5d9bff' },
    sand:    { bg:'#f5efe1', panel:'#fffbf0', fg:'#241f17', muted:'#7c6f56', accent:'#9e6b21' }
  };

  // ─── Tiny HSL helpers for the "Suggest palette" feature ──────────
  function hexToHsl(hex) {
    var h = String(hex || '').replace(/^#/, '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(h.slice(0,2),16)/255, g = parseInt(h.slice(2,4),16)/255, b = parseInt(h.slice(4,6),16)/255;
    var max = Math.max(r,g,b), min = Math.min(r,g,b);
    var hh, ss, ll = (max+min)/2;
    if (max === min) { hh = ss = 0; }
    else {
      var d = max-min;
      ss = ll > 0.5 ? d/(2-max-min) : d/(max+min);
      switch (max) {
        case r: hh = (g-b)/d + (g<b?6:0); break;
        case g: hh = (b-r)/d + 2; break;
        case b: hh = (r-g)/d + 4; break;
      }
      hh /= 6;
    }
    return { h: hh*360, s: ss*100, l: ll*100 };
  }
  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360 / 360;
    s = Math.max(0, Math.min(100, s)) / 100;
    l = Math.max(0, Math.min(100, l)) / 100;
    var r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      var hue2 = function (p, q, t) {
        if (t<0) t+=1; if (t>1) t-=1;
        if (t<1/6) return p+(q-p)*6*t;
        if (t<1/2) return q;
        if (t<2/3) return p+(q-p)*(2/3-t)*6;
        return p;
      };
      var q = l<0.5 ? l*(1+s) : l+s-l*s;
      var p = 2*l-q;
      r = hue2(p,q,h+1/3); g = hue2(p,q,h); b = hue2(p,q,h-1/3);
    }
    var toHex = function (c) { var v = Math.round(c*255).toString(16); return v.length === 1 ? '0'+v : v; };
    return '#' + toHex(r) + toHex(g) + toHex(b);
  }
  function suggestPaletteFromAccent(accentHex) {
    var hsl = hexToHsl(accentHex);
    // Dark background tinted toward accent hue, very muted.
    return {
      bg:     hslToHex(hsl.h, 12, 4),
      panel:  hslToHex(hsl.h, 10, 7),
      fg:     hslToHex(hsl.h, 14, 93),
      muted:  hslToHex(hsl.h, 10, 55),
      accent: accentHex
    };
  }

  var state = {
    token: null,
    entries: [],        // manifest entries
    entryFilter: '',    // current search string
    editing: null,
    settings: null
  };

  // ─── API helpers ──────────────────────────────────────────────────
  // Logical resource paths used in this file:
  //   'entries'         → /api/admin/entries     (list, create)
  //   'entries/<slug>'  → /api/admin/entry?id=…  (load, update, delete)
  //   'settings'        → /api/admin/settings    (load, save)
  //   'order'           → /api/admin/order       (reorder entries)
  function routeFor(path) {
    var parts = String(path).split('/');
    if (parts[0] === 'entries' && parts[1]) {
      return '/api/admin/entry?id=' + encodeURIComponent(parts[1]);
    }
    return '/api/admin/' + parts[0];
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.token
    }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    return fetch(routeFor(path), opts).then(function (r) {
      if (r.status === 401) { signOut(); throw new Error('unauthorized'); }
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = t || ('HTTP ' + r.status);
          if (/^\s*<!doctype/i.test(msg) || /^\s*<html/i.test(msg)) {
            msg = 'API not reachable (' + r.status + ').';
          } else {
            try { msg = (JSON.parse(msg).error) || msg; } catch (e) {}
          }
          throw new Error(String(msg).slice(0, 240));
        });
      }
      return r.json();
    });
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text || '';
    el.className = 'status ' + (kind || 'muted');
    if (kind === 'ok') {
      setTimeout(function () { if (el.textContent === text) { el.textContent = ''; } }, 2500);
    }
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function monthLabel(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return '';
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return months[d.getMonth()] + ' ' + d.getFullYear();
  }

  function slugify(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[—–]/g, '-')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ─── Login ────────────────────────────────────────────────────────
  function init() {
    var stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      state.token = stored;
      verifyAndStart();
    } else {
      showLogin();
    }

    $('#login-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var t = $('#token-input').value.trim();
      if (!t) return;
      state.token = t;
      verifyAndStart();
    });

    $('#logout-btn').addEventListener('click', signOut);
  }

  function showLogin() { $('#login').hidden = false; $('#app').hidden = true; }
  function showApp() { $('#login').hidden = true; $('#app').hidden = false; }
  function signOut() {
    localStorage.removeItem(TOKEN_KEY);
    state.token = null;
    showLogin();
  }

  function verifyAndStart() {
    api('entries').then(function (data) {
      localStorage.setItem(TOKEN_KEY, state.token);
      state.entries = data.entries || [];
      showApp();
      renderEntries();
      wireNav();
    }).catch(function (err) {
      var loginErr = $('#login-error');
      loginErr.hidden = false;
      var m = err.message || '';
      if (m === 'unauthorized' || /\b401\b/.test(m) || /Bad credentials/i.test(m)) {
        loginErr.textContent = "GitHub didn't accept that token. Check it has Contents: read & write on this repo.";
      } else if (/\b403\b/.test(m)) {
        loginErr.textContent = "Token rejected with 403 — the PAT exists but isn't scoped to this repo or lacks Contents write.";
      } else if (/\b404\b/.test(m)) {
        loginErr.textContent = "Couldn't reach the repo. The deployment may still be building.";
      } else {
        loginErr.textContent = m.slice(0, 240);
      }
    });
  }

  // ─── Navigation ───────────────────────────────────────────────────
  function wireNav() {
    $$('.nav-btn[data-view]').forEach(function (b) {
      b.addEventListener('click', function () { showView(b.dataset.view); });
    });
    $('#new-entry-btn').addEventListener('click', function () { openEditor(null); });
    $('#editor-back').addEventListener('click', function () { showView('entries'); });
    $('#editor-save').addEventListener('click', saveEditor);
    $('#editor-delete').addEventListener('click', deleteCurrentEntry);
    $('#add-branch').addEventListener('click', function () {
      addBranchRow({ label: '', detail: '', focused: false });
    });
    $('#settings-save').addEventListener('click', saveSettings);
    $('#add-social').addEventListener('click', function () {
      addSocialRow({ label: '', url: '' });
    });

    // Search box
    var searchIn = $('#entries-search');
    if (searchIn) {
      searchIn.addEventListener('input', function () {
        state.entryFilter = searchIn.value.trim().toLowerCase();
        renderEntries();
      });
    }

    // Wire color picker <-> hex input for each theme colour, and update
    // the live preview pane on every change.
    COLOR_KEYS.forEach(function (k) {
      var picker = $('#settings-form [data-color-key="' + k + '"]');
      var hex = $('#settings-form [data-color-hex="' + k + '"]');
      if (!picker || !hex) return;
      picker.addEventListener('input', function () {
        hex.value = picker.value;
        updatePreview();
      });
      hex.addEventListener('input', function () {
        if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) {
          picker.value = hex.value;
          updatePreview();
        }
      });
    });

    // Brand name typed into the form is reflected in the preview too.
    var brandIn = $('#settings-form [name="brand"]');
    if (brandIn) brandIn.addEventListener('input', updatePreview);

    // Built-in preset buttons (custom ones are wired in renderCustomPresets)
    $$('.preset-swatch[data-preset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        applyPalette(PALETTE_PRESETS[btn.dataset.preset]);
      });
    });

    // "Suggest palette from accent" — derive bg/panel/fg/muted from the
    // accent hue so they harmonise. The accent itself is preserved.
    $('#suggest-palette').addEventListener('click', function () {
      var accentHex = ($('#settings-form [data-color-hex="accent"]') || {}).value || COLOR_DEFAULTS.accent;
      applyPalette(suggestPaletteFromAccent(accentHex));
    });

    // "Save current palette as a named preset"
    $('#save-preset').addEventListener('click', saveCurrentAsPreset);

    // Slug auto-fill from title when slug is empty
    var titleIn = $('#editor-form [name="title"]');
    var slugIn = $('#editor-form [name="id"]');
    titleIn.addEventListener('input', function () {
      if (!slugIn.dataset.touched) slugIn.value = slugify(titleIn.value);
    });
    slugIn.addEventListener('input', function () { slugIn.dataset.touched = '1'; });
  }

  function showView(name) {
    $$('.view').forEach(function (v) { v.hidden = true; });
    $$('.nav-btn[data-view]').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.view === name);
    });
    if (name === 'entries') {
      $('#view-entries').hidden = false;
    } else if (name === 'editor') {
      $('#view-editor').hidden = false;
    } else if (name === 'settings') {
      $('#view-settings').hidden = false;
      loadSettings();
    }
  }

  // ─── Entries list ─────────────────────────────────────────────────
  function visibleEntries() {
    var q = state.entryFilter;
    var sorted = state.entries.slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
    if (!q) return sorted;
    return sorted.filter(function (e) {
      return (e.title || '').toLowerCase().indexOf(q) !== -1 ||
             (e.id || '').toLowerCase().indexOf(q) !== -1;
    });
  }

  function renderEntries() {
    var box = $('#entries-table');
    var rows = visibleEntries();
    var countEl = $('#entries-count');
    if (countEl) {
      var total = state.entries.length;
      countEl.textContent = rows.length === total ? total + ' total' : rows.length + ' of ' + total;
    }
    if (!state.entries.length) {
      box.innerHTML = '<p class="muted" style="padding:24px">No entries yet. Click "+ New entry" to create one.</p>';
      return;
    }
    if (!rows.length) {
      box.innerHTML = '<p class="muted" style="padding:24px">No entries match that search.</p>';
      return;
    }
    box.innerHTML = rows.map(function (e, i) {
      var pubClass = e.published === false ? 'draft' : 'published';
      var pubLabel = e.published === false ? 'Draft' : 'Published';
      var first = i === 0;
      var last = i === rows.length - 1;
      return (
        '<div class="entry-row" data-id="' + escapeHTML(e.id) + '">' +
          '<span class="num">No. ' + pad(e.n || 0) + '</span>' +
          '<span class="title">' + escapeHTML(e.title) + '</span>' +
          '<span class="slug">' + escapeHTML(e.id) + '</span>' +
          '<span class="meta">' + (e.readMin || 0) + ' min · ' + escapeHTML(e.dateLabel || '') + '</span>' +
          '<span class="status-pill ' + pubClass + '">' + pubLabel + '</span>' +
          '<span class="row-actions">' +
            '<button type="button" class="icon-btn" data-action="up" title="Move up" ' + (first ? 'disabled' : '') + '>↑</button>' +
            '<button type="button" class="icon-btn" data-action="down" title="Move down" ' + (last ? 'disabled' : '') + '>↓</button>' +
            '<button type="button" class="icon-btn" data-action="duplicate" title="Duplicate">⎘</button>' +
          '</span>' +
        '</div>'
      );
    }).join('');
    $$('.entry-row', box).forEach(function (row) {
      var id = row.dataset.id;
      $$('.icon-btn', row).forEach(function (btn) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (btn.dataset.action === 'up') moveEntry(id, -1);
          else if (btn.dataset.action === 'down') moveEntry(id, +1);
          else if (btn.dataset.action === 'duplicate') duplicateEntry(id);
        });
      });
      row.addEventListener('click', function () { openEditor(id); });
    });
  }

  function moveEntry(id, delta) {
    // Reorder within the FULL sorted list (not the filtered view), so a
    // search doesn't skip over entries the user can't currently see.
    var ordered = state.entries.slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
    var idx = ordered.findIndex(function (e) { return e.id === id; });
    if (idx < 0) return;
    var target = idx + delta;
    if (target < 0 || target >= ordered.length) return;
    var tmp = ordered[idx]; ordered[idx] = ordered[target]; ordered[target] = tmp;
    var order = ordered.map(function (e) { return e.id; });

    // Optimistic UI: renumber locally so the list refreshes instantly
    var total = ordered.length;
    ordered.forEach(function (e, i) { e.n = total - i; });
    state.entries = ordered;
    renderEntries();

    api('order', { method: 'POST', body: { order: order } }).then(function (res) {
      state.entries = res.entries || state.entries;
      renderEntries();
    }).catch(function (err) {
      alert('Reorder failed: ' + err.message);
    });
  }

  function duplicateEntry(id) {
    setStatus($('#editor-status'), 'Loading…');
    api('entries/' + encodeURIComponent(id)).then(function (entry) {
      // Open the editor in "new" mode, pre-filled from this entry.
      showView('editor');
      var f = $('#editor-form');
      f.reset();
      $('#branches-list').innerHTML = '';
      $('#editor-delete').hidden = true;
      state.editing = { isNew: true };
      f.querySelector('[name="title"]').value = (entry.title || '') + ' (copy)';
      var newSlug = slugify(f.querySelector('[name="title"]').value);
      f.querySelector('[name="id"]').value = newSlug;
      f.querySelector('[name="id"]').dataset.touched = '1';
      f.querySelector('[name="date"]').value = todayISO();
      f.querySelector('[name="readMin"]').value = entry.readMin || 3;
      f.querySelector('[name="teaser"]').value = entry.teaser || '';
      f.querySelector('[name="intro"]').value = entry.intro || '';
      f.querySelector('[name="footer"]').value = entry.footer || '';
      f.querySelector('[name="published"]').checked = false;  // duplicates start as drafts
      (entry.branches || []).forEach(addBranchRow);
      if (!(entry.branches || []).length) addBranchRow({ label: '', detail: '', focused: false });
      setStatus($('#editor-status'), 'Copy ready — edit, then save.');
    }).catch(function (err) {
      alert('Duplicate failed: ' + err.message);
    });
  }

  // ─── Editor ───────────────────────────────────────────────────────
  function openEditor(id) {
    showView('editor');
    var f = $('#editor-form');
    f.reset();
    $('#branches-list').innerHTML = '';
    delete f.querySelector('[name="id"]').dataset.touched;
    setStatus($('#editor-status'), 'Loading…');
    $('#editor-delete').hidden = !id;

    if (!id) {
      state.editing = { isNew: true };
      f.querySelector('[name="date"]').value = todayISO();
      f.querySelector('[name="readMin"]').value = 3;
      f.querySelector('[name="published"]').checked = true;
      addBranchRow({ label: '', detail: '', focused: true });
      addBranchRow({ label: '', detail: '', focused: false });
      addBranchRow({ label: '', detail: '', focused: false });
      setStatus($('#editor-status'), '');
      return;
    }

    api('entries/' + encodeURIComponent(id)).then(function (entry) {
      state.editing = entry;
      f.querySelector('[name="title"]').value = entry.title || '';
      f.querySelector('[name="id"]').value = entry.id || '';
      f.querySelector('[name="id"]').dataset.touched = '1';
      f.querySelector('[name="date"]').value = entry.date || '';
      f.querySelector('[name="readMin"]').value = entry.readMin || 3;
      f.querySelector('[name="teaser"]').value = entry.teaser || '';
      f.querySelector('[name="intro"]').value = entry.intro || '';
      f.querySelector('[name="footer"]').value = entry.footer || '';
      f.querySelector('[name="published"]').checked = entry.published !== false;
      $('#branches-list').innerHTML = '';
      (entry.branches || []).forEach(addBranchRow);
      if (!(entry.branches || []).length) addBranchRow({ label: '', detail: '', focused: false });
      setStatus($('#editor-status'), '');
    }).catch(function (err) {
      setStatus($('#editor-status'), 'Failed to load: ' + err.message, 'err');
    });
  }

  function addBranchRow(b) {
    var box = $('#branches-list');
    var row = document.createElement('div');
    row.className = 'branch-edit';
    row.innerHTML =
      '<input type="text" placeholder="Label" value="' + escapeHTML(b.label || '') + '" />' +
      '<input type="text" placeholder="Detail (one sentence)" value="' + escapeHTML(b.detail || '') + '" />' +
      '<label class="focus-toggle"><input type="checkbox" ' + (b.focused ? 'checked' : '') + ' /><span>Focused</span></label>' +
      '<button type="button" class="branch-remove" title="Remove">✕</button>';
    row.querySelector('.branch-remove').addEventListener('click', function () { row.remove(); });
    row.querySelector('.focus-toggle input').addEventListener('change', function (e) {
      if (e.target.checked) {
        $$('.focus-toggle input', box).forEach(function (cb) {
          if (cb !== e.target) cb.checked = false;
        });
      }
    });
    box.appendChild(row);
  }

  function collectBranches() {
    return $$('.branch-edit', $('#branches-list')).map(function (row) {
      var inputs = row.querySelectorAll('input');
      return {
        label: inputs[0].value.trim(),
        detail: inputs[1].value.trim(),
        focused: inputs[2].checked
      };
    }).filter(function (b) { return b.label || b.detail; });
  }

  function saveEditor() {
    var f = $('#editor-form');
    var data = {
      title: f.querySelector('[name="title"]').value.trim(),
      id: f.querySelector('[name="id"]').value.trim(),
      date: f.querySelector('[name="date"]').value,
      readMin: parseInt(f.querySelector('[name="readMin"]').value, 10) || 3,
      teaser: f.querySelector('[name="teaser"]').value.trim(),
      intro: f.querySelector('[name="intro"]').value.trim(),
      footer: f.querySelector('[name="footer"]').value.trim(),
      published: f.querySelector('[name="published"]').checked,
      branches: collectBranches()
    };
    data.dateLabel = monthLabel(data.date);
    if (!data.title || !data.id || !data.branches.length) {
      setStatus($('#editor-status'), 'Title, slug, and at least one branch are required.', 'err');
      return;
    }

    setStatus($('#editor-status'), 'Saving…');
    var isNew = state.editing && state.editing.isNew;
    var url = isNew ? 'entries' : 'entries/' + encodeURIComponent(state.editing.id);
    var method = isNew ? 'POST' : 'PUT';
    api(url, { method: method, body: data }).then(function (res) {
      state.entries = res.entries || state.entries;
      state.editing = res.entry || data;
      setStatus($('#editor-status'), 'Saved · publishing…', 'ok');
      renderEntries();
      setTimeout(function () { showView('entries'); }, 700);
    }).catch(function (err) {
      setStatus($('#editor-status'), 'Save failed: ' + err.message, 'err');
    });
  }

  function deleteCurrentEntry() {
    if (!state.editing || state.editing.isNew) return;
    if (!confirm('Delete "' + state.editing.title + '"? This removes the entry from the site.')) return;
    setStatus($('#editor-status'), 'Deleting…');
    api('entries/' + encodeURIComponent(state.editing.id), { method: 'DELETE' }).then(function (res) {
      state.entries = res.entries || [];
      renderEntries();
      showView('entries');
    }).catch(function (err) {
      setStatus($('#editor-status'), 'Delete failed: ' + err.message, 'err');
    });
  }

  // ─── Settings: live preview & palette helpers ────────────────────
  function updatePreview() {
    var preview = $('#theme-preview');
    if (!preview) return;
    var f = $('#settings-form');
    COLOR_KEYS.forEach(function (k) {
      var hex = f.querySelector('[data-color-hex="' + k + '"]');
      var picker = f.querySelector('[data-color-key="' + k + '"]');
      var v = (hex && hex.value.trim()) || (picker && picker.value) || COLOR_DEFAULTS[k];
      preview.style.setProperty('--tp-' + k, v);
    });
    var brandIn = f.querySelector('[name="brand"]');
    var brandEl = preview.querySelector('.tp-brand-text');
    if (brandIn && brandEl) brandEl.textContent = brandIn.value || 'uthman';
  }

  function applyPalette(p) {
    if (!p) return;
    var f = $('#settings-form');
    COLOR_KEYS.forEach(function (k) {
      if (!p[k]) return;
      var picker = f.querySelector('[data-color-key="' + k + '"]');
      var hex = f.querySelector('[data-color-hex="' + k + '"]');
      if (picker) picker.value = p[k];
      if (hex) hex.value = p[k];
    });
    updatePreview();
  }

  function currentColors() {
    var f = $('#settings-form');
    var out = {};
    COLOR_KEYS.forEach(function (k) {
      var hex = f.querySelector('[data-color-hex="' + k + '"]');
      var picker = f.querySelector('[data-color-key="' + k + '"]');
      out[k] = (hex && hex.value.trim()) || (picker && picker.value) || COLOR_DEFAULTS[k];
    });
    return out;
  }

  function renderCustomPresets() {
    var host = $('#preset-custom-host');
    var divider = $('#preset-divider');
    if (!host || !divider) return;
    var names = Object.keys((state.settings && state.settings.customPresets) || {});
    host.innerHTML = '';
    divider.hidden = names.length === 0;
    names.forEach(function (name) {
      var p = state.settings.customPresets[name];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'preset-swatch is-custom';
      btn.title = name + ' (custom)';
      btn.innerHTML =
        '<span style="background:' + escapeHTML(p.bg) + '"></span>' +
        '<span style="background:' + escapeHTML(p.panel) + '"></span>' +
        '<span style="background:' + escapeHTML(p.accent) + '"></span>' +
        '<span class="preset-name">' + escapeHTML(name) + '</span>' +
        '<button type="button" class="preset-remove" title="Delete preset" aria-label="Delete preset">✕</button>';
      btn.addEventListener('click', function (ev) {
        if (ev.target.closest('.preset-remove')) return;  // delete is its own click
        applyPalette(p);
      });
      btn.querySelector('.preset-remove').addEventListener('click', function (ev) {
        ev.stopPropagation();
        if (!confirm('Delete preset "' + name + '"?')) return;
        delete state.settings.customPresets[name];
        renderCustomPresets();
        // Persist immediately so the user doesn't have to also hit Save.
        persistSettings({ silent: true });
      });
      host.appendChild(btn);
    });
  }

  function saveCurrentAsPreset() {
    var name = window.prompt('Name this palette (e.g. "Sunset", "Mono Mint")');
    if (!name) return;
    name = name.trim().slice(0, 40);
    if (!name) return;
    if (!state.settings) state.settings = {};
    if (!state.settings.customPresets) state.settings.customPresets = {};
    if (state.settings.customPresets[name]) {
      if (!confirm('A preset named "' + name + '" already exists. Replace it?')) return;
    }
    state.settings.customPresets[name] = currentColors();
    renderCustomPresets();
    persistSettings({ silent: false, statusMsg: 'Preset "' + name + '" saved.' });
  }

  // Save settings to GitHub. Used by both the main Save button and the
  // preset add/remove actions so custom presets persist immediately.
  function persistSettings(opts) {
    opts = opts || {};
    var data = collectSettingsForm();
    var statusEl = $('#settings-status');
    if (!opts.silent) setStatus(statusEl, 'Saving…');
    return api('settings', { method: 'PUT', body: data }).then(function (res) {
      state.settings = res.settings || data;
      if (!opts.silent) setStatus(statusEl, opts.statusMsg || 'Saved · publishing…', 'ok');
    }).catch(function (err) {
      setStatus(statusEl, 'Save failed: ' + err.message, 'err');
    });
  }

  function collectSettingsForm() {
    var f = $('#settings-form');
    var data = {
      brand: f.querySelector('[name="brand"]').value.trim(),
      heroTagline: f.querySelector('[name="heroTagline"]').value,
      heroEmFromLine: parseInt(f.querySelector('[name="heroEmFromLine"]').value, 10) || 3,
      footerTagline: f.querySelector('[name="footerTagline"]').value.trim(),
      subscribeTagline: f.querySelector('[name="subscribeTagline"]').value.trim(),
      bottomTag: f.querySelector('[name="bottomTag"]').value.trim(),
      year: parseInt(f.querySelector('[name="year"]').value, 10),
      contactEmail: f.querySelector('[name="contactEmail"]').value.trim(),
      colors: currentColors(),
      socials: collectSocials()
    };
    var customPresets = state.settings && state.settings.customPresets;
    if (customPresets && Object.keys(customPresets).length) data.customPresets = customPresets;
    return data;
  }

  // ─── Settings ─────────────────────────────────────────────────────
  function addSocialRow(s) {
    var box = $('#socials-list');
    var row = document.createElement('div');
    row.className = 'social-edit';
    row.innerHTML =
      '<input type="text" placeholder="Label (e.g. X / Twitter)" value="' + escapeHTML(s.label || '') + '" />' +
      '<input type="text" placeholder="URL or mailto:…" value="' + escapeHTML(s.url || '') + '" />' +
      '<button type="button" class="branch-remove" title="Remove">✕</button>';
    row.querySelector('.branch-remove').addEventListener('click', function () { row.remove(); });
    box.appendChild(row);
  }

  function collectSocials() {
    return $$('.social-edit', $('#socials-list')).map(function (row) {
      var inputs = row.querySelectorAll('input');
      return { label: inputs[0].value.trim(), url: inputs[1].value.trim() };
    }).filter(function (s) { return s.label && s.url; });
  }

  function loadSettings() {
    setStatus($('#settings-status'), 'Loading…');
    api('settings').then(function (raw) {
      var s = migrateSettings(raw || {});
      state.settings = s;
      var f = $('#settings-form');
      // Plain text/number fields by name
      ['brand','heroTagline','heroEmFromLine','footerTagline','subscribeTagline','bottomTag','year','contactEmail'].forEach(function (k) {
        var input = f.querySelector('[name="' + k + '"]');
        if (input && s[k] != null) input.value = s[k];
      });
      // Colour pickers
      COLOR_KEYS.forEach(function (k) {
        var picker = f.querySelector('[data-color-key="' + k + '"]');
        var hex = f.querySelector('[data-color-hex="' + k + '"]');
        var v = (s.colors && s.colors[k]) || COLOR_DEFAULTS[k];
        if (picker) picker.value = v;
        if (hex) hex.value = v;
      });
      // Socials
      $('#socials-list').innerHTML = '';
      (s.socials || []).forEach(addSocialRow);
      if (!(s.socials || []).length) addSocialRow({ label: '', url: '' });
      // Custom presets (kept on state.settings so the host can render them)
      renderCustomPresets();
      updatePreview();
      setStatus($('#settings-status'), '');
    }).catch(function (err) {
      setStatus($('#settings-status'), 'Load failed: ' + err.message, 'err');
    });
  }

  function migrateSettings(s) {
    var out = Object.assign({}, s);
    if (!out.colors) out.colors = {};
    if (s.accent && !out.colors.accent) out.colors.accent = s.accent;
    COLOR_KEYS.forEach(function (k) {
      if (!out.colors[k]) out.colors[k] = COLOR_DEFAULTS[k];
    });
    if (!Array.isArray(out.socials) || !out.socials.length) {
      var legacy = [];
      if (s.twitter) legacy.push({ label: 'X / Twitter', url: s.twitter });
      if (s.rssPath) legacy.push({ label: 'RSS', url: s.rssPath });
      if (s.email) legacy.push({ label: 'Email', url: 'mailto:' + s.email });
      out.socials = legacy;
    }
    if (!out.contactEmail && s.email) out.contactEmail = s.email;
    if (!out.customPresets || typeof out.customPresets !== 'object') out.customPresets = {};
    return out;
  }

  function saveSettings() {
    persistSettings({ silent: false });
  }

  init();
})();
