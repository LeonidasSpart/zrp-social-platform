import { cn } from "@/lib/utils"; // if you have a utils file, otherwise use class-variance-authority or just simple className

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle" | "text" | "avatar";
  shimmer?: boolean;
}

export function Skeleton({ className, variant = "rect", shimmer = true, ...props }: SkeletonProps) {
  const base = "relative overflow-hidden bg-zinc-200 dark:bg-zinc-800";
  const shimmerClass = shimmer
    ? "before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent dark:before:via-white/10"
    : "";

  const variantClasses = {
    rect: "rounded-md",
    circle: "rounded-full",
    text: "rounded h-4",
    avatar: "rounded-full aspect-square",
  };

  return (
    <div
      className={cn(base, shimmerClass, variantClasses[variant], className)}
      {...props}
    />
  );
}
