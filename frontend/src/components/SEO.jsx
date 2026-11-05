import React, { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

const SITE_URL = 'https://frontend-mocha-nine-84mvyfs6df.vercel.app';
const DEFAULT_TITLE = 'Antigravity AI Flowchart | Visual Algorithm Simulator';
const DEFAULT_DESCRIPTION = 'Generate, visualize, and dry-run algorithms and flowcharts interactively with Antigravity AI Flowchart. An active cloud studio for students and developers.';
const DEFAULT_IMAGE = `${SITE_URL}/vite.svg`;

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

  // DOM fallback ensures immediate update even before full hydration
  useEffect(() => {
    if (title) document.title = title;
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc && description) {
      metaDesc.setAttribute('content', description);
    }
  }, [title, description]);

  return (
    <Helmet>
      {/* Primary Titles & Descriptions */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      {/* Open Graph */}
      <meta property="og:site_name" content="Antigravity AI Flowchart" />
      <meta property="og:type" content={type} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:locale" content="en_US" />

      {/* Twitter Cards */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />

      {/* Dynamic JSON-LD Structured Data */}
      {schema && (
        <script type="application/ld+json">
          {JSON.stringify(schema)}
        </script>
      )}
    </Helmet>
  );
}

