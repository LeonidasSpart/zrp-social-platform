/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['uploadthing.com'],
    // Add any other domains you use for images
    // e.g., 'res.cloudinary.com', 'your-s3-bucket.s3.amazonaws.com'
  },
  
  // ─── EXPERIMENTAL: React Compiler for faster renders ───
  experimental: {
    optimizeCss: true,
    reactCompiler: true,
  },
  
  // ─── CACHE HEADERS FOR STATIC ASSETS ───
  async headers() {
    return [
      {
        // Cache Next.js static assets for 1 year (immutable)
        source: "/_next/static/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // Cache images for 1 day, with stale-while-revalidate
        source: "/:path*.{jpg,jpeg,png,gif,webp,svg,ico}",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, stale-while-revalidate=604800",
          },
        ],
      },
      {
        // Cache fonts for 1 year
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
  
  // ─── COMPRESSION ───
  compress: true,
  
  // ─── POWERED BY HEADER (optional, for security) ───
  poweredByHeader: false,
};

module.exports = nextConfig;
