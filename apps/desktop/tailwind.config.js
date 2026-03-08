/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Fusion 360 exact palette (2024/2025 dark theme) ──

        // Application bar (topmost strip — very dark charcoal)
        'fusion-header': '#2d2d2d',
        'fusion-header-hover': '#3a3a3a',

        // Toolbar ribbon area
        'fusion-toolbar': '#383838',
        'fusion-toolbar-hover': '#454545',
        'fusion-toolbar-active': '#505050',
        'fusion-toolbar-divider': '#2a2a2a',

        // Side panels (Browser, Inspector)
        'fusion-panel': '#2d2d2d',
        'fusion-panel-header': '#353535',
        'fusion-panel-hover': '#363636',

        // Surface / dialogs / dropdowns
        'fusion-surface': '#353535',
        'fusion-surface-hover': '#404040',
        'fusion-surface-active': '#4a4a4a',

        // Canvas / viewport background (Fusion 360's characteristic dark gray)
        'fusion-canvas': '#464646',

        // Borders
        'fusion-border': '#1e1e1e',
        'fusion-border-light': '#444444',
        'fusion-border-lighter': '#555555',

        // Accent — Fusion 360 signature orange
        'fusion-orange': '#ff6b00',
        'fusion-orange-hover': '#ff8533',
        'fusion-orange-dim': '#cc5500',
        'fusion-orange-light': '#ff8a3d',

        // Blue accent (selection, active tools, links)
        'fusion-blue': '#2196f3',
        'fusion-blue-hover': '#42a5f5',
        'fusion-blue-dim': '#1976d2',
        'fusion-blue-light': '#64b5f6',

        // Green (Finish Sketch, OK, success)
        'fusion-green': '#4caf50',
        'fusion-green-hover': '#66bb6a',

        // Text hierarchy
        'fusion-text': '#d4d4d4',
        'fusion-text-secondary': '#9e9e9e',
        'fusion-text-disabled': '#636363',
        'fusion-text-bright': '#ffffff',

        // Status / semantic
        'fusion-success': '#4caf50',
        'fusion-warning': '#ff9800',
        'fusion-error': '#f44336',

        // Timeline
        'fusion-timeline': '#2d2d2d',
        'fusion-timeline-marker': '#ff6b00',
        'fusion-timeline-track': '#3a3a3a',

        // Workspace tabs
        'fusion-tab-active': '#ff6b00',
        'fusion-tab-inactive': '#383838',

        // Hover overlay
        'fusion-hover': 'rgba(255,255,255,0.06)',
        'fusion-hover-strong': 'rgba(255,255,255,0.10)',
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', '"Cascadia Code"', 'monospace'],
      },
      fontSize: {
        'fusion-xs': ['11px', { lineHeight: '16px' }],
        'fusion-sm': ['12px', { lineHeight: '18px' }],
        'fusion-base': ['13px', { lineHeight: '20px' }],
      },
      boxShadow: {
        'fusion-dropdown': '0 4px 16px rgba(0,0,0,0.4)',
        'fusion-panel': '0 2px 8px rgba(0,0,0,0.3)',
        'fusion-dialog': '0 8px 32px rgba(0,0,0,0.5)',
      },
      borderRadius: {
        'fusion': '3px',
        'fusion-lg': '5px',
      },
      animation: {
        'fusion-fade-in': 'fusionFadeIn 0.15s ease-out',
      },
      keyframes: {
        fusionFadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-2px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
