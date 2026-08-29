import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/settings/",
        "/messages/",
        "/notifications/",
        "/bookmarks/",
        "/support/",
        "/ads/",
        "/explore/",
        "/shorts/",
        "/onboarding/",
        "/creator/",
        "/journalist/",
        "/search/",
        "/test/",
        "/forgot-password/",
        "/reset-password/",
        "/verify-email/",
      ],
    },
    sitemap: "https://zrp.one/sitemap.xml",
  };
}
