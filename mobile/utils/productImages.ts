// utils/productImages.ts — Smart quick-commerce product image matching & presets
// Maps product names and categories to high-resolution studio assets.

interface ImagePreset {
  keywords: string[];
  url: string;
  label: string;
}

export const PRODUCT_PRESETS: ImagePreset[] = [
  // ─── Water ──────────────────────────────────────────────────────────
  {
    keywords: ['20l', 'water can', 'can', 'drinking water', 'bisleri', 'aquafina', 'water'],
    url: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=300&q=80',
    label: '20L Drinking Water Can',
  },

  // ─── Fresh Vegetables ───────────────────────────────────────────────
  {
    keywords: ['tomato', 'tomatoes', 'thakkali'],
    url: 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=300&q=80',
    label: 'Fresh Tomatoes',
  },
  {
    keywords: ['potato', 'potatoes', 'aloo', 'urulaikizhangu'],
    url: 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=300&q=80',
    label: 'Fresh Potatoes',
  },
  {
    keywords: ['onion', 'onions', 'pyaz', 'vengayam', 'shallot'],
    url: 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=300&q=80',
    label: 'Fresh Onions',
  },
  {
    keywords: ['carrot', 'carrots', 'gajar'],
    url: 'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?auto=format&fit=crop&w=300&q=80',
    label: 'Carrots',
  },
  {
    keywords: ['chilli', 'chili', 'mirchi', 'pachai milagai', 'green chilli'],
    url: 'https://images.unsplash.com/photo-1588252303782-cb80119abd6d?auto=format&fit=crop&w=300&q=80',
    label: 'Green Chillies',
  },
  {
    keywords: ['coriander', 'cilantro', 'mint', 'pudina', 'spinach', 'palak', 'keerai', 'curry leaves'],
    url: 'https://images.unsplash.com/photo-1601493700631-2b16ec4b4716?auto=format&fit=crop&w=300&q=80',
    label: 'Fresh Greens & Coriander',
  },
  {
    keywords: ['garlic', 'poondu', 'lahsun'],
    url: 'https://images.unsplash.com/photo-1540148426945-6cf22a6b2383?auto=format&fit=crop&w=300&q=80',
    label: 'Garlic',
  },
  {
    keywords: ['ginger', 'adrak', 'inji'],
    url: 'https://images.unsplash.com/photo-1615485290382-441e4d049cb5?auto=format&fit=crop&w=300&q=80',
    label: 'Ginger',
  },
  {
    keywords: ['lemon', 'lemons', 'lime', 'elumichai'],
    url: 'https://images.unsplash.com/photo-1590502593747-42a996133562?auto=format&fit=crop&w=300&q=80',
    label: 'Fresh Lemons',
  },
  {
    keywords: ['cucumber', 'kheera', 'vellarikka'],
    url: 'https://images.unsplash.com/photo-1604977042946-1eecc30f269e?auto=format&fit=crop&w=300&q=80',
    label: 'Cucumber',
  },
  {
    keywords: ['cabbage', 'muttakose', 'patta gobhi'],
    url: 'https://images.unsplash.com/photo-1559181567-c3190ca9959b?auto=format&fit=crop&w=300&q=80',
    label: 'Cabbage',
  },

  // ─── Fruits ─────────────────────────────────────────────────────────
  {
    keywords: ['apple', 'apples', 'seb'],
    url: 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=300&q=80',
    label: 'Fresh Apples',
  },
  {
    keywords: ['banana', 'bananas', 'kela', 'vazhaipazham'],
    url: 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=300&q=80',
    label: 'Fresh Bananas',
  },
  {
    keywords: ['orange', 'oranges', 'santhra', 'mosambi'],
    url: 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=300&q=80',
    label: 'Oranges',
  },
  {
    keywords: ['mango', 'mangoes', 'mambazham', 'aam'],
    url: 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=300&q=80',
    label: 'Mangoes',
  },

  // ─── Dairy & Eggs ───────────────────────────────────────────────────
  {
    keywords: ['milk', 'aavin', 'amul', 'paal', 'doodh', 'curd', 'dahi', 'yogurt', 'tayir'],
    url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=300&q=80',
    label: 'Dairy Milk & Curd',
  },
  {
    keywords: ['egg', 'eggs', 'muttai', 'anda'],
    url: 'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?auto=format&fit=crop&w=300&q=80',
    label: 'Farm Fresh Eggs',
  },
  {
    keywords: ['paneer', 'cheese', 'butter', 'vennai', 'makhan'],
    url: 'https://images.unsplash.com/photo-1589881133595-a3c085cb731d?auto=format&fit=crop&w=300&q=80',
    label: 'Butter & Paneer',
  },

  // ─── Groceries & Staples ────────────────────────────────────────────
  {
    keywords: ['rice', 'arisi', 'chawal', 'basmati', 'ponni'],
    url: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80',
    label: 'Rice & Grains',
  },
  {
    keywords: ['atta', 'wheat', 'flour', 'maida', 'godhumai', 'gehun'],
    url: 'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=300&q=80',
    label: 'Atta & Flour',
  },
  {
    keywords: ['oil', 'sunflower', 'groundnut', 'gingelly', 'ennai', 'tel', 'ghee', 'nei'],
    url: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?auto=format&fit=crop&w=300&q=80',
    label: 'Cooking Oil & Ghee',
  },
  {
    keywords: ['dal', 'dhal', 'paruppu', 'toor', 'moong', 'chana', 'urad', 'gram'],
    url: 'https://images.unsplash.com/photo-1585994192701-f1a505c8574a?auto=format&fit=crop&w=300&q=80',
    label: 'Pulses & Dal',
  },
  {
    keywords: ['sugar', 'sakkarai', 'cheeni', 'jaggery', 'vellam'],
    url: 'https://images.unsplash.com/photo-1581441363689-1f3c3c414635?auto=format&fit=crop&w=300&q=80',
    label: 'Sugar & Jaggery',
  },
  {
    keywords: ['tea', 'chai', 'tea powder', 'coffee', 'kaapi', 'bru', 'sunrise', 'tata tea'],
    url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=300&q=80',
    label: 'Tea & Coffee',
  },
  {
    keywords: ['biscuit', 'cookie', 'cookies', 'bread', 'rusk', 'parle', 'britannia'],
    url: 'https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&w=300&q=80',
    label: 'Biscuits & Bakery',
  },
];

