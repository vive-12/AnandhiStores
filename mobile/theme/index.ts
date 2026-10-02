// theme/index.ts — Anandhi Stores design tokens
// All screens must import from here. No hard-coded colours, spacing or sizes elsewhere.

export const Colors = {
  // Brand greens
  green900: '#123524',
  green700: '#1F5B3C',
  green500: '#2E8B57',

  // Accent
  amber:  '#E8A33D',
  coral:  '#E1604A',

  // Surfaces
  cream:  '#FBF8F1',
  card:   '#FFFFFF',

  // Text
  ink:     '#16221B',
  inkSoft: '#5C6B62',

  // Borders
  line: '#E7E1D3',
} as const;

export const StatusColors: Record<string, string> = {
  placed:           '#E8A33D',
  packed:           '#5B5BD6',
  out_for_delivery: '#2F80ED',
  delivered:        '#2E8B57',
  cancelled:        '#E1604A',
};

export const Spacing = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
} as const;

export const Radius = {
  card:   18,
  chip:   100,
  button: 14,
  sm:     8,
  md:     12,
} as const;

export const FontSize = {
  xs:   12,
  sm:   14,
  md:   16,
  lg:   20,
  xl:   26,
} as const;

export const FontWeight = {
  body:    '500' as const,
  label:   '600' as const,
  heading: '800' as const,
};

/** Shadow preset for cards */
export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 6,
  },
} as const;
