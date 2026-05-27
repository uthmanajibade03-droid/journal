(function () {
  var entries = window.JOURNAL_ENTRIES || [];
  var scribbles = window.JOURNAL_SCRIBBLES || {};
  var listEl = document.getElementById('entry-list');
  var moreBtn = document.getElementById('view-more');
  if (!listEl) return;

  var INITIAL = 6; // how many to show before "View More"

  function ovalSVG(id) {
    var d = scribbles[id];
    if (!d) return '';
    return (
      '<svg class="scribble-oval" preserveAspectRatio="none" viewBox="0 0 150 40" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
    );
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function rowHTML(e, isLatest) {
    var meta = (e.readMin || 0) + ' min · ' + (e.date || '');
    var preview = e.teaser || e.title;
    var oval = isLatest ? ovalSVG(e.id) : '';
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
    var sorted = entries.slice(); // already newest-first in data
    var slice = showAll ? sorted : sorted.slice(0, INITIAL);
    var html = '';
    for (var i = 0; i < slice.length; i++) {
      html += rowHTML(slice[i], i === 0);
    }
    listEl.innerHTML = html;
    if (moreBtn) {
      moreBtn.style.display = sorted.length > INITIAL && !showAll ? '' : 'none';
    }
  }

  render(false);
  if (moreBtn) {
    moreBtn.addEventListener('click', function () { render(true); });
  }

  // Reveal footer with a soft fade once the user starts scrolling
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

  // Hide the bouncy scroll cue once the user has scrolled past the hero
  var cue = document.querySelector('.scroll-cue');
  if (cue) {
    cue.style.transition = 'opacity 250ms ease';
    window.addEventListener('scroll', function () {
      cue.style.opacity = window.scrollY > 120 ? '0' : '0.7';
    }, { passive: true });
  }

  // Simple in-page search filter (keyboard "/" or click magnifier)
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
        listEl.innerHTML = '<li style="font-family:var(--mono);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-left:64px">No entries match "' + term + '"</li>';
        if (moreBtn) moreBtn.style.display = 'none';
      } else {
        var html = '';
        for (var i = 0; i < filtered.length; i++) html += rowHTML(filtered[i], filtered[i].id === entries[0].id);
        listEl.innerHTML = html;
        if (moreBtn) moreBtn.style.display = 'none';
      }
    });
  }
})();
