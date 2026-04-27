// vite.config.ts
import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';

function leafletPluginGlobals() {
  return {
    name: 'leaflet-plugin-globals',
    transform(code: string, id: string) {
      const normalizedId = id.replace(/\\/g, '/');
      if (
        normalizedId.includes('/node_modules/@geoman-io/leaflet-geoman-free/') &&
        normalizedId.endsWith('/dist/leaflet-geoman.js')
      ) {
        return {
          code: `import L from 'leaflet';\n${code}`,
          map: null,
        };
      }
    },
  };
}

// stable vendor chunk names so browser caching works across deploys
function vendorChunkName(id: string) {
  if (!id.includes('node_modules')) return null;
  const parts = id.split('node_modules/')[1].split('/');
  const pkg = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
  if (
    pkg === 'leaflet' ||
    pkg === '@geoman-io/leaflet-geoman-free' ||
    pkg === 'leaflet-polylinedecorator'
  ) {
    return 'vendor-leaflet';
  }
  return `vendor-${pkg.replace('@', '').replace('/', '-')}`;
}

export default defineConfig((): UserConfig => {
  return {
    plugins: [leafletPluginGlobals(), react()],

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
        '@geoman-io/leaflet-geoman-free',
        'react-leaflet',
      ],
    },
  };
});
