import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// @ts-expect-error process.env
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  // Use relative paths so Tauri's custom protocol can resolve assets
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 5173 } : undefined,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    outDir: 'dist',
    // Emit relative asset paths
    assetsDir: 'assets',
  },
});
