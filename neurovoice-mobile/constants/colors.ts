export const colors = {
  primary: '#FF8C42',       // orange - main brand color
  teal: '#5DBEA3',          // teal - secondary accent
  background: '#EFEBE6',    // warm off-white background
  dark: '#1A1A1A',          // near-black text
  muted: '#6B6B6B',         // muted gray text
  purple: '#7B68EE',        // purple accent
  white: '#FFFFFF',
  black: '#000000',

  // Risk level colors
  riskLow: '#5DBEA3',       // teal for low risk
  riskMedium: '#FF8C42',    // orange for medium risk
  riskHigh: '#E74C3C',      // red for high risk

  // UI backgrounds
  cardBackground: '#FFFFFF',
  inputBackground: '#F5F5F5',
  borderColor: '#E0E0E0',

  // Tab bar
  tabActive: '#FF8C42',
  tabInactive: '#999999',
  tabBackground: '#FFFFFF',

  // Overlay
  overlay: 'rgba(0,0,0,0.5)',

  // Gradient stops
  gradientStart: '#FF8C42',
  gradientEnd: '#FF6B35',
} as const;

export type ColorKey = keyof typeof colors;
