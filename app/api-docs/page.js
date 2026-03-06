'use client';

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';

export default function ApiDocsPage() {
  const [loaded, setLoaded] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    if (!loaded || initialized.current) return;
    initialized.current = true;

    const specUrl = `${window.location.origin}/api/v1/openapi.json`;

    if (window.SwaggerUIBundle) {
      window.SwaggerUIBundle({
        url: specUrl,
        dom_id: '#swagger-ui-container',
        presets: [window.SwaggerUIBundle.presets.apis],
        layout: 'BaseLayout',
        docExpansion: 'list',
        defaultModelsExpandDepth: -1,
      });
    }
  }, [loaded]);

  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui.css" />
      <Script
        src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"
        strategy="afterInteractive"
        onLoad={() => setLoaded(true)}
      />
      <div style={{ minHeight: '100vh', background: 'white', padding: '0' }}>
        {!loaded && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontFamily: 'system-ui' }}>
            <p style={{ color: '#666' }}>Loading API documentation...</p>
          </div>
        )}
        <div id="swagger-ui-container" />
      </div>
    </>
  );
}
