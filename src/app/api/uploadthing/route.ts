import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/uploadthing";

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  config: {
    isDev: process.env.NODE_ENV === 'development',
    // ✅ Add callback URL explicitly
    callbackUrl: process.env.NEXTAUTH_URL || "https://zrp.one",
  },
});
