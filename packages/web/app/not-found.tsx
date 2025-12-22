'use client';

import Error from 'next/error';

/**
 * Root not-found page for requests that bypass middleware
 * (e.g., direct file access, malformed URLs)
 */
export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <Error statusCode={404} />
      </body>
    </html>
  );
}
