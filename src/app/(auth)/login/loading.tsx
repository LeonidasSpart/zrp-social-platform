// src/app/(auth)/login/loading.tsx
import { Skeleton } from "@/components/ui/Skeleton";

export default function LoginLoading() {
  return (
    <div className="max-w-md mx-auto p-6 space-y-6">
      <Skeleton variant="text" className="h-8 w-32" />
      <Skeleton variant="rect" className="h-10 w-full" />
      <Skeleton variant="rect" className="h-10 w-full" />
      <Skeleton variant="rect" className="h-10 w-full rounded-full" />
    </div>
  );
}
