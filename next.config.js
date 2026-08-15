/** @type {import('next').NextConfig} */

// ─── Import Sentry config wrapper ──────────────────────────────────
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  images: {
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

  async headers() {
    return [
      {
        // Applies to every route. These are widely-recommended baseline
        // security headers that were previously entirely absent:
        // - X-Frame-Options: prevents the site being embedded in an
        //   iframe elsewhere (clickjacking protection)
        // - X-Content-Type-Options: stops the browser from guessing a
        //   different MIME type than what's declared (helps prevent
        //   some XSS vectors via disguised file uploads)
        // - Referrer-Policy: avoids leaking full URLs (which can
        //   contain sensitive path info) to third-party sites when
        //   users click outbound links
        // - Strict-Transport-Security: forces HTTPS for future visits
        // Deliberately NOT adding Content-Security-Policy or
        // Permissions-Policy here - getting either wrong could silently
        // break WebRTC calling, UploadThing, or Socket.io, and that
        // needs a careful domain-by-domain audit rather than a blind
        // addition.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
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
  // Additional Sentry options (optional – these are defaults)
  silent: true, // Suppress logs
  hideSourceMaps: false,
  widenClientFileUpload: true,
  transpileClientSDK: true,
  // If you want to upload source maps, set these environment variables:
  // org: process.env.SENTRY_ORG,
  // project: process.env.SENTRY_PROJECT,
  // authToken: process.env.SENTRY_AUTH_TOKEN,
});
