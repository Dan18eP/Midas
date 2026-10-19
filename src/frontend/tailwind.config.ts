import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        neutral: {
          base: '#FBF9F5',
          card: '#FFFFFF',
          elevated: '#FAF8F5',
          subtle: '#F4F1EA',
          border: '#E8E0D0',
          borderMuted: '#EFECE6',
        },
        midas: {
          gold: '#B8860B',
          goldLight: '#D4AF37',
          goldSubtle: '#FDFBF3',
          bronze: '#8C4022',
          bronzeSubtle: '#FCF5F2',
          slate: '#4B4639',
          slateDark: '#1C1E21',
          silver: '#64748B',
        },
      },
    },
  },
  plugins: [],
};

export default config;
