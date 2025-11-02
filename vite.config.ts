// vite.config.ts
import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

// stable vendor chunk names so browser caching works across deploys
function vendorChunkName(id: string) {
  if (!id.includes('node_modules')) return null;
  const parts = id.split('node_modules/')[1].split('/');
  const pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  return `vendor-${pkg.replace('@', '').replace('/', '-')}`;
}

export default defineConfig((): UserConfig => {
  return {
    plugins: [react()],

    resolve: {
      dedupe: ['react', 'react-dom'],
    },

    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      cssMinify: 'lightningcss',
      modulePreload: { polyfill: false },
      rollupOptions: {
        output: {
          manualChunks(id) {
            const v = vendorChunkName(id);
            if (v) return v;
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]',
        },
        treeshake: {
          preset: 'recommended',
          moduleSideEffects: 'no-external',
        },
      },
      minify: 'esbuild',
    },

    server: {
      open: false,
      strictPort: false,
    },

    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-router-dom',
        'lucide-react',
        'framer-motion',
        'dompurify',
        'marked',
        'geolib',
        'leaflet',
        'leaflet-geoman-free',
        'react-leaflet',
      ],
    },
  };
});
