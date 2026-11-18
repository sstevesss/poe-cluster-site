/* Builds Path of Exile stash-search regexes for valuable notable pairs (JavaScript port of regexgen.py).
 *
 * Rules of the in-game search (poewiki Guide:Regex): a space between terms is AND, "|" is OR, matching is
 * case-insensitive and happens against the item's lines. There is no "OR of ANDs", so a list of wanted pairs is
 * turned into an AND of ORs ("CNF"):
 *
 *   - a jewel carries exactly two notables {x, y}
 *   - it is accepted when {x, y} contains at least one notable from every clause
 *   - clauses are built as the complements of independent sets of the "wanted pairs" graph
 *     (a star A+B, A+C, A+D becomes: A  B|C|D ; a triangle A+B, A+C, B+C becomes: A|B  A|C  B|C)
 *
 * The short unique fragment for every notable and enchantment (data/fragments.json) is worked out ahead of time by
 * the Python tool, which checks it against everything the game's search can see on a jewel, including the hidden
 * Alt-view text. This file only combines those fragments into searches.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoeRegex = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LIMIT = 250;

  function cmp(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
  function cmpList(a, b) {
    var n = Math.min(a.length, b.length);
    for (var i = 0; i < n; i++) { var c = cmp(a[i], b[i]); if (c) return c; }
    return a.length - b.length;
  }
  function edgeKey(e) { return e[0] + '\u0000' + e[1]; }
  function setKey(arr) { return arr.join('\u0000'); }
  function isSubset(small, bigSet) { return small.every(function (x) { return bigSet.has(x); }); }

  /** edges: array of [a, b] (a < b). Returns list of clauses, each a sorted list of vertices. */
  function cnfClauses(vertices, edges) {
    var V = Array.from(vertices).sort(cmp);
    var adj = {};
    V.forEach(function (v) { adj[v] = new Set(); });
    edges.forEach(function (e) { adj[e[0]].add(e[1]); adj[e[1]].add(e[0]); });
    var need = new Map();                                  // key -> sorted array
    V.forEach(function (v) { need.set(setKey([v]), [v]); });
    for (var i = 0; i < V.length; i++) {
      for (var j = i + 1; j < V.length; j++) {
        if (!adj[V[i]].has(V[j])) need.set(setKey([V[i], V[j]]), [V[i], V[j]]);
      }
    }
    var clauses = [];
    while (need.size) {
      var seed = null;
      need.forEach(function (s) {
        if (seed === null || s.length > seed.length || (s.length === seed.length && cmpList(s, seed) < 0)) seed = s;
      });
      var ind = new Set(seed);
      for (;;) {
        var cands = V.filter(function (v) {
          if (ind.has(v)) return false;
          var bad = false;
          adj[v].forEach(function (u) { if (ind.has(u)) bad = true; });
          return !bad;
        });
        if (!cands.length) break;
        var gain = function (v) {
          var g = 0;
          need.forEach(function (s) {
            if (s.indexOf(v) < 0) return;
            if (s.every(function (x) { return x === v || ind.has(x); })) g++;
          });
          return g;
        };
        var best = null, bestGain = -1, bestIdx = 0;
        cands.forEach(function (v) {
          var g = gain(v), idx = V.indexOf(v);
          if (best === null || g > bestGain || (g === bestGain && idx < bestIdx)) { best = v; bestGain = g; bestIdx = idx; }
        });
        if (bestGain === 0) break;
        ind.add(best);
      }
      var covered = [];
      need.forEach(function (s, k) { if (isSubset(s, ind)) covered.push(k); });
      covered.forEach(function (k) { need.delete(k); });
      clauses.push(V.filter(function (v) { return !ind.has(v); }));
    }
    var uniq = new Map();
    clauses.forEach(function (c) { uniq.set(setKey(c), c.slice().sort(cmp)); });
    var list = Array.from(uniq.values());
    list = list.filter(function (c) {
      var cs = new Set(c);
      return !list.some(function (o) { return o.length < c.length && isSubset(o, cs); });   // drop clauses that contain a smaller clause
    });
    list.sort(function (x, y) { return (x.length - y.length) || cmpList(x, y); });
    return list;
  }

  /** enchantFrag: text; clauses: lists of notable names; frag: {notable: fragment} */
  function render(enchantFrag, clauses, frag) {
    function clauseText(c) {
      var parts = c.map(function (v) { return frag[v]; });
      if (parts.length >= 3 && parts.every(function (x) { return x.indexOf('s.') === 0; })) {
        return 's.(' + parts.map(function (x) { return x.slice(2); }).join('|') + ')';   // s.(a|b|c) is shorter than s.a|s.b|s.c
      }
      return parts.join('|');
    }
    var terms = [enchantFrag].concat(clauses.map(clauseText));
    return terms.map(function (t) { return '"' + t + '"'; }).join(' ');   // every term quoted, the way the in-game search is normally used
  }

  function dedupe(edges) {
    var seen = new Map();
    edges.forEach(function (e) { seen.set(edgeKey(e), e); });
    return Array.from(seen.values());
  }

  function fits(enchantFrag, edges, frag, limit) {
    edges = dedupe(edges);
    var verts = new Set();
    edges.forEach(function (e) { verts.add(e[0]); verts.add(e[1]); });
    var s = render(enchantFrag, cnfClauses(verts, edges), frag);
    return [s.length <= limit, s];
  }

  function stars(edges) {
    var rest = new Map();
    edges.forEach(function (e) { rest.set(edgeKey(e), e); });
    var out = [];
    while (rest.size) {
      var deg = {};
      rest.forEach(function (e) { e.forEach(function (v) { deg[v] = (deg[v] || 0) + 1; }); });
      var centre = null;
      Object.keys(deg).sort(cmp).forEach(function (v) { if (centre === null || deg[v] > deg[centre]) centre = v; });
      var star = [];
      rest.forEach(function (e) { if (e[0] === centre || e[1] === centre) star.push(e); });
      star.sort(cmpList);
      out.push(star);
      star.forEach(function (e) { rest.delete(edgeKey(e)); });
    }
    return out;
  }

  /**
   * pairs: [[a, b], ...] valuable pairs for one enchantment; fragments: {enchant: {...}, notable: {...}}.
   * Returns [{regex, length, fits, pairs: [[a, b], ...]}], each regex at most `limit` characters.
   */
  function build(enchant, pairs, fragments, limit) {
    limit = limit || LIMIT;
    var efrag = fragments.enchant[enchant];
    var edges = dedupe(pairs.filter(function (p) { return p[0] !== p[1]; })
      .map(function (p) { return p[0] < p[1] ? [p[0], p[1]] : [p[1], p[0]]; }));
    if (!edges.length) return [];
    var nfrag = fragments.notable;
    var groups = [], cur = [];
    function flush() { if (cur.length) { groups.push(cur); cur = []; } }
    stars(edges).forEach(function (star) {
      if (fits(efrag, cur.concat(star), nfrag, limit)[0]) { cur = cur.concat(star); return; }
      flush();
      if (fits(efrag, star, nfrag, limit)[0]) { cur = star.slice(); return; }
      star.forEach(function (e) {                          // a star too big for one regex: add edge by edge
        if (cur.length && !fits(efrag, cur.concat([e]), nfrag, limit)[0]) flush();
        cur.push(e);
      });
    });
    flush();
    return groups.map(function (g) {
      var r = fits(efrag, g, nfrag, limit);
      var ps = dedupe(g).map(function (e) { return e.slice(); }).sort(cmpList);
      return { regex: r[1], length: r[1].length, fits: r[0], pairs: ps };
    });
  }

  /** Evaluate a search string the way the game does (space = AND, | = OR, per line, case-insensitive). */
  function accepts(regex, jewelLines) {
    var re = /"([^"]*)"|(\S+)/g, m;
    while ((m = re.exec(regex)) !== null) {
      var term = m[1] || m[2];
      var rx = new RegExp(term, 'i');
      if (!jewelLines.some(function (line) { return rx.test(line); })) return false;
    }
    return true;
  }

  return { LIMIT: LIMIT, cnfClauses: cnfClauses, render: render, build: build, accepts: accepts };
});
