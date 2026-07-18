// vite.config.ts
import { defineConfig, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const draftGeneratorShim = (name: string) =>
  fileURLToPath(new URL(`./src/features/draft-generator/shims/${name}`, import.meta.url));

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

export default defineConfig((): UserConfig => {
  return {
    plugins: [leafletPluginGlobals(), react()],

    resolve: {
      alias: [
        { find: 'node:buffer', replacement: draftGeneratorShim('buffer.js') },
        { find: 'node:crypto', replacement: draftGeneratorShim('crypto.js') },
        { find: 'node:fs', replacement: draftGeneratorShim('virtual-fs.js') },
        { find: 'node:path', replacement: draftGeneratorShim('path.js') },
      ],
      dedupe: ['react', 'react-dom'],
    },

    build: {
      target: 'es2020',
      cssCodeSplit: true,
      sourcemap: false,
      cssMinify: 'lightningcss',
      modulePreload: { polyfill: false },
      rolldownOptions: {
        output: {
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
