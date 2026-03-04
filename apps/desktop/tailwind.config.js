/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'editor-bg': '#1e1e2e',
        'editor-surface': '#282840',
        'editor-border': '#3a3a5a',
        'editor-text': '#e0e0f0',
        'editor-muted': '#8888aa',
        'editor-accent': '#40b4ff',
        'editor-accent-hover': '#60c8ff',
        'editor-success': '#4ade80',
        'editor-warning': '#fbbf24',
        'editor-error': '#f87171',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
