import Link from "next/link";

interface LogoProps {
  variant?: "full" | "horizontal" | "symbol" | "wordmark";
  className?: string;
}

export default function Logo({ variant = "full", className = "" }: LogoProps) {
  if (variant === "symbol") {
    return (
      <div className={`flex items-center justify-center ${className}`}>
        <div className="w-10 h-10 bg-zrp-red rounded-full flex items-center justify-center">
          <span className="text-white font-orbitron font-bold text-lg">Z</span>
        </div>
      </div>
    );
  }

  if (variant === "wordmark") {
    return (
      <div className={`${className}`}>
        <span className="font-orbitron font-bold text-2xl text-zrp-red">ZRP</span>
      </div>
    );
  }

  if (variant === "horizontal") {
    return (
      <Link href="/" className={`flex items-center gap-2 ${className}`}>
        <div className="w-8 h-8 bg-zrp-red rounded-full flex items-center justify-center">
          <span className="text-white font-orbitron font-bold text-sm">Z</span>
        </div>
        <span className="font-orbitron font-bold text-xl text-zrp-red">ZRP</span>
        <span className="text-xs text-zrp-charcoal dark:text-zrp-silver font-inter">
          LAUNCH · BUILD · CONNECT
        </span>
      </Link>
    );
  }

  // Full logo
  return (
    <Link href="/" className={`flex flex-col items-center ${className}`}>
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 bg-zrp-red rounded-full flex items-center justify-center">
          <span className="text-white font-orbitron font-bold text-lg">Z</span>
        </div>
        <span className="font-orbitron font-bold text-2xl text-zrp-red">ZRP</span>
      </div>
      <span className="text-[10px] text-zrp-charcoal dark:text-zrp-silver font-inter tracking-wider">
        LAUNCH · BUILD · CONNECT
      </span>
    </Link>
  );
}
