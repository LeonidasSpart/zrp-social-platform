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
        // - Permissions-Policy: browser features this origin may use.
        //   camera/microphone stay allowed for this origin only (WebRTC
        //   calling in /messages needs both); everything listed as ()
        //   is denied to this page AND any embedded frame.
        // - Content-Security-Policy: ENFORCED only for frame-ancestors
        //   (the CSP equivalent of X-Frame-Options: DENY, which modern
        //   browsers prefer). Every other directive is delivered as
        //   Report-Only below, so it observes and logs violations in
        //   the browser console without ever blocking anything - the
        //   origin inventory it encodes (UploadThing, GIPHY, YouTube
        //   embeds, Google Analytics, Sentry, Solana RPC, Socket.IO)
        //   was assembled from the code, not exercised against every
        //   flow, and an enforced policy that misses one host would
        //   silently break uploads, calls or embeds. Promote it to
        //   enforcing only after a period with no genuine reports.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()",
          },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          {
            key: "Content-Security-Policy-Report-Only",
            value: [
              "default-src 'self'",
              // Next.js injects inline bootstrapping scripts and GA is
              // loaded from googletagmanager.com; nonces would need a
              // middleware rewrite of every response, which is exactly
              // the kind of invasive change this policy avoids while
              // it is report-only.
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "media-src 'self' blob: https://utfs.io https://*.utfs.io https://*.ufs.sh https://*.giphy.com",
              "font-src 'self' data:",
              "connect-src 'self' https: wss:",
              "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://accounts.google.com https://appleid.apple.com",
              "worker-src 'self' blob:",
              "form-action 'self' https://accounts.google.com https://appleid.apple.com",
              "base-uri 'self'",
              "object-src 'none'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
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
// Source maps: only ever generated/uploaded when a real auth token is
// present (CI release builds), and always deleted from the build output
// after upload so a readable stack trace is never served publicly from
// /_next/static - `sourcemaps.disable` skips map generation entirely for
// any build (e.g. local `next build`) that doesn't set SENTRY_AUTH_TOKEN.
module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true, // Suppress logs
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
});
