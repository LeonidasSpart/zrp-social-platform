"use client";
import { useUploadThing } from "@/lib/uploadthing-client";
export function useMusicUpload() {
  return useUploadThing("musicTrack");
}
