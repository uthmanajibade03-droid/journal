(function () {
  var listEl = document.getElementById('entry-list');
  var moreBtn = document.getElementById('view-more');
  if (!listEl) return;

  var INITIAL = 6;
  var entries = [];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function ovalSVG(e) {
    return (
      '<svg class="scribble-oval" preserveAspectRatio="none" viewBox="' + e.scribbleViewBox + '" aria-hidden="true">' +
      '<path d="' + e.scribblePath + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
    );
  }

  function rowHTML(e, isLatest) {
    var meta = (e.readMin || 0) + ' min · ' + (e.dateLabel || '');
    var preview = e.teaser || e.title;
    var oval = isLatest ? ovalSVG(e) : '';
    var latestTag = isLatest ? '<span class="latest-tag">▸ Latest</span>' : '';
    return (
      '<li><a class="entry-row' + (isLatest ? ' is-latest' : '') + '" href="journal.html?id=' + e.id + '">' +
        '<span class="entry-num">— ' + pad(e.n) + '</span>' +
        '<span class="entry-name">' + oval + e.title + '</span>' +
        '<span class="entry-meta">' +
          '<span class="meta-default">' + meta + latestTag + '</span>' +
          '<span class="meta-preview">' + preview + '</span>' +
        '</span>' +
      '</a></li>'
    );
  }

  function render(showAll) {
    var slice = showAll ? entries : entries.slice(0, INITIAL);
    var html = '';
    for (var i = 0; i < slice.length; i++) html += rowHTML(slice[i], i === 0);
    listEl.innerHTML = html;
    if (moreBtn) moreBtn.style.display = entries.length > INITIAL && !showAll ? '' : 'none';
  }

  function showError(msg) {
    listEl.innerHTML = '<li style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-left:64px">' + msg + '</li>';
    if (moreBtn) moreBtn.style.display = 'none';
  }

  fetch('data/index.json')
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      var all = (data && data.entries) || [];
      entries = all.filter(function (e) { return e.published !== false; });
      render(false);
    })
    .catch(function (err) {
      console.error('Failed to load entries:', err);
      showError('Could not load entries. Try refreshing.');
    });

  if (moreBtn) {
    moreBtn.addEventListener('click', function () { render(true); });
  }

  // Footer fade-in on scroll
  var footer = document.querySelector('.page-footer');
  if (footer) {
    footer.style.opacity = '0';
    footer.style.transform = 'translateY(12px)';
    footer.style.transition = 'opacity 600ms ease, transform 600ms ease';
    var seen = false;
    window.addEventListener('scroll', function () {
      if (seen) return;
      if (window.scrollY > 60) {
        seen = true;
        footer.style.opacity = '1';
        footer.style.transform = 'translateY(0)';
      }
    }, { passive: true });
  }

  // Hide scroll cue after the user starts scrolling
  var cue = document.querySelector('.scroll-cue');
  if (cue) {
    cue.style.transition = 'opacity 250ms ease';
    window.addEventListener('scroll', function () {
      cue.style.opacity = window.scrollY > 120 ? '0' : '0.7';
    }, { passive: true });
  }

  // Search filter
  var searchBtn = document.getElementById('search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', function () {
      var term = window.prompt('Search entries');
      if (term === null) return;
      var q = term.trim().toLowerCase();
      if (!q) { render(false); return; }
      var filtered = entries.filter(function (e) {
        return (e.title + ' ' + (e.teaser || '')).toLowerCase().indexOf(q) !== -1;
      });
      if (!filtered.length) {
        showError('No entries match "' + term + '"');
      } else {
        var html = '';
        for (var i = 0; i < filtered.length; i++) {
          html += rowHTML(filtered[i], filtered[i].id === entries[0].id);
        }
        listEl.innerHTML = html;
        if (moreBtn) moreBtn.style.display = 'none';
      }
    });
  }
})();
