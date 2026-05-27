/* Loads /data/settings.json and applies it across the public site.
   Pages mark dynamic elements with data-bind="key" or the well-known
   classes used in this codebase (brand-script, footer-tagline, …). */
(function () {
  var DEFAULTS = {
    brand: 'uthman',
    heroTagline: 'Notes I keep,\ndrawn the way I think —\na topic in the middle, arrows out.',
    heroEmFromLine: 3,
    footerTagline: 'Notes I keep, drawn the way I think — a topic in the middle, arrows out.',
    subscribeTagline: 'A note when a new entry drops.',
    bottomTag: 'A topic in the middle, arrows out.',
    accent: '#f6c54a',
    year: new Date().getFullYear(),
    email: 'hi@uthman.xyz',
    twitter: 'https://x.com/',
    rssPath: '/feed.xml'
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

  function apply(s) {
    var root = document.documentElement;
    if (s.accent) root.style.setProperty('--accent', s.accent);

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

    var emailLinks = document.querySelectorAll('a[data-social="email"]');
    for (var k = 0; k < emailLinks.length; k++) {
      emailLinks[k].href = 'mailto:' + s.email;
    }

    var twitter = document.querySelector('a[data-social="twitter"]');
    if (twitter) twitter.href = s.twitter;

    var rss = document.querySelector('a[data-social="rss"]');
    if (rss) rss.href = s.rssPath;
  }

  window.SiteSettings = {
    data: null,
    load: function () {
      if (this._promise) return this._promise;
      var self = this;
      this._promise = fetch('/data/settings.json', { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; })
        .then(function (s) {
          self.data = Object.assign({}, DEFAULTS, s || {});
          apply(self.data);
          return self.data;
        });
      return this._promise;
    }
  };

  // Auto-load on every page that includes this script.
  window.SiteSettings.load();
})();
