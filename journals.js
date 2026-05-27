(function () {
  var entries = window.JOURNAL_ENTRIES || [];
  var scribbles = window.JOURNAL_SCRIBBLES || {};
  var bodies = window.JOURNAL_BODIES || {};
  var main = document.getElementById('entry-main');
  if (!main) return;

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(window.location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function ovalSVG(id) {
    var d = scribbles[id];
    if (!d) return '';
    return (
      '<svg class="scribble-oval" preserveAspectRatio="none" viewBox="0 0 150 40" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'
    );
  }

  function placeholderBody(e) {
    return (
      '<p><em>Draft.</em> Replace this in <code>entries.js</code> → ' +
      '<code>JOURNAL_BODIES["' + e.id + '"]</code> with your note for ' + e.title + '.</p>' +
      '<p>The page is wired up — title, eyebrow, scribble oval, and the related-entries sidebar all render from <code>entries.js</code>.</p>'
    );
  }

  function render() {
    var id = param('id');
    var entry = null;
    for (var i = 0; i < entries.length; i++) {
      if (entries[i].id === id) { entry = entries[i]; break; }
    }

    if (!entry) {
      main.innerHTML =
        '<p class="entry-eyebrow">404</p>' +
        '<h1 class="entry-title">Not found</h1>' +
        '<p class="entry-body"><a href="/" style="color:var(--accent);text-decoration:underline;text-underline-offset:4px">Back to the index</a></p>';
      document.title = 'Not found — uthman';
      return;
    }

    document.title = entry.title + ' — uthman';
    var body = bodies[entry.id] || placeholderBody(entry);

    var asideItems = '';
    for (var j = 0; j < entries.length; j++) {
      var e = entries[j];
      var cur = e.id === entry.id ? ' class="is-current"' : '';
      asideItems +=
        '<li><a href="journal.html?id=' + e.id + '"' + cur + '>' +
          '<span class="aside-num">— ' + pad(e.n) + '</span>' +
          '<span>' + e.title + '</span>' +
        '</a></li>';
    }

    main.innerHTML =
      '<div class="entry-grid">' +
        '<article>' +
          '<p class="entry-eyebrow">No. ' + pad(entry.n) + ' — ' + entry.title + '</p>' +
          '<h1 class="entry-title"><span class="entry-title-wrap">' + ovalSVG(entry.id) + entry.title + '</span></h1>' +
          '<p class="entry-meta-row">' + (entry.readMin || 0) + ' min read · ' + (entry.date || '') + '</p>' +
          '<div class="entry-body">' + body + '</div>' +
        '</article>' +
        '<aside class="entry-aside">' +
          '<p class="entry-aside-label">More entries</p>' +
          '<ul>' + asideItems + '</ul>' +
        '</aside>' +
      '</div>';
  }

  render();
})();
