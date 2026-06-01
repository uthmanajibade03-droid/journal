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

    // Wire color picker <-> hex input for each theme colour
    COLOR_KEYS.forEach(function (k) {
      var picker = $('#settings-form [data-color-key="' + k + '"]');
      var hex = $('#settings-form [data-color-hex="' + k + '"]');
      if (!picker || !hex) return;
      picker.addEventListener('input', function () { hex.value = picker.value; });
      hex.addEventListener('input', function () {
        if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) picker.value = hex.value;
      });
    });

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
    return out;
  }

  function saveSettings() {
    var f = $('#settings-form');
    var colors = {};
    COLOR_KEYS.forEach(function (k) {
      var hex = f.querySelector('[data-color-hex="' + k + '"]');
      var picker = f.querySelector('[data-color-key="' + k + '"]');
      colors[k] = (hex && hex.value.trim()) || (picker && picker.value) || COLOR_DEFAULTS[k];
    });
    var data = {
      brand: f.querySelector('[name="brand"]').value.trim(),
      heroTagline: f.querySelector('[name="heroTagline"]').value,
      heroEmFromLine: parseInt(f.querySelector('[name="heroEmFromLine"]').value, 10) || 3,
      footerTagline: f.querySelector('[name="footerTagline"]').value.trim(),
      subscribeTagline: f.querySelector('[name="subscribeTagline"]').value.trim(),
      bottomTag: f.querySelector('[name="bottomTag"]').value.trim(),
      year: parseInt(f.querySelector('[name="year"]').value, 10),
      contactEmail: f.querySelector('[name="contactEmail"]').value.trim(),
      colors: colors,
      socials: collectSocials()
    };
    setStatus($('#settings-status'), 'Saving…');
    api('settings', { method: 'PUT', body: data }).then(function (res) {
      state.settings = res.settings || data;
      setStatus($('#settings-status'), 'Saved · publishing…', 'ok');
    }).catch(function (err) {
      setStatus($('#settings-status'), 'Save failed: ' + err.message, 'err');
    });
  }

  init();
})();
