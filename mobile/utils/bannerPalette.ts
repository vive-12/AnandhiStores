// utils/bannerPalette.ts — Harmonious gradient palettes for promotional banners
// Spec: Tied to brand green aesthetics, replacing harsh flat saturated colors.

export interface BannerPalette {
  colors: readonly [string, string];
  emoji: string;
  name: string;
}

export const BANNER_PALETTES = {
  water: {
    colors: ['#0EA5E9', '#0369A1'] as const, // aqua to deep blue
    emoji: '💧',
    name: 'Water Can',
  },
  tomatoes: {
    colors: ['#F87171', '#B91C1C'] as const, // soft red to brick
    emoji: '🍅',
    name: 'Tomatoes',
  },
  pickles: {
    colors: ['#FBBF24', '#D97706'] as const, // honey to amber
    emoji: '🥒',
    name: 'Pickles',
  },
  iceCreams: {
    colors: ['#F9A8D4', '#DB2777'] as const, // pink to berry
    emoji: '🍦',
    name: 'Ice Creams',
  },
  default: {
    colors: ['#34D399', '#065F46'] as const, // mint to forest
    emoji: '🌿',
    name: 'Default Brand',
  },
} as const;

/**
 * Maps a banner by text keywords or color hints to the best palette.
 */
export function getBannerPalette(banner?: {
  title?: string;
  subtitle?: string;
  linkedItemName?: string | null;
  color?: string;
}): BannerPalette {
  if (!banner) return BANNER_PALETTES.default;

  const text = `${banner.title || ''} ${banner.subtitle || ''} ${banner.linkedItemName || ''}`.toLowerCase();
  const hex = (banner.color || '').toLowerCase().trim();

  // 1. Ice creams: pink to berry (prioritized by text so any ice cream banner gets this)
  if (
    text.includes('ice cream') ||
    text.includes('icecream') ||
    text.includes('ice-cream') ||
    text.includes('kulfi') ||
    text.includes('ice') ||
    hex === '#f9a8d4' ||
    hex === '#db2777'
  ) {
    return BANNER_PALETTES.iceCreams;
  }

  // 2. Water can: aqua to deep blue
  if (
    text.includes('water') ||
    text.includes('can') ||
    text.includes('aqua') ||
    text.includes('dispenser') ||
    hex === '#8b5cf6' || // old purple from seeds
    hex === '#7c3aed' ||
    hex === '#0ea5e9' ||
    hex === '#0284c7' ||
    hex === '#0369a1'
  ) {
    return BANNER_PALETTES.water;
  }

  // 3. Tomatoes: soft red to brick
  if (
    text.includes('tomato') ||
    text.includes('tomatoes') ||
    text.includes('thakkali') ||
    hex === '#ef4444' || // old red from seeds
    hex === '#dc2626' ||
    hex === '#b91c1c' ||
    hex === '#e1604a' ||
    hex === '#f87171'
  ) {
    return BANNER_PALETTES.tomatoes;
  }

  // 4. Pickles: honey to amber
  if (
    text.includes('pickle') ||
    text.includes('pickles') ||
    text.includes('oorukai') ||
    text.includes('urugai') ||
    text.includes('achar') ||
    hex === '#f59e0b' || // old orange from seeds
    hex === '#d97706' ||
    hex === '#e8a33d' ||
    hex === '#fbbf24'
  ) {
    return BANNER_PALETTES.pickles;
  }

  // 5. Default/brand: mint to forest
  return BANNER_PALETTES.default;
}
