/* Which enchantment is best to roll chaos orbs on? (JavaScript port of ranking.py)
 *
 * Mechanics (confirmed by the site owner, weights from poedb):
 *   - a chaos orb makes a rare jewel with 4 affixes (1/3) or 3 affixes (2/3)
 *   - max 2 prefixes + 2 suffixes; notables are always prefixes
 *       4 affixes -> always 2 prefixes + 2 suffixes (two notables)
 *       3 affixes -> 2p1s or 1p2s with equal chance (two notables only half the time)
 *   - so a chaos orb gives two PREFIXES with probability 1/3 + 2/3 * 1/2 = 2/3
 *   - prefixes are drawn by weight one after the other, without replacing the mod group. The prefix pool is the
 *     available notables PLUS the non-notable prefixes, whose group weight is the sum of the tiers the item level allows:
 *       P(pair {A,B}) = P_TWO * ( wA/W * wB/(W-wA) + wB/W * wA/(W-wB) ),  W = notables + other prefixes
 *   - a notable is available when its level requirement is at or below the jewel's item level
 *   - one chaos orb costs 1 chaos (base jewel cost ignored)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoeRanking = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var P_FOUR_AFFIX = 1 / 3;
  var ORB_COST = 1.0;

  function pTwoNotables(pFour) {
    if (pFour === undefined) pFour = P_FOUR_AFFIX;
    return pFour * 1.0 + (1.0 - pFour) * 0.5;
  }

  /** Total weight of the non-notable prefix groups at this item level (tiers above the item level drop out). */
  function otherPrefixWeight(otherMods, ilvl) {
    var sum = 0;
    (otherMods || []).forEach(function (m) { if (m.level <= ilvl) sum += m.weight; });
    return sum;
  }

  /** weights: {notable: weight} (already filtered to the available notables). Returns {"a\u0000b": chance per orb}, a < b. */
  function pairProbabilities(weights, pFour, otherWeight) {
    if (pFour === undefined) pFour = P_FOUR_AFFIX;
    otherWeight = otherWeight || 0;
    var names = Object.keys(weights).sort();
    var total = 0;
    names.forEach(function (n) { total += weights[n]; });
    // Python sums the dict in insertion order; integer weights make the order irrelevant
    total += otherWeight;
    var p2 = pTwoNotables(pFour);
    var out = {};
    for (var i = 0; i < names.length; i++) {
      for (var j = i + 1; j < names.length; j++) {
        var a = names[i], b = names[j], wa = weights[a], wb = weights[b];
        if (total - wa <= 0 || total - wb <= 0) continue;
        out[a + '\u0000' + b] = p2 * (wa / total * wb / (total - wa) + wb / total * wa / (total - wb));
      }
    }
    return out;
  }

  /** enchantWeights: {notable: {weight, level}} -> {notable: weight} for notables the item level allows */
  function available(enchantWeights, ilvl) {
    var out = {};
    Object.keys(enchantWeights).forEach(function (n) {
      if (enchantWeights[n].level <= ilvl) out[n] = enchantWeights[n].weight;
    });
    return out;
  }

  function pairProb(probs, a, b) {
    return probs[a + '\u0000' + b] || probs[b + '\u0000' + a] || 0;
  }

  /** {enchant: {pairKey: chance per orb}} at this item level */
  function allPairProbs(weightsFile, ilvl) {
    var other = otherPrefixWeight(weightsFile.other_prefixes || [], ilvl);
    var out = {};
    Object.keys(weightsFile.enchants).forEach(function (name) {
      out[name] = pairProbabilities(available(weightsFile.enchants[name], ilvl), P_FOUR_AFFIX, other);
    });
    return out;
  }

  /**
   * rows: result rows (objects with enchant, a, b, status, typical, total).
   * A pair counts as valuable when it is priced (status ok), typical >= minimum and, optionally, has at least
   * minListings listings. Returns {enchants, top_profit, top_cost}.
   */
  function rank(weightsByEnchant, rows, minimum, ilvl, minListings, pFour, otherMods) {
    if (ilvl === undefined) ilvl = 84;
    minListings = minListings || 0;
    if (pFour === undefined) pFour = P_FOUR_AFFIX;
    var byEnchant = {};
    rows.forEach(function (r) { (byEnchant[r.enchant] = byEnchant[r.enchant] || []).push(r); });
    var other = otherPrefixWeight(otherMods || [], ilvl);
    var out = [];
    Object.keys(weightsByEnchant).forEach(function (name) {
      var probs = pairProbabilities(available(weightsByEnchant[name], ilvl), pFour, other);
      var mine = byEnchant[name] || [];
      var priced = 0, total = 0;
      mine.forEach(function (r) {
        if (r.status === 'ok' || r.status === 'none') priced++;
        if (r.status !== 'unavailable') total++;
      });
      var pHit = 0, value = 0, nPairs = 0;
      mine.forEach(function (r) {
        if (r.status !== 'ok' || r.typical === null || r.typical === undefined || r.typical < minimum) return;
        if (minListings && (r.total || 0) < minListings) return;
        var p = pairProb(probs, r.a, r.b);
        if (p <= 0) return;
        nPairs++;
        pHit += p;
        value += p * r.typical;
      });
      out.push({
        enchant: name, pairs: nPairs, priced: priced, total: total, p_hit: pHit,
        orbs_per_hit: pHit > 0 ? 1 / pHit : null,
        avg_value: pHit > 0 ? value / pHit : null,
        profit_per_orb: pHit > 0 ? value - ORB_COST : null,
        profit_per_100: pHit > 0 ? 100 * (value - ORB_COST) : null
      });
    });
    var live = out.filter(function (r) { return r.p_hit > 0; });
    var topProfit = live.slice().sort(function (x, y) { return y.profit_per_100 - x.profit_per_100; }).slice(0, 3);
    var topCost = live.slice().sort(function (x, y) {
      return (x.orbs_per_hit - y.orbs_per_hit) || (y.profit_per_100 - x.profit_per_100);
    }).slice(0, 3);
    out.sort(function (x, y) { return x.enchant < y.enchant ? -1 : x.enchant > y.enchant ? 1 : 0; });
    return { enchants: out, top_profit: topProfit, top_cost: topCost };
  }

  return {
    pTwoNotables: pTwoNotables, otherPrefixWeight: otherPrefixWeight, pairProbabilities: pairProbabilities,
    available: available, pairProb: pairProb, allPairProbs: allPairProbs, rank: rank
  };
});
