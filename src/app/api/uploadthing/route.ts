import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/uploadthing";

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  config: {
    isDev: process.env.NODE_ENV === 'development',
    // ✅ Important: Set the full callback URL
    callbackUrl: process.env.NEXTAUTH_URL 
      ? `${process.env.NEXTAUTH_URL}/api/uploadthing`
      : "https://zrp.one/api/uploadthing",
  },
});
