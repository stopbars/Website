/** @type {import('tailwindcss').Config} */
import typography from '@tailwindcss/typography';

export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      typography: (theme) => ({
        invert: {
          css: {
            h1: {
              fontSize: theme('fontSize.3xl')[0],
              lineHeight: theme('lineHeight.tight'),
              fontWeight: '600'
            },
            h2: {
              fontSize: theme('fontSize.2xl')[0],
              lineHeight: theme('lineHeight.snug'),
              fontWeight: '600'
            },
            h3: {
              fontSize: theme('fontSize.xl')[0],
              lineHeight: theme('lineHeight.snug'),
              fontWeight: '600'
            },
            'h1, h2, h3': {
              color: theme('colors.zinc.100')
            },
            p: {
              color: theme('colors.zinc.300')
            },
            strong: {
              color: theme('colors.zinc.50')
            },
            code: {
              backgroundColor: theme('colors.zinc.800'),
              padding: '0.15rem 0.35rem',
              borderRadius: theme('borderRadius.sm'),
              fontWeight: '500'
            },
            pre: {
              backgroundColor: theme('colors.zinc.900')
            },
            'ul > li::marker': {
              color: theme('colors.zinc.500')
            }
          }
        }
      })
    }
  },
  plugins: [
    typography,
  ],
};