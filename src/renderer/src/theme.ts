export const theme = {
  bg: {
    app: '#141414',
    panel: '#1c1c1c',
    card: '#222222',
    elevated: '#2a2a2a',
    input: '#1a1a1a',
  },
  accent: {
    primary: '#e8621a',
    warm: '#f0832a',
    glow: 'rgba(232, 98, 26, 0.25)',
  },
  status: {
    attention: '#f0a020',
    thinking: '#4a90d9',
    completed: '#3a9a5c',
    failed: '#c0392b',
    stopped: '#6b7280',
  },
  text: {
    primary: '#e8e4de',
    secondary: '#9a9390',
    disabled: '#4a4745',
    inverse: '#141414',
  },
  border: {
    subtle: '#2e2e2e',
    default: '#3a3a3a',
    strong: '#555555',
    accent: '#e8621a',
  },
  space: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
    10: '40px',
    12: '48px',
  },
  font: {
    sans: '"Barlow", sans-serif',
    condensed: '"Barlow Condensed", sans-serif',
    mono: '"JetBrains Mono", monospace',
    display: '"Rubik Distressed", serif',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  },
  fontSize: {
    xs: '11px',
    sm: '12px',
    md: '13px',
    lg: '15px',
    xl: '18px',
    '2xl': '22px',
  },
  radius: {
    sm: '4px',
    md: '6px',
    lg: '10px',
    full: '9999px',
  },
  shadow: {
    sm: '0 1px 3px rgba(0,0,0,0.5)',
    md: '0 4px 12px rgba(0,0,0,0.6)',
    lg: '0 8px 24px rgba(0,0,0,0.7)',
    glow: '0 0 12px rgba(232, 98, 26, 0.4)',
  },
} as const;

export type Theme = typeof theme;
