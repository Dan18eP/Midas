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
        midas: {
          dark: '#0B0F17',
          surface: '#111827',
          border: '#1F2937',
          accent: '#3B82F6',
          gold: '#F59E0B',
        },
      },
    },
  },
  plugins: [],
};

export default config;
