// Entries are listed newest → oldest. The first item is shown as "latest".
// To add: drop a new object at the top, bump `n`, keep `id` URL-safe.
// Teasers are shown on hover; edit them to match your real writing.
window.JOURNAL_ENTRIES = [
  {
    id: 'comparing',
    n: 6,
    title: 'Comparing',
    date: 'May 2026',
    readMin: 4,
    teaser: 'Comparison is just borrowed identity',
  },
  {
    id: 'friction',
    n: 5,
    title: 'Friction',
    date: 'Apr 2026',
    readMin: 6,
    teaser: 'Small frictions are taxes on the future',
  },
  {
    id: 'distraction',
    n: 4,
    title: 'Distraction',
    date: 'Mar 2026',
    readMin: 5,
    teaser: 'Attention is the only thing that compounds',
  },
  {
    id: 'procrastination',
    n: 3,
    title: 'Procrastination',
    date: 'Feb 2026',
    readMin: 7,
    teaser: "What you avoid is what you're afraid to find out",
  },
  {
    id: 'rbp-solutions',
    n: 2,
    title: 'RBP — Solutions',
    date: 'Jan 2026',
    readMin: 5,
    teaser: 'What changes when you make beginning cheap',
  },
  {
    id: 'rbp-causes',
    n: 1,
    title: 'RBP — Causes',
    date: 'Jan 2026',
    readMin: 6,
    teaser: 'Where the resistance to begin comes from',
  },
];

// Hand-drawn oval SVG paths (one per entry, so each scribble feels unique).
// Keyed by entry id; falls back to a generic one.
window.JOURNAL_SCRIBBLES = {
  'comparing':
    'M 4.7 23.2 C 2.5 20.0, 2.8 15.4, 7.0 12.6 C 11.3 9.7, 21.1 7.3, 30.2 5.9 C 39.3 4.5, 51.2 4.0, 61.5 4.2 C 71.7 4.3, 84.0 4.7, 91.7 6.8 C 99.5 8.8, 106.3 13.1, 108.0 16.4 C 109.8 19.8, 106.8 23.6, 102.3 26.6 C 97.8 29.7, 90.0 32.8, 81.2 34.7 C 72.4 36.5, 59.4 38.2, 49.3 37.7 C 39.3 37.2, 28.0 34.2, 20.6 31.8 C 13.2 29.4, 7.0 26.4, 4.7 23.2 Z',
  'friction':
    'M 86.7 14.4 C 90.2 17.7, 91.9 23.0, 88.8 26.2 C 85.6 29.3, 76.0 31.7, 67.8 33.4 C 59.5 35.1, 48.4 36.6, 39.3 36.2 C 30.2 35.8, 19.0 33.9, 13.0 31.3 C 7.1 28.6, 3.8 23.8, 3.8 20.1 C 3.8 16.4, 7.0 11.7, 12.8 9.0 C 18.7 6.2, 29.6 4.0, 38.8 3.5 C 47.9 3.0, 59.7 4.1, 67.7 5.9 C 75.7 7.8, 83.2 11.0, 86.7 14.4 Z',
  'distraction':
    'M 104.7 8.4 C 113.2 11.4, 117.6 17.4, 116.2 21.7 C 114.8 26.0, 106.9 31.6, 96.5 34.3 C 86.2 37.0, 67.3 38.5, 54.0 37.8 C 40.6 37.2, 25.0 33.6, 16.3 30.4 C 7.6 27.1, 0.7 22.1, 1.9 18.2 C 3.1 14.2, 13.1 9.0, 23.6 6.6 C 34.2 4.2, 51.8 3.3, 65.4 3.5 C 78.9 3.8, 96.2 5.3, 104.7 8.4 Z',
  'procrastination':
    'M 128.6 32.2 C 116.9 35.0, 94.7 36.4, 77.6 36.5 C 60.4 36.5, 38.1 35.1, 25.8 32.5 C 13.4 29.8, 4.1 24.5, 3.6 20.5 C 3.2 16.6, 11.3 11.4, 22.9 8.7 C 34.5 5.9, 56.0 4.3, 73.1 4.0 C 90.1 3.8, 112.8 4.5, 125.3 7.1 C 137.7 9.7, 147.1 15.3, 147.6 19.5 C 148.2 23.6, 140.3 29.3, 128.6 32.2 Z',
  'rbp-solutions':
    'M 47.4 36.9 C 37.1 36.7, 24.7 35.3, 17.3 32.8 C 9.8 30.3, 3.8 25.8, 2.5 22.0 C 1.3 18.2, 4.1 12.7, 9.9 9.9 C 15.7 7.1, 27.5 5.9, 37.3 5.2 C 47.1 4.5, 59.7 4.2, 68.7 5.6 C 77.6 6.9, 86.5 10.2, 91.0 13.2 C 95.5 16.3, 97.7 20.4, 95.6 23.8 C 93.5 27.3, 86.6 31.8, 78.6 34.0 C 70.6 36.2, 57.6 37.1, 47.4 36.9 Z',
  'rbp-causes':
    'M 81.7 21.8 C 81.2 25.5, 76.8 31.2, 70.7 33.4 C 64.6 35.7, 53.3 35.3, 44.9 35.1 C 36.5 34.9, 26.9 34.2, 20.3 32.3 C 13.7 30.5, 7.4 27.1, 5.3 23.9 C 3.2 20.6, 3.9 15.9, 7.5 12.9 C 11.1 9.9, 19.2 7.3, 26.7 5.9 C 34.3 4.4, 45.0 3.1, 52.8 3.9 C 60.6 4.8, 68.9 8.1, 73.7 11.1 C 78.5 14.0, 82.2 18.0, 81.7 21.8 Z',
};

// Optional body content per entry (used by journal.html).
// Replace with your real writing — supports plain HTML.
window.JOURNAL_BODIES = {
  'comparing': '',
  'friction': '',
  'distraction': '',
  'procrastination': '',
  'rbp-solutions': '',
  'rbp-causes': '',
};
