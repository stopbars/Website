import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Plugin to defer CSS loading and optimize for LCP
function deferCSS() {
  return {
    name: 'defer-css',
    transformIndexHtml(html) {
      // Replace CSS links with deferred loading
      return html.replace(
        /<link[^>]*rel="stylesheet"[^>]*>/gi,
        (match) => {
          if (match.includes('assets/index')) {
            const href = match.match(/href=["']?([^"'\s>]+)["']?/) 
            if (href) {
              return `
                <link rel="preload" href="${href[1]}" as="style" onload="this.onload=null;this.rel='stylesheet'">
                <noscript><link rel="stylesheet" href="${href[1]}"></noscript>
              `
            }
          }
          return match
        }
      )
    }
  }
}

export default defineConfig({
  plugins: [react(), deferCSS()],
  resolve: {
    dedupe: ['react', 'react-dom']
  },
  build: {
    cssCodeSplit: true, // Enable CSS code splitting
    minify: 'esbuild', // Faster minification
    rollupOptions: {
      output: {
        // Optimize chunk splitting for better caching
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['lucide-react']
        },
        // Ensure consistent asset naming
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'assets/[name]-[hash][extname]'
          }
          return 'assets/[name]-[hash][extname]'
        }
      }
    },
    // Optimize build performance
    target: 'esnext',
    sourcemap: 'hidden', // Generate sourcemaps but do not serve them to users
  },
  // Optimize development server
  server: {
    open: false,
    host: true
  },
  // Pre-bundle dependencies for faster development
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'lucide-react']
  }
})