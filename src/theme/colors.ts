/** Finance Design System 2.1: tokens sem dependencia de bibliotecas visuais. */
export const palette = {
  light: {
    background: '#F3F7F5',
    surface: '#FFFFFF',
    surfaceAlt: '#EAF2EE',
    hero: '#103A2E',
    heroAccent: '#205D47',
    glow: '#397D5E',
    text: '#162720',
    muted: '#63756C',
    primary: '#13845B',
    onPrimary: '#FFFFFF',
    border: '#E0EAE4',
    expense: '#D9535E',
    income: '#13845B',
    warning: '#A76C21',
    track: '#D9E8DF',
  },
  dark: {
    background: '#0B1110',
    surface: '#151E1B',
    surfaceAlt: '#1C2924',
    hero: '#173A2C',
    heroAccent: '#21573E',
    glow: '#276D50',
    text: '#F3F8F5',
    muted: '#9CAEA5',
    primary: '#41CE91',
    onPrimary: '#092119',
    border: '#2A3932',
    expense: '#FF777D',
    income: '#41CE91',
    warning: '#F4C06D',
    track: '#2B4035',
  },
} as const;

export type AppColors = { [K in keyof typeof palette.light]: string };
