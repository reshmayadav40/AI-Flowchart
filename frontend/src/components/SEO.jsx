import { useEffect } from 'react';

const SITE_URL = 'https://frontend-mocha-nine-84mvyfs6df.vercel.app';
const DEFAULT_TITLE = 'Antigravity AI Flowchart | Visual Algorithm Simulator';
const DEFAULT_DESCRIPTION = 'Generate, visualize, and dry-run algorithms and flowcharts interactively with Antigravity AI Flowchart. An active cloud studio for students and developers.';
const DEFAULT_IMAGE = `${SITE_URL}/vite.svg`;

function updateMetaTag(attrName, attrValue, content) {
  if (!content) return;
  let element = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(attrName, attrValue);
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
}

function updateLinkTag(rel, href) {
  if (!href) return;
  let element = document.querySelector(`link[rel="${rel}"]`);
  if (!element) {
    element = document.createElement('link');
    element.setAttribute(rel, rel);
    document.head.appendChild(element);
  }
  element.setAttribute('href', href);
}

export default function SEO({
  title = DEFAULT_TITLE,
  description = DEFAULT_DESCRIPTION,
  path = '',
  image = DEFAULT_IMAGE,
  type = 'website',
  schema = null,
}) {
  const canonicalUrl = `${SITE_URL}${path}`;
  const fullImageUrl = image.startsWith('http') ? image : `${SITE_URL}${image}`;

  useEffect(() => {
    // Dynamically update document title
    if (title) {
      document.title = title;
    }

    // Update primary SEO meta tags
    updateMetaTag('name', 'description', description);
    updateLinkTag('canonical', canonicalUrl);

    // Update Open Graph tags
    updateMetaTag('property', 'og:title', title);
    updateMetaTag('property', 'og:description', description);
    updateMetaTag('property', 'og:url', canonicalUrl);
    updateMetaTag('property', 'og:image', fullImageUrl);
    updateMetaTag('property', 'og:type', type);

    // Update Twitter Card tags
    updateMetaTag('name', 'twitter:title', title);
    updateMetaTag('name', 'twitter:description', description);
    updateMetaTag('name', 'twitter:image', fullImageUrl);

    // Update JSON-LD structured data dynamically if provided
    if (schema) {
      let script = document.getElementById('dynamic-jsonld');
      if (!script) {
        script = document.createElement('script');
        script.id = 'dynamic-jsonld';
        script.type = 'application/ld+json';
        document.head.appendChild(script);
      }
      script.textContent = JSON.stringify(schema);
    }
  }, [title, description, canonicalUrl, fullImageUrl, type, schema]);

  return null;
}
