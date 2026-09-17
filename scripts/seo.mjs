import {
  getPageMetadata,
  PRIVATE_PAGE_PATHS,
  SEO_ALIASES,
  SEO_PAGES,
  SITE_ORIGIN,
  SOCIAL_IMAGE,
  SOCIAL_IMAGE_ALT,
} from '../src/utils/seo.js';

const SEO_BLOCK = /<!-- seo:start -->[\s\S]*?<!-- seo:end -->/;
const escapeHtml = (value) =>
  value.replace(/[&<>"']/g, (character) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });

function renderMetadata(pathname, indexable) {
  const { title, description, canonical, robots } = getPageMetadata(pathname, indexable);
  return `<!-- seo:start -->
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta name="robots" content="${robots}" />
    ${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="BARS" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta property="og:url" content="${canonical}" />` : ''}
    <meta property="og:image" content="${SOCIAL_IMAGE}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="400" />
    <meta property="og:image:alt" content="${SOCIAL_IMAGE_ALT}" />
    <meta property="og:locale" content="en_US" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    ${canonical ? `<meta name="twitter:url" content="${canonical}" />` : ''}
    <meta name="twitter:image" content="${SOCIAL_IMAGE}" />
    <meta name="twitter:image:alt" content="${SOCIAL_IMAGE_ALT}" />
    <!-- seo:end -->`;
}

export function siteSeo() {
  let indexable;
  return {
    name: 'site-seo',
    enforce: 'post',
    configResolved(config) {
      indexable = config.command === 'build' && config.env.VITE_SITE_INDEXABLE !== 'false';
    },
    transformIndexHtml(html, context) {
      return html.replace(SEO_BLOCK, () => renderMetadata(context.originalUrl ?? '/', indexable));
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        const template = bundle['index.html']?.source;
        if (typeof template !== 'string' || !SEO_BLOCK.test(template)) {
          this.error('The index.html SEO block is missing.');
        }

        const paths = [
          ...Object.keys(SEO_PAGES),
          ...Object.keys(SEO_ALIASES),
          ...PRIVATE_PAGE_PATHS,
        ];
        for (const pathname of paths) {
          if (pathname === '/') continue;
          this.emitFile({
            type: 'asset',
            fileName: `${pathname.slice(1)}.html`,
            source: template.replace(SEO_BLOCK, () => renderMetadata(pathname, indexable)),
          });
        }

        const urls = Object.keys(SEO_PAGES)
          .map((pathname) => `  <url><loc>${SITE_ORIGIN}${pathname}</loc></url>`)
          .join('\n');
        this.emitFile({
          type: 'asset',
          fileName: 'sitemap.xml',
          source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
        });
      },
    },
  };
}
