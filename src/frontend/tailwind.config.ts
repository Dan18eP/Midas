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
          background: '#FFFFFF',
          card: '#FFFFFF',
          elevated: '#FAFAFA',
          subtle: '#F7F7F5',
          border: '#E8E4DC',
          borderMuted: '#F0EDE7',
        },
        midas: {
          gold: '#B8860B',
          goldLight: '#D4AF37',
          goldSubtle: '#FBF8EF',
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
