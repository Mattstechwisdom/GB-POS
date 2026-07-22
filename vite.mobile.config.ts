import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const { createProductSourceHandler } = require('./tools/product-source-api.cjs');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    base: './',
    root: './src',
    envDir: '.',
    publicDir: '../public',
    build: {
      outDir: path.resolve(__dirname, 'dist-mobile'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/mobile.html'),
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) return 'vendor';
            if (id.includes('ReportingWindow') || id.includes('EODWindow') || id.includes('ChartsWindow')) return 'reporting';
            if (id.includes('BackupWindow') || id.includes('DevMenuWindow')) return 'admin-tools';
            return undefined;
          },
        },
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY || ''),
      'import.meta.env.VITE_SHOP_LOGIN_USERNAME': JSON.stringify(env.VITE_SHOP_LOGIN_USERNAME || 'Gadgetboyz'),
      'import.meta.env.VITE_SHOP_LOGIN_EMAIL': JSON.stringify(env.VITE_SHOP_LOGIN_EMAIL || ''),
    },
    plugins: [
      react(),
      {
        name: 'gbpos-product-source-api',
        configureServer(server: any) {
          const handler = createProductSourceHandler({
            supabaseUrl: env.VITE_SUPABASE_URL || '',
            publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
          });
          server.middlewares.use((req: any, res: any, next: any) => {
            void handler(req, res).then((handled: boolean) => { if (!handled) next(); }).catch(next);
          });
        },
      },
      {
        name: 'gbpos-mobile-index-html',
        closeBundle() {
          const outDir = path.resolve(__dirname, 'dist-mobile');
          const mobileHtml = path.join(outDir, 'mobile.html');
          const indexHtml = path.join(outDir, 'index.html');
          if (fs.existsSync(mobileHtml)) {
            fs.copyFileSync(mobileHtml, indexHtml);
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
  };
});
