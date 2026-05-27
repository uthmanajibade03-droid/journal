(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  var TOKEN_KEY = 'admin.token';
  var state = {
    token: null,
    entries: [],   // manifest entries
    editing: null, // current entry being edited (full content + manifest meta)
    settings: null
  };

  // ─── API helpers ──────────────────────────────────────────────────
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + state.token
    }, opts.headers || {});
    if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
    return fetch('/api/admin/' + path, opts).then(function (r) {
      if (r.status === 401) { signOut(); throw new Error('unauthorized'); }
      if (!r.ok) {
        return r.text().then(function (t) {
          var msg = t || ('HTTP ' + r.status);
          // If the server returned HTML (e.g. from a non-API host), keep
          // it short and tag-free so the dashboard stays readable.
          if (/^\s*<!doctype/i.test(msg) || /^\s*<html/i.test(msg)) {
            msg = 'API not reachable (' + r.status + '). Make sure the dashboard is running on Vercel.';
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

  function showLogin() {
    $('#login').hidden = false;
    $('#app').hidden = true;
  }

  function showApp() {
    $('#login').hidden = true;
    $('#app').hidden = false;
  }

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
        loginErr.textContent = "Couldn't reach the repo. The deployment may still be building, or the dashboard's repo config is wrong.";
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
    $('#add-branch').addEventListener('click', function () { addBranchRow({ label: '', detail: '', focused: false }); });
    $('#settings-save').addEventListener('click', saveSettings);

    // Sync color picker <-> hex input
    var color = $('#settings-form [name="accent"]');
    var hex = $('#settings-form [name="accentHex"]');
    color.addEventListener('input', function () { hex.value = color.value; });
    hex.addEventListener('input', function () {
      if (/^#[0-9a-fA-F]{6}$/.test(hex.value)) color.value = hex.value;
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
  function renderEntries() {
    var box = $('#entries-table');
    if (!state.entries.length) {
      box.innerHTML = '<p class="muted" style="padding:24px">No entries yet. Click "+ New entry" to create one.</p>';
      return;
    }
    var sorted = state.entries.slice().sort(function (a, b) { return (b.n || 0) - (a.n || 0); });
    box.innerHTML = sorted.map(function (e) {
      var pubClass = e.published === false ? 'draft' : 'published';
      var pubLabel = e.published === false ? 'Draft' : 'Published';
      return (
        '<div class="entry-row" data-id="' + escapeHTML(e.id) + '">' +
          '<span class="num">No. ' + pad(e.n || 0) + '</span>' +
          '<span class="title">' + escapeHTML(e.title) + '</span>' +
          '<span class="slug">' + escapeHTML(e.id) + '</span>' +
          '<span class="meta">' + (e.readMin || 0) + ' min · ' + escapeHTML(e.dateLabel || '') + '</span>' +
          '<span class="status-pill ' + pubClass + '">' + pubLabel + '</span>' +
        '</div>'
      );
    }).join('');
    $$('.entry-row', box).forEach(function (row) {
      row.addEventListener('click', function () { openEditor(row.dataset.id); });
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
      // New entry: fresh defaults
      state.editing = { isNew: true };
      var nextN = state.entries.reduce(function (m, e) { return Math.max(m, e.n || 0); }, 0) + 1;
      f.querySelector('[name="n"]').value = nextN;
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
      f.querySelector('[name="n"]').value = entry.n || 1;
      f.querySelector('[name="date"]').value = entry.date || '';
      f.querySelector('[name="readMin"]').value = entry.readMin || 3;
      f.querySelector('[name="teaser"]').value = entry.teaser || '';
      f.querySelector('[name="intro"]').value = entry.intro || '';
      f.querySelector('[name="centerText"]').value = (entry.center && entry.center.text) || '';
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
        // Only one focused branch at a time
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
      n: parseInt(f.querySelector('[name="n"]').value, 10) || 1,
      date: f.querySelector('[name="date"]').value,
      readMin: parseInt(f.querySelector('[name="readMin"]').value, 10) || 3,
      teaser: f.querySelector('[name="teaser"]').value.trim(),
      intro: f.querySelector('[name="intro"]').value.trim(),
      centerText: f.querySelector('[name="centerText"]').value.trim(),
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
      // Move back to entries list after a beat
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
  function loadSettings() {
    setStatus($('#settings-status'), 'Loading…');
    api('settings').then(function (s) {
      state.settings = s;
      var f = $('#settings-form');
      Object.keys(s || {}).forEach(function (k) {
        var input = f.querySelector('[name="' + k + '"]');
        if (input) input.value = s[k];
      });
      // sync color hex display
      var color = f.querySelector('[name="accent"]');
      var hex = f.querySelector('[name="accentHex"]');
      if (color) color.value = s.accent || '#f6c54a';
      if (hex) hex.value = s.accent || '#f6c54a';
      setStatus($('#settings-status'), '');
    }).catch(function (err) {
      setStatus($('#settings-status'), 'Load failed: ' + err.message, 'err');
    });
  }

  function saveSettings() {
    var f = $('#settings-form');
    var data = {
      brand: f.querySelector('[name="brand"]').value.trim(),
      heroTagline: f.querySelector('[name="heroTagline"]').value,
      heroEmFromLine: parseInt(f.querySelector('[name="heroEmFromLine"]').value, 10) || 3,
      footerTagline: f.querySelector('[name="footerTagline"]').value.trim(),
      subscribeTagline: f.querySelector('[name="subscribeTagline"]').value.trim(),
      bottomTag: f.querySelector('[name="bottomTag"]').value.trim(),
      accent: f.querySelector('[name="accentHex"]').value.trim() || f.querySelector('[name="accent"]').value,
      year: parseInt(f.querySelector('[name="year"]').value, 10),
      email: f.querySelector('[name="email"]').value.trim(),
      twitter: f.querySelector('[name="twitter"]').value.trim(),
      rssPath: f.querySelector('[name="rssPath"]').value.trim() || '/feed.xml'
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
