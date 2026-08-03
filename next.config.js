/** @type {import('next').NextConfig} */

const withPWA = require('next-pwa')({
  dest: 'public', // where the generated service worker and workbox files will go
  register: true, // auto‑register the service worker
  skipWaiting: true, // force update on new version
  disable: process.env.NODE_ENV === 'development', // disable in dev
  sw: 'sw.js', // use your custom sw.js (we keep your existing one)
  custom: true, // tells next-pwa not to overwrite your custom sw.js
  // If you want workbox to handle caching automatically, you can remove `custom: true`
  // and it will generate a default sw.js with workbox. But you'll lose your custom
  // push notification logic. Since you already have a solid sw.js, keep `custom: true`.
  // Additional options:
  // scope: '/',
  // runtimeCaching: [ ... ], // define custom caching strategies
});

const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
      // Add more domains as needed, e.g.:
      // {
      //   protocol: "https",
      //   hostname: "*.cloudinary.com",
      // },
    ],
  },

  experimental: {
    optimizeCss: true,
  },

  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/:path*.{jpg,jpeg,png,gif,webp,svg,ico}",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        source: "/:path*.{woff,woff2,ttf,otf}",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  compress: true,
  poweredByHeader: false,
};

module.exports = withPWA(nextConfig);
