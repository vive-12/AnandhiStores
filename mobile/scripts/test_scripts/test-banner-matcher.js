// scripts/test_scripts/test-banner-matcher.js
const assert = require('assert');

// Simulate getBannerPalette
const BANNER_PALETTES = {
  water: { name: 'Water Can' },
  tomatoes: { name: 'Tomatoes' },
  pickles: { name: 'Pickles' },
  iceCreams: { name: 'Ice Creams' },
  default: { name: 'Default Brand' },
};

function getBannerPalette(banner) {
  if (!banner) return BANNER_PALETTES.default;
  const text = `${banner.title || ''} ${banner.subtitle || ''} ${banner.linkedItemName || ''}`.toLowerCase();
  const hex = (banner.color || '').toLowerCase().trim();
  if (text.includes('ice cream') || text.includes('icecream') || text.includes('kulfi') || hex === '#f9a8d4') {
    return BANNER_PALETTES.iceCreams;
  }
  if (text.includes('water') || text.includes('can') || hex === '#0ea5e9') {
    return BANNER_PALETTES.water;
  }
  if (text.includes('tomato') || text.includes('tomatoes') || text.includes('thakkali') || hex === '#f87171') {
    return BANNER_PALETTES.tomatoes;
  }
  if (text.includes('pickle') || text.includes('pickles') || text.includes('urugai') || hex === '#fbbf24') {
    return BANNER_PALETTES.pickles;
  }
  return BANNER_PALETTES.default;
}

const STOP_WORDS = new Set([
  'off', 'deal', 'deals', 'offer', 'offers', 'save', 'special', 'sale',
  'flat', 'the', 'and', 'for', 'with', 'from', 'best', 'fresh', 'free',
  'today', 'only', 'get', 'pack', 'combo', 'upto', 'up', 'to', 'on', 'in',
  'at', 'by', 'an', 'a', 'rs', 'rupees', 'now', 'buy', 'discount', 'super',
  'extra', 'big', 'hot', 'limited', 'stock', 'store', 'anandhi',
]);

const SYNONYM_GROUPS = [
  ['water', 'can', 'dispenser', 'aqua', '20l', 'mineral water'],
  ['tomato', 'tomatoes', 'thakkali', 'tamatar'],
  ['pickle', 'pickles', 'oorukai', 'urugai', 'achar', 'aachar'],
  ['ice cream', 'icecream', 'ice-cream', 'icecreams', 'kulfi', 'cone', 'cassata'],
  ['onion', 'onions', 'vengayam', 'shallot', 'shallots', 'pyaz'],
  ['potato', 'potatoes', 'urulai', 'aloo', 'alu'],
  ['rice', 'arisi', 'ponni', 'basmati', 'sona masoori', 'boiled rice', 'raw rice', 'idli rice'],
  ['dal', 'dhal', 'paruppu', 'toor', 'moong', 'urad', 'chana', 'pappu'],
  ['oil', 'ennai', 'sunflower', 'gingelly', 'groundnut', 'sesame', 'mustard oil', 'cooking oil'],
  ['milk', 'paal', 'dairy', 'curd', 'paneer', 'butter', 'ghee', 'cheese', 'yogurt'],
  ['tea', 'chai', 'coffee', 'kaapi', 'bru', 'boost', 'horlicks', 'beverage'],
  ['biscuit', 'biscuits', 'cookie', 'cookies', 'rusk', 'snacks', 'namkeen'],
  ['egg', 'eggs', 'muttai', 'anda'],
  ['sugar', 'sakkarai', 'jaggery', 'vellam', 'nattu sakkarai'],
  ['soap', 'detergent', 'shampoo', 'wash', 'cleaner', 'surf', 'rin', 'ariel', 'vim'],
];

function getSingleBannerItemScore(item, banner) {
  if (item.isDeleted) return 0;
  if (banner.linkedItemId && banner.linkedItemId === item.id) return 1000;

  const itemName = (item.name || '').toLowerCase().trim();
  const itemCategory = (item.category || '').toLowerCase().trim();

  if (banner.linkedItemName) {
    const linkedName = banner.linkedItemName.toLowerCase().trim();
    if (itemName === linkedName) return 950;
    if (itemName.includes(linkedName) || linkedName.includes(itemName)) return 880;
  }

  const bannerText = `${banner.title || ''} ${banner.subtitle || ''}`.toLowerCase();

  for (const group of SYNONYM_GROUPS) {
    const bannerHasSynonym = group.some(term => {
      if (term.includes(' ')) return bannerText.includes(term);
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      return regex.test(bannerText);
    });

    if (bannerHasSynonym) {
      const itemHasSynonymName = group.some(term => {
        if (term.includes(' ')) return itemName.includes(term);
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        return regex.test(itemName);
      });
      if (itemHasSynonymName) return 780;

      const itemHasSynonymCat = group.some(term => {
        if (term.includes(' ')) return itemCategory.includes(term);
        const regex = new RegExp(`\\b${term}\\b`, 'i');
        return regex.test(itemCategory);
      });
      if (itemHasSynonymCat) return 680;
    }
  }

  const bannerTokens = bannerText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  let tokenMatches = 0;
  for (const token of bannerTokens) {
    if (itemName.includes(token)) tokenMatches++;
  }
  if (tokenMatches >= 2) return 650;
  if (tokenMatches === 1) return 550;

  const palette = getBannerPalette(banner);
  if (palette.name === 'Water Can' && (itemName.includes('water') || itemName.includes('can') || itemCategory.includes('water'))) {
    return 450;
  }
  if (palette.name === 'Tomatoes' && (itemName.includes('tomato') || itemName.includes('thakkali'))) {
    return 450;
  }
  if (palette.name === 'Pickles' && (itemName.includes('pickle') || itemName.includes('urugai') || itemCategory.includes('pickle'))) {
    return 450;
  }
  if (palette.name === 'Ice Creams' && (itemName.includes('ice') || itemName.includes('cream') || itemCategory.includes('ice'))) {
    return 450;
  }

  return 0;
}

