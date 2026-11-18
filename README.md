# Medium Cluster Jewel Price Floors

A read-only web page showing saved price floors for Path of Exile medium cluster jewels (4-5 passives), for every
enchantment + notable pair, with:

- **Best enchants to roll** - top 3 by expected profit per 100 chaos and by fewest orbs to hit a valuable pair
- **E(chaos)** - expected chaos orbs to roll each pair, by item level
- **Regex export** - stash-search regexes for the pairs above a price

Prices are collected by a separate tool that runs on the owner's PC and uploads a snapshot to `data/prices.json`.
This page never contacts the Path of Exile trade site itself.

## Files

| File | What it is |
| --- | --- |
| `index.html` | the page |
| `js/ranking.js` | chaos-orb odds and the enchant ranking |
| `js/regexgen.js` | builds the stash-search regexes (250-character limit, AND of ORs) |
| `data/prices.json` | the price snapshot (uploaded by the owner's tool) |
| `data/weights.json` | notable weights from poedb.tw |
| `data/notables.json` | notables for each enchantment |
| `data/fragments.json` | the short unique text typed for each notable/enchantment in the regexes |

No build step: it is plain HTML and JavaScript. Browsers block loading the data from a file opened straight from
disk, so open it through the GitHub Pages address (or any local web server).
