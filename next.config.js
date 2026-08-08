/** @type {import('next').NextConfig} */

// ─── Import Sentry config wrapper ──────────────────────────────────
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // ─── Static export (required for Capacitor) ──────────────────────
  output: 'export',
  trailingSlash: true,

  images: {
    unoptimized: true, // Required for static export (image optimization needs a server)
    remotePatterns: [
      {
        protocol: "https",
        hostname: "uploadthing.com",
      },
    ],
  },

  experimental: {
    optimizeCss: true,
  },

  // ─── Headers are only used in server mode – they are ignored in static export ───
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

// ─── Wrap with Sentry configuration ──────────────────────────────
module.exports = withSentryConfig(nextConfig, {
  silent: true,
  hideSourceMaps: false,
  widenClientFileUpload: true,
  transpileClientSDK: true,
  // If you want to upload source maps, set these environment variables:
  // org: process.env.SENTRY_ORG,
  // project: process.env.SENTRY_PROJECT,
  // authToken: process.env.SENTRY_AUTH_TOKEN,
});