function buildItemBannerMatchMap(items, banners) {
  const map = new Map();
  if (!banners || banners.length === 0 || !items || items.length === 0) return map;
  const activeBanners = banners.filter(b => b.isActive !== false);

  for (const item of items) {
    if (item.isDeleted) continue;
    let bestBannerIdx = -1;
    let highestScore = 0;
    let bestBanner = null;

    for (let i = 0; i < activeBanners.length; i++) {
      const banner = activeBanners[i];
      const score = getSingleBannerItemScore(item, banner);
      if (score >= 400) {
        if (bestBannerIdx === -1) {
          bestBannerIdx = i;
          highestScore = score;
          bestBanner = banner;
        } else if (i < bestBannerIdx && score >= highestScore - 150) {
          bestBannerIdx = i;
          highestScore = score;
          bestBanner = banner;
        } else if (i === bestBannerIdx && score > highestScore) {
          highestScore = score;
          bestBanner = banner;
        }
      }
    }

    if (bestBannerIdx >= 0 && bestBanner) {
      map.set(item.id, { bannerIndex: bestBannerIdx, score: highestScore, banner: bestBanner });
    }
  }
  return map;
}

// RUN TESTS
console.log('Testing banner matcher...');

const banners = [
  { id: 'b0', title: '10% off on tomatoes', subtitle: 'Fresh Country Tomatoes', isActive: true, sortOrder: 0 },
  { id: 'b1', title: 'Water Can 20L', subtitle: 'Delivered fast', linkedItemId: 'water-1', isActive: true, sortOrder: 1 },
  { id: 'b2', title: '2% offer on pickels', subtitle: 'Spicy Mango & Lime', isActive: true, sortOrder: 2 },
];

const items = [
  { id: 'general-1', name: 'Aashirvaad Atta 5kg', category: 'Atta & Flours', price: 290, inStock: true, sortOrder: 1 },
  { id: 'tomato-1', name: 'Tomato Country (Naatu Thakkali) 1kg', category: 'Vegetables', price: 32, inStock: true, sortOrder: 5 },
  { id: 'water-1', name: 'Water Can 20L (Bisleri / Pure)', category: 'Water', price: 40, inStock: true, sortOrder: 2 },
  { id: 'pickle-1', name: 'Priya Mango Pickle 300g', category: 'Pickles', price: 85, inStock: true, sortOrder: 8 },
  { id: 'general-2', name: 'Tata Salt 1kg', category: 'Masalas & Spices', price: 28, inStock: true, sortOrder: 3 },
];

const map = buildItemBannerMatchMap(items, banners);

assert(map.has('tomato-1'), 'Tomato must match banner 0');
assert.strictEqual(map.get('tomato-1').bannerIndex, 0, 'Tomato banner index must be 0');

assert(map.has('water-1'), 'Water can must match banner 1');
assert.strictEqual(map.get('water-1').bannerIndex, 1, 'Water can banner index must be 1');

assert(map.has('pickle-1'), 'Pickle must match banner 2');
assert.strictEqual(map.get('pickle-1').bannerIndex, 2, 'Pickle banner index must be 2');

assert(!map.has('general-1'), 'Atta must not match banners');
assert(!map.has('general-2'), 'Salt must not match banners');

// Test sort order when sortBy === 'offers'
const sorted = [...items].sort((a, b) => {
  if (a.inStock && !b.inStock) return -1;
  if (!a.inStock && b.inStock) return 1;

  const aMatch = map.get(a.id);
  const bMatch = map.get(b.id);
  const aHas = Boolean(aMatch && aMatch.bannerIndex >= 0);
  const bHas = Boolean(bMatch && bMatch.bannerIndex >= 0);

  if (aHas && !bHas) return -1;
  if (!aHas && bHas) return 1;

  if (aHas && bHas) {
    if (aMatch.bannerIndex !== bMatch.bannerIndex) {
      return aMatch.bannerIndex - bMatch.bannerIndex;
    }
    if (bMatch.score !== aMatch.score) {
      return bMatch.score - aMatch.score;
    }
  }
  return (a.sortOrder || 0) - (b.sortOrder || 0);
});

console.log('Sorted order by Deals & Offers:');
sorted.forEach((it, idx) => console.log(`  ${idx + 1}. ${it.name} (Banner: ${map.get(it.id)?.bannerIndex ?? 'none'})`));

assert.strictEqual(sorted[0].id, 'tomato-1', 'First item must be Tomato (Banner 0)');
assert.strictEqual(sorted[1].id, 'water-1', 'Second item must be Water Can (Banner 1)');
assert.strictEqual(sorted[2].id, 'pickle-1', 'Third item must be Pickle (Banner 2)');
assert.strictEqual(sorted[3].id, 'general-1', 'Fourth item must be general item');
assert.strictEqual(sorted[4].id, 'general-2', 'Fifth item must be general item');

console.log('✅ ALL BANNER MATCHER TESTS PASSED!');
