import { generateReactHelpers } from "@uploadthing/react";
import { OurFileRouter } from "@/lib/uploadthing";

export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>({
  url: "/api/uploadthing",
  // ✅ Add this to ensure callbacks work
  headers: {
    "Content-Type": "application/json",
  },
});
