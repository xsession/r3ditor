/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Fusion 360-style palette ──
        // Application bar / header
        'fusion-header': '#333333',
        'fusion-header-hover': '#444444',
        // Toolbar area (workspace tabs + tool ribbon)
        'fusion-toolbar': '#3c3c3c',
        'fusion-toolbar-hover': '#4a4a4a',
        'fusion-toolbar-active': '#555555',
        // Side panels (Browser, Inspector)
        'fusion-panel': '#2b2b2b',
        'fusion-panel-header': '#383838',
        // Surface / dialogs
        'fusion-surface': '#333333',
        'fusion-surface-hover': '#3e3e3e',
        // Canvas / viewport background
        'fusion-canvas': '#444444',
        // Borders
        'fusion-border': '#1a1a1a',
        'fusion-border-light': '#4a4a4a',
        // Accent — Fusion 360 orange
        'fusion-orange': '#ff6b00',
        'fusion-orange-hover': '#ff8533',
        'fusion-orange-dim': '#cc5500',
        // Blue accent (selection, active tools)
        'fusion-blue': '#2196f3',
        'fusion-blue-hover': '#42a5f5',
        'fusion-blue-dim': '#1976d2',
        // Green (OK button, success)
        'fusion-green': '#4caf50',
        'fusion-green-hover': '#66bb6a',
        // Text
        'fusion-text': '#e0e0e0',
        'fusion-text-secondary': '#999999',
        'fusion-text-disabled': '#666666',
        'fusion-text-bright': '#ffffff',
        // Status
        'fusion-success': '#4caf50',
        'fusion-warning': '#ff9800',
        'fusion-error': '#f44336',
        // Timeline
        'fusion-timeline': '#2b2b2b',
        'fusion-timeline-marker': '#ff6b00',
        // Workspace tabs
        'fusion-tab-active': '#ff6b00',
        'fusion-tab-inactive': '#3c3c3c',
        // Hover overlay
        'fusion-hover': 'rgba(255,255,255,0.06)',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
