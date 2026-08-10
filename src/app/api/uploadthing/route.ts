import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/uploadthing";

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  config: {
    isDev: process.env.NODE_ENV === 'development',
  },
});

// ✅ Optional: force dynamic if needed (not required for uploads, but safe)
export const dynamic = 'force-dynamic';
