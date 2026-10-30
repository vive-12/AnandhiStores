const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('./paths.cjs').requireMobile('typescript');
const mobile = require('./paths.cjs').mobile;
const previous = require.extensions['.ts'];
require.extensions['.ts'] = (module, filename) => {
  if (!filename.startsWith(path.join(mobile, 'utils') + path.sep)) throw new Error('Unexpected test import: ' + filename);
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  module._compile(result.outputText, filename);
};
try {
  const { buildItemBannerMatchMap, getSingleBannerItemScore, findBestMatchingItemForBanner } = require(path.join(mobile, 'utils/bannerMatcher.ts'));
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
  let assertions = 0;
  function check(value, expected, message) { assert.deepEqual(value, expected, message); assertions++; }
  const matches = buildItemBannerMatchMap(items, banners);
  check(matches.has('tomato-1'), true, 'Tomato matches its promotion');
  check(matches.get('tomato-1')?.bannerIndex, 0, 'Tomato promotion priority');
  check(matches.has('water-1'), true, 'Water matches its explicit link');
  check(matches.get('water-1')?.bannerIndex, 1, 'Water promotion priority');
  check(matches.has('pickle-1'), true, 'Pickle matches the promotion');
  check(matches.get('pickle-1')?.bannerIndex, 2, 'Pickle promotion priority');
  check(matches.has('general-1'), false, 'Unrelated atta stays outside promotions');
  check(matches.has('general-2'), false, 'Unrelated salt stays outside promotions');
  const matchedItems = items.filter(item => matches.has(item.id)).sort((a, b) => matches.get(a.id).bannerIndex - matches.get(b.id).bannerIndex);
  const generalItems = items.filter(item => !matches.has(item.id)).sort((a, b) => a.sortOrder - b.sortOrder);
  const ranked = [...matchedItems, ...generalItems];
  for (const [index, expected] of ['tomato-1', 'water-1', 'pickle-1', 'general-1', 'general-2'].entries()) check(ranked[index].id, expected, 'Promotion match metadata ranks original fixture ' + index);
  check(buildItemBannerMatchMap(items, banners.map(b => ({ ...b, isActive: false }))).size, 0, 'Inactive offers do not match');
  check(buildItemBannerMatchMap([{ ...items[2], isDeleted: true }], banners).size, 0, 'Deleted products do not match');
  check(getSingleBannerItemScore({ ...items[2], isDeleted: true }, banners[1]), 0, 'An explicit link cannot revive a deleted product');
  check(findBestMatchingItemForBanner(banners[1], items)?.id, 'water-1', 'Banner tap resolves the explicitly linked live item');
  check(findBestMatchingItemForBanner({ title: 'Unrelated promotion', subtitle: '' }, items), null, 'Unmatched promotion has no guessed target');
  console.log('PASS: ' + assertions + ' banner assertions against actual app utilities. Network calls: 0. Production writes: 0.');
} finally {
  if (previous) require.extensions['.ts'] = previous; else delete require.extensions['.ts'];
}
