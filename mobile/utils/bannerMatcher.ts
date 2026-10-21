// utils/bannerMatcher.ts — Intelligent matching and ranking of inventory items to promotional banners
import type { Item } from '../types';
import type { AppBanner } from '../services/banners';
import { getBannerPalette } from './bannerPalette';

export interface BannerItemMatch {
  isMatch: boolean;
  bannerIndex: number;
  score: number;
  banner: AppBanner | null;
}

const STOP_WORDS = new Set([
  'off', 'deal', 'deals', 'offer', 'offers', 'save', 'special', 'sale',
  'flat', 'the', 'and', 'for', 'with', 'from', 'best', 'fresh', 'free',
  'today', 'only', 'get', 'pack', 'combo', 'upto', 'up', 'to', 'on', 'in',
  'at', 'by', 'an', 'a', 'rs', 'rupees', 'now', 'buy', 'discount', 'super',
  'extra', 'big', 'hot', 'limited', 'stock', 'store', 'anandhi',
]);

const SYNONYM_GROUPS: string[][] = [
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

/**
 * Calculates a match score between a single inventory item and a banner.
 * Score >= 400 is considered a genuine offer match.
 */
export function getSingleBannerItemScore(item: Item, banner: AppBanner): number {
  if (item.isDeleted) return 0;

  // 1. Exact ID link (1000 pts)
  if (banner.linkedItemId && banner.linkedItemId === item.id) {
    return 1000;
  }

  const itemName = (item.name || '').toLowerCase().trim();
  const itemCategory = (item.category || '').toLowerCase().trim();

  // 2. Explicit linkedItemName match (850 - 950 pts)
  if (banner.linkedItemName) {
    const linkedName = banner.linkedItemName.toLowerCase().trim();
    if (itemName === linkedName) return 950;
    if (itemName.includes(linkedName) || linkedName.includes(itemName)) return 880;

    // Check individual word matches if linkedItemName has multiple words
    const linkedWords = linkedName.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    if (linkedWords.length > 0) {
      const allWordsMatch = linkedWords.every(w => itemName.includes(w));
      if (allWordsMatch) return 850;
      const someWordsMatch = linkedWords.some(w => itemName.includes(w));
      if (someWordsMatch) return 750;
    }
  }

  // 3. Synonym Group Matching across banner title/subtitle and item name/category (700 - 800 pts)
  const bannerText = `${banner.title || ''} ${banner.subtitle || ''}`.toLowerCase();

  for (const group of SYNONYM_GROUPS) {
    const bannerHasSynonym = group.some(term => {
      // Word boundary match or exact substring for multi-word
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

  // 4. Token overlap between banner text and item name (550 - 650 pts)
  const bannerTokens = bannerText
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOP_WORDS.has(w) && !/^\d+$/.test(w));

  let tokenMatches = 0;
  for (const token of bannerTokens) {
    if (itemName.includes(token)) {
      tokenMatches++;
    }
  }

  if (tokenMatches >= 2) return 650;
  if (tokenMatches === 1) return 550;

  // 5. Palette fallback category matching (450 pts)
  const palette = getBannerPalette(banner);
  if (palette.name === 'Water Can') {
    if (itemName.includes('water') || itemName.includes('can') || itemCategory.includes('water')) {
      return 450;
    }
  } else if (palette.name === 'Tomatoes') {
    if (itemName.includes('tomato') || itemName.includes('thakkali')) {
      return 450;
    }
  } else if (palette.name === 'Pickles') {
    if (itemName.includes('pickle') || itemName.includes('urugai') || itemName.includes('oorukai') || itemCategory.includes('pickle')) {
      return 450;
    }
  } else if (palette.name === 'Ice Creams') {
    if (itemName.includes('ice') || itemName.includes('cream') || itemName.includes('kulfi') || itemCategory.includes('ice')) {
      return 450;
    }
  }

  return 0;
}

/**
 * Builds a fast lookup map of item ID -> best banner match.
 * Active banners are evaluated in carousel priority order (0, 1, 2...).
 */
export function buildItemBannerMatchMap(
  items: Item[],
  banners: AppBanner[],
): Map<string, { bannerIndex: number; score: number; banner: AppBanner }> {
  const map = new Map<string, { bannerIndex: number; score: number; banner: AppBanner }>();
  if (!banners || banners.length === 0 || !items || items.length === 0) {
    return map;
  }

  const activeBanners = banners.filter(b => b.isActive !== false);

  for (const item of items) {
    if (item.isDeleted) continue;

    let bestBannerIdx = -1;
    let highestScore = 0;
    let bestBanner: AppBanner | null = null;

    for (let i = 0; i < activeBanners.length; i++) {
      const banner = activeBanners[i];
      const score = getSingleBannerItemScore(item, banner);

      if (score >= 400) {
        // We prioritize:
        // 1. Lower banner index (Banner 0 before Banner 1)
        // 2. If same banner or significantly higher score (> 200 pts), take highest score
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
      map.set(item.id, {
        bannerIndex: bestBannerIdx,
        score: highestScore,
        banner: bestBanner,
      });
    }
  }

  return map;
}

/**
 * Finds the single best product in inventory matching a banner (for banner tap).
 */
export function findBestMatchingItemForBanner(
  banner: AppBanner,
  items: Item[],
): Item | null {
  if (!items || items.length === 0) return null;

  // 1. Explicit ID
  if (banner.linkedItemId) {
    const found = items.find(i => !i.isDeleted && i.id === banner.linkedItemId);
    if (found) return found;
  }

  // 2. Explicit name
  if (banner.linkedItemName) {
    const trimmed = banner.linkedItemName.toLowerCase().trim();
    const exact = items.find(i => !i.isDeleted && i.name.toLowerCase().trim() === trimmed);
    if (exact) return exact;
  }

  // 3. Highest scoring item
  let highestScore = 0;
  let bestItem: Item | null = null;

  for (const it of items) {
    if (it.isDeleted) continue;
    const score = getSingleBannerItemScore(it, banner);
    if (score > highestScore) {
      highestScore = score;
      bestItem = it;
    }
  }

  if (highestScore >= 450) {
    return bestItem;
  }

  return null;
}
