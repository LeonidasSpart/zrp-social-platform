import { generateReactHelpers } from "@uploadthing/react";
import { OurFileRouter } from "@/lib/uploadthing";

export const { useUploadThing, uploadFiles } = generateReactHelpers<OurFileRouter>({
  url: "/api/uploadthing",
});
