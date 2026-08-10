import { generateReactHelpers } from "@uploadthing/react";
import { OurFileRouter } from "@/lib/uploadthing"; // ✅ fixed import path

export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>({
  url: "/api/uploadthing",
});
