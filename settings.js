/* Loads /data/settings.json and applies it across the public site.
   Backwards-compatible with the early flat schema (accent / email /
   twitter / rssPath as siblings) and the newer one with a `colors`
   object and a `socials` array. */
(function () {
  var DEFAULTS = {
    brand: 'uthman',
    heroTagline: 'Notes I keep,\ndrawn the way I think —\na topic in the middle, arrows out.',
    heroEmFromLine: 3,
    footerTagline: 'Notes I keep, drawn the way I think — a topic in the middle, arrows out.',
    subscribeTagline: 'A note when a new entry drops.',
    bottomTag: 'A topic in the middle, arrows out.',
    contactEmail: 'hi@uthman.xyz',
    year: new Date().getFullYear(),
    navbarStyle: 'fade',
    navbarVisibility: 100,
    colors: {
      navbar: '#0b0b0c',
      accent: '#f6c54a'
    },
    socials: [
      { label: 'X / Twitter', url: 'https://x.com/' },
      { label: 'RSS', url: '/feed.xml' },
      { label: 'Email', url: 'mailto:hi@uthman.xyz' }
    ]
  };

  function escapeHTML(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function renderTagline(text, emFromLine) {
    var lines = String(text || '').split('\n');
    var html = '';
    for (var i = 0; i < lines.length; i++) {
      var isEm = (i + 1) >= (emFromLine || lines.length);
      var content = escapeHTML(lines[i]);
      html += isEm ? '<em>' + content + '</em>' : content;
      if (i < lines.length - 1) html += '<br/>';
    }
    return html;
  }

  function migrate(s) {
    var out = Object.assign({}, DEFAULTS, s || {});
    // Colors: lift legacy top-level `accent` into colors.accent
    out.colors = Object.assign({}, DEFAULTS.colors, s && s.colors || {});
    if (s && s.accent && !out.colors.accent) out.colors.accent = s.accent;
    // Socials: build from legacy flat fields if no array given
    if (!Array.isArray(out.socials) || !out.socials.length) {
      var legacy = [];
      if (s && s.twitter) legacy.push({ label: 'X / Twitter', url: s.twitter });
      if (s && s.rssPath) legacy.push({ label: 'RSS', url: s.rssPath });
      if (s && s.email) legacy.push({ label: 'Email', url: 'mailto:' + s.email });
      out.socials = legacy.length ? legacy : DEFAULTS.socials;
    }
    // Contact email: legacy `email` becomes contactEmail
    if (!out.contactEmail && s && s.email) out.contactEmail = s.email;
    return out;
  }

  function isEmailLike(url) {
    return /^mailto:/i.test(url || '');
  }

  function apply(s) {
    var root = document.documentElement;

    // Navbar style + visibility — set on documentElement so the head-
    // script and this code reach the same place, and CSS inheritance
    // does the rest. (Previously written to .top-header which doesn't
    // exist when the head-script runs.)
    var navStyle = s.navbarStyle || 'fade';
    if (['fade','glass','solid','none'].indexOf(navStyle) === -1) navStyle = 'fade';
    root.setAttribute('data-navbar-style', navStyle);
    if (document.body) document.body.setAttribute('data-navbar-style', navStyle);
    var vis = (s.navbarVisibility == null) ? 100 : Number(s.navbarVisibility);
    if (!isFinite(vis)) vis = 100;
    vis = Math.max(0, Math.min(100, vis));
    root.style.setProperty('--nav-vis', (vis / 100).toFixed(3));

    if (s.colors) {
      var map = {
        bg: '--bg',
        panel: '--panel',
        navbar: '--navbar',
        fg: '--fg',
        muted: '--muted',
        accent: '--accent'
      };
      Object.keys(map).forEach(function (k) {
        if (s.colors[k]) root.style.setProperty(map[k], s.colors[k]);
      });
      // Update <meta name="theme-color"> so Safari and Chrome tint their
      // top/bottom chrome with the navbar colour. Done here too (in
      // addition to the inline head-script) so dashboard edits update
      // the browser chrome without a page reload.
      if (s.colors.navbar) {
        var tc = document.querySelector('meta[name="theme-color"]');
        if (tc) tc.setAttribute('content', s.colors.navbar);
      }
    }

    var brands = document.querySelectorAll('.brand-script');
    for (var i = 0; i < brands.length; i++) brands[i].textContent = s.brand;

    if (document.title) {
      document.title = document.title.replace(/uthman/gi, s.brand);
    }

    var hero = document.querySelector('.hero-tagline');
    if (hero) hero.innerHTML = renderTagline(s.heroTagline, s.heroEmFromLine);

    var footerTaglines = document.querySelectorAll('.footer-brand .footer-tagline');
    for (var j = 0; j < footerTaglines.length; j++) {
      footerTaglines[j].textContent = s.footerTagline;
    }

    var subTagline = document.querySelector('.footer-subscribe .footer-tagline');
    if (subTagline) subTagline.textContent = s.subscribeTagline;

    var bottomTag = document.querySelector('.footer-bottom-tag');
    if (bottomTag) bottomTag.textContent = s.bottomTag;

    var copyright = document.querySelector('.footer-bottom > p:first-child');
    if (copyright) {
      copyright.textContent = '© ' + (s.year || new Date().getFullYear()) + ' ' + s.brand + '. All rights reserved.';
    }

    // Render the dynamic socials list (footer "Follow" column).
    var socialsList = document.querySelector('[data-socials]');
    if (socialsList && Array.isArray(s.socials)) {
      socialsList.innerHTML = s.socials.map(function (link) {
        var url = link.url || '#';
        var ext = !isEmailLike(url) && /^https?:/i.test(url);
        return '<li><a href="' + escapeHTML(url) + '"' +
          (ext ? ' target="_blank" rel="noopener"' : '') +
          '>' + escapeHTML(link.label || url) + '</a></li>';
      }).join('');
    }

    // "Contact" link in the Navigate column points at the configured email
    // (or the first email-like entry in socials as a fallback).
    var contact = s.contactEmail;
    if (!contact) {
      var firstEmail = (s.socials || []).find(function (l) { return isEmailLike(l.url); });
      if (firstEmail) contact = firstEmail.url.replace(/^mailto:/i, '');
    }
    if (contact) {
      var contactLinks = document.querySelectorAll('a[data-contact-email]');
      for (var k = 0; k < contactLinks.length; k++) {
        contactLinks[k].href = 'mailto:' + contact;
      }
    }
  }

  window.SiteSettings = {
    data: null,
    load: function () {
      if (this._promise) return this._promise;
      var self = this;
      // Prefer the runtime endpoint (Vercel KV); fall back to the static
      // file in the repo if the function is unreachable.
      this._promise = fetch('/api/data/settings', { cache: 'no-store' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (s) {
          if (s && Object.keys(s).length) return s;
          return fetch('/data/settings.json', { cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.json() : null; })
            .catch(function () { return null; });
        })
        .then(function (raw) {
          self.data = migrate(raw);
          apply(self.data);
          try { localStorage.setItem('site.settings.cache', JSON.stringify(self.data)); } catch (e) {}
          if (window.__ready) window.__ready.markSettings();
          return self.data;
        });
      return this._promise;
    }
  };

  window.SiteSettings.load();
})();
