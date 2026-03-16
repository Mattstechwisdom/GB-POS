import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Electron production loads the app via file://, so built asset paths must be relative.
  // Without this, Vite defaults to absolute /assets/* URLs which resolve to file:///assets/* and render a blank window.
  base: './',
  root: './src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) return 'vendor';
          if (id.includes('QuoteGeneratorWindow')) return 'quote-generator';
          if (
            id.includes('ReportingWindow') ||
            id.includes('EODWindow') ||
            id.includes('ChartsWindow') ||
            id.includes('ReportEmailWindow')
          ) {
            return 'reporting';
          }
          if (
            id.includes('BackupWindow') ||
            id.includes('DataToolsWindow') ||
            id.includes('ClearDatabaseWindow') ||
            id.includes('DevMenuWindow')
          ) {
            return 'admin-tools';
          }
          return undefined;
        },
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