export const CATEGORY_FALLBACK_IMAGES: Record<string, string> = {
  Water: 'https://images.unsplash.com/photo-1548839140-29a749e1bc4e?auto=format&fit=crop&w=300&q=80',
  Vegetables: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=300&q=80',
  Fruits: 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=300&q=80',
  Groceries: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=300&q=80',
  Dairy: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?auto=format&fit=crop&w=300&q=80',
  Other: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=300&q=80',
};

/**
 * Returns the best image URL for an item:
 * 1. Custom uploaded image (if present)
 * 2. Smart keyword match against item name
 * 3. Category fallback
 */
export function getProductImage(item?: {
  name?: string;
  category?: string;
  imageUrl?: string | null;
}): string {
  if (item?.imageUrl) {
    return item.imageUrl;
  }

  const cleanName = (item?.name || '').toLowerCase().trim();
  if (cleanName) {
    for (const preset of PRODUCT_PRESETS) {
      if (preset.keywords.some(k => cleanName.includes(k))) {
        return preset.url;
      }
    }
  }

  const cat = item?.category || 'Groceries';
  return CATEGORY_FALLBACK_IMAGES[cat] || CATEGORY_FALLBACK_IMAGES.Other;
}

/**
 * Finds a smart suggested preset for a name/category preview in the admin form
 */
export function getSuggestedPreset(
  name: string,
  category: string,
): { url: string; label: string } | null {
  const cleanName = name.toLowerCase().trim();
  if (cleanName) {
    for (const preset of PRODUCT_PRESETS) {
      if (preset.keywords.some(k => cleanName.includes(k))) {
        return { url: preset.url, label: preset.label };
      }
    }
  }

  if (category && CATEGORY_FALLBACK_IMAGES[category]) {
    return {
      url: CATEGORY_FALLBACK_IMAGES[category],
      label: `${category} Stock Photo`,
    };
  }

  return null;
}
