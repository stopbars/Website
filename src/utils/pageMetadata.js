import { getPageMetadata } from './seo';

export function updatePageMetadata(pathname) {
  const indexable =
    import.meta.env.PROD &&
    import.meta.env.VITE_SITE_INDEXABLE !== 'false' &&
    ['stopbars.com', 'www.stopbars.com'].includes(window.location.hostname);
  const metadata = getPageMetadata(pathname, indexable);
  document.title = metadata.title;

  const setMeta = (attribute, key, content) => {
    let element = document.head.querySelector(`meta[${attribute}="${key}"]`);
    if (!element) {
      element = document.createElement('meta');
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = content;
  };

  setMeta('name', 'description', metadata.description);
  setMeta('name', 'robots', metadata.robots);
  setMeta('property', 'og:title', metadata.title);
  setMeta('property', 'og:description', metadata.description);
  setMeta('name', 'twitter:title', metadata.title);
  setMeta('name', 'twitter:description', metadata.description);

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (metadata.canonical) {
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.append(canonical);
    }
    canonical.href = metadata.canonical;
    setMeta('property', 'og:url', metadata.canonical);
    setMeta('name', 'twitter:url', metadata.canonical);
  } else {
    canonical?.remove();
    document.head.querySelector('meta[property="og:url"]')?.remove();
    document.head.querySelector('meta[name="twitter:url"]')?.remove();
  }
}
