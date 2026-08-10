import { createRouteHandler } from "uploadthing/next";
import { ourFileRouter } from "@/lib/uploadthing";

export const { GET, POST } = createRouteHandler({
  router: ourFileRouter,
  config: {
    isDev: process.env.NODE_ENV === 'development',
  },
});

// ✅ Critical: Disable Next.js body parser so UploadThing can parse raw files
export const config = {
  api: {
    bodyParser: false,
  },
};
