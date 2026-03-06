import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Mock Tauri APIs for testing
      '@tauri-apps/api/core': path.resolve(__dirname, './src/__mocks__/tauri-api.ts'),
      '@tauri-apps/api': path.resolve(__dirname, './src/__mocks__/tauri-api.ts'),
      '@tauri-apps/plugin-dialog': path.resolve(__dirname, './src/__mocks__/tauri-plugin.ts'),
      '@tauri-apps/plugin-fs': path.resolve(__dirname, './src/__mocks__/tauri-plugin.ts'),
      '@tauri-apps/plugin-shell': path.resolve(__dirname, './src/__mocks__/tauri-plugin.ts'),
      '@tauri-apps/plugin-store': path.resolve(__dirname, './src/__mocks__/tauri-plugin.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
  },
});
